// 界面：（无界面）SHA-256 与字节拼接
/**
 * 完整性清单和会员模块解封都用浏览器自带的 SHA-256。
 * 不碰 DOM，Node 测试能直接跑。
 */

export function concat(parts) {
  let n = 0;
  for (let i = 0; i < parts.length; i++) n += parts[i].length;
  const out = new Uint8Array(n);
  let offset = 0;
  for (let i = 0; i < parts.length; i++) {
    out.set(parts[i], offset);
    offset += parts[i].length;
  }
  return out;
}

export function utf8(text) {
  return new TextEncoder().encode(String(text));
}

export function hex(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

export async function sha256(bytes) {
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(buf);
}
