/**
 * 账本适配器 —— 旧账本投影到事件模型，逐账户对账。
 *
 *   node --test nt/tests/ledger-adapter.test.mjs
 *
 * 这组测试守的不是「新引擎算得对」（那是 event-engine / calc-engine 的事），
 * 而是「新引擎**能重算出这本旧账**」：
 * 同一个账户，balanceOf() 与 balanceOfNode() 必须给出同一个数，
 * auditBook() 的双式恒等必须是 0 —— 差额为 0，才谈得上把新引擎接上去。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addAccount, addTransaction, createState } from '../js/core/state-store.js';
import { OPENING_ACCOUNT_ID } from '../js/core/schema.js';
import { EVENT_STATUS, NODE_NATURE, polarityOfType } from '../js/core/event-engine.js';
import { balanceOf } from '../js/core/balance-calculator.js';
import { physicalBook } from '../js/core/calc-engine.js';
import {
  ADAPT_ISSUE, adaptBook, adaptState, auditAll, compareBalances,
} from '../js/core/ledger-adapter.js';

/** 直接改数组：绕过 createTransaction 的归一，专门造脏数据 */
const put = (st, acc) => ({ ...st, accounts: [...st.accounts, acc] });
const raw = (st, tx) => ({ ...st, transactions: [...st.transactions, tx] });

/** 一本「像真账」的样例：期初 + 工资 + 刷卡 + 还款 */
function sampleState() {
  let st = createState();
  st = addAccount(st, { id: 'bank', name: '储蓄卡', type: '资产类', category: '储蓄' });
  st = addAccount(st, { id: 'card', name: '信用卡', type: '负债类', category: '信用' });
  st = addAccount(st, { id: 'food', name: '餐饮', type: '费用类', category: '餐饮' });
  st = addAccount(st, { id: 'salary', name: '工资', type: '收入类', category: '工资' });
  st = addTransaction(st, { id: 't-open', date: '2026-01-01', from_id: OPENING_ACCOUNT_ID, to_id: 'bank', amount: 10000, opening: true });
  st = addTransaction(st, { id: 't-sal', date: '2026-11-01', from_id: 'salary', to_id: 'bank', amount: 5000 });
  st = addTransaction(st, { id: 't-eat', date: '2026-11-02', from_id: 'card', to_id: 'food', amount: 300 });
  st = addTransaction(st, { id: 't-repay', date: '2026-11-20', from_id: 'bank', to_id: 'card', amount: 300 });
  return st;
}

/* ============ 空账 / 基本投影 ============ */

test('空账本：只有期初节点，双式恒等为 0', () => {
  const st = createState();
  const [book] = adaptState(st);
  assert.equal(book.nodes.length, 1, '只剩 __OPENING__');
  assert.equal(book.nodes[0].id, OPENING_ACCOUNT_ID);
  assert.equal(book.events.length, 0);
  assert.equal(book.audit.ok, true);
  assert.equal(book.audit.doubleEntry.diff, 0);

  const summary = auditAll(st);
  assert.equal(summary.length, 1);
  assert.equal(summary[0].ok, true);
  assert.equal(summary[0].accounts, 1);
});

test('★ 样例账：4 笔流水逐账户对账全中，ΣA = ΣB', () => {
  const st = sampleState();
  const book = adaptBook(st);

  assert.equal(book.nodes.length, 5, '4 个账户 + 期初');
  assert.equal(book.events.length, 4);
  assert.equal(book.stats.posted, 4);
  assert.equal(book.stats.drafts, 0);

  // 每条事件都带溯源：id 与流水一一对应
  for (const tx of st.transactions) {
    assert.ok(book.events.some((e) => e.id === tx.id), '缺事件：' + tx.id);
  }
  assert.equal(book.events.find((e) => e.id === 't-open').opening, true);

  const cmp = compareBalances(book, book.nodes, book.events);
  assert.equal(cmp.count, 5);
  assert.equal(cmp.mismatched.length, 0, JSON.stringify(cmp.mismatched));
  assert.equal(cmp.maxDelta, 0);

  const d = book.audit.doubleEntry;
  assert.equal(d.aTotal, 15000, 'A 极 = 卡 14700 + 餐饮 300');
  assert.equal(d.bTotal, 15000, 'B 极 = 期初 10000 + 工资 5000 + 信用卡 0');
  assert.equal(d.diff, 0);
  assert.equal(book.audit.ok, true);
  assert.equal(book.audit.dangling, 0);
});

