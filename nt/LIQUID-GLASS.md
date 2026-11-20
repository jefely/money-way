# NT 账本液态玻璃折射设计

> 版本：nt-v1.569（2026-11-21）
> 参考：用户 2026-11 提供的液态玻璃教程视频（4:14）
> 实现：[`js/ui/liquid-glass.js`](js/ui/liquid-glass.js) · [`css/flow.css`](css/flow.css)
> 姊妹实现：[`TxtVein/js/ui/glass.js`](../../TxtVein/js/ui/glass.js)（**同一套内核，逐行同算法**）

## 1. 范围

只作用于右下角的悬浮输入窗 `.nt-composer`，不改页面其它 UI。

- 收起：54×54 圆钮；
- 展开：360×54 胶囊；
- 两个状态共用一张「胶囊」玻璃的两种贴图，不是两个控件；
- 玻璃是增强项：模块加载失败 / 浏览器不支持时，原悬浮窗照常工作。

## 2. 四层

与视频完全一致，也和 TxtVein 对齐：

| 层 | 做法 |
|---|---|
| ① 透明 | `rgba(255,255,255, var(--lg-a))`，深色主题乘 0.40 |
| ② 折射 | 高度场 → 法线 → Snell(n=1.5) → 归一化位移贴图 → `feDisplacementMap` |
| ③ 高光 | CSS 一整圈 conic 白环（`::after` + `mask`），最暗处保留 70%；光源角度可调 |
| ④ 阴影 | 外投影 `0 10px 24px` |

## 3. 算法（与 TxtVein 相同，改动理由见其文档 §2）

1. 高度场 `h(t) = sin(π/2·t)`，`t = 离边缘距离 / bevel`，**边缘最陡、中心为 0**；
2. 斜率 `h'(t)/bevel` → 入射角 `θ1 = atan(...)`；
3. Snell：`sinθ2 = sinθ1 / 1.5`，横向位移 `tan(θ1−θ2)`；
4. 整场除以最大值归一化 → `R/G = 128 ± 127·(v/max)`；
5. 贴图按元素尺寸 2× 超采样（长边上限 512），`bevel = 32% 短边`（可调 8–45%）。

> 旧版用 `4t(1-t)`，`t=0`（最外沿）为 0——最外圈不折射，留一圈硬边。
> 这是白边和阶梯感的来源，已替换。

### 滤镜

```text
feImage(位移贴图) → feDisplacementMap(scale, R→x, G→y) → feGaussianBlur(0.35)
```

高光不放滤镜里：对 `SourceGraphic` 做 specular 会把**背后的内容**一起点亮，
而参考效果的亮边是几何关系的边，交给 CSS 环更准。

### scale

`scale` 是用户空间像素，按元素短边换算：

```text
实际 scale = scale × min(宽,高) / 40      默认 scale = 8
```

54px 圆钮 → 10.8px；360×54 胶囊 → 10.8px（短边同为 54）。

## 4. 挂载

[`js/views/flow.js`](js/views/flow.js)：

```js
import('../ui/liquid-glass.js')
  .then((m) => m.installLiquidGlass(composer.bar))
  .catch(() => {});
```

动态 import + catch：模块取不到时只跳过玻璃，不让整条模块图加载失败。

## 5. 参数

**设置 → 布局 → 液态玻璃**（`?debug=1`）。

| 参数 | 默认 | 作用 |
|---|---|---|
| 不透明度 | 34% | 白色填充；深色主题再乘 0.40 |
| 折射强度 | 8 | 40px 元素上的最大位移像素 |
| 折射环宽度 | 32% | 边缘弯曲带占短边比例；改了重建贴图 |
| 高光 | 60% | 环的整体亮度 |
| 高光环宽度 | 1.2px | 0 = 只剩折射，没有边 |
| 高光环模糊 | 0.4px | 抗锯齿用；0 = 完全锐利但有台阶 |
| 光源角度 | 0° | 环最亮处的方位（0° 正上、顺时针） |
| 阴影 | 34% | 外投影浓度 |
| 背景模糊 | 1.5px | `backdrop-filter` 附加 blur，0 = 视频的纯透明折射 |

存 `localStorage.nt_glass_params`；滑块写 localStorage 并派发 `nt-glass-params`，
`liquid-glass.js` 监听后更新 CSS 变量与两张 `feDisplacementMap` 的 scale。

「视频参考值」：不透明度 35 / 折射 8 / 高光 60 / 阴影 30 / 模糊 1.5。

## 6. 视觉层

[`css/flow.css`](css/flow.css) `.nt-composer.liquid-glass`：

- 底色 `rgba(255,255,255,var(--lg-a))`，`--lg-a = alpha × 主题系数`；
- 环分两层：`box-shadow: inset 0 0 0 <ringWidth>` 给**形状**（合成器绘制，抗锯齿好），
  `::after` 的 conic 环给**方向性亮度**（opacity .55），`mask-composite: exclude`；
- 外投影两条；`border: 0`（玻璃自己就是边）。

输入框展开态仍有 1px 主题色内圈线（`.nt-composer-input`），那是输入框的焦点指示，
不是玻璃边——玻璃环在它外侧，两者相差 8px 内边距，视觉上分层。

## 7. 限制

- 这是 `backdrop-filter` 的屏幕空间折射，不是 3D 厚玻璃；
- 没有真实厚度/反射环境贴图；Snell 只用来定**位移的形状**，不追求物理一致；
- 环宽会吸附到整数物理像素（`round(ring × dpr) / dpr`），元素位置也会用 `translate` 吸附半格；
  否则 125% 缩放下 1.2 CSS px = 1.5 物理像素，线会被抗锯齿劈成两条灰线。

## 8. 验收

- 收起/展开都是同一 `.nt-composer`；
- 滑块拖动即时生效，刷新后保留；
- 模块缺失时应用仍能正常启动；
- `node --test tests/` 798 项通过。
