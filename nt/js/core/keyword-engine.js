// 核心：关键字引擎（把一条流水压成手机上看得下的短串）
/**
 * 关键字引擎
 * 层：第一层 · core
 *
 * 用户 2026-11-08 定的三层密度：
 *
 *   ① 原文（账单导进来的长备注，一个字不丢）
 *   ② `路径：关键字，YYMMDDHHMM，账户简码`
 *   ③ `关键字，YYMMDDHHMM`            ← 手机上只剩这一行
 *
 * 压缩规则（全部来自用户给的 12 个实例）：
 *   · 时间：2026-08-08 13:17 → 2608081317（YYMMDDHHMM）
 *   · 账户：用简码（招商银行储蓄卡(7912) → 招行储7912）
 *   · 路径：对方节点沿 parentId 向上，名字用「：」连（出行：共享车）
 *   · 关键字：别名表命中就用短名（丙怀餐饮 → 丙怀），否则用备注关键字原文
 *
 * 纯函数：不读写 state、不碰 DOM。原文永远保留，短串只是显示层。
 */

import { aliasGet } from './alias-table.js';
import { dictHits } from './keyword-dict.js';

const norm = (v) => String(v == null ? '' : v).trim();

/** 一段时间的压缩写法：2026-08-08 + 13:17 → 2608081317 */
export function compactTime(date, time) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(norm(date));
  if (!m) return norm(date).replace(/-/g, '');
  const hm = /(\d{1,2}):(\d{2})/.exec(norm(time));
  const hh = hm ? String(hm[1]).padStart(2, '0') : '00';
  const mm = hm ? hm[2] : '00';
  return m[2] + m[3] + hh + mm;          // MM DD HH MM
  // 年份只留两位：yy 在调用处拼，见 shortNote（这里返回 MMDDHHMM）
}

/** 完整时间戳：2608081317（yyMMddHHmm） */
export function stamp(date, time) {
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(norm(date));
  const rest = compactTime(date, time);
  if (!d) return rest;
  return d[1].slice(2) + rest;
}

/** 从备注里抠时间（HH:MM），没有就空 */
export function timeIn(note) {
  const m = /(\d{1,2}):(\d{2})/.exec(norm(note));
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
}

/** id → account */
function indexOf(accounts) {
  const map = new Map();
  for (const a of accounts || []) if (a && a.id) map.set(a.id, a);
  return map;
}

/**
 * 关键字链（用户 2026-11-08 的升级规则）：
 *
 *   自己**总是**出现在链里（最深层）；
 *   往上走，祖先只要还是「未定型的节点」（`type` 为空 = U 区，没被升级）
 *   就继续用「：」串进来；碰到一个**已定型**的祖先就停 —— 它已经是正式节点，
 *   不再占用备注前缀。
 *
 *   餐饮（U 区）+ 丙怀（U 区）      → 餐饮：丙怀
 *   餐饮（U 区）+ 丙怀（费用类）     → 餐饮：丙怀
 *   餐饮（费用类）+ 丙怀（费用类）   → 丙怀
 */
export function keywordChain(accounts, acc, aliases) {
  if (!acc) return '';
  const map = indexOf(accounts);
  const names = [shortKey(norm(acc.name), aliases)].filter(Boolean);
  let cur = acc;
  for (let i = 0; i < 20; i += 1) {
    const up = cur && cur.parentId ? map.get(String(cur.parentId)) : null;
    if (!up) break;
    if (norm(up.type) && up.fresh !== true) break;   // 已升级成正式节点 → 不再进链
    names.unshift(shortKey(norm(up.name), aliases));
    cur = up;
  }
  return names.join('：');
}

/** 省级前缀（去不掉就会把「云南嘉华」当成整个名字） */
const PROVINCES = [
  '北京', '上海', '天津', '重庆', '河北', '山西', '辽宁', '吉林', '黑龙江', '江苏', '浙江',
  '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南', '广东', '海南', '四川', '贵州',
  '云南', '陕西', '甘肃', '青海', '内蒙古', '广西', '西藏', '宁夏', '新疆',
];

