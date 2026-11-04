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

function show(input) {
  const box = ensure();
  box.textContent = input.value || '';
  const r = input.getBoundingClientRect();
  const width = Math.min(280, window.innerWidth - 16);
  const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8));
  box.style.width = width + 'px';
  box.style.transform = `translate(${left}px, ${r.bottom + 4}px)`;
  box.hidden = false;
}

export function bindNotePopover(root) {
  const host = root || document;
  host.addEventListener('pointerup', (ev) => {
    const input = ev.target && ev.target.closest ? ev.target.closest('[data-field="note"]') : null;
    if (!input) { hide(); return; }
    if (input.scrollWidth <= input.clientWidth + 1) { hide(); return; }
    show(input);
  });
  host.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') hide();
  });
}
