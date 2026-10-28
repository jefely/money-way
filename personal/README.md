# NT账本 · `personal/index.html` 工程说明书

> **对象**：`money-way/personal/index.html`（单文件应用，v13.72，19,521 行）
> **性质**：一对一结构说明。每条都锚到具体行号 + 唯一名（函数名 / 常量名 / 注释原句），
> 可以 `Ctrl+F` 直接落到代码上，没有「大概如此」。
> **行号基准**：v13.72。每次改动行号都会漂（v13.72 那 6 处修复就让全文中位漂了约 37 行），
> 所以**找代码请以名字为准**，行号只作旁证；文末「怎么验证」给了复核办法。
> **产品向说明**（许可证、免费承诺、备份建议、图标分工、部署）已移到 [`产品说明.md`](产品说明.md)。
> 数据契约见 [`DATA-MODEL.md`](DATA-MODEL.md)，界面规则见 [`DESIGN-RULES.md`](DESIGN-RULES.md)，
> 表格引擎重构计划见 [`TABLE-REFACTOR.md`](TABLE-REFACTOR.md)。

---

## 文档地图

| 章 | 内容 | 行号区间 |
|---|---|---|
| §1 | 文件解剖（6 段） | 1–19521 |
| §2 | CSS 层（唯一 `<style>`） | 23–7958 |
| §3 | HTML 壳 | 7959–7974 |
| §4 | 数据层 I：账户种子 / 加密 / 多账本 / 保存管线 | 7976–8405 |
| §5 | 固定收支引擎 | 8406–8499 |
| §6 | 更新检查 / 账户工具 / 密码与重置 | 8501–8902 |
| §7 | 对话框工厂 `mkDialog` + 四枚**死弹窗** | 8903–9109 |
| §8 | Money Way 路径图 | 9110–10304 |
| §9 | 校验页渲染 | 10305–10689 |
| §10 | 固定收支页渲染 | 10690–10985 |
| §11 | 统计页（分类 / 汇总） | 10986–11291 |
| §12 | 布局参数（文本导出/导入） | 11292–11413 |
| §13 | 感谢墙（ENC2 加密） | 11414–11761 |
| §14 | xlsx 读取（手写 ZIP+XML） | 11762–12138 |
| §15 | 账单导入（支付宝/微信/招行） | 12139–12523 |
| §16 | 导入弹窗矩阵 + 多账本 UI | 12524–13328 |
| §17 | 文本导入 / 布局面板 / 重置 / 撤销 | 13329–13752 |
| §18 | 工具与核心算法（**computeStats**） | 13753–14018 |
| §19 | 路由与主渲染（**render()**） | 14019–14254 |
| §20 | 流水页（**分批 + DOM 复用**） | 14255–14932 |
| §21 | 设置页（**v13.71 重写**） | 14933–15543 |
| §22 | 查询页（三栏 A/B/C） | 15544–15851 |
| §23 | 分期页（月份矩阵） | 15852–16497 |
| §24 | 导入导出层（文本/同步码/xlsx/菜单） | 16498–17891 |
| §25 | 表格引擎（列宽/冻结/拖拽） | 17911–18285 |
| §26 | 启动序列 + 五个全局补丁 IIFE | 18286–18873 |
| §27 | 二维码（编码器 + 合并） | 18874–19390 |
| §28 | 锁屏与密码 | 19391–19521 |
| §29 | 全局契约 18 条 | — |
| §30 | 可优化清单（P0/P1/P2，带证据） | — |
| §31 | 最终结构大纲 | — |

**怎么读**：想改某个功能 → 先在 §30 看它有没有已知债 → 按文档地图跳到对应 § → 表里拿到函数名与行号。

---

## 指标快照（v13.72，作为定型期的基线）

> 这组数都能用一行命令重算（见文末「怎么验证」）。任何重构前后跑一遍对比，比「感觉差不多」可靠。

| 指标 | 值 | 备注 |
|---|---|---|
| 文件总行数 | 19,521 | 单文件 |
| CSS 行数 / 规则块 | 7,936 / 1,165 | 占全文 41% |
| CSS `!important` | 2,826 | 平均每条规则 2.4 个 |
| CSS `html body …` 提特异性 | 288 | 与上一行同源 |
| CSS 重复选择器组 | 130 | 最多 `.col-resizer::after`（11 次） |
| JS 行数 | 11,547 | 单个 `<script>` |
| 顶层函数 | 260 | 另有 24 个缩进声明的局部函数；v13.72 删掉重复的 `mwRingPath` |
| 死函数 / 死常量 | 12 / 2 | 见 §30 P1-3、P1-4 |
| 空 `catch(e){}` | 115 | 见 §30 P1-5 |
| `var` 声明 | 337 | 新代码不要再用 |
| `innerHTML=` 赋值 | 77 | 必须过 `esc()`（§29-12） |
| `querySelector(All)` | 318 | — |
| `addEventListener` / `.onclick=` | 93 / 85 | 两套并存 |
| `MutationObserver` | 6 | 全在 §26.2 的样式补丁层 |
| localStorage 键 | 16 个（含 2 个已废弃）+ 3 个 sessionStorage | 见 §4；v13.72 起写盘前会先读现值做冲突检测 |
| 原生 `confirm()` / `alert()` | 0 / 0 | v13.72 把 4 处 `confirm()` 全换成 `askConfirm()` |
| 外部网络请求类型 | 3 | `sw.js` / `index.html` / `thanks.json` |

---

## §1 文件解剖（6 段）

| 段 | 行 | 行数 | 内容 | 备注 |
|---|---|---|---|---|
| head | 1–22 | 22 | `<!DOCTYPE html>`、meta、favicon（按 `prefers-color-scheme` 两套）、manifest | 文件带 UTF-8 BOM，勿删（历史工具链依赖） |
| CSS | 23–7958 | 7,936 | 唯一 `<style>`：1,165 条规则、2,826 个 `!important` | 见 §2 |
| 壳 | 7959–7974 | 16 | `</head><body>`、`.tabbar` 七个页签、`#main`、`#footer`、`#toast` | 页签是**唯一**导航入口 |
| 主脚本 | 7975–19508 | 11,534 | 全部业务逻辑（单个 `<script>`，260 个顶层函数） | 见 §4–§28 |
| SW 注册 | 19512–19518 | 7 | 第二个 `<script>`，`navigator.serviceWorker.register('sw.js')` | 与业务完全解耦 |
| 收尾 | 19519–19521 | 3 | `</body>` + `</html>` | — |

**意图**：一个文件 = 一个可双击运行的完整应用。代价是**没有模块边界**，全靠命名与注释分区（见 §29 的第 18 条）。

---

## §2 CSS 层（23–7958）

### 2.1 八组归类，背后是 69 段覆盖

CSS 不是按组件组织的，是**按时间累积**的：后写的规则整段覆盖前面同名的规则。按注释里的分组标题可归成八组：

| 组 | 行 | 内容 | 是否被后面的层覆盖 |
|---|---|---|---|
| ① 基础 | 24–112 | `:root` 变量（颜色/圆角）、tabbar | 部分（工具栏尺寸） |
| ② 表格与表单基座 | 113–545 | `table.grid` 的 fixed 布局、sticky 表头、输入框、斑马纹、`col-seq` 首列冻结 | 大量被 ④⑦ 覆盖 |
| ③ 暗色主题 | 202–545（穿插在 ② 内） | `[data-theme="dark"]` 的三批补丁（输入框/冻结列/斑马纹） | 部分 |
| ④ 各页列宽百分比 | 546–700 | `#flow-table`/`#summary-table` 的 `width: %` | **基本作废**（列宽改由 colgroup 决定，见 3732 注释） |
| ⑤ 组件：确认框/分期表/工具栏/空状态/窄屏 | 701–975 | `.confirm-mask`、`.install-table`、`.toolbar`、`.empty-state`、`@media` | 部分 |
| ⑥ 列宽拖拽手柄 | 975–1005 | `.col-resizer` 初版 | **被覆盖 12 次**（见 2.3） |
| ⑦ 「最终覆盖层」堆 | 1006–7317 | **69 段**补丁，每段一个注释标题（「最终规则」「根治」「×和方框」…） | 自身互相覆盖 |
| ⑧ 质感定稿 | 7422–7958 | 表格底色根治、表头紫玉带、弹窗皮肤、**设置表冻结（v13.71）** | 当前生效 |

**量化**：`!important` 2,826 个；`html body …` 提特异性 288 处；`[data-theme="dark"]` 921 处；同一选择器被重复声明 130 组（最多 `.col-resizer::after` 11 次）。这不是笔误，是「谁压过谁」的博弈留下的沉积层。

### 2.2 当前真正生效的表格契约（改 CSS 前必须知道）

| 契约 | 生效规则（行） | 后果 |
|---|---|---|
| 表格宽度 = colgroup 各列之和 | `applyWidths()` JS 写 inline `width`（18103–18066） | **CSS 里不要再给表格写 `width`/`min-width`**，否则 fixed 布局按比例摊宽，列宽全乱 |
| 列宽只认 `<col>` | `table#flow-table …{width:auto}` 3732–3760、`#cat-table` 3694–3731 | `th width:%` 一律作废 |
| 表头 sticky | `table.grid thead th{position:sticky;top:0}`（117） | 表头行高必须由 `--layout-head-h` 控制，不能只写 `height`（7628 解释了为什么） |
| 冻结列 = 首列 `left:0` | `#summary-table …col-code`（7938–7945）、`#stats-sum-table col-seq`（126–127） | 每个表只冻一列；`left` 只写在 CSS，JS 不写 |
| 手势热区 | `.col-resizer` 12 个声明块，最终生效 4425–4430（`right:-6px; width:12px`，另有 `@media` 覆盖回 `-7px/14px`） | 跨到隔壁列的那半截会被下一列 sticky 表头盖住 → 设置表已单独收回列内（7948） |
| 右端列底色 | `.col-del/.col-bill/.col-repay` 用 `var(--bg-main)`（7520–7574） | 写死颜色换主题就崩 |

### 2.3 手柄被覆盖 12 次（典型沉积样本）

