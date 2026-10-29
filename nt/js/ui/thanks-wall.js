// 界面：校验页「赞助感谢」—— 感谢墙（名字方块 + PNG 图片）
/**
 * 感谢墙（UI 层，本地版）
 *
 * 单文件版的感谢墙是 `thanks.json` 那套「转账备注写昵称 → 我手动加进名单」，
 * 这里复刻它的**样子**：直角方块、按字数分档、配色按名字哈希；
 * 数据落在本机 localStorage —— NT账本 是离线应用，没有服务器可以取名单。
 *
 * 存储：`nt_thanks_v1` = { qr?: dataURL, items: [{ t:'name', v } | { t:'img', v }] }
 *   图片是 dataURL（PNG），所以有单张与总量上限；感谢墙是公开内容，不加密。
 */

const KEY = 'nt_thanks_v1';
const MAX_IMG_BYTES = 600 * 1024;   // 单张 PNG 上限（dataURL 约为原文件的 1.34 倍）
const MAX_ITEMS = 40;
const MAX_NAME = 16;

/** 方块配色：[底色, 字色]。从单文件版的 THANKS_PALETTE 取前 8 组（绿色系已剔除）。 */
const PALETTE = [
  ['#C6413A', '#ffffff'],  // 樱桃红
  ['#F0CE6B', '#3A2E14'],  // 奶油黄
  ['#565A9E', '#ffffff'],  // 光环靛
  ['#8A6B4F', '#ffffff'],  // 摩卡慕斯
  ['#3F4A5A', '#ffffff'],  // 石墨蓝
  ['#E8A0A0', '#3A1414'],  // 浅樱桃
  ['#7A5C9E', '#ffffff'],  // 紫罗兰
  ['#C9A227', '#2A2105'],  // 金黄
];

/* ---------- 尺寸 / 断行 ---------- */

/** 名字 → { lines, box, fs }：按字数分档，方块 46 / 66 / 92。 */
export function thanksPlan(name) {
  const raw = String(name == null ? '' : name).trim() || '匿名';

  // 手动断行：名字里写 | 就按 | 切（单文件版的行为）
  if (raw.indexOf('|') >= 0) {
    const parts = raw.split('|').map((x) => x.trim()).filter(Boolean);
    if (parts.length) {
      const maxLen = Math.max(...parts.map((p) => [...p].length));
      const box = parts.length <= 1 ? 46 : (parts.length === 2 ? 92 : 138);
      return { raw, lines: parts, box, fs: fitFont(parts.join(''), maxLen, parts.length, box) };
    }
  }

  const chars = [...raw];
  const n = chars.length;
  const latin = !/[\u4e00-\u9fa5]/.test(raw);

  // 拉丁名尽量排一行（jefely 切成 je/fe/ly 很难认）；中文按字数分档
  const rows = latin
    ? (n <= 10 ? 1 : 2)
    : (n <= 2 ? 1 : (n <= 4 ? 2 : (n <= 9 ? 3 : 4)));
  const box = latin
    ? (n <= 10 ? (n <= 4 ? 46 : (n <= 7 ? 66 : 92)) : 92)
    : (n <= 2 ? 46 : (n <= 4 ? 66 : 92));

  const perRow = Math.ceil(n / rows);
  const lines = [];
  for (let i = 0; i < n; i += perRow) lines.push(chars.slice(i, i + perRow).join(''));
  return { raw, lines, box, fs: fitFont(raw, perRow, lines.length, box) };
}

function fitFont(text, perRow, rows, box) {
  const charW = /[\u4e00-\u9fa5]/.test(text) ? 1 : 0.62;
  const inner = box - Math.max(8, box * 0.1) * 2;
  const byW = inner / (Math.max(1, perRow) * charW);
  const byH = inner / (Math.max(1, rows) * 1.16);
  return Math.max(9, Math.min(46, Math.floor(Math.min(byW, byH))));
}

/** 名字 → 调色板下标（FNV-1a，同名永远同色） */
function hashOf(s) {
  let h = 2166136261;
  const str = String(s || '');
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/* ---------- 存储 ---------- */

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const o = raw ? JSON.parse(raw) : null;
    if (!o || typeof o !== 'object') return { qr: '', items: [] };
    const items = Array.isArray(o.items) ? o.items.filter((it) => it && it.t && it.v) : [];
    return { qr: typeof o.qr === 'string' ? o.qr : '', items };
  } catch (e) {
    return { qr: '', items: [] };
  }
}

