// 界面：（无界面）一句话解析
/**
 * parsePhrase(text, accounts, lexicon) → 草稿原料
 * 层：第一层 · 数据基座
 *
 * 顺序：整天词先拿走 → 账户名最长优先、每个只用一次（用户账户先于词库）
 * → 金额 = 剩下文本里的最后一个数（50元 / 50块 / ¥50）→ 其余是备注。
 * 停用词按整词删，不拆开花呗、支付宝、费用。任何输入都不抛。
 */

import { todayIso } from './format.js';
import { accountLexicon } from './lexicon.js';
import { extractSlots, roleOfType } from './phrase-slots.js';

const STOP = ['->', '→', '—', '-', '一个', '一笔', '块钱', '用', '买', '花', '付', '了', '的', '在', '从', '到', '给', '把', '去', '来', '和', '又', '还', '转', '存', '充'];

function empty(date) {
  return { date: date || '', amount: null, fromHint: null, toHint: null, note: '', confidence: 'low' };
}

function asDate(now) {
  return now instanceof Date && !isNaN(now.getTime()) ? now : new Date();
}

function shiftIso(now, delta) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() + delta);
  return todayIso(d);
}

function validYmd(y, m, d) {
  const yy = Number(y);
  const mm = Number(m);
  const dd = Number(d);
  if (!(yy >= 1900 && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31)) return '';
  return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/** 今天/昨天/前天、11月4日、ISO。整天词不从更长的账户名里抠。 */
function takeDate(text, now, protectedKeys) {
  const candidates = [];
  for (const [word, delta] of [['前天', -2], ['昨天', -1], ['今天', 0]]) {
    let i = text.indexOf(word);
    while (i >= 0) {
      const blocked = protectedKeys.some((k) => k.length > word.length && text.startsWith(k, i));
      if (!blocked) {
        candidates.push({ i, len: word.length, date: shiftIso(now, delta) });
        break;
      }
      i = text.indexOf(word, i + 1);
    }
  }
  const iso = /(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/g;
  let m;
  while ((m = iso.exec(text))) {
    const date = validYmd(m[1], m[2], m[3]);
    if (date) candidates.push({ i: m.index, len: m[0].length, date });
  }
  const md = /(\d{1,2})月(\d{1,2})[日号]/g;
  while ((m = md.exec(text))) {
    const date = validYmd(now.getFullYear(), m[1], m[2]);
    if (date) candidates.push({ i: m.index, len: m[0].length, date });
  }
  if (!candidates.length) return { text, date: todayIso(now) };
  candidates.sort((a, b) => a.i - b.i || b.len - a.len);
  const c = candidates[0];
  return { text: text.slice(0, c.i) + text.slice(c.i + c.len), date: c.date };
}

function matchOnce(text, items) {
  const sorted = items.slice().sort((a, b) => b.key.length - a.key.length || a.rank - b.rank);
  const ranges = [];
  for (const item of sorted) {
    if (!item.key) continue;
    const hay = item.boundary ? text.toUpperCase() : text;
    const needle = item.boundary ? String(item.key).toUpperCase() : item.key;
    let from = 0;
    while (from <= text.length) {
      const idx = hay.indexOf(needle, from);
      if (idx < 0) break;
      const end = idx + needle.length;
      if (item.boundary) {
        const prevCh = idx === 0 ? '' : text[idx - 1];
        // 边界放宽（2026-11 用户报「zhc2000jhc 第二个简码识别不了」）：
        //   ① 简码后面可以紧跟金额：ZC50 = 简码 ZC + 50；
        //   ② 金额后面可以紧跟简码：ZHC2000JHC = ZHC + 2000 + JHC；
        //   ③ 纯数字简码不享受这两条 —— 否则「50」里的 5 会被当成简码。
        const before = idx === 0
          || !/[A-Za-z0-9]/.test(prevCh)
          || (/\d/.test(prevCh) && /[^0-9]/.test(item.key));
        const afterCh = text[end];
        const after = end >= text.length
          || !/[A-Za-z0-9]/.test(afterCh)
          || (/\d/.test(afterCh) && /[^0-9]/.test(item.key));
        if (!before || !after) { from = idx + 1; continue; }
      }
      const overlap = ranges.some((r) => idx < r.end && end > r.start);
      if (!overlap) {
        ranges.push({ start: idx, end, item });
        break;
      }
      from = idx + 1;
    }
  }
  ranges.sort((a, b) => a.start - b.start);
  let rest = '';
  let cursor = 0;
  for (const r of ranges) {
    rest += text.slice(cursor, r.start);
    cursor = r.end;
  }
  rest += text.slice(cursor);
  return {
    hits: ranges.map((r) => ({ ...r.item, start: r.start, end: r.end })),
    ranges,
    rest,
  };
}

function takeAmount(text) {
  const re = /[¥￥]?\d+(?:\.\d+)?(?:元|块钱|块|钱)?/g;
  let m;
  let last = null;
  while ((m = re.exec(text))) last = m;
  if (!last) return { text, amount: null };
  const num = last[0].match(/\d+(?:\.\d+)?/);
  const amount = num ? Number(num[0]) : null;
  const next = text.slice(0, last.index) + text.slice(last.index + last[0].length);
  return { text: next, amount: Number.isFinite(amount) ? amount : null };
}

function stopBoundary(text, i, prot, stops) {
  if (i >= text.length) return true;
  const ch = text[i];
  if (/\s/.test(ch) || /[，。！？、,.!?]/.test(ch)) return true;
  if (prot.some((w) => text.startsWith(w, i))) return true;
  if (stops.some((w) => text.startsWith(w, i))) return true;
  return false;
}

function cleanNote(rest, protectedWords) {
  const prot = protectedWords.filter(Boolean).slice().sort((a, b) => b.length - a.length);
  const stops = STOP.slice().sort((a, b) => b.length - a.length);
  let i = 0;
  let out = '';
  while (i < rest.length) {
    const p = prot.find((w) => rest.startsWith(w, i));
    if (p) { out += p; i += p.length; continue; }
    const sw = stops.find((w) => rest.startsWith(w, i) && stopBoundary(rest, i + w.length, prot, stops));
    if (sw) { i += sw.length; continue; }
    out += rest[i];
    i += 1;
  }
  return out.replace(/\s+/g, ' ').trim();
}

function hintOfNode(node) {
  if (!node) return null;
  return {
    keyword: node.keyword || node.name,
    accountName: node.name,
    type: node.type || '',
    category: node.category || '',
    role: node.role || '',
    id: node.id || null,
  };
}

/**
 * @param {string} text
 * @param {Array} accounts 用户账户（名字优先于词库）
 * @param {Array} lexicon
 * @param {Date} [now]
 * @param {{notes?:Array}} [opts] 备注表（备注分类/关键字的来源）
 */
export function parsePhrase(text, accounts, lexicon, now, opts) {
  try {
    const clock = asDate(now);
    const raw = String(text == null ? '' : text).trim();
    const words = lexicon || [];
    const keys = [];
    for (const a of accounts || []) {
      if (a && !a.isHidden && a.name) keys.push(String(a.name));
    }
    for (const row of words) if (row && row.keyword) keys.push(row.keyword);

    // 退款是**方向**，不是节点：`退款 yf-wx 200` = 衣服 → 微信 200。
    // 只认「退款 / 退货 / 退回」三个整词；单字「退」会误伤「退休金」之类。
    let work = raw;
    let refund = false;
    const rm = work.match(/^(退款|退货|退回)\s*/);
    if (rm) {
      refund = true;
      work = work.slice(rm[0].length);
    }

    const dated = takeDate(work, clock, keys);
    const items = [];
    for (const a of accounts || []) {
      if (!a || a.isHidden) continue;
      if (a.name) {
        items.push({
          key: String(a.name),
          keyword: String(a.name),
          accountName: String(a.name),
          type: a.type || '',
          category: a.category || '',
          role: roleOfType(a.type),
          id: a.id,
          rank: 0,
        });
      }
      const code = String(a.code || '').replace(/\s+/g, '');
      if (code) {
        items.push({
          key: code,
          keyword: code,
          accountName: String(a.name || code),
          type: a.type || '',
          category: a.category || '',
          role: roleOfType(a.type),
          id: a.id,
          rank: 0,
          boundary: true,
        });
        keys.push(code);
      }
    }
    for (const row of accountLexicon(words)) {
      items.push({ ...row, key: row.keyword, id: null, rank: 1 });
    }
    const matched = matchOnce(dated.text, items);
    const amt = takeAmount(matched.rest);
    const note = cleanNote(amt.text, keys);
    const slots = extractSlots({
      text: dated.text,
      hits: matched.hits,
      note,
      amount: amt.amount,
      notes: (opts && opts.notes) || [],
      lexicon: words,
      reverse: refund,
    });
    const fromHint = hintOfNode(slots.from);
    const toHint = hintOfNode(slots.to);
    const endN = (fromHint ? 1 : 0) + (toHint ? 1 : 0);
    let confidence = 'low';
    if (amt.amount != null && endN === 2) confidence = 'high';
    else if (amt.amount != null || endN > 0) confidence = 'partial';
    return { date: dated.date, amount: amt.amount, fromHint, toHint, note, confidence, slots, refund };
  } catch (e) {
    return { ...empty(todayIso(new Date())), slots: null };
  }
}