全文有 **12 个 `.col-resizer {` 声明块**（985 / 2627 / 2641 / 3549 / 3620 / 4170 / 4425 与 5 个 `@media` 内联块），另有 36 个 `@media` 块参与覆盖。改 `right`/`width` 的四次依次是
`2627`（`right:-7px; width:14px`）→ `3549`（`right:0; width:8px`）→ `4170`（`right:0; width:12px`）→ `4425`（`right:-6px; width:12px`）。
最终生效的是 4425–4430：`right:-6px; width:12px; transform:translateX(var(--cell-grip-shift))`（窄屏 4433 又改回 `-7px/14px`）。

**教训**：任何新规则都要写在这一串**之后**，否则静默无效；这也是 §30 P1-1 要合并的原因。

---

## §3 HTML 壳（7959–7974）

| 元素 | 行 | 说明 |
|---|---|---|
| `.tabbar` + 7 个 `button[data-tab]` | 7961–7969 | `flow / cat / query / money / fixed / settings / audit`；`render()` 里只按 `dataset.tab` 分发（14216–14227） |
| `#main` | 7971 | 唯一渲染容器，`render()` 每次 `innerHTML=''` 后重建 |
| `#footer` | 7972 | 只放 `#footer-text` 一行（14214）+ 右侧版本号（18463 `dataset.ver`） |
| `#toast` | 7973 | `aria-live="polite"`，由 `toast()`（13846）独占写入 |

---

## §4 数据层 I（7976–8405）

### 4.1 账户种子与默认值

| 名字 | 行 | 说明 |
|---|---|---|
| `ACC_RAW` | 7979–8029 | 73 个内置账户：`[类型, 汇总分类, 简码, 名称]`，期初一律 0。**新用户第一次打开看到的就是这张表** |
| `normDay(v)` | 8033 | 账单日/还款日归一化：只收 1–31，负数直接拒（以 `-` 开头），非法值返回 `''` |
| `defaultAccounts` | 8043 | `ACC_RAW` → `{id:'a1'…, cat, sub, code, name, opening:0, billDay:'', repayDay:''}` |

### 4.2 主题

| 名字 | 行 | 说明 |
|---|---|---|
| `THEME_KEY` / `theme` | 8057–8058 | `'flow_theme_v1'`；读不出就当 light |
| `applyTheme()` | 8059 | 写 `documentElement.dataset.theme` + `colorScheme`；**先调 `syncSummaryDelBorder()`**（该函数在 15189，靠 `getComputedStyle` 拿底色） |
| `toggleTheme()` | 8068 | 切主题 → 存 key → `applyTheme()` → toast；`setTimeout(0)` 里再刷一次边框 |

### 4.3 加密层（AES-GCM 256 + PBKDF2 120000）

| 名字 | 行 | 契约 |
|---|---|---|
| `PBKDF2_ROUNDS` | 8086 | 120000；`deriveKey()` 用它 |
| `_sessionKey` / `_sessionSalt` | 8088–8089 | 解锁后常驻内存；**没有它就不写盘** |
| `b64u` / `unb64u` | 8095 / 8103 | base64url（去掉 `+/=`），分块 `String.fromCharCode` 防爆栈 |
| `deriveKey(pw, salt)` | 8124 | PBKDF2-SHA256 → AES-GCM-256，`extractable:false` |
| `decryptText(b64, pw)` | 8139 | 输入 `base64(salt16|iv12|ct)`；长度不足 29 直接抛「数据长度不对」 |
| `encryptWithSession(text)` | 8151 | 复用 `_sessionKey`，每次新 `iv(12)`，输出 `b64u(salt|iv|ct)` |
| 存储格式 | 8077 注释 | `localStorage[lsKey()] = 'ENC1:' + b64u(...)`；同步文件 `'LZ2:' + 同一结构` |
| `PW_HINT_KEY` | 8087 | `'flow_pw_hint_v1'`，**明文**（要能显示） |

> 关键不变量：**忘记密码 = 不可恢复**（8084 注释）。代码里没有任何后门/重置路径。

### 4.4 站点地址与二维码

| 名字 | 行 | 说明 |
|---|---|---|
| `SITE_URL` | 8160 | `https://jefely.github.io/money-way/personal/`（唯一一处，改仓库只改这里） |
| `siteQrDataUrl()` | 8162 | 用内置 `qrEncode()` 现画 canvas，缓存 dataURL；**不再存死图** |

### 4.5 多账本

| 名字 | 行 | 说明 |
|---|---|---|
| `BOOKS_KEY` / `bookState` | 8174–8193 | `{current:'b1', list:[{id,name,createdAt}]}`；首次自动把老数据接管为「主账本 b1」 |
| `saveBooks()` | 8214 | 只写注册表，不碰账本数据 |
| `currentBook()` | 8217 | 找不到 current 时回落 `list[0]`（与 8178 的兜底同义） |
| `lsKey()` | 8221 | **b1 沿用旧 key `flow_grid_v5`**，其余 `flow_grid_v5:<id>` —— 老用户数据不迁移也能读 |
| `LS_KEY` | 8225 | 仅注释/旧代码；真实读写一律 `lsKey()` |

### 4.6 多标签页保护

| 名字 | 行 | 说明 |
|---|---|---|
| `watchOtherTabs()` | 8200 | 监听 `storage` 事件 → 提示（toast 带「刷新」按钮，12s）；`_storageWarned` 只提示一次。**只提示、不互斥** |
| 写盘互斥（v13.72） | `_lastDiskCipher` 8345 / `_pendingKey` 8346 / `flushDiskWrite` 8373 | 写前把「磁盘现值」和「本页最后已知密文」比一次：别人写过就**拒绝写入**并提示（保住对方的数据）。详见 §32-5 |

### 4.7 UI 状态（区间 / 分期区间）

| 名字 | 行 | 说明 |
|---|---|---|
| `SUMMARY_STATE_KEY` / `summaryMode` 等 | 8226–8254 | `mode ∈ {month, year, range}`，另有 `'all'` 为遗留分支（`getCurrentRange` 13937 仍处理）；区间由 `getCurrentRange()` 消费 |
| `restoreSummaryState()` | 8260 | 启动 IIFE，读 `{mode,range,month}`；只认 `range|month`（`'all'` 不是持久值） |
| `saveSummaryState()` | 8276 | 每次切区间都写 |
| `INST_STATE_KEY` / `installState` | 8290 / 8316 | 分期页 `{ref, from, to}`，6 位 `YYYYMM` |
| `ymNow/ymIdx/ymAt/ymAdd/ymValid/ymParse/ymShort/ymCn` | 8291–8312 | 月份数学：内部一律 6 位；`ymParse` 同时接受 `2608` 与 `202608` |
| `saveInstallState()` | 8333 | — |

### 4.8 保存管线（唯一写盘路径）

```
改数据 → save()  →  压撤销栈 →  _dataVersion++  →  scheduleDiskWrite()（锁定 _pendingKey）
                                                      ↓ 150ms 防抖
                                                 flushDiskWrite()
                                                   ├─ 磁盘现值 ≠ _lastDiskCipher → 拒绝写 + 提示（别的标签页写过）
                                                   ├─ encryptWithSession() → localStorage['ENC1:…'] → 更新 _lastDiskCipher
                                                   └─ 失败 → error toast（数据仍在内存）
```

| 名字 | 行 | 契约 |
|---|---|---|
| `save()` | 8349 | ① `JSON.stringify(state)` ② 与 `_lastSaved` 不同才压栈（`UNDO_MAX=20`）③ `_dataVersion++` ④ 交给防抖 |
| `scheduleDiskWrite()` | 8363 | **未解锁直接返回**（`_sessionKey` 为空）；排队时锁定 `_pendingKey = lsKey()`（切账本不会把旧账本写进新账本）；150ms 防抖 |
| `flushDiskWrite()` | 8373 | ① 冲突检测：磁盘有值且 ≠ `_lastDiskCipher` → **不写** + 15s error toast（带「刷新」）② 写成功后更新 `_lastDiskCipher` ③ 失败 → error toast「数据还在本页内存里，别关页面」 |
| `_lastDiskCipher` | 8345 | 解锁（`'ENC1:' + payload`）/ 切账本时填入；写成功后再更新 |
| `_pendingKey` | 8346 | 本次排队要写的 key；成功后清空 |
| `_dataVersion` | 8092 | 渲染复用靠它判断「数据变没变」（§19/§20） |

### 4.9 存储键总表（16 + 3）

| 键 | 作用 | 读写位置 | 备注 |
|---|---|---|---|
| `flow_grid_v5`（+`:bookId`） | **账本数据密文** `ENC1:…` | `lsKey()` 8221 / `flushDiskWrite` 8394 | 主账本 b1 沿用旧 key，老数据不用迁移 |
| `purple_books_v1` | 多账本注册表 | 8174 / 8214 | `{current, list[]}` |
| `flow_summary_state_v3` | 设置页区间模式/月份 | 8226 / 8278 | — |
| `flow_install_state_v1` | 分期页起止月 | 8290 / 8334 | `{ref, from, to}` |
| `flow_fixed_lastrun_v1:<bookId>` | 当天是否已跑固定收支 | 8419 / 8455 / 8482 | **必须按账本分 key**（8455 注释） |
| `flow_theme_v1` | `light` / `dark` | 8057 / 8070 | — |
| `flow_pw_hint_v1` | 密码提示（明文） | 8082 / 19415（存）/ 19390（读） | 要显示，所以不加密 |
| `flow_inst_mw_v1` | 分期月份列宽 | 15985 / 15992 / 16175 | 44–160 夹取 |
| `flow_layout_v1` | 行高 / 字号 / 单元格度量 | 17936 / 18005 / 17969 | — |
| `flow_col_widths_v5` | 列宽（px） | 17931 / 18047 / 18060 | 当前唯一格式 |
| `flow_col_widths_v1` / `_v2` | 旧列宽格式 | 17932–17933 | v2 是比例 ×1000；仅作迁移来源 |
| `mw_side_w` | 路径页左栏宽度 | 9946 / 9964 | — |
| `mw_flow_colw` | 路径页左栏表格列宽 | 10070 / 10109 | — |
| `flow_xlsm_template_v1` | ~~xlsm 模板~~ | 16522 | **已废弃**（只写不读） |
| `flow_xlsx_template_v2` | ~~xlsx 模板~~ | 17373 | **已废弃**（IndexedDB 方案未落地） |
| `sessionStorage.nt_updated` | 更新完成后提示新版本 | 8585 / 18791 | 用完即删 |
| `sessionStorage.nt_has_update` | 检测到远端有新版 | 18769 | — |
| `sessionStorage.nt_boot_pw` | 启动器把密码带进来 | 19491 / 19493 | 读完立刻删，仅 unlock 态 |

