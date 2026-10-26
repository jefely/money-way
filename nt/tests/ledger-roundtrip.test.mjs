/**
 * 两段式文本 ↔ state：往返一致、按名称判重、期初转流水。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ledgerToText, replaceLedgerFromText, appendLedgerFromText, applyAccounts,
} from '../js/core/flow-text.js';
import { parseLedgerText } from '../js/core/import-parser.js';
import { balanceOf } from '../js/core/balance-calculator.js';
import { createState } from '../js/core/state-store.js';

const SAMPLE = [
  '账户：',
  '类型，分类，简码，名称，期初，账单日，还款日，',
  '收入类，工资，GZ，工资，',
  '资产类，现金，XJ，现金，200，',
  '资产类，储蓄，GHC，工行储，4567，',
  '负债类，信用，JHX，交行信1，2000，8，3，',
  '负债类，信用，JHX2，交行信2，，8，3，',
  '',
  '流水：',
  '日期，转出，转入，金额，备注，',
  '260801，XJ，S，3.5，',
  '260801，JHC，HF，100，',
  '260802，现金，水，3.5，',
  '260802，交行储，话费，100，',
].join('\n');

test('★ 导入用户样例：账户段 5 个 + 流水 4 笔 + 未知账户自动建', () => {
  const r = replaceLedgerFromText(createState(), SAMPLE);
  const visible = r.state.accounts.filter((a) => !a.isHidden);
  const names = visible.map((a) => a.name);

  // 账户段定义的 5 个必须都在
  for (const n of ['工资', '现金', '工行储', '交行信1', '交行信2']) {
    assert.ok(names.includes(n), '缺账户：' + n);
  }
  assert.equal(r.accountsAdded, 5, '账户段建 5 个');

  const cash = visible.find((a) => a.name === '现金');
  assert.equal(cash.type, '资产类');
  assert.equal(cash.code, 'XJ');

  // 流水段引用了账户段里没有的账户（S / HF / JHC / 水 / 话费 / 交行储）
  // —— 这些必须自动建，否则那几笔会凭空消失
  for (const n of ['S', 'HF', 'JHC', '水', '话费', '交行储']) {
    assert.ok(names.includes(n), '未知账户没自动建：' + n);
  }

  const tx = r.state.transactions.filter((t) => !t.opening);
  assert.equal(tx.length, 4, '4 笔流水一笔都不能丢');
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
});

test('★ 期初变成 opening 流水：现金 +200', () => {
  const r = replaceLedgerFromText(createState(), SAMPLE);
  const cash = r.state.accounts.find((a) => a.name === '现金');
  const opening = r.state.transactions.filter((t) => t.opening && t.to_id === cash.id);
  assert.equal(opening.length, 1);
  assert.equal(opening[0].amount, 200);
});

test('★ 往返：导出再导入，每个账户余额一分不差', () => {
  const r1 = replaceLedgerFromText(createState(), SAMPLE);
  const text = ledgerToText(r1.state);
  const r2 = replaceLedgerFromText(r1.state, text);

  const bal = (st, name) => {
    const a = st.accounts.find((x) => x.name === name);
    return a ? balanceOf(a, st.transactions).balance : null;
  };

  for (const name of ['现金', '工行储', '交行信1']) {
    assert.equal(bal(r2.state, name), bal(r1.state, name), name + ' 余额必须一致');
  }
});

test('账户按名称判重：重复导入不会建第二份', () => {
  const r1 = replaceLedgerFromText(createState(), SAMPLE);
  const before = r1.state.accounts.filter((a) => !a.isHidden).length;
  const r2 = replaceLedgerFromText(r1.state, SAMPLE);
  const after = r2.state.accounts.filter((a) => !a.isHidden).length;
  assert.equal(after, before, '第二次导入不应新增账户');
  assert.equal(r2.accountsAdded, 0);
});

test('账户已存在时，类型/分类会被更新（改了就有用）', () => {
  const r1 = replaceLedgerFromText(createState(), SAMPLE);
  const txt = SAMPLE.replace('收入类，工资，GZ，工资，', '资产类，薪金，GZ，工资，');
  const r2 = replaceLedgerFromText(r1.state, txt);
  const salary = r2.state.accounts.find((a) => a.name === '工资');
  assert.equal(salary.type, '资产类');
  assert.equal(salary.category, '薪金');
});

test('applyAccounts 单独可用：只补账户不动流水', () => {
  const st = createState();
  const rows = parseLedgerText(SAMPLE).accounts;
  const r = applyAccounts(st, rows);
  assert.equal(r.added, 5);
  assert.equal(r.state.transactions.length, st.transactions.length, '流水没被碰');
});

test('追加：不动旧流水', () => {
  const r1 = replaceLedgerFromText(createState(), SAMPLE);
  const n1 = r1.state.transactions.length;
  const r2 = appendLedgerFromText(r1.state, '流水：\n260901，XJ，水，5，');
  assert.equal(r2.state.transactions.length, n1 + 1);
  assert.equal(r2.txRemoved, 0);
});

test('导出文本要带两段标题与表头', () => {
  const r = replaceLedgerFromText(createState(), SAMPLE);
  const text = ledgerToText(r.state);
  assert.ok(text.startsWith('账户：'), '以「账户：」开头');
  assert.ok(text.includes('流水：'), '含「流水：」');
  assert.ok(text.includes('类型，分类，简码'), '有账户表头');
  assert.ok(text.includes('日期，转出，转入'), '有流水表头');
});

test('导出的流水行用全角逗号分隔', () => {
  const r = replaceLedgerFromText(createState(), SAMPLE);
  const text = ledgerToText(r.state);
  const txLine = text.split('流水：')[1].split('\n').find((l) => /^\d{6}，/.test(l.trim()));
  assert.ok(txLine, '要有流水行：' + JSON.stringify(text.slice(-120)));
  assert.ok(txLine.includes('，'));
});

test('空文本：账户留着，流水清空', () => {
  const r1 = replaceLedgerFromText(createState(), SAMPLE);
  const r2 = replaceLedgerFromText(r1.state, '账户：\n流水：\n');
  assert.equal(r2.state.transactions.length, 0);
  assert.equal(r2.state.accounts.length, r1.state.accounts.length);
});
