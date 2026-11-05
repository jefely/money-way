# NT 账本 · 新窗口快速启动 / 交接

> 最后更新：2026-11-05 · `nt-v1.264` · `c026b95`
> 用途：在新会话 / 新窗口里，让另一个 agent 或未来的你快速接手 `D:\myproject\money-way`。

---

## 0. 给新会话的第一句话（直接复制）

```text
请先读 D:\myproject\money-way\nt\NEXT-SESSION.md，按里面的“当前基线”和“修改流程”继续。
不要动 nt/js/core/mw-settings.js 里未提交的 25/200 改动，除非先问我。
改完必须跑公约检查、提交、push，并确认 GitHub Pages 上的版本号真的变了。
```

---

## 1. 这个项目是什么

- 路径：`D:\myproject\money-way`
- 远端：`git@github.com:jefely/money-way.git`
- 分支：`main`
- 形态：**零依赖 PWA 账本**，纯 HTML/CSS/JS，无 npm 运行时依赖。
- 两套代码：
  - `nt/`：当前维护的模块化版本，**只改这里**。
  - `personal/index.html`：旧单文件版，仅作交互/视觉参考，不要当产品代码改。
- 数据：浏览器本地加密 IndexedDB；支持加密备份导出/恢复。没有后端。

线上地址：

```text
https://jefely.github.io/money-way/nt/index.html
```

本地调试：

```text
http://127.0.0.1:8080/nt/index.html?debug=1
```

---

## 2. 10 分钟跑起来

### 2.1 本地服务

双击桌面：

```text
C:\Users\Administrator\Desktop\启动NT本地服务.bat
```

或者手动：

```powershell
cd D:\myproject\money-way
node nt\tools\serve.mjs 8080
```

看到下面这行就成功了：

```text
NT 本地调试: http://127.0.0.1:8080/nt/index.html?debug=1
```

注意：

- **必须走 http**，`file://` 下 `fetch('./templates/templates.html')` 会被 CORS 拦，页面白屏。
- 桌面 `.bat` 必须是 **CRLF 行尾 + UTF-8 无 BOM**；之前 LF 行尾导致 `cmd` 报 `| was unexpected at this time`，服务根本起不来。
- 8080 被占时批处理会提示「已运行」；确认 URL 能打开即可。

### 2.2 登录

首次打开要设置本机主密码；已有账本用原密码解锁。密码只在本机，丢了只能靠加密备份。

---

## 3. 当前基线（接手先看）

| 项 | 值 |
|---|---|
| 版本 | `nt-v1.263` |
| 最新提交 | `29215b5` |
| 线上 | 已确认 `nt-v1.263`，Pages success |
| 测试 | 53 个测试文件；**563 通过**（排除 `mw-params.test.mjs`） |
| 公约 | `check-rules` 通过，257 个文件，300 行/文件 |
| 工作区 | 只有 `nt/js/core/mw-settings.js` 有**未提交**改动 |

### 未提交的 `mw-settings.js` 是什么

用户/上一轮把环图锥形默认值从 `23 / 172.5` 改成了 `25 / 200`：

```js
锥形第一档 def: 25
锥形第二档 def: 200
```

但 `nt/tests/mw-params.test.mjs` 仍断言旧的 `23 / 172.5`，所以**全量测试会恰好失败这一条**。

处理原则：

- **不要主动提交、还原或覆盖它**，除非用户明确说“这个改动要”或“还原”。
- 跑回归时用排除法：

```powershell
$files = Get-ChildItem nt\tests\*.mjs | Where-Object Name -ne 'mw-params.test.mjs' | ForEach-Object FullName
node --test @files
```

---

## 4. 代码地图

```text
nt/
  index.html             单页骨架：顶部 tab + 各 view section
  sw.js                  Service Worker；CACHE_NAME 必须跟版本一起改
  templates/templates.html  表格行 <template> 集合
  css/                   按页面拆：flow / plan / settings / stats / query ...
  js/
    core/                纯数据层（不碰 DOM、不碰浏览器 API）
    ui/                  渲染、表格、拖拽、弹窗
    views/               每个 tab 的组装（flow / stats / plan / settings / query ...）
    browser/             IndexedDB / 加密 / 备份 / 存储
    app.js               启动、路由、全局 ctx
  tools/                 本地服务、公约检查、JS-MAP 生成
  tests/                 node:test 纯逻辑测试
  UI-SPEC.md             界面口径与布局
  TABLE-INTERACTION.md   表格/列宽/冻结/触摸交互
  JS-MAP.md              文件职责地图（自动生成）
```

