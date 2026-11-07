export const $ = selector => document.querySelector(selector);
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}
export const fold = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
export function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Chưa xác định';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(date);
}
function sourceDialog(project, plan) {
  $('#source-title').textContent = project.name;
  $('#source-path').textContent = plan ? project.checklist_source : project.source;
  $('#source-text').textContent = plan ? project.checklist_markdown : project.markdown;
  $('#source-dialog').showModal();
}
function taskNode(task, depth = 0) {
  const li = el('li', `task${task.done ? ' done' : ''}`);
  const children = Array.isArray(task.children) && depth < 15 ? task.children : [];
  const expandable = children.length || task.details?.length;
  const row = el(expandable ? 'summary' : 'div', expandable ? 'task-summary' : 'task-row');
  const check = el('span', `check${task.done ? ' done' : ''}`, task.done ? '✓' : '');
  check.setAttribute('role', 'img'); check.setAttribute('aria-label', task.done ? 'Đã hoàn thành' : 'Chưa hoàn thành');
  row.append(check, el('span', 'task-label', task.text));
  if (expandable) {
    const details = el('details');
    const arrow = el('span', 'task-arrow', '›'); arrow.setAttribute('aria-hidden', 'true'); row.append(arrow);
    details.append(row);
    if (task.details?.length) {
      const dl = el('dl', 'task-facts');
      for (const fact of task.details) dl.append(el('dt', '', fact.label), el('dd', '', fact.text));
      details.append(dl);
    }
    if (children.length) {
      const list = el('ul', 'task-list children');
      children.forEach(child => list.append(taskNode(child, depth + 1)));
      details.append(list);
    }
    li.append(details);
  } else li.append(row);
  return li;
}
export function projectNode(project, expanded, onToggle) {
  const card = el('details', `project${project.stale ? ' stale' : ''}`);
  card.dataset.id = project.id; card.open = expanded.has(project.id);
  card.addEventListener('toggle', () => onToggle(project.id, card.open));
  const summary = el('summary');
  const arrow = el('span', 'chevron', '›'); arrow.setAttribute('aria-hidden', 'true');
  const name = el('div', 'project-title');
  name.append(el('div', 'project-name', project.name));
  const meta = el('div', 'project-meta');
  meta.append(el('span', 'area-tag', project.area));
  if (project.source_updated_at) meta.append(el('span', '', `File sửa ${formatDate(project.source_updated_at)}`));
  name.append(meta);
  if (project.next) name.append(el('p', 'project-next', `Bước chưa xong tiếp theo: ${project.next}`));
  const progress = el('div', 'project-progress');
  if (project.total > 0) {
    const caption = el('div', 'progress-caption');
    caption.append(el('strong', '', `${project.done}/${project.total}`), document.createTextNode('bước hoàn thành'));
    const segments = el('div', 'segments');
    segments.setAttribute('role', 'progressbar');
    segments.setAttribute('aria-label', `${project.name}: ${project.done}/${project.total} bước`);
    segments.setAttribute('aria-valuemin', '0'); segments.setAttribute('aria-valuemax', String(project.total)); segments.setAttribute('aria-valuenow', String(project.done));
    const n = Math.min(project.total, 30), completed = Math.round(project.done / project.total * n);
    for (let i = 0; i < n; i++) segments.append(el('span', `segment${i < completed ? ' done' : ''}`));
    progress.append(caption, segments);
  } else progress.append(el('span', 'progress-empty', project.status === 'missing' ? 'Chưa có tiến độ' : 'Xem nội dung nguồn'));
  summary.append(arrow, name, progress);
  card.append(summary);
  const body = el('div', 'project-body');
  if (project.status === 'missing') {
    const p = el('p', 'missing-help', 'Chưa có file tiến độ trong dự án này. Tạo ');
    p.append(el('code', '', `${project.folder}/tien_do.md`), document.createTextNode(' và đánh dấu các bước bằng - [x] / - [ ]. Lượt quét sau sẽ tự nhận diện.'));
    body.append(p);
  } else {
    const sources = el('div', 'source-line');
    if (project.source) {
      const button = el('button', 'source-button', 'Xem file tiến độ'); button.type = 'button'; button.addEventListener('click', () => sourceDialog(project, false)); sources.append(button);
    }
    if (project.checklist_markdown) {
      const button = el('button', 'source-button', 'Xem plan dùng để đếm'); button.type = 'button'; button.addEventListener('click', () => sourceDialog(project, true)); sources.append(button);
    }
    sources.append(el('span', '', 'Chỉ đếm bước cấp ngoài cùng'));
    body.append(sources);
    if (project.note) body.append(el('p', 'project-note', project.note));
    for (const warning of project.warnings ?? []) body.append(el('p', 'notice', warning));
    let group = null, list;
    for (const task of project.tasks ?? []) {
      if (group !== task.group) {
        group = task.group;
        if (group) body.append(el('p', 'group-heading', group));
        list = el('ul', 'task-list'); body.append(list);
      }
      if (!list) { list = el('ul', 'task-list'); body.append(list); }
      list.append(taskNode(task));
    }
  }
  card.append(body);
  return card;
}
