/**
 * 用新事件引擎重算一本文本账本，逐账户对账。
 *
 *   node nt/tools/audit-book.mjs 账本.txt
 *
 * 账本.txt 用「账户：/ 流水：」两段式 —— 界面「导出文本」出来的就是这个格式。
 * 它只回答一个问题：**这本旧账，新引擎能不能一字不差地重算出来。**
 *   · 双式恒等 ΣA = ΣB 必须是 0
 *   · 每个账户的 balanceOf() 与 balanceOfNode() 必须是同一个数
 *
 * 有不平就退出码 1，并把是哪条流水、哪个账户差多少打出来。
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createState } from '../js/core/state-store.js';
import { replaceLedgerFromText } from '../js/core/flow-text.js';
import { compareBalances, adaptState } from '../js/core/ledger-adapter.js';

const money = (v) => (Number(v) || 0).toFixed(2);
const FILE = process.argv[2];

if (!FILE) {
  console.error('用法：node nt/tools/audit-book.mjs <账本文本.txt>');
  process.exit(2);
}

let text = '';
try {
  text = readFileSync(resolve(FILE), 'utf8');
} catch (e) {
  console.error('读不到文件：' + FILE);
  process.exit(2);
}

const built = replaceLedgerFromText(createState(), text);
const state = built.state;
const books = adaptState(state);
let bad = 0;

if (built.errors && built.errors.length) {
  console.log(`导入告警 ${built.errors.length} 条：`);
  for (const e of built.errors.slice(0, 10)) console.log('  - ' + JSON.stringify(e));
}

for (const book of books) {
  const cmp = compareBalances(book, book.nodes, book.events);
  const d = book.audit.doubleEntry;
  const clean = d.ok && cmp.mismatched.length === 0 && book.audit.dangling === 0;

  console.log(`\n== ${book.name}${book.active ? '（活动账本）' : ''} ==`);
  console.log(`账户 ${book.stats.accounts} · 流水 ${book.stats.transactions} · 事件 ${book.stats.events}`
    + `（已入账 ${book.stats.posted} / 草稿 ${book.stats.drafts}）`);
  console.log(`双式恒等：A ${money(d.aTotal)} / B ${money(d.bTotal)} / 差 ${money(d.diff)} ${d.ok ? '✓' : '✗'}`);
  console.log(`断链金额 ${money(book.audit.dangling)} · 逐账户差异 ${cmp.mismatched.length} 处`
    + `（最大 ${money(cmp.maxDelta)}）${cmp.mismatched.length ? '✗' : '✓'}`);

  if (book.issues.length) {
    console.log(`投影问题 ${book.issues.length} 条：`);
    for (const it of book.issues.slice(0, 20)) {
      console.log(`  - ${it.code}${it.txId ? ' @' + it.txId : ''}：${it.detail}`);
    }
  }

  if (cmp.mismatched.length) {
    console.log('对不上的账户：');
    for (const row of cmp.mismatched.slice(0, 20)) {
      console.log(`  - ${row.name || row.id}（${row.type || '无类型'}）`
        + ` 旧 ${money(row.legacy)} / 新 ${money(row.next)} / 差 ${money(row.delta)}`);
    }
  }

  if (clean) console.log('结论：这本账接得住 —— 新引擎重算与旧算法完全一致。');
  else bad += 1;
}

process.exit(bad ? 1 : 0);
