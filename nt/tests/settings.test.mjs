/**
 * 界面参数的归一化（normalize）—— 重点是「每张表各一套列宽」
 *
 * 锁三件事：
 *   ① 每张表的列宽键都存在，长度 = 该表列数
 *   ② 旧存档只有一份「默认列宽」时，能按列名迁成每表一份（自适应列不迁）
 *   ③ 变量名是 --nt-col-<表>-<列>，且 0 会变成自适应（auto / 1fr）
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalize, toCssList, TABLE_COLS, TABLE_DEFAULT_WIDTHS, parseTableWidths,
  colWidthKey, COL_KEYS, DEFAULT_COL_WIDTHS,
} from '../js/core/settings.js';

const TABLES = Object.keys(TABLE_COLS);

test('每张表都有列宽键，且长度 = 该表列数', () => {
  const n = normalize({}, 'dark');
  for (const t of TABLES) {
    const key = colWidthKey(t);
    assert.ok(key in n, `缺参数 ${key}`);
    assert.equal(n[key].split(',').length, TABLE_COLS[t].cols.length, `${key} 长度不对`);
    assert.equal(n[key], TABLE_DEFAULT_WIDTHS[t], `${key} 应等于该表默认值`);
  }
});

test('表格列数与「核对过的设计」一致：8 / 8 / 10 / 6 / 6 / 8 / 10', () => {
  const counts = TABLES.map((t) => TABLE_COLS[t].cols.length);
  assert.deepEqual(counts, [8, 8, 10, 6, 6, 8, 10]);
});

test('旧版单份「默认列宽」→ 按列名迁成每表一份', () => {
  // 用户导出的那份（只有前 11 个数）
  const legacy = '44,84,72,76,64,100,96,40,64,64,64';
  const n = normalize({ 默认列宽: legacy }, 'dark');

  const flow = parseTableWidths(n['流水记录/列宽'], 'flow');
  assert.equal(flow[0], 44, 'seq 用旧值');
  assert.equal(flow[1], 84, 'date 用旧值');
  assert.equal(flow[4], 96, 'amount 用旧值（COL_KEYS 第 7 位）');
  // from/to/note 不在旧数组的前 11 位 → 用追加列的默认，不能掉成 64
  assert.equal(flow[2], 112);
  assert.equal(flow[3], 112);
  assert.equal(flow[5], 116);
});

test('迁移不会把「自适应列」写成固定宽度', () => {
  const n = normalize({ 默认列宽: '44,84,72,76,64,100,96,40,64,64,64' }, 'dark');

  const query = parseTableWidths(n['流水查询/列宽'], 'query');
  assert.equal(query[query.length - 1], 0, '查询表备注列必须保持自适应');

  const path = parseTableWidths(n['路径追踪/列宽'], 'path');
  assert.equal(path[2], 0);
  assert.equal(path[3], 0);
  assert.equal(path[5], 0);
});

test('旧数组本身缺位时补的是「旧默认宽度」，不是 64', () => {
  const n = normalize({ 默认列宽: '44,84' }, 'dark');
  const flow = parseTableWidths(n['流水记录/列宽'], 'flow');
  // 旧数组只有前两位：其余按旧的 COL_KEYS 默认补齐后再按列名抽给流水表
  assert.deepEqual(flow, [44, 84, 112, 112, 96, 116, 48, 40]);
  assert.ok(!flow.includes(64), '不能掉成 64');
});

test('CSS 变量名是 --nt-col-<表>-<列>，0 变自适应', () => {
  const n = normalize({}, 'dark');
  const list = toCssList(n, 'dark')
    .filter((x) => x.cssVar && x.cssVar.startsWith('--nt-col-'));

  // 7 张表所有列都要有变量
  const want = TABLES.reduce((k, t) => k + TABLE_COLS[t].cols.length, 0);
  assert.equal(list.length, want);

  const byVar = new Map(list.map((x) => [x.cssVar, x.value]));
  assert.equal(byVar.get('--nt-col-flow-amount'), '92px');
  assert.equal(byVar.get('--nt-col-query-note'), 'auto');
  assert.equal(byVar.get('--nt-col-path-from'), '1fr');
  assert.equal(byVar.get('--nt-col-sum-histBalance'), '96px');
});

test('同一个列名在不同表里互不影响', () => {
  const n = normalize({
    '流水记录/列宽': '54,84,120,112,92,116,48,40',
    '流水查询/列宽': '26,58,62,62,56,0',
  }, 'dark');

  const flow = parseTableWidths(n['流水记录/列宽'], 'flow');
  const query = parseTableWidths(n['流水查询/列宽'], 'query');
  assert.equal(flow[2], 120, '流水表转出列被改宽');
  assert.equal(query[2], 62, '查询表转出列不受影响');
});

test('COL_KEYS 仍然是「只在末尾追加」的旧映射表（迁移依赖它）', () => {
  assert.equal(COL_KEYS.length, 26);
  assert.equal(COL_KEYS.indexOf('from'), 18);
  assert.equal(DEFAULT_COL_WIDTHS.split(',').length, 26);
});
