// 拼音首字母：用 Intl.Collator('zh') 的拼音排序定位汉字落在哪个字母区间
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { initialOf, initialsOf, isHanzi, initialsMatch } from '../js/core/pinyin.js';

test('常见汉字的拼音首字母', () => {
  const cases = {
    日: 'r', 储: 'c', 餐: 'c', 交: 'j', 工: 'g', 房: 'f', 水: 's', 通: 't',
    医: 'y', 娱: 'y', 购: 'g', 教: 'j', 人: 'r', 保: 'b', 税: 's', 服: 'f',
    零: 'l', 宠: 'c', 旅: 'l', 数: 's', 家: 'j', 还: 'h', 花: 'h', 白: 'b',
    微: 'w', 支: 'z', 现: 'x', 金: 'j', 招: 'z', 信: 'x', 用: 'y', 卡: 'k',
  };
  for (const [ch, want] of Object.entries(cases)) {
    assert.equal(initialOf(ch), want, `${ch} 的首字母`);
  }
});

test('分类常用词 → 首字母串', () => {
  const cases = {
    日常: 'rc',
    储蓄: 'cx',
    餐饮: 'cy',
    交通: 'jt',
    工资: 'gz',
    房租: 'fz',
    水电: 'sd',
    通讯: 'tx',
    医疗: 'yl',
    娱乐: 'yl',
    购物: 'gw',
    教育: 'jy',
    人情: 'rq',
    保险: 'bx',
    税费: 'sf',
    信用卡: 'xyk',
    花呗: 'hb',
    白条: 'bt',
    微信: 'wx',
    支付宝: 'zfb',
  };
  for (const [word, want] of Object.entries(cases)) {
    assert.equal(initialsOf(word), want, `${word} 的首字母`);
  }
});

test('非汉字原样保留（字母小写、数字/标点不动）', () => {
  assert.equal(initialsOf('A1'), 'a1');
  assert.equal(initialsOf('日常-2'), 'rc-2');
  assert.equal(isHanzi('日'), true);
  assert.equal(isHanzi('a'), false);
  assert.equal(initialOf('a'), 'a');
  assert.equal(initialOf(''), '');
});

test('首字母匹配：包含即可，空查询不命中', () => {
  assert.equal(initialsMatch('日常', 'r'), true);
  assert.equal(initialsMatch('日常', 'rc'), true);
  assert.equal(initialsMatch('日常', 'RC'), true, '大小写不敏感');
  assert.equal(initialsMatch('日常', 'c'), true, '日常 = r + c，第二个字的 c 也算');
  assert.equal(initialsMatch('日常', 'x'), false);
  assert.equal(initialsMatch('日常', ''), false);
  assert.equal(initialsMatch('日常', '  '), false);
});
