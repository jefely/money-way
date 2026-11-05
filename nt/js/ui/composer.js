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
  const bar = document.createElement('div');
  bar.className = 'nt-composer';

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

  bar.appendChild(input);
  bar.appendChild(send);

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
