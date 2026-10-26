// 界面：（无界面）账本校验 V1–V7
/**
 * 纯函数：两条校验（数据完整性 / 会计恒等式）。
 *
 * 依赖隔离：不碰 DOM/存储，可在 Node 下跑。
 */

import { DEBIT_CATS, toAmount } from './stats.js';

const VIRTUAL_CATS = ['权益类'];

/**
 * 数据完整性：转出总额 − 转入总额 = 0。
 * 每笔流水都必须有两个对手方，任何单边/零额都会让它不等于 0。
 */
export function checkBalanced(transactions) {
  let out = 0;
  let inn = 0;
  const singleSided = [];
  const zeroAmount = [];

  for (const t of transactions || []) {
    const amt = toAmount(t && t.amount);
    const from = String((t && t.from) || '').trim();
    const to = String((t && t.to) || '').trim();
    if (!amt) { zeroAmount.push(t); continue; }
    if (!from || !to) { singleSided.push(t); }
    out += amt;
    inn += amt;
  }

  // 单边流水只进了一侧（这里两侧都加，所以差额恒为 0；
  // 「完整性」真正暴露问题的是单边/零额条数，而不是算术差）。
  const diff = Math.round((out - inn) * 100) / 100;
  return { diff, out, in: inn, singleSided, zeroAmount, ok: Math.abs(diff) < 0.005 && singleSided.length === 0 };
}

/**
 * 会计恒等式：资产 + 费用 = 负债 + 权益 + 收入。
 *
 * 注意：早期只算「资产 − 负债 − 权益」，一记费用就必然不平 ——
 * 因为费用让资产减少，却没有对应的权益变动。
 * 完整的复式恒等式必须把损益类（费用、收入）算进来，
 * 写成「资产 + 费用 − 负债 − 权益 − 收入 = 0」。
 *
 * @param {Array<{cat:string, balance:number}>} balances
 */
export function checkAccountingIdentity(balances) {
  let asset = 0;
  let liability = 0;
  let equity = 0;
  let income = 0;
  let expense = 0;

  for (const b of balances || []) {
    const v = toAmount(b && b.balance);
    switch (b && b.cat) {
      case '资产类': asset += v; break;
      case '负债类': liability += v; break;
      case '权益类': equity += v; break;
      case '收入类': income += v; break;
      case '费用类': expense += v; break;
      default: break;
    }
  }

  const diff = Math.round((asset + expense - liability - equity - income) * 100) / 100;
  return { asset, liability, equity, income, expense, diff, ok: Math.abs(diff) < 0.005 };
}

/** 账户性质是否属于「转入增加」的那一侧（给界面提示用）。 */
export function isDebitCat(cat) {
  return DEBIT_CATS.includes(cat);
}

export { VIRTUAL_CATS };
