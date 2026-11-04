// 界面：（无界面）有上限的撤销栈
/**
 * 全局撤销栈
 * 层：第一层 · 数据基座
 *
 * 只存 JSON 字符串，上限默认 20。撤销过程中加锁，避免把「刚恢复的状态」再压进去。
 */

export function createUndo(max) {
  const limit = Math.max(1, Number(max) || 20);
  const stack = [];
  let lock = false;

  return {
    get size() { return stack.length; },

    /** 记下「改之前」的状态。前后一样就不压。 */
    note(prev, next) {
      if (lock) return;
      let a = '';
      let b = '';
      try {
        a = JSON.stringify(prev);
        b = JSON.stringify(next);
      } catch (e) {
        return;
      }
      if (a === b) return;
      stack.push(a);
      if (stack.length > limit) stack.shift();
    },

    /** 清空栈（进入账本时用，避免一打开就能撤回到空账）。 */
    checkpoint() {
      stack.length = 0;
      lock = false;
    },

    /** 弹出上一个状态。没有则 null。弹出期间上锁。 */
    pop() {
      if (!stack.length) return null;
      lock = true;
      try {
        return JSON.parse(stack.pop());
      } catch (e) {
        lock = false;
        return null;
      }
    },

    unlock() { lock = false; },
  };
}
