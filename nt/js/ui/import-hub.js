// 界面：流水工具条「导入」→ 一个窗口、一个输入框
/**
 * 导入入口（UI 层）
 *
 * 用户 2026-11-08 定：不要再有「文件导入 / 文本导入」两个框。
 * 手机上不一定能存文件，把密文从剪贴板直接粘进来是正规路径：
 *
 *   [打开] [粘贴]                ← 同级操作，都在框上面
 *   [ 唯一的文本框 ]              ← 粘贴的内容；打开文件时这里显示「已读取：…」
 *   [ 识别结果 + 需要补的输入 ]    ← 账单：起始日期 + 我的账户
 *                                   密文：密码
 *                                   备份：输入「覆盖」两个字
 *   [ 导入 ]                     ← 最后一步；条件不满足会提示，不会静默失败
 *
 * 识别在 import-source（文件 / 文本 → bill / table / backup / text），
 * 这里只拼界面、分派动作。
 */

import * as NtModal from './modal.js';
import { sourceFromFile, sourceFromText } from './import-source.js';
import { planBillImport, collectNewAccounts } from '../core/bill-plan.js';
import { myAccountPick } from './import-bill.js';
import { money } from '../core/format.js';
import { backupSummary } from './import-backup.js';
import { pasteTo, refreshCipher, loadCipherFiles, doFileImport, doPasteImport } from './import-txtvein.js';
import { importTable, importText, importBackup } from './import-actions.js';

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

/** 字段行：标签 + 控件，右边可跟按钮 */
function field(label, control, buttons) {
  const row = el('div', 'nt-imp-field');
  const cell = el('label', 'nt-imp-cell');
  cell.appendChild(el('span', 'nt-imp-label', label));
  control.classList.add('nt-input', 'nt-input-sm');
  cell.appendChild(control);
  row.appendChild(cell);
  const list = Array.isArray(buttons) ? buttons : (buttons ? [buttons] : []);
  for (const b of list) row.appendChild(b);
  return row;
}

/**
 * @param {{
 *   getAccounts?:()=>Array, accounts?:Array,
 *   onImport?:(result:object)=>void,
 *   onImportTemplate?:(state:object, stats:object)=>void,
 *   restoreBackup?:(text:string, password:string)=>Promise<object>,
 *   onRestore?:(state:object)=>void,
 *   mergeText?:(text:string)=>number,
 *   setFooter?:(text:string)=>void,
 * }} opts
 */
