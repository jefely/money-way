// 界面：导入预览里的「账单」面板（起始日期 + 六元素统计）
/**
 * 账单导入面板（UI 层）
 *
 * 用户在导入窗口只填一个**起始日期**：之前的记录不用再核对，
 * 之后的全部按六大核心元素自动提取、自动建节点。
 *
 * 这里只造 DOM 与统计文字，解析与落库都在 core（bill-plan / bill-apply）。
 */

import { planBillImport } from '../core/bill-plan.js';

/** 只列真实账户：期初余额（isHidden）不是「我的账户」，列进来会被误选 */
export function myAccountPick(accounts, presetId, cardTail) {
  const picks = (accounts || []).filter((a) => a && !a.isHidden && a.id !== '__OPENING__');
  const re = presetId === 'wechat' ? /微信|零钱/ : presetId === 'alipay' ? /支付宝|余额/ : null;
  let hit = re ? picks.find((a) => re.test(String(a.name || ''))) : null;
  if (!hit && cardTail) hit = picks.find((a) => String(a.name || '').includes(cardTail));
  if (!hit) hit = picks.find((a) => a.type === '资产类');
  return hit || null;
}

const money = (v) => (Number(v) || 0).toFixed(2);

/**
 * 往预览对话框里塞「起始日期 + 统计」。返回一个读当前日期的函数。
 *
 * @param {HTMLElement} body 对话框内容容器
 * @param {{items:Array, presetId?:string}} result
 * @param {{accounts?:Array}} opts
 * @returns {() => string} 读当前起始日期
 */
export function mountBillPreview(body, result, opts) {
  const o = opts || {};
  const accounts = o.accounts || [];

  const bar = document.createElement('div');
  bar.className = 'nt-exp-bar';
  const label = document.createElement('label');
  label.className = 'nt-sync-hint';
  label.textContent = '只导入 ';
  const fromEl = document.createElement('input');
  fromEl.type = 'date';
  fromEl.className = 'nt-input nt-input-sm';
  label.appendChild(fromEl);
  bar.appendChild(label);

  // 「我的账户」兜底：账单里认不出支付方式时用（招行整份账单都没有支付方式列）
  const myWrap = document.createElement('label');
  myWrap.className = 'nt-sync-hint';
  myWrap.textContent = '我的账户 ';
  const mySel = document.createElement('select');
  mySel.className = 'nt-input nt-input-sm';
  const none = document.createElement('option');
  none.value = '';
  none.textContent = '（不指定）';
  mySel.appendChild(none);
  // 只列真实账户：期初余额（isHidden）不是「我的账户」，列进来会被误选
  const picks = accounts.filter((a) => a && !a.isHidden && a.id !== '__OPENING__');
  for (const acc of picks) {
    const opt = document.createElement('option');
    opt.value = acc.id;
    opt.textContent = (acc.code ? acc.code + ' · ' : '') + (acc.name || '');
    mySel.appendChild(opt);
  }
  // 默认「我的账户」：先按账单来源猜（微信→微信钱包、支付宝→支付宝余额），
  // 猜不到退到第一个资产类账户。招行用表头里的卡号尾号。
  const guessDefault = () => {
    const pid = result.presetId;
    const re = pid === 'wechat' ? /微信|零钱/ : pid === 'alipay' ? /支付宝|余额/ : null;
    if (re) {
      const hit = picks.find((a) => re.test(String(a.name || '')));
      if (hit) return hit;
    }
    return picks.find((a) => a.type === '资产类') || null;
  };
  const def = guessDefault();
  if (def) mySel.value = def.id;
  const tail = result.hints && result.hints.cardTail;
  if (tail) {
    const hit = picks.find((a) => String(a.name || '').includes(tail));
    if (hit) mySel.value = hit.id;
  }
  myWrap.appendChild(mySel);
  bar.appendChild(myWrap);
  body.appendChild(bar);

  const stats = document.createElement('p');
  stats.className = 'nt-sync-hint';
  body.appendChild(stats);

  const refresh = () => {
    const from = fromEl.value || '';
    const myAccountId = mySel.value || '';
    const plan = planBillImport(result.items, {
      accounts,
      from,
      presetId: result.presetId,
      myAccountId,
    });
    const s = plan.stats;
    stats.textContent = `共 ${s.total} 笔`
      + (from ? `，起始日之后 ${s.kept} 笔（早于它跳过 ${s.before} 笔）` : `，可导入 ${s.kept} 笔`)
      + `　支出 ${s.sumOut ? money(s.sumOut) : '0.00'} / 收入 ${s.sumIn ? money(s.sumIn) : '0.00'}`
      + (s.neutral ? `　中性交易 ${s.neutral} 笔跳过` : '')
      + (s.willCreate ? `　将按分类新建 ${s.willCreate} 个节点` : '');
    result.fromDate = from;
    result.myAccountId = myAccountId;
    return plan;
  };

  fromEl.addEventListener('change', refresh);
  mySel.addEventListener('change', refresh);
  // 入口弹窗里已经填过起始日期就带过来；没填就留空 = 全导
  if (o.defaultFrom) fromEl.value = o.defaultFrom;
  refresh();

  return () => fromEl.value || '';
}
