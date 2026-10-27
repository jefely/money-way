/**
 * 本地文件读写（UI 层）
 * 层：第五层 · UI
 *
 * 只做两件事：把文本存成文件、让用户选一个文件读成文本。
 * 不碰账本内容 —— 解析在 core 里。
 */

/**
 * 下载一段文本为文件。
 * @param {string} filename 例如 'NT账本-2026-10-27.txt'
 * @param {string} text
 * @param {string} [mime]
 */
export function downloadText(filename, text, mime) {
  const blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  // 立刻 revoke 在部分浏览器上会打断下载，延迟一下
  setTimeout(() => {
    try { URL.revokeObjectURL(url); } catch (e) { /* 忽略 */ }
    a.remove();
  }, 1500);
}

/**
 * 让用户选一个文件并读出文本。
 * @param {string} [accept] 例如 '.txt,text/plain'
 * @returns {Promise<{name:string, text:string}>}
 */
export function pickTextFile(accept) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept || '.txt,text/plain';
    input.style.display = 'none';

    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) { reject(new Error('没有选择文件')); return; }
      try {
        const text = await readFile(file);
        resolve({ name: file.name, text });
      } catch (e) {
        reject(e);
      }
    });

    // 用户取消选择时 change 不触发，这里不处理（Promise 挂着无妨）
    document.body.appendChild(input);
    input.click();
  });
}

/** 读文件：优先用 File.text()，老浏览器走 FileReader */
function readFile(file) {
  if (typeof file.text === 'function') return file.text();

  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ''));
    fr.onerror = () => reject(new Error('读文件失败'));
    fr.readAsText(file, 'utf-8');
  });
}

/**
 * 生成一个带日期的文件名。
 * @param {string} prefix 例如 'NT账本'
 * @param {string} [ext] 例如 'txt'
 */
export function datedName(prefix, ext) {
  const d = new Date();
  const ymd = d.getFullYear()
    + String(d.getMonth() + 1).padStart(2, '0')
    + String(d.getDate()).padStart(2, '0');
  return prefix + '-' + ymd + '.' + (ext || 'txt');
}
