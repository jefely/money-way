
import test from 'node:test';
import assert from 'node:assert/strict';

import { toTxtText, toCsvText, toYmdShort, exportBaseName } from '../js/core/export-text.js';
import { buildXlsxFiles, colName, xmlEscape, cellXml } from '../js/core/xlsx-write.js';

const STATE = {
  accounts: [
    { type: '资产类', category: '储蓄', code: 'ZHC', name: '招行储', opening: 3000, billDay: '', repayDay: '' },
    { type: '费用类', category: '日常', code: 'CY', name: '餐饮', opening: 0 },
  ],
  transactions: [
    { date: '2026-10-24', from_id: 'a1', to_id: 'a2', amount: 35, note: '午饭' },
    { date: '2026-10-25', from_id: 'a2', to_id: 'a1', amount: 8000, note: '工资, 到账' },
  ],
};

const codeOf = (id) => ({ a1: 'ZHC', a2: 'CY' })[id] || '';

test('toYmdShort 转 YYMMDD', () => {
  assert.equal(toYmdShort('2026-10-24'), '261024');
  assert.equal(toYmdShort(''), '');
});

test('exportBaseName 形如 NT账本_20261027_2130', () => {
  const n = exportBaseName(new Date(2026, 9, 27, 21, 30));
  assert.equal(n, 'NT账本_20261027_2130');
});

test('toTxtText 是 账户段 + 空行 + 流水段', () => {
  const t = toTxtText(STATE, { codeOf });
  const lines = t.split('\n');
  assert.equal(lines[0], '账户');
  assert.equal(lines[1], '资产类，储蓄，ZHC，招行储，3000.00，');
  assert.equal(lines[3], '');
  assert.equal(lines[4], '流水');
  assert.equal(lines[5], '261024，ZHC，CY，35.00，午饭，');
  assert.equal(lines.length, 7);
});

test('toTxtText 用简码而不是 id', () => {
  const t = toTxtText(STATE, { codeOf });
  assert.ok(!t.includes('a1'));
  assert.ok(t.includes('ZHC'));
});

test('toCsvText 制表符分隔 + BOM + CRLF', () => {
  const c = toCsvText(STATE, { codeOf });
  assert.ok(c.startsWith('\ufeff'));
  assert.ok(c.includes('\r\n'));
  const lines = c.slice(1).split('\r\n');
  assert.equal(lines[0], '日期\t转出\t转入\t金额\t备注');
  assert.equal(lines[1], '261024\tZHC\tCY\t35.00\t午饭');
});

test('toCsvText 把备注里的换行和制表符清掉', () => {
  const c = toCsvText(STATE, { codeOf });
  const lines = c.slice(1).split('\r\n');
  assert.equal(lines[2], '261025\tCY\tZHC\t8000.00\t工资, 到账');
});

test('colName 换算列名', () => {
  assert.equal(colName(0), 'A');
  assert.equal(colName(25), 'Z');
  assert.equal(colName(26), 'AA');
  assert.equal(colName(27), 'AB');
});

test('xmlEscape 转义', () => {
  assert.equal(xmlEscape('a&b<c>"d"'), 'a&amp;b&lt;c&gt;&quot;d&quot;');
});

test('cellXml 数字写成 v，文本写成 inlineStr', () => {
  assert.ok(cellXml('A1', 35).includes('<v>35</v>'));
  assert.ok(cellXml('A2', '').includes('/>'));
});

test('cellXml 把 6 位数字（YYMMDD）当文本，不然导不回来', () => {
  const x = cellXml('A1', '261024');
  assert.ok(x.includes('inlineStr'), 'YYMMDD 必须是文本');
  assert.ok(!x.includes('<v>'), '不能写成数值');
  // 普通数字仍然写成数值
  assert.ok(cellXml('B1', '8000').includes('<v>8000</v>'));
  assert.ok(cellXml('B2', '-3.5').includes('<v>-3.5</v>'));
});

test('buildXlsxFiles 生成完整的 5+N 个文件', () => {
  const files = buildXlsxFiles([
    { name: '流水', rows: [['日期'], ['261024']] },
    { name: '账户', rows: [['名称'], ['招行储']] },
  ]);
  const names = files.map((f) => f.name);
  assert.ok(names.includes('[Content_Types].xml'));
  assert.ok(names.includes('_rels/.rels'));
  assert.ok(names.includes('xl/workbook.xml'));
  assert.ok(names.includes('xl/_rels/workbook.xml.rels'));
  assert.ok(names.includes('xl/worksheets/sheet1.xml'));
  assert.ok(names.includes('xl/worksheets/sheet2.xml'));
  assert.equal(files.length, 6);
});

test('buildXlsxFiles 的 sheet 里有数据', () => {
  const files = buildXlsxFiles([{ name: '流水', rows: [['日期', '金额'], ['261024', 35]] }]);
  const sh = files.find((f) => f.name === 'xl/worksheets/sheet1.xml').text;
  assert.ok(sh.includes('inlineStr'));
  assert.ok(sh.includes('261024'));
  assert.ok(sh.includes('<v>35</v>'));
});

test('buildXlsxFiles 的 workbook 里有 sheet 名', () => {
  const files = buildXlsxFiles([{ name: '流水', rows: [] }]);
  const wb = files.find((f) => f.name === 'xl/workbook.xml').text;
  assert.ok(wb.includes('name="流水"'));
});
