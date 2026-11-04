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
import { toTxtText, toCsvText, exportBaseName } from '../core/export-text.js';
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
    build: (body) => {
      /* ---------- 导出文件 ---------- */
      body.appendChild(sectionTitle('导出文件'));

      const fileBar = document.createElement('div');
      fileBar.className = 'nt-exp-bar';
      fileBar.appendChild(btn('导出 .lz', () => doLz()));
      fileBar.appendChild(btn('导出 .xlsx', () => doXlsx()));
      fileBar.appendChild(btn('分享加密备份', () => doShare()));
      body.appendChild(fileBar);

      const fileHint = document.createElement('p');
      fileHint.className = 'nt-sync-hint';
      fileHint.textContent = '「分享加密备份」用账本密码加密，安卓和 iPhone 主屏幕都会打开系统分享，可存到网盘或文件。'
        + '.lz 只是压缩，不含密码，不要把它当备份传到别处。';
      body.appendChild(fileHint);

      /* ---------- 复制内容 ---------- */
      body.appendChild(sectionTitle('复制内容'));

      const copyBar = document.createElement('div');
      copyBar.className = 'nt-exp-bar';
      const csvBtn = btn('生成 .csv', () => {
        textCache.csv = toCsvText(state, { codeOf: h.codeOf });
        ta.value = textCache.csv;
        note.textContent = `已生成 CSV（制表符分隔，${(state.transactions || []).length} 笔流水）。点「复制」带走。`;
      });
      const txtBtn = btn('生成 .txt', () => {
        textCache.txt = toTxtText(state, { codeOf: h.codeOf });
        ta.value = textCache.txt;
        note.textContent = `已生成 TXT 模板：账户 ${(state.accounts || []).length} 个、`
          + `流水 ${(state.transactions || []).length} 笔。点「复制」带走。`;
      });
      const copyBtn = btn('复制', async () => {
        if (!ta.value) { note.textContent = '先点「生成 .csv」或「生成 .txt」'; return; }
        let ok = false;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(ta.value);
            ok = true;
          }
        } catch (e) { /* 下面再兜底 */ }
        if (!ok) {
          try { ta.focus(); ta.select(); ok = document.execCommand('copy'); } catch (e) { /* 忽略 */ }
        }
        note.textContent = ok ? `已复制 ${ta.value.length} 个字符` : '复制失败，请长按文本框全选复制';
      });
      copyBtn.classList.add('nt-exp-main');

      copyBar.appendChild(csvBtn);
      copyBar.appendChild(txtBtn);
      copyBar.appendChild(copyBtn);
      body.appendChild(copyBar);

      const ta = document.createElement('textarea');
      ta.className = 'nt-exp-out';
      ta.spellcheck = false;
      ta.placeholder = '点上面的「生成 .csv」或「生成 .txt」，内容会出现在这里，再点「复制」。';
      body.appendChild(ta);

      const note = document.createElement('p');
      note.className = 'nt-sync-hint';
      note.textContent = '说明：复制出来的是纯文本，粘到记事本存成对应后缀即可。';
      body.appendChild(note);

      /* ---------- 动作 ---------- */

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
          else if (how === 'saved') note.textContent = '已保存加密备份。换机时用同一套账本密码恢复。';
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
    actions: [{ label: '关闭', kind: 'ghost', close: true }],
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
