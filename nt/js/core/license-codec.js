// 界面：（无界面）激活码载荷的编码（base32 + 校验位）
/**
 * 二进制载荷（版本 1），小端：
 *   u8  version = 1
 *   u8  tier
 *   u16 features
 *   u8  seats          0 = 不限制设备
 *   u32 issued         unix 秒
 *   u32 expiry         unix 秒，0 = 不过期
 *   8   license id
 *   16  seal           解会员模块用，不是签名私钥
 *   u8  userLen        1..48
 *   N   user utf-8
 *
 * 激活码 = base32(载荷 || Ed25519 签名 64 || CRC16 2)
 * 人读的时候按 4 位分组，前面加 NT1-。
 * CRC 先查，抄错不必去验签。
 */

const ALPH = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const REV = new Map();
for (let i = 0; i < ALPH.length; i++) REV.set(ALPH[i], i);
REV.set('I', 1);
REV.set('L', 1);
REV.set('O', 0);

const PAYLOAD_FIXED = 38;
const SIG_LEN = 64;

function fail(code) {
  return { ok: false, reason: code };
}

export function crc16(bytes) {
  let crc = 0xffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] << 8;
    for (let b = 0; b < 8; b++) {
      if (crc & 0x8000) crc = ((crc << 1) ^ 0x1021) & 0xffff;
      else crc = (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}

export function b32encode(bytes) {
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < bytes.length; i++) {
    buffer = buffer * 256 + bytes[i];
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      const shift = 2 ** bits;
      out += ALPH[Math.floor(buffer / shift) % 32];
      buffer %= shift;
    }
  }
  if (bits > 0) out += ALPH[(buffer * (2 ** (5 - bits))) % 32];
  return out;
}

export function b32decode(text) {
  let buffer = 0;
  let bits = 0;
  const out = [];
  for (let i = 0; i < text.length; i++) {
    const v = REV.get(text[i]);
    if (v == null) {
      const err = new Error('alphabet');
      err.code = 'alphabet';
      throw err;
    }
    buffer = buffer * 32 + v;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      const shift = 2 ** bits;
      out.push(Math.floor(buffer / shift) % 256);
      buffer %= shift;
    }
  }
  return Uint8Array.from(out);
}

function writeU32(buf, offset, value) {
  const n = value >>> 0;
  buf[offset] = n & 255;
  buf[offset + 1] = (n >>> 8) & 255;
  buf[offset + 2] = (n >>> 16) & 255;
  buf[offset + 3] = (n >>> 24) & 255;
}

function readU32(buf, offset) {
  return (buf[offset]
    | (buf[offset + 1] << 8)
    | (buf[offset + 2] << 16)
    | (buf[offset + 3] << 24)) >>> 0;
}

function copyBytes(bytes) {
  const out = new Uint8Array(bytes.length);
  out.set(bytes);
  return out;
}

/**
 * @param {{tier?:number, features?:number, seats?:number, issued?:number, expiry?:number,
 *          licenseId:Uint8Array, seal:Uint8Array, user:string}} fields
 */
export function encodePayload(fields) {
  const src = fields || {};
  const user = new TextEncoder().encode(String(src.user || ''));
  if (user.length < 1 || user.length > 48) {
    const err = new Error('user');
    err.code = 'user';
    throw err;
  }
  if (!src.licenseId || src.licenseId.length !== 8) {
    const err = new Error('id');
    err.code = 'id';
    throw err;
  }
  if (!src.seal || src.seal.length !== 16) {
    const err = new Error('seal');
    err.code = 'seal';
    throw err;
  }
  const out = new Uint8Array(PAYLOAD_FIXED + user.length);
  out[0] = 1;
  out[1] = Number(src.tier) & 255;
  const features = Number(src.features) >>> 0;
  out[2] = features & 255;
  out[3] = (features >>> 8) & 255;
  out[4] = Number(src.seats) & 255;
  writeU32(out, 5, Number(src.issued) || 0);
  writeU32(out, 9, Number(src.expiry) || 0);
  out.set(src.licenseId, 13);
  out.set(src.seal, 21);
  out[37] = user.length;
  out.set(user, 38);
  return out;
}

export function parsePayload(buf) {
  if (!buf || buf.length < PAYLOAD_FIXED) return fail('length');
  if (buf[0] !== 1) return fail('version');
  const userLen = buf[37];
  if (userLen < 1 || userLen > 48) return fail('length');
  if (buf.length !== PAYLOAD_FIXED + userLen) return fail('length');
  const userBytes = buf.subarray(38, 38 + userLen);
  return {
    ok: true,
    payload: {
      version: 1,
      tier: buf[1],
      features: buf[2] | (buf[3] << 8),
      seats: buf[4],
      issued: readU32(buf, 5),
      expiry: readU32(buf, 9),
      licenseId: copyBytes(buf.subarray(13, 21)),
      seal: copyBytes(buf.subarray(21, 37)),
      user: new TextDecoder().decode(userBytes),
    },
  };
}

export function groupCode(b32) {
  const parts = [];
  for (let i = 0; i < b32.length; i += 4) parts.push(b32.slice(i, i + 4));
  return 'NT1-' + parts.join('-');
}

/** 去掉空白、横线，以及可选的 NT1 前缀。前缀里的 1 也接受 I/L。I/L/O 在解码时再容错。 */
export function normalizeCodeText(text) {
  let s = String(text || '').toUpperCase().replace(/[\s-]+/g, '');
  if (/^NT[1IL]/.test(s)) s = s.slice(3);
  return s;
}

export function finishCode(payloadBytes, sig) {
  if (!sig || sig.length !== SIG_LEN) {
    const err = new Error('sig');
    err.code = 'sig';
    throw err;
  }
  const body = new Uint8Array(payloadBytes.length + SIG_LEN);
  body.set(payloadBytes, 0);
  body.set(sig, payloadBytes.length);
  const crc = crc16(body);
  const full = new Uint8Array(body.length + 2);
  full.set(body, 0);
  full[body.length] = (crc >>> 8) & 255;
  full[body.length + 1] = crc & 255;
  return groupCode(b32encode(full));
}

/** 只做格式和校验位。签名留给 verifyLicenseCode。 */
export function decodeCode(text) {
  const norm = normalizeCodeText(text);
  if (!norm) return fail('empty');
  let full;
  try {
    full = b32decode(norm);
  } catch (e) {
    return fail('alphabet');
  }
  if (full.length < PAYLOAD_FIXED + SIG_LEN + 2) return fail('length');
  const crcGot = (full[full.length - 2] << 8) | full[full.length - 1];
  const body = full.subarray(0, full.length - 2);
  if (crc16(body) !== crcGot) return fail('checksum');
  const payloadBytes = copyBytes(body.subarray(0, body.length - SIG_LEN));
  const sig = copyBytes(body.subarray(body.length - SIG_LEN));
  const parsed = parsePayload(payloadBytes);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    payloadBytes,
    sig,
    payload: parsed.payload,
  };
}
