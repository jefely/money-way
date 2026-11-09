# NT 账本 · 项目接续说明（2026-11-09）

## 一、当前状态

- 线上版本：`nt-v1.540`（提交 `745cf89`）。
- 测试：68 个测试文件全部通过；`node nt/tools/check-rules.mjs` 通过（329 文件，单文件 300 行上限）。
- 工作区：干净，没有未提交改动。
- 待办只有一项：**把设置页的备注区从账户表拆成独立表**（用户已确认，见第三节）。

## 二、每次改动的固定流程

1. 改代码（遵守单文件 ≤300 有效行；禁止内联样式；文件头 `// 界面：…` 要和 JS-MAP 一致）。
2. 若新增/改名文件：`node nt/tools/js-map.mjs --write`；新文件记得加进 `nt/sw.js` 的 ASSETS（否则离线首开失败，check-rules 会拦）。
3. `node nt/tools/check-rules.mjs`。
4. 跑全部测试：`Get-ChildItem nt/tests/*.test.mjs | ForEach-Object { node $_.FullName }`。
5. 版本号：`nt/js/core/version.js` 的 `APP_VER` 和 `nt/sw.js` 的 `CACHE_NAME` 一起改成新版本（如 `nt-v1.541`）。
6. `git add -A nt/; git commit -m "…"; git push origin main`。
7. 等 60–90 秒，抓 `https://jefely.github.io/money-way/nt/js/core/version.js` 和 `sw.js` 确认线上版本；手机上「校验页 → 更新」或划掉 PWA 重开。

## 三、待完成：备注区拆成独立表（用户已确认）

**目标**：设置页的备注区（简码/序/类型/关键字/内容/移/删）从账户表 tbody 里独立出来，成为自己的 `<table>`；列宽用独立键，关键字列默认更宽（约 180px），可单独拖动，不影响账户表。

### 涉及文件与现状

- `nt/js/ui/note-table.js`
  - `renderNotes(ctx, rerender)` 现在返回 DocumentFragment（多个 `<tr>`），被账户表追加进 tbody。
  - 内部函数：`noteGap()` 空行、`noteHead()` 备注区标题行、`noteCols()` 列标题行、`noteRow()`、`noteNewRow()`；共 8 列（内容列 colSpan 2）。
- `nt/js/ui/account-table.js`
  - 第 27 行 `import { renderNotes } from './note-table.js';`
  - 第 217 行 `frag.appendChild(renderNotes(ctx, render));` —— 备注行就是这里进账户表 tbody 的。
  - 这个文件是 300 行贴边文件，加行前先想好从哪删/拆新文件。
- `nt/index.html`
  - 第 85 行 `<tbody id="nt-accounts-body"></tbody>`（账户表内）；需要在这张 table 外面加 `<div id="nt-notes-host"></div>`。
- `nt/js/ui/col-widths.js`：`saveSharedWidth(ctx,key,width)`、`onColResize(ctx,tableEl,col,width)`；通用列宽拖动由 `bindAllTables` 启动时绑定，按表键+列保存。
- `nt/js/ui/stats-notes.js`：统计页的「备注」页（左两小表 + 右备注查询），**与设置页备注表无关，不要动**。
- `nt/js/core/note-stats.js`：备注统计取数，不动。

### 步骤

1. `note-table.js` 的 `renderNotes` 改为返回完整表：
   ```js
   const table = document.createElement('table');
   table.className = 'nt-table nt-table-notes';
   table.dataset.cols = 'note:code,seq,type,keyword,content';
   // colgroup：简码64 / 序40 / 类型64 / 关键字180 / 内容auto / 移40 / 删40（7 列）
   // thead：noteCols()
   // tbody#nt-notes-body：noteHead() + 数据行 + 10 个空行
   ```
   - 所有 `colSpan=8` 改 7；内容列 `colSpan=2` 改 1。
   - 列标题/数据格改成 `th.nt-th[data-col=…]`/带对应 data-col，让通用列宽手柄按备注表自己的键工作；拿不准就先只做固定列宽（关键字 180），拖动留到验证通用绑定后。
   - `noteRow()` 里的「移/删」按钮、输入框、事件、备注编辑/新增逻辑一律保持。
