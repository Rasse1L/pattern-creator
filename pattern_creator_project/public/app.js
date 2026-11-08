const gridEl = document.getElementById('grid');
const sizeSelect = document.getElementById('gridSize');
const nicknameInput = document.getElementById('nickname');
const sendButton = document.getElementById('sendButton');
const statusEl = document.getElementById('status');
const cellCountEl = document.getElementById('cellCount');
const progressEl = document.getElementById('progress');
const gridLabel = document.getElementById('gridLabel');
const websiteInput = document.getElementById('website');
let size = 12;
let cells = Array(size * size).fill(0);
let activeTool = 1;
let drawing = false;
let lastPainted = -1;

for (let n = 12; n <= 64; n += 2) {
  const option = document.createElement('option'); option.value = n; option.textContent = `${n} × ${n}`; sizeSelect.append(option);
}
const savedNick = localStorage.getItem('patternCreatorNickname');
if (savedNick) nicknameInput.value = savedNick;
nicknameInput.addEventListener('input', () => localStorage.setItem('patternCreatorNickname', nicknameInput.value));

function updateStats() {
  const filled = cells.filter(v => v !== 0).length;
  cellCountEl.textContent = `${filled} ЗАПОЛНЕНО`;
  progressEl.textContent = `${Math.round(filled / cells.length * 100)}%`;
}
function renderGrid() {
  gridEl.innerHTML = '';
  gridEl.style.gridTemplateColumns = `repeat(${size}, minmax(0, 1fr))`;
  gridEl.setAttribute('aria-rowcount', size);
  gridEl.setAttribute('aria-colcount', size);
  const fragment = document.createDocumentFragment();
  cells.forEach((value, index) => {
    const cell = document.createElement('div');
    cell.className = `cell${value === 1 ? ' black' : value === 2 ? ' red' : ''}`;
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-label', `Строка ${Math.floor(index / size) + 1}, столбец ${index % size + 1}`);
    cell.dataset.index = index;
    fragment.append(cell);
  });
  gridEl.append(fragment);
  gridLabel.textContent = `${size} × ${size}`;
  updateStats();
}
function chooseTool(value) {
  activeTool = value;
  document.querySelectorAll('.tool').forEach(btn => {
    const selected = Number(btn.dataset.tool) === value;
    btn.classList.toggle('active', selected);
    btn.setAttribute('aria-pressed', String(selected));
  });
}
function paint(index) {
  if (index === lastPainted || index < 0 || index >= cells.length) return;
  lastPainted = index;
  if (cells[index] === activeTool) return;
  cells[index] = activeTool;
  const cell = gridEl.children[index];
  cell.classList.toggle('black', activeTool === 1);
  cell.classList.toggle('red', activeTool === 2);
  updateStats();
}
function cellFromPoint(x, y) {
  const element = document.elementFromPoint(x, y);
  const cell = element?.closest?.('.cell');
  return cell && gridEl.contains(cell) ? Number(cell.dataset.index) : -1;
}

document.querySelectorAll('.tool').forEach(btn => btn.addEventListener('click', () => chooseTool(Number(btn.dataset.tool))));
sizeSelect.addEventListener('change', () => {
  size = Number(sizeSelect.value);
  cells = Array(size * size).fill(0);
  renderGrid();
});
gridEl.addEventListener('pointerdown', event => {
  if (event.button !== undefined && event.button !== 0) return;
  event.preventDefault(); drawing = true; lastPainted = -1;
  gridEl.setPointerCapture?.(event.pointerId);
  paint(cellFromPoint(event.clientX, event.clientY));
});
gridEl.addEventListener('pointermove', event => {
  if (!drawing) return;
  event.preventDefault();
  paint(cellFromPoint(event.clientX, event.clientY));
});
function stopDrawing() { drawing = false; lastPainted = -1; }
gridEl.addEventListener('pointerup', stopDrawing);
gridEl.addEventListener('pointercancel', stopDrawing);
window.addEventListener('pointerup', stopDrawing);
document.getElementById('clearGrid').addEventListener('click', () => {
  cells.fill(0); renderGrid(); setStatus('Поле очищено. Можно рисовать новый узор.', '');
});
document.addEventListener('keydown', event => {
  if (event.target.matches('input,select,textarea')) return;
  if (['1','2','3'].includes(event.key)) chooseTool(Number(event.key) === 3 ? 0 : Number(event.key));
});
function setStatus(message, type) { statusEl.textContent = message; statusEl.className = `status${type ? ` ${type}` : ''}`; }
function makePng() {
  const scale = Math.max(8, Math.min(24, Math.floor(1536 / size)));
  const canvas = document.createElement('canvas');
  canvas.width = size * scale; canvas.height = size * scale;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  cells.forEach((value, index) => {
    if (!value) return;
    ctx.fillStyle = value === 1 ? '#171717' : '#ed493e';
    ctx.fillRect((index % size) * scale, Math.floor(index / size) * scale, scale, scale);
  });
  // Fine separators keep empty cells legible in the attached image.
  ctx.strokeStyle = '#dedbd5'; ctx.lineWidth = Math.max(1, scale / 16);
  for (let i = 0; i <= size; i++) {
    const p = i * scale;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, canvas.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(canvas.width, p); ctx.stroke();
  }
  return canvas.toDataURL('image/png');
}
sendButton.addEventListener('click', async () => {
  const nickname = nicknameInput.value.trim();
  if (!nickname) { setStatus('Сначала введи свой ник.', 'error'); nicknameInput.focus(); return; }
  if (!cells.some(v => v !== 0)) { setStatus('Нарисуй хотя бы одну клетку перед отправкой.', 'error'); return; }
  sendButton.disabled = true;
  sendButton.querySelector('span:first-child').textContent = 'Отправляем…';
  setStatus('Готовим изображение и отправляем его на почту…', '');
  try {
    const response = await fetch('/api/send-pattern', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, size, cells, image: makePng(), website: websiteInput.value })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Не удалось отправить узор.');
    localStorage.setItem('patternCreatorNickname', nickname);
    setStatus('Узор успешно отправлен! Можешь создать следующий.', 'success');
  } catch (error) {
    setStatus(error.message || 'Ошибка отправки. Попробуй ещё раз.', 'error');
  } finally {
    sendButton.disabled = false;
    sendButton.querySelector('span:first-child').textContent = 'Отправить узор';
  }
});
renderGrid();
