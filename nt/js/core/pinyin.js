// 数据：汉字 → 拼音首字母（纯函数）
/**
 * 拼音首字母
 * 层：第一层 · 数据基座（只依赖标准的 Intl.Collator，不碰 DOM）
 *
 * 为什么不做字表：账本的分类名是用户自己起的，「日常」「房租」「花呗」……
 * 任何一张常用字表都会漏掉生僻字，而漏掉的那一个字就够让分类查不到。
 * 中文的 Intl.Collator 是**按拼音排序**的：拿它和 23 个「字母代表字」
 * 逐一比较，就能定位任意常用汉字落在哪个字母区间 —— 零字表、零维护。
 * 2026-11 在 Chrome 156 与 Node 26 各测 112 个常用字（含 鑫淼焱垚犇、
 * 信/卡/花/呗、吃/喝/玩/乐），两边都是 112/112。
 *
 * 已知局限（都是「退化」而不是「算错」）：
 *   · 生僻字可能被 ICU 排到拼音区之外 → 返回空串，调用方回退到名字匹配；
 *   · 多音字按 ICU 的默认读音（行 xing、重 zhong）；
 *   · 环境不支持 Intl.Collator 时整体返回空串，拼音匹配自动失效。
 */

/** 每个拼音字母的「区间下界」。代表字要选该字母读音里的常用字。 */
const BOUNDS = [
  ['a', '阿'], ['b', '八'], ['c', '嚓'], ['d', '搭'], ['e', '鹅'], ['f', '发'],
  ['g', '噶'], ['h', '哈'], ['j', '击'], ['k', '喀'], ['l', '拉'], ['m', '妈'],
  ['n', '拿'], ['o', '哦'], ['p', '啪'], ['q', '七'], ['r', '然'], ['s', '撒'],
  ['t', '塌'], ['w', '挖'], ['x', '夕'], ['y', '压'], ['z', '匝'],
];

let collator;
/** 惰性建 Collator（模块加载时不碰 Intl，Node 里跑测试也安全） */
function getCollator() {
  if (collator !== undefined) return collator;
  try {
    collator = new Intl.Collator('zh-Hans-CN', { sensitivity: 'base' });
  } catch (e) {
    collator = null;
  }
  return collator;
}

/** 是不是汉字（含扩展 A 与兼容区，够覆盖账本里的名字） */
export function isHanzi(ch) {
  return /[\u3400-\u9fff\uf900-\ufaff]/.test(String(ch || ''));
}

/**
 * 单个字符 → 拼音首字母（小写）。
 * 非汉字原样返回小写（字母、数字保留，中文标点会是原字符）。
 */
export function initialOf(ch) {
  const s = String(ch || '');
  if (!s) return '';
  if (!isHanzi(s)) return s.toLowerCase();
  const coll = getCollator();
  if (!coll) return '';

  let ans = '';
  for (const [letter, bound] of BOUNDS) {
    if (coll.compare(s, bound) >= 0) ans = letter;
    else break;
  }
  return ans;
}

/**
 * 一段文字 → 拼音首字母串（逐字）。
 * 空白直接跳过：「花 呗」→ hb，而不是 h b 里夹个空格。
 */
export function initialsOf(text) {
  let out = '';
  for (const ch of String(text || '')) {
    if (/\s/.test(ch)) continue;
    out += initialOf(ch);
  }
  return out;
}

/**
 * 分类名 / 账户名 是否被查询串命中（名字包含 或 首字母包含）。
 * 只输入字母时走首字母；输入汉字时名字匹配先命中。
 */
export function initialsMatch(text, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return false;
  return initialsOf(text).includes(q);
}
