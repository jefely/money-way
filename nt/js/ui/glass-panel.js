// 界面：液态玻璃参数字段（设置 → 布局底部）
/** 独立成文件，避免 debug-panel.js 超过 300 行。 */
export function appendGlassSection(body, renderBody) {
/* 液态玻璃：直接改 localStorage，由 ui/liquid-glass.js 监听应用 */
const GLASS_KEY = 'nt_glass_params';
const GDEF = { opacity: 12, scale: 18, highlight: 55, shadow: 38, blur: 0 };
const gv = Object.assign({}, GDEF);
try {
  const raw = JSON.parse(localStorage.getItem(GLASS_KEY) || 'null');
  if (raw) for (const k of Object.keys(gv)) {
    const n = Number(raw[k]);
    if (Number.isFinite(n)) gv[k] = n;
  }
} catch (e) { /* ignore */ }
const gsec = document.createElement('section');
gsec.className = 'nt-debug-group';
const gh = document.createElement('h3');
gh.className = 'nt-debug-group-title';
gh.textContent = '液态玻璃';
const gb = document.createElement('span');
gb.className = 'nt-debug-file';
gb.textContent = 'js/ui/liquid-glass.js';
gh.appendChild(gb);
gsec.appendChild(gh);
const gdefs = [
  ['不透明度', 'opacity', 0, 40, 1, '%'],
  ['scale', 'scale', 0, 40, 1, ''],
  ['高光亮度', 'highlight', 0, 100, 1, '%'],
  ['阴影范围', 'shadow', 0, 100, 1, '%'],
  ['背景模糊', 'blur', 0, 20, 1, 'px'],
];
const gwrite = (patch) => {
  const next = Object.assign({}, gv, patch);
  Object.assign(gv, next);
  try { localStorage.setItem(GLASS_KEY, JSON.stringify(next)); } catch (e) { /* ignore */ }
  window.dispatchEvent(new CustomEvent('nt-glass-params'));
};
for (const [label, key, min, max, step, unit] of gdefs) {
  const row = document.createElement('div');
  row.className = 'nt-debug-row';
  const k = document.createElement('span');
  k.className = 'nt-debug-key';
  k.textContent = label;
  row.appendChild(k);
  const input = document.createElement('input');
  input.className = 'nt-debug-input nt-debug-range';
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(gv[key]);
  input.setAttribute('aria-label', label);
  const val = document.createElement('span');
  val.className = 'nt-debug-hint';
  val.textContent = String(gv[key]) + unit;
  input.addEventListener('input', () => {
    gwrite({ [key]: Number(input.value) });
    val.textContent = input.value + unit;
  });
  row.appendChild(input);
  row.appendChild(val);
  gsec.appendChild(row);
}
const presetRow = document.createElement('div');
presetRow.className = 'nt-debug-row';
const presetBtn = document.createElement('button');
presetBtn.type = 'button';
presetBtn.className = 'nt-btn nt-btn-sm';
presetBtn.textContent = '视频参考值';
presetBtn.addEventListener('click', () => {
  gwrite({ opacity: 20, scale: 12, highlight: 55, shadow: 75, blur: 0 });
  renderBody();
});
presetRow.appendChild(presetBtn);
gsec.appendChild(presetRow);
body.appendChild(gsec);
}
