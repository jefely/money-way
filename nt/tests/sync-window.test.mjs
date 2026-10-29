/**
 * 同步窗口自适应（core/sync-window.js）
 *
 * 规则：从截止日往前按天装流水，装到一张码满为止；没装满就一直往前到最早一笔。
 * 这里只测「窗口边界」与「整天截断」，二维码容量本身由 sync-code 的测试覆盖。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { fitWindow } from '../js/core/sync-window.js';
import { createState } from '../js/core/state-store.js';

const BASE = 'https://example.com/nt/index.html';

/** 直接铺 state：note / amount 都带变化，压缩率正常，容量才真的会满 */
function seed(rows) {
  const s = createState();
  s.accounts = [
    { id: 'acc_a', code: 'XJ', name: '现金', type: '资产类' },
    { id: 'acc_b', code: 'CY', name: '餐饮', type: '费用类' },
  ];
  s.transactions = rows.map((r, i) => ({
    id: 'tx' + i,
    date: r.date,
    from_id: 'acc_a',
    to_id: 'acc_b',
    amount: 1 + (i % 97),
    note: r.note,
  }));
  return s;
}

function days(from, to) {
  const out = [];
  for (let d = from; d <= to; d += 1) out.push(d);
  return out;
}

test('fitWindow：没装满就一路装到最早一笔（窗口从最早日期开始）', async () => {
  const s = seed([
    { date: '2026-10-01', note: 'a1' },
    { date: '2026-10-02', note: 'b2' },
    { date: '2026-10-05', note: 'c3' },
  ]);
  const r = await fitWindow(s, { base: BASE, until: '2026-10-05' });

  assert.equal(r.until, '2026-10-05');
  assert.equal(r.from, '2026-10-01', '全部装得下 → 窗口扩到最早一笔');
  assert.equal(r.days, 5);
  assert.equal(r.count, 3);
  assert.equal(r.parts.length, 1, '固定一张码');
});

test('fitWindow：截止日之后（未来）的流水不进来', async () => {
  const s = seed([
    { date: '2026-10-01', note: 'a1' },
    { date: '2026-10-05', note: 'b2' },
    { date: '2026-10-09', note: 'c3' },
  ]);
  const r = await fitWindow(s, { base: BASE, until: '2026-10-05' });

  assert.equal(r.until, '2026-10-05');
  assert.equal(r.count, 2, '10-09 那笔不算');
  assert.equal(r.from, '2026-10-01');
});

test('fitWindow：没有流水时返回 empty', async () => {
  const s = seed([]);
  const r = await fitWindow(s, { base: BASE, until: '2026-10-05' });

  assert.equal(r.empty, true);
  assert.equal(r.parts.length, 0);
  assert.equal(r.count, 0);
});

test('fitWindow：一天都装不下时返回 tooDense（不会返回半天的窗口）', async () => {
  const rows = [];
  for (let i = 0; i < 600; i += 1) {
    rows.push({ date: '2026-10-05', note: 'n' + i + '-' + (i * 7919) });
  }
  const s = seed(rows);
  const r = await fitWindow(s, { base: BASE, until: '2026-10-05' });

  assert.equal(r.tooDense, true);
  assert.equal(r.parts.length, 0);
});

test('fitWindow：默认 70 笔软上限 —— 装满 70 笔就停，不塞满整张码', async () => {
  // 10 天 × 10 笔 = 100 笔；70 笔 = 7 天
  const rows = [];
  for (const d of days(1, 10)) {
    const ds = '2026-09-' + String(d).padStart(2, '0');
    for (let k = 0; k < 10; k += 1) rows.push({ date: ds, note: 'y' + d + '-' + k });
  }
  const s = seed(rows);
  const r = await fitWindow(s, { base: BASE, until: '2026-09-10' });

  assert.equal(r.count, 70);
  assert.equal(r.from, '2026-09-04', '从截止日往前装满 7 天就停');
  assert.equal(r.parts.length, 1);
});

test('fitWindow：装不下时按天截断（窗口内笔数是整天数 × 每天笔数）', async () => {
  const rows = [];
  for (const d of days(1, 20)) {
    const ds = '2026-09-' + String(d).padStart(2, '0');
    for (let k = 0; k < 30; k += 1) {
      rows.push({ date: ds, note: 'x' + d + '-' + k + '-' + (k * 104729) });
    }
  }
  const s = seed(rows);
  const r = await fitWindow(s, { base: BASE, until: '2026-09-20' });

  assert.ok(r.from >= '2026-09-01' && r.from <= '2026-09-20', r.from);
  assert.equal(r.parts.length, 1);
  assert.equal(r.count % 30, 0, '整天截断：笔数必须是 30 的整数倍');
  assert.ok(r.count > 0);
  assert.ok(r.count < 600, '必须真的截断，不能全装');
});
