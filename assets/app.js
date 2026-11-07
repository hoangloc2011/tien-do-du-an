import { importPassword, decryptData } from './crypto.js';
import { $, el, fold, formatDate, projectNode } from './render.js';

const isLocal = ['127.0.0.1', 'localhost'].includes(location.hostname);
const vaultUrl = new URL('../vault.json', import.meta.url);
const baseUrl = new URL('../', import.meta.url);
const state = { data: null, material: null, area: '', query: '', filter: 'ready', expanded: new Set(), generation: 0, lastActive: 0, busy: false };

async function readVault() {
  const response = await fetch(vaultUrl, { cache: 'no-store', credentials: 'omit' });
  if (!response.ok) throw new Error('Chưa tải được bản tiến độ. Hãy thử lại sau.');
  if (Number(response.headers.get('Content-Length')) > 50000000) throw new Error('Bản dữ liệu quá lớn.');
  return response.json();
}
function notice(text = '') { $('#notice').textContent = text; $('#notice').hidden = !text; }
function matches(project) {
  if (state.area && project.area !== state.area) return false;
  if (state.filter === 'ready' && !project.source) return false;
  if (state.filter === 'missing' && project.source) return false;
  if (state.filter === 'active' && !(project.total > 0 && project.done < project.total)) return false;
  if (state.filter === 'done' && !(project.total > 0 && project.done === project.total)) return false;
  if (state.query && !fold(`${project.name} ${project.area} ${project.folder} ${JSON.stringify(project.tasks)}`).includes(fold(state.query))) return false;
  return true;
}
function renderList() {
  if (!state.data) return;
  const rows = state.data.projects.filter(matches).sort((a,b) => Number(Boolean(b.source)) - Number(Boolean(a.source)) || a.name.localeCompare(b.name, 'vi'));
  $('#result-count').textContent = `${rows.length} dự án${state.area ? ` trong ${state.area}` : ''}`;
  $('#projects').replaceChildren(...rows.map(project => projectNode(project, state.expanded, (id, open) => { if (open) state.expanded.add(id); else state.expanded.delete(id); updateExpandText(); })));
  if (!rows.length) { const empty = el('div', 'empty-state'); empty.append(el('strong', '', 'Chưa có dự án phù hợp'), el('p', '', 'Thử từ khóa khác hoặc chọn “Tất cả dự án”.')); $('#projects').append(empty); }
  updateExpandText();
}
function updateExpandText() {
  const cards = [...document.querySelectorAll('.project')];
  $('#expand-all').textContent = cards.length && cards.every(card => card.open) ? 'Thu gọn tất cả' : 'Mở tất cả';
  $('#expand-all').disabled = !cards.length;
}
function render() {
  const projects = state.data.projects;
  const counts = { '': projects.length };
  projects.forEach(p => counts[p.area] = (counts[p.area] || 0) + 1);
  $('#areas').replaceChildren();
  for (const [area, count] of Object.entries(counts)) {
    const button = el('button', 'area-button'); button.type = 'button'; button.setAttribute('aria-pressed', String(state.area === area));
    button.append(el('span', 'area-symbol', area ? '▱' : '▦'), el('span', '', area || 'Tất cả lĩnh vực'), el('span', 'area-count', count));
    button.addEventListener('click', () => { state.area = area; render(); }); $('#areas').append(button);
  }
  $('#stat-total').textContent = projects.length;
  $('#stat-active').textContent = projects.filter(p => p.total > 0 && p.done < p.total).length;
  $('#stat-done').textContent = projects.filter(p => p.total > 0 && p.done === p.total).length;
  $('#stat-missing').textContent = projects.filter(p => !p.source).length;
  $('#updated-at').textContent = `Bản tổng hợp lúc ${formatDate(state.data.scanned_at)}`;
  $('#local-mode').textContent = isLocal ? 'Trên máy này · Quét hằng ngày lúc 08:00' : 'Mac tự đồng bộ hằng ngày';
  $('#refresh').textContent = isLocal ? '↻ Quét ngay' : '↻ Tải bản mới';
  renderList();
  if (Date.now() - new Date(state.data.scanned_at).getTime() > 48 * 3600000) notice('Bản tổng hợp đã hơn 2 ngày. Bật Mac và kết nối Internet để bộ quét gửi bản mới.');
}

