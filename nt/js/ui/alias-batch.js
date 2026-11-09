// 界面：备注区的「批量归类」——一张列表，打勾 + 目标节点，一次合并完
/**
 * 批量归类（UI 层）
 *
 * 用户 2026-11-08：合并不要一笔一个弹窗，做成列表、打勾、一次统一完成。
 *
 * 列表里的每一行 = 备注区的一个「待归类关键字」（关键字正好是一个临时节点，
 * 并且有流水指向它）。勾上、填目标节点（已有节点名 → 合并；新名字 → 就地改名），
 * 点一次就把这批全并完，并把「说法 → 节点」写进软件级别名表。
 */

import * as NtModal from './modal.js';
import { mergeAccountInto } from '../core/account-merge.js';
import { updateAccount, removeNote } from '../core/state-store.js';
import { aliasPutMany, pendingKeywords } from '../core/alias-table.js';

const norm = (v) => String(v == null ? '' : v).trim();

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

/**
 * 备注区标题行右边的工具按钮（批量归类 / 备注统计）。
 * 放在这里而不是 note-table 里，是因为 300 行上限：note-table 已经贴着上限。
 */
export function noteTools(ctx, rerender) {
  const box = el('span', 'nt-note-tools');

  const pending = pendingKeywords(ctx.getState()).length;
  if (pending) {
    const go = el('button', 'nt-btn nt-btn-sm nt-note-batch', `批量归类 ${pending} 项`);
    go.type = 'button';
    go.addEventListener('click', () => openBatch(ctx, rerender));
    box.appendChild(go);
  }

  return box;
}

/**
 * @param {object} ctx {getState, setState, saveNow, setFooter, loadAliases, saveAliases}
 * @param {Function} rerender 重绘账户/备注表
 */
export function openBatch(ctx, rerender) {
  const items = pendingKeywords(ctx.getState());
  if (!items.length) {
    NtModal.info('批量归类', (body) => {
      body.textContent = '还没有待归类的关键字。导入账单后，出现次数多的商户会登记到这里。';
    });
    return;
  }

  const names = [...new Set((ctx.getState().accounts || [])
    .filter((a) => a && !a.isHidden && norm(a.name))
    .map((a) => norm(a.name)))];

  NtModal.open({
    title: '批量归类',
    body: '',
    build: (body) => {
      body.textContent = '';
      body.appendChild(el('p', 'nt-sync-hint nt-imp-sub', '勾选要归类的关键字，填目标节点（已有节点名就合并，新名字就改名）：'));

      const list = el('div', 'nt-alias-list');
      for (const it of items) {
        const row = el('div', 'nt-alias-row');
        const cb = el('input', 'nt-alias-check');
        cb.type = 'checkbox';

        const kw = el('span', 'nt-alias-kw', it.keyword);
        const cnt = el('span', 'nt-alias-n', it.count + ' 笔');

        const target = el('input', 'nt-input nt-input-sm nt-alias-target');
        target.type = 'text';
        target.placeholder = '节点名';
        target.setAttribute('list', 'nt-alias-names');
        target.value = '';

        row.appendChild(cb);
        row.appendChild(kw);
        row.appendChild(cnt);
        row.appendChild(target);
        list.appendChild(row);
      }
      body.appendChild(list);

      const dl = el('datalist');
      dl.id = 'nt-alias-names';
      for (const n of names) {
        const o = el('option');
        o.value = n;
        dl.appendChild(o);
      }
      body.appendChild(dl);
    },
    actions: [
      { label: '取消', kind: 'ghost', close: true },
      {
        label: '归类选中项',
        kind: 'primary',
        close: false,
        onClick: ({ close }) => {
          const rows = [...document.querySelectorAll('dialog[open] .nt-alias-row')];
          let st = ctx.getState();
          const pairs = [];
          for (const row of rows) {
            const cb = row.querySelector('.nt-alias-check');
            if (!cb || !cb.checked) continue;
            const kw = (row.querySelector('.nt-alias-kw') || {}).textContent || '';
            const target = norm((row.querySelector('.nt-alias-target') || {}).value);
            if (!target) continue;
            const acc = (st.accounts || []).find((a) => a && norm(a.name) === norm(kw));
            if (!acc) continue;
            const hit = (st.accounts || []).find((a) => a && norm(a.name) === target);
            if (hit && hit.id !== acc.id) st = mergeAccountInto(st, acc.id, hit.id).state;
            else if (!hit) st = updateAccount(st, acc.id, { name: target });
            const note = (st.notes || []).find((n) => n && norm(n.keyword) === norm(kw));
            if (note) st = removeNote(st, note.id);
            pairs.push({ term: kw, target });
          }
          if (!pairs.length) return;
          ctx.setState(st);
          ctx.saveNow();
          // 写进软件级别名表：下次导入/记账直接认出这些说法
          if (typeof ctx.saveAliases === 'function') {
            const run = (list) => { try { ctx.saveAliases(aliasPutMany(list, pairs)); } catch (e) { /* ignore */ } };
            if (typeof ctx.loadAliases === 'function') Promise.resolve(ctx.loadAliases()).then(run).catch(() => {});
            else run([]);
          }
          close();
          rerender();
          if (ctx.setFooter) ctx.setFooter(`已归类 ${pairs.length} 项，并记进别名表`);
        },
      },
    ],
  });
}
