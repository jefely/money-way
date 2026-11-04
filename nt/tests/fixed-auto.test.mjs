// 每月固定收支到期自动落账（daily 必须手动 ▲）
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { materializeDueFixed } from '../js/core/plan-occurrence.js';
import { buildVirtualFixed } from '../js/timeline/time-state.js';
import { buildFlowRows } from '../js/ui/flow-model.js';
import { removeFlowTx, removeFlowBatch, unvoidKeys, markPlanHandled } from '../js/ui/plan-links.js';

function rule(over) {
  return {
    id: 's1',
    isScheduled: true,
    freq: 'monthly',
    day: 5,
    from_id: 'cash',
    to_id: 'food',
    amount: 100,
    note: '午饭',
    ...(over || {}),
  };
}

function book(over) {
  return {
    transactions: [],
    scheduled: [rule()],
    voidedPlans: [],
    ...(over || {}),
  };
}

test('每月固定收支：到期日当天自动落一笔真实流水', () => {
  const before = book();
  const out = materializeDueFixed(before, '2026-11-05');
  assert.equal(out.transactions.length, 1);
  const tx = out.transactions[0];
  assert.equal(tx.date, '2026-11-05');
  assert.equal(tx.from_id, 'cash');
  assert.equal(tx.to_id, 'food');
  assert.equal(tx.amount, 100);
  assert.equal(tx.note, '午饭');
  assert.equal(tx.planKey, 's1|2026-11');
  assert.equal(tx.planSourceId, 's1');
  assert.equal(tx.seq, 1);
  assert.equal(before.transactions.length, 0, '不能改入参');
});

test('每月固定收支：过了日期按当月应发生日补，不改成今天', () => {
  const out = materializeDueFixed(book(), '2026-12-10');
  assert.equal(out.transactions[0].date, '2026-12-05');
  assert.equal(out.transactions[0].planKey, 's1|2026-12');
});

test('每月固定收支：未到日子不落账，同一期只落一次', () => {
  const before = book();
  assert.equal(materializeDueFixed(before, '2026-11-04'), before);
  const once = materializeDueFixed(before, '2026-11-05');
  assert.equal(materializeDueFixed(once, '2026-11-05'), once);
  assert.equal(materializeDueFixed(once, '2026-11-20'), once);
});

test('每月固定收支：31 号在 2 月落到月末', () => {
  const out = materializeDueFixed(book({ scheduled: [rule({ day: 31 })] }), '2026-02-28');
  assert.equal(out.transactions[0].date, '2026-02-28');
});

test('每日固定收支不自动落账（必须手动 ▲）', () => {
  const before = book({ scheduled: [rule({ freq: 'daily' })] });
  assert.equal(materializeDueFixed(before, '2026-11-05'), before);
});

test('分期规则不在这里落账', () => {
  const before = book({ scheduled: [rule({ inst: { firstMonth: '2026-11', periods: 12 } })] });
  assert.equal(materializeDueFixed(before, '2026-11-05'), before);
});

test('两端 / 金额不全的规则不落账，避免造出无效流水', () => {
  for (const over of [{ from_id: null }, { to_id: '' }, { amount: 0 }, { amount: -5 }]) {
    const before = book({ scheduled: [rule(over)] });
    assert.equal(materializeDueFixed(before, '2026-11-05'), before, JSON.stringify(over));
  }
});

test('已经作废的一期不再补', () => {
  const before = book({ voidedPlans: ['s1|2026-11'] });
  assert.equal(materializeDueFixed(before, '2026-11-05'), before);
});

test('已经存在同一 planKey 的流水不再补', () => {
  const before = book({
    transactions: [{ id: 'tx1', planKey: 's1|2026-11', amount: 100 }],
  });
  assert.equal(materializeDueFixed(before, '2026-11-05'), before);
});

test('多条每月规则一起补，seq 依次加一', () => {
  const before = book({
    scheduled: [rule(), rule({ id: 's2', day: 1, amount: 30 })],
  });
  const out = materializeDueFixed(before, '2026-11-05');
  assert.equal(out.transactions.length, 2);
  assert.deepEqual(out.transactions.map((t) => t.seq), [1, 2]);
});

test('非分期的固定收支：自动到账的备注就是模板备注，空就空', () => {
  const out = materializeDueFixed(book({ scheduled: [rule({ note: '' })] }), '2026-11-05');
  assert.equal(out.transactions[0].note, '');
  assert.equal(out.transactions[0].planKey, 's1|2026-11');

  // 未来虚拟行也不能因为 periodIndex 是月份 key 就补「第 2026-11/ 期」
  const virtual = buildVirtualFixed(
    [rule({ note: '', freq: 'monthly', day: 20 })],
    '2026-11-05',
    [],
  );
  assert.equal(virtual[0].note, '');
  assert.equal(virtual[0].periodIndex, '');
  const rows = buildFlowRows({ transactions: [], scheduled: [rule({ note: '', day: 20 })] }, virtual);
  assert.equal(rows[rows.length - 1].note, '');
});

test('删掉自动到账的那笔：作废这一期，下次补账不再复活', () => {
  const before = materializeDueFixed(book(), '2026-11-05');
  const tx = before.transactions[0];
  const after = removeFlowTx(before, tx.id);
  assert.equal(after.transactions.length, 0);
  assert.deepEqual(after.voidedPlans, ['s1|2026-11']);
  assert.equal(materializeDueFixed(after, '2026-11-05'), after);
});

test('批量删除也作废；撤销恢复时把这些作废标记清掉', () => {
  const before = materializeDueFixed(book(), '2026-11-05');
  const tx = before.transactions[0];
  const r = removeFlowBatch(before, [tx.id]);
  assert.deepEqual(r.keys, ['s1|2026-11']);
  assert.equal(r.state.transactions.length, 0);
  assert.deepEqual(r.state.voidedPlans, ['s1|2026-11']);
  const restored = unvoidKeys({ ...r.state, transactions: r.removed, voidedPlans: r.state.voidedPlans.concat('other') }, r.keys);
  assert.deepEqual(restored.voidedPlans, ['other']);
});

test('从源流水生成规则：当月这一期标成已处理，避免自动补账重复', () => {
  const st = markPlanHandled(book(), 's1', '2026-11-05');
  assert.deepEqual(st.voidedPlans, ['s1|2026-11']);
  const again = markPlanHandled(st, 's1', '2026-11-05');
  assert.deepEqual(again.voidedPlans, ['s1|2026-11'], '幂等，不重复加');
});
