/**
 * 同步弹窗（UI 层）
 *
 * 设计（用户 2026-10-29 定稿）：
 *   ① 年月滚轮在二维码上方居中（水平拖），日竖轮在二维码右侧居中（垂直拖）；
 *      选截止日 → 从这天往前按天装流水，装满 70 笔为止（fitWindow 二分，整天截断）。
 *      二维码固定 240×240，布局不因有码无码移动。
 *   ② 一个文本框打通复制与接收：复制 / 清空 / 粘贴 / 同步。
 *
 * 编解码在 core/sync-code.js、窗口自适应在 core/sync-window.js。
 */

import * as NtModal from './modal.js';
import { decodeSyncCode, unpackFromHash } from '../core/sync-code.js';
import { paginate } from '../core/sync-window.js';
import { paintText } from './qr-canvas.js';
import { buildWheel } from './sync-wheel.js';

/** 一张码的软上限（用户指定 70 笔就够，别塞满） */
const MAX_COUNT = 70;

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

/* ---------- ① 二维码 + 年月/日滚轮 + ② 同步码 / 接收 ---------- */

function sectionWindow(ctx, base) {
  const now = new Date();
  const months = monthLabels(now);
  let year = now.getFullYear();
  let month = now.getMonth();          // 0-based
  let day = now.getDate();
  let auto = true;                     // 文本框还是自动填的？
  let seq = 0;

  const box = document.createElement('section');
  box.className = 'nt-sync-block';

  const h = document.createElement('div');
  h.className = 'nt-sync-title';
  h.textContent = '① 扫码同步';
  box.appendChild(h);

  const tip = document.createElement('p');
  tip.className = 'nt-sync-hint';
  tip.textContent = '一张码最多装 ' + MAX_COUNT + ' 笔；整段历史按页切开，右侧翻页。';
  box.appendChild(tip);

  /* 年月：水平滚轮，在二维码上方居中 */
  const monRow = document.createElement('div');
  monRow.className = 'nt-sync-monthrow';
  const monWheel = buildWheel({
    axis: 'x',
    itemSize: 70,
    visible: 3,
    labels: months,
    value: months.length,
    onChange: (v) => {
      const parts = String(months[v - 1] || '').split('/');
      const y = Number(parts[0]);
      const m = Number(parts[1]);
      if (!y || !m) return;
      year = y;
      month = m - 1;
      rebuild();
    },
  });
  monRow.appendChild(monWheel.el);
  box.appendChild(monRow);

  /* 二维码（240 固定）+ 右侧日竖轮（垂直居中） */
  const qrRow = document.createElement('div');
  qrRow.className = 'nt-sync-qrrow';

  const canvas = document.createElement('canvas');
  canvas.className = 'nt-sync-qr';
  qrRow.appendChild(canvas);

  // 没有流水时的占位：绝对定位盖住二维码，不改变布局尺寸
  const empty = document.createElement('div');
  empty.className = 'nt-sync-qr-empty';
  empty.textContent = '还没有可同步的流水';
  empty.hidden = true;
  qrRow.appendChild(empty);

  // 右侧：页码竖列（每页一张码，点一下切换；用户 2026-10-30 的布局）
  const pageCol = document.createElement('div');
  pageCol.className = 'nt-sync-pages';
  qrRow.appendChild(pageCol);
  box.appendChild(qrRow);

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
  function untilText() { return ymd(year, month, monthDays()); }
  function md(s) { return String(s).slice(5).replace('-', '/'); }
  function flash(t) { msg.textContent = t; }

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

  let pagesList = [];
  let cur = 0;

  /** 画当前页的码，并同步页码高亮 / 区间文字 / 同步码文本 */
  function paintPage() {
    const p = pagesList[cur];
    if (!p) {
      canvas.style.visibility = 'hidden';
      canvas.dataset.url = '';
      empty.hidden = false;
      empty.textContent = '这一段没有流水';
      return;
    }
    canvas.dataset.url = p.url;
    const painted = paintText(canvas, p.url, 5);
    canvas.style.visibility = painted.ok ? '' : 'hidden';
    empty.hidden = painted.ok;
    if (!painted.ok) empty.textContent = painted.error || '这张码装不下';

    range.dataset.from = p.from;
    range.dataset.until = p.until;
    range.textContent = '第 ' + (cur + 1) + '/' + pagesList.length + ' 页 · 包含 '
      + md(p.from) + ' — ' + md(p.until) + ' · ' + p.count + ' 笔';
    if (auto) ta.value = 'LZ1:' + String(p.url).split('#m=')[1];
    [...pageCol.children].forEach((b, i) => b.setAttribute('aria-current', i === cur ? 'true' : 'false'));
  }

  function renderPages() {
    pageCol.textContent = '';
    pagesList.forEach((p, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'nt-sync-page';
      b.textContent = String(i + 1);
      b.title = md(p.from) + ' — ' + md(p.until) + ' · ' + p.count + ' 笔';
      b.addEventListener('click', () => { cur = i; paintPage(); });
      pageCol.appendChild(b);
    });
  }

  async function rebuild() {
    const my = ++seq;
    const until = untilText();

    // 只藏内容、不藏元素：二维码始终占着 240×240，布局才不跳
    canvas.style.visibility = 'hidden';
    empty.hidden = true;
    canvas.dataset.url = '';
    range.textContent = '正在装码…';
    range.dataset.from = '';
    range.dataset.until = until;

    try {
      const pages = await paginate(ctx.getState(), { base, until, maxCount: MAX_COUNT });
      if (my !== seq) return;

      pagesList = pages;
      if (!pages.length) {
        pageCol.textContent = '';
        empty.hidden = false;
        empty.textContent = '这一段没有流水';
        range.textContent = '换个年月试试';
        if (auto) ta.value = '';
        return;
      }

      cur = pages.length - 1;   // 默认显示最新那一页
      renderPages();
      paintPage();
    } catch (e) {
      if (my !== seq) return;
      empty.hidden = false;
      range.textContent = '生成失败：' + e.message;
    }
  }

  canvas.addEventListener('click', zoom);
  rebuild();
  return box;
}

/* ---------- 年月列表：当前月往前 24 个月 ---------- */

function monthLabels(baseDate) {
  const out = [];
  const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  d.setMonth(d.getMonth() - 24);
  for (let i = 0; i <= 24; i += 1) {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    out.push(d.getFullYear() + '/' + m);
    d.setMonth(d.getMonth() + 1);
  }
  return out;
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
