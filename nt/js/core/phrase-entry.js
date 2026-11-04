// 界面：（无界面）一句话入账
/**
 * 把 parsePhrase 的结果写成流水。
 * 层：第一层 · 数据基座
 *
 * 完整句（工资到微信 8000）直接入账。
 * 只解析出一部分就留下草稿，等下一句补。
 * 完全看不懂：整句进备注，金额保持 0，不猜。
 * 失焦 / 超时不删草稿（retainDrafts）。
 */

import { makeId } from './schema.js';
import { LEXICON, accountLexicon } from './lexicon.js';
import { parsePhrase } from './phrase-parser.js';
import { addTransaction, ensureAccountByText, updateTransaction } from './state-store.js';
import { learnMapping, mappingFor, promoteDrafts } from './draft-book.js';
import { uniqueCode } from './import-apply.js';

export const ENTRY_PROMPT = {
  idle: '事项和金额，例如：咖啡 50',
  'need-from': '哪里付的钱？例如：微信',
  'need-to': '记到哪个账户？可以先空着',
  posted: '已入账',
  note: '已记成草稿备注，没有猜金额',
  'need-amount': '金额是多少？',
  draft: '草稿已留下',
  suggest: '有相近的账户，点一下即可',
};

/** 失焦和 30 秒都不碰已写下的草稿。 */
export function retainDrafts(state) {
  return state;
}

function typesOf(hint) {
  if (!hint) return null;
  if (hint.role === 'payment') return { type: '资产类', category: '网络账户' };
  if (hint.role === 'asset' || hint.role === 'liability' || hint.role === 'income') {
    return { type: hint.type || '', category: hint.category || '' };
  }
  if (hint.type) return { type: hint.type, category: hint.category || '' };
  return null;
}

function patchAccount(state, id, typed) {
  return {
    ...state,
    accounts: (state.accounts || []).map((a) => {
      if (!a || a.id !== id) return a;
      if (String(a.type || '').trim()) return a;
      return { ...a, type: typed.type, category: a.category || typed.category };
    }),
  };
}

function createTyped(state, name, typed) {
  const id = makeId('acc');
  const acc = {
    id,
    code: uniqueCode(state.accounts, name),
    name,
    type: typed.type,
    category: typed.category,
    isHidden: false,
  };
  return { state: { ...state, accounts: [...(state.accounts || []), acc] }, id };
}

function withHint(state, hint) {
  if (!hint) return { state, id: null };
  const typed = typesOf(hint);
  if (hint.id) {
    const acc = (state.accounts || []).find((a) => a && a.id === hint.id);
    if (acc && typed && !String(acc.type || '').trim()) {
      return { state: patchAccount(state, acc.id, typed), id: acc.id };
    }
    return { state, id: hint.id };
  }
  const name = hint.accountName || hint.keyword;
  if (!name) return { state, id: null };
  const acc = (state.accounts || []).find((a) => a && a.name === name);
  if (acc) {
    if (typed && !String(acc.type || '').trim()) {
      return { state: patchAccount(state, acc.id, typed), id: acc.id };
    }
    return { state, id: acc.id };
  }
  if (typed && typed.type) return createTyped(state, name, typed);
  return ensureAccountByText(state, name);
}

function nameOf(state, id) {
  const a = (state.accounts || []).find((x) => x && x.id === id);
  return a ? a.name : '';
}

function flyOf(state, tx, fields) {
  if (!tx) return [];
  const text = {
    note: tx.note || '',
    amount: Number(tx.amount) > 0 ? String(tx.amount) : '',
    from: nameOf(state, tx.from_id),
    to: nameOf(state, tx.to_id),
  };
  return (fields || []).filter((f) => text[f]).map((f) => ({ field: f, text: text[f] }));
}

function outcomeOf(tx) {
  if (!tx || tx.status !== 'draft') return 'posted';
  const amt = Number(tx.amount) > 0;
  if (!amt && !tx.from_id && !tx.to_id) return 'note';
  if (!amt) return 'need-amount';
  if (!tx.from_id) return 'need-from';
  if (!tx.to_id) return 'need-to';
  return 'draft';
}

function finish(state, tx, fields) {
  const next = promoteDrafts(state);
  const live = (next.transactions || []).find((t) => t && tx && t.id === tx.id) || tx;
  const outcome = outcomeOf(live);
  return {
    state: next,
    tx: live,
    outcome,
    prompt: ENTRY_PROMPT[outcome] || ENTRY_PROMPT.draft,
    fly: flyOf(next, live, fields),
    suggestions: [],
  };
}

/**
 * @param {object} state
 * @param {string} text
 * @param {Date} [now]
 */
