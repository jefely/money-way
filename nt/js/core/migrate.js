/**
 * 数据迁移（公约 4.1：必须自带版本号、必须幂等）。
 *
 * 纯函数：吃旧数据，吐新数据；同一个输入跑一百遍结果一样。
 */

import { STATE_VERSION } from './state.js';

/** 迁移步骤表：键 = 目标版本。加结构变更时往后追加，不改旧的。 */
const STEPS = {
  // 0 → 1：早期数据没有 version 字段，补上并把 seq 归一。
  1(data) {
    const out = { ...data, version: 1 };
    const maxSeq = (out.transactions || []).reduce((m, t) => Math.max(m, Number(t.seq) || 0), 0);
    out.seq = Math.max(Number(out.seq) || 0, maxSeq);
    return out;
  },
};

/**
 * 把任意版本的数据迁到 STATE_VERSION。
 * @param {object} raw
 * @returns {{state:object, migrated:boolean, from:number, to:number}}
 */
export function migrate(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  let version = Number(src.version) || 0;
  const from = version;
  let data = { ...src, version };

  // 版本比当前还高：不认识的字段一律不动，原样返回（避免降级破坏数据）。
  if (version > STATE_VERSION) {
    return { state: data, migrated: false, from, to: version };
  }

  while (version < STATE_VERSION) {
    const next = version + 1;
    const step = STEPS[next];
    if (!step) { version = next; continue; }   // 缺失的步骤视为空操作
    data = step(data);
    version = next;
  }

  return { state: data, migrated: from !== STATE_VERSION, from, to: STATE_VERSION };
}
