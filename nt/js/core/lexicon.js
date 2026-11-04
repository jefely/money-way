// 界面：（无界面）渐进式记账词库
/**
 * 扁平词库：{keyword, accountName, type, category, role}
 * 层：第一层 · 数据基座
 *
 * role：
 *   payment  精确命中才预填「资产类 / 网络账户」（微信、支付宝）
 *   asset    账户本名，类型资产类，分类用词条自己的（现金不是网络账户）
 *   liability / income  同样是账户本名，不是分类别名
 *   note     只进备注。饮品、餐饮这类分类名不建账户
 *
 * 模糊命中只建议，不在这里决定。不新增第 7 种账户类型。
 */

function pay(text, accountName) {
  return text.split(/\s+/).filter(Boolean).map((keyword) => ({
    keyword,
    accountName: accountName || keyword,
    type: '资产类',
    category: '网络账户',
    role: 'payment',
  }));
}

function named(role, type, category, text) {
  return text.split(/\s+/).filter(Boolean).map((keyword) => ({
    keyword, accountName: keyword, type, category, role,
  }));
}

function notes(category, text) {
  return text.split(/\s+/).filter(Boolean).map((keyword) => ({
    keyword, accountName: '', type: '费用类', category, role: 'note',
  }));
}

const ROWS = [
  ...pay('微信 微信支付 微信钱包 零钱', '微信'),
  ...pay('支付宝 支付宝余额 余额宝', '支付宝'),
  ...pay('云闪付'),
  ...pay('QQ钱包'),
  ...pay('数字人民币'),
  ...named('asset', '资产类', '现金', '现金'),
  ...named('asset', '资产类', '储蓄', '银行卡 储蓄卡 借记卡'),
  ...named('asset', '资产类', '公积金', '公积金'),
  ...named('asset', '资产类', '投资', '股票 基金'),
  ...named('liability', '负债类', '信用', '花呗 白条 京东白条 借呗 微粒贷'),
  ...named('liability', '负债类', '信用卡', '信用卡'),
  ...named('liability', '负债类', '贷款', '房贷 车贷'),
  ...named('income', '收入类', '职业收入', '工资 薪资 薪水 奖金 年终奖 兼职 外快'),
  ...named('income', '收入类', '红包', '红包'),
  ...named('income', '收入类', '退款报销', '报销 退款'),
  ...named('income', '收入类', '投资', '投资收益 理财收益 股息'),
  ...named('income', '收入类', '租金', '租金'),
  ...notes('餐饮', '餐饮 吃饭 早饭 午饭 晚饭 早餐 午餐 晚餐 外卖 咖啡 奶茶 饮品 星巴克 瑞幸 星巴克咖啡 瑞幸咖啡 零食 水果 买菜 聚餐 夜宵 甜品 火锅 烧烤 麦当劳 肯德基 必胜客 美团 饿了么'),
  ...notes('交通', '交通 公交 地铁 打车 滴滴 高德 加油 充电 停车 高速 高铁 机票 火车 出租 出租车 网约车 单车 共享单车 过路费 油费 停车费 公交地铁'),
  ...notes('居住', '居住 房租 房东 水电 电费 水费 燃气 物业 日用 家政 维修 家具 房租费 物业费 水电燃气 日用百货'),
  ...notes('购物', '购物 淘宝 天猫 京东 拼多多 服饰 衣服 鞋子 数码 美妆 家居 宠物 网购 超市 日用品'),
  ...notes('娱乐', '娱乐 电影 游戏 旅行 旅游 健身 会员 订阅 演出'),
  ...notes('医疗', '医疗 药品 医院 门诊 体检 保险 牙科 挂号'),
  ...notes('教育', '教育 书籍 课程 考试 学费 培训 文具'),
  ...notes('人情', '人情 礼物 请客 孝敬 婚礼 随礼'),
  ...notes('其他', '费用 通讯 话费 网费 烟 酒 快递 理发 美容 捐赠 税费 罚款 手续费 咖啡豆 奶茶店'),
];

const seen = new Set();
/** @type {Array<{keyword:string,accountName:string,type:string,category:string,role:string}>} */
export const LEXICON = [];
for (const row of ROWS) {
  if (!row.keyword || seen.has(row.keyword)) continue;
  seen.add(row.keyword);
  LEXICON.push(row);
}

/** 会变成账户的词（备注类不算） */
export function accountLexicon(list = LEXICON) {
  return (list || []).filter((row) => row && row.role && row.role !== 'note');
}
