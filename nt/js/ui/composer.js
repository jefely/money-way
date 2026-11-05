// 界面：流水 tab → 一句话输入条
/**
 * 流水页顶部的一句话输入。
 * 层：第五层 · UI
 *
 * 「咖啡 50」写成草稿；下一句「微信」补转出。
 * 失焦和 30 秒只收起候选，不删除草稿。
 */

import {
  applyPhrase, fillDraft, suggestPhraseAccounts, retainDrafts, ENTRY_PROMPT,
} from '../core/phrase-entry.js';
import { showSuggest, hideSuggest, isSuggestFor } from './suggest-popover.js';
import { flyParts } from './fly-in.js';

export function mountComposer(section, ctx, rowHost, refresh) {
  const h = ctx || {};

  // 悬浮气泡（2026-11）：平时只是右下角一个圆形按钮，点开才展开输入条。
  // 结构：.nt-composer > .nt-composer-panel（输入 + 发送） + .nt-composer-fab（圆形按钮）
  const bar = document.createElement('div');
  bar.className = 'nt-composer';

  const panel = document.createElement('div');
  panel.className = 'nt-composer-panel';
  panel.hidden = true;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'nt-composer-fab';
  toggle.setAttribute('aria-label', '随手记一笔');
  toggle.title = '随手记一笔（可拖动）';
  // 铅笔图标用内联 SVG：比 ✎ 字符在各平台上稳定，也能跟着 currentColor 变白
  toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
    + '<path d="M4 20h4L19 9l-4-4L4 16v4z" fill="none" stroke="currentColor"'
    + ' stroke-width="2" stroke-linejoin="round"/>'
    + '<path d="M14 6l4 4" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

  const input = document.createElement('input');
  input.className = 'nt-input nt-composer-input';
  input.type = 'text';
  input.setAttribute('aria-label', '一句话记账');
  input.placeholder = ENTRY_PROMPT.idle;
  input.autocomplete = 'off';
  input.enterKeyHint = 'send';

  const send = document.createElement('button');
  send.type = 'button';
  send.className = 'nt-btn nt-btn-sm nt-composer-send';
  send.textContent = '发送';

  panel.appendChild(input);
  panel.appendChild(send);
  bar.appendChild(panel);
  bar.appendChild(toggle);

  /** 展开 / 收起气泡；展开时把焦点交给输入框 */
  function setOpen(open) {
    panel.hidden = !open;
    bar.classList.toggle('open', open);
    if (!open) return;
    alignPanel();   // 展开时按气泡位置算面板对齐方式和最大宽度
    setTimeout(() => {
      try { input.focus(); } catch (e) { /* 忽略 */ }
    }, 30);
  }

  toggle.addEventListener('click', () => {
    if (suppressClick) { suppressClick = false; return; }
    setOpen(panel.hidden);
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !panel.hidden) setOpen(false);
  });

  /* ---------- 气泡可拖动（位置记在本机） ---------- */
  const POS_KEY = 'nt_composer_pos';
  const EDGE = 8;
  const GAP = 16;
  let suppressClick = false;

  // 用户拖到的位置（距视口右/下），和「实际显示位置」分开：
  // 软键盘弹出时只在显示位置抬高，拖到的位置本身不变（见 applyPos）。
  let posRight = 16;
  let posBottom = 16;
  try {
    const saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
    if (saved && Number.isFinite(saved.right)) posRight = saved.right;
    if (saved && Number.isFinite(saved.bottom)) posBottom = saved.bottom;
  } catch (e) { /* 无痕模式读不到就算了 */ }

  /** 软键盘高度（键盘弹出时 visualViewport 变矮；不是键盘就不算） */
  function keyboardHeight() {
    const vv = window.visualViewport;
    if (!vv) return 0;
    const h = window.innerHeight - vv.height - vv.offsetTop;
    return h > 80 ? Math.round(h) : 0;
  }

  /**
   * 摆放气泡：平时就在用户拖到的位置；
   * 键盘弹出时整体抬到键盘上方（只改显示位置，posBottom 不动），
   * 这样键盘一收就回到原处，也不会被浏览器重排挤来挤去。
   */
  function applyPos() {
    const kb = keyboardHeight();
    const maxBottom = Math.max(EDGE, window.innerHeight - 90);
    const bottom = Math.min(maxBottom, Math.max(posBottom, kb ? kb + GAP : 0));
    bar.style.right = Math.round(posRight) + 'px';
    bar.style.bottom = Math.round(bottom) + 'px';
  }
  applyPos();

  /** 气泡在左半屏时，展开的面板改成左对齐（并限宽），否则会跑出屏幕 */
  function alignPanel() {
    const r = bar.getBoundingClientRect();
    if (!r.width) return;   // mount 时还没定位，量到 0 会误判成「在左边」
    const leftHalf = r.left + r.width / 2 < window.innerWidth / 2;
    bar.classList.toggle('left', leftHalf);
    const space = leftHalf ? window.innerWidth - r.left - 8 : r.right - 8;
    panel.style.maxWidth = Math.max(220, Math.round(space)) + 'px';
  }
  requestAnimationFrame(alignPanel);
  window.addEventListener('resize', () => { applyPos(); alignPanel(); });

  // 键盘弹出 / 收起：重算显示位置（iOS 会重排视口，这里显式管住它）
  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener('resize', () => { applyPos(); alignPanel(); });
    vv.addEventListener('scroll', () => { applyPos(); alignPanel(); });
  }

  const drag = { active: false, moved: false, sx: 0, sy: 0, sr: 0, sb: 0 };

  toggle.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    drag.active = true;
    drag.moved = false;
    drag.sx = ev.clientX;
    drag.sy = ev.clientY;
    const r = bar.getBoundingClientRect();
    drag.sr = window.innerWidth - r.right;
    drag.sb = window.innerHeight - r.bottom;
    try { toggle.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
  });

  toggle.addEventListener('pointermove', (ev) => {
    if (!drag.active) return;
    const dx = ev.clientX - drag.sx;
    const dy = ev.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;   // 手抖不算拖动
    drag.moved = true;
    const maxR = window.innerWidth - 60;
    const maxB = window.innerHeight - 60;
    posRight = Math.max(EDGE, Math.min(maxR, drag.sr - dx));
    posBottom = Math.max(EDGE, Math.min(maxB, drag.sb - dy));
    applyPos();
    alignPanel();
  });

  toggle.addEventListener('pointerup', (ev) => {
    if (!drag.active) return;
    drag.active = false;
    try { toggle.releasePointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    if (!drag.moved) return;                 // 没移动 = 普通点击（click 会处理）
    suppressClick = true;                    // 拖完不要再当成点击
    try {
      localStorage.setItem(POS_KEY, JSON.stringify({
        right: Math.round(posRight),
        bottom: Math.round(posBottom),
      }));
    } catch (e) { /* 忽略 */ }
  });

  toggle.addEventListener('pointercancel', () => { drag.active = false; });

  // 插到**流水页**自己的工具条下面。
  // 2026-11 起流水页和设置页在一条横向滑道里，section 里第一个 .nt-vbar 是设置页的，
  // 直接取 section.querySelector('.nt-vbar') 会把输入条插进设置页。
  const page = section.querySelector('[data-flow-page="flow"]') || section;
  const vbar = page.querySelector('.nt-vbar');
  if (vbar && vbar.parentNode) vbar.parentNode.insertBefore(bar, vbar.nextSibling);
  else page.insertBefore(bar, page.firstChild);

  let openId = null;
  let timer = 0;

  function armIdle() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      hideSuggest();
      retainDrafts(h.getState());
    }, 30000);
  }

  /**
   * 当前引导的那条草稿还在不在？
   *
   * 用户把自动生成的草稿行删掉后，openId 仍指着它，提示词就会一直停在
   * 「哪里付的钱？」—— 看起来像没删掉。这里在每次流水重画后核对一次：
   * 那条草稿已经不在了，就把引导归零，输入框回到「随手记一笔…」。
   *
   * 只核对 openId，不去猜「现在该引导哪一条」：同时有多条草稿时，
   * 猜错比不猜更糟；删掉哪条就重新开始，下一句会重新建草稿。
   */
  function syncDraft() {
    if (!openId) return;
    const state = h.getState();
    const still = (state.transactions || []).some(
      (t) => t && t.id === openId && t.status === 'draft',
    );
    if (still) return;
    openId = null;
    input.placeholder = ENTRY_PROMPT.idle;
  }

  function land(result) {
    h.setState(result.state);
    if (h.save) h.save();
    if (refresh) refresh();
    flyParts(rowHost || section, input, result.tx && result.tx.id, result.fly);
    const done = result.outcome === 'posted' || result.outcome === 'note' || result.outcome === 'missing';
    input.placeholder = done ? ENTRY_PROMPT.idle : (result.prompt || ENTRY_PROMPT.idle);
    if (done) openId = null;
    else if (result.tx && result.tx.status === 'draft') openId = result.tx.id;
    if (result.outcome !== 'suggest') input.value = '';
    if (h.setFooter && result.prompt) h.setFooter(result.prompt);
  }

  function submit(force) {
    const text = String(input.value || '').trim();
    if (!text) return;
    hideSuggest();
    const state = h.getState();
    const open = openId && (state.transactions || []).some((t) => t && t.id === openId && t.status === 'draft');
    if (open) land(fillDraft(state, openId, text, { force: !!force }));
    else {
      openId = null;
      land(applyPhrase(state, text));
    }
    // 这一句已经落定（没有「哪里付的钱？」这类后续追问）就收起气泡；
    // 还要接着补一句时保持展开，别让用户每句都点一次按钮。
    if (!openId) setOpen(false);
  }

  input.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' || ev.isComposing) return;
    ev.preventDefault();
    submit(true);
  });
  send.addEventListener('click', () => submit(true));

  input.addEventListener('input', () => {
    armIdle();
    const text = String(input.value || '').trim();
    if (!text || text.length > 8 || /\d/.test(text)) { hideSuggest(); return; }
    const items = suggestPhraseAccounts(h.getState(), text);
    if (items.length) showSuggest(input, items, (acc) => { input.value = acc.name || ''; submit(true); });
    else hideSuggest();
  });

  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (isSuggestFor(input)) return;
      hideSuggest();
      retainDrafts(h.getState());
    }, 200);
  });

  armIdle();
  return { input, bar, syncDraft };
}
