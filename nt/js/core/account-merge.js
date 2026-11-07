// 核心：节点合并（把待归类关键字并进真实节点）
/**
 * 节点合并
 * 层：第一层 · core
 *
 * 场景（用户 2026-11-08）：导入时高频商户先自成节点（味丰源）。
 * 用户在备注区把关键字改成已有节点名（早餐）→ 确认后把「味丰源」名下的流水
 * 全部改指「早餐」，删掉「味丰源」。**流水备注关键字仍然是「味丰源」** ——
 * 节点归并了，但每笔钱当初是给谁的，记录还在。
 *
 * 纯函数：返回新 state，不改入参。
 */

const norm = (v) => String(v == null ? '' : v).trim();

/**
 * @param {object} state
 * @param {string} fromId 旧的（待归类的）节点 id
 * @param {string} toId   目标节点 id
 * @returns {{state:object, moved:number}}
 */
export function mergeAccountInto(state, fromId, toId) {
  const a = norm(fromId);
  const b = norm(toId);
  if (!a || !b || a === b) return { state, moved: 0 };

  const accounts = (state && state.accounts) || [];
  if (!accounts.some((x) => x && x.id === a) || !accounts.some((x) => x && x.id === b)) {
    return { state, moved: 0 };
  }

  let moved = 0;
  const transactions = ((state && state.transactions) || []).map((t) => {
    if (!t) return t;
    if (t.from_id !== a && t.to_id !== a) return t;
    moved += 1;
    return {
      ...t,
      from_id: t.from_id === a ? b : t.from_id,
      to_id: t.to_id === a ? b : t.to_id,
    };
  });

  return {
    state: { ...state, accounts: accounts.filter((x) => x && x.id !== a), transactions },
    moved,
  };
}