function save(data, notify) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    // 容量超限时浏览器抛 QuotaExceededError —— 图片是主要来源
    if (notify) notify('存不下：感谢墙的图片太多了，先删几张再试');
    return false;
  }
}

/* ---------- 渲染 ---------- */

/**
 * 挂载感谢墙。
 * @param {{notify?:(text:string)=>void}} [opts]
 * @returns {HTMLElement}
 */
export function mountThanksWall(opts) {
  const o = opts || {};
  const notify = (t) => { if (o.notify) o.notify(t); };
  let data = load();

  const section = document.createElement('section');
  section.className = 'nt-text-block nt-thanks';

  const title = document.createElement('h3');
  title.className = 'nt-block-title';
  title.textContent = '赞助感谢';
  section.appendChild(title);

  const lead = document.createElement('p');
  lead.className = 'nt-block-line';
  lead.textContent = '感谢你使用 NT账本。把这条工具推荐给需要的人，就是最好的支持。';
  section.appendChild(lead);

  /* 收款码：有就显示图片，没有就是一个虚线占位（点它选 PNG） */
  const qrWrap = document.createElement('div');
  qrWrap.className = 'nt-thanks-qr-wrap';
  section.appendChild(qrWrap);

  /* 说明 */
  const tip = document.createElement('div');
  tip.className = 'nt-thanks-tip';
  tip.innerHTML = '<b>想出现在下面的感谢墙？</b><br>'
    + '转账时把昵称填进<b>「转账备注」</b>里就行（也可以留空保持匿名）。<br>'
    + '只显示昵称/图片，<b>不显示金额、不显示时间</b>。';
  section.appendChild(tip);

  /* 墙头 */
  const head = document.createElement('div');
  head.className = 'nt-thanks-head';
  const h4 = document.createElement('h4');
  h4.className = 'nt-thanks-title';
  h4.textContent = '感谢墙';
  const count = document.createElement('span');
  count.className = 'nt-thanks-count';
  head.appendChild(h4);
  head.appendChild(count);
  section.appendChild(head);

  const wall = document.createElement('div');
  wall.className = 'nt-thanks-wall';
  section.appendChild(wall);

  /* 管理区：本机维护（加名字 / 加 PNG / 清空） */
  const manage = document.createElement('div');
  manage.className = 'nt-thanks-manage';

  const nameInput = document.createElement('input');
  nameInput.className = 'nt-input nt-thanks-name';
  nameInput.type = 'text';
  nameInput.maxLength = MAX_NAME;
  nameInput.placeholder = '昵称（最多 ' + MAX_NAME + ' 字）';
  nameInput.setAttribute('aria-label', '要添加的昵称');

  const addName = document.createElement('button');
  addName.type = 'button';
  addName.className = 'nt-btn nt-btn-sm';
  addName.textContent = '添加名字';

  const addImg = document.createElement('button');
  addImg.type = 'button';
  addImg.className = 'nt-btn nt-btn-sm';
  addImg.textContent = '添加 PNG';

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'nt-btn nt-btn-sm nt-thanks-clear';
  clearBtn.textContent = '清空';

  manage.appendChild(nameInput);
  manage.appendChild(addName);
  manage.appendChild(addImg);
  manage.appendChild(clearBtn);
  section.appendChild(manage);

  /* ---------- 渲染 ---------- */

  function paintQr() {
    qrWrap.textContent = '';
    if (data.qr) {
      const img = document.createElement('img');
      img.className = 'nt-thanks-qr';
      img.alt = '赞助收款码';
      img.src = data.qr;
      qrWrap.appendChild(img);

      const acts = document.createElement('div');
      acts.className = 'nt-thanks-qr-acts';
      const change = document.createElement('button');
      change.type = 'button';
      change.className = 'nt-btn nt-btn-sm';
      change.textContent = '换收款码';
      change.addEventListener('click', () => pickPng((url) => { data.qr = url; commit(); }));
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'nt-btn nt-btn-sm';
      del.textContent = '移除';
      del.addEventListener('click', () => { data.qr = ''; commit(); });
      acts.appendChild(change);
      acts.appendChild(del);
      qrWrap.appendChild(acts);
      return;
    }

    const slot = document.createElement('button');
    slot.type = 'button';
    slot.className = 'nt-thanks-qr-miss';
    slot.textContent = '＋ 添加收款码（PNG）';
    slot.addEventListener('click', () => pickPng((url) => { data.qr = url; commit(); }));
    qrWrap.appendChild(slot);
  }

  function paintWall() {
    wall.textContent = '';
    count.textContent = data.items.length ? String(data.items.length) + ' 位' : '';

    if (!data.items.length) {
      const empty = document.createElement('span');
      empty.className = 'nt-thanks-empty';
      empty.textContent = '还没有人，等第一位朋友。';
      wall.appendChild(empty);
      return;
    }

    for (let i = 0; i < data.items.length; i += 1) {
      const it = data.items[i];
      wall.appendChild(it.t === 'img' ? imgCell(it.v, i) : nameCell(it.v, i));
    }
  }

  function nameCell(name, i) {
    const p = thanksPlan(name);
    const pair = PALETTE[hashOf(p.raw) % PALETTE.length];

    const el = document.createElement('span');
    el.className = 'nt-thanks-chip';
    el.style.width = p.box + 'px';
    el.style.height = p.box + 'px';
    el.style.fontSize = p.fs + 'px';
    el.style.background = pair[0];
    el.style.color = pair[1];
    el.setAttribute('role', 'listitem');
    for (const line of p.lines) {
      const row = document.createElement('span');
      row.className = 'nt-thanks-chip-row';
      row.textContent = line;
      el.appendChild(row);
    }
    el.appendChild(delBtn(i));
    return el;
  }

  function imgCell(src, i) {
    const el = document.createElement('span');
    el.className = 'nt-thanks-img';
    el.setAttribute('role', 'listitem');

    const img = document.createElement('img');
    img.alt = '感谢墙图片';
    img.src = src;
    el.appendChild(img);
    el.appendChild(delBtn(i));
    return el;
  }

  function delBtn(i) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nt-thanks-del';
    b.setAttribute('data-idx', String(i));
    b.setAttribute('aria-label', '删除这一项');
    b.textContent = '×';
    return b;
  }

  /* ---------- 交互 ---------- */

  function commit() {
    if (save(data, notify)) {
      paintQr();
      paintWall();
    }
  }

  addName.addEventListener('click', () => {
    const name = String(nameInput.value || '').trim();
    if (!name) { notify('先写一个昵称'); return; }
    if (data.items.some((it) => it.t === 'name' && String(it.v) === name)) {
      notify('「' + name + '」已经在墙上了');
      return;
    }
    if (data.items.length >= MAX_ITEMS) { notify('感谢墙最多 ' + MAX_ITEMS + ' 项'); return; }
    data.items.push({ t: 'name', v: name });
    nameInput.value = '';
    commit();
    notify('已添加：' + name);
  });

  nameInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); addName.click(); }
  });

  addImg.addEventListener('click', () => {
    pickPng((url) => {
      if (data.items.length >= MAX_ITEMS) { notify('感谢墙最多 ' + MAX_ITEMS + ' 项'); return; }
      data.items.push({ t: 'img', v: url });
      commit();
      notify('已添加一张 PNG');
    });
  });

  clearBtn.addEventListener('click', () => {
    if (!data.items.length) { notify('感谢墙已经是空的'); return; }
    if (!window.confirm('清空感谢墙上的 ' + data.items.length + ' 项？（收款码会保留）')) return;
    data.items = [];
    commit();
    notify('感谢墙已清空');
  });

  wall.addEventListener('click', (ev) => {
    const b = ev.target && ev.target.closest ? ev.target.closest('.nt-thanks-del') : null;
    if (!b) return;
    const i = Number(b.getAttribute('data-idx'));
    if (!Number.isInteger(i) || i < 0 || i >= data.items.length) return;
    data.items.splice(i, 1);
    commit();
  });

  paintQr();
  paintWall();
  return section;
}

/* ---------- PNG 选择 ---------- */

/**
 * 选一张 PNG → 读成 dataURL。
 * 只收 PNG（提供方要求）；`file.type` 在某些系统为空，用扩展名兜底。
 */
function pickPng(onPick) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/png,.png';
  inp.style.display = 'none';
  document.body.appendChild(inp);

  inp.addEventListener('change', () => {
    const file = inp.files && inp.files[0];
    inp.remove();
    if (!file) return;

    const isPng = file.type === 'image/png' || /\.png$/i.test(file.name || '');
    if (!isPng) { window.alert('只支持 PNG 图片（.png）'); return; }
    if (file.size > MAX_IMG_BYTES) {
      window.alert('这张 PNG 太大了（' + Math.round(file.size / 1024) + ' KB），'
        + '请压到 ' + Math.round(MAX_IMG_BYTES / 1024) + ' KB 以内');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') onPick(reader.result);
    };
    reader.onerror = () => { window.alert('这张图片读不出来，换一张试试'); };
    reader.readAsDataURL(file);
  });

  inp.click();
}
