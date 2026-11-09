// 界面：流水 tab → 可拖动记账浮窗
/**
 * 流水页的一句话输入，做成可拖动的记账浮窗。
 * 层：第五层 · UI
 *
 * 「咖啡 50」写成草稿；下一句「微信」补转出。
 * 失焦和 30 秒只收起候选，不删除草稿。
 * 浮窗可拖、可收起，位置始终落在可视区域里。
 */

import {
  applyPhrase, fillDraft, suggestPhraseAccounts, retainDrafts, ENTRY_PROMPT,
} from '../core/phrase-entry.js';
import { showSuggest, hideSuggest, isSuggestFor } from './suggest-popover.js';
import { flyParts } from './fly-in.js';

const POS_KEY = 'nt_composer_pos';
const EDGE = 8;

/** 把浮窗左上角收进可视区域。vp = { l, t, w, h }。 */
export function clampBox(x, y, w, h, vp, margin = EDGE) {
  const box = vp || { l: 0, t: 0, w: 0, h: 0 };
  const maxX = box.l + Math.max(margin, box.w - w - margin);
  const maxY = box.t + Math.max(margin, box.h - h - margin);
  return {
    x: Math.min(maxX, Math.max(box.l + margin, x)),
    y: Math.min(maxY, Math.max(box.t + margin, y)),
  };
}

function viewport() {
  const vv = window.visualViewport;
  if (!vv) return { l: 0, t: 0, w: window.innerWidth, h: window.innerHeight };
  return { l: vv.offsetLeft, t: vv.offsetTop, w: vv.width, h: vv.height };
}

function readPos() {
  try {
    const v = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
    if (!v || typeof v.x !== 'number' || typeof v.y !== 'number') return null;
    return v;
  } catch (e) {
    return null;
  }
}

export function mountComposer(section, ctx, rowHost, refresh) {
  const h = ctx || {};
  const bar = document.createElement('div');
  bar.className = 'nt-composer';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', '记账');

  const head = document.createElement('div');
  head.className = 'nt-composer-head';

  const mark = document.createElement('span');
  mark.className = 'nt-composer-mark';
  mark.setAttribute('aria-hidden', 'true');

  const title = document.createElement('span');
  title.className = 'nt-composer-title';
  title.textContent = '记账';

  const fold = document.createElement('button');
  fold.type = 'button';
  fold.className = 'nt-composer-fold';
  fold.textContent = '▾';
  fold.setAttribute('aria-label', '收起');
  fold.setAttribute('aria-expanded', 'true');

  head.appendChild(mark);
  head.appendChild(title);
  head.appendChild(fold);

  const body = document.createElement('div');
  body.className = 'nt-composer-body';

  const input = document.createElement('input');
  input.className = 'nt-input nt-composer-input';
  input.type = 'text';
  input.setAttribute('aria-label', '一句话记账');
  input.placeholder = '草稿会留下';
  input.autocomplete = 'off';
  input.enterKeyHint = 'send';

  const send = document.createElement('button');
  send.type = 'button';
  send.className = 'nt-btn nt-btn-sm nt-composer-send';
  send.textContent = '发送';

  body.appendChild(input);
  body.appendChild(send);
  bar.appendChild(head);
  bar.appendChild(body);

  const saved = readPos();
  if (saved && saved.collapsed) bar.classList.add('is-collapsed');
  document.body.appendChild(bar);

  function moveTo(x, y) {
    const p = clampBox(x, y, bar.offsetWidth, bar.offsetHeight, viewport());
    bar.style.left = p.x + 'px';
    bar.style.top = p.y + 'px';
    bar.style.right = 'auto';
    bar.style.bottom = 'auto';
  }

  function savePos() {
    try {
      const r = bar.getBoundingClientRect();
      localStorage.setItem(POS_KEY, JSON.stringify({
        x: r.left,
        y: r.top,
        collapsed: bar.classList.contains('is-collapsed'),
      }));
    } catch (e) { /* 隐私模式写不进，位置只在这一次里有效 */ }
  }

  function setCollapsed(on) {
    const before = bar.getBoundingClientRect();
    bar.classList.toggle('is-collapsed', !!on);
    title.textContent = on ? '记' : '记账';
    fold.setAttribute('aria-expanded', on ? 'false' : 'true');
    fold.setAttribute('aria-label', on ? '展开' : '收起');
    const after = bar.getBoundingClientRect();
    moveTo(before.right - after.width, before.bottom - after.height);
    savePos();
  }

  if (saved) {
    title.textContent = saved.collapsed ? '记' : '记账';
    fold.setAttribute('aria-expanded', saved.collapsed ? 'false' : 'true');
    fold.setAttribute('aria-label', saved.collapsed ? '展开' : '收起');
    moveTo(saved.x, saved.y);
  } else {
    const r = bar.getBoundingClientRect();
    moveTo(r.left, r.top);
  }

  const syncVis = () => { bar.hidden = !!(section && section.hidden); };
  syncVis();
  if (section && typeof MutationObserver === 'function') {
    const mo = new MutationObserver(syncVis);
    mo.observe(section, { attributes: true, attributeFilter: ['hidden'] });
  }

  const reclamp = () => {
    const r = bar.getBoundingClientRect();
    moveTo(r.left, r.top);
  };
  window.addEventListener('resize', reclamp);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', reclamp);
    window.visualViewport.addEventListener('scroll', reclamp);
  }

  let drag = null;
  head.addEventListener('pointerdown', (ev) => {
    if (ev.button != null && ev.button !== 0) return;
    if (ev.target === fold) return;
    const r = bar.getBoundingClientRect();
    drag = {
      id: ev.pointerId, x: ev.clientX, y: ev.clientY, l: r.left, t: r.top, moved: false,
    };
    try { head.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
  });
  head.addEventListener('pointermove', (ev) => {
    if (!drag || drag.id !== ev.pointerId) return;
    const dx = ev.clientX - drag.x;
    const dy = ev.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    if (ev.cancelable) ev.preventDefault();
    moveTo(drag.l + dx, drag.t + dy);
  }, { passive: false });
  head.addEventListener('pointerup', (ev) => {
    if (!drag || drag.id !== ev.pointerId) return;
    const moved = drag.moved;
    drag = null;
    if (!moved && bar.classList.contains('is-collapsed')) setCollapsed(false);
    else if (moved) savePos();
  });
  head.addEventListener('pointercancel', () => { drag = null; });
  fold.addEventListener('click', () => setCollapsed(!bar.classList.contains('is-collapsed')));

  let openId = null;
  let timer = 0;

  function armIdle() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      hideSuggest();
      retainDrafts(h.getState());
    }, 30000);
  }

  function land(result) {
    h.setState(result.state);
    if (h.save) h.save();
    if (refresh) refresh();
    flyParts(rowHost || section, input, result.tx && result.tx.id, result.fly);
    const done = result.outcome === 'posted' || result.outcome === 'note' || result.outcome === 'missing';
    input.placeholder = done ? ENTRY_PROMPT.idle : (result.prompt || '草稿会留下');
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
  return { input, bar };
}