/** 组织形式 / 行业后缀（长的先删，删到没有为止） */
const SUFFIXES = [
  '有限责任公司', '股份有限公司', '有限公司', '公司',
  '个体工商户', '个体户', '经营部', '商行', '门店', '服务店', '便利店',
  '餐饮店', '食品店', '店',
  '餐饮', '食品', '美食', '服务', '运营', '科技', '网络', '信息', '技术', '贸易', '商贸', '超市',
];

/** 商品说明里每笔都长的通用词：它们区分不了流水，不该进关键字 */
const ITEM_NOISE = /保费|缴清|承保|投保|续保|大病版|健康福|缴费|支付|收款|消费|充值|订单|商品|服务|业务|扣款|退款|元|日用品|餐饮|购物|交通|娱乐|医疗|服饰|食品|饮料|水果|蔬菜/;

/**
 * 商品说明 → 能区分流水的短标签（用户 2026-11-08：最多两个）。
 *
 *   **优先查有序词表**（`keyword-dict.js`）：词表按特例性排序，靠前的更具体，
 *   命中就按词表顺序收，最多两个 ——「天鹅…竖笛…笛子」命中的是「竖笛」。
 *
 *   词表完全没命中时，才退回切分规则：
 *   `2026.7月28日保费缴清-健康福·重疾1号(大病版)-**润` → 润，重疾
 */
export function itemTags(text) {
  const hit = dictHits(text);
  if (hit.length) return hit;
  return fallbackTags(text);
}

/** 词表没命中时的切分兜底：去日期/括号/遮蔽星号，按分隔符切开，取最后两个 */
function fallbackTags(text) {
  const t = String(text == null ? '' : text)
    .replace(/\d{4}[.\-/年]\d{1,2}[.\-/月]\d{1,2}日?/g, ' ')
    .replace(/[（(][^)）]*[)）]/g, ' ')
    .replace(/[*＊]+/g, ' ')
    .replace(/\d+/g, ' ');
  const parts = t.split(/[-－—·、,，。;；:：/\s]+/).map((s) => s.trim()).filter(Boolean);
  const words = [];
  for (const p of parts) {
    if (ITEM_NOISE.test(p)) continue;
    const w = p.replace(/^(新|老)|(店|号|版)$/g, '').trim();
    if (!w || w.length > 4) continue;
    if (!/[\u4e00-\u9fa5]/.test(w)) continue;
    words.push(w);
  }
  return words.slice(-2).reverse();
}

/**
 * 「最特殊的字符」——从一条商户名里挑出最有辨识度的部分（用户 2026-11-08）：
 *
 *   盘龙区杨万启餐饮服务店   → 杨万启     （去行政区、去「餐饮服务店」）
 *   云南嘉华食品有限公司     → 嘉华       （去省名、去「食品有限公司」）
 *   丙怀餐饮                 → 丙怀
 *   盘龙区天秀小吃店         → 天秀小吃   （只去一个「店」）
 *
 * 规则是词表 + 行政区前缀，**不猜**：删到只剩 2 字以下就退回原名，
 * 宁可不缩，也不把名字缩成看不懂的东西。
 */
export function specialOf(name) {
  const raw = norm(name);
  let s = raw.replace(/[（(][^)）]*[)）]/g, '').trim();
  for (const p of PROVINCES) {
    if (s.startsWith(p)) { s = s.slice(p.length); break; }
  }
  s = s.replace(/^[\u4e00-\u9fa5]{1,4}?(?:市|区|县|镇|街道)/, '');
  let changed = true;
  while (changed) {
    changed = false;
    for (const suf of SUFFIXES) {
      if (s.length > suf.length && s.endsWith(suf)) { s = s.slice(0, -suf.length); changed = true; break; }
    }
  }
  return s.length >= 2 ? s : raw;
}

/** 短名：别名表命中就用它；否则从名字里挑最特殊的字符 */
export function shortKey(keyword, aliases) {
  const k = norm(keyword);
  if (!k) return '';
  return aliasGet(aliases, k) || specialOf(k);
}

/** 账户显示：优先简码，其次名字 */
function accountLabel(acc) {
  if (!acc) return '';
  return norm(acc.code) || norm(acc.name);
}

