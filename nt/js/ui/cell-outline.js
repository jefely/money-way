// 界面：多格选区的整体描边
/**
 * 选区描边
 * 层：第五层 · UI
 *
 * 用 fixed 定位画在视口上，并按表格容器的可视区域裁一刀：
 * 选区比屏幕宽时，右边缘就落在表格可视右缘，不会被 overflow 裁掉；
 * 也不再靠每个格子的 inset 阴影拼四条边。
 */

let box = null;

export function showOutline(left, top, right, bottom) {
  if (right - left < 1 || bottom - top < 1) { hideOutline(); return; }
  if (!box) {
    box = document.createElement('div');
    box.className = 'nt-range-outline';
    document.body.appendChild(box);
  }
  box.style.left = Math.round(left) + 'px';
  box.style.top = Math.round(top) + 'px';
  box.style.width = Math.round(right - left) + 'px';
  box.style.height = Math.round(bottom - top) + 'px';
  box.hidden = false;
}

export function hideOutline() {
  if (box) box.hidden = true;
}