---

## §5 固定收支引擎（8406–8499）

数据形状：`state.fixed = [{ id, freq:'month'|'day', day, from, to, amount, note, sourceTxId, lastMonth, lastDate }]`

| 名字 | 行 | 说明 |
|---|---|---|
| `FIXED_RUN_KEY` | 8419 | `'flow_fixed_lastrun_v1'`；实际 key 带账本后缀（8455），**否则切账本当天不写** |
| `fixedBySource(txId)` | 8421 | 流水 → 固定项（勾选框状态） |
| `addFixedFromTx(txId)` | 8425 | 从流水生成固定项：`day` 取流水日期，`lastMonth:''` |
| `removeFixedBySource(txId)` | 8442 | 取消勾选 |
| `runFixedExpenses()` | 8447 | **启动时自动记账**：05:00 后才跑；`month` 型把 `day` 夹到当月最后一天（8459 注释：31 号在小月的坑）；`day` 型看 `lastDate`；写入 `state.transactions`（带 `fixedId`）→ `reseq()+save()` |
| `attachFixedCheckbox(tr)` | 8488 | 幂等挂勾选框；监听器由 `bindFlowEvents` 的 tbody 委托统一处理（8497 注释：1000 行不用 1000 个闭包） |

---

## §6 更新检查 / 账户工具 / 密码与重置（8501–8902）

### 6.1 检查更新（唯一主动联网的写操作）

| 名字 | 行 | 说明 |
|---|---|---|
| `checkForUpdate()` | 8512 | ① 拉 `sw.js?t=`（2.8KB）从 `mw-personal-(v[\d.]+)` 取远端版本 ② 取不到才回退拉 `index.html` 解析 `APP_VER` ③ `verNum()` 比大小 ④ 远端更大 → 清空 `Cache Storage` + `reg.update()` + `SKIP_WAITING` ⑤ `sessionStorage['nt_updated']` ⑥ `location.reload()` |
| 为什么不用 `reg.waiting` | 8513–8516 | 只改 `index.html` 不改 `sw.js` 时浏览器不触发 install，`waiting` 永远空 → 老版本「检查更新」永远说最新 |
| `verNum(v)` | 8525 | `v13.71 → 13071`，两位小数比较 |

### 6.2 账户工具

| 名字 | 行 | 说明 |
|---|---|---|
| `collectFlowAccountNames()` | 8599 | 扫流水 `from/to` 去重 |
| `nextFreeCode(used)` | 8610 | `X1/X2…` 第一个没被占的 |
| `openExtractAccountsDialog()` | 8617 | 把「流水里出现但账户表没有」的名字追加到末尾：`cat:'资产类'`、`sub:''`、自动简码 |
| `pinAccountToTop(id, tableId)` | 8666 | ▲ 上移：**只交换两行 DOM + 重排序号**，不重渲染（8644 注释：render 会冲掉列宽） |
| `openConfigDialog()` | 8702 | 配置：复制账户设置 / 导入账户设置 / 提取流水账户 |
| `openResetChoiceDialog()` | 8722 | 重置入口（→ `openResetDialog` 13634） |
| `openChangePasswordDialog()` | 8741 | 改密码：先用旧密码解密校验，再换 salt 重加密（`_sessionKey` 随之更新） |
| `accountsToText()` / `copyAccountsText()` | 8809 / 8825 | 账户段文本格式 `类型，分类，简码，名称，期初，` |
| `openImportAccountsDialog()` | 8853 | 从文本导入账户（按名称判重） |

### 6.3 文本格式（账户段）

```
账户
类型，分类，简码，名称，期初，
```
分隔符是全角 `，`（`SEP`，16501）；备注/名称里的 `，` 与 `\` 导出时转义、导入时还原（16522 附近的注释解释了「午饭，含逗号」的经典 bug）。

---

## §7 对话框工厂 + 四枚死弹窗（8903–9109）

| 名字 | 行 | 状态 |
|---|---|---|
| `mkDialog(html, opts)` | 8907 | **活**：全站弹窗唯一工厂（`.confirm-mask > .sync-box`） |
| `openHelpDialog()` | 8918 | **死**（0 引用）：账本说明已改为校验页内嵌 pane |
| `openAuditSummaryDialog()` | 8952 | **死**：账本校验同上 |
| `openVersionDialog()` | 8981 | **死**：版本校验已并入「账本说明」页 |
| `openThanksDialog()` | 9039 | **死**：赞助感谢已并入校验页 pane |
| `loadThanksWall()` | 9073 | 被 `openThanksDialog` 引用 → 随之失效（pane 版在 10621+） |
| `switchAuditTab()` | 9088 | 活：校验页分页签切换 |

> 死代码合计约 170 行（另见 §30 P1-3 的完整清单）。删它们**不影响任何入口**，因为校验页四个按钮走的是 10311–10313 的 `audit-tabs`。

---

## §8 Money Way 路径图（9110–10304）

**模型**：只画区间内真的流过钱的账户；三列语义「收入/负债 → 资产 → 费用」；边 = 同一对 `(from,to)` 的金额合计；线宽 ∝ 金额；权益类不进图。

| 名字 | 行 | 说明 |
|---|---|---|
| `mwResolveAccount(name)` | 9133 | 名字 → 账户（含 `catCode` 回退） |
| `mwDefaultDateRange()` | 9147 | 默认区间（本月/近 30 天，按流水实际范围兜底） |
| `mwCatOf(name)` | 9157 | 账户分类 |
| `mwBuildGraph(range, filter)` | 9166 | **核心**：取区间流水 → 账户聚合 → 分类聚合 → 链路层级 → 槽位 → 角度 → 边 |
| `mwTraceUp` / `mwTraceDown` | 9215 / 9230 | 上游/下游追踪（点亮链路） |
| `mwEsc` | 9244 | SVG 文本转义 |
| `renderMoneyWay(main, footer)` | 9254 | 页面入口：工具栏 + 左栏 + 图区 + 绑定（1000 行左右） |
| `mwRingPath` | **9322 与 9342 重复定义** | 后者覆盖前者（死代码，§30 P0-6） |
| `mwDrawSvg(...)` | 9435 | 画环/线/文字（9435–9850，约 416 行）；角度制、0.8° 分类间隙、单位数 = 笔数×2（9581 注释） |
| `widthByDepth` | 9575 | 线宽 6/4.8/3.6/2.4/1.2 按离费用端的层级 |
| `keyOf` / `mwTraceUpstream` | 9623 / 10209 | 槽位键 / 上游链路 |
| `mwTraceChain` / `mwRenderSide` / `mwChainOn` | 10237 / 10272 / 10268 | **死**（0 引用，旧版左栏实现） |
| 子模块（IIFE，不能单独调用） | 9940 / 9977 / 10066 / 10118 / 10180 | 侧栏宽度拖动、收起三角、左栏表格列宽拖动、缩放/旋转/平移、点选高亮 |

**状态**：`mwSelected`（选中账户）、`mwChain`、`mwFilter`、`mwRange` 都是模块级 `var/let`；切页即丢（不在 localStorage，只有 `mw_side_w`、`mw_flow_colw` 两个 UI 宽度持久化）。

---

## §9 校验页（10305–10689）

`renderAudit` 一个函数 385 行，自己管：分页签、三块 pane、六个弹窗按钮。

| 结构 | 行 | 说明 |
|---|---|---|
| 分页签 | 10319–10334 | `['check','账本校验'] / ['help','账本说明'] / ['verify'…] / ['thanks','赞助感谢']`（10325–10327） |
| 「账本校验」pane | 10413–10414（`dataset.pane='verify'`） | ① Σ转出 = Σ转入 ② 资产 = 负债+权益+(收入−费用) ③ 数据完整性（孤儿账户名/单边流水） |
| 「账本说明」pane | 10471–10472（`'help'`） | 含「检查更新」按钮（10612 拉 `sw.js?probe=`） |
| 「赞助感谢」pane | 10623–10624（`'thanks'`） | 收款码 + 感谢墙（`thanks.json`，10642） |
| 数据体检标红 | 16608 `applyDataIssues()` | 重复账户名/简码、孤儿流水；`render()` 里对 flow/settings 页调用（14230） |
| 校验口径 | 8469–8473 注释 | 用户定义：转出 = 借方，转入 = 贷方 |

---

## §10 固定收支页（10690–10985）

| 结构 | 行 | 说明 |
|---|---|---|
| `renderFixed` | 10690 | 工具栏（按月/按天合计）+ 表格（`#fixed-table`，9 列） |
| 空行新增 | 10946 | 新增行时 `freq/day` 归一化后 push，立刻 toast |
| 勾选框联动 | 8496 / 8488 | 流水行上的 ☑ 与 `state.fixed[].sourceTxId` 双向 |
| 分期入口 | 10674 `fixedSub` | 固定页顶部按钮切到分期子视图（14222） |

---

## §11 统计页（10986–11291）

两个子页共用一套区间工具栏（`catMode ∈ {all,year,range,month}`，10999）。

| 名字 | 行 | 说明 |
|---|---|---|
| `buildSubSummary(range)` | 10986 | 按 `sub`（汇总分类）聚合：`{sub, mainCat, bal, out, inn}` |
| `catRangeOf()` / `catRangeLabel()` | 11017 / 11049 | 区间 → `{start,end}`；标签文案 |
| `fmtOpening(v)` | 11057 | **死**（0 引用） |
| `renderStatsSum(main, footer)` | 11068 | 「汇总」子表 `#stats-sum-table`：序/类型/分类/账户名称/结余/转出/转入/转出历史/转入历史（9 列），**只冻结「序」**（126–127），`initColResize(table,'statsSum')` |
| `renderStats(main, footer)` | 11157 | 壳：按 `statsSub` 分发 + 注入「分类/汇总」两个按钮 |
| `renderCat(main, footer)` | 11185 | 「分类」子表 `#cat-table`：按账本类型分组合计，5 列 |

**v13.71 之后**：设置页与统计·汇总表的列宽/冻结是**同一套做法**（colgroup 像素 + 唯一 CSS `left:0`），但代码仍是两份（§30 P1-6）。

---

## §12 布局参数（11292–11413）

