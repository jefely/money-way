// 核心：关键字词表（**有序 + 分区**：越靠前越能精确具象对象）
/**
 * 关键字词表
 * 层：第一层 · core
 *
 * 用户 2026-11-08：
 *   「分区域，用于快速定位，从哪张表开始，提高效率。」
 *   「多区域允许同时叠加，最重要的前两个中间用冒号链接，后边的用逗号链接。」
 *   「商品名在前，归属人在后 / 商户在前，人名在后 / 项目类型在前，人名在后。」
 *
 *   衣服：姜           （商品在前，归属人在后）
 *   重疾：姜，阳光人寿  （项目类型在前，人名在后，其余用逗号）
 *
 * 写法：不用引号，中文逗号隔开；`#` 开头的行是分区标题。
 * 查表顺序 = 区序：商品 → 商户 → 人名 → 场景 → 泛类。
 */

const RAW = `
# 商品
竖笛，笛子，内裤，流量卡，耳机，充电器，数据线，键盘，鼠标，雨伞，水杯，背包，鞋子，袜子，
毛巾，纸巾，洗发水，牙膏，洗衣液，口罩，电池，灯泡，锅，碗，杯子，手机壳，钢化膜，行李箱，被套，
衣服，上衣，外套，裤子，裙子，帽子，围巾，手套，
重疾，长期医疗，百万医疗，医疗险，意外险，寿险，年金，好医保，少儿险，车险，住院医疗，门诊险，

# 商户
昆明地铁，味丰源，嘉华，天秀小吃，杨万启，好再来，河豚鲜生，零食很能嗨，百度网盘，
深度求索，铁路12306，阳光人寿，中国人民健康，中国人寿，中国电信，中国移动，中国联通，哈啰，米川，云南来也，

# 人名
润，琼，锋，霞，姜，敏，静，娟，磊，勇，强，刚，涛，鹏，宇，琳，雪，梅，兰，芳，

# 场景
地铁，公交，轻轨，高铁，火车票，动车，机票，打车，网约车，共享单车，助力车，停车费，加油，过路费，高速费，
外卖，咖啡，奶茶，早餐，午餐，晚餐，快餐，米线，面条，拉面，火锅，烧烤，小吃，面馆，食堂，
糕点，面包，蛋糕，饼干，零食，水果，蔬菜，生鲜，早点，夜宵，
超市，便利店，
话费，宽带，流量，电费，水费，燃气，物业，取暖，
电影，游戏，会员，网盘，软件，订阅，健身，理发，美容，按摩，洗车，快递，
体检，挂号，药，口腔，牙科，

# 泛类
交通，餐饮，购物，消费，充值，服务
`;

/** 分区解析：`# 商品` 开头的行是标题，后面直到下一个标题都是这个词区的词 */
function parseZones(raw) {
  const zones = [];
  let cur = null;
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('#')) {
      cur = { key: t.replace(/^#+\s*/, ''), words: [] };
      zones.push(cur);
      continue;
    }
    if (!cur) { cur = { key: '其他', words: [] }; zones.push(cur); }
    for (const w of t.split(/[，,\s]+/)) if (w) cur.words.push(w);
  }
  return zones;
}

const ZONES = parseZones(RAW);
export const KEYWORD_DICT = ZONES.flatMap((z) => z.words);

/** 泛类词：它们几乎什么都命中，**不能单独当关键字**（写进备注等于没写） */
const GENERIC_SET = new Set(['交通', '餐饮', '购物', '消费', '充值', '服务']);
const PERSON_ZONE = '人名';

/**
 * 商品说明里命中的词（有序：对象 → 人名 → 其余对象）。
 *
 * 排序规则来自用户的例子：**对象在前，人名在后**，其余按区序跟在后面。
 *   `衣服` + `姜`            → ['衣服', '姜']
 *   `重疾` + `姜` + `阳光人寿` → ['重疾', '姜', '阳光人寿']
 *
 * 两条自定规则：
 *   · 命中的词如果共享字符（竖笛 / 笛子、流量卡 / 流量），只留靠前的那个；
 *   · 只命中泛类词时返回空 —— 这种词区分不了任何流水。
 */
export function dictHits(text) {
  const t = String(text == null ? '' : text);
  if (!t) return [];
  const objs = [];
  const persons = [];
  for (const z of ZONES) {
    for (const w of z.words) {
      if (!t.includes(w)) continue;
      const pool = z.key === PERSON_ZONE ? persons : objs;
      if (pool.some((h) => [...h].some((ch) => w.includes(ch)))) continue;
      if (objs.some((h) => [...h].some((ch) => w.includes(ch)))) continue;
      pool.push(w);
      if (objs.length + persons.length >= 5) break;
    }
  }
  if (!objs.length && !persons.length) return [];
  const concrete = objs.filter((w) => !GENERIC_SET.has(w));
  // 只有泛类词命中的，视为「没有可用的特殊标签」
  if (!concrete.length && !persons.length) return [];

  const out = [];
  if (concrete.length) out.push(concrete[0]);
  out.push(...persons.slice(0, 2));
  out.push(...concrete.slice(1, 3));
  return out.slice(0, 4);
}

/**
 * 组合成备注串：**最重要的前两个用冒号，后面的用逗号**。
 *   ['衣服','姜']            → 衣服：姜
 *   ['重疾','姜','阳光人寿']  → 重疾：姜，阳光人寿
 */
export function formatTags(tags) {
  const list = (tags || []).filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  return list[0] + '：' + list.slice(1).join('，');
}
