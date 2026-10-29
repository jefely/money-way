/**
 * 备注表（state-store 里的 notes）
 *
 * 用户 2026-10-29：备注体系只做统计分类 + 备注栏里输入简码时自动代入文本；
 * 类型 / 关键字都可以不填；填了就按「类型，关键字，内容」中文逗号拼接代入。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createState, addNote, updateNote, removeNote, noteTextByCode, noteTypesOf, NOTE_TYPES,
} from '../js/core/state-store.js';

test('备注：新增后能按简码取到文本（简码归一化成大写）', () => {
  let s = createState();
  assert.deepEqual(s.notes, [], '新账本自带空备注表');

  s = addNote(s, { code: 'm1', type: '成员', text: '张三' });
  assert.equal(s.notes.length, 1);
  assert.equal(s.notes[0].code, 'M1');
  assert.equal(noteTextByCode(s, 'm1'), '成员：张三');
  assert.equal(noteTextByCode(s, ' M1 '), '成员：张三', '去空白后仍命中');
  assert.equal(noteTextByCode(s, 'nope'), '');
  assert.equal(noteTextByCode(s, ''), '');
});

test('备注：类型 / 关键字可以都不填，只剩内容', () => {
  let s = createState();
  s = addNote(s, { code: 'x', type: '', keyword: '', text: '午饭' });
  assert.equal(noteTextByCode(s, 'X'), '午饭');
});

test('备注：类型和关键字填写后按「类型，关键字，内容」代入', () => {
  let s = createState();
  s = addNote(s, { code: 'm2', type: '成员', keyword: '张三', text: '报销' });
  assert.equal(noteTextByCode(s, 'M2'), '成员：张三，报销');

  // 只填关键字
  s = addNote(s, { code: 'k1', type: '', keyword: '装修', text: '二期' });
  assert.equal(noteTextByCode(s, 'K1'), '装修，二期');
});

test('备注：类型可以自由输入（新增的类型会进类型库）', () => {
  let s = createState();
  assert.deepEqual(NOTE_TYPES, ['成员', '商家', '项目', '用途']);

  s = addNote(s, { code: 'x', type: '客户', text: 'a' });
  assert.equal(s.notes[0].type, '客户');
  assert.ok(noteTypesOf(s).includes('客户'));
});

test('备注：更新与删除', () => {
  let s = createState();
  s = addNote(s, { code: 'p1', type: '项目', text: '装修' });
  const id = s.notes[0].id;

  s = updateNote(s, id, { text: '装修（二期）', keyword: '房子' });
  assert.equal(noteTextByCode(s, 'P1'), '项目：房子，装修（二期）');

  s = removeNote(s, id);
  assert.equal(s.notes.length, 0);
  assert.equal(noteTextByCode(s, 'P1'), '');
});

test('备注：同简码不覆盖，取第一个（唯一性由 UI 把关）', () => {
  let s = createState();
  s = addNote(s, { code: 'A', type: '成员', text: '甲' });
  s = addNote(s, { code: 'a', type: '商家', text: '乙' });
  assert.equal(s.notes.length, 2);
  assert.equal(noteTextByCode(s, 'A'), '成员：甲');
});