关键文件：

- `nt/js/core/ledger-stats.js`：账户汇总、分类统计、期初日期。
- `nt/js/core/opening-tx.js`：期初流水方向 + 旧数据修正。
- `nt/js/core/category-query.js`：分类查询纯函数。
- `nt/js/ui/stats-category.js`：分类统计三块（存量 / 流量 / 分类查询）。
- `nt/js/ui/fixed-table.js`：固定收支表。
- `nt/js/ui/table-layout.js`：列宽、冻结、触摸拖拽。
- `nt/js/core/settings.js` / `ui/*`：界面参数。

---

## 5. 修改流程（每次都必须走）

### 5.1 先跑基线

```powershell
cd D:\myproject\money-way
node nt/tools/check-rules.mjs
$files = Get-ChildItem nt\tests\*.mjs | Where-Object Name -ne 'mw-params.test.mjs' | ForEach-Object FullName
node --test @files
```

期望：公约通过；546 pass / 0 fail。

### 5.2 版本号必须改两处

- `nt/js/core/version.js` → `APP_VER`
- `nt/sw.js` → `CACHE_NAME`

两个文件里有损坏的 UTF-8 注释，**不要用编辑器整文件重写**；用 Node 按字节替换：

```powershell
$old = 'nt-v1.255'; $new = 'nt-v1.256'
node -e "const fs=require('fs');for(const p of ['nt/js/core/version.js','nt/sw.js']){const b=fs.readFileSync(p);const a=Buffer.from(process.argv[1]);const c=Buffer.from(process.argv[2]);if(b.indexOf(a)<0)throw new Error('not found '+p);fs.writeFileSync(p,Buffer.concat([b.subarray(0,b.indexOf(a)),c,b.subarray(b.indexOf(a)+a.length)]))}" $old $new
```

然后（**不要把 `nt/js/core/mw-settings.js` 加进去**，它是本地未提交改动）：

```powershell
node nt/tools/check-rules.mjs
git add nt/index.html nt/css/stats.css nt/js/core/ledger-stats.js   # 换成你实际改的文件
git commit -m "feat(nt): vX.YYY —— 一句话说明"
git push origin main
```

### 5.3 确认 Pages 真的部署了

Pages 是 push 后自动构建，偶尔会卡在 `in_progress` 或部署超时。

```powershell
Start-Sleep -Seconds 75
$t = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
(Invoke-WebRequest "https://jefely.github.io/money-way/nt/js/core/version.js?x=$t" -UseBasicParsing).Content |
  Select-String APP_VER
```

Actions 状态（GitHub API 经常限流，走 Jina）：

```text
https://r.jina.ai/http://api.github.com/repos/jefely/money-way/actions/runs?per_page=1
```

看到 `"status": "completed", "conclusion": "success"` 才算完。

如果卡住：

1. 先等 1–2 分钟再看；
2. 仍卡着就发一个空提交重触发：

```powershell
git commit --allow-empty -m "chore: retrigger pages"
git push origin main
```

3. **以线上 `version.js` 的 `APP_VER` 为最终真相**，不要只看 Actions 绿色。

### 5.4 手机更新

告诉用户：

> 校验页 → 更新；或把 PWA 从后台划掉再打开。

Service Worker 的缓存名跟着版本走，版本不变可能继续用旧缓存。

---

## 6. 浏览器自动化（本地验证）

临时脚本都在：

```text
D:\myproject\.tmp-freeze\
```

常用：

- `stats-probe.mjs`：分类统计三块、分类查询、移动端横滑。
- `plan-touch-probe.mjs`：手机触摸拖列宽。
- `fixed-rows-probe.mjs`：固定收支 10 空行 / 新规则。
- `sync-probe.mjs`：同步弹窗布局。
- `flow-probe.mjs`：流水表基础交互。

方式：headless Chrome + CDP，移动端常用：

```js
Emulation.setDeviceMetricsOverride({
  width: 390, height: 844, deviceScaleFactor: 3, mobile: true,
})
```

