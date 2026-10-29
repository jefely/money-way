/**
 * 同步弹窗（UI 层）
 *
 * 按「3 天一张」的窗口同步（用户 2026-10-29 定的设计）：
 *   默认窗口 = 今天往前倒推 3 天 → 今天（含两端）。
 *   日期可改：输入 6 = 本月 6 号结束，窗口 3 号 ~ 6 号。
 *   每改一次日期，二维码和下面的可复制同步码一起重算。
 *
 * 两条通道：
 *   ① 二维码：base + '#m=…'，另一台设备用系统相机扫 → 打开网页自动合并缺的流水。
 *   ② 同步码：同一窗口的 `LZ1:…` 文本，微信发过去、粘贴回来即可。
 *
 * 编解码全在 core/sync-code.js（有 16 条测试），本文件只管界面。
 */

import * as NtModal from './modal.js';
import { packForQr, decodeSyncCode, unpackFromHash, QR_PER_PART } from '../core/sync-code.js';
import { paintText } from './qr-canvas.js';
import { buildWheel } from './sync-wheel.js';

/** 往前倒推几天：3 表示窗口 [D-3, D]（4 个日历日，跨度 3 天） */
const SPAN_DAYS = 3;

/**
 * @param {{
 *   getState:Function, setState:Function, save?:Function, setFooter?:Function,
 *   mergeRows:(rows:Array)=>number,
 *   mergeText:(text:string)=>number,
 *   baseUrl?:string
 * }} ctx
 */
export function openSyncDialog(ctx) {
  const base = ctx.baseUrl
    || (typeof location !== 'undefined' ? location.origin + location.pathname : '');

  NtModal.open({
    title: '同步账本',
    build: (body) => {
      body.appendChild(sectionWindow(ctx, base));
      body.appendChild(sectionReceive(ctx));
    },
    actions: [{ label: '关闭', kind: 'ghost', close: true }],
  });
}

/* ---------- ① 窗口二维码 + ② 同步码 ---------- */

