// 界面：（无界面）有上限的撤销 / 重做栈
/**
 * 全局撤销栈
 * 层：第一层 · 数据基座
 *
 * 存 JSON 字符串（state 是不可变对象，但序列化能确保快照不被后续原地修改影响），
 * 两个栈：undo 存「改之前」，redo 存「撤销时被换下来的当前状态」。
 * 任何一次新的编辑都会清空 redo —— 分支历史不留。
 *
 * 撤销/重做过程中加锁，避免把「刚恢复的状态」再压回栈里。
 */

export function createUndo(max) {
  const limit = Math.max(1, Number(max) || 20);
  const undoStack = [];
  const redoStack = [];
  let lock = false;

  const snap = (s) => {
    try {
      return JSON.stringify(s);
    } catch (e) {
      return '';
    }
  };

  return {
    get size() { return undoStack.length; },
    get redoSize() { return redoStack.length; },
    canUndo() { return undoStack.length > 0; },
    canRedo() { return redoStack.length > 0; },

    /** 记下「改之前」的状态。前后一样就不压；有新编辑就清空重做栈。 */
    note(prev, next) {
      if (lock) return;
      const a = snap(prev);
      const b = snap(next);
      if (!a || a === b) return;
      undoStack.push(a);
      if (undoStack.length > limit) undoStack.shift();
      redoStack.length = 0;
    },

    /** 清空两个栈（进入账本时用，避免一打开就能撤回到空账）。 */
    checkpoint() {
      undoStack.length = 0;
      redoStack.length = 0;
      lock = false;
    },

    /**
     * 弹出上一个状态。
     * @param {object} current 当前状态，会被压进重做栈
     * @returns {object|null}
     */
    pop(current) {
      if (!undoStack.length) return null;
      lock = true;
      const cur = snap(current);
      if (cur) {
        redoStack.push(cur);
        if (redoStack.length > limit) redoStack.shift();
      }
      try {
        return JSON.parse(undoStack.pop());
      } catch (e) {
        lock = false;
        return null;
      }
    },

    /**
     * 重做：把上一个被撤销的状态拿回来。
     * @param {object} current 当前状态，会被压回撤销栈
     * @returns {object|null}
     */
    redo(current) {
      if (!redoStack.length) return null;
      lock = true;
      const cur = snap(current);
      if (cur) {
        undoStack.push(cur);
        if (undoStack.length > limit) undoStack.shift();
      }
      try {
        return JSON.parse(redoStack.pop());
      } catch (e) {
        lock = false;
        return null;
      }
    },

    unlock() { lock = false; },
  };
}
