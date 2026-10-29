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
import { openColumnMapper } from './import-map.js';
import { pickTemplateSheets } from '../core/xlsx-template.js';
import {
  parseSettingsRows, parseFlowRows, parseFixedRows, parseInstRows, stateFromTemplate,
} from '../core/xlsx-template-read.js';
import { readLzText, stateFromLzPayload } from '../core/lz-file.js';

/**
 * 打开导入对话框。
 *
 * @param {{onImport:(result:object)=>void}} opts
 */
export function openImportDialog(opts) {
  const o = opts || {};

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.csv,.txt,.tsv,.lz';
  input.style.display = 'none';
  document.body.appendChild(input);

  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.remove();
    if (!file) return;

    // .lz = 跨设备快照（LZ1/LZ0 + gzip(JSON)），与 xlsx 是两条完全不同的通道
    if (/\.lz$/i.test(file.name)) {
      try {
        const payload = await readLzText(await file.text());
        showLzImport(payload, file.name, o);
      } catch (e) {
        NtModal.open({
          title: '导入失败',
          body: String((e && e.message) || e),
          actions: [{ label: '关闭', kind: 'ghost', close: true }],
        });
      }
      return;
    }

    let result = null;
    let error = '';
    let rows = [];
    let book = null;

    try {
      book = await readAnyTable(file);
      const sheet = book.sheets[0];
      if (!sheet) throw new Error('这个文件里没有可读的表');

      // 4 张表的整本备份（流水 / 设置 / 分期 / 固定）：走覆盖重建，不当普通流水导
      const picked = pickTemplateSheets(book.sheets);
      if (picked.isTemplate) {
        showTemplateImport(picked, file.name, o);
        return;
      }

      rows = sheet.rows;
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

    showPreview(result, o, rows);
  });

  input.click();
}

/**
 * 整本备份（流水 / 设置 / 分期 / 固定）→ 覆盖重建。
 *
 * 这是**整本**不是追加：账户与计划都会换成备份里的，
 * 所以必须先说清楚「当前账本会被替换」，并给一次取消的机会。
 */
function showTemplateImport(picked, fileName, o) {
  const accounts = parseSettingsRows(picked.settings);
  const flow = parseFlowRows(picked.flow);
  const fixed = parseFixedRows(picked.fixed);
  const inst = parseInstRows(picked.inst);
  const built = stateFromTemplate({ accounts, flow, fixed, inst });
  const s = built.stats;

  NtModal.open({
    title: '整本备份',
    build: (body) => {
      const tip = document.createElement('p');
      tip.className = 'nt-sync-hint';
      tip.textContent = `这个文件是整本备份（4 张表：流水 / 设置 / 分期 / 固定）。`;
      body.appendChild(tip);

      const warn = document.createElement('p');
      warn.className = 'nt-sync-hint nt-import-map-err';
      warn.textContent = '导入会**覆盖**当前账本：现在的账户、流水、固定与分期都会被替换。';
      body.appendChild(warn);

      const info = document.createElement('p');
      info.className = 'nt-sync-hint';
      info.textContent = `文件：${fileName}`
        + `　账户 ${s.accounts} 个 · 流水 ${s.transactions} 笔`
        + `　固定 ${s.fixed} 条 · 分期 ${s.inst} 条`;
      body.appendChild(info);

      const detail = [];
      if (s.flowSkipped) detail.push(`${s.flowSkipped} 行流水缺日期或金额已跳过`);
      if (s.loose) detail.push(`${s.loose} 笔流水两端账户都对不上（会留空，导入后补）`);
      if (s.instSkipped) detail.push(`${s.instSkipped} 条分期账户名对不上已跳过`);

      if (detail.length) {
        const ul = document.createElement('ul');
        ul.className = 'nt-import-errors';
        for (const t of detail) {
          const li = document.createElement('li');
          li.textContent = t;
          ul.appendChild(li);
        }
        body.appendChild(ul);
      }
    },
    actions: [
      { label: '取消', kind: 'ghost', close: true },
      {
        label: '覆盖并导入',
        kind: 'danger',
        onClick: () => {
          if (o.onImportTemplate) o.onImportTemplate(built.state, s);
        },
      },
    ],
  });
}

/**
 * .lz 快照 → 覆盖重建。
 *
 * 格式与单文件版一致（LZ1:base64(gzip(JSON))），语义是「快照覆盖」，
 * 所以这里跟「整本备份」一样先警告、再确认。
 */
function showLzImport(payload, fileName, o) {
  const built = stateFromLzPayload(payload);
  const s = built.stats;

  NtModal.open({
    title: '快照导入',
    build: (body) => {
      const tip = document.createElement('p');
      tip.className = 'nt-sync-hint';
      tip.textContent = '这是一份 .lz 账本快照（LZ1/LZ0 + gzip JSON）。';
      body.appendChild(tip);

      const warn = document.createElement('p');
      warn.className = 'nt-sync-hint nt-import-map-err';
      warn.textContent = '导入会**覆盖**当前账本：现在的账户、流水与计划都会被替换。';
      body.appendChild(warn);

      const info = document.createElement('p');
      info.className = 'nt-sync-hint';
      info.textContent = `文件：${fileName}`
        + `　账户 ${s.accounts} 个 · 流水 ${s.transactions} 笔 · 计划 ${s.scheduled} 条`;
      body.appendChild(info);

      if (s.loose) {
        const p = document.createElement('p');
        p.className = 'nt-import-map-err';
        p.textContent = `${s.loose} 笔流水两端账户都对不上（会留空，导入后补）`;
        body.appendChild(p);
      }
    },
    actions: [
      { label: '取消', kind: 'ghost', close: true },
      {
        label: '覆盖并导入',
        kind: 'danger',
        onClick: () => {
          if (o.onImportTemplate) o.onImportTemplate(built.state, s);
        },
      },
    ],
  });
}

/** 预览 + 确认 */
function showPreview(result, o, rows) {
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
        bad.textContent = '这张表认不出表头。可以手动指定每列是什么 —— '
          + '只要有一列日期 + 一列金额就能导。';
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
      ? [
        { label: '关闭', kind: 'ghost', close: true },
        {
          label: '手动指定列',
          kind: 'primary',
          onClick: () => openColumnMapper(rows, (mapped) => {
            const next = {
              ...result,
              kind: 'generic',
              presetName: '',
              headerIdx: mapped.headerIdx,
              map: mapped.map,
              items: mapped.items,
              needAccount: true,
              note: `按手动指定的列映射解析，共 ${mapped.items.length} 笔`,
            };
            showPreview(next, o, rows);
          }),
        },
      ]
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