「布局」面板改的是**每个页面的行高 / 字号 / 列宽**，存 `flow_layout_v1`。

| 名字 | 行 | 说明 |
|---|---|---|
| `LAYOUT_PAGES` | 17936 | `['flow','summary','cat','query','install','fixed']`（`summary` 就是设置表；`settings` 已在 v13.71 删除） |
| `LAYOUT_PAGE_NAMES` | 17941 | `summary → '设置'`（v13.71 改，导出文本不再出现 `undefined` 小节） |
| `LAYOUT_SECTION_KEYS` | 11287 | 文本节名 → key；`'设置'` 与 `'账户汇总'` 都映射 `summary`（向后兼容） |
| `parseLayoutText(text)` | 11292 | 逐节解析 `列宽：[…]` / `表头行高：26px，字号：15px` / `数据行高：…`，返回 `{widths,rowH,fontSize,…}` |
| `buildLayoutText()` | 11368 | 反向生成；`install` 段额外输出「每月金额列宽」 |
| 应用 | 13531–13567 | 文本 → `colWidths/layoutCfg` → `saveLayout()+applyLayout()+render()` |

---

## §13 感谢墙（11414–11761）

格式：`{"v":2,"data":"ENC2:<base64(salt16|iv12|ct)>"}`，PBKDF2 200000 + AES-GCM。

| 名字 | 行 | 说明 |
|---|---|---|
| 密码拆四段 | 11413–11421 注释 | 密钥不写成整串，散在文件四处（防随手 `Ctrl+F` 拿走；不是安全边界） |
| `thanksSecret()` / `thanksDeriveKey()` / `thanksDecryptToken()` | 11436 / 11449 / 11457 | 解密链 |
| `parseDonors` / `parseDonorsAsync` | 11477 / 11471 | 解密后的名单 → 结构 |
| `thanksName` / `thanksHash` / `thanksRowify` / `thanksPlan` / `thanksWrap` / `thanksChipStyle` | 11499–11647 | 排版：按 hash 排布、昵称打码、chips 配色 |
| `buildImportText` / `parseImportText` | 11652 / 11698 | 账号段文本的成对读写（§6.3 格式） |

---

## §14 xlsx 读取（11762–12138）

零依赖：手写 ZIP 目录 + 正则抽 XML。

| 名字 | 行 | 说明 |
|---|---|---|
| `inflateRaw` / `u16` / `u32` | 11762 / 11770 / 11771 | 解压与字节读取 |
| `unzipArchive(buf)` | 11774 | 读中央目录；store(0) 直接拷、deflate(8) 走原生解压 |
| `colIndex` / `parseSharedStrings` / `parseSheetRows` / `excelSerialToISO` | 11821–11881 | `A1` → 列号、共享字符串、行解析、Excel 序列号 → `YYYY-MM-DD` |
| `readXlsx(buf)` | 11892 | 返回 `{sheets}` |
| `flowsFromSheet` / `accountsFromSheet` / `installmentsFromSheet` / `fixedFromSheet` | 11926 / 11956 / 12036 / 12094 | 四张表 → state；分期按 `{ym:{p,i}}` 还原（12076） |
| `ymFromCell` | 12011 | 单元格 → `YYYYMM`（兼容文本 `2026-08` 与序列号） |

**只认本程序导出的结构**（11754 注释）：流水 sheet 第 2 行表头、第 3 行起数据。

---

## §15 账单导入（12139–12523）

支付宝/微信/招行账单都是**单边**记录（我付了 X），本程序一笔要两端，所以解析后要补两条腿：`① 我的账户 ← 支付方式/选卡`；`② 对方账户 ← 交易对方/摘要 → 规则表 → 人工确认`。

| 名字 | 行 | 说明 |
|---|---|---|
| `BILL_PRESETS` | 12148 | 三家账单的表头特征/列位预设 |
| `splitCsvLine` / `findBillHeader` / `parseBillAmount` / `parseBillDate` | 12193–12261 | 文本工具 |
| `parseCmbGrid` / `parseBillText` | 12262 / 12297 | 招行表格 / 通用文本 → 记录 |
| `PAY_ALIAS_MAP` / `BANK_ALIASES` / `MERCHANT_HINTS` / `CATEGORY_HINTS` | 12364 / 12376 / 12404 / 12427 | 四条规则表（硬编码） |
| `matchAccountText` / `matchPayAccount` / `matchMerchantAccount` | 12339 / 12383 / 12446 | 三级匹配（简码 → 全名 → 包含） |
| `applyBillRules` | 12476 | **死**（0 引用）；规则实际在 `matchMerchantAccount` 里落地 |
| `openImportHub` / `ensurePendingAccount` | 12489 / 12515 | **死**（被 `openImportMenu` 取代） |

---

## §16 导入弹窗 + 多账本 UI（12524–13328）

| 名字 | 行 | 说明 |
|---|---|---|
| `openBillImportDialog()` | 12524 | 账单导入向导：选文件 → 解析 → 逐行确认对方账户 → 生成流水 |
| `openImportXlsxDialog()` | 12906 | `.xlsx` 覆盖导入：流水/账户整表重建，分期末完成恢复 |
| `buildBookSection` / `refreshBookSections` | 13073 / 13237 | 「添加」弹窗里的账本区块 |
| `createBook` / `switchBook` | 13244 / 13260 | 新建 / 切换：**用当前会话密钥直接解**（13307），密码不一致就提示「切换失败」（13319）；空账本立刻用当前密钥写一份空白（13278–13295）。切换后重置路径页的 `mwRange/mwFilter`（13284 注释：不重置会一片空白） |
| `closeAllMasks()` | 13324 | **死**（0 引用） |

---

## §17 文本导入 / 布局面板 / 重置 / 撤销（13329–13752）

| 名字 | 行 | 说明 |
|---|---|---|
| `openImportTextDialog()` | 13329 | 「添加」：账户段/流水段文本 → 账户**整体替换**、流水**追加**（12991 附近的注释：有汇总表就整体重建账户表） |
| `openColWidthsDialog()` | 13504 | 「布局」面板：恢复默认 / 复制当前 / 粘贴导入（`buildLayoutText` ↔ `parseLayoutText`） |
| `openResetDialog()` / `doReset()` | 13634 / 13680 | 清空流水/分期/固定，账户恢复 73 个；清 `SUMMARY_STATE_KEY/INST_STATE_KEY/COLW_KEY/FIXED_RUN_KEY`（13692–13698） |
| `undo()` | 13716 | 全局撤销（`_undoStack`，最多 20 步；`_undoLock` 防递归压栈） |
| `scheduleSave` / `flushSave` | 13747 / 13749 | 轻量防抖写盘（与 §4.8 的 150ms 是两条路径，共用 `save()` 之后的状态） |

---

## §18 工具与核心算法（13753–14018）

### 18.1 工具

| 名字 | 行 | 说明 |
|---|---|---|
| `pad2` / `uid` / `todayISO` / `toYYMMDD` / `fmtMoney` / `normalizeAmount` / `parseDateInput` | 13754–13807 | 日期与金额的**唯一**规范化入口 |
| `bindMaskClose` | 13832 | 点遮罩空白关闭（`downOnMask` 防误关） |
| `esc(s)` | 13842 | HTML 转义（`& < > " '`），所有拼 `innerHTML` 的地方都必须过它 |
| `toast(msg, opts)` | 13846 | 唯一轻提示；`opts.action` 挂撤销按钮；默认 2.6s / 错误 5s / 带 action 6s |
| `resolveCode(v)` | 13872 | 简码 → 账户全名（大小写不敏感），失焦时用 |
| `nextSeq` / `isMeaningful` / `rowHasFlowContent` | 13880–13896 | 流水序号、字段有效性、新行是否够格成一条流水 |
| `parseRangeInput(v, side)` | 13899 | 区间输入：`2/4/6/8` 位数字都认，`2601` 是「2026 年 1 月」，`202601` 与 `260101` 的歧义按 1900–2099 判定 |

### 18.2 区间与统计（性能关键）

| 名字 | 行 | 契约 |
|---|---|---|
| `getCurrentRange()` | 13937 | `all` 取流水 min/max；`year` 整年；`range` 空则视为全部；`month` 当月首末日 |
| `statsMap(range)` | 13974 | **O(T) 一次扫全表**，按 `id:<accId>` / `n:<name>` 分桶，输出 `{tOut,tIn,pOut,pIn,hOut,hIn}`。`_statsMemo` 按区间字符串缓存；`render()` 首行手动失效（14167） |
| `computeStats(acc, range)` | 14010 | 借贷方向：**资产/费用** `opening + tIn − tOut`；**负债/权益/收入** `opening + tOut − tIn`（14013–14015）。返回 `{balance,mOut,mIn,hOut,hIn}` |

> 语义：`t*` = 到区间末为止的累计；`p*` = 区间内发生额；`h*` = 区间前历史。三者在同一趟循环里分好（13992–14004）。

---

## §19 路由与主渲染（14019–14254）

### 19.1 `render()`（14163–14218）—— 全站唯一入口

| 步骤 | 行 | 说明 |
|---|---|---|
| ⓪ | 14167 | `_statsMemo.key = null`（每次渲染重新聚合） |
| ⓪′ | 14174–14197 | **流水页 DOM 复用**：切走时把 `#main` 子节点收进 `DocumentFragment`（记 `_dataVersion`/`flowShown`/滚动位置），切回且版本一致就整块挂回，跳过重建 |
| ① | 14199–14208 | 保存「上一个页」的滚动位置（用 `_lastRenderedTab`，不是 `currentTab` —— 14200 注释解释了错记的坑） |
| ② | 14210–14214 | 取本页滚动记录 → `main.innerHTML=''` → `footer.innerHTML='<span id="footer-text"></span>'` |
| 分发 | 14216–14227 | `flow / cat / settings / install / fixed(含 fixedSub) / query / audit / money` |
| 体检 | 14230 | `applyDataIssues()` 只对 flow/settings |
| ③ | 14233–14241 | 逐个还原滚动（查询页 3 个 `.grid-wrap` 各记各的） |
| 尾 | 14242–14244 | 更新 `_renderVersion/_renderFlowShown/_lastRenderedTab` |

### 19.2 统一区间工具栏

