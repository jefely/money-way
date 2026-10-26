/**
 * 流水文本编辑器（整页）
 *
 * 为什么是整页而不是弹窗：手机上改流水，要的是「一屏全是字、随手改、底部实时说清
 * 楚能不能存」。弹窗会挡掉一半屏幕、还要开开关关。
 *
 * 本文件只做：载入文本 → 实时解析给反馈 → 保存时调 core 的纯函数。
 * 解析、替换、追加的逻辑全在 core/flow-text.js（有测试）。
 */

import {
  transactionsToText, replaceTransactionsFromText, appendTransactionsFromText,
} from './core/flow-text.js';
import { parseImportText } from './core/import-parser.js';
import { initTheme } from './ui/theme-manager.js';
import { showGate, hideGate } from './ui/gate.js';
import { loadTemplates } from './ui/render-transactions.js';
import { hasVault, unlockVault, createVault, saveState } from './browser/db.js';
import { migrate } from './core/migrate.js';
import { createState, addAccount } from './core/state-store.js';
import { ACCOUNT_TYPE } from './core/schema.js';

const el = (id) => document.getElementById(id);

let state = createState();
let dirty = false;
let parseTimer = 0;
let tipTimer = 0;

/* ---------- 载入 ---------- */

function loadFromState() {
  const text = transactionsToText(state);
  el('te-editor').value = text;
  dirty = false;
  reparse();
  updateCount();
}

/* ---------- 实时解析（不写库，只给反馈） ---------- */

function reparse() {
  const text = el('te-editor').value;
  const parsed = parseImportText(text);
  const status = el('te-status');
  const issues = el('te-issues');

  status.classList.remove('ok', 'bad');

  if (!text.trim()) {
    status.textContent = '空。每行一笔：日期  转出  转入  金额  备注';
    issues.hidden = true;
    return parsed;
  }

  if (parsed.stats.bad === 0) {
    status.textContent = `${parsed.stats.ok} 笔 · 格式正常`;
    status.classList.add('ok');
    issues.hidden = true;
  } else {
    status.textContent = `${parsed.stats.ok} 笔可存 · ${parsed.stats.bad} 行有错`;
    status.classList.add('bad');
    issues.hidden = false;
    issues.textContent = '';
    for (const e of parsed.errors.slice(0, 12)) {
      const line = document.createElement('div');
      line.textContent = `第 ${e.line} 行：${e.message}`;
      issues.appendChild(line);
    }
    if (parsed.errors.length > 12) {
      const more = document.createElement('div');
      more.textContent = `…还有 ${parsed.errors.length - 12} 行`;
      issues.appendChild(more);
    }
  }
  return parsed;
}

function updateCount() {
  const v = el('te-editor').value;
  const lines = v ? v.split('\n').filter((l) => l.trim()).length : 0;
  el('te-count').textContent = lines ? `${lines} 行` : '';
}

/* ---------- 保存 ---------- */

async function save(mode) {
  const text = el('te-editor').value;
  const parsed = parseImportText(text);

  if (parsed.stats.bad > 0) {
    tip(`${parsed.stats.bad} 行有错，先改掉再存`);
    el('te-issues').hidden = false;
    return;
  }
  if (!parsed.rows.length) {
    tip('没有可保存的行');
    return;
  }

  const fn = mode === 'append' ? appendTransactionsFromText : replaceTransactionsFromText;
  const r = fn(state, text);
  state = r.state;

  try {
    await saveState(state);
  } catch (e) {
    tip('保存失败：' + e.message);
    return;
  }

  dirty = false;
  tip(mode === 'append'
    ? `追加 ${r.added} 笔`
    : `已保存 ${r.added} 笔${r.created.length ? `，新建 ${r.created.length} 个账户` : ''}`);

  // 保存后重新按 state 生成文本（把简码/格式统一）
  loadFromState();
}

/* ---------- 小提示 ---------- */

function tip(text) {
  let node = document.querySelector('.te-tip');
  if (!node) {
    node = document.createElement('div');
    node.className = 'te-tip';
    document.body.appendChild(node);
  }
  node.textContent = text;
  node.classList.add('show');
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => node.classList.remove('show'), 1800);
}

/* ---------- 启动 ---------- */

function seed() {
  let s = createState();
  s = addAccount(s, { id: 'acc_cash', code: 'XJ', name: '现金', type: ACCOUNT_TYPE.ASSET, category: '现金' });
  s = addAccount(s, { id: 'acc_bank', code: 'ZHC', name: '招行储', type: ACCOUNT_TYPE.ASSET, category: '储蓄' });
  s = addAccount(s, { id: 'acc_food', code: 'CY', name: '餐饮', type: ACCOUNT_TYPE.EXPENSE, category: '日常' });
  return s;
}

function enter() {
  hideGate();
  el('te-app').hidden = false;
  loadFromState();
  const ed = el('te-editor');
  ed.focus();
  // 光标默认在末尾，浏览器会把内容横向滚到右边 —— 这里强制回到左上角
  ed.scrollLeft = 0;
  ed.scrollTop = 0;
}

async function boot() {
  initTheme();
  await loadTemplates();

  const ed = el('te-editor');

  // 输入即解析（200ms 防抖），不打库
  ed.addEventListener('input', () => {
    dirty = true;
    updateCount();
    clearTimeout(parseTimer);
    parseTimer = setTimeout(() => reparse(), 200);
  });

  // Ctrl/Cmd + S 保存
  ed.addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key === 's') {
      ev.preventDefault();
      save('replace');
    }
  });

  el('te-save').addEventListener('click', () => save('replace'));
  el('te-append').addEventListener('click', () => save('append'));

  el('te-reload').addEventListener('click', () => {
    if (dirty && !window.confirm('放弃当前未保存的修改，从账本重新载入？')) return;
    loadFromState();
    tip('已重新载入');
  });

  // 离开前提醒
  window.addEventListener('beforeunload', (ev) => {
    if (!dirty) return;
    ev.preventDefault();
    ev.returnValue = '';
  });

  const exists = await hasVault();
  showGate(exists, {
    onUnlock: async (pw) => {
      const res = await unlockVault(pw);
      if (res.ok) {
        state = res.state && Array.isArray(res.state.transactions)
          ? migrate(res.state).state
          : seed();
        enter();
      }
      return res;
    },
    onSetup: async (pw) => {
      state = seed();
      try {
        await createVault(state, pw);
        enter();
        return { ok: true };
      } catch (e) {
        return { ok: false, error: '设置失败：' + e.message };
      }
    },
  });
}

boot();
