// 界面：（无界面）账单账户匹配：支付方式 → 我的账户，商户/分类 → 对方账户
/**
 * 账单账户匹配（Bill Match）
 * 层：第一层 · core
 *
 * 三家账单都是**单边**记录（我付了 XX），要变成一笔两端的流水，需要两次匹配：
 *   ① 支付方式 / 卡号 → 「我的账户」（资产类，若是花呗一类则是负债类）
 *   ② 交易对方 / 商品 / 交易分类 → 「对方账户」（支出=费用类，收入=收入类）
 *
 * 匹配顺序（命中即停）：
 *   记住的规则 → 完整名字 / 简码 → 数字尾号 → 银行全名→简称 → 支付方式别名
 *   商户词表 → 交易分类 → 账户名包含
 *
 * 全部是纯函数：accounts / rules 由调用方传进来，不读全局。
 */

/** 支付方式的常见叫法 → 账本里可能的账户名（账单写「零钱」，账本叫「微信钱包」） */
export const PAY_ALIAS_MAP = [
  ['零钱通', ['零钱通', '微信钱包', '微信零钱']],
  ['零钱', ['微信钱包', '微信零钱', '零钱']],
  ['余额宝', ['余额宝', '支付宝余额']],
  ['余额', ['支付宝余额', '余额']],
  ['花呗', ['花呗', '支付宝花呗']],
  ['借呗', ['借呗', '支付宝借呗']],
  ['白条', ['白条', '京东白条']],
  ['信用卡', ['信用卡']],
];

/** 银行全名 → 常用简称（招商银行储蓄卡(7912) → 招行储） */
export const BANK_ALIASES = [
  ['招商银行', '招行'], ['工商银行', '工行'], ['建设银行', '建行'], ['农业银行', '农行'],
  ['交通银行', '交行'], ['中国银行', '中行'], ['中信银行', '中信'], ['广发银行', '广发'],
  ['浦发银行', '浦发'], ['民生银行', '民生'], ['兴业银行', '兴业'], ['光大银行', '光大'],
  ['平安银行', '平安'], ['邮政储蓄', '邮储'], ['邮储银行', '邮储'], ['华夏银行', '华夏'],
];

/** 商户名/商品说明 → 常见支出账户。越具体的放越上面（地铁 先于 交通） */
export const MERCHANT_HINTS = [
  [/地铁|轻轨|轨道交通/, ['地铁', '交通', '公交']],
  [/铁路|12306|高铁|火车票/, ['火车', '铁路', '交通']],
  [/公交|巴士/, ['公交', '交通']],
  [/打车|滴滴|出租|哈啰|单车|骑行/, ['打车', '交通', '单车']],
  [/加油|停车|高速|油费/, ['加油', '停车', '交通']],
  [/馒头|包子|早点|早餐|豆浆|油条|稀饭/, ['早点', '早餐', '餐饮']],
  [/面馆|面店|面条|拉面|粉店|米粉/, ['面', '餐饮', '早点']],
  [/糕点|面包|蛋糕|烘焙|西点/, ['糕点', '面包', '餐饮']],
  [/餐饮|小吃|饭店|餐厅|火锅|烧烤|快餐|外卖|食堂/, ['餐饮', '快餐']],
  [/超市|便利店|百货|生鲜|菜市场|农贸/, ['超市', '日用', '购物']],
  [/零食|水果|奶茶|咖啡|饮品/, ['零食', '水果', '奶茶', '日用']],
  [/药|医院|诊所|体检|口腔/, ['医疗', '药']],
  [/话费|流量|电信|移动|联通|宽带/, ['话费', '通讯']],
  [/保险/, ['保险']],
  [/网盘|会员|软件|订阅|深度求索|AI/i, ['会员', '软件', '订阅']],
  [/电费|水费|燃气|物业|取暖/, ['水电', '物业', '生活']],
  [/电影|影院|娱乐|旅游|酒店|景区/, ['娱乐', '旅游']],
  [/快递|邮费|物流/, ['快递', '物流']],
  [/还款|分期|信用卡|花呗|借呗/, ['还款', '信用卡']],
];

/** 账单自带的「交易分类」→ 账户名关键词（比商户名稳，商户名千奇百怪） */
export const CATEGORY_HINTS = [
  [/交通/, ['地铁', '交通', '公交', '打车']],
  [/餐饮|美食/, ['餐饮', '快餐', '早点']],
  [/日用|百货/, ['超市', '日用', '购物']],
  [/保险/, ['保险']],
  [/文化|休闲|娱乐/, ['娱乐', '电影']],
  [/信用|借还|还款/, ['还款', '信用卡']],
  [/充值|缴费/, ['话费', '水电', '缴费']],
  [/投资|理财/, ['理财', '投资']],
  [/医疗|健康/, ['医疗', '药']],
  [/美容|美发/, ['美发', '理发']],
  [/酒店|旅游/, ['旅游', '酒店']],
  [/转账|红包/, ['转账', '红包']],
  [/商户消费/, ['餐饮', '日用']],
];

const norm = (v) => String(v == null ? '' : v).trim();

/** 账户名的宽松比较：去掉空白与括号里的说明 */
function nameKey(name) {
  return norm(name).replace(/\s+/g, '').toLowerCase();
}

