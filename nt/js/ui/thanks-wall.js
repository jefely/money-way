// 界面：校验页「赞助感谢」—— 远程加密的感谢墙
/**
 * 感谢墙（UI 层，远程名单版）
 *
 * 流程（用户 2026-10-29 定）：
 *   站长改仓库里的明文名单 → `_tools/thanks_encrypt.mjs` 加密成
 *   `nt/thanks.enc.json` → 提交；用户打开软件时自动拉取、解密、显示。
 *
 * 加密：PBKDF2-SHA256(100000) → AES-GCM-256，格式 { v, salt, iv, ct }（base64）。
 * 密钥内置在这个文件里（拆段拼出来的）—— 它只防「随手看明文 / 随手改」，
 * 不是密码学意义上的秘密。
 *
 * 离线：解密结果缓存在 localStorage；拉不到或解不开时用缓存，
 * 第一次打开就离线则显示空墙。
 */

const ENC_URL = './thanks.enc.json';
const CACHE_KEY = 'nt_thanks_cache_v1';

/** 拼接内置密钥（拆成几段，避免直接搜到整串） */
function secret() {
  return 'nt' + String.fromCharCode(45, 103, 119) + (2025).toString(36) + 'thanks';
}

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

/* ---------- 尺寸 / 断行（与单文件版一致的分档） ---------- */

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

/* ---------- 加密 / 缓存 ---------- */

function b64ToBytes(b64) {
  const bin = atob(String(b64 || ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/** 解 { v, salt, iv, ct }（base64）→ 明文对象 */
export async function decryptWall(box) {
  if (!box || !box.ct || !box.salt || !box.iv) throw new Error('格式不对');
  const subtle = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto.subtle : null;
  if (!subtle) throw new Error('这个浏览器不支持 WebCrypto');

  const raw = new TextEncoder().encode(secret());
  const base = await subtle.importKey('raw', raw, 'PBKDF2', false, ['deriveKey']);
  const key = await subtle.deriveKey(
    { name: 'PBKDF2', salt: b64ToBytes(box.salt), iterations: 100000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(box.iv) }, key, b64ToBytes(box.ct));
  return JSON.parse(new TextDecoder().decode(plain));
}

/** 拉远程名单：`?t=` 绕过 Service Worker 的缓存匹配，保证拿到仓库里的最新版 */
async function fetchWall() {
  const res = await fetch(ENC_URL + '?t=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return await decryptWall(await res.json());
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const o = raw ? JSON.parse(raw) : null;
    return o && typeof o === 'object' ? o : null;
  } catch (e) {
    return null;
  }
}

function saveCache(o) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(o));
  } catch (e) { /* 存不下就只影响离线 */ }
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

  const qrWrap = document.createElement('div');
  qrWrap.className = 'nt-thanks-qr-wrap';
  section.appendChild(qrWrap);

  const tip = document.createElement('div');
  tip.className = 'nt-thanks-tip';
  tip.innerHTML = '<b>想出现在下面的感谢墙？</b><br>'
    + '转账时把昵称填进<b>「转账备注」</b>里就行（也可以留空保持匿名）。<br>'
    + '只显示昵称/图片，<b>不显示金额、不显示时间</b>。';
  section.appendChild(tip);

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

  function paintWall(data) {
    const donors = data && Array.isArray(data.donors) ? data.donors : [];
    wall.textContent = '';
    count.textContent = donors.length ? String(donors.length) + ' 位' : '';

    if (!donors.length) {
      const empty = document.createElement('span');
      empty.className = 'nt-thanks-empty';
      empty.textContent = '还没有人，等第一位朋友。';
      wall.appendChild(empty);
      return;
    }

    for (const d of donors) {
      if (!d) continue;
      if (d.img) wall.appendChild(imgCell(d.img));
      else wall.appendChild(nameCell(d.n));
    }
  }

  function paintQr(data) {
    qrWrap.textContent = '';
    const src = data && data.qr;
    if (!src) return;
    const img = document.createElement('img');
    img.className = 'nt-thanks-qr';
    img.alt = '赞助收款码';
    img.src = src;
    qrWrap.appendChild(img);
  }

  function nameCell(name) {
    const p = thanksPlan(name);
    const pair = PALETTE[hashOf(p.raw) % PALETTE.length];

    const el = document.createElement('span');
    el.className = 'nt-thanks-chip';
    el.style.width = p.box + 'px';
    el.style.height = p.box + 'px';
    el.style.fontSize = p.fs + 'px';
    el.style.background = pair[0];
    el.style.color = pair[1];
    for (const line of p.lines) {
      const row = document.createElement('span');
      row.className = 'nt-thanks-chip-row';
      row.textContent = line;
      el.appendChild(row);
    }
    return el;
  }

  function imgCell(src) {
    const el = document.createElement('span');
    el.className = 'nt-thanks-img';
    const img = document.createElement('img');
    img.alt = '感谢墙图片';
    img.src = src;
    el.appendChild(img);
    return el;
  }

  /* ---------- 首次渲染：缓存 → 远程刷新 ---------- */

  const cached = loadCache();
  paintQr(cached);
  paintWall(cached);

  fetchWall().then((data) => {
    saveCache(data);
    paintQr(data);
    paintWall(data);
  }).catch(() => {
    // 离线 / 文件没更新 / 解密失败：保持缓存；第一次打开就是空的
    if (!cached) notify('感谢墙暂时取不到（离线或文件未更新）');
  });

  return section;
}
