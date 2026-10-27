// 表格与文件解析的纯函数测试
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  xmlDecode, colIndex, parseSharedStrings, parseSheetRows,
  excelSerialToISO, listSheets,
} from '../js/core/xlsx-xml.js';
import { parseCsv, guessDelimiter, tidyRows } from '../js/core/csv.js';

test('xmlDecode 处理常见实体', () => {
  assert.equal(xmlDecode('a&amp;b'), 'a&b');
  assert.equal(xmlDecode('&lt;x&gt;'), '<x>');
  assert.equal(xmlDecode('&quot;q&quot;'), '"q"');
  assert.equal(xmlDecode('&#65;&#66;'), 'AB');
  assert.equal(xmlDecode('&#x41;'), 'A');
});

test('colIndex 把列名换成 0 基索引', () => {
  assert.equal(colIndex('A1'), 0);
  assert.equal(colIndex('B2'), 1);
  assert.equal(colIndex('Z9'), 25);
  assert.equal(colIndex('AA1'), 26);
  assert.equal(colIndex('AB1'), 27);
  assert.equal(colIndex(''), -1);
});

test('parseSharedStrings 拼接富文本分段', () => {
  const xml = '<sst><si><t>hello</t></si><si><r><t>a</t></r><r><t>b</t></r></si></sst>';
  assert.deepEqual(parseSharedStrings(xml), ['hello', 'ab']);
  assert.deepEqual(parseSharedStrings(''), []);
});

test('parseSheetRows 按 ref 定位，空单元格不吞后面的值', () => {
  const xml = '<sheetData>'
    + '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>'
    + '</sheetData>';
  const rows = parseSheetRows(xml, ['甲', '乙']);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], ['甲', '', '乙']);
});

test('parseSheetRows 处理自闭合空单元格', () => {
  const xml = '<row r="1"><c r="A1"/><c r="B1" t="inlineStr"><is><t>有值</t></is></c></row>';
  const rows = parseSheetRows(xml, []);
  assert.deepEqual(rows[0], ['', '有值']);
});

test('parseSheetRows 保留行号空洞', () => {
  const xml = '<row r="1"><c r="A1"><v>1</v></c></row><row r="3"><c r="A3"><v>3</v></c></row>';
  const rows = parseSheetRows(xml, []);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], ['1']);
  assert.deepEqual(rows[1], []);
  assert.deepEqual(rows[2], ['3']);
});

test('excelSerialToISO 换算日期', () => {
  // 1900-03-01 之后都是准的（Excel 的 1900 闰年 bug 只影响之前）
  assert.equal(excelSerialToISO(45000), '2023-03-15');
  assert.equal(excelSerialToISO(61), '1900-03-01');
  // 序列号 1 换算出来是 1899-12-31：Excel 显示 1900-01-01，
  // 因为它把不存在的 1900-02-29 算进去了。记账用不到这个区间。
  assert.equal(excelSerialToISO(1), '1899-12-31');
  assert.equal(excelSerialToISO(0), '');
  assert.equal(excelSerialToISO('abc'), '');
});

test('listSheets 从 workbook 与 rels 配对', () => {
  const wb = '<workbook><sheets><sheet name="流水" sheetId="1" r:id="rId1"/>'
    + '<sheet name="账户" sheetId="2" r:id="rId2"/></sheets></workbook>';
  const rels = '<Relationships>'
    + '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/>'
    + '<Relationship Id="rId2" Target="worksheets/sheet2.xml"/>'
    + '</Relationships>';
  const out = listSheets(wb, rels);
  assert.equal(out.length, 2);
  assert.equal(out[0].name, '流水');
  assert.equal(out[0].target, 'worksheets/sheet1.xml');
});

test('guessDelimiter 认逗号与制表符', () => {
  assert.equal(guessDelimiter('a,b,c'), ',');
  assert.equal(guessDelimiter('a\tb\tc'), '\t');
  assert.equal(guessDelimiter('a;b;c'), ';');
});

test('parseCsv 基本切分', () => {
  assert.deepEqual(parseCsv('a,b\nc,d'), [['a', 'b'], ['c', 'd']]);
});

test('parseCsv 引号内的逗号和换行', () => {
  const rows = parseCsv('x,"a,b",y\n"多\n行",2,3');
  assert.deepEqual(rows[0], ['x', 'a,b', 'y']);
  assert.deepEqual(rows[1], ['多\n行', '2', '3']);
});

test('parseCsv 处理双引号转义', () => {
  assert.deepEqual(parseCsv('a,"他说""好""",c')[0], ['a', '他说"好"', 'c']);
});

test('parseCsv 去掉 BOM', () => {
  assert.deepEqual(parseCsv('\uFEFFa,b')[0], ['a', 'b']);
});

test('parseCsv 收尾没有换行也能拿到最后一行', () => {
  assert.deepEqual(parseCsv('a,b\nc,d'), [['a', 'b'], ['c', 'd']]);
});

test('tidyRows 去空白并丢空行', () => {
  const out = tidyRows([[' a ', 'b'], ['', ''], ['c', ' d ']]);
  assert.deepEqual(out, [['a', 'b'], ['c', 'd']]);
});
