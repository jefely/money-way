// 界面：路径 tab
/**
 * 路径视图（Money Way）
 * 层：第五层 · UI
 *
 * 环网图的引擎与渲染都已完成（graph/ + mw-svg-renderer），
 * 本版先在独立页面打开；本模块只负责页脚，等下一版把图表收进本页。
 */

export function mountPath(section, ctx) {
  function render() {
    ctx.setFooter('Money Way · 环网图在独立页面打开（path.html），下一版收进本页');
  }

  return { render };
}