export function applyPhrase(state, text, now) {
  const parsed = parsePhrase(text, (state && state.accounts) || [], LEXICON, now);
  const date = parsed.date;
  if (parsed.confidence === 'low') {
    const s = addTransaction(state, {
      date, amount: 0, note: String(text || '').trim(), status: 'draft',
    });
    const tx = s.transactions[s.transactions.length - 1];
    return finish(s, tx, ['note']);
  }
  let s = state;
  const from = withHint(s, parsed.fromHint);
  s = from.state;
  const to = withHint(s, parsed.toHint);
  s = to.state;
  let toId = to.id;
  if (!toId && parsed.note) {
    const mapped = mappingFor(s, parsed.note);
    if (mapped && (s.accounts || []).some((a) => a && a.id === mapped)) toId = mapped;
  }
  s = addTransaction(s, {
    date,
    from_id: from.id,
    to_id: toId,
    amount: parsed.amount == null ? 0 : parsed.amount,
    note: parsed.note || '',
    status: 'draft',
  });
  const tx = s.transactions[s.transactions.length - 1];
  return finish(s, tx, ['note', 'amount', 'from', 'to']);
}

function edit1(a, b) {
  if (!a || !b || a === b) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    let d = 0;
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) d += 1;
    return d === 1;
  }
  const s = a.length < b.length ? a : b;
  const l = a.length < b.length ? b : a;
  let i = 0;
  let j = 0;
  let d = 0;
  while (i < s.length && j < l.length) {
    if (s[i] === l[j]) { i += 1; j += 1; }
    else { d += 1; j += 1; if (d > 1) return false; }
  }
  return true;
}

function near(q, name) {
  if (!q || !name || q === name) return false;
  return name.includes(q) || q.includes(name) || edit1(q, name);
}

/** 模糊候选。精确命中不在这里。 */
export function suggestPhraseAccounts(state, text, lexicon = LEXICON) {
  const q = String(text || '').trim();
  if (!q) return [];
  const out = [];
  const seen = new Set();
  const push = (acc) => {
    if (!acc || !acc.name || seen.has(acc.name)) return;
    seen.add(acc.name);
    out.push({ acc, reason: 'fuzzy' });
  };
  for (const a of (state && state.accounts) || []) {
    if (!a || a.isHidden) continue;
    if (near(q, a.name)) push(a);
  }
  for (const row of accountLexicon(lexicon)) {
    const name = row.accountName || row.keyword;
    if (near(q, row.keyword) || near(q, name)) {
      push({
        name,
        code: '',
        category: row.role === 'payment' ? '网络账户' : (row.category || ''),
        type: row.role === 'payment' ? '资产类' : (row.type || ''),
        _lexicon: row,
      });
    }
  }
  return out.slice(0, 5);
}

function exactHint(state, text) {
  const q = String(text || '').trim();
  if (!q) return null;
  const user = (state.accounts || []).find((a) => a && !a.isHidden && a.name === q);
  if (user) {
    return { keyword: user.name, accountName: user.name, type: user.type || '', category: user.category || '', role: '', id: user.id };
  }
  const rows = accountLexicon(LEXICON).filter((r) => r.keyword === q);
  if (!rows.length) return null;
  rows.sort((a, b) => b.keyword.length - a.keyword.length);
  return { ...rows[0], id: null };
}

function amountOnly(text) {
  const m = String(text || '').trim().match(/^[¥￥]?\s*(\d+(?:\.\d+)?)(?:元|块钱|块|钱)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * 补当前这条草稿。模糊词只返回候选，不建账户。
 */
export function fillDraft(state, txId, text, opts) {
  const tx = ((state && state.transactions) || []).find((t) => t && t.id === txId);
  if (!tx) return { state, tx: null, outcome: 'missing', prompt: '', fly: [], suggestions: [] };
  const raw = String(text || '').trim();
  const parsed = parsePhrase(raw, state.accounts || [], LEXICON);
  if (parsed.amount != null && parsed.note) return applyPhrase(state, raw);
  const money = amountOnly(raw);
  if (money != null && !parsed.fromHint && !parsed.toHint) {
    const s = updateTransaction(state, txId, { amount: money });
    return finish(s, (s.transactions || []).find((t) => t.id === txId), ['amount']);
  }
  const force = !!(opts && opts.force);
  const hint = exactHint(state, raw) || (parsed.fromHint && !parsed.note ? parsed.fromHint : null);
  if (!hint && !force) {
    const suggestions = suggestPhraseAccounts(state, raw);
    if (suggestions.length) {
      return { state, tx, outcome: 'suggest', prompt: ENTRY_PROMPT.suggest, fly: [], suggestions };
    }
  }
  const side = !tx.from_id ? 'from_id' : 'to_id';
  let s = state;
  let id = hint && hint.id;
  if (hint && !id) {
    const got = withHint(s, hint);
    s = got.state;
    id = got.id;
  }
  if (!id) {
    const got = ensureAccountByText(s, raw);
    s = got.state;
    id = got.id;
    if (id) {
      s = {
        ...s,
        accounts: (s.accounts || []).map((a) => (
          a && a.id === id && !String(a.category || '').trim() ? { ...a, category: a.name } : a
        )),
      };
    }
  }
  if (!id) return finish(s, tx, []);
  s = updateTransaction(s, txId, { [side]: id });
  if (side === 'to_id' && tx.note) s = learnMapping(s, tx.note, id);
  return finish(s, (s.transactions || []).find((t) => t.id === txId), [side === 'from_id' ? 'from' : 'to']);
}
