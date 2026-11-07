// 界面：流水工具条「导入」→ 一个窗口里同时做文件导入和文本导入
/**
 * 导入入口（UI 层）
 *
 * 用户 2026-11：不要再弹第二层「导入预览」，把预览并进这个窗口；
 * 2026-11-08 再合并：账单和备份不再各占一段 —— 一个「打开」自动认类型，
 * 「导入」按认出来的类型走（账单写流水 / 备份覆盖账本）。
 *
 * 布局照给定样式（两个圆角分组框，按钮靠右）：
 *   文件导入（起始日期 [打开] / 我的账户 [导入] + 预览框）
 *   文本导入（标题行右侧 [打开][导入] + 文本框）
 *
 * 解析全在 core（xlsx-read / import-table / bill-plan），这里只管
 * 选择文件、拼预览文字、把结果交给 onImport。
 */

import * as NtModal from './modal.js';
import { readAnyTable, decodeBytes } from './xlsx-read.js';
import { analyzeTable } from '../core/import-table.js';
import { planBillImport, previewLine } from '../core/bill-plan.js';
import { myAccountPick } from './import-bill.js';
import { money } from '../core/format.js';
import { pickTemplateSheets } from '../core/xlsx-template.js';
import { isBackupText } from '../core/backup-file.js';
import { readBackupFile, backupSummary, confirmOverwrite } from './import-backup.js';
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

const button = (text, cls) => {
  const b = el('button', cls || 'nt-btn nt-btn-sm', text);
  b.type = 'button';
  return b;
};

/**
 * 一个圆角功能区块：标题 + 说明在左、按钮在右
 *（照「添加账本 · 流水记录」弹窗的两个分组框）。
 * @param {string} title
 * @param {string} desc
 * @returns {{box:HTMLElement, head:HTMLElement}}
 */
function group(title, desc) {
  const box = el('section', 'nt-imp-group');
  const head = el('div', 'nt-imp-head');
  const lead = el('div', 'nt-imp-lead');
  lead.appendChild(hint(title, true));
  lead.appendChild(hint(desc));
  head.appendChild(lead);
  box.appendChild(head);
  return { box, head };
}

/** 标题行右侧的按钮组 */
function actsInto(head, buttons) {
  const acts = el('div', 'nt-imp-acts');
  for (const b of buttons) acts.appendChild(b);
  head.appendChild(acts);
}

/**
 * 字段行：标签 + 控件，右边可跟一个按钮。
 * 按钮位置照用户给的第三图：「打开」对齐起始日期行、「导入」对齐我的账户行。
 */
