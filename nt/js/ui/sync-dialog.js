/**
 * 同步弹窗（UI 层）
 *
 * 设计（用户 2026-10-29 重定）：
 *   ① 自适应窗口：选一个截止日，从这天往前按**天**装流水，装到一张码满为止
 *      （fitWindow 二分找最大的可行窗口；最后一天装不下就整天不要）。
 *      二维码固定 220×220 靠左；右侧竖轮选「日」，上面的年份右缘与竖轮右缘对齐；
 *      下方一行写明「包含 9/5 — 9/9 · N 笔」，再跟「保存二维码图片」。
 *   ② 一个文本框打通复制与接收：复制 / 清空 / 粘贴 / 同步 四个按钮。
 *
 * 编解码在 core/sync-code.js、窗口自适应在 core/sync-window.js，本文件只管界面。
 */

import * as NtModal from './modal.js';
import { decodeSyncCode, unpackFromHash } from '../core/sync-code.js';
import { fitWindow } from '../core/sync-window.js';
import { paintText } from './qr-canvas.js';
import { buildWheel } from './sync-wheel.js';

/**
 * @param {{
 *   getState:Function, setFooter?:Function, save?:Function,
 *   mergeRows:(rows:Array)=>number, mergeText:(text:string)=>number,
 *   baseUrl?:string
 * }} ctx
 */
export function openSyncDialog(ctx) {
  const base = ctx.baseUrl
    || (typeof location !== 'undefined' ? location.origin + location.pathname : '');

  NtModal.open({
    title: '同步账本',
    build: (body) => { body.appendChild(sectionWindow(ctx, base)); },
    actions: [{ label: '关闭', kind: 'ghost', close: true }],
  });
}

/* ---------- ① 二维码 + 日期竖轮 + ② 同步码 / 接收 ---------- */