| 名字 | 行 | 说明 |
|---|---|---|
| `buildRangeToolbar(opts)` | 14036 | 生成 `bar1`（标题/清空/区间/年份/月份）+ `bar2`（按 mode：月份格 / 年份格 / 起止框 / 提示）；年份格只列**流水里真出现过的年份**（14043–14051） |
| 区间输入 | 14109–14143 | `input` 只过滤数字不重渲染（14134 注释：否则丢焦点）；`change` 与 `blur` 用 `_lastSig` 去重 |
| `setFooterText` | 14248 | 页脚唯一写入口（末尾补空格给版本号让位） |

---

## §20 流水页（14255–14932）

| 名字 | 行 | 说明 |
|---|---|---|
| `renderFlow(main, footer)` | 14258 | 工具栏（添加/同步/导入/导出）+ `#flow-table`（7 列）+ 首批 `FLOW_BATCH=200` 行（8229） |
| 空行策略 | 14311 | **只有全部记录渲染完**才铺 `FLOW_BLANK_ROWS=30` 行空行（否则空行会夹在中间） |
| `appendFlowRows(n)` | 14358 | 只 append 新行、插在第一个空行**之前**（14372 注释）；不重建整表 |
| `ensureFlowBuffer()` | 14406 | 视口下方不足 `FLOW_BUFFER_ROWS=100` 行就继续补；`_flowChains>8` 防抖死循环 |
| `bindFlowScrollBuffer()` | 14422 | 滚动 80ms 节流触发补齐 |
| `observeFlowMore()` | 14437 | `IntersectionObserver`（`rootMargin=1.2×视口`）自动加载；`_flowLoading`/`_lastFlowLoad` 防重入 |
| `syncFlowTitleWidth()` | 14464 | 把表格实际宽度写进 `--title-w/--flow-right`，工具栏与表头右缘对齐 |
| `renumberFlowRows` | 14479 | 按 DOM 顺序重排序号 |
| `makeFlowRow(t, idx, isNew)` | 14489 | 一行 6 个 input；金额显示 `¥1,400.00`，聚焦时剥成纯数字（18286 的全局 focus 处理器） |
| `bindFlowEvents(tbody)` | 14546 | 事件委托：输入/失焦/勾选固定/删除 |
| `parseClipboardMatrix` / `applyFlowPaste` | 14729 / 14745 | Excel 多格粘贴（制表符/换行矩阵 → 从落点铺开） |
| `deleteFlowTx` / `deleteAccount` | 14820 / 14838 | 删除；后者用**原生 `confirm()`**（§30 P0-3） |
| `updateFlowFooter` | 14882 | 页脚合计 |
| `reseq` / `sortTxByDate` / `syncFlowAccountIds` | 14892 / 14899 / 14914 | 序号补齐、按日期排序、给老流水补 `fromId/toId` |

**关键不变量**：流水按 `seq` 升序显示（14301），`seq=0` 视为未排序。

---

## §21 设置页（14933–15543）—— v13.71 重写

### 21.1 页面结构

`renderSummary(main, footer)`（15003）—— 名字是历史遗留（页面叫「设置」，表格 id 仍是 `#summary-table`，CSS 变量 `--lh-summary` 也用它）。

| 列（DOM 顺序） | 类名 | 说明 |
|---|---|---|
| 1 | `col-code` | **简码，唯一冻结列**（CSS `left:0`，7940） |
| 2 | `col-seq` | 序（分组行显示「资产/负债/收入」标签，`cat-tag`） |
| 3–5 | `col-cat` / `col-sub` / `col-name` | 类型 / 分类 / 账户名称（都是 input） |
| 6 | `col-open` | 期初（右对齐，`¥1,234.56`） |
| 7–8 | `col-move` / `col-del` | ▲ 上移 / × 删除 |
| 9–10 | `col-bill` / `col-repay` | 账单日 / 还款日（只有负债类显示） |

**为什么只有 10 列**：以前的「当前结余/转出/转入/转出历史/转入历史」5 列是靠 `width:0 !important` 压掉的零宽列，正是列宽错乱的根（见 6181 的〔已删除〕注记）。v13.71 起**不渲染**。

### 21.2 函数表

| 名字 | 行 | 说明 |
|---|---|---|
| `openBalanceDialog()` | 14937 | 「配平」：算恒等式差额 → 写进「实收资本」期初 |
| `renderSummary()` | 15003 | 工具栏（密码/配置/重置/主题/布局）+ 表体 + 分组行 + 新行 |
| `syncSummaryDelBorder()` | 15189 | 删除/账单日/还款日三列底色统一为 `--bg-main`，边框按主题重刷（主题切换会调它） |
| `syncGridRight()` | 15234 | 工具栏右缘对齐「期初」列右边界（写 `--grid-right`） |
| `applySummaryPaste` | 15248 | 多格粘贴：按 `SUMMARY_FIELDS` 逻辑顺序落位（不是 DOM 顺序） |
| `makeSummaryRow(acc, idx, range)` | 15317 | 一行：简码 → 序 → 类型 → 分类 → 名称 → 期初 → ▲ → × → 账单日 → 还款日 |
| `bindSummaryEvents(tbody)` | 15397 | 输入/失焦/新建行/改名迁移流水/重名检查 |
| `findDuplicateAccountName` | 15498 | **死**（判重在 `applyDataIssues` 里） |
| `refreshSummaryCells` | 15504 | 重复简码标红（`.dup`） |
| `updateSummaryRow` | 15522 | 刷新只读格（现在没有只读格 → 空操作，保留兼容） |
| `updateSummaryFooter` | 15532 | 页脚资产/负债/净额 |

### 21.3 列宽与冻结（单一事实源）

```
DEFAULT_COL_WIDTHS.summary（17919，10 个真像素）
   → initColResize(table,'summary')（18172）
   → applyWidths()：colgroup 逐列写 px + table.style.width = Σpx（18103）
   → colWidths.summary 落盘 flow_col_widths_v5
```

冻结**只有 CSS**：`table#summary-table thead th.col-code, tbody td.col-code { position:sticky; left:0 }`（7940）；`col-seq` 显式 `left:auto`（7936）。
v13.71 删掉的机制：`summaryFold / summaryRealW / SUMMARY_FOLD_COLS / summaryBaseWidths / hoistCodeColumn / applySummaryFold / setSummaryFold / applySummarySticky`（15169 的注释块记录了三条根因）。

---

## §22 查询页（15544–15851）

| 名字 | 行 | 说明 |
|---|---|---|
| `QUERY_PANELS=3` / `QUERY_LABELS=['A','B','C']` | 15548–15549 | 三栏等分，不提供拖栏宽 |
| `queryForm` | 15551 | 每栏 `{range, from, to, amount, note}`（不持久化） |
| `qExpandStart` / `qExpandEnd` / `qParseRange` / `qIsDateMatch` | 15564–15622 | 区间表达式（`26 / 2607 / 2601-2602 / 26-27`） |
| `renderQuery` | 15623 | 三个 `.query-section`，每栏一张 `table.query-table`（标题行/筛选行/表头行/数据行） |
| `bindQuerySection` | 15685 | 输入即查（`trigger`），失焦把简码换成全名 |
| `showNotePopover` / `closeNotePopover` | 15730 / 15727 | 备注长文本浮层 |
| `doQuery(idx)` | 15761 | 过滤 + 渲染 + 写回 `queryForm[idx]`（15775） |
| `updateQueryFooter` | 15841 | 三栏合计 |

**列宽**：`initColResize(table,'query')` 用**比例**存（`applyWidths` 的 `key==='query'` 分支：归一化成 %，表格恒占 100%），拖一列相邻列反向等量（18218–18224）。

---

## §23 分期页（15852–16497）

数据形状：`state.installments = [{ id, name, principal, billDay, repayDay, cells: { 'YYYYMM': { p:'', i:'' } } }]`；**每个分期两行**：本金行 `inst-p` + 利息行 `inst-i`。

| 名字 | 行 | 说明 |
|---|---|---|
| `installMonths()` | 15855 | `installState.from..to` → 月份数组 |
| `instPending` / `newInstallment` | 15866 / 15881 | 空行/新分期对象 |
| `findInstallAccount` / `syncInstallAccountDays` | 15886 / 15897 | 名称 → 账户（带出账单日/还款日） |
| `setInstallCell` | 15911 | 写格子；两格都空就删 key（15926） |
| `renderInstall` | 15935 | 双行表头（月份合计/月份标签）+ 冻结「账户名称」列 + 月份列统一宽 `--inst-mw`（15985–15994） |
| `recalcInstall` / `recalcInstallFooter` / `updateInstallFooter` | 16192–16262 | 每列合计、本息余计 |
| `bindInstallEvents` | 16263 | 输入/整行粘贴/新增/复制 |
| `pruneInstallCells` / `countOutOfRange` | 16419 / 16433 | 清理区间外格子；统计越界 |
| `askConfirm(msg)` | 16447 | Promise 版确认框（**删除账户没用它**，§30 P0-3） |
| `installTSV` / `copyText` | 16469 / 16486 | 复制成制表符文本 |

---

## §24 导入导出层（16498–17891）

### 24.1 文本导出（16498–16680）

| 名字 | 行 | 说明 |
|---|---|---|
| `SEP='，'` | 16501 | 全角逗号分隔（与 Excel 中文习惯一致） |
| `_xCompress` / `_crc32` / `xlsmZip` | 16529–16583 | 手写 deflate + CRC32 + ZIP 打包（xlsx/xlsm 共用） |
| `_xEsc` / `_xColName` / `_xSerial` | 16586–16607 | XML 转义 / `A1` 列名 / 日期序列号 |
| `dataIssues()` | 16610 | 体检结果集合（重名/重简码/孤儿/坏日期） |
| `applyDataIssues()` | 16645 | 把体检结果标到 DOM（`.dup`/`.bad`，16616–16629） |
| `XLSM_KEY` | 16522 | **死常量**（模板法残留） |

### 24.2 同步码（16681–16987）

