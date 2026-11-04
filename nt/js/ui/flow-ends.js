// 界面：流水格里的名字 → 节点
/**
 * 转出 / 转入格子里的文本：已有节点直接用，物品词落到分类节点，
 * 原词记在 held 里，调用方补进备注。
 */

import { ensureAccountByText } from '../core/state-store.js';
import { parseAccountInput } from '../core/account-resolver.js';

export function joinHeld(note, held) {
  const add = String(held || '').trim();
  const base = String(note || '').trim();
  if (!add) return base;
  if (base === add || base.includes(add)) return base;
  return (base + ' ' + add).trim();
}

/** 一个格子。resolvedId 是输入法已经对上的节点。 */
export function endFromText(state, index, value, resolvedId, note) {
  const known = resolvedId || (parseAccountInput(index, value).acc || {}).id || null;
  if (known || !String(value || '').trim()) {
    return { state, id: known || null, note: note || '' };
  }
  const r = ensureAccountByText(state, value);
  return { state: r.state, id: r.id, note: joinHeld(note, r.held) };
}

/** 新的一行：两端一起解析。 */
export function endsFromFields(state, index, fields) {
  const from = parseAccountInput(index, (fields && fields.from) || '');
  const to = parseAccountInput(index, (fields && fields.to) || '');
  let s = state;
  let fromId = from.acc ? from.acc.id : null;
  let toId = to.acc ? to.acc.id : null;
  let held = '';
  if (!fromId && fields && fields.from) {
    const r = ensureAccountByText(s, fields.from);
    s = r.state;
    fromId = r.id;
    held = joinHeld(held, r.held);
  }
  if (!toId && fields && fields.to) {
    const r = ensureAccountByText(s, fields.to);
    s = r.state;
    toId = r.id;
    held = joinHeld(held, r.held);
  }
  return { state: s, fromId, toId, held };
}
