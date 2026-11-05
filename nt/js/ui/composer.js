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

  // 悬浮气泡（2026-11）：**一个**圆钮，收起时是铅笔气泡，点开是「输入框从左边长出来、
  // 圆钮留在右边当发送键」——不换元素、不消失，所以展开/收起都有连续的形状感。
  // 结构：.nt-composer > input + button.nt-composer-btn
  const bar = document.createElement('div');
  bar.className = 'nt-composer';

  const input = document.createElement('input');
  input.className = 'nt-input nt-composer-input';
  input.type = 'text';
  input.setAttribute('aria-label', '一句话记账');
  input.placeholder = ENTRY_PROMPT.idle;
  input.autocomplete = 'off';
  input.enterKeyHint = 'send';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'nt-composer-btn';
  btn.setAttribute('aria-label', '随手记一笔');
  btn.title = '随手记一笔（可拖动）';
  // 没内容 = 铅笔；有内容 = 发送箭头（两个 SVG 靠 CSS 切）
  btn.innerHTML = '<svg class="nt-icon-edit" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
    + '<path d="M4 20h4L19 9l-4-4L4 16v4z" fill="none" stroke="currentColor"'
    + ' stroke-width="2" stroke-linejoin="round"/>'
    + '<path d="M14 6l4 4" fill="none" stroke="currentColor" stroke-width="2"/></svg>'
    + '<svg class="nt-icon-send" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
    + '<path d="M12 19V6M6 12l6-6 6 6" fill="none" stroke="currentColor"'
    + ' stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  bar.appendChild(input);
  bar.appendChild(btn);

  /** 展开 / 收起：只切一个 class，输入框靠 CSS 从 0 宽长出来 */
  function setOpen(open) {
    bar.classList.toggle('open', open);
    applyPos();
    if (!open) return;
    setTimeout(() => {
      try { input.focus(); } catch (e) { /* 忽略 */ }
    }, 30);
  }

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && bar.classList.contains('open')) setOpen(false);
  });

  /* ---------- 位置：可拖动 + 键盘不挤动 ---------- */
  const POS_KEY = 'nt_composer_pos';
  const EDGE = 8;
  const GAP = 16;
  let suppressClick = false;

  // 用户拖到的位置（距视口右/下）；键盘弹出只改「显示位置」，这里不动
  let posRight = 16;
  let posBottom = 16;
  try {
    const saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
    if (saved && Number.isFinite(saved.right)) posRight = saved.right;
    if (saved && Number.isFinite(saved.bottom)) posBottom = saved.bottom;
  } catch (e) { /* 无痕模式读不到就算了 */ }

  /**
   * 软键盘高度。
   * 只认 `innerHeight - visualViewport.height`；**不要再减 offsetTop** ——
   * 那是页面滚动量，减掉等于把键盘高度算两遍，气泡会一次跳得老高（用户报「被输入法挤动」）。
   */
  function keyboardHeight() {
    const vv = window.visualViewport;
    if (!vv) return 0;
    const h = window.innerHeight - vv.height;
    return h > 80 ? Math.round(h) : 0;
  }

  /** 展开宽度的上限（屏宽留 32px 边） */
  function panelWidth() {
    return Math.min(360, window.innerWidth - 32);
  }

  /**
   * 摆放：
   *   · 收起 —— 就在用户拖到的地方；
   *   · 展开 —— 右边仍在原位，但左边界至少留 8px（太靠左就临时往右挪）；
   *   · 键盘弹出 —— 抬到键盘上方（只改显示位置，posBottom/posRight 不变）。
   */
  function applyPos() {
    const kb = keyboardHeight();
    const open = bar.classList.contains('open');
    const w = open ? panelWidth() : 54;
    const right = open
      ? Math.max(EDGE, Math.min(posRight, window.innerWidth - w - EDGE))
      : posRight;
    const maxBottom = Math.max(EDGE, window.innerHeight - 90);
    const bottom = Math.min(maxBottom, Math.max(posBottom, kb ? kb + GAP : 0));
    bar.style.right = Math.round(right) + 'px';
    bar.style.bottom = Math.round(bottom) + 'px';
  }
  applyPos();

  window.addEventListener('resize', applyPos);
  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener('resize', applyPos);
    vv.addEventListener('scroll', applyPos);
  }

  const drag = { active: false, moved: false, sx: 0, sy: 0, sr: 0, sb: 0 };

  btn.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    drag.active = true;
    drag.moved = false;
    drag.sx = ev.clientX;
    drag.sy = ev.clientY;
    // 以**圆钮**的位置为基准：这样展开时拖到哪，收起后气泡就停在同一个地方
    const r = btn.getBoundingClientRect();
    drag.sr = window.innerWidth - r.right;
    drag.sb = window.innerHeight - r.bottom;
    try { btn.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
  });

  btn.addEventListener('pointermove', (ev) => {
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
  });

  btn.addEventListener('pointerup', (ev) => {
    if (!drag.active) return;
    drag.active = false;
    try { btn.releasePointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    if (!drag.moved) return;                 // 没移动 = 普通点击（click 会处理）
    suppressClick = true;                    // 拖完不要再当成点击
    // 回写成**实际落点**（拖动中可能被边缘 clamp 截住）：
    // 这样收起后气泡就停在展开时圆钮的地方，不会跳一下。
    const r = btn.getBoundingClientRect();
    posRight = Math.max(EDGE, Math.round(window.innerWidth - r.right));
    posBottom = Math.max(EDGE, Math.round(window.innerHeight - r.bottom));
    applyPos();
    try {
      localStorage.setItem(POS_KEY, JSON.stringify({ right: posRight, bottom: posBottom }));
    } catch (e) { /* 忽略 */ }
  });

  btn.addEventListener('pointercancel', () => { drag.active = false; });

  // 点击三态：收起 → 展开；展开且空 → 收起；展开且有字 → 发送
  btn.addEventListener('click', () => {
    if (suppressClick) { suppressClick = false; return; }
    if (!bar.classList.contains('open')) { setOpen(true); return; }
    if (String(input.value || '').trim()) { submit(true); return; }
    setOpen(false);
  });

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
    syncSendState();
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

  input.addEventListener('input', () => {
    armIdle();
    syncSendState();
    const text = String(input.value || '').trim();
    if (!text || text.length > 8 || /\d/.test(text)) { hideSuggest(); return; }
    const items = suggestPhraseAccounts(h.getState(), text);
    if (items.length) showSuggest(input, items, (acc) => { input.value = acc.name || ''; submit(true); });
    else hideSuggest();
  });

  /** 有内容 → 圆形按钮切成「发送箭头」；空着 → 回到铅笔 */
  function syncSendState() {
    const has = String(input.value || '').trim().length > 0;
    btn.classList.toggle('has-text', has);
    btn.setAttribute('aria-label', has ? '发送' : '随手记一笔');
    btn.title = has ? '发送' : '随手记一笔';
  }
  syncSendState();

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
