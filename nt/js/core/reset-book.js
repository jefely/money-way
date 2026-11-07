// 界面：（无界面）重置账户但保留流水
/**
 * 重置账户（保留流水 / 计划）
 * 层：第一层 · 数据基座
 *
 * 账户表换回内置的三户。同名账户的流水 id 会改挂到新 id 上，
 * 对不上名字的仍留在流水里，校验页会报断链。
 */

import { createAccount, OPENING_ACCOUNT } from './schema.js';
import { createState } from './state-store.js';

/**
 * 默认节点模板：沿用单文件版 `personal/index.html` 的 `ACC_RAW`
 * （用户 2026-11 指定）。[类型, 统计分类, 简码, 名称]，期初一律 0。
 */
const RAW = [
  ['资产类', '储蓄', 'ZHC', '招行储'], ['资产类', '储蓄', 'JHC', '交行储'], ['资产类', '储蓄', 'GHC', '工行储'],
  ['资产类', '储蓄', 'NHC', '农行储'], ['资产类', '储蓄', 'XYC', '信用储'], ['资产类', '储蓄', 'ZGC', '中国储'],
  ['资产类', '现金', 'XJ', '现金'],
  ['资产类', '网账', 'ZFB', '支付宝余额'], ['资产类', '网账', 'WX', '微信钱包'],
  ['资产类', '充值', 'FK', '饭卡'],
  ['资产类', '应收', 'QYS', '其它应收'],

  ['负债类', '信用', 'ZHX', '招行信'], ['负债类', '信用', 'JHX', '交行信1'], ['负债类', '信用', 'GFX', '广发信'],
  ['负债类', '信用', 'ZXX', '中信信'], ['负债类', '信用', 'JHX2', '交行信2'],
  ['负债类', '网贷', 'DY', '抖音月付'], ['负债类', '网贷', 'MT', '美团月付'],
  ['负债类', '应付', 'QYF', '其它应付'],

  ['收入类', '工资', 'GZ', '工资'], ['收入类', '外快', 'LG', '临工'],

  ['权益类', '结转', 'SRZ', '收入汇总'], ['权益类', '投资', 'SSZ', '实收资本'],

  ['费用类', '日常', 'S', '水'], ['费用类', '日常', 'ZC', '早餐'], ['费用类', '日常', 'KC', '快餐'],
  ['费用类', '日常', 'SG', '水果'], ['费用类', '日常', 'LS', '零食'], ['费用类', '日常', 'GD', '糕点'],
  ['费用类', '日常', 'HF', '话费'], ['费用类', '日常', 'LF', '理发'], ['费用类', '日常', 'RYP', '日用品'],
  ['费用类', '日常', 'KD', '快递费'],

  ['费用类', '生活', 'MC', '买菜'], ['费用类', '生活', 'DC', '点餐'], ['费用类', '生活', 'FZ', '房租'],
  ['费用类', '生活', 'SDF', '水电费'], ['费用类', '生活', 'WXF', '维修费'],

  ['费用类', '保健', 'YP', '药品'], ['费用类', '保健', 'ZL', '治疗'], ['费用类', '保健', 'JK', '健康'],

  ['费用类', '通勤', 'DT', '地铁'], ['费用类', '通勤', 'GXC', '共享车'], ['费用类', '通勤', 'GJ', '公交'],
  ['费用类', '通勤', 'CZC', '出租车'],

  ['费用类', '出行', 'QC', '汽车'], ['费用类', '出行', 'HC', '火车'], ['费用类', '出行', 'FJ', '飞机'],
  ['费用类', '出行', 'JY', '加油'], ['费用类', '出行', 'GLF', '过路费'], ['费用类', '出行', 'TCF', '停车费'],

  ['费用类', '服饰', 'YF', '衣服'], ['费用类', '服饰', 'KZ', '裤子'], ['费用类', '服饰', 'XZ', '鞋子'],
  ['费用类', '服饰', 'SP', '饰品'],

  ['费用类', '休闲', 'LY', '旅游'], ['费用类', '休闲', 'WJ', '玩具'], ['费用类', '休闲', 'JS', '健身'],
  ['费用类', '休闲', 'YX', '游戏'], ['费用类', '休闲', 'YY', '影音'], ['费用类', '休闲', 'CP', '彩票'],

  ['费用类', '学习', 'SJ', '书籍'], ['费用类', '学习', 'JC', '教程'],

  ['费用类', '应酬', 'ZK', '做客'], ['费用类', '应酬', 'SL', '送礼'], ['费用类', '应酬', 'QK', '请客'],

  ['费用类', '公益', 'JZ', '捐赠'], ['费用类', '公益', 'BX', '保险'],

  ['费用类', '损失', 'PC', '赔偿'], ['费用类', '损失', 'FD', '罚单'], ['费用类', '损失', 'YS', '遗失'],
  ['费用类', '损失', 'SXF', '手续费'], ['费用类', '损失', 'QZC', '其它支出'],
];

export const SEED_ACCOUNTS = RAW.map(([type, category, code, name]) => ({
  id: 'acc_' + code.toLowerCase(),
  code,
  name,
  type,
  category,
}));

export function resetAccountsKeepData(state) {
  const src = state || {};
  const seeds = SEED_ACCOUNTS.map((s) => createAccount(s));
  const byName = new Map(seeds.map((a) => [a.name, a.id]));
  const idMap = new Map();
  for (const a of src.accounts || []) {
    if (a && a.name && byName.has(a.name)) idMap.set(a.id, byName.get(a.name));
  }
  const mapId = (id) => (id && idMap.has(id) ? idMap.get(id) : id);
  const remap = (row) => {
    if (!row) return row;
    return { ...row, from_id: mapId(row.from_id), to_id: mapId(row.to_id) };
  };
  return {
    ...src,
    accounts: [{ ...OPENING_ACCOUNT }, ...seeds],
    // 期初属于「节点配置」，不属于流水：重置节点模板必须把期初流水一起清掉，
    // 否则账户换了、期初余额还挂在旧账户上（用户 2026-11 报「期初不会被清空」）。
    transactions: (src.transactions || []).filter((t) => !t.opening).map(remap),
    scheduled: (src.scheduled || []).map(remap),
    deletedAccounts: [],
  };
}

/**
 * 重置整本账：用户数据、节点配置（含期初）、界面参数全部回到新建账本的状态。
 * 密码/保险库不动 —— 那是 browser/db.js 的事，这里只换 state。
 */
export function resetBookState() {
  const fresh = createState();
  const seeds = SEED_ACCOUNTS.map((s) => createAccount(s));
  return {
    ...fresh,
    accounts: [{ ...OPENING_ACCOUNT }, ...seeds],
  };
}
