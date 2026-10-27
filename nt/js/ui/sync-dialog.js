/**
 * 同步弹窗（UI 层）
 *
 * 两条通道都放在一个弹窗里：
 *   ① 二维码：把最近 N 天的流水切成几张码，另一台设备**用系统相机扫** →
 *      打开的网页带 #m=… → 自动合并。不需要任何服务器。
 *   ② 同步码：整本账压成一段文本，微信发过去、粘贴回来即可。
 *
 * 本文件只管界面与调用，编解码全在 core/sync-code.js（有 16 条测试）。
 */

import * as NtModal from './modal.js';
import { ledgerToText } from '../core/flow-text.js';
import {
  encodeSyncCode, decodeSyncCode, packForQr, unpackFromHash, QR_PER_PART,
} from '../core/sync-code.js';
import { paintText } from './qr-canvas.js';

/**
 * @param {{
 *   getState:Function, setState:Function, save?:Function, setFooter?:Function,
 *   mergeRows:(rows:Array)=>number,   // 把「解包出来的流水行」合并进账本，返回新增笔数
 *   mergeText:(text:string)=>number,  // 把「账本文本」追加进账本，返回新增笔数
 *   baseUrl?:string
 * }} ctx
 */
export function openSyncDialog(ctx) {
  const base = ctx.baseUrl
    || (typeof location !== 'undefined' ? location.origin + location.pathname : '');

  NtModal.open({
    title: '同步账本',
    build: (body) => {
      body.appendChild(sectionQr(ctx, base));
      body.appendChild(sectionCode(ctx));
      body.appendChild(sectionReceive(ctx));
    },
    actions: [{ label: '关闭', kind: 'ghost', close: true }],
  });
}

/* ---------- ① 二维码 ---------- */

function sectionQr(ctx, base) {
  const box = document.createElement('section');
  box.className = 'nt-sync-block';

  const h = document.createElement('div');
  h.className = 'nt-sync-title';
  h.textContent = '① 扫码同步（近 7 天）';
  box.appendChild(h);

  const tip = document.createElement('p');
  tip.className = 'nt-sync-hint';
  tip.textContent = '另一台设备用系统相机扫下面这张码，打开网页后会自动把缺的流水补进去。';
  box.appendChild(tip);

  const canvas = document.createElement('canvas');
  canvas.className = 'nt-sync-qr';
  box.appendChild(canvas);

  const nav = document.createElement('div');
  nav.className = 'nt-sync-nav';
  const prev = btn('‹', () => step(-1));
  const label = document.createElement('span');
  label.className = 'nt-sync-part';
  const next = btn('›', () => step(1));
  nav.appendChild(prev);
  nav.appendChild(label);
  nav.appendChild(next);
  box.appendChild(nav);

  let parts = [];
  let idx = 0;

  function step(d) {
    if (!parts.length) return;
    idx = (idx + d + parts.length) % parts.length;
    show();
  }

  function show() {
    if (!parts.length) return;
    const p = parts[idx];
    canvas.dataset.url = p.url;   // 长按/调试时能直接拿到链接
    const r = paintText(canvas, p.url, 5);
    if (!r.ok) {
      canvas.style.display = 'none';
      label.textContent = r.error || '装不下';
      return;
    }
    canvas.style.display = '';
    label.textContent = `第 ${p.part[0]} / ${p.part[1]} 张 · ${p.count} 笔 · 截止 ${p.until || '—'}`;
  }

  // 异步打包，不阻塞弹窗
  packForQr(ctx.getState(), { base, days: 7, per: QR_PER_PART })
    .then((r) => {
      if (r.tooDense) {
        label.textContent = '最近的流水太多，一张装不下；请改用下面的同步码';
        canvas.style.display = 'none';
        nav.style.display = 'none';
        return;
      }
      parts = r.parts;
      if (!parts.length) {
        label.textContent = '最近 7 天没有流水';
        canvas.style.display = 'none';
        nav.style.display = 'none';
        return;
      }
      show();
      const only = parts.length === 1;
      prev.style.display = only ? 'none' : '';
      next.style.display = only ? 'none' : '';
    })
    .catch((e) => {
      label.textContent = '生成失败：' + e.message;
    });

  return box;
}

