// 界面：设置 / 账本说明 → 文件完整性提示
/**
 * 拉取 integrity.json，再按清单核对 js 文件的 SHA-256。
 * 对不上只记「被篡改」，调用方据此关掉会员功能。不拦截账本数据。
 */

import { verifyIntegrityManifest } from '../core/integrity-manifest.js';
import { decodePublicKey } from '../core/license-pubkey.js';
import { devManifestOnOfficial } from '../core/official-origin.js';

const TAMPER_TEXT = '非官方或被篡改的版本';

let pending = null;
let result = null;

export function lastIntegrity() {
  return result;
}

export function checkIntegrityOnce() {
  if (result) return Promise.resolve(result);
  if (!pending) {
    pending = run().then((r) => {
      result = r;
      return r;
    }).catch(() => {
      result = finish({ ok: false, dev: true, tampered: false, reason: 'error' });
      return result;
    });
  }
  return pending;
}

async function run() {
  if (typeof fetch !== 'function') {
    return finish({ ok: true, dev: true, tampered: false, reason: 'no-fetch' });
  }
  let res;
  try {
    res = await fetch('./integrity.json', { cache: 'no-cache' });
  } catch (e) {
    return finish({ ok: true, dev: true, tampered: false, reason: 'missing' });
  }
  if (!res.ok) return finish({ ok: true, dev: true, tampered: false, reason: 'missing' });
  const manifest = await res.json();
  if (!manifest || manifest.dev || !manifest.sig) {
    return finish({ ok: true, dev: true, tampered: false, reason: 'unsigned' });
  }
  const files = manifest.files || {};
  const bytes = {};
  const names = Object.keys(files);
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const fr = await fetch('./' + name, { cache: 'no-cache' });
    if (!fr.ok) {
      return {
        ok: false,
        dev: false,
        tampered: true,
        reason: 'missing-file',
        file: name,
        message: TAMPER_TEXT,
      };
    }
    bytes[name] = new Uint8Array(await fr.arrayBuffer());
  }
  const verdict = await verifyIntegrityManifest(manifest, bytes, decodePublicKey());
  return finish(verdict);
}

function finish(verdict) {
  const origin = typeof location === 'undefined' ? '' : location.origin;
  if (verdict.tampered || devManifestOnOfficial(origin, verdict)) {
    return {
      ok: false,
      dev: false,
      tampered: true,
      reason: verdict.tampered ? verdict.reason : 'unsigned-official',
      message: TAMPER_TEXT,
    };
  }
  return verdict;
}
