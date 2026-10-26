# NT账本 · JS → 界面位置 映射

> 每个 JS 文件头都有 `// 界面：…` 注释；本表是同一份信息的汇总，改代码前先在这里定位。
> `（无界面）` 表示纯逻辑，被其他模块调用，不直接对应某个 DOM 区域。

| JS 文件 | 对应界面位置 |
|---|---|
| `app.js` | 单页壳入口：门禁 → state → 7 视图装配 → tab 路由 |
| `browser/db.js` | （无界面）IndexedDB 数据库封装 |
| `browser/idb.js` | （无界面）IndexedDB 打开 |
| `core/account-index.js` | （无界面）账户索引 |
| `core/account-resolver.js` | （无界面）账户名/简码解析 |
| `core/auth-manager.js` | （无界面）主密码校验/修改 |
| `core/balance-calculator.js` | （无界面）余额计算 |
| `core/color.js` | （无界面）颜色转换 |
| `core/crypto-engine.js` | （无界面）PBKDF2 + AES-GCM |
| `core/flow-text.js` | （无界面）账本文本 ↔ state |
| `core/format.js` | （无界面）金额/日期格式化 |
| `core/import-apply.js` | （无界面）导入落库 |
| `core/import-parser.js` | （无界面）账本文本解析 |
| `core/installment-engine.js` | （无界面）分期引擎 |
| `core/ledger-stats.js` | （无界面）账本统计 |
| `core/ledgers.js` | （无界面）多账本 create/switch/rename/remove |
| `core/migrate.js` | （无界面）旧数据迁移 |
| `core/opening-migrator.js` | （无界面）期初迁移 |
| `core/query-engine.js` | （无界面）查询引擎 |
| `core/scheduler-engine.js` | （无界面）排程引擎 |
| `core/schema.js` | （无界面）数据结构定义 |
| `core/settings.js` | （无界面）界面参数 SCHEMA + 主题默认值 |
| `core/state-store.js` | （无界面）state 增删改 |
| `core/stats.js` | （无界面）统计计算 |
| `core/validate.js` | （无界面）账本校验 V1–V7 |
| `core/validator.js` | （无界面）校验工具 |
| `graph/mw-data-fetcher.js` | （无界面）路径图数据抓取 |
| `graph/mw-path-calculator.js` | （无界面）路径计算 |
| `graph/mw-slot-calculator.js` | （无界面）槽位计算 |
| `graph/path-tracer.js` | （无界面）路径追踪 |
| `path-app.js` | 路径独立页（path.html） |
| `platform/device-profile.js` | （无界面）设备指纹 |
| `text-app.js` | 文本整页编辑器（text.html） |
| `timeline/time-state.js` | （无界面）时间分段 |
| `ui/account-actions.js` | 设置 tab → 账户列表操作 |
| `ui/account-dialog.js` | 设置 tab → 新增/编辑账户弹窗 |
| `ui/add-dialog.js` | 流水工具条「添加/导入」→ 添加账本·流水 弹窗 |
| `ui/apply-settings.js` | 全局：把界面参数写成 CSS 变量（主题/列宽） |
| `ui/checks-view.js` | 校验 tab → 账本校验区 |
| `ui/col-resize.js` | 流水 tab → 列标行拖动手柄 |
| `ui/color-picker.js` | 界面参数浮层 → 取色器 |
| `ui/debug-panel.js` | ?debug=1 → 界面参数浮层 |
| `ui/debug-pip.js` | ?debug=1 → 界面参数独立窗口（画中画） |
| `ui/debug-themes.js` | ?debug=1 → 界面参数 1/2/3/4 主题按钮 |
| `ui/flow-model.js` | （无界面）流水视图模型 |
| `ui/gate.js` | 锁屏 / 首次设密码 |
| `ui/modal.js` | 全局 → 统一弹窗（<dialog>） |
| `ui/mw-svg-renderer.js` | 路径 tab / path.html → SVG 渲染 |
| `ui/path-view.js` | 路径 tab |
| `ui/render-transactions.js` | 流水 tab → 表格 tbody（虚拟滚动） |
| `ui/row-editor.js` | 流水 tab → 行内编辑 / 新增行 |
| `ui/suggest-popover.js` | 流水 tab / 查询 tab → 账户候选气泡 |
| `ui/table.js` | 统计 / 查询 / 固定 / 设置 → 通用表格渲染 |
| `ui/tabs.js` | 顶部 7 个 tab 切换 |
| `ui/theme-manager.js` | 全局 → 主题切换（1/2/3/4） |
| `views/flow.js` | 流水 tab |
| `views/path.js` | 路径 tab |
| `views/plan.js` | 固定 tab |
| `views/query.js` | 查询 tab |
| `views/settings.js` | 设置 tab |
| `views/stats.js` | 统计 tab |
| `views/validate.js` | 校验 tab |
