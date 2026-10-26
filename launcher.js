/**
 * NT账本 · 版本启动器
 *
 * 只做一件事：把 versions.json 里的快照清单摆出来，点一个就进去。
 *
 * 版本号来源有两处，都刻意选了「小文件」：
 *   · 清单本身（versions.json，几百字节）由人维护
 *   · 各版本的真实号仍可回读各自 sw.js（切换时不会显示过期号）
 * 这里不再下载任何 index.html。
 */

const LIST = './versions.json';

const KIND_TEXT = {
  single: '单文件版',
  multi: '多文件版',
};

const KIND_CLASS = {
  single: 'la-badge-single',
  multi: 'la-badge-multi',
};

let items = [];

/** 建一个卡片（DOM 拼装，不拼 HTML 字符串） */
function buildCard(item) {
  const li = document.createElement('li');
  li.className = 'la-item';

  const a = document.createElement('a');
  a.className = 'la-card' + (item.kind === 'multi' ? ' la-card-alt' : '');
  a.href = item.path;
  a.dataset.id = item.id;

  // 头部：名称 + 类型徽章 + 当前徽章
  const head = document.createElement('span');
  head.className = 'la-card-head';

  const name = document.createElement('span');
  name.className = 'la-card-name';
  name.textContent = item.label || item.id;

  const kind = document.createElement('span');
  kind.className = 'la-badge ' + (KIND_CLASS[item.kind] || '');
  kind.textContent = item.kind === 'multi' ? '多文件' : '单文件';

  const stage = document.createElement('span');
  stage.className = 'la-badge ' + (item.current ? 'la-badge-stable' : 'la-badge-mild');
  stage.textContent = item.stage || '';

  head.appendChild(name);
  head.appendChild(kind);
  if (item.stage) head.appendChild(stage);

  // 说明
  const desc = document.createElement('span');
  desc.className = 'la-card-desc';
  desc.textContent = item.note || '';

  // 进入
  const go = document.createElement('span');
  go.className = 'la-card-go';
  go.textContent = '进入 →';

  a.appendChild(head);
  a.appendChild(desc);
  a.appendChild(go);
  li.appendChild(a);
  return li;
}

/** 按 kind 分组渲染 */
function render() {
  const host = document.getElementById('la-list');
  if (!host) return;
  host.textContent = '';

  for (const item of items) {
    host.appendChild(buildCard(item));
  }

  const counts = items.reduce((m, it) => {
    m[it.kind] = (m[it.kind] || 0) + 1;
    return m;
  }, {});
  note(`共 ${items.length} 个阶段可选 · 单文件版 ${counts.single || 0} 个 · 多文件版 ${counts.multi || 0} 个`);
}

/** 顶部提示 */
function note(text, bad) {
  const el = document.getElementById('la-note');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('la-note-bad', !!bad);
}

async function main() {
  try {
    const res = await fetch(LIST, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    items = Array.isArray(data.items) ? data.items : [];
    if (!items.length) throw new Error('清单为空');
    render();
  } catch (e) {
    note('版本清单读取失败：' + e.message, true);
  }
}

main();
