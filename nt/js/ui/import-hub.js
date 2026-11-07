// 界面：流水工具条「导入」→ 一个窗口里同时做文件导入和文本导入
/**
 * 导入入口（UI 层）
 *
 * 用户 2026-11：不要再弹第二层「导入预览」，把预览并进这个窗口；
 * 布局照给定样式：
 *   文件导入（起始日期 / 我的账户 / 打开 / 导入 + 预览框）
 *   文本导入（打开 / 导入 + 文本框）
 *
 * 解析全在 core（xlsx-read / import-table / bill-plan），这里只管
 * 选择文件、拼预览文字、把结果交给 onImport。
 */

import * as NtModal from './modal.js';
import { readAnyTable } from './xlsx-read.js';
import { analyzeTable } from '../core/import-table.js';
import { planBillImport, previewLine } from '../core/bill-plan.js';
import { myAccountPick } from './import-bill.js';
import { money } from '../core/format.js';
import { pickTemplateSheets } from '../core/xlsx-template.js';
import { isBackupText } from '../core/backup-file.js';
import { readBackupFile, backupSummary } from './import-backup.js';
import { pickTextFile } from './file-io.js';

const PLACEHOLDER = [
  '账户：',
  '类型，分类，简码，名称，期初，账单日，还款日，',
  '',
  '流水：',
  '日期，转出，转入，金额，备注，',
  '260801，XJ，ZHC，3.5，午饭',
].join('\n');

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

const hint = (text, strong) => el('p', strong ? 'nt-sync-hint nt-imp-h' : 'nt-sync-hint nt-imp-sub', text);

function labelOf(text, control) {
  const label = el('label', 'nt-imp-cell', text + ' ');
  control.classList.add('nt-input', 'nt-input-sm');
  label.appendChild(control);
  return label;
}

/** 一段：标题 + 说明在左，按钮在右（照「添加账本·流水记录」的样式） */
function section(title, desc, buttons) {
  const head = el('div', 'nt-imp-head');
  const lead = el('div', 'nt-imp-lead');
  lead.appendChild(hint(title, true));
  lead.appendChild(hint(desc));
  head.appendChild(lead);
  if (buttons && buttons.length) {
    const acts = el('div', 'nt-imp-acts');
    for (const b of buttons) acts.appendChild(b);
    head.appendChild(acts);
  }
  return head;
}

const button = (text, cls) => {
  const b = el('button', cls || 'nt-btn nt-btn-sm', text);
  b.type = 'button';
  return b;
};

/**
 * @param {{
 *   getAccounts?:()=>Array, accounts?:Array,
 *   onImport?:(result:object)=>void,
 *   onImportTemplate?:(state:object, stats:object)=>void,
 *   onBackup?:(text:string)=>void,
 *   mergeText?:(text:string)=>number,
 *   setFooter?:(text:string)=>void,
 * }} opts
 */
