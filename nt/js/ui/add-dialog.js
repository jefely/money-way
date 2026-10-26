/**
 * 添加账本 / 流水 弹窗（SPA 内，不跳转、不重输密码）
 * 层：第五层 · UI
 *
 * 复用一个文本框：粘贴或载入 .txt，实时解析预览，确认后追加到当前账本。
 */

import * as NtModal from './modal.js';
import { parseLedgerText } from '../core/import-parser.js';
import { appendLedgerFromText } from '../core/flow-text.js';
import { listLedgers, createLedger, switchLedger, renameLedger } from '../core/ledgers.js';

const PLACEHOLDER = [
  '账户：',
  '类型，分类，简码，名称，期初，账单日，还款日，',
  '资产类，现金，XJ，现金，200，',
  '',
  '流水：',
  '日期，转出，转入，金额，备注，',
  '260801，XJ，S，3.5，',
].join('\n');

/**
 * @param {{getState:Function, setState:Function, save?:Function, setFooter?:Function}} ctx
 */
export function openAddDialog(ctx) {
  let text = '';
  let ta = null;
  let info = null;

  function updateInfo() {
    if (!info) return;
    const parsed = parseLedgerText(text);
    const parts = ['账户 ' + parsed.accounts.length + ' 个', '流水 ' + parsed.transactions.length + ' 笔'];
    if (parsed.errors.length) parts.push('错误 ' + parsed.errors.length + ' 行');
    info.textContent = '识别到：' + parts.join('，');
  }

  function applyAdd() {
    const t = String(text || '').trim();
    if (!t) return;
    const r = appendLedgerFromText(ctx.getState(), t);
    ctx.setState(r.state);
    if (ctx.save) ctx.save();
    NtModal.closeAll();
    if (ctx.setFooter) {
      const extra = r.created.length ? `，新建 ${r.created.length} 个账户` : '';
      ctx.setFooter(`已添加 ${r.txAdded} 笔${extra}`);
    }
  }

  function applyState(next) {
    ctx.setState(next);
    if (ctx.save) ctx.save();
  }

  function reopen() {
    NtModal.closeAll();
    openAddDialog(ctx);
  }

  function buildLedgers() {
    const box = document.createElement('div');
    box.className = 'nt-add-ledgers';

    const title = document.createElement('div');
    title.className = 'nt-add-ledgers-title';
    title.textContent = '添加账本';
    box.appendChild(title);

    const st = ctx.getState();
    for (const l of listLedgers(st)) {
      const row = document.createElement('div');
      row.className = 'nt-add-ledger' + (l.active ? ' nt-add-ledger-active' : '');

      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'nt-add-ledger-name';
      sw.textContent = l.name;
      sw.addEventListener('click', () => {
        if (l.active) return;
        applyState(switchLedger(ctx.getState(), l.id));
        reopen();
      });

      const rn = document.createElement('button');
      rn.type = 'button';
      rn.className = 'nt-btn nt-btn-sm nt-add-ledger-rn';
      rn.textContent = '改名';
      rn.addEventListener('click', () => {
        const name = window.prompt('账本名称', l.name);
        if (!name || !name.trim()) return;
        applyState(renameLedger(ctx.getState(), l.id, name));
        reopen();
      });

      row.appendChild(sw);
      row.appendChild(rn);
      box.appendChild(row);
    }

    const input = document.createElement('input');
    input.className = 'nt-add-ledger-input';
    input.placeholder = '输入新账本名称…';

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'nt-btn nt-btn-sm';
    addBtn.textContent = '添加';
    addBtn.addEventListener('click', () => {
      const n = input.value.trim();
      if (!n) return;
      applyState(createLedger(ctx.getState(), n));
      reopen();
    });

    const row = document.createElement('div');
    row.className = 'nt-add-ledger-new';
    row.appendChild(input);
    row.appendChild(addBtn);
    box.appendChild(row);

    return box;
  }

  return NtModal.open({
    title: '添加账本 · 流水记录',
    build: (body) => {
      body.appendChild(buildLedgers());

      ta = document.createElement('textarea');
      ta.className = 'nt-add-text';
      ta.placeholder = PLACEHOLDER;

      const bar = document.createElement('div');
      bar.className = 'nt-add-bar';

      const loadBtn = document.createElement('button');
      loadBtn.type = 'button';
      loadBtn.className = 'nt-btn nt-btn-sm';
      loadBtn.textContent = '载入 .txt';

      const file = document.createElement('input');
      file.type = 'file';
      file.accept = '.txt,text/plain';
      file.hidden = true;
      loadBtn.addEventListener('click', () => file.click());
      file.addEventListener('change', async () => {
        const f = file.files && file.files[0];
        if (!f) return;
        text = await f.text();
        ta.value = text;
        updateInfo();
      });

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'nt-btn nt-btn-sm';
      saveBtn.textContent = '另存 .txt';
      saveBtn.addEventListener('click', () => {
        const blob = new Blob([ta.value], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'nt-流水.txt';
        a.click();
        URL.revokeObjectURL(a.href);
      });

      bar.appendChild(loadBtn);
      bar.appendChild(saveBtn);
      bar.appendChild(file);

      info = document.createElement('div');
      info.className = 'nt-add-info';
      info.textContent = '识别到：账户 0 个，流水 0 笔';

      ta.addEventListener('input', () => {
        text = ta.value;
        updateInfo();
      });

      body.appendChild(ta);
      body.appendChild(bar);
      body.appendChild(info);
    },
    actions: [
      { label: '确认添加', kind: 'primary', onClick: applyAdd },
    ],
  });
}
