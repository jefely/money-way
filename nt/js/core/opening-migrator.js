// 界面：（无界面）期初迁移
/**
 * ☐1 期初迁移器
 * 层：第一层 · 数据基座（纯数据，零依赖）
 *
 * 把旧数据里的 `acc.opening`（账户期初余额）转成 `__OPENING__` 虚拟账户的流水，
 * 让「余额 = Σ流水」这条路彻底统一 —— 之后再没有 `+ opening` 这种特例分支。
 *
 * 幂等：已经迁移过的账户不会再生成第二遍（靠 __OPENING__ 行是否已存在判断）。
 *
 * 验收：跑完后所有账户余额不变，且 state.transactions 新增对应期初行。
 */

export const OPENING_ACCOUNT = '__OPENING__';

/**
 * 把账户期初余额迁移成流水。
 * @param {Array<{id:string,name:string,opening:number|string}>} accounts
 * @param {Array} transactions 现有流水
 * @returns {{accounts:Array, transactions:Array, migrated:string[], skipped:string[]}}
 */
export function migrateOpening(accounts, transactions) {
  // TODO(☐1): 逐个账户处理：
  //   1. opening 为 0/空 → skipped，不动
  //   2. 已存在 `from === OPENING_ACCOUNT && to === acc.name` 的流水 → skipped（幂等）
  //   3. 否则生成一笔 { from: OPENING_ACCOUNT, to: acc.name, amount: opening, date: 期初日 }
  //   4. 账户对象的 opening 归零
  // 注意：余额方向由账户性质决定，迁移出来的流水必须让 computeAccountStats 的结果不变。
  return { accounts, transactions, migrated: [], skipped: [] };
}

/** 判断某笔流水是否期初行。 */
export function isOpeningTx(tx) {
  return !!tx && (tx.from === OPENING_ACCOUNT || tx.to === OPENING_ACCOUNT);
}