function sectionWindow(ctx, base) {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();          // 0-based
  let day = now.getDate();
  let auto = true;                     // 文本框内容还是自动填的？
  let seq = 0;

  const box = document.createElement('section');
  box.className = 'nt-sync-block';

  const h = document.createElement('div');
  h.className = 'nt-sync-title';
  h.textContent = '① 扫码同步（自适应天数）';
  box.appendChild(h);

  const tip = document.createElement('p');
  tip.className = 'nt-sync-hint';
  tip.textContent = '选一个截止日：从这天往前按天装流水，一张码装满为止（装不下的那天整天不要）。';
  box.appendChild(tip);

  /* 二维码（固定 220，靠左）+ 日期竖轮（日）+ 年份（右缘对齐竖轮） */
  const main = document.createElement('div');
  main.className = 'nt-sync-main';

  const canvas = document.createElement('canvas');
  canvas.className = 'nt-sync-qr';
  main.appendChild(canvas);

  // 没有流水时的占位：同尺寸，保证「有码无码都不动」
  const empty = document.createElement('div');
  empty.className = 'nt-sync-qr-empty';
  empty.textContent = '还没有可同步的流水';
  empty.hidden = true;
  main.appendChild(empty);

  const picker = document.createElement('div');
  picker.className = 'nt-sync-picker';

  const yearRow = document.createElement('div');
  yearRow.className = 'nt-sync-year';
  const prevMon = iconBtn('‹', () => shiftMonth(-1));
  const yearLabel = document.createElement('span');
  yearLabel.className = 'nt-sync-year-label';
  const nextMon = iconBtn('›', () => shiftMonth(1));
  yearRow.appendChild(prevMon);
  yearRow.appendChild(yearLabel);
  yearRow.appendChild(nextMon);
  picker.appendChild(yearRow);

  const wheel = buildWheel({
    maxDay: monthDays(),
    value: day,
    onChange: (d) => { day = d; rebuild(); },
  });
  picker.appendChild(wheel.el);
  main.appendChild(picker);
  box.appendChild(main);

  const range = document.createElement('div');
  range.className = 'nt-sync-range';
  box.appendChild(range);

  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'nt-btn nt-btn-sm';
  save.textContent = '保存二维码图片';
  save.addEventListener('click', savePng);
  box.appendChild(save);

  /* ② 一个框：复制 / 清空 / 粘贴 / 同步 */
  const sec = document.createElement('div');
  sec.className = 'nt-sync-sec';
  sec.textContent = '② 同步码 / 接收';
  box.appendChild(sec);

  const bar = document.createElement('div');
  bar.className = 'nt-sync-bar';
  bar.appendChild(textBtn('复制', async () => {
    if (!ta.value) return flash('还没有内容');
    const ok = await copyText(ta.value);
    flash(ok ? '已复制' : '复制失败，请手动选中');
  }));
  bar.appendChild(textBtn('清空', () => { ta.value = ''; auto = false; flash('已清空'); }));
  bar.appendChild(textBtn('粘贴', async () => {
    try {
      ta.value = await navigator.clipboard.readText();
      auto = false;
      flash('已粘贴');
    } catch (e) {
      ta.focus();
      flash('读不到剪贴板，请手动粘贴');
    }
  }));
  bar.appendChild(textBtn('同步', async () => {
    const raw = ta.value.trim();
    if (!raw) return flash('先复制或粘贴一段同步码');
    try {
      const n = await receive(ctx, raw);
      NtModal.closeAll();
      if (ctx.setFooter) ctx.setFooter(n ? `已合并 ${n} 笔` : '没有新记录（都已经有了）');
    } catch (e) {
      flash('同步失败：' + e.message);
    }
  }));
  box.appendChild(bar);

  const ta = document.createElement('textarea');
  ta.className = 'nt-sync-code';
  ta.placeholder = '这里是本窗口的同步码；也可以粘贴对方发来的同步码，点「同步」合并';
  ta.addEventListener('input', () => { auto = false; });
  box.appendChild(ta);

  const msg = document.createElement('div');
  msg.className = 'nt-sync-msg';
  box.appendChild(msg);

  /* ---------- 工具 ---------- */

  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
  function monthDays() { return new Date(year, month + 1, 0).getDate(); }
  function untilText() { return ymd(year, month, Math.min(day, monthDays())); }
  function md(s) { return String(s).slice(5).replace('-', '/'); }
  function flash(t) { msg.textContent = t; }

  function paintMon() { yearLabel.textContent = year + '/' + pad(month + 1); }

  function shiftMonth(d) {
    month += d;
    if (month < 0) { month = 11; year -= 1; }
    if (month > 11) { month = 0; year += 1; }
    day = Math.min(day, monthDays());
    wheel.setMaxDay(monthDays());
    paintMon();
    rebuild();
  }

  function zoom() {
    if (!canvas.dataset.url) return;
    // 主弹窗是 showModal 的 top layer，普通遮罩盖不过，放大也用 dialog
    const dlg = document.createElement('dialog');
    dlg.className = 'nt-sync-zoom';
    const img = document.createElement('img');
    img.className = 'nt-sync-zoom-img';
    img.alt = '同步二维码（放大）';
    img.src = canvas.toDataURL('image/png');
    dlg.appendChild(img);
    dlg.addEventListener('click', () => { dlg.close(); dlg.remove(); });
    document.body.appendChild(dlg);
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  function savePng() {
    if (!canvas.dataset.url) return flash('还没有二维码可保存');
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = '同步码_' + (range.dataset.from || '') + '_' + (range.dataset.until || '') + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    flash('已保存图片');
  }

  async function rebuild() {
    const my = ++seq;
    const until = untilText();

    canvas.style.display = 'none';
    empty.hidden = true;
    empty.textContent = '还没有可同步的流水';
    canvas.dataset.url = '';
    range.textContent = '正在装码…';
    range.dataset.from = '';
    range.dataset.until = until;

    try {
      const r = await fitWindow(ctx.getState(), { base, until, per: 200 });
      if (my !== seq) return;

      if (r.empty) {
        empty.hidden = false;
        range.textContent = '这一段没有流水，换个日期试试';
        if (auto) ta.value = '';
        return;
      }
      if (r.tooDense) {
        empty.hidden = false;
        empty.textContent = '最近一天的流水一张码都装不下';
        range.textContent = '改用下面的同步码发送';
        return;
      }

      const p = r.parts[0];
      canvas.dataset.url = p.url;
      const painted = paintText(canvas, p.url, 5);
      canvas.style.display = painted.ok ? '' : 'none';
      empty.hidden = painted.ok;

      range.dataset.from = r.from;
      range.textContent = '包含 ' + md(r.from) + ' — ' + md(r.until)
        + ' · ' + r.count + ' 笔';
      if (auto) ta.value = 'LZ1:' + String(p.url).split('#m=')[1];
    } catch (e) {
      if (my !== seq) return;
      empty.hidden = false;
      range.textContent = '生成失败：' + e.message;
    }
  }

  canvas.addEventListener('click', zoom);
  paintMon();
  rebuild();
  return box;
}

/* ---------- ③ 接收：窗口同步码（JSON）或 #m= 链接 ---------- */

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

function iconBtn(text, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'nt-btn nt-btn-icon';
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

function textBtn(text, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'nt-btn nt-btn-sm';
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
