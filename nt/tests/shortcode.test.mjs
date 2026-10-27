/**
 * 简码体系测试：索引 / 解析 / 候选 / V7 校验 / 改名改码不断链。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createAccount, normalizeCode, isValidCode, ACCOUNT_TYPE,
  CODE_MIN_LEN, CODE_MAX_LEN, OPENING_ACCOUNT,
} from '../js/core/schema.js';
import { buildAccountIndex, getByCode, getByName, getById } from '../js/core/account-index.js';
import {
  resolveAccount, suggestAccounts, parseAccountInput, MAX_SUGGEST, MIN_SUGGEST_LEN,
  ensurePendingAccount, findPendingAccount, PENDING_NAME,
} from '../js/core/account-resolver.js';
import { validate, issuesOf } from '../js/core/validator.js';
import { createState, addAccount, updateAccount, addTransaction } from '../js/core/state-store.js';
import { balanceOf } from '../js/core/balance-calculator.js';

/* ---------- 造数据 ---------- */

function accounts() {
  return [
    { id: 'acc_bank', code: 'JHC', name: '交行储8380', type: ACCOUNT_TYPE.ASSET, category: '储蓄' },
    { id: 'acc_card', code: 'ZHC', name: '招行信用卡', type: ACCOUNT_TYPE.LIABILITY, category: '信用卡' },
    { id: 'acc_food', code: 'CY', name: '餐饮', type: ACCOUNT_TYPE.EXPENSE, category: '餐饮' },
    { id: 'acc_traffic', code: 'JT', name: '交通', type: ACCOUNT_TYPE.EXPENSE, category: '交通' },
  ];
}

/* ---------- schema：简码规范化 ---------- */

test('简码归一化：去空白、转大写', () => {
  assert.equal(normalizeCode(' jhc '), 'JHC');
  assert.equal(normalizeCode('JhC'), 'JHC');
  assert.equal(normalizeCode(''), '');
  assert.equal(normalizeCode(null), '');
});

test('简码合法性：2~5 位字母/数字', () => {
  assert.equal(isValidCode('JH'), true);
  assert.equal(isValidCode('JHC'), true);
  assert.equal(isValidCode('ABCDE'), true);
  assert.equal(isValidCode('A'), false, '1 位太短');
  assert.equal(isValidCode('ABCDEF'), false, '6 位太长');
  assert.equal(isValidCode('交行'), false, '必须是字母/数字');
  assert.equal(CODE_MIN_LEN, 2);
  assert.equal(CODE_MAX_LEN, 5);
});

test('createAccount 会自动把 code 转大写', () => {
  const a = createAccount({ name: 'x', code: 'jhc' });
  assert.equal(a.code, 'JHC');
});

/* ---------- 索引 ---------- */

test('索引：三张 Map 都建好，查询 O(1)', () => {
  const list = accounts();
  const idx = buildAccountIndex(list);

  assert.equal(getByCode(idx, 'jhc').id, 'acc_bank', '大小写不敏感');
  assert.equal(getByCode(idx, 'JHC').id, 'acc_bank');
  assert.equal(getByName(idx, '餐饮').id, 'acc_food');
  assert.equal(getById(idx, 'acc_card').name, '招行信用卡');
  assert.equal(getByCode(idx, 'NOPE'), null);
  assert.equal(idx.size, 4);
});

test('索引：重复简码与缺失简码会被记下来（交给 V7 报错）', () => {
  const idx = buildAccountIndex([
    { id: 'a', code: 'AB', name: '甲' },
    { id: 'b', code: 'ab', name: '乙' },
    { id: 'c', code: '', name: '丙' },
  ]);
  assert.deepEqual(idx.duplicateCodes, ['AB']);
  assert.deepEqual(idx.missingCode, ['c']);
});

/* ---------- 解析 ---------- */

test('解析：简码优先于名字', () => {
  const idx = buildAccountIndex(accounts());
  const r1 = resolveAccount(idx, 'jhc');
  assert.equal(r1.acc.id, 'acc_bank');
  assert.equal(r1.via, 'code');

  const r2 = resolveAccount(idx, '交行储8380');
  assert.equal(r2.acc.id, 'acc_bank');
  assert.equal(r2.via, 'name');

  const r3 = resolveAccount(idx, '不存在的');
  assert.equal(r3.acc, null);
});

test('解析：模拟「用户只打了简码就回车」→ 回填真实名', () => {
  const idx = buildAccountIndex(accounts());
  const p = parseAccountInput(idx, 'zhc');
  assert.equal(p.acc.id, 'acc_card');
  assert.equal(p.display, '招行信用卡', '输入框要换成真实名，方便人眼核对');
  assert.equal(p.via, 'code');
});

test('解析：唯一候选时替用户选掉（省一次点击）', () => {
  const idx = buildAccountIndex(accounts());
  // "交行" 只命中一个
  const p = parseAccountInput(idx, '交行');
  assert.equal(p.acc.id, 'acc_bank');
  assert.equal(p.via, 'unique-suggest');
});

test('候选：至少 2 个字符才弹，最多 5 条', () => {
  const idx = buildAccountIndex(accounts());
  assert.deepEqual(suggestAccounts(idx, 'j'), [], '1 个字符不弹');
  assert.equal(MIN_SUGGEST_LEN, 2);

  const many = [];
  for (let i = 0; i < 20; i++) many.push({ id: 'a' + i, code: 'AA' + i, name: '账户' + i });
  const idx2 = buildAccountIndex(many);
  assert.equal(suggestAccounts(idx2, 'aa').length, MAX_SUGGEST);
});