本地服务必须是 8080。截图输出也放 `.tmp-freeze`。

注意：

- 原生 `element.blur()` 在 headless 里不一定触发 `focusout`；要验证失焦建行，手动派发 `FocusEvent('focusout', { bubbles: true })` 到具体 input。
- `.tmp-freeze` 不提交，别把调试脚本混进 `nt/`。

---

## 7. 当前产品口径（别改错）

### 7.1 期初方向（v1.254 起）

| 账户类型 | 期初流水方向 |
|---|---|
| 资产 / 费用 / 成本 | `期初余额 → 账户` |
| 负债 / 权益 / 收入 | `账户 → 期初余额` |

- 负债欠款填正数，例如信用卡欠 193,524.03：
  `信用卡 → 期初余额  193,524.03  备注「期初」`
- 旧存档里方向录反的 `opening` 流水，`migrate` 时会自动摆正；幂等，资产不动。
- 节点设置里的「期初」金额会自动生成上述流水；不要再手工加反向行。

### 7.2 分类统计（v1.249–v1.255）

三块：

1. **存量**：资产 / 负债 / 权益
   `分类 | 节点 | 期初 | 本期增加 | 本期减少 | 期末`
2. **流量**：收入 / 费用 / 成本
   `分类 | 节点 | 本期收入/支出 | 本期退回 | 净额`
3. **分类查询**：
   输入分类关键字（如 `储蓄`），按当前时间段列出转出方或转入方分类命中的流水
   `日期 | 转出 | 转入 | 金额 | 备注`

- 只看当前选中时间段（月 / 年 / 区间 / 全部），不再混「当前余额 / 历史转出转入」。
- 全零分类默认隐藏。
- 负债按**应付口径**：转出=欠款增加，转入=欠款减少；正数=欠款，负余额=多还（显示「多还 ¥…」）。
- 期末 = 期初 + 增加 − 减少。
- **三联排布 = 查询页 A/B/C 同一套**：≥901px 三栏等宽并排（`repeat(3, minmax(0,1fr))`），
  ≤900px 一屏一块、横向滑动吸附。901–1179 不再把查询块折到第二行。
- 三块表各自一套列宽参数（`分类存量/列宽`、`分类流量/列宽`、`分类查询/列宽`）：
  默认是百分比铺满，拖动后整表变固定 px 并写进账本，重开/重画都还原。
- **每个合计一张独立小表**（v1.261–v1.264）：合计行在表头**上边**（`thead` 第一行、`<td>`），
  普通透明底、加粗 11px（表头有底色，所以突出的仍是表头）；合计标题去掉「类」、
  中间**两个空格**（`资产  合计` / `收入  合计`），序号格留空、标题在分类列；
  流量表第 3 列按组变名（收入组「本期收入」、费用/成本组「本期支出」）；
  列是「序 | 分类 | 金额…」——「节点」列已删，换成序号（每张小表从 1 开始）；
  表间空 24px 无边框；面板上那两行说明文字已删。
  小表动态重建，列宽拖动绑定与 `.cols-custom` 都在建表时补。
- **分类查询支持拼音首字母**（v1.260）：输入 `c` 弹出 `cx 储蓄` / `rc 日常` 候选，
  点选或回车带入分类名。首字母用 `Intl.Collator('zh')` 的拼音排序算，
  没有字表（见 `core/pinyin.js`）；生僻字退回名字匹配。

### 7.3 固定收支

- 末尾固定 **10 个空行**；空行不显示「每月 / 日期 / 金额」，整行留白。
- 只有离开整行（focusout / 失焦到行外）才创建规则，金额失焦到备注不会提前建。
- 月度固定：到日在流水里自动记账；日度固定：只在“今天”显示并带 ▲，不自动补记。
- 删除自动记账的当期流水 = 作废该期，不再自动补。
- 非分期的固定规则备注是模板备注；空就是空，不拼「第 X 期」。
- 新节点（from/to 未知名称）自动建为 **U（未定类型）**，不阻塞录入。

### 7.4 其他已定交互

