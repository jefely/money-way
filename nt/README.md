# NT账本 · 多文件版

> 与单文件版 `personal/index.html` **并列存在、互不干扰**。
> 新功能一律写在这里；旧版只修致命 bug（公约 1.4）。
> 建设规则见仓库根目录 [`CODE-RULES.md`](../CODE-RULES.md)。

- **当前版本**：`nt-v1.130`
- **数据版本**：`SCHEMA_VERSION = 2`
- **规模**：186 个文件 / 115 个 JS / 383 条测试
- **这一版是什么**：单文件版的**重写**。功能从 `personal/index.html` 搬，但每一块都重新分层 ——
  算钱的进 `core/`（纯函数、Node 可跑），碰 DOM 的进 `ui/`，页面只做装配。

---

## 一、7 个 tab

| 页 | 能做什么 |
|---|---|
| **流水** | 行内直接编辑（无弹窗）、简码 → 账户名、金额失焦变 `¥1,234.56`、表尾常驻空行往下填、粘贴多格、框选（长按起手 → 复制 / 粘贴 / 删除行）、虚拟滚动、删除后 8 秒撤销 |
| **统计** | 分类 / 汇总两个子视图；区间 / 年份 / 月份 / 全部；每类自动跟一行合计（新类型自动出现） |
| **查询** | A / B / C 三段同构查询表，各自独立条件；日期语法与单文件版一致（`26` / `2607` / `260701` / `2601-2602` / `260101-260107`） |
| **路径** | Money Way 环网图：缩放 / 平移 / 旋转、点弧块 / 点线 / 点左栏三种焦点、逆流顺流切换、按统计分类上色 |
| **固定** | 固定收支 + 分期两张表，都在表格里直接改。分期用引擎推算（本金 + 期数 + 利息 + 首月），不手填矩阵 |
| **设置** | 账户表（就地改简码 / 类型 / 分类 / 期初 / 账单日 / 还款日、上移、删除）+ 配平 / 密码 / 配置 / 重置 / 主题 / 布局 |
| **校验** | 账本说明 / 账本校验（① 发生额平衡 ② 会计恒等式 ③ 数据完整性 V1–V7）/ 赞助感谢 |

**全局**：零知识加密（PBKDF2 150k → AES-GCM 256 + IndexedDB）、四套主题、一次解锁全站可用、
所有表格的列宽与行高字号都能拖 / 调（`?debug=1` 面板或「设置 → 布局」）。

---

## 二、目录结构

```
nt/
├── index.html                    单页壳：7-tab + 7 个 .nt-view + 启动兜底
├── text.html · text-app.js       流水文本整页编辑器
├── thanks-admin.html             感谢墙管理（名单 + 收款码）
├── manifest.json · sw.js         PWA（CACHE_NAME 必须与 core/version.js 的 APP_VER 相等）
├── templates/templates.html      所有 <template>（行 / 面板 / 弹窗零件）
├── css/    18 个                 每块界面一个文件，全部 nt- 前缀、无层级选择器
├── js/
│   ├── app.js                    入口：门禁 → state → 索引 → 7 视图装配 → tab 路由
│   ├── core/    47 个            ── 第一层：数据基座（纯数据，零依赖，Node 可跑）
│   ├── timeline/ 1 个            ── 第二层：过去 / 现在 / 未来
│   ├── graph/    5 个            ── 第三层：Money Way 数学（纯几何，无三角函数渲染）
│   ├── platform/ 1 个            ── 第四层：设备特征
│   ├── browser/  2 个            ── 存储边界：IndexedDB + 加密记录
│   ├── ui/      50 个            ── 第五层：只拼 DOM，不算钱
│   └── views/    7 个            ── 页面装配：只接线，不算钱
├── tools/                        check-rules（门禁）· js-map · probe（像素探针）· serve
├── tests/  31 个 · 383 条        纯函数测试（Node 直接跑）
└── MIGRATION-GAPS.md             单文件版 → nt 的缺口清单
```

**分层铁律**：`core/` `timeline/` `graph/` 不许碰浏览器 API（门禁强制）；
`views/` 只消费 `ctx`（state / index / save / footer），不直接碰存储；
`ui/` 只管 DOM，不算钱。

---

## 三、怎么跑

```powershell
# 打开界面（file:// 也能跑，但要 PWA 缓存体检就用本地服务）
node nt/tools/serve.mjs 8080

# 纯函数测试（Node 24 对目录参数不识别，用 *.test.mjs 展开）
Get-ChildItem nt/tests/*.test.mjs | ForEach-Object { node $_.FullName }

# 公约检查（提交前必跑）
node nt/tools/check-rules.mjs

# 改 CSS / 布局前先量像素，不许猜
node nt/tools/probe.mjs http://127.0.0.1:8080/nt/index.html "document.querySelector('.目标').getBoundingClientRect().left"
```

> **UI 调整必须先用探针量**。改完再量一次确认。
> 理由：多次「改了没效果」都是实际值与假设不符（checkbox 实际 13px、空 actions 占 18px 等）。

---

## 四、这一版守住了哪些条款

