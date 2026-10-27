// 界面：导入 Excel / CSV / 账单
/**
 * 导入对话框
 * 层：第五层 · UI
 *
 * 流程：选文件 → 读表 → 认表头（账单预设 / 通用列名）→ 预览 → 确认导入
 *
 * 解析全在 core（xlsx-xml / csv / bill-parse / import-table），
 * 这里只负责文件选择、预览和把结果交给调用方。
 */

import * as NtModal from './modal.js';
import { readAnyTable } from './xlsx-read.js';
import { analyzeTable } from '../core/import-table.js';

/**
 * 打开导入对话框。
 *
 * @param {{onImport:(result:object)=>void}} opts
 */
export function openImportDialog(opts) {
  const o = opts || {};

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.csv,.txt,.tsv';
  input.style.display = 'none';
  document.body.appendChild(input);

  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.remove();
    if (!file) return;

    let result = null;
    let error = '';

    try {
      const book = await readAnyTable(file);
      const sheet = book.sheets[0];
      if (!sheet) throw new Error('这个文件里没有可读的表');
      result = analyzeTable(sheet.rows);
      result.sheetName = sheet.name;
      result.fileName = file.name;
    } catch (e) {
      error = String((e && e.message) || e);
    }

    if (error) {
      NtModal.open({
        title: '导入失败',
        build: (body) => {
          const p = document.createElement('p');
          p.className = 'nt-sync-hint';
          p.textContent = error;
          body.appendChild(p);
        },
        actions: [{ label: '关闭', kind: 'ghost', close: true }],
      });
      return;
    }

    showPreview(result, o);
  });

  input.click();
}

/** 预览 + 确认 */
function showPreview(result, o) {
  NtModal.open({
    title: '导入预览',
    build: (body) => {
      const head = document.createElement('p');
      head.className = 'nt-sync-hint';
      head.textContent = result.note;
      body.appendChild(head);

      const info = document.createElement('p');
      info.className = 'nt-sync-hint';
      info.textContent = `文件：${result.fileName}　表：${result.sheetName}`;
      body.appendChild(info);

      if (result.kind === 'unknown' || !result.items.length) {
        const bad = document.createElement('p');
        bad.className = 'nt-sync-hint';
        bad.textContent = '这张表认不出来。需要至少一列日期 + 一列金额，'
          + '或者用支付宝 / 微信 / 招行的原始账单文件。';
        body.appendChild(bad);
        return;
      }

      // 预览前 5 行
      const ul = document.createElement('ul');
      ul.className = 'nt-import-preview';
      for (const it of result.items.slice(0, 5)) {
        const li = document.createElement('li');
        const who = it.party || it.from || it.to || '';
        li.textContent = `${it.date}　${it.amount}　${who}　${it.note || it.item || ''}`;
        ul.appendChild(li);
      }
      body.appendChild(ul);

      if (result.items.length > 5) {
        const more = document.createElement('p');
        more.className = 'nt-sync-hint';
        more.textContent = `…… 还有 ${result.items.length - 5} 笔`;
        body.appendChild(more);
      }

      if (result.needAccount) {
        const tip = document.createElement('p');
        tip.className = 'nt-sync-hint';
        tip.textContent = '导入后需要给这些记录指定「我的账户」。'
          + '账单里没有账户信息，只能按支付方式或卡号补。';
        body.appendChild(tip);
      }
    },
    actions: result.kind === 'unknown' || !result.items.length
      ? [{ label: '关闭', kind: 'ghost', close: true }]
      : [
        { label: '取消', kind: 'ghost', close: true },
        {
          label: `导入 ${result.items.length} 笔`,
          kind: 'primary',
          onClick: () => {
            // modal 默认在 onClick 之后自动关闭（close !== false）
            if (o.onImport) o.onImport(result);
          },
        },
      ],
  });
}
