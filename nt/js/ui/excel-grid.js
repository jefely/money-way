// 界面：流水 / 简码设置 / 固定收支共用的 Excel 格子层
/**
 * 共享格子层
 * 层：第五层 · UI
 *
 * 三张表挂同一套：单击选中（无光标、键盘由隐藏格持有）、双击编辑、行号选行、
 * 右下角手柄、五按钮菜单。表自己的字段解析/保存仍由各页负责：
 *   · 流水页：row-editor + 开放录入区；
 *   · 设置页 / 固定页：输入框的 input/change 监听（nativeCommit）。
 */

import { bindCellEdit } from './cell-edit.js';
import { mountCellSelect } from './cell-select.js';

export function mountExcelGrid(tableEl, tbody, opts) {
  const o = opts || {};
  const select = mountCellSelect(tableEl, tbody, {
    onNotice: o.onNotice,
    pasteSingle: o.pasteSingle,
  });
  const edit = bindCellEdit(tbody, {
    nativeCommit: o.nativeCommit,
    enterTab: o.enterTab,
    onLeaveRow: o.onLeaveRow,
    seqMenu: o.seqMenu,
    onSelect: (td) => select.single(td),
    onRelease: () => select.clear(),
    onRowSelect: (tr) => select.row(tr),
  });
  select.setEditor(edit);
  return { select, edit };
}
