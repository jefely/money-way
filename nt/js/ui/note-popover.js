// 界面：流水 / 查询 → 长备注
/**
 * 备注被截断时，点一下在格子旁展开全文。
 * 层：第五层 · UI
 */

let pop = null;

function ensure() {
  if (pop) return pop;
  pop = document.createElement('div');
  pop.className = 'nt-note-pop';
  pop.hidden = true;
  pop.setAttribute('role', 'tooltip');
  document.body.appendChild(pop);
  return pop;
}

function hide() {
  if (pop) pop.hidden = true;
}

function noteText(el) {
  if (!el) return '';
  if ('value' in el && String(el.value || '').trim()) return String(el.value);
  return String(el.textContent || '').trim();
}

function show(input) {
  const text = noteText(input);
  if (!text) { hide(); return; }
  const box = ensure();
  box.textContent = text;
  box.hidden = false;
  const r = input.getBoundingClientRect();
  const width = Math.min(280, Math.max(120, window.innerWidth - 16));
  box.style.width = width + 'px';
  box.style.transform = 'none';
  const pw = box.offsetWidth || width;
  const ph = box.offsetHeight || 32;
  let left = r.right - pw;
  left = Math.min(Math.max(8, left), Math.max(8, window.innerWidth - pw - 8));
  let top = r.top + (r.height / 2) - (ph / 2);
  top = Math.min(Math.max(8, top), Math.max(8, window.innerHeight - ph - 8));
  box.style.left = left + 'px';
  box.style.top = top + 'px';
}

export function bindNotePopover(root) {
  const host = root || document;
  host.addEventListener('pointerup', (ev) => {
    const input = ev.target && ev.target.closest ? ev.target.closest('[data-field="note"]') : null;
    if (!input) { hide(); return; }
    const text = noteText(input);
    const clipped = input.scrollWidth > input.clientWidth + 1;
    if (!text || (input.tagName === 'INPUT' && !clipped)) { hide(); return; }
    show(input);
  });
  host.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') hide();
  });
}
