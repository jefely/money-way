// 界面：导出对话框（.lz / .xlsx / .txt / .csv）
/**
 * 导出对话框
 * 层：第五层 · UI
 *
 * 照单文件版的分组：
 *   导出文件   [.lz 文件] [.xlsx 文件]
 *   复制内容   [生成 .csv] [生成 .txt] [复制]  + 文本框
 *
 * .lz 走 core/sync-code.js（LZ1:base64(gzip)），xlsx 走 core/xlsx-write + ui/xlsx-write。
 */

import * as NtModal from './modal.js';
import { downloadBlob, downloadText } from './file-io.js';
import { encodeSyncCode } from '../core/sync-code.js';
import { exportBaseName, toCsvText } from '../core/export-text.js';
import { toTxtVein } from '../core/txtvein-bridge.js';
import { buildXlsx } from './xlsx-write.js';
import { buildTemplateSheets } from '../core/xlsx-template.js';

/**
 * @param {{getState:Function, codeOf:Function}} h
 */
export function openExportDialog(h) {
  const state = h.getState();
  const base = exportBaseName();
  let textCache = { csv: '', txt: '' };

  NtModal.open({
    title: '导出',
    autoFocus: false,
    build: (body) => {
      const fileSec = document.createElement('section');
      fileSec.className = 'nt-io-box';
      const copySec = document.createElement('section');
      copySec.className = 'nt-io-box';

      /* ---------- 导出文件 ---------- */
      fileSec.appendChild(sectionTitle('导出文件'));

      const fileBar = document.createElement('div');
      fileBar.className = 'nt-exp-bar';
      fileBar.appendChild(btn('导出 .lz', () => doLz()));
      fileBar.appendChild(btn('导出 .xlsx', () => doXlsx()));
      fileSec.appendChild(fileBar);
      const fileBar2 = document.createElement('div');
      fileBar2.className = 'nt-exp-bar';
      fileBar2.appendChild(btn('导出初级流水密文', () => doCipherFile('shadow', 'ledger')));
      fileBar2.appendChild(btn('导出初级字典密文', () => doCipherFile('shadow', 'dict')));
      fileSec.appendChild(fileBar2);
      const fileBar3 = document.createElement('div');
      fileBar3.className = 'nt-exp-bar';
      fileBar3.appendChild(btn('导出深度流水密文', () => doCipherFile('deep', 'ledger')));
      fileBar3.appendChild(btn('导出深度字典密文', () => doCipherFile('deep', 'dict')));
      fileSec.appendChild(fileBar3);

      const fileHint = document.createElement('p');
      fileHint.className = 'nt-sync-hint';
      fileHint.textContent = '初级/深度密文按 TxtVein 的双文件格式生成：流水 + 字典两个文件。'
        + '手机不能存文件时，用下面的「生成初级密文 / 生成深度密文」复制整段 bundle。'
        + '.lz 只是压缩，不含密码，不要把它当备份传到别处。';
      fileSec.appendChild(fileHint);

      /* ---------- 复制内容 ---------- */
      copySec.appendChild(sectionTitle('复制内容'));

      const copyBar1 = document.createElement('div');
      copyBar1.className = 'nt-exp-bar';
      const csvBtn = btn('生成 .csv', () => {
        textCache.csv = toCsvText(state, { codeOf: h.codeOf });
        ta.value = textCache.csv;
        note.textContent = `已生成 CSV（制表符分隔，${(state.transactions || []).length} 笔流水）。点「复制」带走。`;
      });
      const txtBtn = btn('生成 .txt', () => {
        const built = toTxtVein(state);
        ta.value = built.singleText;
        note.textContent = `已生成 TxtVein 单 TXT：账户 ${built.stats.accounts} 个、流水 ${built.stats.transactions} 笔。点「复制」带走。`;
      });
      copyBar1.appendChild(csvBtn);
      copyBar1.appendChild(txtBtn);
      copySec.appendChild(copyBar1);

      const copyBar2 = document.createElement('div');
      copyBar2.className = 'nt-exp-bar';
      copyBar2.appendChild(btn('生成初级流水密文', () => doCipherText('shadow', 'ledger')));
      copyBar2.appendChild(btn('生成初级字典密文', () => doCipherText('shadow', 'dict')));
      copySec.appendChild(copyBar2);

      const copyBar3 = document.createElement('div');
      copyBar3.className = 'nt-exp-bar nt-exp-copy-row';
      copyBar3.appendChild(btn('生成深度流水密文', () => doCipherText('deep', 'ledger')));
      copyBar3.appendChild(btn('生成深度字典密文', () => doCipherText('deep', 'dict')));
      const copyBtn = btn('复制', () => copyTa());
      copyBtn.classList.add('nt-exp-copy');
      copyBar3.appendChild(copyBtn);
      copySec.appendChild(copyBar3);

      const ta = document.createElement('textarea');
      ta.className = 'nt-exp-out';
      ta.spellcheck = false;
      ta.placeholder = '点一个生成按钮，文本框就显示那个功能的文本；点「复制」带走。';
      copySec.appendChild(ta);

      const note = document.createElement('p');
      note.className = 'nt-sync-hint';
      note.textContent = '说明：复制出来的是纯文本，粘到记事本存成对应后缀即可。';
      copySec.appendChild(note);

      body.appendChild(fileSec);
      body.appendChild(copySec);

      /* ---------- 动作 ---------- */

      async function copyTa() {
        if (!ta.value) { note.textContent = '先生成内容'; return; }
        let ok = false;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(ta.value);
            ok = true;
          }
        } catch (e) { /* 华为等浏览器会拒绝 clipboard，下面用选中复制 */ }
        if (!ok) {
          try {
            ta.focus();
            ta.select();
            if (ta.setSelectionRange) ta.setSelectionRange(0, ta.value.length);
            ok = document.execCommand('copy');
          } catch (e) { /* 忽略 */ }
        }
        note.textContent = ok ? `已复制 ${ta.value.length} 个字符` : '复制失败，请长按文本框全选复制';
      }

      async function doCipherText(mode, part) {
        if (typeof h.txtveinCipherText !== 'function') {
          note.textContent = '当前不能生成 TxtVein 密文';
          return;
        }
        try {
          const r = await h.txtveinCipherText(mode);
          const f = part === 'dict' ? r.files[1] : r.files[0];
          ta.value = f.text;
          note.textContent = `已生成${mode === 'shadow' ? '初级' : '深度'}${part === 'dict' ? '字典' : '流水'}密文（${f.name}）。点「复制」带走。`;
        } catch (e) {
          note.textContent = '生成密文失败：' + ((e && e.message) || e);
        }
      }

      async function doCipherFile(mode, part) {
        if (typeof h.txtveinCipherText !== 'function') {
          note.textContent = '当前不能生成 TxtVein 密文';
          return;
        }
        try {
          const r = await h.txtveinCipherText(mode);
          const f = part === 'dict' ? r.files[1] : r.files[0];
          downloadText(f.name, f.text, 'text/plain');
          note.textContent = `已导出 ${f.name}`;
        } catch (e) {
          note.textContent = '导出密文失败：' + ((e && e.message) || e);
        }
      }

      async function doEncText() {
        if (typeof h.encryptedBackupText !== 'function') {
          note.textContent = '当前不能做加密备份';
          return;
        }
        try {
          ta.value = await h.encryptedBackupText();
          note.textContent = '已生成密文（用账本密码才能解开）。点「复制」贴到微信或存成 .txt。导入时选这个文件，或把密文粘进导入框。';
          if (typeof h.onBackedUp === 'function') h.onBackedUp();
        } catch (e) {
          note.textContent = '生成密文失败：' + ((e && e.message) || e);
        }
      }

      async function doLz() {
        try {
          const code = await encodeSyncCode(JSON.stringify(buildPayload(state)));
          downloadText(`${base}.lz`, code, 'text/plain');
          note.textContent = `已导出 ${base}.lz（${code.length} 个字符）`;
        } catch (e) {
          note.textContent = '导出 .lz 失败：' + ((e && e.message) || e);
        }
      }

      async function doShare() {
        if (typeof h.shareBackup !== 'function') {
          note.textContent = '当前不能做加密备份';
          return;
        }
        try {
          const how = await h.shareBackup();
          if (how === 'cancelled') note.textContent = '已取消';
          else if (how === 'shared') note.textContent = '已打开系统分享。请存到网盘、文件或发给自己。';
          else if (how === 'saved') note.textContent = '已保存加密备份（.txt）。换机时用同一套账本密码，在导入里选择这个文件。';
          else note.textContent = '已开始下载。若手机里找不到文件，请再点一次并在分享单里选「文件」或网盘。';
          if (how && how !== 'cancelled' && typeof h.onBackedUp === 'function') h.onBackedUp();
        } catch (e) {
          note.textContent = '备份失败：' + ((e && e.message) || e);
        }
      }

      function doXlsx() {
        try {
          const sheets = buildTemplateSheets(state, {
            nameOf: (id) => (typeof h.nameOf === 'function' ? h.nameOf(id) : ''),
          });
          const bytes = buildXlsx(sheets);
          downloadBlob(`${base}.xlsx`, bytes,
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          note.textContent = `已导出 ${base}.xlsx（4 张表：流水 / 设置 / 分期 / 固定，${bytes.length} 字节）`;
        } catch (e) {
          note.textContent = '导出 .xlsx 失败：' + ((e && e.message) || e);
        }
      }
    },
    actions: [],
  });
}

/* ---------- 小工具 ---------- */

function sectionTitle(text) {
  const el = document.createElement('div');
  el.className = 'nt-exp-sec';
  el.textContent = text;
  return el;
}

function btn(text, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'nt-btn nt-btn-sm';
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

/** .lz 里装的内容：状态 + 版本，和同步码一致 */
function buildPayload(state) {
  return {
    v: 1,
    accounts: state.accounts || [],
    transactions: state.transactions || [],
    mappings: state.mappings || {},
    exportedAt: new Date().toISOString(),
  };
}