test('候选排序：简码前缀优先于名字包含', () => {
  const idx = buildAccountIndex(accounts());
  const hits = suggestAccounts(idx, 'cy');
  assert.equal(hits[0].acc.id, 'acc_food', '简码 CY 前缀命中排第一');

  const hits2 = suggestAccounts(idx, '交通');
  assert.equal(hits2[0].acc.id, 'acc_traffic');
});

test('候选排除隐藏账户（期初）', () => {
  const list = accounts().concat([{ ...OPENING_ACCOUNT }]);
  const idx = buildAccountIndex(list);
  const hits = suggestAccounts(idx, '__');
  assert.equal(hits.some((h) => h.acc.isHidden), false);
});

/* ---------- V7 校验 ---------- */

test('V7：缺简码 / 重复简码 / 长度不合法 都会报', () => {
  const bad = [
    { id: 'a', code: 'AB', name: '甲', type: '资产类' },
    { id: 'b', code: 'ab', name: '乙', type: '资产类' },
    { id: 'c', code: '', name: '丙', type: '资产类' },
    { id: 'd', code: 'X', name: '丁', type: '资产类' },
  ];
  const r = validate({ accounts: bad, transactions: [] });
  const v7 = issuesOf(r, 'V7');
  assert.equal(v7.length, 3, '重复 1 + 缺失 1 + 长度不合法 1');
  assert.equal(r.ok, false);
});

test('V7：正常账户表不报错', () => {
  const r = validate({ accounts: accounts(), transactions: [] });
  assert.equal(issuesOf(r, 'V7').length, 0);
});

test('V7：期初虚拟账户不参与简码约束', () => {
  const list = accounts().concat([{ ...OPENING_ACCOUNT }]);
  const r = validate({ accounts: list, transactions: [] });
  assert.equal(issuesOf(r, 'V7').length, 0);
});

/* ---------- V3 改成按 ID 判定（改名不再误报） ---------- */

test('V3：断链按 ID 判定，改账户名不会误报', () => {
  let s = createState();
  s = addAccount(s, { id: 'acc_x', code: 'AA', name: '甲', type: ACCOUNT_TYPE.ASSET });
  s = addAccount(s, { id: 'acc_y', code: 'BB', name: '乙', type: ACCOUNT_TYPE.EXPENSE });
  s = addTransaction(s, { date: '2026-08-01', from_id: 'acc_x', to_id: 'acc_y', amount: 10 });

  // 改名
  const renamed = updateAccount(s, 'acc_x', { name: '甲改名了' });

  const r = validate({ accounts: renamed.accounts, transactions: renamed.transactions });
  assert.equal(issuesOf(r, 'V3').length, 0, '改成名字后不该再报断链');
});

/* ---------- 端到端：改简码 / 改名不影响历史流水 ---------- */

test('★ 改简码：历史流水一分不差，且用新简码还能解析到同一个账户', () => {
  let s = createState();
  s = addAccount(s, { id: 'acc_x', code: 'JHC', name: '交行储', type: ACCOUNT_TYPE.ASSET });
  s = addAccount(s, { id: 'acc_y', code: 'CY', name: '餐饮', type: ACCOUNT_TYPE.EXPENSE });
  s = addTransaction(s, { date: '2026-08-01', from_id: 'acc_x', to_id: 'acc_y', amount: 128.5 });

  const before = balanceOf(s.accounts.find((a) => a.id === 'acc_x'), s.transactions).balance;

  // 用户把简码从 JHC 改成 JHK
  const changed = updateAccount(s, 'acc_x', { code: 'JHK' });
  const idx = buildAccountIndex(changed.accounts);

  const after = balanceOf(changed.accounts.find((a) => a.id === 'acc_x'), changed.transactions).balance;
  assert.equal(after, before, '改简码不该影响一分钱');

  assert.equal(getByCode(idx, 'JHC'), null, '旧简码要失效');
  assert.equal(getByCode(idx, 'jhk').id, 'acc_x', '新简码生效');
  assert.equal(changed.transactions[0].from_id, 'acc_x', '流水仍然只认 ID');
});

/* ---------- 导入兜底账户：待分类 ---------- */

test('ensurePendingAccount 建「待分类」，且不改原 state', () => {
  const s0 = createState();
  const base = s0.accounts.length;          // 空账本里也有期初虚拟账户，不能写死 0
  const r1 = ensurePendingAccount(s0);

  assert.equal(r1.created, true);
  assert.equal(r1.acc.name, PENDING_NAME);
  assert.equal(r1.acc.code, 'DCL');
  assert.equal(r1.acc.type, ACCOUNT_TYPE.ASSET);
  assert.equal(r1.state.accounts.length, base + 1);
  assert.equal(s0.accounts.length, base, '原 state 必须原封不动（state 是不可变更新的）');
});

test('ensurePendingAccount 第二次复用同一个，不再新建', () => {
  const base = createState().accounts.length;
  const r1 = ensurePendingAccount(createState());
  const r2 = ensurePendingAccount(r1.state);

  assert.equal(r2.created, false);
  assert.equal(r2.acc.id, r1.acc.id);
  assert.equal(r2.state.accounts.length, base + 1);
});

test('findPendingAccount 认名字不认简码', () => {
  const r1 = ensurePendingAccount(createState());
  assert.equal(findPendingAccount(r1.state).id, r1.acc.id);
  assert.equal(findPendingAccount(createState()), null);
});

test('「待分类」的简码能被解析回来（导入后用户要能找到它）', () => {
  const r1 = ensurePendingAccount(createState());
  const idx = buildAccountIndex(r1.state.accounts);
  assert.equal(parseAccountInput(idx, 'DCL').acc.id, r1.acc.id);
  assert.equal(parseAccountInput(idx, PENDING_NAME).acc.id, r1.acc.id);
});
