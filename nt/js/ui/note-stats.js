// 界面：备注统计（关键字 → 金额，再按备注类型分两级）
/**
 * 备注统计（UI 层）
 *
 * 用户 2026-11-08：备注统计 **不参与平账**，只是累加。
 * 一级按关键字（味丰源）合计，二级按备注的统计分类（类型）分组。
 * 累加出来怎么用由用户自己判断，这里只负责把数摆清楚。
 */

import * as NtModal from './modal.js';
import { noteTotals, rollupByKeyword } from '../core/note-stats.js';
import { money } from '../core/format.js';

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

/**
 * @param {{getState:Function, setFooter?:Function}} ctx
 */
export function openNoteStats(ctx) {
  const rows = noteTotals(ctx.getState());
  const byKw = rollupByKeyword(rows);

  NtModal.open({
    title: '备注统计',
    body: '',
    build: (body) => {
      body.textContent = '';
      if (!byKw.length) {
        body.appendChild(el('p', 'nt-sync-hint nt-imp-sub', '还没有带关键字的流水。导入账单或手动填备注关键字后，这里会按关键字累加。'));
        return;
      }
      body.appendChild(el('p', 'nt-sync-hint nt-imp-sub', '只累加、不平账：一级按关键字，二级按备注类型。'));

      const list = el('div', 'nt-note-sum');
      for (const kw of byKw) {
        const line = el('div', 'nt-note-sum-line');
        line.appendChild(el('span', 'nt-note-sum-kw', kw.keyword));
        line.appendChild(el('span', 'nt-note-sum-n', kw.count + ' 笔'));
        line.appendChild(el('span', 'nt-note-sum-amt', money(kw.sum)));
        list.appendChild(line);

        for (const t of kw.types) {
          const sub = el('div', 'nt-note-sum-sub');
          sub.appendChild(el('span', 'nt-note-sum-type', t.type || '（未设类型）'));
          sub.appendChild(el('span', 'nt-note-sum-n', t.count + ' 笔'));
          sub.appendChild(el('span', 'nt-note-sum-amt', money(t.sum)));
          list.appendChild(sub);
        }
      }
      body.appendChild(list);
    },
    actions: [{ label: '知道了', kind: 'primary', close: true }],
  });
}
