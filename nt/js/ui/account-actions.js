// 界面：设置 tab → 账户列表操作
﻿/**
 * 账户动作（UI 层）
 *
 * 把「账户弹窗里的增删改」翻译成 state 操作，再交给调用方保存。
 * 本文件不直接持有 state —— 全部通过 handlers 传入，便于测试与复用。
 */

import { addAccount, updateAccount, removeAccount } from '../core/state-store.js';
import { normalizeCode, ACCOUNT_TYPE } from '../core/schema.js';
import { uniqueCode } from '../core/import-apply.js';
import * as NtModal from './modal.js';
import { openAccountDialog } from './account-dialog.js';

/**
 * @param {{
 *   getState: () => object,
 *   setState: (s:object) => void,
 *   render: () => void,
 *   save: () => Promise<void>,
 *   reopen: () => void
 * }} h
 */
export function openAccountsWith(h) {
  const state = h.getState();

  openAccountDialog({
    accounts: state.accounts,

    onUpdate: async (id, patch) => {
      const p = { ...patch };
      if (p.code != null) p.code = normalizeCode(p.code);
      h.setState(updateAccount(h.getState(), id, p));
      h.render();
      await h.save();
    },

    onAdd: async (patch) => {
      const p = { ...patch, type: patch.type || ACCOUNT_TYPE.ASSET };
      p.code = uniqueCode(h.getState().accounts, p.code || patch.name || 'ACC');
      h.setState(addAccount(h.getState(), p));
      h.render();
      await h.save();
    },

    onDelete: async (id) => {
      h.setState(removeAccount(h.getState(), id));
      h.render();
      await h.save();
    },

    onRefresh: () => {
      NtModal.closeAll();
      h.reopen();
    },
  });
}
