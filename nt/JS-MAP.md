# NT账本 · JS → 界面位置 映射

> 本表由 `nt/tools/js-map.mjs` 从每个文件头第一行的 `// 界面：…` **生成**，不要手改。
> 改界面位置就改文件头，然后 `node nt/tools/js-map.mjs --write`。
> `（无界面）` 表示纯逻辑，被其他模块调用，不直接对应某个 DOM 区域。

| JS 文件 | 对应界面位置 |
|---|---|
| `app.js` | 单页壳入口：门禁 → state → 7 视图装配 → tab 路由 |
| `browser/db.js` | （无界面）IndexedDB 数据库封装 |
| `browser/idb.js` | （无界面）IndexedDB 打开 |
| `core/account-config.js` | （未标注界面）账户配置（纯函数） |
| `core/account-index.js` | （无界面）账户索引 |
| `core/account-resolver.js` | （无界面）账户名/简码解析 |
| `core/auth-manager.js` | （无界面）主密码校验/修改 |
| `core/balance-calculator.js` | （无界面）余额计算 |
| `core/bill-parse.js` | 三家账单（支付宝 / 微信支付 / 招商银行）的识别与解析 |
| `core/color.js` | （无界面）颜色转换 |
| `core/crypto-engine.js` | （无界面）PBKDF2 + AES-GCM |
| `core/csv.js` | CSV 解析（纯函数，Node 可跑） |
| `core/date-query.js` | 日期筛选框的解析（纯函数，Node 可跑） |
| `core/export-text.js` | 导出为纯文本（.txt 模板 / .csv） |
| `core/flow-text.js` | （无界面）账本文本 ↔ state |
| `core/format.js` | （无界面）金额/日期格式化 |
| `core/import-apply.js` | （无界面）导入落库 |
| `core/import-parser.js` | （无界面）账本文本解析 |
| `core/import-table.js` | 导入 Excel / CSV / 账单（纯逻辑，Node 可跑） |
| `core/installment-engine.js` | （无界面）分期引擎 |
| `core/ledger-file.js` | （未标注界面）账本文件（纯函数） |
| `core/ledger-stats.js` | （无界面）账本统计 |
| `core/ledgers.js` | （无界面）多账本 create/switch/rename/remove |
| `core/lz-file.js` | .lz 快照文件（跨设备同步码）的解析与还原（纯函数，Node 可跑） |
| `core/meta.js` | （未标注界面）项目地址（常量） |
| `core/migrate.js` | （无界面）旧数据迁移 |
| `core/mw-settings.js` | （无界面）环图参数 SCHEMA + 默认值 |
| `core/opening-migrator.js` | （无界面）期初迁移 |
| `core/qr-encode.js` | （未标注界面）QR 编码入口（纯函数） |
| `core/qr-matrix.js` | （未标注界面）QR 矩阵构造（纯函数） |
| `core/qr-rs.js` | （未标注界面）QR 里用到的有限域与纠错（纯函数） |
| `core/query-engine.js` | （无界面）查询引擎 |
| `core/scheduler-engine.js` | （无界面）排程引擎 |
| `core/schema.js` | （无界面）数据结构定义 |
| `core/settings.js` | （无界面）界面参数 SCHEMA + 主题默认值 |
| `core/state-store.js` | （无界面）state 增删改 |
| `core/stats.js` | （无界面）统计计算 |
| `core/sync-code.js` | （未标注界面）跨设备同步码与二维码载荷（纯函数） |
| `core/sync-merge.js` | （未标注界面）合并远端记录（纯函数） |
| `core/sync-window.js` | （无界面）同步窗口自适应：一张码能装多少天就装多少天 |
| `core/table-cols.js` | （无界面）每张表各自的列与默认列宽 |
| `core/validate.js` | （无界面）账本校验 V1–V7 |
| `core/validator.js` | （无界面）校验工具 |
| `core/version.js` | （未标注界面）版本与更新判定（纯函数） |
| `core/xlsx-template-read.js` | 把「单文件版备份模板」的 4 张表读回 state（纯函数，Node 可跑） |
| `core/xlsx-template.js` | 按「单文件版备份模板」组装 / 解析 4 张表（纯函数，Node 可跑） |
| `core/xlsx-write.js` | xlsx 的 XML 生成（纯函数，Node 可跑） |
| `core/xlsx-xml.js` | xlsx 的 XML 解析（纯函数，Node 可跑） |
| `graph/mw-data-fetcher.js` | （无界面）路径图数据抓取 |
| `graph/mw-depth.js` | （无界面）环图的链路层级 |
| `graph/mw-path-calculator.js` | （无界面）路径计算 |
| `graph/mw-slot-calculator.js` | （无界面）槽位计算 |
| `graph/path-tracer.js` | （无界面）路径追踪 |
| `platform/device-profile.js` | （无界面）设备指纹 |
| `text-app.js` | 文本整页编辑器（text.html） |
| `timeline/time-state.js` | （无界面）时间分段 |
| `ui/account-actions.js` | 设置 tab → 账户列表操作 |
| `ui/account-config.js` | 账户配置导入导出 |
| `ui/account-dialog.js` | 设置 tab → 新增/编辑账户弹窗 |
| `ui/account-table.js` | 账户表（表格内直接编辑） |
| `ui/add-dialog.js` | 流水工具条「添加/导入」→ 添加账本·流水 弹窗 |
| `ui/apply-settings.js` | 全局：把界面参数写成 CSS 变量（主题/列宽） |
| `ui/cell-range.js` | 单元格区域框选（长按起手 → 拖动框选 → 复制 / 粘贴 / 删除行） |
| `ui/chart-gestures.js` | 环网图的手势（拖动 / 缩放 / 平移 / 旋转） |
| `ui/checks-view.js` | 校验 tab → 账本校验区 |
| `ui/col-save.js` | 把某张表某列的宽度存进「用户设置」 |
| `ui/color-picker.js` | 界面参数浮层 → 取色器 |
| `ui/debug-panel.js` | ?debug=1 → 界面参数浮层 |
| `ui/debug-pip.js` | ?debug=1 → 界面参数独立窗口（画中画） |
| `ui/debug-themes.js` | ?debug=1 → 界面参数 1/2/3/4 主题按钮 |
| `ui/export-dialog.js` | 导出对话框（.lz / .xlsx / .txt / .csv） |
| `ui/file-io.js` | （未标注界面）本地文件读写（UI 层） |
| `ui/fixed-table.js` | 固定收支表（表格内直接交互） |
| `ui/flow-model.js` | （无界面）流水视图模型 |
| `ui/gate.js` | 锁屏 / 首次设密码 |
| `ui/import-dialog.js` | 导入 Excel / CSV / 账单 |
| `ui/import-map.js` | 导入 → 手动指定列 |
| `ui/inst-table.js` | 分期表（表格内直接交互） |
| `ui/layout-text.js` | 布局文本导出/导入 |
| `ui/modal.js` | 全局 → 统一弹窗（<dialog>） |
| `ui/mw-params.js` | 全局：环图参数（CSS 变量 → 数字） |
| `ui/mw-svg-renderer.js` | 路径 tab / path.html → SVG 渲染 |
| `ui/note-table.js` | 设置页的备注区（独立于账户的 A/B 区） |
| `ui/path-flow-table.js` | 路径页左栏的流水查询表 |
| `ui/path-view.js` | 路径 tab |
| `ui/pwa.js` | PWA 注册 |
| `ui/qr-canvas.js` | （未标注界面）把 QR 矩阵画到 canvas（UI 层） |
| `ui/range-bar.js` | 单元格框选的工具条 |
| `ui/render-transactions.js` | 流水 tab → 表格 tbody（虚拟滚动） |
| `ui/row-editor.js` | 流水 tab → 行内编辑 / 新增行 |
| `ui/share-block.js` | 二维码分享区块 |
| `ui/suggest-popover.js` | 流水 tab / 查询 tab → 账户候选气泡 |
| `ui/sync-dialog.js` | （未标注界面）同步弹窗（UI 层） |
| `ui/sync-wheel.js` | 同步弹窗里的滚轮（日 / 年月共用） |
| `ui/table-layout.js` | 表格冻结列 + 列宽拖动 |
| `ui/table.js` | 统计 / 查询 / 固定 / 设置 → 通用表格渲染 |
| `ui/tabs.js` | 顶部 7 个 tab 切换 |
| `ui/thanks-wall.js` | 校验页「赞助感谢」—— 远程加密的感谢墙 |
| `ui/theme-manager.js` | 全局 → 主题切换（1/2/3/4） |
| `ui/undo-bar.js` | 删除后的撤销条 |
| `ui/update-check.js` | （未标注界面）版本更新（UI 层） |
| `ui/xlsx-read.js` | xlsx 读取（ZIP 展开） |
| `ui/xlsx-write.js` | xlsx 打包（ZIP 写入） |
| `views/flow.js` | 流水 tab |
| `views/path.js` | 路径 tab |
| `views/plan.js` | 固定 tab |
| `views/query.js` | 查询 tab |
| `views/settings.js` | 设置 tab |
| `views/stats.js` | 统计 tab |
| `views/validate.js` | 校验 tab |