/**
 * 一条流水 → 第 ② 层短串：`路径：关键字，时间，账户`
 * @param {object} state
 * @param {object} tx
 * @param {{withAccount?:boolean, aliases?:Array}} [opts]
 */
export function shortNote(state, tx, opts) {
  const o = opts || {};
  const accounts = (state && state.accounts) || [];
  const aliases = o.aliases || (state && state.aliases) || [];
  const map = indexOf(accounts);

  const other = map.get(String(tx && tx.to_id)) || map.get(String(tx && tx.from_id)) || null;
  const mine = map.get(String(tx && tx.from_id)) || null;

  // 前缀 = 关键字链：自己总在，往上只收「还没升级」的祖先（见 keywordChain）
  const chain = keywordChain(accounts, other);
  const key = chain || shortKey((tx && tx.noteKeyword) || (other && other.name), aliases);
  const when = stamp(tx && tx.date, timeIn(tx && tx.note));

  const seg = [];
  if (key) seg.push(key);
  seg.push(when);
  if (o.withAccount !== false) {
    const acc = accountLabel(mine);
    if (acc) seg.push(acc);
  }
  return seg.filter(Boolean).join('，');
}

/** 第 ③ 层：只剩「关键字，时间」—— 手机上最挤的时候用 */
export function shortestNote(state, tx, opts) {
  const o = opts || {};
  const accounts = (state && state.accounts) || [];
  const aliases = o.aliases || (state && state.aliases) || [];
  const map = indexOf(accounts);
  const other = map.get(String(tx && tx.to_id)) || map.get(String(tx && tx.from_id)) || null;
  const key = shortKey(norm(other && other.name) || (tx && tx.noteKeyword), aliases);
  const when = stamp(tx && tx.date, timeIn(tx && tx.note));
  return [key, when].filter(Boolean).join('，');
}

/**
 * 备注栏实际显示的串：**按这条流水的对方节点有没有升级自动选**。
 *
 *   还没定型（U 区）→ 第 ② 层：`餐饮：丙怀，2608081317，交行储8380`
 *   已定型（有类型）→ 第 ③ 层：`丙怀，2608081317`
 *
 * 这正是用户说的「关键字1 升级成节点后，关键字2 就变成了 1」。
 * 备注栏里**只存这个短串，不再存原文**（用户 2026-11-08 明确）。
 *
 * @param {object} state
 * @param {object} tx 至少要有 date / note / noteKeyword / from_id / to_id
 * @param {{aliases?:Array, otherId?:string, time?:string}} [opts]
 *        otherId：明确指定「对方节点」（导入时用，避免收入方向取错）
 *        time：时间从 row.time 直接给（短串里没有 HH:MM 可抠）
 */
export function displayNote(state, tx, opts) {
  const o = opts || {};
  const accounts = (state && state.accounts) || [];
  const map = indexOf(accounts);
  const otherId = o.otherId != null && o.otherId !== ''
    ? String(o.otherId)
    : String((tx && tx.to_id) || (tx && tx.from_id) || '');
  const other = map.get(otherId) || null;
  const when = o.time != null ? o.time : timeIn(tx && tx.note);

  if (!other) {
    // 连对方节点都没有（缺一侧的草稿）：只留关键字 + 时间
    const aliases = o.aliases || (state && state.aliases) || [];
    const key = shortKey((tx && tx.noteKeyword) || '', aliases);
    return [key, stamp(tx && tx.date, when)].filter(Boolean).join('，');
  }
  // 「已升级」= 有类型、并且不是导入时自动建的临时节点（fresh）
  if (norm(other.type) && other.fresh !== true) {
    const aliases = o.aliases || (state && state.aliases) || [];
    const key = shortKey(norm(other.name) || (tx && tx.noteKeyword), aliases);
    return [key, stamp(tx && tx.date, when)].filter(Boolean).join('，');
  }
  return shortNote(state, { ...tx, to_id: other.id, from_id: (tx && tx.from_id) || '' }, {
    ...o,
    aliases: o.aliases || (state && state.aliases) || [],
  });
}