function lock() {
  state.generation++; state.material = null; state.data = null; state.expanded.clear(); state.lastActive = 0; state.query = ''; state.area = '';
  $('#source-dialog').close(); $('#source-text').textContent = ''; $('#source-title').textContent = ''; $('#source-path').textContent = '';
  $('#projects').replaceChildren(); $('#areas').replaceChildren(); $('#search').value = ''; $('#password').value = ''; $('#password').type = 'password';
  for (const id of ['stat-total','stat-active','stat-done','stat-missing']) $('#'+id).textContent = '—';
  $('#updated-at').textContent = ''; $('#result-count').textContent = ''; notice();
  $('#show-password').textContent = 'Hiện'; $('#show-password').setAttribute('aria-pressed', 'false');
  $('#workspace').hidden = true; $('#lock-screen').hidden = false; $('#unlock-error').textContent = ''; $('#password').focus();
}

$('#unlock-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (state.busy) return;
  state.busy = true; const generation = ++state.generation;
  $('#unlock-button').disabled = true; $('#unlock-button').textContent = 'Đang mở…'; $('#unlock-error').textContent = '';
  try {
    const material = await importPassword($('#password').value);
    $('#password').value = '';
    const data = await decryptData(await readVault(), material);
    if (generation !== state.generation) return;
    state.data = data; state.material = material; state.lastActive = Date.now();
    $('#lock-screen').hidden = true; $('#workspace').hidden = false; notice(); render(); $('#search').focus();
  } catch (error) {
    if (generation !== state.generation) return;
    $('#unlock-error').textContent = error.name === 'OperationError' ? 'Mật khẩu chưa đúng hoặc bản dữ liệu đã bị thay đổi.' : (error.message || 'Chưa mở được dữ liệu. Hãy thử lại.');
    $('#password').focus();
  } finally { state.busy = false; $('#unlock-button').disabled = false; $('#unlock-button').textContent = 'Mở không gian dự án →'; }
});
$('#show-password').addEventListener('click', () => { const shown = $('#password').type === 'password'; $('#password').type = shown ? 'text' : 'password'; $('#show-password').textContent = shown ? 'Ẩn' : 'Hiện'; $('#show-password').setAttribute('aria-pressed', String(shown)); $('#show-password').setAttribute('aria-label', shown ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'); });
$('#lock-button').addEventListener('click', lock);
$('#search').addEventListener('input', event => { state.query = event.target.value; renderList(); });
$('#filter').addEventListener('change', event => { state.filter = event.target.value; renderList(); });
$('#expand-all').addEventListener('click', () => { const cards = [...document.querySelectorAll('.project')]; const open = !cards.every(card => card.open); cards.forEach(card => { card.open = open; if (open) state.expanded.add(card.dataset.id); else state.expanded.delete(card.dataset.id); }); updateExpandText(); });
$('#close-source').addEventListener('click', () => $('#source-dialog').close());
$('#source-dialog').addEventListener('close', () => { $('#source-text').textContent = ''; $('#source-title').textContent = ''; $('#source-path').textContent = ''; });

async function refresh(scanLocal = false) {
  if (state.busy || !state.material) return;
  const generation = state.generation;
  state.busy = true; $('#refresh').disabled = true; notice();
  try {
    if (scanLocal && isLocal) {
      const response = await fetch(new URL('api/scan', baseUrl), { method: 'POST', headers: { 'X-TienDo-Request': '1' }, credentials: 'same-origin' });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || 'Chưa quét được dữ liệu mới.');
    }
    const data = await decryptData(await readVault(), state.material);
    if (generation !== state.generation) return;
    state.data = data; render();
  } catch (error) { if (generation === state.generation) notice(error.name === 'OperationError' ? 'Mật khẩu của bản mới có thể đã thay đổi. Khóa lại và nhập mật khẩu mới.' : error.message); }
  finally { state.busy = false; $('#refresh').disabled = false; }
}
$('#refresh').addEventListener('click', () => refresh(true));
for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, () => { if (state.material) state.lastActive = Date.now(); }, { passive: true });
setInterval(() => { if (state.material && Date.now() - state.lastActive > 30 * 60 * 1000) lock(); }, 30000);
setInterval(() => { if (!document.hidden) refresh(); }, 5 * 60 * 1000);
window.addEventListener('pagehide', lock);