function field(label, control, btn) {
  const row = el('div', 'nt-imp-field');
  const cell = el('label', 'nt-imp-cell');
  cell.appendChild(el('span', 'nt-imp-label', label));
  control.classList.add('nt-input', 'nt-input-sm');
  cell.appendChild(control);
  row.appendChild(cell);
  if (btn) row.appendChild(btn);
  return row;
}

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
  let backupErr = null;
  let backup = null;
  let pwWrap = null;
  let pwEl = null;

  const refresh = () => {
    if (!previewEl || backup) return;
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

  /** 账单：把解析结果挂上去，再刷预览 */
  function showBill(book, file) {
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
  }

  /** 备份：显示「读懂了什么」，加密备份才要密码 */
  function showBackup(b) {
    backup = b;
    if (previewEl) previewEl.value = backupSummary(b);
    if (pwWrap) pwWrap.hidden = b.kind !== 'backup';
  }

  /**
   * 一个「打开」认所有文件（用户 2026-11-08：账单和备份合并成一个入口）。
   * 顺序：.lz → xlsx 里的整本备份 → 加密备份文本 → 剩下的都当账单/表格。
   */
  async function loadFile(file) {
    if (!file) return;
    const name = String(file.name || '');
    result = null;
    backup = null;
    if (backupErr) backupErr.textContent = '';
    if (pwWrap) pwWrap.hidden = true;
    if (pwEl) pwEl.value = '';
    if (previewEl) previewEl.value = `正在读取 ${name} …`;

    try {
      if (/\.lz$/i.test(name)) {
        showBackup(await readBackupFile(file));
        return;
      }
      if (/\.xlsx?$/i.test(name)) {
        const book = await readAnyTable(file);
        if (pickTemplateSheets(book.sheets).isTemplate) {
          showBackup(await readBackupFile(file));
          return;
        }
        showBill(book, file);
        return;
      }
      if (isBackupText(decodeBytes(await file.arrayBuffer()))) {
        showBackup(await readBackupFile(file));
        return;
      }
      showBill(await readAnyTable(file), file);
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

  const openFile = () => pickFile('.lz,.xlsx,.xls,.csv,.txt,.tsv,.json', loadFile);

  async function doBackupImport() {
    if (!backup) {
      if (backupErr) backupErr.textContent = '先「打开」一个备份文件';
      return;
    }
    const b = backup;
    const pw = (pwEl && pwEl.value) || '';
    if (b.kind === 'backup') {
      if (!pw) {
        if (backupErr) backupErr.textContent = '需要账本密码';
        return;
      }
      if (typeof o.restoreBackup !== 'function') {
        if (backupErr) backupErr.textContent = '当前不能恢复加密备份';
        return;
      }
    }
    // 覆盖当前账本必须再问一次（用户 2026-11-08 明确保留这个警告）
    if (!(await confirmOverwrite(backupSummary(b)))) return;

    if (b.kind === 'backup') {
      try {
        const state = await o.restoreBackup(b.text, pw);
        if (dlg) dlg.close();
        if (typeof o.onRestore === 'function') o.onRestore(state);
      } catch (e) {
        if (backupErr) backupErr.textContent = '解不开：密码不对，或文件已损坏';
      }
      return;
    }
    if (dlg) dlg.close();
    if (typeof o.onImportTemplate === 'function') o.onImportTemplate(b.state, b.stats);
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

  /** 「导入」按钮：备份 → 覆盖导入；否则 → 账单写流水 */
  function runImport() {
    if (backup) {
      doBackupImport();
      return;
    }
    doImport();
  }

  function doTextImport() {
    const text = String((ta && ta.value) || '').trim();
    if (!text) return;
    if (isBackupText(text)) {
      if (backupErr) backupErr.textContent = '这是加密备份，请用上面的「文件导入」。';
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
      /* ① 文件导入：账单 / .lz 快照 / 加密备份 / 整本 Excel 备份共用一个入口 */
      const fileOpen = button('打开', 'nt-btn nt-btn-sm nt-exp-main');
      fileOpen.addEventListener('click', openFile);
      const fileGo = button('导入', 'nt-btn nt-btn-sm');
      fileGo.addEventListener('click', runImport);

      const file = group('文件导入', '（Excel / CSV / 账单 / .lz 快照 / 加密备份，备份会替换当前账本）');
      fromEl = el('input');
      fromEl.type = 'date';
      file.box.appendChild(field('起始日期', fromEl, fileOpen));

      mySel = el('select');
      for (const acc of accounts.filter((a) => a && !a.isHidden && a.id !== '__OPENING__')) {
        const opt = el('option', null, (acc.code ? acc.code + ' · ' : '') + (acc.name || ''));
        opt.value = acc.id;
        mySel.appendChild(opt);
      }
      file.box.appendChild(field('我的账户', mySel, fileGo));

      file.box.appendChild(hint('导入预览：', true));
      previewEl = el('textarea', 'nt-imp-preview');
      previewEl.readOnly = true;
      previewEl.placeholder = '打开一个文件后，这里显示识别到多少笔';
      previewEl.spellcheck = false;
      file.box.appendChild(previewEl);

      backupErr = el('p', 'nt-sync-hint nt-imp-sub nt-import-map-err');
      file.box.appendChild(backupErr);

      pwEl = el('input');
      pwEl.type = 'password';
      pwEl.placeholder = '账本密码';
      pwWrap = field('密码', pwEl);
      pwWrap.hidden = true;
      file.box.appendChild(pwWrap);
      body.appendChild(file.box);

      /* ② 文本导入 */
      const tOpen = button('打开', 'nt-btn nt-btn-sm');
      tOpen.addEventListener('click', openTextFile);
      const tGo = button('导入', 'nt-btn nt-btn-sm');
      tGo.addEventListener('click', doTextImport);
      const text = group('文本导入', '（粘贴流水记录文本，合并进当前账本）');
      actsInto(text.head, [tOpen, tGo]);
      ta = el('textarea', 'nt-exp-out');
      ta.spellcheck = false;
      ta.placeholder = PLACEHOLDER;
      text.box.appendChild(ta);
      body.appendChild(text.box);

      fromEl.addEventListener('change', refresh);
      mySel.addEventListener('change', refresh);
    },
  });

  return dlg;
}
