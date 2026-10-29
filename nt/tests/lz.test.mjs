/**
 * .lz 快照：编码 → 解析 → 还原。
 *
 * 格式与单文件版一致（LZ1:base64url(gzip(JSON))），语义是「快照覆盖」。
 * 这里锁三件事：能解自家的快照、能解单文件版那种「账户写名字、类型写 cat」的快照、
 * 坏文件要明确报错而不是当成空账本偷偷导进来。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { encodeSyncCode } from '../js/core/sync-code.js';
import { readLzText, stateFromLzPayload } from '../js/core/lz-file.js';

const OWN = {
  v: 1,
  accounts: [
    { id: 'a1', code: 'JHC', name: '交行储8380', type: '资产类', category: '储蓄' },
    { id: 'a2', code: 'DT', name: '地铁', type: '费用类', category: '通勤' },
  ],
  transactions: [
    { date: '2026-08-01', from_id: 'a1', to_id: 'a2', amount: 2, note: '通勤' },
  ],
  exportedAt: '2026-10-27T00:00:00.000Z',
};

// 单文件版风格：账户用 cat/sub，流水用名字
const LEGACY = {
  accounts: [
    { code: 'ZHC', name: '招行储7912', cat: '资产类', sub: '储蓄', opening: 22.94 },
    { code: 'S', name: '水', cat: '费用类', sub: '日常' },
  ],
  transactions: [
    { date: '2026-08-02', from: '招行储7912', to: '水', amount: 3.5, note: '' },
  ],
};

test('LZ0 / LZ1 都能读回 JSON', async () => {
  const text = JSON.stringify(OWN);
  for (const code of ['LZ0:' + Buffer.from(text).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  await encodeSyncCode(text)]) {
    assert.ok(/^LZ[01]/.test(code));
    assert.deepEqual(await readLzText(code), OWN);
  }
});

test('自家快照：按 id 还原账户与流水', async () => {
  const lz = await encodeSyncCode(JSON.stringify(OWN));
  const built = stateFromLzPayload(await readLzText(lz));

  assert.equal(built.stats.accounts, 2);
  assert.equal(built.stats.transactions, 1);
  assert.equal(built.stats.loose, 0);
  assert.equal(built.state.transactions.length, 1);
  assert.ok(built.state.transactions[0].from_id.startsWith('acc_'));
});

test('单文件版快照：cat/sub 与「用名字写的流水」也认', async () => {
  const lz = await encodeSyncCode(JSON.stringify(LEGACY));
  const built = stateFromLzPayload(await readLzText(lz));

  assert.equal(built.stats.accounts, 2);
  assert.equal(built.stats.transactions, 1);
  assert.equal(built.stats.loose, 0, '两端都该按名字对上');

  const accs = built.state.accounts;
  assert.ok(accs.some((a) => a.type === '资产类' && a.category === '储蓄'));
  // 期初 22.94 要变成一条期初流水
  assert.equal(built.state.transactions.filter((t) => t.opening).length, 1);
});

test('坏文件要报错，不能当成空账本导进来', async () => {
  await assert.rejects(() => readLzText('随便一段文字'), /LZ1|LZ0/);
  await assert.rejects(() => readLzText('LZ2:abc'), /LZ2|密码/);
  await assert.rejects(() => readLzText('LZ0:' + Buffer.from('{不是JSON').toString('base64')), /JSON/);
  await assert.rejects(
    () => readLzText('LZ0:' + Buffer.from('{"accounts":[]}').toString('base64')),
    /transactions/,
  );
});

/* ---------- 单文件版的计划：fixed + installments ----------
   这两条是 2026-10-30 补的。在那之前只读 `scheduled`，而单文件版根本不导出 `scheduled` ——
   从单文件版导一份 .lz 过来，账户和流水都在、固定收支与分期全部静默消失。 */

const LEGACY_PLAN = {
  v: 3,
  accounts: [
    { code: 'ZHC', name: '招行储7912', cat: '资产类', sub: '储蓄', opening: 0 },
    { code: 'XY', name: '招行信用卡', cat: '负债类', sub: '信用', opening: 0 },
  ],
  transactions: [],
  fixed: [
    { freq: 'month', day: 5, from: '招行储7912', to: '水', amount: 30, note: '水费' },
    { freq: 'day', day: '', from: '招行储7912', to: '水', amount: 2, note: '通勤' },
  ],
  installments: [{
    name: '招行信用卡',
    principal: 1200,
    billDay: 5,
    repayDay: 20,
    cells: { '2610': { p: 100, i: 5 }, '2611': { p: 100, i: 5 } },
  }],
  installState: { from: 2610, to: 2645 },
};

test('单文件版的 fixed → scheduled（频率 / 几号 / 账户 / 金额都要对）', () => {
  const built = stateFromLzPayload(LEGACY_PLAN);
  const list = built.state.scheduled || [];

  assert.equal(built.stats.scheduled, 3, '两条固定 + 一条分期');
  assert.equal(built.stats.lostScheduled, 0);

  const byNote = (t) => list.find((s) => s.note === t && !s.inst);
  const water = byNote('水费');
  assert.ok(water, '每月那条没搬过来');
  assert.equal(water.freq, 'monthly');
  assert.equal(water.day, 5);
  assert.equal(water.amount, 30);
  assert.ok(water.from_id, '转出账户要按名字对上');
  assert.equal(water.to_id, null, '「水」不在账户表里，就该留空而不是乱指一个');

  const daily = byNote('通勤');
  assert.ok(daily);
  assert.equal(daily.freq, 'daily');
});

test('单文件版的 installments → inst（期数 / 首月 / 本金 / 利息按矩阵反推）', () => {
  const built = stateFromLzPayload(LEGACY_PLAN);
  const inst = (built.state.scheduled || []).find((s) => s.inst);

  assert.ok(inst, '分期没搬过来');
  assert.equal(inst.inst.periods, 2, '有值的月份数 = 期数');
  assert.equal(inst.inst.firstMonth, '2026-10', '首个有值的月份');
  assert.equal(inst.inst.principal, 200, '本金 = 各期 p 之和');
  assert.equal(inst.inst.interest, 10, '利息 = 各期 i 之和');
  assert.equal(inst.billDay, 5);
  assert.equal(inst.day, 20, 'repayDay 落在 day 上');
  assert.ok(inst.to_id, '「哪张卡」落到 to_id');
});

test('分期账户名对不上 → 计入 lostScheduled，不静默消失', () => {
  const payload = {
    ...LEGACY_PLAN,
    installments: [{
      name: '不存在的卡', principal: 100, billDay: 1, repayDay: 2,
      cells: { '2610': { p: 100, i: 0 } },
    }],
  };
  const built = stateFromLzPayload(payload);
  assert.equal(built.stats.lostScheduled, 1);
  assert.equal(built.state.scheduled.filter((s) => s.inst).length, 0);
});
