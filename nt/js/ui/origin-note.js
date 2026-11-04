// 界面：账本说明 → 官方地址
/**
 * 说明页展示官方 URL。来源对不上就警告。
 * 完整性核对失败时写明「非官方或被篡改的版本」，不挡住账本。
 */

import { APP_URL, originWarning } from '../core/official-origin.js';
import { checkIntegrityOnce } from './integrity-runtime.js';

export function officialOriginNote() {
  const el = document.createElement('section');
  el.className = 'nt-text-block';

  const h = document.createElement('h3');
  h.className = 'nt-block-title';
  h.textContent = '官方地址';
  el.appendChild(h);

  const url = document.createElement('p');
  url.className = 'nt-block-line';
  url.textContent = APP_URL;
  el.appendChild(url);

  const origin = typeof location === 'undefined' ? '' : location.origin;
  const st = originWarning(origin);
  if (!st.ok) {
    const warn = document.createElement('p');
    warn.className = 'nt-block-line nt-share-hint bad';
    warn.textContent = st.text;
    el.appendChild(warn);
  }

  const integ = document.createElement('p');
  integ.className = 'nt-block-line';
  integ.textContent = '正在核对文件完整性…';
  el.appendChild(integ);
  checkIntegrityOnce().then((r) => {
    if (r && r.tampered) {
      integ.className = 'nt-block-line nt-share-hint bad';
      integ.textContent = r.message || '非官方或被篡改的版本';
      return;
    }
    if (r && r.dev) {
      integ.textContent = '完整性清单尚未签名（开发构建）。会员功能仍可在本机试用。';
      return;
    }
    integ.textContent = '文件完整性核对通过。';
  }).catch(() => {
    integ.textContent = '完整性核对没有完成。记账不受影响。';
  });
  return el;
}