| 条款 | 怎么守住的 |
|---|---|
| 1.1 无内联事件 | 全部 `addEventListener`；表格操作用事件委托 |
| 1.2 无内联样式 | 动态显示一律走类名与 CSS 变量 |
| 1.3 无深层 div | 最深 5 层（门禁数 `<div>` 嵌套） |
| 2.2 模板复用 | 行 / 面板 / 弹窗零件全是 `<template>`，JS 只 `cloneNode` + 填文本 |
| 2.3 模板不写业务 | 所有数字由 `core/` 算好，视图只填字符串 |
| 3.1 文件 ≤ 300 行 | 按**有效代码行**算（注释与空行不计）；超了就拆，拆出来的模块反而更清楚 |
| 3.3 依赖隔离 | `core/` 零 DOM / 存储引用，门禁扫 |
| 4.4 缓存版本隔离 | `sw.js` 的 `CACHE_NAME` 与 `APP_VER` 相等，有测试强制 |

**门禁会失败，这是它的价值** —— 它多次因为超行数逼着拆文件，也抓到过
「import 指向不存在文件」和「语法错误但其它项全过」这两类会直接白屏的问题。

---

## 五、改动前先看这三条

1. **加功能前先想「放哪层」**：能算的放 `core/`（纯函数 + 测试），
   能复用的结构放 `<template>`，DOM 操作放 `ui/` 或 `views/`，只有装配写 `app.js`。
2. **`core/` 里写 `document` 会被 `check-rules.mjs` 拦下** —— 不是约定，是门禁。
3. **改任何 CSS / JS 都要升版本**：改 `core/version.js` 的 `APP_VER`，同时改 `sw.js` 的 `CACHE_NAME`。
   **删文件比改文件危险得多**：必须同时升版本 + 全局搜残留引用，否则用户浏览器里的旧模块指向已删文件 → 白屏。

---

## 六、文档索引

| 文件 | 管什么 |
|---|---|
| [MIGRATION-GAPS.md](MIGRATION-GAPS.md) | **单文件版还欠什么** —— 迁移通道与缺口清单 |
| [GLOSSARY.md](GLOSSARY.md) | **术语**：账户类型 vs 统计分类（最容易混的一条） |
| [UI-SPEC.md](UI-SPEC.md) | **页面与组件拆分**：7 个 tab 的列标、冻结列、弹窗、交互 |
| [UI-PARAMS.md](UI-PARAMS.md) | **界面参数**：`?debug=1` 面板里每个旋钮的 key / 组 / 默认值 |
| [TABLE-INTERACTION.md](TABLE-INTERACTION.md) | **表格交互的坑**：拖动、冻结、列宽、`max-width` 钳制、`pointercancel` |
| [MONEYWAY-SPEC.md](MONEYWAY-SPEC.md) | **路径图设计**：线宽权重、颜色绑定、单位角公式、反序溯源 |
| [JS-MAP.md](JS-MAP.md) | **JS 文件 → 界面位置**（由 `tools/js-map.mjs` 生成，门禁校验，不要手改） |
| [TESTING-NOTES.md](TESTING-NOTES.md) | **探针的坑**：transition / blob import / hidden 三处误判 |
| [REFACTOR-CHECKLIST.md](../REFACTOR-CHECKLIST.md) | 16 个模块的进度与验收标准 |
| [CODE-RULES.md](../CODE-RULES.md) | 建设公约（门禁强制） |

---

## 七、版本记录（里程碑）

早期逐版本记录已由 git log 取代（`git log --oneline nt/`）。这里只留台阶：

| 版本 | 内容 |
|---|---|
| `nt-v0.01` | 骨架：流水录入 / 列表 / 删除 / 校验 / 迁移 / 测试 / 门禁 |
| `nt-v0.02` | 零知识加密（PBKDF2→AES-GCM + IndexedDB）、ID 存储模型、简码体系（O(1) 索引 + 候选气泡 + V7）、计划引擎、Money Way 数学引擎、双主题 |
| `nt-v0.03` | **单页 7-tab 壳**：一次解锁、切换不刷新；新增 `views/` 装配层与 `ui/table.js` |
| `nt-v0.8x` | 同步二维码（滚轮选日 / 自适应窗口）、感谢墙、路径页收进单页 |
| `nt-v0.9x`–`v1.0x` | 设置页重做：账户表就地编辑、分区、备注区、类型候选浮层；流水空行与滚动定位；列标行配色 |
| `nt-v1.1x`–`v1.12x` | 分类合计行（序 + 分类合并格）、四主题、每张表各自的列宽与行高字号、`?debug=1` 参数面板 |
| **`nt-v1.130`** | **修迁移通道**：单文件版的 `.lz` 里 `fixed` / `installments` 不再丢失；`.xlsx` 认「汇总」表并按表头定位列。补「设置 → 修改密码」（原来点了弹「后续版本接入」）。新增 `MIGRATION-GAPS.md` |

---

## 八、已知的产品问题（需要拍板）

`MIGRATION-GAPS.md` 第三节第 2 条：**固定收支要不要自动写进流水**。

单文件版会（每账本每天一次，5 点后跑），nt 只生成虚拟流水供预测。
两种立场都站得住，但这决定了固定表要不要「本月状态」列 —— 等你定。