/** 简码 → 全名 → 数字尾号 → 名字互相包含（取最长） */
export function matchAccountText(accounts, text) {
  const t = norm(text);
  if (!t) return null;
  const list = (accounts || []).filter((a) => a && norm(a.name));
  const up = t.toUpperCase();

  let hit = list.find((a) => norm(a.code).toUpperCase() === up);
  if (hit) return hit;
  hit = list.find((a) => norm(a.name) === t);
  if (hit) return hit;

  const nums = t.match(/\d{3,}/g);
  if (nums) {
    for (const n of nums) {
      hit = list.find((a) => norm(a.name).includes(n) || norm(a.code).includes(n));
      if (hit) return hit;
    }
  }

  const cands = list.filter((a) => {
    const nm = norm(a.name);
    if (nm.length < 2) return false;
    return t.includes(nm) || nm.includes(t);
  });
  if (cands.length) {
    return cands.sort((x, y) => norm(y.name).length - norm(x.name).length)[0];
  }
  return null;
}

/** 支付方式 → 我的账户 */
export function matchPayAccount(accounts, text) {
  const direct = matchAccountText(accounts, text);
  if (direct) return direct;

  const t = norm(text);
  const list = accounts || [];
  for (const [full, short] of BANK_ALIASES) {
    if (!t.includes(full)) continue;
    const acc = list.find((a) => norm(a.name).includes(short));
    if (acc) return acc;
  }
  for (const [kw, names] of PAY_ALIAS_MAP) {
    if (!t.includes(kw)) continue;
    for (const nm of names) {
      const acc = list.find((a) => nameKey(a.name) === nameKey(nm));
      if (acc) return acc;
    }
  }
  return null;
}

/** 记住的规则（商户关键词 → 账户名/简码） */
export function applyBillRules(accounts, rules, text) {
  const t = norm(text);
  if (!t) return null;
  for (const r of rules || []) {
    if (!r || !r.kw) continue;
    if (!t.includes(String(r.kw))) continue;
    const acc = matchAccountText(accounts, r.code) || matchAccountText(accounts, r.name);
    if (acc) return acc;
  }
  return null;
}

/**
 * 商户 / 商品说明 / 交易分类 → 对方账户。
 *
 * 顺序：记住的规则 → 商户词表 → 账单分类（商户名太短时不用分类，
 * 否则「张三 + 分类=交通」会把个人转账误配到「地铁」）→ 账户名包含。
 */
export function matchMerchantAccount(accounts, rules, party, item, cat) {
  const text = (norm(party) + ' ' + norm(item)).trim();
  const category = norm(cat);
  if (!text && !category) return null;

  const byRule = applyBillRules(accounts, rules, text);
  if (byRule) return byRule;

  const list = accounts || [];
  for (const [re, names] of MERCHANT_HINTS) {
    if (!re.test(text)) continue;
    for (const nm of names) {
      const acc = list.find((a) => norm(a.name).includes(nm));
      if (acc) return acc;
    }
  }

  if (norm(party).length > 3) {
    for (const [re, names] of CATEGORY_HINTS) {
      if (!re.test(category)) continue;
      for (const nm of names) {
        const acc = list.find((a) => norm(a.name).includes(nm));
        if (acc) return acc;
      }
    }
  }

  return list.find((a) => {
    const nm = norm(a.name);
    return nm.length >= 2 && text.includes(nm);
  }) || null;
}

/**
 * 匹配不到时，「我的账户」该叫什么、属于哪一类。
 * 花呗/借呗/白条/信用卡是负债，其余支付方式按资产（零钱、储蓄卡、余额）。
 */
export function suggestMyAccount(method) {
  const m = norm(method);
  if (!m || m === '/') return null;
  const liab = /花呗|借呗|白条|信用卡|分期/.test(m);
  return {
    name: m.slice(0, 20),
    type: liab ? '负债类' : '资产类',
    category: liab ? '信用' : '储蓄',
  };
}

/**
 * 匹配不到时，对方节点该叫什么、属于哪一类（给调用方建账户用）。
 *
 * 六大核心元素里的「节点名 / 统计分类 / 会计类型」三个都在这一个建议里。
 * 名字来源按账单类型分三种：
 *   · 支付宝：用「交易分类」（交通出行 / 日用百货…）。细、可控，商户名进备注关键字；
 *   · 招行：用「交易摘要」（快捷支付 / 银联代收 / 汇入汇款…）。它没有分类列，
 *     而对手信息有几百个不同商户，按商户建会把节点表撑爆；
 *   · 微信：用「交易对方」。它的交易类型只有「商户消费 / 转账」两三种，太粗。
 *
 * @param {string} prefer ''|'category'|'item'
 * @returns {{name:string, type:string, category:string, keyword:string}}
 */
export function suggestOtherAccount(party, item, cat, dir, prefer) {
  const category = norm(cat);
  const p = norm(party);
  const it = norm(item);
  const fallback = norm(item).slice(0, 12);
  let name = p || category || fallback || '未分类';
  if (prefer === 'category' && category) name = category;
  if (prefer === 'item' && it) name = it;
  return {
    name,
    type: dir === 'in' ? '收入类' : '费用类',
    category: category || (prefer === 'item' ? it : ''),
    keyword: p,
  };
}
