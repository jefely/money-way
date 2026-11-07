// 分类查询：时间段 + 分类关键字 / 拼音首字母
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { queryByCategory, queryByNode, resolveCategory, suggestCategories, queryByNodes, nodeNameOfCode, splitTerms } from '../js/core/category-query.js';

const accounts = [
  { id: 'a', name: '工资卡', type: '资产类', category: '储蓄', code: 'GZK' },
  { id: 'b', name: '现金', type: '资产类', category: '现金', code: 'XJ' },
  { id: 'c', name: '餐饮', type: '费用类', category: '日常', code: 'CY' },
];

const tx = (id, date, from_id, to_id, amount, status) => ({
  id, date, from_id, to_id, amount, note: id, status,
});

const txs = [
  tx('t1', '2026-02-01', 'a', 'c', 50),       // 储蓄 → 日常，命中
  tx('t2', '2026-02-02', 'b', 'a', 100),      // 现金 → 储蓄，命中
  tx('t3', '2026-02-03', 'b', 'c', 20),       // 不命中
  tx('t4', '2026-01-01', 'a', 'c', 30),       // 时间段外
  tx('t5', '2026-02-04', 'a', 'c', 10, 'draft'), // 草稿不算
];

const range = { start: '2026-02-01', end: '2026-02-28' };

test('按转出或转入账户的分类命中', () => {
  const r = queryByCategory(txs, accounts, range, '储蓄');
  assert.deepEqual(r.map((x) => x.tx.id), ['t1', 't2'], '按时间正序（2026-11-07 起）');
  // t2 = 现金 → 工资卡：转入方是「工资卡」，这笔靠**转入**命中储蓄
  assert.equal(r[1].to.name, '工资卡');
});

test('时间段过滤：区间外的流水不出现', () => {
  const r = queryByCategory(txs, accounts, range, '储蓄');
  assert.ok(!r.some((x) => x.tx.id === 't4'));
});

test('草稿不算流水', () => {
  const r = queryByCategory(txs, accounts, range, '储蓄');
  assert.ok(!r.some((x) => x.tx.id === 't5'));
});

test('空关键字返回空，不把整本账倒出来', () => {
  assert.deepEqual(queryByCategory(txs, accounts, range, ''), []);
  assert.deepEqual(queryByCategory(txs, accounts, range, '   '), []);
});

test('无命中返回空数组；日期正序（最新一笔在最下面）', () => {
  assert.deepEqual(queryByCategory(txs, accounts, range, '不存在'), []);
  const r = queryByCategory(txs, accounts, range, '储蓄');
  assert.equal(r[0].tx.date <= r[1].tx.date, true);
});

/* ---------- 拼音首字母（2026-11） ---------- */

test('输入分类首字母也能查到：cx → 储蓄，rc → 日常', () => {
  const byCx = queryByCategory(txs, accounts, range, 'cx');
  assert.deepEqual(byCx.map((x) => x.tx.id).sort(), ['t1', 't2'], '储蓄的两笔');

  const byRc = queryByCategory(txs, accounts, range, 'rc');
  assert.deepEqual(byRc.map((x) => x.tx.id).sort(), ['t1', 't3'], '日常作为转入方的两笔');

  // 单个字母是「包含」：c 命中 cx（储蓄）与 rc（日常）
  const byC = queryByCategory(txs, accounts, range, 'c');
  assert.deepEqual(byC.map((x) => x.tx.id).sort(), ['t1', 't2', 't3']);
});

test('汉字查询与首字母查询都能用，互不干扰', () => {
  assert.equal(queryByCategory(txs, accounts, range, '储蓄').length, 2);
  assert.equal(queryByCategory(txs, accounts, range, 'cx').length, 2);
  assert.equal(queryByCategory(txs, accounts, range, 'CX').length, 2, '大小写不敏感');
});

test('resolveCategory：唯一精确命中才带回分类名', () => {
  assert.equal(resolveCategory(accounts, 'rc'), '日常');
  assert.equal(resolveCategory(accounts, 'cx'), '储蓄');
  assert.equal(resolveCategory(accounts, '储蓄'), '储蓄');
  assert.equal(resolveCategory(accounts, 'r'), '', '首字母前缀不替换（会多个候选）');
  assert.equal(resolveCategory(accounts, '不存在'), '');
  assert.equal(resolveCategory(accounts, ''), '');
});

