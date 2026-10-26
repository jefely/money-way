/**
 * 调试面板的独立窗口（Document Picture-in-Picture）
 * 层：第五层 · UI
 *
 * 把 .nt-debug 整块搬到画中画浮窗，可拖到浏览器窗口外；关闭浮窗时搬回原页面。
 * 仅 Chromium 116+ 支持，未支持时按钮点击静默返回。
 */

export function isPiPSupported() {
  return typeof window !== 'undefined' && 'documentPictureInPicture' in window;
}

/** 复制当前页所有可读样式表到目标窗口 */
function copyStyles(targetDoc) {
  for (const sheet of document.styleSheets) {
    try {
      const css = [...sheet.cssRules].map((r) => r.cssText).join('\n');
      const style = targetDoc.createElement('style');
      style.textContent = css;
      targetDoc.head.appendChild(style);
    } catch (e) { /* 跨源样式表读不到，跳过 */ }
  }
}

/**
 * 把面板搬到画中画窗口
 * @param {HTMLElement} host .nt-debug 面板根节点
 * @returns {Promise<Window|null>}
 */
export async function openDebugPiP(host) {
  if (!isPiPSupported() || !host) return null;
  if (host.dataset.pip === '1') return null;

  const pip = await window.documentPictureInPicture.requestWindow({ width: 480, height: 720 });

  copyStyles(pip.document);
  const theme = document.documentElement.getAttribute('data-theme');
  if (theme) pip.document.documentElement.setAttribute('data-theme', theme);

  pip.document.body.appendChild(host);
  host.dataset.pip = '1';
  host.classList.add('nt-debug-in-pip');

  pip.addEventListener('pagehide', () => {
    host.dataset.pip = '';
    host.classList.remove('nt-debug-in-pip');
    document.body.appendChild(host);
  });

  return pip;
}

/** 拖动条右侧的「独立窗口」按钮 */
export function createPiPButton(host) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'nt-debug-pop';
  btn.textContent = '⧉';
  btn.setAttribute('aria-label', '独立窗口（画中画）');
  btn.title = '独立窗口';
  btn.addEventListener('click', () => { openDebugPiP(host).catch(() => {}); });
  return btn;
}