export function openImportHub(opts) {
  const o = opts || {};
  const accounts = typeof o.getAccounts === 'function' ? o.getAccounts() : (o.accounts || []);
  const aliases = Array.isArray(o.aliases) ? o.aliases : [];

  let dlg = null;
  let ta = null;
  let cLedger = null;
  let cDict = null;
  let cipherStatus = null;
  let statusEl = null;
  let fileCipher = null;
  let fileGo = null;
  let need = null;
  let errEl = null;
  let fromEl = null;
  let mySel = null;
  let pwEl = null;
  let coverEl = null;
  let billRow = null;
  let myRow = null;
  let pwRow = null;
  let coverWrap = null;
  let source = null;

  const setErr = (msg) => { if (errEl) errEl.textContent = msg || ''; };

  const ctx = {
    get ta() { return ta; },
    get cLedger() { return cLedger; },
    get cDict() { return cDict; },
    get pw() { return pwEl ? pwEl.value.trim() : ''; },
    get cover() { return coverEl ? coverEl.value.trim() : ''; },
    get fileCipher() { return fileCipher; },
    set fileCipher(v) { fileCipher = v; },
    get source() { return source; },
    get fromEl() { return fromEl; },
    get mySel() { return mySel; },
    aliases,
    set source(v) { source = v; },
    get cipherStatus() { return cipherStatus; },
    setErr,
    setNeed,
    applySource,
    close() { if (dlg) dlg.close(); },
    setStatus(t) { if (statusEl) statusEl.textContent = t || ''; },
    setFileGo(disabled) { if (fileGo) fileGo.disabled = !!disabled; },
    setCipherStatus(t, bad) {
      if (!cipherStatus) return;
      cipherStatus.className = 'nt-imp-status' + (bad ? ' is-bad' : '');
      cipherStatus.textContent = t || '';
    },
    importText: (t) => importText(ctx, t),
    importTable: (r) => importTable(ctx, r),
    importBackup: (b) => importBackup(ctx, b),
    mergeText: o.mergeText,
    setFooter: o.setFooter,
    restoreBackup: o.restoreBackup,
    onImport: o.onImport,
    onImportTemplate: o.onImportTemplate,
    onRestore: o.onRestore,
    restoreTxtveinCipher: o.restoreTxtveinCipher,
  };

  /** 识别后要补的输入：'bill' = 起始日期 + 我的账户；'pw' = 密码；'cover' = 输入「覆盖」 */
  function setNeed(which) {
    if (billRow) billRow.hidden = which !== 'bill';
    if (myRow) myRow.hidden = which !== 'bill';
    if (pwRow) pwRow.hidden = which !== 'pw';
    if (coverWrap) coverWrap.hidden = which !== 'cover';
    if (need) need.hidden = !(which === 'bill' || which === 'pw');
  }

  function billStatus(r) {
    const from = fromEl ? fromEl.value || '' : '';
    const plan = planBillImport(r.items, {
      accounts,
      from,
      presetId: r.presetId,
      myAccountId: mySel ? mySel.value || '' : '',
      aliases,
    });
    const s = plan.stats;
    const lines = [r.note];
    lines.push(from ? `起始日之后 ${s.kept} 笔（早于它跳过 ${s.before} 笔）` : `可导入 ${s.kept} 笔`);
    lines.push(`消费 ${money(s.sumOut)} / 收入 ${money(s.sumIn)}`);
    if (s.transfer) lines.push(`资金流转 ${s.transfer} 笔（还款 / 提现 / 搬钱）照常记成账户间转账`);
    if (s.pending) lines.push(`资金流转 ${s.pending} 笔只认出一端：先写进流水，等你补另一端`);
    const wants = collectNewAccounts(plan).length;
    if (wants) lines.push(`新建 ${wants} 个节点：高频商户单独成节点，可在备注区改名合并`);
    return lines.join('\n');
  }

  function statusOf(s) {
    if (s.kind === 'bill') return billStatus(s.result);
    if (s.kind === 'table') return `${s.result.note}\n通用表格：直接点「导入」写入流水。`;
    if (s.kind === 'backup') return backupSummary(s.backup);
    if (s.kind === 'txtvein') return 'TxtVein 单 TXT（明文）：导入会替换当前账本；输入「覆盖」后确认。';
    if (s.kind === 'txtvein-cipher') return 'TxtVein 双文件密文 bundle：需要密码；导入会替换当前账本。';
    return '这是一段账本流水文本：点「导入」合并进当前账本。';
  }

  /** 把一个源挂到界面上：状态文字 + 需要补的输入 */
  function applySource(s, forFile) {
    source = s;
    setErr('');
    if (!s) {
      if (statusEl && forFile) statusEl.textContent = '';
      if (fileGo && forFile) fileGo.disabled = true;
      setNeed('');
      return;
    }
    if (s.kind === 'bill' && mySel) {
      const pick = myAccountPick(accounts, s.result.presetId, s.result.hints && s.result.hints.cardTail);
      if (pick) mySel.value = pick.id;
    }
    if (s.kind === 'bill') setNeed('bill');
    else if (s.kind === 'backup') setNeed(s.backup.kind === 'backup' ? 'pw' : 'cover');
    else if (s.kind === 'txtvein') setNeed('cover');
    else if (s.kind === 'txtvein-cipher') setNeed('pw');
    else setNeed('');
    if (statusEl && forFile) statusEl.textContent = statusOf(s);
    if (fileGo && forFile) fileGo.disabled = false;
  }

  function refreshStatus() {
    if (source && statusEl) statusEl.textContent = statusOf(source);
  }

  function pickFile(accept, onPick) {
    const input = el('input');
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

  function pickFiles(accept, onPick) {
    const input = el('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = true;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const files = Array.from(input.files || []);
      input.remove();
      await onPick(files);
    });
    input.click();
  }

  async function loadFile(file) {
    if (!file) return;
    const name = String(file.name || '');
    fileCipher = null;
    applySource(null, true);
    if (cLedger && cLedger !== ta) cLedger.value = '';
    if (cDict) cDict.value = '';
    refreshCipher(ctx);
    if (ta) {
      ta.value = '';
      ta.placeholder = `已读取：${name}\n这里也可以粘贴（账单内容 / 密文 / 流水文本）`;
    }
    if (statusEl) statusEl.textContent = `正在读取 ${name} …`;
    try {
      applySource(await sourceFromFile(file), true);
      if (fileGo) fileGo.disabled = false;
    } catch (e) {
      applySource(null, true);
      if (fileGo) fileGo.disabled = true;
      setErr('读取失败：' + ((e && e.message) || e));
    }
  }




  dlg = NtModal.open({
    title: '导入',
    autoFocus: false,
    build: (body) => {
      const box = el('section', 'nt-imp-group nt-imp-plain');
      const fileArea = el('section', 'nt-imp-area');
      const pasteArea = el('section', 'nt-imp-area');

      const fileTitle = el('div', 'nt-imp-section-title', '文件导入');
      fileArea.appendChild(fileTitle);

      const bar = el('div', 'nt-imp-bar');
      const openBtn = button('打开', 'nt-btn nt-btn-sm');
      openBtn.addEventListener('click', () => pickFiles('.lz,.xlsx,.xls,.csv,.txt,.tsv,.json,.enc,.vault,.shadow', async (files) => {
        if (!files.length) return;
        const cipherLike = files.length > 1
          || files.some((f) => /\.(enc|vault|shadow)$/i.test(f.name));
        if (cipherLike) await loadCipherFiles(ctx, files);
        else await loadFile(files[0]);
      }));
      bar.appendChild(openBtn);
      fileArea.appendChild(bar);

      statusEl = el('div', 'nt-imp-status', '还没有选择文件。');
      fileArea.appendChild(statusEl);

      fileGo = button('导入', 'nt-btn nt-btn-sm nt-imp-go');
      fileGo.disabled = true;
      fileGo.addEventListener('click', () => doFileImport(ctx));
      const fileGoBar = el('div', 'nt-imp-bar nt-imp-go-bar');
      fileGoBar.appendChild(fileGo);
      fileArea.appendChild(fileGoBar);
      box.appendChild(fileArea);

      const pasteTitle = el('div', 'nt-imp-section-title', '粘贴导入');
      pasteArea.appendChild(pasteTitle);

      const topPaste = el('div', 'nt-imp-bar');
      const pasteSingle = button('粘贴单文本', 'nt-btn nt-btn-sm');
      pasteSingle.addEventListener('click', () => pasteTo(ctx, ta, 'single'));
      const pasteLedger = button('粘贴流水密文', 'nt-btn nt-btn-sm');
      pasteLedger.addEventListener('click', () => pasteTo(ctx, ta, 'ledger'));
      topPaste.appendChild(pasteSingle);
      topPaste.appendChild(pasteLedger);
      pasteArea.appendChild(topPaste);

      ta = el('textarea', 'nt-imp-box');
      ta.spellcheck = false; ta.placeholder = PLACEHOLDER;
      ta.addEventListener('input', () => {
        if (fileGo) fileGo.disabled = true;
        applySource(sourceFromText(ta.value), false);
        refreshCipher(ctx);
      });
      cLedger = ta; pasteArea.appendChild(ta);

      const pasteDict = button('粘贴字典密文', 'nt-btn nt-btn-sm');
      pasteDict.addEventListener('click', () => pasteTo(ctx, cDict, 'dict'));
      const pasteGo = button('导入', 'nt-btn nt-btn-sm nt-imp-go');
      pasteGo.addEventListener('click', () => doPasteImport(ctx));
      const dictBar = el('div', 'nt-imp-bar nt-imp-dictbar');
      dictBar.append(pasteDict, pasteGo); pasteArea.appendChild(dictBar);

      cDict = el('textarea', 'nt-imp-box nt-imp-cipher');
      cDict.spellcheck = false;
      cDict.placeholder = '字典密文（dict.enc / dict.vault）；单文本导入时留空。';
      cDict.addEventListener('input', () => refreshCipher(ctx));
      pasteArea.appendChild(cDict);
      cipherStatus = el('div', 'nt-imp-status', '密文是两份：上面流水、下面字典。单文本只填上面。');
      pasteArea.appendChild(cipherStatus);
      box.appendChild(pasteArea);

      need = el('div', 'nt-imp-need'); need.hidden = true;

      fromEl = el('input'); fromEl.type = 'date';
      billRow = field('起始日期', fromEl);
      need.appendChild(billRow);

      mySel = el('select');
      for (const acc of accounts.filter((a) => a && !a.isHidden && a.id !== '__OPENING__')) {
        const opt = el('option', null, (acc.code ? acc.code + ' · ' : '') + (acc.name || ''));
        opt.value = acc.id;
        mySel.appendChild(opt);
      }
      myRow = field('我的账户', mySel);
      need.appendChild(myRow);

      pwEl = el('input'); pwEl.type = 'password'; pwEl.placeholder = '账本密码';
      pwRow = field('密码', pwEl);
      need.appendChild(pwRow);

      coverWrap = el('div', 'nt-imp-cover'); coverWrap.hidden = true;
      coverWrap.appendChild(hint('要覆盖当前账本，请在下面输入「覆盖」两个字：', false));
      coverEl = el('input');
      coverEl.placeholder = '覆盖';
      coverWrap.appendChild(field('确认', coverEl));

      box.appendChild(need);
      // 「覆盖」属于文件导入，放在文件区的导入按钮上方。
      if (fileArea && fileGoBar) fileArea.insertBefore(coverWrap, fileGoBar);
      else box.appendChild(coverWrap);

      errEl = el('p', 'nt-sync-hint nt-imp-sub nt-import-map-err'); box.appendChild(errEl);

      body.appendChild(box);

      fromEl.addEventListener('change', refreshStatus);
      mySel.addEventListener('change', refreshStatus);
      refreshCipher(ctx);
    },
  });

  return dlg;
}