- **流水查询（v1.258 / v1.259）**：转出、转入填**同一个节点** = 该节点的转出 + 转入一起列
  （一笔流水不可能自己转给自己，按「与」筛永远是 0 行）；写法不同但指向同一账户
  （名字 / 简码）也算同一节点。时间段留空 = 该节点全部流水。结果按日期升序。
  **转出/转入是回车或失焦才筛**（v1.259：实时筛太闪），简码在这时换成节点名字。
  路径页左栏的筛选框走同一套（日期/金额/备注仍即时筛）。
- 同步弹窗：日轮动态长度、月份条与保存按钮同行；窄屏不塌。
- 列宽拖动：线在列右边缘左 2px；手机表头 `touch-action: pan-y`，横向拖拽不被表格滚动抢走。
- 重复简码允许，深红提示，不阻止保存。
- 固定表对齐：名称左、金额右、账单/还款居中。
- 环图 tooltip 在指针上方。
- 建议弹层用 pointerdown 选择。

---

## 8. 代码公约（硬门槛）

- 禁止内联事件 / 内联样式。
- 单个 JS/CSS 文件有效代码 ≤ **300 行**。
- CSS 类统一 `nt-` 前缀。
- `js/core/` 不得出现浏览器 API。
- 新增 / 改名 JS 文件后更新：

```powershell
node nt/tools/js-map.mjs --write
```

- 提交前：

```powershell
node nt/tools/check-rules.mjs
```

不通过就不要提交。

---

## 9. 已知待办 / 风险

1. **`mw-settings.js` 未提交**：环图锥形 25/200，`mw-params` 旧断言 23/172.5 冲突。先问用户是否要同步这条改动。
2. **汇总页仍是旧 10 列口径**（当前余额 / 历史转出转入）；分类页已重做，汇总页是否统一还没定。
3. **桌面三列布局**手机已验证，桌面 1180+ 建议再截一次图确认列宽。
4. **负债负余额**现在显示「多还」；如果用户说某笔其实是欠款，要先查该账户流水方向，不要直接把公式翻正。
5. **Pages 偶发卡部署**：空提交重触发；以线上版本号为准。
6. 旧单文件 `personal/index.html` 只做参考，不要在里面实现新功能。
7. **流水表宽度语义（v1.257 定稿）**：默认 `width:100%` 铺满容器（列宽按比例放大，桌面/手机都不留白）；
   拖动过列宽后参数 ≠ 默认值 → 整表切 `.cols-custom`（`width: max-content` = 列宽之和），
   重开按 px 还原。窄屏（≤900px）在**没拖过**时仍用旧版的百分比列宽把 8 列压进一屏
   （否则 644px 的列宽和会把删除按钮顶到屏幕外）。判定的唯一输入是列宽参数，
   见 `ui/apply-settings.js` 的 syncColModes；**不要**改用 `min-width:100%`（会把调好的 px 重新放大）。
8. **`settings.js` 已拆成两份**：参数声明表在 `core/settings-schema.js`（GROUPS/SCREENS/SCHEMA/
   COL_KEYS/LEGACY_DEFAULT），`core/settings.js` 只剩归一化与变 CSS 变量。
   新增参数改 `settings-schema.js`，别再往 `settings.js` 里塞（会顶破 300 行）。

---

## 10. 常用命令速查

```powershell
# 本地
cd D:\myproject\money-way
node nt\tools\serve.mjs 8080

# 公约
node nt/tools/check-rules.mjs

# 测试（排除本地 mw 冲突）
$files = Get-ChildItem nt\tests\*.mjs | Where-Object Name -ne 'mw-params.test.mjs' | ForEach-Object FullName
node --test @files

# 文件地图
node nt/tools/js-map.mjs --write

# 提交 / 发布
git add nt
git commit -m "feat(nt): vX.YYY —— ..."
git push origin main

# 线上版本
$t = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
(Invoke-WebRequest "https://jefely.github.io/money-way/nt/js/core/version.js?x=$t" -UseBasicParsing).Content |
  Select-String APP_VER
```

---

## 11. 相关文档

- `nt/UI-SPEC.md`：界面与口径
- `nt/TABLE-INTERACTION.md`：表格、冻结、列宽、触摸
- `nt/JS-MAP.md`：文件职责
- `INTERACTION.md`：交互硬度（A/B/C）与“多问用户”的约定
- `AGENTS.md`：工作区级规则（若在 `D:\myproject` 根目录工作）
