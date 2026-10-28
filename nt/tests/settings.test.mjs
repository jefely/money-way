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
  colWidthKey, COL_KEYS, DEFAULT_COL_WIDTHS, DEFAULT_COL_ALIGN,
  GROUPS, SCREENS, GROUP_SCREEN, SCHEMA,
} from '../js/core/settings.js';
import { TABLE_SIZE_FIELDS, TABLE_SIZE_SCHEMA } from '../js/core/table-cols.js';

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
  // from/to/note 不在旧数组的前 11 位 → 用该表默认，不能掉成 64
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
  assert.equal(byVar.get('--nt-col-flow-amount'), '96px');
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
  // 2026-10 第二次追加了 5 个（billDay/repayDay/interest/per/firstMonth），
  // 位置都在末尾 —— 前面 26 个的下标一个都没动。
  assert.equal(COL_KEYS.length, 31);
  assert.equal(COL_KEYS.indexOf('from'), 18);
  assert.equal(COL_KEYS.indexOf('billDay'), 26);
  assert.equal(DEFAULT_COL_WIDTHS.split(',').length, 31);
  assert.equal(DEFAULT_COL_ALIGN.split(',').length, 31);
});

/* ============================================================
   每张表一套尺寸（界面参数面板「每个功能表一页」的骨架）
   ============================================================ */

test('★ 每张表 5 项：列宽 + 列标行高/字号 + 数据行高/字号（路径表只有列宽）', () => {
  // 6 张 <table> × 4 项尺寸；路径表是 div+grid，不参与
  assert.equal(TABLE_SIZE_SCHEMA.length, 24, '6 表 × 4 项');

  for (const [table, t] of Object.entries(TABLE_COLS)) {
    const items = SCHEMA.filter((s) => s.group === t.label);
    const want = table === 'path' ? 1 : 5;
    assert.equal(items.length, want, `${t.label} 应有 ${want} 项，实际 ${items.length}`);

    assert.ok(items.some((s) => s.type === 'cols' && s.table === table), `${t.label} 缺列宽`);
    if (table === 'path') {
      assert.ok(!items.some((s) => s.type === 'tableSize'), '路径表不该有尺寸参数');
      continue;
    }
    for (const f of TABLE_SIZE_FIELDS) {
      const item = items.find((s) => s.type === 'tableSize' && s.field === f.field);
      assert.ok(item, `${t.label} 缺 ${f.field}`);
      assert.equal(item.cssVar, f.cssVar + table, `${t.label}/${f.field} 变量名串表了`);
    }
  }
});

test('★ 每个表组都有自己的屏：7 个 tab 一一对应，没有孤儿组', () => {
  const ids = SCREENS.map((s) => s.id);
  assert.deepEqual(ids, ['main', 'flow', 'stats', 'query', 'path', 'plan', 'settings']);

  for (const t of Object.values(TABLE_COLS)) {
    assert.ok(GROUPS.includes(t.label), `${t.label} 不在 GROUPS`);
    assert.ok(ids.includes(GROUP_SCREEN[t.label]), `${t.label} 的屏幕不存在`);
  }
  // 每个组都必须有归属屏，否则面板里永远看不到它
  for (const g of GROUPS) {
    assert.ok(ids.includes(GROUP_SCREEN[g]), `${g} 没有归属屏`);
  }
});

test('★ 旧存档的全局行高/字号迁移到各表，而不是掉回默认（路径表不参与）', () => {
  const n = normalize({
    数据区行高: 40, 数据区字号: 16, 列标行行高: 30, 列标行字号: 13,
  }, 'dark');

  for (const [table, t] of Object.entries(TABLE_COLS)) {
    if (table === 'path') continue;
    assert.equal(n[t.label + '/数据行高'], 40, `${t.label} 数据行高没迁`);
    assert.equal(n[t.label + '/数据字号'], 16);
    assert.equal(n[t.label + '/列标行高'], 30);
    assert.equal(n[t.label + '/列标字号'], 13);
  }
});

test('每表明写的值优先于旧全局值', () => {
  const n = normalize({ 数据区行高: 40, '流水记录/数据行高': 36 }, 'dark');
  assert.equal(n['流水记录/数据行高'], 36);
  assert.equal(n['汇总表/数据行高'], 40, '表里没写的仍吃旧全局值');
});

test('没设过时用每表默认值（26 / 12 / 32 / 14）', () => {
  const n = normalize({}, 'dark');
  for (const [table, t] of Object.entries(TABLE_COLS)) {
    if (table === 'path') continue;
    assert.equal(n[t.label + '/列标行高'], 26);
    assert.equal(n[t.label + '/列标字号'], 12);
    assert.equal(n[t.label + '/数据行高'], 32);
    assert.equal(n[t.label + '/数据字号'], 14);
  }
});

test('每表尺寸走自己的变量名，调一张不动别张', () => {
  const n = normalize({ '流水记录/数据行高': 40, '汇总表/数据行高': 48 }, 'dark');
  const byVar = new Map(
    toCssList(n, 'dark').filter((x) => x.cssVar).map((x) => [x.cssVar, x.value]),
  );
  assert.equal(byVar.get('--nt-row-h-flow'), '40px');
  assert.equal(byVar.get('--nt-row-h-sum'), '48px');
  assert.equal(byVar.get('--nt-row-h-cat'), '32px', '分类统计不该被连带动');
});

test('每表尺寸也被钳制（行高 5 → 16，500 → 120）', () => {
  const n = normalize({ '流水记录/数据行高': 5, '汇总表/数据行高': 500 }, 'dark');
  assert.equal(n['流水记录/数据行高'], 16);
  assert.equal(n['汇总表/数据行高'], 120);
});