test('resolveCategory：多个分类首字母相同就不猜', () => {
  const accs = [
    { id: 'x', category: '餐饮' },   // cy
    { id: 'y', category: '常用' },   // cy
  ];
  assert.equal(resolveCategory(accs, 'cy'), '', '两个都是 cy，保持用户输入');
});

/* ---------- 候选气泡：「输入 c 弹出储蓄」 ---------- */

test('suggestCategories：首字母前缀排在最前', () => {
  const list = suggestCategories(accounts, 'c');
  assert.deepEqual(list.map((x) => x.name), ['储蓄', '日常'], 'cx 前缀在 rc 包含之前');
  assert.equal(list[0].initials, 'cx');
  assert.equal(list[0].count, 1, '储蓄只挂了一个账户');
});

test('suggestCategories：全等时只剩目标，空输入为空', () => {
  assert.deepEqual(suggestCategories(accounts, 'cx').map((x) => x.name), ['储蓄']);
  assert.deepEqual(suggestCategories(accounts, '储蓄').map((x) => x.name), ['储蓄']);
  assert.deepEqual(suggestCategories(accounts, ''), []);
  assert.deepEqual(suggestCategories(accounts, 'zzz'), []);
});

test('suggestCategories：同分类多账户只出现一次、节点数累加、limit 生效', () => {
  const accs = [
    { id: '1', category: '餐饮' },
    { id: '2', category: '餐饮' },
    { id: '3', category: '宠物' },
  ];
  const list = suggestCategories(accs, 'c', 1);
  assert.equal(list.length, 1, 'limit=1');
  assert.equal(list[0].name, '餐饮');
  assert.equal(list[0].count, 2, '两个账户挂在同一分类下');

  const all = suggestCategories(accs, 'c', 8);
  assert.deepEqual(all.map((x) => x.name).sort(), ['宠物', '餐饮'].sort());
});

/* ---------- 节点详情：多简码 / 多名字 ---------- */

const RANGE = { start: '2026-02-01', end: '2026-02-28' };

test('splitTerms：空格 / 中英文逗号 / 点 都算分隔符', () => {
  assert.deepEqual(splitTerms('GZK XJ'), ['GZK', 'XJ']);
  assert.deepEqual(splitTerms('GZK，XJ'), ['GZK', 'XJ']);
  assert.deepEqual(splitTerms('GZK,XJ'), ['GZK', 'XJ']);
  assert.deepEqual(splitTerms('GZK.XJ'), ['GZK', 'XJ']);
  assert.deepEqual(splitTerms('  GZK ,  XJ ，CY . '), ['GZK', 'XJ', 'CY']);
  assert.deepEqual(splitTerms(''), []);
});

test('nodeNameOfCode：简码大小写不敏感，认不出返回空串', () => {
  assert.equal(nodeNameOfCode(accounts, 'GZK'), '工资卡');
  assert.equal(nodeNameOfCode(accounts, 'gzk'), '工资卡');
  assert.equal(nodeNameOfCode(accounts, '  XJ '), '现金');
  assert.equal(nodeNameOfCode(accounts, 'NOPE'), '');
  assert.equal(nodeNameOfCode(accounts, ''), '');
});

test('queryByNodes：多个节点合并，同一笔只出现一次', () => {
  const rows = queryByNodes(txs, accounts, RANGE, ['工资卡', '现金']);
  const ids = rows.map((r) => r.tx.id);
  assert.deepEqual(ids, ['t1', 't2', 't3'], '日期正序，t1/t2 各一次');
  assert.equal(new Set(ids).size, ids.length, '不能重复');
});

test('queryByNodes：空词表返回空，不炸', () => {
  assert.deepEqual(queryByNodes(txs, accounts, RANGE, []), []);
  assert.deepEqual(queryByNodes(txs, accounts, RANGE, ['', '  ']), []);
});

test('queryByNode：不认拼音首字母（节点详情只认名字包含）', () => {
  // 「工资卡」的首字母是 gzk —— 但节点那一侧不认首字母（用户 2026-11），
  // 否则简码 GZK 和首字母会互相误伤。
  assert.deepEqual(queryByNode(txs, accounts, RANGE, 'gzk'), [], '首字母不该命中节点名');
  assert.ok(queryByNode(txs, accounts, RANGE, '工资').length > 0, '名字包含仍然命中');
});

test('queryByCategory 仍然认首字母（只改节点那一侧）', () => {
  assert.ok(queryByCategory(txs, accounts, RANGE, 'cx').length > 0, '「储蓄」首字母 cx 照常命中');
});
