/**
 * NT账本 · 版本启动器
 *
 * 只做一件事：把两个版本的最新版本号读出来，摆在卡片上。
 *
 * 版本号的唯一事实来源是各自 sw.js 里的缓存名——
 * 因为仓库约定「改静态资源必须同时改 APP_VER 和 CACHE」，
 * 所以读 CACHE 既不用下载 900KB 的 index.html，也不会和真实版本不同步。
 *
 * 单文件版：CACHE = 'mw-personal-v13.64'
 * 多文件版：CACHE_NAME = 'nt-v0.01'
 */

const SOURCES = [
  { url: './personal/sw.js', re: /CACHE\s*=\s*['"]mw-personal-(v[\d.]+)['"]/, target: 'ver-personal', prefix: '' },
  { url: './nt/sw.js', re: /CACHE_NAME\s*=\s*['"](nt-v[\d.]+)['"]/, target: 'ver-nt', prefix: '' },
];

/** 读一个文件里的版本号 */
async function readVersion(src) {
  const res = await fetch(src.url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${src.url} → HTTP ${res.status}`);
  const text = await res.text();
  const m = text.match(src.re);
  if (!m) throw new Error(`${src.url} 里没找到版本号`);
  return m[1];
}

/** 写到一个元素里 */
function setVersion(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/** 顶部提示 */
function note(text, bad) {
  const el = document.getElementById('la-note');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('la-note-bad', !!bad);
}

async function main() {
  let failed = 0;

  await Promise.all(SOURCES.map(async (src) => {
    try {
      const v = await readVersion(src);
      setVersion(src.target, v);
    } catch (e) {
      failed += 1;
      setVersion(src.target, '版本未知');
    }
  }));

  if (failed) {
    note('有一个版本的版本号没读到，仍可直接进入（不影响使用）', true);
  } else {
    note('版本号读自各自的 sw.js，与真实版本一致');
  }
}

main();