function sectionWindow(ctx, base) {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();          // 0-based
  let day = now.getDate();

  const box = document.createElement('section');
  box.className = 'nt-sync-block';

  const h = document.createElement('div');
  h.className = 'nt-sync-title';
  h.textContent = '① 扫码同步（' + SPAN_DAYS + ' 天一张）';
  box.appendChild(h);

  const tip = document.createElement('p');
  tip.className = 'nt-sync-hint';
  tip.textContent = '以 ' + SPAN_DAYS + ' 天为单位生成一张码。改日期会重新生成二维码和下面的同步码。';
  box.appendChild(tip);

  /* 月份切换：竖轮只列当月天数，没本月数据时切到上个月 */
  const monRow = document.createElement('div');
  monRow.className = 'nt-sync-monrow';
  const prevMon = btn('‹', () => shiftMonth(-1));
  const monLabel = document.createElement('span');
  monLabel.className = 'nt-sync-mon';
  const nextMon = btn('›', () => shiftMonth(1));
  monRow.appendChild(prevMon);
  monRow.appendChild(monLabel);
  monRow.appendChild(nextMon);
  box.appendChild(monRow);

  const range = document.createElement('div');
  range.className = 'nt-sync-range';
  box.appendChild(range);

  /* 二维码 + 右侧的日期竖轮（手指上下拖动，中间那格是生效的日期） */
  const qrRow = document.createElement('div');
  qrRow.className = 'nt-sync-qrrow';

  const canvas = document.createElement('canvas');
  canvas.className = 'nt-sync-qr';
  qrRow.appendChild(canvas);

  // 窗口内没有流水时，用同样大小的占位块说明原因（不要留一块空白让人以为坏了）
  const empty = document.createElement('div');
  empty.className = 'nt-sync-qr-empty';
  empty.textContent = '这 3 天没有流水';
  empty.hidden = true;
  qrRow.appendChild(empty);

  const wheel = buildWheel({
    maxDay: monthDays(),
    value: day,
    onChange: (d) => { day = d; rebuild(); },
  });
  qrRow.appendChild(wheel.el);
  box.appendChild(qrRow);

  const pager = document.createElement('div');
  pager.className = 'nt-sync-nav';
  const prevPart = btn('‹', () => stepPart(-1));
  const partLabel = document.createElement('span');
  partLabel.className = 'nt-sync-part';
  const nextPart = btn('›', () => stepPart(1));
  pager.appendChild(prevPart);
  pager.appendChild(partLabel);
  pager.appendChild(nextPart);
  box.appendChild(pager);

  /* 同步码（同一窗口） */
  const codeTitle = document.createElement('div');
  codeTitle.className = 'nt-sync-sec';
  codeTitle.textContent = '② 同步码（同一窗口，可复制）';
  box.appendChild(codeTitle);

  const codeOut = document.createElement('textarea');
  codeOut.className = 'nt-sync-code';
  codeOut.readOnly = true;
  codeOut.placeholder = '生成中…';
  box.appendChild(codeOut);

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'nt-btn nt-btn-sm';
  copy.textContent = '复制同步码';
  copy.addEventListener('click', async () => {
    if (!codeOut.value) return;
    const ok = await copyText(codeOut.value);
    copy.textContent = ok ? '已复制' : '选中后手动复制';
    if (!ok) codeOut.select();
  });
  box.appendChild(copy);

  let parts = [];
  let idx = 0;
  let seq = 0;

  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
  function monthDays() { return new Date(year, month + 1, 0).getDate(); }
  function untilText() { return ymd(year, month, Math.min(day, monthDays())); }
  function shortDate(s) { return s.slice(5).replace('-', ' / '); }

  function paintMon() {
    monLabel.textContent = year + ' / ' + pad(month + 1);
  }

  /** 切月份：竖轮只列当月天数，没本月数据时切到上个月 */
  function shiftMonth(d) {
    month += d;
    if (month < 0) { month = 11; year -= 1; }
    if (month > 11) { month = 0; year += 1; }
    day = Math.min(day, monthDays());
    wheel.setMaxDay(monthDays());
    paintMon();
    rebuild();
  }

  function stepPart(d) {
    if (parts.length < 2) return;
    idx = (idx + d + parts.length) % parts.length;
    paintPart();
  }

  function paintPart() {
    const p = parts[idx];
    if (!p) return;
    canvas.dataset.url = p.url;
    const r = paintText(canvas, p.url, 5);
    canvas.style.display = r.ok ? '' : 'none';
    empty.hidden = r.ok;
    if (!r.ok) empty.textContent = r.error || '这张码装不下';
    partLabel.textContent = r.ok
      ? `第 ${p.part[0]} / ${p.part[1]} 张 · ${p.count} 笔 · 截止 ${p.until || '—'}`
      : (r.error || '装不下');
    codeOut.value = 'LZ1:' + String(p.url).split('#m=')[1];
    pager.style.display = parts.length > 1 ? '' : 'none';
  }

  async function rebuild() {
    const my = ++seq;
    const until = untilText();
    const fromD = new Date(until + 'T00:00:00');
    fromD.setDate(fromD.getDate() - SPAN_DAYS);
    const from = ymd(fromD.getFullYear(), fromD.getMonth(), fromD.getDate());

    range.textContent = shortDate(from) + ' — ' + shortDate(until) + ' · 跨度 ' + SPAN_DAYS + ' 天';
    partLabel.textContent = '生成中…';
    canvas.style.display = 'none'; empty.hidden = true;
    codeOut.value = ''; codeOut.placeholder = '生成中…';
    try {
      const r = await packForQr(ctx.getState(), { base, until, days: SPAN_DAYS + 1, per: QR_PER_PART });
      if (my !== seq) return;          // 日期又变了，这次结果作废

      parts = r.parts || [];
      idx = 0;

      if (r.tooDense) {
        partLabel.textContent = '这几天流水太多，一张装不下；请直接把同步码发给对方';
        codeOut.placeholder = '流水太多，装不进二维码；可以逐张改日期分段同步';
        return;
      }
      if (!parts.length) {
        partLabel.textContent = shortDate(from) + ' — ' + shortDate(until) + ' 没有流水';
        empty.hidden = false;          // 用占位块说明原因，别留空白
        codeOut.placeholder = '这 3 天没有流水，没有可同步的内容';
        pager.style.display = 'none';
        return;
      }
      paintPart();
    } catch (e) {
      if (my !== seq) return;
      partLabel.textContent = '生成失败：' + e.message;
      codeOut.placeholder = '生成失败：' + e.message;
    }
  }

  paintMon();
  rebuild();
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
 * 接收一段东西：窗口同步码（JSON payload）或 带 #m= 的链接。
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
    // 窗口同步码的明文是 JSON（{ rows, codes, u }）；整本账的同步码是账本文本
    if (text.trim().startsWith('{')) {
      try {
        const payload = JSON.parse(text);
        if (payload && Array.isArray(payload.rows)) {
          const n = ctx.mergeRows(payload.rows);
          if (ctx.save) await ctx.save();
          return n;
        }
      } catch (e) { /* 不是 JSON，按账本文本走 */ }
    }
    const r = ctx.mergeText(text);
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