/* ---------- ② 同步码 ---------- */

function sectionCode(ctx) {
  const box = document.createElement('section');
  box.className = 'nt-sync-block';

  const h = document.createElement('div');
  h.className = 'nt-sync-title';
  h.textContent = '② 同步码（整本账）';
  box.appendChild(h);

  const tip = document.createElement('p');
  tip.className = 'nt-sync-hint';
  tip.textContent = '整本账压成一段文本，可以发微信、发邮件。对方粘进「接收」框就能合并。';
  box.appendChild(tip);

  const out = document.createElement('textarea');
  out.className = 'nt-sync-code';
  out.readOnly = true;
  out.placeholder = '正在压缩…';
  box.appendChild(out);

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'nt-btn nt-btn-sm';
  copy.textContent = '复制同步码';
  copy.addEventListener('click', async () => {
    if (!out.value) return;
    const ok = await copyText(out.value);
    copy.textContent = ok ? '已复制' : '选中后手动复制';
    if (!ok) out.select();
  });
  box.appendChild(copy);

  encodeSyncCode(ledgerToText(ctx.getState()))
    .then((code) => { out.value = code; })
    .catch((e) => { out.value = ''; out.placeholder = '压缩失败：' + e.message; });

  return box;
}

/* ---------- ③ 接收 ---------- */

function sectionReceive(ctx) {
  const box = document.createElement('section');
  box.className = 'nt-sync-block';

  const h = document.createElement('div');
  h.className = 'nt-sync-title';
  h.textContent = '③ 接收（粘贴同步码，或粘二维码链接）';
  box.appendChild(h);

  const ta = document.createElement('textarea');
  ta.className = 'nt-sync-code';
  ta.placeholder = '粘贴同步码 LZ1:… ，或扫出来的链接（含 #m=…）';
  box.appendChild(ta);

  const merge = document.createElement('button');
  merge.type = 'button';
  merge.className = 'nt-btn nt-btn-primary nt-btn-sm';
  merge.textContent = '合并进来';
  merge.addEventListener('click', async () => {
    const raw = ta.value.trim();
    if (!raw) return;
    merge.disabled = true;
    const old = merge.textContent;
    merge.textContent = '合并中…';
    try {
      const n = await receive(ctx, raw);
      NtModal.closeAll();
      if (ctx.setFooter) ctx.setFooter(n ? `已合并 ${n} 笔` : '没有新记录（都已经有了）');
    } catch (e) {
      ta.value = '';
      ta.placeholder = '合并失败：' + e.message;
      merge.disabled = false;
      merge.textContent = old;
    }
  });
  box.appendChild(merge);

  return box;
}

/**
 * 接收一段东西：同步码 或 带 #m= 的链接。
 * @returns {Promise<number>} 新增笔数
 */
async function receive(ctx, raw) {
  if (/[#&]m=/.test(raw)) {
    const payload = await unpackFromHash(raw);
    if (!payload) throw new Error('链接里没有可合并的数据');
    const n = ctx.mergeRows(payload.rows);
    if (ctx.save) await ctx.save();
    return n;
  }
  if (/^LZ[01][:：]/i.test(raw)) {
    const text = await decodeSyncCode(raw);
    const r = ctx.mergeText(text);   // 由调用方用 appendLedgerFromText 落库
    if (ctx.save) await ctx.save();
    return r;
  }
  throw new Error('认不出这是什么。同步码应以 LZ1: 开头，链接里应有 #m=');
}

/* ---------- 小工具 ---------- */

function btn(text, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'nt-btn nt-btn-icon';
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) { /* 掉到下面 */ }
  return false;
}
