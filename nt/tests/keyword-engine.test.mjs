/**
 * 关键字引擎：把一条流水压成手机上看得下的短串。
 *
 *   node --test nt/tests/keyword-engine.test.mjs
 *
 * 三层 + 升级规则（用户 2026-11-08）：
 *   ① 识别结果（原文）
 *   ② 备注区条目：`关键字1：关键字2，YYMMDDHHMM，账户`
 *   ③ 关键字1 升级成正式节点后，备注栏显示：`关键字2，YYMMDDHHMM`
 *
 * 升级的判定 = 节点的 `type` 有没有填（U 区 = 还没升级）。
 * 链的规则：自己总在链里；往上只收「还没升级」的祖先，碰到已定型的就停。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  compactTime, stamp, timeIn, keywordChain, shortKey, shortNote, shortestNote, displayNote, specialOf, itemTags,
} from '../js/core/keyword-engine.js';

const ALIASES = [
  { term: '丙怀餐饮', target: '丙怀' },
  { term: '云南嘉华食品有限公司', target: '嘉华' },
];

/** 两个都没定型（U 区） */
const S_UU = {
  accounts: [
    { id: 'food', name: '餐饮' },
    { id: 'bing', name: '丙怀', parentId: 'food' },
    { id: 'cmb', name: '交行储8380' },
  ],
  aliases: ALIASES,
};

/** 祖先没定型、自己是正式节点 */
const S_UL = {
  accounts: [
    { id: 'food', name: '餐饮' },
    { id: 'bing', name: '丙怀', parentId: 'food', type: '费用类' },
    { id: 'cmb', name: '交行储8380' },
  ],
  aliases: ALIASES,
};

/** 两个都定型 */
const S_LL = {
  accounts: [
    { id: 'food', name: '餐饮', type: '费用类' },
    { id: 'bing', name: '丙怀', parentId: 'food', type: '费用类' },
    { id: 'cmb', name: '交行储8380' },
  ],
  aliases: ALIASES,
};

const TX = {
  date: '2026-08-08',
  note: '餐饮美食：丙怀餐饮，2026-08-08 13:17，丙怀餐饮，交通银行储蓄卡(8380)',
  noteKeyword: '丙怀餐饮',
  from_id: 'cmb',
  to_id: 'bing',
};

test('时间压缩：2026-08-08 13:17 → 2608081317', () => {
  assert.equal(stamp('2026-08-08', '13:17'), '2608081317');
  assert.equal(stamp('2026-07-28', '10:23'), '2607281023');
  assert.equal(stamp('2026-10-18', '20:35'), '2610182035');
  assert.equal(compactTime('2026-10-22', '07:22'), '10220722');
  assert.equal(timeIn('餐饮美食：丙怀餐饮，2026-08-08 13:17'), '13:17');
  assert.equal(timeIn('没有时间'), '');
});

test('链：两个都没定型 → 餐饮：丙怀', () => {
  const byId = Object.fromEntries(S_UU.accounts.map((a) => [a.id, a]));
  assert.equal(keywordChain(S_UU.accounts, byId.bing), '餐饮：丙怀');
});

test('链：祖先没定型、自己已定型 → 餐饮：丙怀', () => {
  const byId = Object.fromEntries(S_UL.accounts.map((a) => [a.id, a]));
  assert.equal(keywordChain(S_UL.accounts, byId.bing), '餐饮：丙怀');
});

test('链：两个都定型 → 只剩丙怀（关键字1 已升级，关键字2 顶上）', () => {
  const byId = Object.fromEntries(S_LL.accounts.map((a) => [a.id, a]));
  assert.equal(keywordChain(S_LL.accounts, byId.bing), '丙怀');
});

test('别名：长商户名换短名', () => {
  assert.equal(shortKey('丙怀餐饮', ALIASES), '丙怀');
});

test('最特殊的字符：去行政区、去组织形式，留下有辨识度的那段', () => {
  assert.equal(specialOf('盘龙区杨万启餐饮服务店'), '杨万启');
  assert.equal(specialOf('云南嘉华食品有限公司'), '嘉华');
  assert.equal(specialOf('丙怀餐饮'), '丙怀');
  assert.equal(specialOf('盘龙区天秀小吃店（个体工商户）'), '天秀小吃');
});

test('有序词表：长商品名只取最靠前的具体词', () => {
  assert.deepEqual(itemTags('天鹅德式高音八孔竖笛8孔六孔小学生儿童成人专用演奏初中生笛子'), ['竖笛']);
  assert.deepEqual(itemTags('2条男士三角内裤男生低腰冰丝无痕'), ['内裤']);
  assert.deepEqual(itemTags('中国联通流量卡无线限量全国通用大流量网卡5g'), ['流量卡']);
});

test('有序词表：泛类词不单独当关键字，通用词命中也返回空', () => {
  assert.deepEqual(itemTags('DeepSeek-API服务(xx@qq.com)'), []);
  assert.deepEqual(itemTags('手机充值'), []);
  assert.deepEqual(itemTags('收钱码收款'), []);
});

test('② 层（备注区条目）：餐饮：丙怀，2608081317，交行储8380', () => {
  assert.equal(shortNote(S_UU, TX), '餐饮：丙怀，2608081317，交行储8380');
});

test('③ 层（升级后备注栏）：丙怀，2608081317', () => {
  assert.equal(shortestNote(S_LL, TX), '丙怀，2608081317');
});

test('displayNote：没升级用 ② 层，升级了用 ③ 层', () => {
  assert.equal(displayNote(S_UU, TX), '餐饮：丙怀，2608081317，交行储8380');
  assert.equal(displayNote(S_LL, TX), '丙怀，2608081317');
});