test('投影只读：原 state 的流水一个字节都没变', () => {
  const st = sampleState();
  const before = JSON.stringify(st.transactions);
  const accountsBefore = JSON.stringify(st.accounts);
  const book = adaptBook(st);
  // 新对象与旧对象不共享引用
  book.events[0].amount = 99999;
  book.nodes[0].name = '改坏了';
  assert.equal(JSON.stringify(st.transactions), before);
  assert.equal(JSON.stringify(st.accounts), accountsBefore);
});

/* ============ 草稿：RAW 缓冲池 ============ */

test('草稿流水 → RAW 事件：不进余额、只进缓冲池计数', () => {
  let st = sampleState();
  st = addTransaction(st, {
    id: 't-draft', date: '2026-11-03', from_id: 'bank', to_id: null, amount: 25, note: '咖啡', status: 'draft',
  });
  const book = adaptBook(st);
  const ev = book.events.find((e) => e.id === 't-draft');

  assert.equal(ev.status, EVENT_STATUS.RAW);
  assert.equal(ev.links.length, 0, 'RAW 没有连线');
  assert.equal(ev.amount, 25);
  assert.equal(ev.rawText, '咖啡');
  assert.equal(book.audit.pending.count, 1);
  assert.equal(book.audit.pending.amount, 25);
  assert.equal(book.audit.doubleEntry.diff, 0, '草稿不动余额');
  assert.equal(compareBalances(book, book.nodes, book.events).mismatched.length, 0);
});

/* ============ 断链：原样投影并报告 ============ */

test('断链流水（旧账里的脏数据）：报告 NO_TO，dangling 与差额如实报出', () => {
  // 绕过 addTransaction 直接塞：模拟「规则生效之前就已经入账」的旧数据。
  // 现在新录入的断链流水在写库时就被降成草稿了，见 drafts.test.mjs。
  const st = raw(sampleState(), {
    id: 't-noend', date: '2026-11-04', from_id: 'bank', to_id: null, amount: 100, note: '', seq: 7,
  });
  const book = adaptBook(st);

  const hit = book.issues.filter((i) => i.txId === 't-noend').map((i) => i.code);
  assert.ok(hit.includes(ADAPT_ISSUE.NO_TO), JSON.stringify(book.issues));

  // 旧模型也只记了转出这一侧 → 新模型必须同样只记一侧，并对不上的差额照实报
  assert.equal(book.audit.dangling, 100);
  assert.equal(book.audit.doubleEntry.diff, -100);
  assert.equal(book.audit.ok, false);
  assert.equal(compareBalances(book, book.nodes, book.events).mismatched.length, 0);
});

test('自环流水：报 SELF_LINK，两端同为一条记录的进出相抵', () => {
  let st = sampleState();
  st = addTransaction(st, { id: 't-self', date: '2026-11-05', from_id: 'bank', to_id: 'bank', amount: 50 });
  const book = adaptBook(st);

  assert.ok(book.issues.some((i) => i.code === ADAPT_ISSUE.SELF_LINK && i.txId === 't-self'));
  assert.equal(book.audit.doubleEntry.diff, 0, '自己转给自己不改变余额');
  assert.equal(book.audit.ok, false, '结构上仍然不合法');
  const bank = compareBalances(book, book.nodes, book.events).rows.find((r) => r.id === 'bank');
  assert.equal(bank.delta, 0);
});

/* ============ 成本类 = 实物池 ============ */