| 名字 | 行 | 说明 |
|---|---|---|
| `bytesToB64` / `b64ToBytes` | 16688 / 16697 | 字节 ↔ base64 |
| `syncEncodeText` / `syncDecodeText` | 16706 / 16720 | `LZ1:base64(gzip(JSON))`；不支持 `CompressionStream` 时退 `LZ0:` |
| `buildSyncCode()` | 16735 | 打包 `{v:3, at, accounts, transactions, installments, fixed, installState}`；有会话密钥则 `LZ2:` 加密 |
| `askSyncPassword()` | 16760 | 为 `LZ2:` 文件单独问口令 |
| `ensureInstallIds()` / `fitInstallRange()` | 16792 / 16805 | 补 id；把起止月扩到能看见数据 |
| `txFingerprint(t)` | 16824 | `日期|转出|转入|金额|备注`（判重指纹） |
| `mergeSyncPayload(data)` | 16830 | **合并核心**：账户按 id/名字（建 `accIdMap` 修流水外键）→ 流水按 id、无 id 用指纹 → 分期按 id（cells 逐月覆盖）→ 固定按 id |
| `applySyncCode(code, opts)` | 16923 | 默认**整表覆盖**；`opts.merge=true` 走合并；`LZ2` 先解密 |

### 24.3 xlsx 写入（16988–17365）

手写最小 OOXML：`[Content_Types].xml` + rels + workbook + **N 张 sheet（当前 4 张）** + styles。

| 名字 | 行 | 说明 |
|---|---|---|
| `XC` / `XS` | 17004 / 17018 | 颜色表 / 样式索引表（`s=0` 文本、`s=1` 日期、`s=2` 金额） |
| `_xlsxNumFmts` / `_xlsxFonts` / `_xlsxFills` / `_xlsxBorders` / `_xf` / `_xlsxCellXfs` / `_xlsxStyles` | 17024–17145 | styles.xml 各段 |
| `_xlsxCell` / `_xlsxSheetXml` | 17129 / 17146 | 单元格 / 整张表（inlineStr 不用 sharedStrings） |
| `buildXlsxBytes()` | 17193 | 组装 **4 张表**：流水（17216）/ 汇总 13 列含「类型」（17272）/ 分期（17308）/ 固定（17329），每张带 `widths` 与 `freeze:3` |

> 17155 的注释写「组装三张表」，实际 `sheets.push` 有四处（17216/17235/17271/17292）—— 注释过期（§30 P2-9）。

### 24.4 模板法残留（17366–17378）

`XLSX_TPL_IDB='flow_xlsx_template_v2'`（17373）与整段注释仍在，但 `exportXLSX()`（17379）**已改走手写生成器**（17380–17382 注释：模板法会覆盖表头且 dimension 不更新）。→ 死常量 + 死注释。

### 24.5 导出/导入/同步界面（17379–17891）

| 名字 | 行 | 说明 |
|---|---|---|
| `exportXLSX()` | 17379 | 生成 .xlsx；窄屏走 dataURL + 剪贴板兜底（17388） |
| `showExportDone()` | 17447 | 导出完成弹窗 |
| `openRowMenu(title, rows)` | 17503 | **死**（0 引用） |
| `openExportMenu()` | 17524 | 导出菜单：`.lz` / `.xlsx` 文件 + 生成 CSV/TXT + 复制（17560–17580 是两种文本格式） |
| `openImportMenu()` | 17624 | 导入菜单：覆盖文件 / 覆盖账单 |
| `openSyncDialog()` | 17694 | 同步：生成同步码 / 粘贴导入 / 二维码（★ 二维码 base 见 §27） |

---

## §25 表格引擎（17911–18285）

| 名字 | 行 | 契约 |
|---|---|---|
| `DEFAULT_COL_WIDTHS` | 17912 | 每表默认列宽（px）。`summary` 是**设置表 10 列**（17919），数组顺序必须与 DOM 逐位一致 |
| `COLW_KEY='flow_col_widths_v5'` / `_v1` / `_v2` | 17931–17933 | v5=px；v1 同格式；v2 曾存比例（×1000） |
| `LAYOUT_KEY='flow_layout_v1'` | 17936 | 行高/字号/表头高 |
| `saveLayout` / `applyLayout` | 18002 / 18008 | 写回 localStorage / 写 CSS 变量（`--layout-row-h`、`--lh-<page>`、`--cell-grip-shift` …） |
| `saveColWidths()` | 18058 | 写 `flow_col_widths_v5`；失败会 toast（不再空吞） |
| `colHeadRow(table)` | 18068 | 取 thead **最后一行**（查询页有 3 行表头） |
| `ensureColgroup(table)` | 18073 | 按表头 th 数量建/重建 `<colgroup>`（数量不符就重建） |
| `widthsOf(table)` | 18092 | 当前渲染宽度（拖拽基准 = 屏幕真值） |
| `applyWidths(table,key,px)` | 18103 | **唯一写宽度的地方**：0→`COL_MIN=36`；query 归一化成 %，其余逐列 px + `table.style.width=Σ`；最后 `colWidths[key]=w` |
| `paintWidths(key,widths)` | 18123 | 同 key 的所有表一起刷（查询页两张表同步） |
| `measureCtx` / `textBoxWidth` / `fitWidth` | 18128–18170 | 双击手柄「按内容自适应」（canvas 量中文偏小 ×1.15） |
| `initColResize(table,key)` | 18172 | 挂手柄 + pointerdown/up + dblclick；`query` 相邻列反向等量；`install` 月份列联动；其余只动被拖列 |
| `COL_MIN=36` | 18087 | 列宽下限 |

**两条铁律**（改这里之前先读）：
1. 表格 `width` 必须严格等于 colgroup 各列之和，否则 fixed 布局按比例摊宽 → 「拖一列，所有列一起动」（18089 的 ⚠ 注释）。
2. 手柄热区必须整段落在本列内（跨列部分会被下一列 sticky 表头吃点击）→ 设置表已单独收窄（7948）。

---

## §26 启动序列 + 五个全局补丁 IIFE（18286–18873）

### 26.1 启动顺序（严格串行）

```
18705  bootWithLock()
        ├─ 有 'ENC1:' 数据 → showLockScreen('unlock', 密文)   [19350]
        └─ 无数据/旧明文 → showLockScreen('setup', 旧文)      [19350]
        ↓ 解锁成功
18804  afterUnlock()
        ├─ runFixedExpenses()        （自动记固定支出）
        ├─ sanitizeAccountDays()     （修非法 1~31）
        ├─ migrateFlowAccountIds()   （老流水补 fromId/toId）
        ├─ ensureInstallIds()        （分期补 id）
        ├─ fitInstallRange()         （起止月扩到可见）
        ├─ render()                  （首屏）
        └─ mergeFromHash()           （URL #m= 时问是否合并）
```

| 名字 | 行 | 说明 |
|---|---|---|
| `requestPersistentStorage()` | 18776 | 空闲时申请持久化存储（防浏览器清缓存） |
| `bootWithLock()` | 18797 | 唯一的启动入口 |
| `migrateFlowAccountIds()` | 18812 | 名字 → id 一次性绑定；解析不到的仍走名字回退 |
| `sanitizeAccountDays()` | 18834 | 清历史脏值（110 这种） |
| `afterUnlock()` | 18846 | 见上 |
| `mwSelfHeal()` | 18329 | 缓存自愈：删掉「非 200 的 index.html」缓存（旧 SW 曾把 404 缓存成页面） |

### 26.2 五个「样式补丁」IIFE（这是 CSS 债务的 JS 镜像）

| IIFE | 行 | 干什么 | Observer |
|---|---|---|---|
| `mwFixFlowButtons` | 18347 | 给流水页/bar1 按钮 inline 钉死尺寸（CSS 里十几条 `!important` 互相压） | 1 |
| `mwUniformDialogButtons` | 18408 | 弹窗按钮统一 inline 皮肤 | 1 |
| `mwDialogCloseX` | 18463 | 弹窗右上角 ×（fixed 定位，跟 ResizeObserver 重贴边） | 1 |
| `mwMonoControls` | 18535 | 全站 ×/方框/▲ 统一纯黑/纯白；右端两列底色 | 由上面几个的 MutationObserver 间接触发 |
| `mwStickyDialogTitles` | 18714 | 给弹窗标题套 `.sync-sticky` 包裹 | 1 |

> 合计 5 个 IIFE + 6 个 `MutationObserver` + 约 500 行 inline `setProperty(..., 'important')`。
> 存在的理由写在 18492 注释里：「CSS 里那些 `!important` 和各处 inline style 互相压，只有 inline + `!important` 稳」。→ §30 P1-2。

---

## §27 二维码（18874–19390）

### 27.1 编码器（零依赖，字节模式 / 纠错 L / 版本 1–40 / 自动掩码）

| 名字 | 行 | 说明 |
|---|---|---|
| `QR_GF_EXP/LOG`、`initQRGF` | 18880–18894 | GF(256) 表 |
| `qrGmul` / `qrGenPoly` / `qrRsEncode` | 18891–18960 | Reed-Solomon |
| `qrBuildData` / `qrInterleave` | 18942 / 18961 | 位流与交错 |
| `qrPickVersion` / `qrCapacityBytes` | 18916 / 18913 | 选版本 |
| `qrBuildMatrix` / `qrApplyMask` / `qrWriteFormat` / `qrPenalty` / `qrEncode` | 19007–19161 | 矩阵、掩码、格式位、罚分、入口 |
| `drawQRCanvas` | 19267 | 画到 canvas（4px/模块，静区 4） |
| `siteQrDataUrl` | 8162 | 站址二维码（用同一编码器） |

### 27.2 合并码（扫码搬数据）

| 名字 | 行 | 说明 |
|---|---|---|
| `SYNC_QR_BASE` | 19170 | **`https://jefely.github.io/nt-ledger/`**（不是本站 `money-way/personal/`，见 §30 P0-2） |
| `SYNC_QR_MAX_URL=2600` | 19177 | URL 上限（注释写「压到 1800」，与常量不一致，§30 P2-5） |
| `b64ToUrl` / `urlToB64` | 19179 / 19182 | base64url |
| `codeOfName` | 19188 | 账户名 → 简码（二维码里用简码省字节） |
| `mergePayloadOf(txs, part)` | 19199 | v3 紧凑格式 `{v:3,u:最早日期,a:[[code,name]],t:"YYMMDD,from,to,amt,note\n"}` |
| `packRecentForQR(until, days, per)` | 19225 | 按「截止日 / 往前几天 / 每张几笔」切片并生成多张 URL |
| `decodeQRPayload` | 19296 | 从 `#m=` 或粘贴文本还原 |
| `countMergeTx` / `mergeFromPayload` / `mergeFromHash` | 19335 / 19347 / 19383 | 判重计数 → 合并 → 页面加载时自动问 |

