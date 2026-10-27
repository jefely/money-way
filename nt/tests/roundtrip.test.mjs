
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildXlsx } from '../js/ui/xlsx-write.js';
import { readXlsx } from '../js/ui/xlsx-read.js';
import { analyzeTable } from '../js/core/import-table.js';
import { toTxtText } from '../js/core/export-text.js';
import { parseCsv, tidyRows } from '../js/core/csv.js';

const STATE = {
  accounts: [
    { type: '资产类', category: '储蓄', code: 'ZHC', name: '招行储', opening: 3000 },
    { type: '费用类', category: '日常', code: 'CY', name: '餐饮', opening: 0 },
  ],
  transactions: [
    { date: '2026-10-24', from_id: 'a1', to_id: 'a2', amount: 35, note: '午饭' },
    { date: '2026-10-25', from_id: 'a2', to_id: 'a1', amount: 8000, note: '工资' },
  ],
};
const codeOf = (id) => ({ a1: 'ZHC', a2: 'CY' })[id] || '';

/** 和 export-dialog 里 flowRows 一样的结构 */
function flowRows(state) {
  const rows = [
    ['流水记录'],
    ['格式：日期写 YYMMDD（如 261022）；账户可写简码或全名；金额填数字。'],
    ['序', '日期', '转出账户', '转入账户', '金额', '备注'],
  ];
  state.transactions.forEach((t, i) => {
    const ymd = String(t.date || '').replace(/[^0-9]/g, '').slice(2, 8);
    rows.push([i + 1, ymd, codeOf(t.from_id), codeOf(t.to_id), Number(t.amount) || 0, t.note || '']);
  });
  return rows;
}

test('xlsx 导出 → 导入：流水表和原始一致', async () => {
  const bytes = buildXlsx([{ name: '流水', rows: flowRows(STATE) }]);
  assert.ok(bytes.length > 0, '应该有字节产出');

  const book = await readXlsx(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  assert.equal(book.sheets.length, 1);
  assert.equal(book.sheets[0].name, '流水');

  const res = analyzeTable(book.sheets[0].rows);
  assert.equal(res.kind, 'generic', '应该认成通用流水表');
  assert.equal(res.items.length, 2, '两笔都要读回来');

  assert.equal(res.items[0].date, '2026-10-24');
  assert.equal(res.items[0].amount, 35);
  assert.equal(res.items[0].from, 'ZHC');
  assert.equal(res.items[0].to, 'CY');
  assert.equal(res.items[0].note, '午饭');

  assert.equal(res.items[1].amount, 8000);
  assert.equal(res.items[1].from, 'CY');
});

test('xlsx 里的日期是文本，读回来还是 YYMMDD', async () => {
  const bytes = buildXlsx([{ name: '流水', rows: flowRows(STATE) }]);
  const book = await readXlsx(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const rows = book.sheets[0].rows;
  const dataRow = rows.find((r) => r[1] === '261024');
  assert.ok(dataRow, '日期那一格应该原样是 261024（文本）');
});

test('txt 导出 → CSV 解析：账户和流水段都在', () => {
  const txt = toTxtText(STATE, { codeOf });
  const rows = tidyRows(parseCsv(txt, '，'));
  // 账户段第 0 行是「账户」，第 1 行起是账户
  assert.equal(rows[0][0], '账户');
  assert.equal(rows[1][0], '资产类');
  assert.equal(rows[1][2], 'ZHC');
  // 找到「流水」那一行，后面是流水
  const idx = rows.findIndex((r) => r[0] === '流水');
  assert.ok(idx > 0, '应该有「流水」段标记');
  assert.equal(rows[idx + 1][0], '261024');
  assert.equal(rows[idx + 1][1], 'ZHC');
});

test('xlsx 的字节流是合法 ZIP（PK 头）', () => {
  const bytes = buildXlsx([{ name: '流水', rows: [['a']] }]);
  assert.equal(bytes[0], 0x50);   // P
  assert.equal(bytes[1], 0x4b);   // K
  assert.equal(bytes[2], 0x03);
  assert.equal(bytes[3], 0x04);
  // 末尾应该是 EOCD
  const tail = bytes.slice(-22);
  assert.equal(tail[0], 0x50);
  assert.equal(tail[1], 0x4b);
  assert.equal(tail[2], 0x05);
  assert.equal(tail[3], 0x06);
});