test('成本类账户投影成实物节点：原值透传、残值现算', () => {
  let st = createState();
  st = addAccount(st, { id: 'bank', name: '储蓄卡', type: '资产类' });
  st = addAccount(st, { id: 'pc', name: '电脑', type: '成本类', originalCost: 8000 });
  st = addTransaction(st, { id: 'b1', date: '2026-11-01', from_id: 'bank', to_id: 'pc', amount: 8000 });
  const book = adaptBook(st);
  const pc = book.nodes.find((n) => n.id === 'pc');

  assert.equal(pc.nature, NODE_NATURE.PHYSICAL);
  assert.equal(pc.originalCost, 8000);
  assert.equal(pc.polarity, true, '成本类是 A 极');

  const pb = physicalBook(pc, book.events, book.nodes);
  assert.equal(pb.originalCost, 8000);
  assert.equal(pb.residual, 8000, '建仓当期还没折旧');
  assert.equal(pb.costSource, 'field');
  assert.equal(book.audit.doubleEntry.diff, 0);
});

/* ============ 空类型账户：口径分歧的落点 ============ */

test('空类型账户按旧模型的 B 极投影（不复刻 polarityOfType 的默认 A 极）', () => {
  let st = createState();
  st = addAccount(st, { id: 'bank', name: '储蓄卡', type: '资产类' });
  st = put(st, { id: 'u1', name: '某笔支出', type: '', code: '', category: '', isHidden: false });
  st = raw(st, { id: 't-u1', date: '2026-11-06', from_id: 'bank', to_id: 'u1', amount: 100, note: '', seq: 1 });

  const book = adaptBook(st);
  const u1 = book.nodes.find((n) => n.id === 'u1');
  assert.equal(u1.untyped, true);
  assert.equal(u1.polarity, false, '旧 balanceOf 用 isDebitType("") = false');
  assert.equal(polarityOfType(''), true, '事件引擎的默认值是 A 极 —— 分歧就存在这里');

  // 分歧被显式覆盖掉，所以逐账户仍然一致
  const cmp = compareBalances(book, book.nodes, book.events);
  assert.equal(cmp.mismatched.length, 0);
  assert.equal(balanceOf(st.accounts.find((a) => a.id === 'u1'), st.transactions).balance, -100);
  assert.equal(book.audit.doubleEntry.diff, 0);
});

/* ============ 负额：不静默、不冒充一致 ============ */

test('负额流水：报 NEGATIVE_AMOUNT，对账把差额摆出来而不是抹平', () => {
  let st = sampleState();
  st = raw(st, { id: 't-neg', date: '2026-11-07', from_id: 'bank', to_id: 'food', amount: -50, note: '', seq: 9 });
  const book = adaptBook(st);

  assert.ok(book.issues.some((i) => i.code === ADAPT_ISSUE.NEGATIVE_AMOUNT && i.txId === 't-neg'));
  const ev = book.events.find((e) => e.id === 't-neg');
  assert.equal(ev.amount, 50, '事件模型只存正数');

  const cmp = compareBalances(book, book.nodes, book.events);
  const bank = cmp.rows.find((r) => r.id === 'bank');
  assert.equal(bank.delta, -100, '旧模型把负额当减少，新模型当增加 —— 差 2×50');
  assert.equal(cmp.mismatched.length >= 1, true);
  assert.equal(auditAll(st)[0].ok, false, '有差异就不许报 ok');
});

/* ============ 多账本 ============ */

test('多账本：活动账本 + 快照逐本投影，各算各的', () => {
  const st = sampleState();
  const withLedgers = {
    ...st,
    ledgerNames: { main: '主账本', second: '副账本' },
    ledgers: {
      second: {
        accounts: [
          { id: OPENING_ACCOUNT_ID, name: '期初余额', type: '权益类', isHidden: true },
          { id: 'cash2', name: '现金', type: '资产类' },
        ],
        transactions: [
          { id: 's-open', date: '2026-01-01', from_id: OPENING_ACCOUNT_ID, to_id: 'cash2', amount: 500, opening: true },
        ],
      },
    },
  };

  const books = adaptState(withLedgers);
  assert.equal(books.length, 2);
  assert.equal(books[0].active, true);
  assert.equal(books[0].name, '主账本');
  assert.equal(books[1].name, '副账本');
  assert.equal(books[1].events.length, 1);
  assert.equal(books[1].audit.doubleEntry.diff, 0);

  const summary = auditAll(withLedgers);
  assert.equal(summary.length, 2);
  assert.equal(summary.every((s) => s.ok), true);
  assert.equal(summary[1].accounts, 2);
});