**判重**：id 优先，无 id 用 `txFingerprint`；几张码的扫描顺序无关。

---

## §28 锁屏与密码（19391–19521）

| 名字 | 行 | 说明 |
|---|---|---|
| `showLockScreen(mode, payload)` | 19396 | 返回 Promise（只在成功时 resolve —— 所以 Esc 不能关，见 18390 的 keydown 例外） |
| `mode='setup'` | 19452 | 新 salt → `deriveKey` → 旧明文先 `loadStateFromDisk` → 立即 `flushDiskWrite()` 加密落盘；存密码提示 |
| `mode='unlock'` | 19465 | `decryptText` → `loadStateFromDisk` → 从密文头取回 salt 重建 `_sessionKey` |
| 启动器传密码 | 19490 | `sessionStorage['nt_boot_pw']` 一次性使用，读完即删；**仅 unlock 态** |
| 失败处理 | 19478 | 提示「密码不对，或数据已损坏」，`busy=false` 可重试 |
| 收尾 | 19508–19518 | `</script>` + SW 注册脚本 |

---

## §29 全局契约（18 条，违反即 bug）

| # | 契约 | 证据 |
|---|---|---|
| 1 | `state` 是唯一事实源；页面只是视图 | 8237、14136 |
| 2 | 写盘只有一条路：`save()` → 防抖 → `flushDiskWrite()` | 8349–8404 |
| 3 | 未解锁不写盘（`_sessionKey` 为空直接返回） | 8364 |
| 4 | 金额存**字符串**，规范化只走 `normalizeAmount`（13802） | 13802–13812 |
| 5 | 日期存 `YYYY-MM-DD`，显示 `YYMMDD` | `todayISO`/`toYYMMDD` |
| 6 | 期初是**账户字段** `opening`，不是流水（与 `DATA-MODEL.md` 的 B2 模型不同） | 14014–14015 |
| 7 | 借贷方向：资产/费用 `+转入−转出`；负债/权益/收入 `+转出−转入` | 14013–14015 |
| 8 | `computeStats` 的三组数：`t*` 累计到区间末、`p*` 区间内、`h*` 区间前 | 13992–14004 |
| 9 | 表格宽度 = colgroup 各列之和（px）；query 例外（按 %） | 18103–18108 |
| 10 | 列宽唯一存储 `colWidths[key]`；顺序必须与 DOM 一致 | 18047–18067 |
| 11 | 冻结列 = 每表首列，且只用 CSS `left:0` | 7940、126–127 |
| 12 | 所有 `innerHTML` 拼接必须过 `esc()` | 13842 |
| 13 | 弹窗只能由 `mkDialog()` 生成 | 8907 |
| 14 | 提示只能用 `toast()`，不用 `alert` | 13846 |
| 15 | 除「检查更新」与「感谢墙」外不发网络请求（共 3 类 URL） | 8536 / 8545 / 9056 |
| 16 | 同步默认覆盖，`merge:true` 才合并 | 16923 |
| 17 | 撤销栈 20 步，`_undoLock` 期间不压栈 | 8339–8357 |
| 18 | 单文件：不允许新增外部 JS/CSS/字体依赖 | 全文件无 `import`/`src=` 到外域 |

---

## §30 可优化清单（带证据，按定型期优先级）

> 判据：**P0** = 会丢数据/会看到错位/一改就踩；**P1** = 每次改动都要多花时间的结构债；**P2** = 整洁度与体验。
> 定型期的原则：P0 必修；P1 只做「不改变行为」的合并；P2 攒着，不要动。

### P0（6 条）—— v13.72 已全部修复，明细见 §32

| # | 问题 | 证据 | 结论 |
|---|---|---|---|
| 1 | **主题切换的刷新顺序错了**：`applyTheme()` 先 `syncSummaryDelBorder()`（按**旧**主题取 `--bg-main`）再翻 `data-theme`，深色下设置表右侧三列会拿到浅色底、并被写成 inline `!important` | `applyTheme`（8059）、`syncSummaryDelBorder`（15189）、`toggleTheme`（8068）。真实路径只有「切主题闪一帧」（`toggleTheme` 的 setTimeout 又补刷了一次）；绕过 `applyTheme` 直接设 `data-theme`（测试脚本常这么干）才会留下持久白块 | ✅ 改成「先翻属性、再刷颜色」，并保留下一帧补刷 |
| 2 | **扫码合并打开的是另一个仓库** | `SYNC_QR_BASE`（19174）曾写死 `jefely.github.io/nt-ledger/`，与 `SITE_URL`（8160）不一致 | ✅ 改成 `= SITE_URL`；落地页本就实现了 `#m=`（`mergeFromHash` 19383） |
| 3 | **4 处用原生 `confirm()`** | `deleteAccount`（14838）、删旧流水（12646 附近）、删账本（13168 附近）、覆盖导入（17676 附近） | ✅ 全部换成 `askConfirm()`（16447）。PWA/WebView 禁用 `confirm` 时它返回 false 且不弹窗，表现是「点了没反应」 |
| 4 | **写盘失败只 `console.warn`** | `flushDiskWrite`（8373） | ✅ 改成 error toast：「保存失败：…（数据还在本页内存里，别关页面）」 |
| 5 | **多标签页只有提示、不互斥** | `watchOtherTabs`（8200）只弹提示；写盘是整份覆盖 | ✅ 写前比对磁盘密文：与 `_lastDiskCipher`（8345）不一致就**拒绝写入** + 提示刷新；另外排队时锁定 `_pendingKey`，切账本不会写错本子 |
| 6 | **同名函数声明两次** | `mwRingPath` 曾同时存在于 9322 / 9342（后者覆盖前者） | ✅ 删掉死的那份（现只剩 9356） |

### P1（8 条，结构债）

| # | 问题 | 证据（量化） | 建议 |
|---|---|---|---|
| 1 | CSS 2,826 个 `!important`、288 处 `html body`、130 组重复选择器 | §2.1；`.col-resizer::after` 被声明 11 次 | 定型期先**冻结功能**，再做一次「合并最后一刀」：对每张表/每个组件，用 DevTools 的 Computed 面板取最终值，重写一份规则，删掉被压掉的整段。**必须分组件、一次一个**，否则回归面太大 |
| 2 | JS 侧 5 个样式补丁 IIFE + 6 个 MutationObserver（约 500 行） | 18347–18744 | 与 P1-1 同源。合并 CSS 后，能删的删；删不掉的集中到 `patches.js` 并写明「为什么 CSS 做不到」 |
| 3 | 12 个死函数 | `openHelpDialog` 8918、`openAuditSummaryDialog` 8952、`openVersionDialog` 8981、`openThanksDialog` 9039、`mwTraceChain` 10237、`mwRenderSide` 10272、`fmtOpening` 11057、`openImportHub` 12489、`ensurePendingAccount` 12515、`closeAllMasks` 13324、`findDuplicateAccountName` 15498、`openRowMenu` 17503 | 直接删（校验页四个入口走 10311，不受影响） |
| 4 | 2 个死常量 + 1 段死注释 + 1 处改名残留 | `XLSM_KEY` 16522、`XLSX_TPL_IDB` 17373、17329–17341 的模板法说明、`mwPicked`（13288 / 13315 对未声明变量的赋值 —— 真变量是 `mwSelected`，sloppy 模式下会凭空建一个全局） | 删；`buildXlsxBytes` 是唯一实现 |
| 5 | 115 处空 `catch` | 全文件 `catch(e){}` | 不要求全改；至少把「涉及持久化/解密」的 6 处改成可见错误 |
| 6 | 表格引擎是「按 key 的特例堆」 | `initColResize` 里 `query`/`install`/`summary` 分支（18172–18285） | 抽 `TableLayout`（`TABLE-REFACTOR.md` 的计划）；定型期可只做「把联动列做成参数」这一小步 |
| 7 | 设置页与统计·汇总表两份实现 | §21.3 vs §11 | v13.71 已让两者**做法**一致；代码合并放 P1-6 一起做 |
| 8 | `versions.json` 落后 | `money-way/versions.json` 的 `current` 还是 `v13.66`（APP_VER 已 v13.71） | 发版时加一步同步；或干脆删掉这个文件的 `current` 字段 |

### P2（9 条，体验/一致性）

| # | 问题 | 证据 | 备注 |
|---|---|---|---|
| 1 | 账单导入的四条规则表硬编码 | 12148–12445 | 未来可做成「配置」里的可视编辑；定型期不动 |
| 2 | `statsMap` 缓存只看区间 | 13973–13978；靠 `render()` 手动失效（14167） | 建议 key 加 `_dataVersion`，去掉隐式约定 |
| 3 | xlsx 的列宽/字号与网页 CSS 各自维护 | `_xlsxSheetXml` 17146 | 两套口径不可避免，但应在两处互加注释 |
| 4 | 感谢墙密码拆 4 段 | 11427–11435 | 维护时容易漏改；建议单点常量 + 注释 |
| 5 | QR 容量注释与常量不一致 | 注释「压到 1800」（19175）vs `SYNC_QR_MAX_URL=2600`（19177） | 以代码为准，改注释 |
| 6 | CSS 里 732 行注释含大量「vX.YY 用户反馈修正」 | §2.1 | 定型期可把历史说明搬进 `CHANGELOG.md`，CSS 只留「为什么必须这样」 |
| 7 | 342 个 `var`、77 处 `innerHTML=` | §1 指标 | 新代码用 `const/let` + `createElement`，旧的不动 |
| 8 | 设置页「序」列在分组行承担「资产/负债」标签 | 15089（`col-seq cat-tag`） | 简码冻结后，横滚时标签会滑走；若想常驻，把 `cat-tag` 挪到 `col-code` 格（需用户确认视觉） |
| 9 | 代码注释与实现漂移 | 17155 注释写「组装三张表」，实际 `sheets.push` 四处（17216/17235/17271/17292） | 这类注释比没注释更误导；改实现时顺手改注释 |

---

## §31 最终结构大纲（定型期目标）

> 目标不是重写，而是**在不改变行为的前提下**把「一个 19k 行文件」变成「一个入口 + N 个职责单一的文件」，
> 让每次改动只碰一处。单文件版（`personal/index.html`）继续存在并可双击运行，作为发布产物。

### 31.1 目录与模块边界