export function openImportHub(opts) {
  const o = opts || {};
  const accounts = typeof o.getAccounts === 'function' ? o.getAccounts() : (o.accounts || []);

  let dlg = null;
  let result = null;
  let ta = null;
  let previewEl = null;
  let fromEl = null;
  let mySel = null;
  let myWrap = null;
  let backupErr = null;
  let backup = null;
  let pwWrap = null;
  let pwEl = null;

  const refresh = () => {
    if (!previewEl) return;
    if (!result) {
      previewEl.value = '';
      return;
    }
    const from = fromEl ? fromEl.value || '' : '';
    const myId = mySel ? mySel.value || '' : '';

    if (result.kind === 'bill') {
      const plan = planBillImport(result.items, {
        accounts,
        from,
        presetId: result.presetId,
        myAccountId: myId,
      });
      const s = plan.stats;
      const lines = [result.note];
      lines.push(from ? `起始日之后 ${s.kept} 笔（早于它跳过 ${s.before} 笔）` : `可导入 ${s.kept} 笔`);
      lines.push(`支出 ${money(s.sumOut)} / 收入 ${money(s.sumIn)}`);
      if (s.neutral) lines.push(`中性交易 ${s.neutral} 笔跳过（不计收支 / 转账）`);
      if (s.willCreate) lines.push(`将按分类新建 ${s.willCreate} 个节点`);
      lines.push('');
      for (const row of plan.rows.slice(0, 10)) lines.push(previewLine(row));
      if (plan.rows.length > 10) lines.push(`…… 还有 ${plan.rows.length - 10} 笔`);
      previewEl.value = lines.join('\n');
      return;
    }

    if (result.kind === 'generic') {
      const lines = [result.note, ''];
      for (const it of result.items.slice(0, 10)) {
        lines.push(`${it.date}  ${money(it.amount)}  ${it.from || '?'} → ${it.to || '?'}  ${it.note || ''}`.trim());
      }
      if (result.items.length > 10) lines.push(`…… 还有 ${result.items.length - 10} 笔`);
      previewEl.value = lines.join('\n');
      return;
    }

    previewEl.value = `${result.note}\n\n`
      + '可以换一个文件；如果是任意表格，也可以把内容粘到下面的「文本导入」。';
  };

  /** 账单段：只收账单/表格。备份类文件提示用户去下面的「备份文件导入」 */
  async function loadBillFile(file) {
    if (!file) return;
    result = null;
    if (previewEl) previewEl.value = `正在读取 ${file.name} …`;

    if (/\.lz$/i.test(file.name)) {
      if (previewEl) previewEl.value = '这是 .lz 快照，请用下面的「备份文件导入」。';
      return;
    }

    if (!/\.xlsx?$/i.test(file.name)) {
      let text = '';
      try { text = await file.text(); } catch (e) { text = ''; }
      if (isBackupText(text)) {
        if (previewEl) previewEl.value = '这是加密备份，请用下面的「备份文件导入」。';
        return;
      }
    }

    try {
      const book = await readAnyTable(file);
      const picked = pickTemplateSheets(book.sheets);
      if (picked.isTemplate) {
        if (previewEl) previewEl.value = '这是整本 Excel 备份，请用下面的「备份文件导入」。';
        return;
      }
      const sheet = book.sheets[0];
      if (!sheet) throw new Error('这个文件里没有可读的表');
      const r = analyzeTable(sheet.rows);
      r.fileName = file.name;
      r.sheetName = sheet.name;
      result = r;
      if (mySel && r.kind === 'bill') {
        const pick = myAccountPick(accounts, r.presetId, r.hints && r.hints.cardTail);
        if (pick) mySel.value = pick.id;
      }
      refresh();
    } catch (e) {
      if (previewEl) previewEl.value = '读取失败：' + ((e && e.message) || e);
    }
  }

  function pickFile(accept, onPick) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.remove();
      await onPick(file);
    });
    input.click();
  }

  const openBillFile = () => pickFile('.xlsx,.csv,.txt,.tsv,.json', loadBillFile);

  function openBackupFile() {
    pickFile('.lz,.txt,.json,.xlsx', async (file) => {
      if (!file) return;
      backup = null;
      if (backupErr) backupErr.textContent = '';
      if (pwWrap) pwWrap.hidden = true;
      try {
        backup = await readBackupFile(file);
        if (previewEl) previewEl.value = backupSummary(backup);
        if (pwWrap) pwWrap.hidden = backup.kind !== 'backup';
      } catch (e) {
        if (previewEl) previewEl.value = '';
        if (backupErr) backupErr.textContent = (e && e.message) || String(e);
      }
    });
  }

  async function doBackupImport() {
    if (!backup) {
      if (backupErr) backupErr.textContent = '先「打开」一个备份文件';
      return;
    }
    if (backup.kind === 'backup') {
      const pw = (pwEl && pwEl.value) || '';
      if (!pw) {
        if (backupErr) backupErr.textContent = '需要账本密码';
        return;
      }
      if (typeof o.restoreBackup !== 'function') {
        if (backupErr) backupErr.textContent = '当前不能恢复加密备份';
        return;
      }
      try {
        const state = await o.restoreBackup(backup.text, pw);
        if (dlg) dlg.close();
        if (typeof o.onRestore === 'function') o.onRestore(state);
      } catch (e) {
        if (backupErr) backupErr.textContent = '解不开：密码不对，或文件已损坏';
      }
      return;
    }
    if (dlg) dlg.close();
    if (typeof o.onImportTemplate === 'function') o.onImportTemplate(backup.state, backup.stats);
  }

  async function openTextFile() {
    try {
      const picked = await pickTextFile('.txt,.csv,.md,.tsv,text/plain');
      ta.value = picked.text;
      ta.focus();
    } catch (e) {
      /* 用户取消 */
    }
  }

  function doImport() {
    if (!result || !result.items || !result.items.length) {
      if (previewEl) previewEl.value = '还没有可导入的记录：先「打开」一个账单文件。';
      return;
    }
    result.fromDate = fromEl ? fromEl.value || '' : '';
    result.myAccountId = mySel ? mySel.value || '' : '';
    if (dlg) dlg.close();
    if (typeof o.onImport === 'function') o.onImport(result);
  }

  function doTextImport() {
    const text = String((ta && ta.value) || '').trim();
    if (!text) return;
    if (isBackupText(text)) {
      if (backupErr) backupErr.textContent = '这是加密备份，请用上面的「备份文件导入」。';
      return;
    }
    if (typeof o.mergeText !== 'function') return;
    let n = 0;
    try {
      n = o.mergeText(text);
    } catch (e) {
      if (typeof o.setFooter === 'function') o.setFooter('导入失败：' + ((e && e.message) || e));
      return;
    }
    if (dlg) dlg.close();
    if (typeof o.setFooter === 'function') {
      o.setFooter(n ? `已导入 ${n} 笔流水` : '这段文本里没有新记录（可能都已经有了）');
    }
  }

  dlg = NtModal.open({
    title: '导入',
    autoFocus: false,
    build: (body) => {
      const openBill = button('打开', 'nt-btn nt-btn-sm nt-exp-main');
      openBill.addEventListener('click', openBillFile);
      const goBill = button('导入', 'nt-btn nt-btn-sm');
      goBill.addEventListener('click', doImport);
      body.appendChild(section('账单导入', '（支付宝 / 微信 / 招商银行导出的 Excel、CSV）', [openBill, goBill]));

      const row = el('div', 'nt-imp-row');
      fromEl = el('input');
      fromEl.type = 'date';
      row.appendChild(labelOf('起始日期', fromEl));
      mySel = el('select');
      myWrap = labelOf('我的账户', mySel);
      for (const acc of accounts.filter((a) => a && !a.isHidden && a.id !== '__OPENING__')) {
        const opt = el('option', null, (acc.code ? acc.code + ' · ' : '') + (acc.name || ''));
        opt.value = acc.id;
        mySel.appendChild(opt);
      }
      row.appendChild(myWrap);
      body.appendChild(row);

      body.appendChild(hint('导入预览：', true));
      previewEl = el('textarea', 'nt-imp-preview');
      previewEl.readOnly = true;
      previewEl.placeholder = '导入预览：';
      previewEl.spellcheck = false;
      body.appendChild(previewEl);

      const bOpen = button('打开', 'nt-btn nt-btn-sm');
      bOpen.addEventListener('click', openBackupFile);
      const bGo = button('覆盖并导入', 'nt-btn nt-btn-sm');
      bGo.addEventListener('click', doBackupImport);
      body.appendChild(section('备份文件导入', '（.lz 快照 / 加密备份 / 整本 Excel 备份，会替换当前账本）', [bOpen, bGo]));
      backupErr = el('p', 'nt-sync-hint nt-imp-sub nt-import-map-err');
      body.appendChild(backupErr);
      pwWrap = el('div', 'nt-imp-row');
      pwWrap.hidden = true;
      pwEl = el('input');
      pwEl.type = 'password';
      pwEl.placeholder = '账本密码';
      pwWrap.appendChild(labelOf('密码', pwEl));
      body.appendChild(pwWrap);

      const tOpen = button('打开', 'nt-btn nt-btn-sm');
      tOpen.addEventListener('click', openTextFile);
      const tGo = button('导入', 'nt-btn nt-btn-sm');
      tGo.addEventListener('click', doTextImport);
      body.appendChild(section('文本导入', '（粘贴流水记录文本，合并进当前账本）', [tOpen, tGo]));

      ta = el('textarea', 'nt-exp-out');
      ta.spellcheck = false;
      ta.placeholder = PLACEHOLDER;
      body.appendChild(ta);

      fromEl.addEventListener('change', refresh);
      mySel.addEventListener('change', refresh);
    },
  });

  return dlg;
}
