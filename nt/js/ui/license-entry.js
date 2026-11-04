// 界面：设置 → 会员 / 激活
/**
 * 粘贴激活码、验签、展示档位。停用只清本机记录。
 * 高级报表和环图导出是占位，用来演示门闩；核心记账不走这里。
 */

import { assess } from '../core/entitlements.js';
import { openPremium, renderPremium } from '../core/premium-open.js';
import { describePayload, premiumBlocked, reasonText } from '../core/license-policy.js';
import { APP_URL, originWarning } from '../core/official-origin.js';
import { getInstallId, readLocalMaxSeen, writeLocalMaxSeen } from '../browser/install-id.js';
import { checkIntegrityOnce, lastIntegrity } from './integrity-runtime.js';
import * as NtModal from './modal.js';

const DEMOS = [
  ['report.advanced', '高级报表'],
  ['chart.ringExport', '环图导出'],
];

export function mountLicenseEntry(section, ctx) {
  const bar = section.querySelector('.nt-vbar');
  if (!bar || bar.querySelector('[data-act="license"]')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'nt-btn nt-btn-sm';
  btn.setAttribute('data-act', 'license');
  btn.textContent = '会员';
  const spacer = bar.querySelector('.nt-vbar-spacer');
  if (spacer) bar.insertBefore(btn, spacer);
  else bar.appendChild(btn);
  btn.addEventListener('click', () => openPanel(ctx));
}

function openPanel(ctx) {
  const record = licenseOf(ctx);
  let ta = null;
  let status = null;
  let err = null;

  NtModal.open({
    title: '会员激活',
    build: (body) => {
      hint(body, '核心记账免费。激活码只打开占位的高级报表和环图导出，离线验签，不上传。');
      hint(body, '官方地址：' + APP_URL);
      const origin = originWarning(location.origin);
      if (!origin.ok) warn(body, origin.text);
      status = document.createElement('dl');
      status.className = 'nt-kv';
      body.appendChild(status);
      ta = document.createElement('textarea');
      ta.className = 'nt-sync-code';
      ta.placeholder = '把激活码粘贴到这里';
      ta.value = record && record.code ? record.code : '';
      body.appendChild(ta);
      err = document.createElement('p');
      err.className = 'nt-sync-hint nt-share-hint bad';
      err.hidden = true;
      body.appendChild(err);
      const row = document.createElement('div');
      row.className = 'nt-ver-btns';
      for (let i = 0; i < DEMOS.length; i++) {
        const feature = DEMOS[i][0];
        const label = DEMOS[i][1];
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'nt-btn';
        b.textContent = label;
        b.addEventListener('click', () => runDemo(ctx, feature, err));
        row.appendChild(b);
      }
      body.appendChild(row);
    },
    actions: [
      { label: '关闭', kind: 'ghost', close: true },
      {
        label: '停用',
        kind: 'danger',
        close: false,
        onClick: () => {
          saveLicense(ctx, null);
          paint(status, null, '已停用。账本数据还在。');
          if (ta) ta.value = '';
        },
      },
      {
        label: '激活',
        kind: 'primary',
        close: false,
        onClick: () => { activate(ctx, ta, status, err); },
      },
    ],
  });

  checkIntegrityOnce().then(() => {
    bumpSeen(ctx);
    paint(status, licenseOf(ctx), '');
  });
}

async function activate(ctx, ta, status, err) {
  await checkIntegrityOnce();
  bumpSeen(ctx);
  const pasted = String(ta && ta.value || '').trim();
  const prev = licenseOf(ctx) || {};
  const draft = await assess(envFrom(ctx, pasted, []));
  if (!draft.ok) {
    showErr(err, reasonText(draft.reason));
    return;
  }
  const same = prev.code && prev.code === draft.code;
  const judged = same ? await assess(envFrom(ctx, pasted, prev.activations || [])) : draft;
  if (!judged.ok) {
    showErr(err, reasonText(judged.reason));
    return;
  }
  showErr(err, '');
  saveLicense(ctx, judged.record);
  paint(status, judged.record, '');
  if (ctx.setFooter) ctx.setFooter('会员已激活：' + describePayload(judged.proof.payload)[0][1]);
}

async function runDemo(ctx, feature, err) {
  await checkIntegrityOnce();
  bumpSeen(ctx);
  const record = licenseOf(ctx) || {};
  const env = envFrom(ctx, record.code, record.activations || []);
  const judged = await assess(env);
  if (!judged.ok) {
    showErr(err, reasonText(judged.reason) + '。核心记账不受影响。');
    return;
  }
  if (judged.changed) saveLicense(ctx, judged.record);
  const spec = await openPremium(feature, envFrom(ctx, judged.record.code, judged.record.activations));
  const text = renderPremium(spec);
  if (!text) {
    showErr(err, '签名通过，但会员模块没有解开。只改开关不够，还要对得上密封钥。');
    return;
  }
  showErr(err, '');
  if (ctx.setFooter) ctx.setFooter(spec.title + ' · 绑定 ' + spec.token);
  NtModal.info(spec.title, (b) => {
    const p = document.createElement('p');
    p.className = 'nt-sync-hint';
    p.textContent = text;
    b.appendChild(p);
  });
}

function paint(status, record, extra) {
  if (!status) return;
  status.textContent = '';
  const blocked = currentBlocked();
  if (blocked) {
    addKV(status, '完整性', '非官方或被篡改的版本');
  }
  if (!record || !record.code) {
    addKV(status, '状态', extra || '尚未激活');
    return;
  }
  assess(envFromLive(record)).then((judged) => {
    status.textContent = '';
    if (blocked) addKV(status, '完整性', '非官方或被篡改的版本');
    if (!judged.ok) {
      addKV(status, '状态', reasonText(judged.reason));
      return;
    }
    const rows = describePayload(judged.proof.payload);
    for (let i = 0; i < rows.length; i++) addKV(status, rows[i][0], rows[i][1]);
    if (extra) addKV(status, '状态', extra);
  }).catch(() => {
    addKV(status, '状态', '暂时无法核验');
  });
}

function envFrom(ctx, code, activations) {
  return {
    code: String(code || '').trim(),
    nowMs: Date.now(),
    maxSeen: seenOf(ctx),
    installId: getInstallId(),
    activations: activations || [],
    blocked: currentBlocked(),
  };
}

function bumpSeen(ctx) {
  const now = Date.now();
  const local = writeLocalMaxSeen(now);
  const record = licenseOf(ctx);
  if (!record) return;
  const next = Math.max(Number(record.maxSeen) || 0, local, now);
  if (next !== Number(record.maxSeen)) {
    saveLicense(ctx, Object.assign({}, record, { maxSeen: next }));
  }
}

function envFromLive(record) {
  return {
    code: record.code,
    nowMs: Date.now(),
    maxSeen: seenOf(null, record),
    installId: getInstallId(),
    activations: record.activations || [],
    blocked: currentBlocked(),
  };
}

function seenOf(ctx, record) {
  const rec = record || licenseOf(ctx) || {};
  return Math.max(Number(rec.maxSeen) || 0, readLocalMaxSeen());
}

function currentBlocked() {
  const integrity = lastIntegrity();
  if (!integrity) return false;
  return premiumBlocked({
    integrity,
    originStatus: originWarning(location.origin),
  });
}

function licenseOf(ctx) {
  const state = ctx.getState() || {};
  return state.license || null;
}

function saveLicense(ctx, license) {
  if (license && license.maxSeen) writeLocalMaxSeen(license.maxSeen);
  const prev = ctx.getState();
  ctx.setState(Object.assign({}, prev, { license: license }));
  if (ctx.saveNow) ctx.saveNow();
}

function hint(body, text) {
  const p = document.createElement('p');
  p.className = 'nt-sync-hint';
  p.textContent = text;
  body.appendChild(p);
}

function warn(body, text) {
  const p = document.createElement('p');
  p.className = 'nt-sync-hint nt-share-hint bad';
  p.textContent = text;
  body.appendChild(p);
}

function showErr(err, text) {
  if (!err) return;
  err.hidden = !text;
  err.textContent = text || '';
}

function addKV(dl, k, v) {
  const dt = document.createElement('dt');
  dt.textContent = k;
  const dd = document.createElement('dd');
  dd.textContent = v;
  dl.appendChild(dt);
  dl.appendChild(dd);
}