```
money-way/personal/
├── index.html                ← 发布产物（1 个，可用构建脚本从 src 生成）
├── sw.js / manifest.json / 图标
├── 产品说明.md                ← 产品/用户视角（许可证、备份、图标、部署）
├── README.md                 ← 本文件（工程视角）
├── DATA-MODEL.md / DESIGN-RULES.md / TABLE-REFACTOR.md   ← 既有专题文档
└── src/                      ← 目标结构（逐步迁入；迁一层，index.html 少一段）
    ├── app.js                启动序列（§26.1 那 8 步）+ 路由表（§19）
    ├── core/
    │   ├── state.js          state 形状 + 默认值 + 迁移（§4.1/§4.7）
    │   ├── storage.js        lsKey / save / 防抖写盘 / 撤销（§4.8）
    │   ├── crypto.js         PBKDF2 + AES-GCM + ENC1/LZ2 格式（§4.3）
    │   └── books.js          多账本（§4.5）
    ├── calc/
    │   ├── dates.js          parseRangeInput / toYYMMDD / ym*（§18.1）
    │   ├── range.js          getCurrentRange + 区间工具栏模型（§18.2/§19.2）
    │   ├── stats.js          statsMap + computeStats（§18.2）
    │   ├── fixed.js          固定收支引擎（§5）
    │   └── install.js        分期月份矩阵（§23）
    ├── view/
    │   ├── shell.js          tabbar / footer / toast / mkDialog（§3/§7）
    │   ├── flow.js           流水页（§20）
    │   ├── settings.js       设置页（§21）
    │   ├── stats.js          统计页（§11）
    │   ├── query.js          查询页（§22）
    │   ├── install.js        分期页（§23）
    │   ├── fixed.js          固定页（§10）
    │   ├── audit.js          校验页（§9）
    │   └── moneyway.js       路径图（§8）
    ├── io/
    │   ├── text.js           账户/流水文本格式（§6.3/§24.1）
    │   ├── xlsx-read.js      ZIP+XML 读（§14）
    │   ├── xlsx-write.js     最小 OOXML 写（§24.3）
    │   ├── bill.js           账单导入规则（§15）
    │   ├── sync.js           同步码 + 合并（§24.2）
    │   └── qr.js             二维码编码 + 合并码（§27）
    ├── ui/
    │   ├── table.js          initColResize / applyWidths / 冻结（§25）
    │   ├── layout.js         行高/字号/列宽面板（§12）
    │   ├── theme.js          主题（§4.2）
    │   ├── lock.js           锁屏与密码（§28）
    │   └── patches.js        五个样式补丁 IIFE（§26.2，最终应当消失）
    └── styles/
        ├── tokens.css         :root 变量（§2 ①）
        ├── base.css           布局/tabbar/表格基座（②）
        ├── components.css     工具栏/弹窗/按钮/分期/校验页（⑤）
        ├── tables.css         各表外观 + 冻结契约（§2.2）
        └── theme-dark.css     仅 [data-theme="dark"]
```

### 31.2 迁移顺序（每步都能独立发版、可回滚）

| 步 | 动作 | 验收（必须机器可验证） |
|---|---|---|
| 0 | 建 `src/`，把 `index.html` 原样保留为发布产物；写一个 30 行的拼装脚本 | `node build.mjs` 生成的 index.html 与现有文件**逐字节等价**（先证明管道无损） |
| 1 | 抽 `core/`（state/storage/crypto/books） | 同一份 localStorage 密文，新旧两版都能解开并渲染出同一屏（截图 diff） |
| 2 | 抽 `calc/`（dates/range/stats） | 对 73 个账户 × 构造的 200 笔流水，新旧 `computeStats` 输出逐字段相等 |
| 3 | 抽 `ui/table.js` | 五张表各拖 3 列，每拖一次只有一列变化，刷新后保持（§25 的两条铁律） |
| 4 | 抽 `io/` | 导出 .xlsx → 导入回来，state 深比较相等；同步码 `覆盖/合并` 两种语义各测一遍 |
| 5 | 抽 `view/` 各页 | 七个页签来回切 10 次无 JS 报错、滚动位置各自保留 |
| 6 | 拆 CSS（tokens→base→components→tables→theme） | 合并后删掉 `!important` 的比例 ≥ 60%，且所有页面的关键几何（表格宽、列宽、行高、按钮尺寸）与合并前**逐像素相同** |
| 7 | 删掉 `patches.js` | 五个 IIFE 全部下岗；弹窗/按钮/×/▲ 的外观与之前一致（截图 diff） |

### 31.3 目标状态下的「单一事实源」表

| 事实 | 唯一所有者 |
|---|---|
| 账本数据 | `core/state.js` 的 `state` |
| 密文与密钥 | `core/crypto.js` + `core/storage.js` |
| 布局/列宽 | `ui/layout.js` + `ui/table.js`（`colWidths` 一处） |
| 每张表的列序与类名 | 各 `view/*.js` 的 thead 模板（**列宽数组顺序必须与之逐位一致**） |
| 区间语义 | `calc/range.js` `getCurrentRange` |
| 借贷方向与余额 | `calc/stats.js` `computeStats` |
| 导入/导出格式 | `io/text.js` / `io/xlsx-*.js` / `io/sync.js` |
| 样式最终值 | `styles/*.css`（不再有 JS inline 覆盖） |

### 31.4 定型期明确「不做」的事

1. 不引入框架、构建期 CSS 预处理器、TypeScript —— 单文件直接运行是产品承诺（§3、`产品说明.md`）。
2. 不改数据格式（`state` 形状、`ENC1`/`LZ2`/`ENC2` 格式、文本段格式），否则老用户数据会读不出来。
3. 不做云同步/账号体系 —— 无后端是设计而非缺口。
4. 不追 `DATA-MODEL.md` 里「期初也是流水」的 B2 模型 —— 那是下一代的账务重构，与本轮表格/结构整理正交。
5. 不动 `nt/`（另一条开放路线）。

---

## §32 v13.72：P0 六条的修复记录

> 原则：**不改数据格式、不改交互流程**，只修「会丢数据 / 会看到错位 / 一改就踩」的六处。
> 每条都用无头 Chrome 跑过断言（共 20 项，见「验收」列）。

| # | 改动 | 位置 | 关键实现 | 验收 |
|---|---|---|---|---|
| 1 | 主题刷新顺序 | `applyTheme` 8059 / `toggleTheme` 8068 | 先写 `dataset.theme` + `colorScheme`，再 `syncSummaryDelBorder()`（15189）；`toggleTheme` 保留下一帧补刷 | 深色启动、点「主题」两条路径：`th/td.col-bill` 计算背景都是 `rgb(0,0,0)`；右侧四列逐格采样白像素占比 0% |
| 2 | 扫码落地页 | `SYNC_QR_BASE` 19174 | `= SITE_URL`（8160），不再指向另一个仓库 | `SYNC_QR_BASE === SITE_URL` ✅ |
| 3 | 确认框统一 | `deleteAccount` 14838，另 3 处（删旧流水 / 删账本 / 覆盖导入） | 改 `askConfirm(msg, onOk)`；删除前按 id **重新定位**（对话框异步，idx 会失效）；撤销用重定位后的下标 | 打桩 `window.confirm` 计数：弹统一框（`.confirm-box`）、原生 confirm 调用 0 次；取消 → 账户数不变，确定 → -1 |
| 4 | 写盘失败可见 | `flushDiskWrite` 8373 | 失败 → `toast(..., {type:'error'})`，文案点明「数据还在内存里，别关页面」 | 打桩 `Storage.prototype.setItem` 抛异常 → toast 出现「保存失败」 |
| 5 | 多标签页写冲突 | `flushDiskWrite` 8373 / `scheduleDiskWrite` 8363 / `switchBook` 13260 | 新增 `_lastDiskCipher`（8345，解锁与切账本时取现值、写成功更新）与 `_pendingKey`（8346，排队时锁定目标 key）；写前磁盘现值 ≠ 已知值 → **不写** + 提示刷新；切账本前先 `await flushDiskWrite()` 排空，并作废流水页 DOM 缓存（`_dataVersion++`、`_flowCache=null`） | 模拟「另一标签页写入合法密文」→ 本次保存被拒、磁盘保持对方那份、toast 出现「另一个标签页」；刷新解锁后可正常写 |
| 6 | 重复函数 | `mwRingPath` 9356 | 删掉从未被调用的那份（旧 9322） | 源码里 `function mwRingPath(` 只出现 1 次；`typeof mwRingPath === 'function'` |

**回归**：七个页签来回切换无 JS 报错；设置表列宽/冻结行为与 v13.71 一致（§25 两条铁律仍成立）。

**遗留**：P1/P2 未动（CSS 合并、12 个死函数等）。P0-1 的教训写在这里 —— 「同一份样式有两个写者（CSS + JS inline）时，**刷新顺序**本身就是契约」；以后再加类似 `syncXxx()` 的调用，一律「先改状态、再刷衍生」。

---

## 附：怎么验证本文档没写错

```powershell
# 1) 任取一条「函数名@行号」，确认它真在那里
Select-String -Path personal\index.html -Pattern '^function computeStats'   # 期望 14010

# 2) 量化指标可重算（本文用过的数字）
#    总行数 / CSS 行数 / !important 数 / 顶层函数数 —— 见 §1、§2.1
node -e "const s=require('fs').readFileSync('personal/index.html','utf8');console.log(s.split('\n').length)"   # 19521

# 3) 死函数清单可复核：某函数名在整个文件里只出现 1 次（就是它自己的定义）
Select-String -Path personal\index.html -Pattern 'openRowMenu' | Measure-Object | % Count   # 期望 1

# 4) 行号漂移自测：改了 index.html 之后，本文的行号会整体偏移。
#    思路：从 README 表格里抽出「`名字` + 数字」，到 index.html 里找这个名字的首次出现，
#    两者相差 > 20 行就报出来（v13.72 成稿时用同一脚本跑过）。
```

> 本文档的每条「死代码/死常量/重复定义」结论都是按上述方法实际跑出来的，不是目测。
> 「指标快照」那张表里的数字是**计数**（不是行号），其余表格里的数字都是行号。
> v13.72 成稿时用脚本把全文 **230 组「名字 + 行号」**逐条比对过 `index.html`：**230 组全部命中（偏差 ≤ 20 行）**；
> 另有 2 组是指标计数（`querySelector(All)` 318、`addEventListener` 93），不在核对范围。
