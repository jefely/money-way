# NT 账本液态玻璃折射设计

> 版本：nt-v1.568
> 参考：用户 2026-11 提供的液态玻璃教程视频
> 实现位置：[`js/ui/liquid-glass.js`](js/ui/liquid-glass.js) · [`css/flow.css`](css/flow.css) · [`js/views/flow.js`](js/views/flow.js)

## 1. 范围

只作用于右下角的悬浮输入窗 `.nt-composer`，不改页面其它 UI。

- 收起：54×54 圆钮；
- 展开：360×54 胶囊；
- 两个状态都用位移贴图折射背后的流水表格；
- 玻璃模块是增强项：加载失败/浏览器不支持时，原悬浮窗照常工作。

## 2. 算法

和视频一致，用屏幕空间位移贴图：

1. 圆角 SDF 求法线；
2. R/G 通道编码横/纵偏移，128 = 不偏移；
3. `feImage` 载入贴图；
4. `feDisplacementMap` 采样背景；
5. 元素用 `backdrop-filter: url(#nt-lg-composer)` 取结果。

贴图 96px，按「54×54 / 360×54」分别生成并缓存。展开态单独一张宽条贴图，避免把圆形贴图拉成椭圆。

## 3. 代码

### 贴图

[`js/ui/liquid-glass.js`](js/ui/liquid-glass.js)：

- `sdfRoundRect()`：圆角矩形距离场；
- `buildMap()`：生成法线贴图，边缘做 `4t(1-t)` 折射，中心保持 128；
- `MAP_CACHE`：按宽高圆角缓存 DataURL。

### 滤镜

`makeFilter(id, map, scale)`：

```text
feImage → feDisplacementMap(R/G, scale) → 输出
```

- 圆钮：`nt-lg-composer`，`scale=18`；
- 展开：`nt-lg-composer-open`，`scale=18`。

### 挂载

[`js/views/flow.js`](js/views/flow.js)：

```js
import('../ui/liquid-glass.js')
  .then((m) => m.installLiquidGlass(composer.bar))
  .catch(() => {});
```

使用**动态 import + catch**：模块取不到时只跳过玻璃，绝不让整个 `flow.js` 模块图加载失败。

## 4. 视觉层

`css/flow.css` 的 `.nt-composer.liquid-glass`：

- 白色 12% 透明底；
- 左上径向高光 + 135° 线性高光；
- 1px 白色边框；
- 内侧顶部高光 + 底部暗影；
- 外侧 22px 柔和投影；
- 展开态底色略提高（+4%），边框略降。

按钮：

- 收起时 `NT` 字透明底；
- 展开时发送按钮用主题主色。

## 5. 参数

NT 的调试面板：**设置 → 布局 → 液态玻璃**（仅 `?debug=1` 布局页）。

| 参数 | 默认 | 作用 |
|---|---|---|
| 不透明度 | 12% | 玻璃底白色浓度 |
| scale | 18 | 位移贴图折射强度 |
| 高光亮度 | 55% | 左上/线性高光 |
| 阴影范围 | 38% | 外阴影浓度 |
| 背景模糊 | 0px | `backdrop-filter` 附加 blur |

参数保存在 `localStorage` 的 `nt_glass_params`。滑块直接写 localStorage 并派发 `nt-glass-params` 事件，`liquid-glass.js` 监听后更新 CSS 变量和两个 `feDisplacementMap` 的 scale；调试面板不需要静态 import 玻璃模块。

「视频参考值」按钮：

```text
不透明度 20 / scale 12 / 高光 55 / 阴影 75 / 模糊 0
```

## 6. 节点设置表：五列与「名称列吃剩余」

删除期初余额/上移/删除三列后，账户表恢复原来的列宽策略：

- `简码 / 序 / 类型 / 分类` 保持参数宽度，可拖；
- **节点名称列 `width:auto`** 吸收剩余宽度；
- 表格 `width:100%`；
- 备注区也必须只有 5 列，否则 `table-layout:fixed` 会按隐藏的 8 列分宽，名称列右边框到不了区域右边界；
- 备注区的上移/删除收进「内容」格右侧。

区域宽度以**上下滚动条左边界**为准；最后一列右边框应落在该边界上：

```text
表格宽 = 左区内容宽（滚动条轨道之外）
最后列 right = 表格 right
```

## 7. 限制

- 这是 `backdrop-filter` 的 2D 折射，不是 3D 厚玻璃；
- 没有折射率/厚度/菲涅耳；
- 96px 贴图在 54px 圆上足够，但不会产生视频里厚透镜的中央暗部；
- 需要更真实的效果要改用 WebGL 渲染。

## 8. 验收

- 收起/展开都是同一 `.nt-composer`，没有第二个玻璃元素；
- 滑块拖动即时生效，刷新后保留；
- 模块缺失时应用仍能正常启动；
- `node --test tests/*.test.mjs` 798 项通过。