2. `account-table.js` 第 217 行改成：
   ```js
   const host = tbody.closest('table').parentElement.querySelector('#nt-notes-host');
   if (host) { host.textContent = ''; host.appendChild(renderNotes(ctx, render)); }
   ```
3. `index.html` 账户表（`#nt-accounts-body` 所在 table）之后加：
   ```html
   <div id="nt-notes-host" class="nt-notes-host"></div>
   ```
4. CSS（`stats.css` 或 `flow.css`）：
   ```css
   .nt-notes-host { margin-top: 10px; }
   .nt-table-notes { width: 100%; }
   ```
   确认备注表列的宽度/行高不串到账户表。
5. 验收后按第二节发版（1.540 → 1.541）。

### 验收点

- 设置页：账户表、下面备注表；备注区标题/列/数据行/移删按钮/10 个空行都在。
- 备注表关键字列默认约 180px；拖备注表列只改备注表，账户表列宽不动。
- 备注新增/编辑/删除/上移正常；统计页 → 备注 的取数不受影响；手机刷新确认。

## 四、最近已上线的改动（别回退）

- **统计页三块**：分类 / 节点 / 备注。
- **备注页**：左侧「备注分类 / 备注」两个圆角小表（四周边距 4/6；第一列超长直接截断不用省略号；备注分类的「分类」列居中；表头行高 26/字号 12，数据行 32/14）；右侧「备注查询」：点左表行自动把关键字/分类填进输入框并过滤，输入框右侧「清空」，支持关键字/备注内容/备注简码前缀匹配；只有每列表头右缘可拖宽（宽度存 `nt_note_detail_cols`，每次渲染从本地重读）；表宽 100%、备注列吃掉剩余、右缘贴右边缘；日期显示 `260801`；表头 border-collapse 1px。
- **统计页筛选**：顺序 年份 / 月份 / 区间；月份模式左侧出现小年份输入框（52px、居中），输入 2025 月份按钮对应 2025；区间默认本月 1 号到月底；区间行清空在日期框最右、与流水工具条按钮同尺寸。
- **流水页**：开放录入区、金额→日期/序号、切出时后台结算、切回只做 version 检查不重建（`ui/leave-hooks.js` 的 flowLeft/settingsLeft/leaveFlow）。
- **设置页**：类型列只读点选（六类 + 其他=U 区）；清空行在切出时清掉（`pruneEmptyAccounts`）；账户/固定页切出后台重排、切回不重建。
- **更新/锁屏**：`pwa.js` 已删 `controllerchange` 自动刷新，避免更新后重新解锁又被弹回锁屏。

## 五、已知坑

- CSS 优先级：通用 `.nt-table`/`.nt-table-stats` 会盖掉自定义列宽/行高，用 `#nt-stats-notes …` 这类 id 前缀 + `!important`。
- `table-layout: fixed` + 列 px + `width:100%` 会把列等比压窄；要精确列宽用 `max-content`，或最后一列不写宽（auto）吃掉剩余。
- check-rules 禁止 `index.html` 内联 style（公约 1.2）。
- 本地存储键：`nt_note_detail_cols`（备注查询列宽）、`nt_note_col_w`（备注左表第一列宽）、`nt_stats_left_w`（统计左栏宽）；旧的 `nt_note_detail_note_w` 已不用。
- 备注统计口径：只累加备注过的流水发生额；期初累计 = 范围开始前累计，本期发生 = 范围内合计，期末累计 = 两者相加；没有流入/流出方向。
- 备注简码带入格式「分类：关键字，内容」已确认正确，不要改。

## 六、命令速查

```powershell
cd D:\myproject\money-way
node nt/tools/check-rules.mjs
Get-ChildItem nt/tests/*.test.mjs | ForEach-Object { node $_.FullName }
node nt/tools/js-map.mjs --write
# 版本：nt/js/core/version.js 与 nt/sw.js 的版本号一起改
git add -A nt/
git commit -m "…"
git push origin main
# 等 60–90 秒后抓 https://jefely.github.io/money-way/nt/js/core/version.js
```
