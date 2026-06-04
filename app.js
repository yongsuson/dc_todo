// ── CONFIG ────────────────────────────────────────────
const API = 'http://localhost:8000/api';

// ── HELPERS ───────────────────────────────────────────
const DAYS = ['일','월','화','수','목','금','토'];
const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
const STATUS_KR = { todo: '할 일', wip: '진행 중', done: '완료' };

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;
}
function p2(n) { return String(n).padStart(2,'0'); }
function nowTime() {
  const d = new Date();
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
function fmtDateKR(s) {
  if (!s) return '';
  const [y,m,d] = s.split('-');
  const dt = new Date(+y, +m-1, +d);
  return `${y}년 ${+m}월 ${+d}일 (${DAYS[dt.getDay()]})`;
}

// ── API ───────────────────────────────────────────────
async function apiGet(path) {
  const r = await fetch(API + path);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function apiPost(path, body) {
  const r = await fetch(API + path, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function apiPut(path, body) {
  const r = await fetch(API + path, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function apiDelete(path) {
  const r = await fetch(API + path, { method:'DELETE' });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// ── STATE ─────────────────────────────────────────────
let calY, calM, calSel;
const now = new Date();
calY = now.getFullYear(); calM = now.getMonth(); calSel = todayStr();
let searchFilter = 'all';
let dragId = null;
let _allTodos = [];  // 캐시

// ── NAVIGATION ────────────────────────────────────────
const PAGES = { board: '보드', calendar: '캘린더', search: '검색 / 기록', contacts: '주소록', mail: '메일 포맷', sop: '업무 순서' };

function goPage(name) {
  document.querySelectorAll('.page-view').forEach(v => v.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  document.querySelectorAll('.nav-item').forEach((el,i) => {
    const keys = Object.keys(PAGES);
    el.classList.toggle('active', keys[i] === name);
  });
  document.getElementById('page-title').textContent = PAGES[name];
  if (name === 'board') renderBoard();
  if (name === 'calendar') renderCalendar();
  if (name === 'search') doSearch();
  if (name === 'contacts') renderContacts();
  if (name === 'mail') renderMailTemplates();
  if (name === 'sop') renderProcedures();
}

function focusQuickAdd() {
  goPage('board');
  setTimeout(() => document.getElementById('qa-text')?.focus(), 80);
}

// ── SETTINGS (localStorage) ───────────────────────────
const SETTINGS_KEY = 'dc_todo_settings';

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; }
}

function getConfig() {
  const s = loadSettings();
  return {
    title:    s.title    || '할 일을 관리해보세요',
    joinDate: s.joinDate || '',
    payday:   s.payday   != null ? Number(s.payday) : 25,
  };
}

function openSettings() {
  const c = getConfig();
  document.getElementById('cfg-title').value     = c.title;
  document.getElementById('cfg-join-date').value = c.joinDate;
  document.getElementById('cfg-payday').value    = c.payday;
  document.getElementById('settings-modal').classList.add('open');
  setTimeout(() => document.getElementById('cfg-title').focus(), 80);
}

function closeSettings(e) {
  if (e && e.target !== document.getElementById('settings-modal')) return;
  document.getElementById('settings-modal').classList.remove('open');
}

function saveSettings() {
  const title    = document.getElementById('cfg-title').value.trim();
  const joinDate = document.getElementById('cfg-join-date').value;
  const payday   = parseInt(document.getElementById('cfg-payday').value) || 25;
  if (payday < 1 || payday > 31) { showToast('월급일은 1~31 사이로 입력해주세요'); return; }
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ title, joinDate, payday }));
  document.getElementById('settings-modal').classList.remove('open');
  applyTitle();
  updateSidebar();
  showToast('✅ 설정이 저장됐어요');
}

function applyTitle() {
  const { title } = getConfig();
  document.getElementById('logo-title').textContent = title;
}

function editLogoTitle() {
  openSettings();
  setTimeout(() => document.getElementById('cfg-title').select(), 120);
}

// ── SIDEBAR INFO ──────────────────────────────────────
function updateSidebar() {
  const d = new Date();
  document.getElementById('sb-date').textContent =
    `${d.getFullYear()}.${p2(d.getMonth()+1)}.${p2(d.getDate())} ${DAYS[d.getDay()]}`;

  const { joinDate, payday } = getConfig();
  const today = new Date(); today.setHours(0,0,0,0);

  // 입사 D+day
  if (joinDate) {
    const start = new Date(joinDate); start.setHours(0,0,0,0);
    const dday = Math.floor((today - start) / (1000*60*60*24));
    document.getElementById('sb-dday').innerHTML =
      `<span class="dday-num">D+${dday}</span>입사 ${dday}일째`;
    document.getElementById('sb-dday').style.display = '';
  } else {
    document.getElementById('sb-dday').style.display = 'none';
  }

  // 월급 D-day
  let next = new Date(today.getFullYear(), today.getMonth(), payday);
  if (next <= today) next = new Date(today.getFullYear(), today.getMonth()+1, payday);
  const daysLeft = Math.ceil((next - today) / (1000*60*60*24));
  document.getElementById('sb-payday').innerHTML =
    `<span class="dday-num" style="color:#e06baf">D-${daysLeft}</span>다음 월급까지 (${payday}일)`;

  const todos = _allTodos;
  const done = todos.filter(t => t.status === 'done').length;
  const total = todos.length;
  document.getElementById('sb-stats').innerHTML =
    `전체 ${total}개 · 완료 ${done}개`;
}

// ── QUICK ADD ────────────────────────────────────────
document.getElementById('qa-date').value = todayStr();

document.getElementById('qa-text').addEventListener('keydown', e => {
  if (e.key === 'Enter') addTodo();
});

async function addTodo() {
  const textEl = document.getElementById('qa-text');
  const dateEl = document.getElementById('qa-date');
  const timeEl = document.getElementById('qa-time');
  const text = textEl.value.trim();
  if (!text) { textEl.focus(); return; }
  try {
    await apiPost('/todos', {
      text,
      date: dateEl.value || todayStr(),
      time: timeEl.value || nowTime(),
      status: 'todo',
      priority: 'medium'
    });
    textEl.value = '';
    await renderBoard();
    textEl.focus();   // renderBoard 완료 후 포커스 복원
    showToast('할 일이 추가되었어요');
  } catch(e) { showToast('저장 실패: ' + e.message); }
}

// ── BOARD RENDER ──────────────────────────────────────
async function renderBoard() {
  // 포커스된 요소 기억
  const focused = document.activeElement;
  const focusedId = focused?.dataset?.id;

  try {
    _allTodos = await apiGet('/todos');
  } catch(e) {
    showToast('서버 연결 실패. server.py를 실행해주세요.');
    return;
  }
  const today = todayStr();
  const todos = _allTodos;
  const groups = { todo: [], wip: [], done: [] };
  todos.forEach(t => {
    if (!groups[t.status]) return;
    // 완료 항목은 오늘 완료된 것만 보드에 표시
    if (t.status === 'done' && t.date !== today) return;
    groups[t.status].push(t);
  });

  ['todo','wip','done'].forEach(status => {
    const zone = document.getElementById('zone-'+status);
    // 기존 카드 ID 목록
    const existingIds = new Set([...zone.querySelectorAll('.card')].map(el => el.dataset.id));
    const newIds = new Set(groups[status].map(t => t.id));

    // 삭제된 카드 제거
    zone.querySelectorAll('.card').forEach(el => {
      if (!newIds.has(el.dataset.id)) el.remove();
    });

    document.getElementById('cnt-'+status).textContent = groups[status].length;

    if (groups[status].length === 0) {
      if (!zone.querySelector('.col-empty')) {
        zone.innerHTML = '';
        const emp = document.createElement('div');
        emp.className = 'col-empty';
        const icons = { todo: 'ti-playlist-add', wip: 'ti-loader', done: 'ti-circle-check' };
        const msgs = { todo: '할 일을 추가해보세요', wip: '진행 중인 일이 없어요', done: '완료된 일이 없어요' };
        emp.innerHTML = `<i class="ti ${icons[status]}"></i>${msgs[status]}`;
        zone.appendChild(emp);
      }
    } else {
      // 빈 상태 제거
      zone.querySelector('.col-empty')?.remove();
      // 새 카드 추가 (이미 있는 건 스킵)
      groups[status].forEach((t, i) => {
        const existing = zone.querySelector(`.card[data-id="${t.id}"]`);
        if (!existing) {
          const card = makeCard(t);
          // 순서대로 삽입
          const cards = zone.querySelectorAll('.card');
          if (cards[i]) zone.insertBefore(card, cards[i]);
          else zone.appendChild(card);
        } else {
          // 텍스트만 업데이트 (인라인 편집 중 아닐 때)
          const textEl = existing.querySelector('.card-text');
          if (textEl && !textEl.querySelector('input')) {
            textEl.textContent = t.text;
          }
        }
      });
    }
  });

  renderStats(todos);
  updateSidebar();


}

function makeCard(todo) {
  const div = document.createElement('div');
  div.className = 'card';
  div.draggable = true;
  div.dataset.id = todo.id;

  div.addEventListener('dragstart', e => {
    dragId = todo.id;
    div.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', todo.id);
  });
  div.addEventListener('dragend', () => {
    div.classList.remove('dragging');
    document.querySelectorAll('.drop-zone').forEach(z => z.classList.remove('drag-over'));
  });

  div.innerHTML = `
    <div class="card-top">
      <i class="ti ti-grip-vertical card-drag-handle" aria-hidden="true"></i>
      <span class="card-text">${escHtml(todo.text)}</span>
      <div class="card-actions">
        <button class="card-btn" title="수정" onclick="editCard('${todo.id}')"><i class="ti ti-pencil"></i></button>
        <button class="card-btn del" title="삭제" onclick="deleteCard('${todo.id}')"><i class="ti ti-trash"></i></button>
      </div>
    </div>
    <div class="card-meta">
      ${todo.date ? `<span class="meta-pill"><i class="ti ti-calendar" style="font-size:12px"></i>${fmtDateKR(todo.date)}</span>` : ''}
      ${todo.time ? `<span class="meta-pill"><i class="ti ti-clock" style="font-size:12px"></i>${todo.time}</span>` : ''}
    </div>
  `;

  return div;
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── DRAG & DROP ───────────────────────────────────────
function onDragOver(e, status) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.drop-zone').forEach(z => z.classList.remove('drag-over'));
  document.getElementById('zone-'+status).classList.add('drag-over');
}

function onDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) {
    e.currentTarget.classList.remove('drag-over');
  }
}

async function onDrop(e, newStatus) {
  e.preventDefault();
  document.querySelectorAll('.drop-zone').forEach(z => z.classList.remove('drag-over'));
  const id = e.dataTransfer.getData('text/plain') || dragId;
  if (!id) return;
  const t = _allTodos.find(x => x.id === id);
  if (!t || t.status === newStatus) return;
  try {
    const body = { status: newStatus };
    if (newStatus === 'done') body.done_at = nowTime();
    await apiPut('/todos/' + id, body);
    await renderBoard();
    showToast(`"${t.text.slice(0,18)}${t.text.length>18?'…':''}" → ${STATUS_KR[newStatus]}`);
  } catch(e) { showToast('저장 실패: ' + e.message); }
}

// ── CARD EDIT / DELETE ────────────────────────────────
function editCard(id) {
  const t = _allTodos.find(x => x.id === id);
  if (!t) return;
  document.getElementById('todo-edit-id').value = id;
  const ta = document.getElementById('todo-edit-text');
  ta.value = t.text;
  document.getElementById('todo-edit-modal').classList.add('open');
  setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 80);
}

function closeTodoEditModal(e) {
  if (e && e.target !== document.getElementById('todo-edit-modal')) return;
  document.getElementById('todo-edit-modal').classList.remove('open');
}

async function saveTodoEdit() {
  const id = document.getElementById('todo-edit-id').value;
  const val = document.getElementById('todo-edit-text').value.trim();
  const t = _allTodos.find(x => x.id === id);
  if (!val) { document.getElementById('todo-edit-text').focus(); return; }
  if (val === t?.text) { document.getElementById('todo-edit-modal').classList.remove('open'); return; }
  try {
    await apiPut('/todos/' + id, { text: val });
    document.getElementById('todo-edit-modal').classList.remove('open');
    await renderBoard();
    showToast('✅ 수정 완료됐어요');
  } catch(e) { showToast('저장 실패: ' + e.message); }
}

async function deleteCard(id) {
  try {
    await apiDelete('/todos/' + id);
    await renderBoard();
    showToast('삭제되었어요');
  } catch(e) { showToast('삭제 실패: ' + e.message); }
}

// ── STATS ─────────────────────────────────────────────
function renderStats(todos) {
  const total = todos.length;
  const done = todos.filter(t => t.status === 'done').length;
  const wip = todos.filter(t => t.status === 'wip').length;
  const pct = total ? Math.round(done/total*100) : 0;

  const todayTodos = todos.filter(t => t.date === todayStr());
  const todayTotal = todayTodos.length;
  const todayDone = todayTodos.filter(t => t.status === 'done').length;
  const todayPct = todayTotal ? Math.round(todayDone/todayTotal*100) : 0;

  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card">
      <div class="stat-num" style="color:var(--ink)">${total}</div>
      <div class="stat-lbl">전체 할 일</div>
    </div>
    <div class="stat-card">
      <div class="stat-num" style="color:#7b93f5">${todos.filter(t=>t.status==='todo').length}</div>
      <div class="stat-lbl">할 일</div>
    </div>
    <div class="stat-card">
      <div class="stat-num" style="color:#f0b429">${wip}</div>
      <div class="stat-lbl">진행 중</div>
    </div>
    <div class="stat-card">
      <div class="stat-num" style="color:#3dba74">${done}</div>
      <div class="stat-lbl">완료 · ${pct}%</div>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" style="width:${pct}%"></div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-num" style="color:#e06baf">${todayDone}<span style="font-size:14px;font-weight:400;color:var(--ink3)"> / ${todayTotal}</span></div>
      <div class="stat-lbl">오늘 완료 · ${todayPct}%</div>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" style="width:${todayPct}%;background:#e06baf"></div>
      </div>
    </div>
  `;
}

// ── CALENDAR ──────────────────────────────────────────
const CAL_DAYS = ['일','월','화','수','목','금','토'];

// 공휴일 + 대체공휴일 전체 목록 (2024~2030)
const HOLIDAYS = {
  // ── 2024 ──
  '2024-01-01':'신정',
  '2024-02-09':'설날 연휴', '2024-02-10':'설날', '2024-02-11':'설날 연휴', '2024-02-12':'대체공휴일',
  '2024-03-01':'삼일절',
  '2024-04-10':'국회의원선거',
  '2024-05-05':'어린이날', '2024-05-06':'대체공휴일',
  '2024-05-15':'부처님오신날',
  '2024-06-06':'현충일',
  '2024-08-15':'광복절',
  '2024-09-16':'추석 연휴', '2024-09-17':'추석', '2024-09-18':'추석 연휴',
  '2024-10-03':'개천절',
  '2024-10-09':'한글날',
  '2024-12-25':'크리스마스',
  // ── 2025 ──
  '2025-01-01':'신정',
  '2025-01-28':'설날 연휴', '2025-01-29':'설날', '2025-01-30':'설날 연휴',
  '2025-03-01':'삼일절', '2025-03-03':'대체공휴일',
  '2025-05-05':'어린이날·부처님오신날', '2025-05-06':'대체공휴일',
  '2025-06-06':'현충일',
  '2025-08-15':'광복절',
  '2025-10-03':'개천절',
  '2025-10-05':'추석 연휴', '2025-10-06':'추석', '2025-10-07':'추석 연휴', '2025-10-08':'대체공휴일',
  '2025-10-09':'한글날',
  '2025-12-25':'크리스마스',
  // ── 2026 ──
  '2026-01-01':'신정',
  '2026-02-16':'설날 연휴', '2026-02-17':'설날', '2026-02-18':'설날 연휴',
  '2026-03-01':'삼일절', '2026-03-02':'대체공휴일',
  '2026-05-05':'어린이날',
  '2026-05-24':'부처님오신날', '2026-05-25':'대체공휴일',
  '2026-06-06':'현충일', '2026-06-08':'대체공휴일',
  '2026-08-15':'광복절', '2026-08-17':'대체공휴일',
  '2026-09-24':'추석 연휴', '2026-09-25':'추석', '2026-09-26':'추석 연휴', '2026-09-28':'대체공휴일',
  '2026-10-03':'개천절', '2026-10-05':'대체공휴일',
  '2026-10-09':'한글날',
  '2026-12-25':'크리스마스',
  // ── 2027 ──
  '2027-01-01':'신정',
  '2027-02-06':'설날 연휴', '2027-02-07':'설날', '2027-02-08':'설날 연휴', '2027-02-09':'대체공휴일', '2027-02-10':'대체공휴일',
  '2027-03-01':'삼일절',
  '2027-05-05':'어린이날',
  '2027-05-13':'부처님오신날',
  '2027-06-06':'현충일', '2027-06-07':'대체공휴일',
  '2027-08-15':'광복절', '2027-08-16':'대체공휴일',
  '2027-09-14':'추석 연휴', '2027-09-15':'추석', '2027-09-16':'추석 연휴',
  '2027-10-03':'개천절', '2027-10-04':'대체공휴일',
  '2027-10-09':'한글날', '2027-10-11':'대체공휴일',
  '2027-12-25':'크리스마스', '2027-12-27':'대체공휴일',
  // ── 2028 ──
  '2028-01-01':'신정',
  '2028-01-26':'설날 연휴', '2028-01-27':'설날', '2028-01-28':'설날 연휴',
  '2028-03-01':'삼일절',
  '2028-05-02':'부처님오신날',
  '2028-05-05':'어린이날',
  '2028-06-06':'현충일',
  '2028-08-15':'광복절',
  '2028-10-02':'추석 연휴', '2028-10-03':'추석·개천절', '2028-10-04':'추석 연휴', '2028-10-05':'대체공휴일',
  '2028-10-09':'한글날',
  '2028-12-25':'크리스마스',
  // ── 2029 ──
  '2029-01-01':'신정',
  '2029-02-12':'설날 연휴', '2029-02-13':'설날', '2029-02-14':'설날 연휴',
  '2029-03-01':'삼일절',
  '2029-05-05':'어린이날',
  '2029-05-20':'부처님오신날',
  '2029-06-06':'현충일',
  '2029-08-15':'광복절',
  '2029-09-21':'추석 연휴', '2029-09-22':'추석', '2029-09-23':'추석 연휴',
  '2029-10-03':'개천절',
  '2029-10-09':'한글날',
  '2029-12-25':'크리스마스',
  // ── 2030 ──
  '2030-01-01':'신정',
  '2030-02-02':'설날 연휴', '2030-02-03':'설날', '2030-02-04':'설날 연휴',
  '2030-03-01':'삼일절',
  '2030-05-05':'어린이날',
  '2030-05-09':'부처님오신날',
  '2030-06-06':'현충일',
  '2030-08-15':'광복절',
  '2030-09-11':'추석 연휴', '2030-09-12':'추석', '2030-09-13':'추석 연휴',
  '2030-10-03':'개천절',
  '2030-10-09':'한글날',
  '2030-12-25':'크리스마스',
};

function isHoliday(dateStr) {
  return dateStr in HOLIDAYS;
}

function getHolidayName(dateStr) {
  return HOLIDAYS[dateStr] || null;
}

document.getElementById('cal-dh').innerHTML =
  CAL_DAYS.map((d, i) => {
    const color = i === 0 ? 'color:#e53e3e' : i === 6 ? 'color:#3b82f6' : 'color:var(--ink3)';
    return `<div class="cal-dh" style="border-right:1px solid var(--border);border-bottom:1px solid var(--border);padding:6px 0;text-align:center;font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.06em;${color};background:var(--surface2)">${d}</div>`;
  }).join('');

async function renderCalendar() {
  const label = document.getElementById('cal-label');
  label.textContent = `${calY}년 ${MONTHS[calM]}`;

  let todos;
  try {
    todos = await apiGet('/todos');
    _allTodos = todos;
  } catch(e) { todos = _allTodos; }
  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  const today = todayStr();
  const first = new Date(calY, calM, 1).getDay();
  const daysInM = new Date(calY, calM+1, 0).getDate();
  const prevDays = new Date(calY, calM, 0).getDate();

  for (let i = 0; i < first; i++) {
    const cell = document.createElement('div');
    cell.className = 'cal-cell other-month';
    cell.textContent = prevDays - first + 1 + i;
    grid.appendChild(cell);
  }

  for (let d = 1; d <= daysInM; d++) {
    const ds = `${calY}-${p2(calM+1)}-${p2(d)}`;
    const dow = new Date(calY, calM, d).getDay(); // 0=일, 6=토
    const dayTodos = todos.filter(t => t.date === ds)
      .sort((a,b) => (a.time||'').localeCompare(b.time||''));
    let cls = 'cal-cell';
    if (ds === today) cls += ' today';
    if (ds === calSel) cls += ' selected';

    const holidayName = getHolidayName(ds);
    const red = dow === 0 || !!holidayName;
    const blue = dow === 6 && !holidayName;
    const dayNumStyle = red ? 'color:#e53e3e' : blue ? 'color:#3b82f6' : '';

    const MAX_SHOW = 3;
    const chips = dayTodos.slice(0, MAX_SHOW)
      .map(t => `<div class="cal-todo-chip ${t.status}">${t.text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>`).join('');
    const more = dayTodos.length > MAX_SHOW
      ? `<div class="cal-more">+${dayTodos.length - MAX_SHOW}개 더</div>` : '';

    const cell = document.createElement('div');
    cell.className = cls;
    if (holidayName) cell.title = holidayName;
    cell.innerHTML = `
      <div class="cal-day-num" style="${dayNumStyle}">${d}</div>
      ${holidayName ? `<div class="cal-holiday-name">${holidayName}</div>` : ''}
      <div class="cal-todo-chips">${chips}</div>
      ${more}
    `;
    cell.onclick = () => { calSel = ds; openCalDayModal(ds); };
    grid.appendChild(cell);
  }

  renderCalDetail();
}

function renderCalDetail() {
  const detail = document.getElementById('cal-detail');
  const todos = _allTodos.filter(t => t.date === calSel);
  const sorted = [...todos].sort((a,b) => (a.time||'').localeCompare(b.time||''));

  detail.innerHTML = `
    <div class="cal-detail-header">
      <div class="cal-detail-title">${fmtDateKR(calSel)}</div>
      <span style="font-size:12px;color:var(--ink3)">${sorted.length}개</span>
    </div>
    <div class="cal-quick-add">
      <i class="ti ti-plus" style="color:var(--ink3);font-size:15px;flex-shrink:0"></i>
      <input type="text" id="cal-qa-text" placeholder="이 날에 할 일 추가..." autocomplete="off">
      <input type="time" id="cal-qa-time">
      <button class="btn-primary" style="height:30px;font-size:12px;padding:0 12px" onclick="addTodoCal()">
        <i class="ti ti-plus"></i> 추가
      </button>
    </div>
  `;

  document.getElementById('cal-qa-text').addEventListener('keydown', e => {
    if (e.key === 'Enter') addTodoCal();
  });

  const list = document.createElement('div');
  list.className = 'cal-detail-list';
  list.style.marginTop = '10px';

  if (sorted.length === 0) {
    list.innerHTML = `<div class="empty-full" style="padding:1rem 0"><i class="ti ti-calendar-off" style="font-size:24px;opacity:0.3;display:block;margin-bottom:6px"></i><p>이 날은 할 일이 없어요</p></div>`;
  } else {
    sorted.forEach(t => {
      const item = document.createElement('div');
      item.className = 'cal-detail-item';
      item.innerHTML = `
        <span class="status-dot ${t.status}"></span>
        <span class="cal-detail-text">${escHtml(t.text)}</span>
        <span class="status-badge ${t.status}">${STATUS_KR[t.status]}</span>
        ${t.time ? `<span style="font-family:'DM Mono',monospace;font-size:11px;color:var(--ink3)">${t.time}</span>` : ''}
        <button onclick="deleteCalItem('${t.id}')" style="margin-left:4px;border:none;background:transparent;cursor:pointer;color:var(--ink3);font-size:13px;padding:2px 4px;border-radius:4px;line-height:1" title="삭제"><i class="ti ti-trash"></i></button>
      `;
      list.appendChild(item);
    });
  }
  detail.appendChild(list);
}

async function addTodoCal() {
  const textEl = document.getElementById('cal-qa-text');
  const timeEl = document.getElementById('cal-qa-time');
  const text = textEl.value.trim();
  if (!text) { textEl.focus(); return; }
  try {
    await apiPost('/todos', {
      text,
      date: calSel,
      time: timeEl.value || nowTime(),
      status: 'todo',
      priority: 'medium'
    });
    await renderCalendar();
    showToast('할 일이 추가되었어요');
  } catch(e) { showToast('저장 실패: ' + e.message); }
}

async function deleteCalItem(id) {
  try {
    await apiDelete('/todos/' + id);
    await renderCalendar();
    showToast('삭제되었어요');
  } catch(e) { showToast('삭제 실패: ' + e.message); }
}

// ── 캘린더 날짜 상세 모달 ─────────────────────────────
function openCalDayModal(ds) {
  calSel = ds;
  const todos = _allTodos.filter(t => t.date === ds)
    .sort((a,b) => (a.time||'').localeCompare(b.time||''));
  const holidayName = getHolidayName(ds);

  document.getElementById('cal-day-modal-title').textContent = fmtDateKR(ds);
  document.getElementById('cal-day-modal-holiday').textContent = holidayName || '';
  document.getElementById('cal-day-modal-count').textContent = `${todos.length}개`;
  document.getElementById('cal-modal-qa-text').value = '';
  document.getElementById('cal-modal-qa-time').value = '';

  renderCalDayModalList(todos);
  document.getElementById('cal-day-modal').classList.add('open');
  setTimeout(() => document.getElementById('cal-modal-qa-text').focus(), 80);
}

function renderCalDayModalList(todos) {
  const list = document.getElementById('cal-day-modal-list');
  if (todos.length === 0) {
    list.innerHTML = `<div class="empty-full" style="padding:1.5rem 0">
      <i class="ti ti-calendar-off" style="font-size:28px;opacity:0.25;display:block;margin-bottom:8px"></i>
      <p>이 날은 할 일이 없어요</p>
    </div>`;
    return;
  }
  list.innerHTML = '';
  todos.forEach(t => {
    const item = document.createElement('div');
    item.className = 'cal-detail-item';
    item.innerHTML = `
      <span class="status-dot ${t.status}"></span>
      <span class="cal-detail-text">${escHtml(t.text)}</span>
      <span class="status-badge ${t.status}">${STATUS_KR[t.status]}</span>
      ${t.time ? `<span style="font-family:'DM Mono',monospace;font-size:11px;color:var(--ink3);flex-shrink:0">${t.time}</span>` : ''}
      <button onclick="deleteCalModalItem('${t.id}')"
        style="margin-left:4px;border:none;background:transparent;cursor:pointer;color:var(--ink3);font-size:13px;padding:2px 4px;border-radius:4px;line-height:1;flex-shrink:0"
        title="삭제"><i class="ti ti-trash"></i></button>
    `;
    list.appendChild(item);
  });
}

function closeCalDayModal(e) {
  if (e && e.target !== document.getElementById('cal-day-modal')) return;
  document.getElementById('cal-day-modal').classList.remove('open');
  renderCalendar();
}

async function addTodoCalModal() {
  const textEl = document.getElementById('cal-modal-qa-text');
  const timeEl = document.getElementById('cal-modal-qa-time');
  const text = textEl.value.trim();
  if (!text) { textEl.focus(); return; }
  try {
    await apiPost('/todos', {
      text,
      date: calSel,
      time: timeEl.value || nowTime(),
      status: 'todo',
      priority: 'medium'
    });
    textEl.value = '';
    timeEl.value = '';
    // 목록 새로고침 (모달 유지)
    _allTodos = await apiGet('/todos');
    const todos = _allTodos.filter(t => t.date === calSel)
      .sort((a,b) => (a.time||'').localeCompare(b.time||''));
    document.getElementById('cal-day-modal-count').textContent = `${todos.length}개`;
    renderCalDayModalList(todos);
    textEl.focus();
    showToast('할 일이 추가됐어요');
  } catch(e) { showToast('저장 실패: ' + e.message); }
}

async function deleteCalModalItem(id) {
  try {
    await apiDelete('/todos/' + id);
    _allTodos = await apiGet('/todos');
    const todos = _allTodos.filter(t => t.date === calSel)
      .sort((a,b) => (a.time||'').localeCompare(b.time||''));
    document.getElementById('cal-day-modal-count').textContent = `${todos.length}개`;
    renderCalDayModalList(todos);
    showToast('삭제됐어요');
  } catch(e) { showToast('삭제 실패: ' + e.message); }
}

// 모달에서도 Enter 추가 지원
document.getElementById('cal-modal-qa-text').addEventListener('keydown', e => {
  if (e.key === 'Enter') addTodoCalModal();
});

function calMove(dir) {
  calM += dir;
  if (calM < 0) { calM = 11; calY--; }
  if (calM > 11) { calM = 0; calY++; }
  renderCalendar();
}

function calNow() {
  const n = new Date();
  calY = n.getFullYear(); calM = n.getMonth(); calSel = todayStr();
  renderCalendar();
}

// ── SEARCH ────────────────────────────────────────────
function setFilter(f) {
  searchFilter = f;
  document.querySelectorAll('.filter-chip').forEach(el => {
    el.classList.toggle('active', el.dataset.filter === f);
  });
  doSearch();
}

async function doSearch() {
  const q = (document.getElementById('s-input')?.value || '').trim().toLowerCase();
  const out = document.getElementById('search-out');

  // 검색어도 없고 필터도 전체면 빈 안내만 표시
  if (!q && searchFilter === 'all') {
    out.innerHTML = `<div class="empty-full"><i class="ti ti-search" style="font-size:36px;display:block;margin-bottom:10px;opacity:0.2"></i><p style="font-size:13px;color:var(--ink3)">검색어를 입력하면 결과가 표시됩니다</p></div>`;
    return;
  }

  let qs = '';
  if (q) qs += '?q=' + encodeURIComponent(q);
  if (searchFilter !== 'all') qs += (qs ? '&' : '?') + 'status=' + searchFilter;

  let todos;
  try {
    todos = await apiGet('/todos' + qs);
  } catch(e) {
    todos = _allTodos.filter(t => {
      if (searchFilter !== 'all' && t.status !== searchFilter) return false;
      if (!q) return true;
      return t.text.toLowerCase().includes(q) || (t.date||'').includes(q) || (t.time||'').includes(q);
    });
  }

  todos.sort((a,b) => b.created_at - a.created_at);

  out.innerHTML = '';

  if (todos.length === 0) {
    out.innerHTML = `<div class="empty-full"><i class="ti ti-search-off"></i><p>${q ? `"${q}"에 대한 결과가 없어요` : '해당 상태의 할 일이 없어요'}</p></div>`;
    return;
  }

  // group by date
  const byDate = {};
  todos.forEach(t => {
    const k = t.date || 'no-date';
    if (!byDate[k]) byDate[k] = [];
    byDate[k].push(t);
  });

  const sortedDates = Object.keys(byDate).sort((a,b) => b.localeCompare(a));

  sortedDates.forEach(date => {
    const group = document.createElement('div');
    group.className = 'search-result-group';

    const lbl = document.createElement('div');
    lbl.className = 'result-group-label';
    lbl.textContent = date === 'no-date' ? '날짜 없음' : fmtDateKR(date);
    group.appendChild(lbl);

    byDate[date].sort((a,b) => (a.time||'').localeCompare(b.time||'')).forEach(t => {
      const card = document.createElement('div');
      card.className = 'result-card';

      const hi = q ? t.text.replace(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi'), '<mark>$1</mark>') : escHtml(t.text);

      card.innerHTML = `
        <div class="result-card-top">
          <span class="status-dot ${t.status}"></span>
          <span class="result-text">${hi}</span>
          <span class="status-badge ${t.status}">${STATUS_KR[t.status]}</span>
        </div>
        <div class="result-meta">
          ${t.time ? `<span><i class="ti ti-clock" style="font-size:12px;vertical-align:-1px"></i> ${t.time}</span>` : ''}
          ${t.doneAt ? `<span><i class="ti ti-check" style="font-size:12px;vertical-align:-1px"></i> ${t.doneAt} 완료</span>` : ''}
          <span style="margin-left:auto;cursor:pointer;color:var(--ink3)" onclick="apiDelete('/todos/${t.id}').then(()=>doSearch())"><i class="ti ti-trash" style="font-size:13px"></i></span>
        </div>
      `;
      group.appendChild(card);
    });

    out.appendChild(group);
  });

  const total = document.createElement('div');
  total.style.cssText = 'font-size:12px;color:var(--ink3);margin-top:0.5rem;text-align:right;font-family:DM Mono,monospace';
  total.textContent = `총 ${todos.length}개`;
  out.appendChild(total);
}

// ── TOAST ─────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ── CONTACTS ──────────────────────────────────────────
let _allContacts = [];

async function renderContacts() {
  const q = (document.getElementById('ct-search')?.value || '').trim();
  let qs = q ? '?q=' + encodeURIComponent(q) : '';
  try {
    _allContacts = await apiGet('/contacts' + qs);
  } catch(e) {
    showToast('서버 연결 실패');
    return;
  }

  const grid = document.getElementById('contacts-grid');
  if (_allContacts.length === 0) {
    grid.innerHTML = `<div class="empty-full" style="margin-top:3rem">
      <i class="ti ti-address-book" style="font-size:40px;display:block;margin-bottom:10px;opacity:0.25"></i>
      <p>${q ? `"${q}"에 대한 연락처가 없어요` : '연락처를 추가해보세요'}</p>
    </div>`;
    return;
  }

  // 가나다 그룹 정렬
  const groups = {};
  _allContacts.forEach(c => {
    const ch = c.name.charAt(0).toUpperCase();
    if (!groups[ch]) groups[ch] = [];
    groups[ch].push(c);
  });

  grid.innerHTML = '';
  Object.keys(groups).sort().forEach(ch => {
    const section = document.createElement('div');
    section.className = 'ct-section';
    section.innerHTML = `<div class="ct-section-label">${ch}</div>`;
    const cards = document.createElement('div');
    cards.className = 'ct-cards';
    groups[ch].forEach(c => {
      cards.appendChild(makeContactCard(c));
    });
    section.appendChild(cards);
    grid.appendChild(section);
  });
}

function makeContactCard(c) {
  const card = document.createElement('div');
  card.className = 'ct-card';

  const initials = c.name.slice(0, 2);
  const avatarColors = ['#7b93f5','#f0b429','#3dba74','#e06baf','#56c0de','#a78bfa'];
  const color = avatarColors[c.name.charCodeAt(0) % avatarColors.length];

  card.innerHTML = `
    <div class="ct-card-top">
      <div class="ct-avatar" style="background:${color}20;color:${color}">${initials}</div>
      <div class="ct-info">
        <div class="ct-name">${escHtml(c.name)}</div>
        <div class="ct-sub">
          ${c.title ? `<span class="ct-badge">${escHtml(c.title)}</span>` : ''}
          ${c.org ? `<span class="ct-org">${escHtml(c.org)}</span>` : ''}
        </div>
      </div>
      <div class="ct-actions">
        <button class="card-btn" title="수정" onclick="openContactModal('${c.id}')"><i class="ti ti-pencil"></i></button>
        <button class="card-btn del" title="삭제" onclick="deleteContact('${c.id}','${escHtml(c.name)}')"><i class="ti ti-trash"></i></button>
      </div>
    </div>
    <div class="ct-details">
      ${c.email ? `<a class="ct-detail-row" href="mailto:${escHtml(c.email)}"><i class="ti ti-mail"></i><span>${escHtml(c.email)}</span></a>` : ''}
      ${c.phone ? `<a class="ct-detail-row" href="tel:${escHtml(c.phone)}"><i class="ti ti-phone"></i><span>${escHtml(c.phone)}</span></a>` : ''}
      ${c.memo ? `<div class="ct-detail-row ct-memo"><i class="ti ti-notes"></i><span>${escHtml(c.memo)}</span></div>` : ''}
    </div>
  `;
  return card;
}

function openContactModal(id) {
  const modal = document.getElementById('contact-modal');
  const isEdit = !!id;
  document.getElementById('modal-title').textContent = isEdit ? '연락처 수정' : '새 연락처';
  document.getElementById('ct-id').value = '';
  document.getElementById('ct-name').value = '';
  document.getElementById('ct-org').value = '';
  document.getElementById('ct-title').value = '';
  document.getElementById('ct-email').value = '';
  document.getElementById('ct-phone').value = '';
  document.getElementById('ct-memo').value = '';

  if (isEdit) {
    const c = _allContacts.find(x => x.id === id);
    if (c) {
      document.getElementById('ct-id').value = c.id;
      document.getElementById('ct-name').value = c.name;
      document.getElementById('ct-org').value = c.org || '';
      document.getElementById('ct-title').value = c.title || '';
      document.getElementById('ct-email').value = c.email || '';
      document.getElementById('ct-phone').value = c.phone || '';
      document.getElementById('ct-memo').value = c.memo || '';
    }
  }
  modal.classList.add('open');
  setTimeout(() => document.getElementById('ct-name').focus(), 80);
}

function closeContactModal(e) {
  if (e && e.target !== document.getElementById('contact-modal')) return;
  document.getElementById('contact-modal').classList.remove('open');
}

async function saveContact() {
  const id = document.getElementById('ct-id').value;
  const name = document.getElementById('ct-name').value.trim();
  if (!name) { document.getElementById('ct-name').focus(); showToast('이름을 입력해주세요'); return; }

  const body = {
    name,
    org: document.getElementById('ct-org').value.trim(),
    title: document.getElementById('ct-title').value.trim(),
    email: document.getElementById('ct-email').value.trim(),
    phone: document.getElementById('ct-phone').value.trim(),
    memo: document.getElementById('ct-memo').value.trim(),
  };

  try {
    if (id) {
      await apiPut('/contacts/' + id, body);
      showToast('수정되었어요');
    } else {
      await apiPost('/contacts', body);
      showToast('연락처가 추가되었어요');
    }
    document.getElementById('contact-modal').classList.remove('open');
    await renderContacts();
  } catch(e) { showToast('저장 실패: ' + e.message); }
}

async function deleteContact(id, name) {
  if (!confirm(`"${name}" 연락처를 삭제할까요?`)) return;
  try {
    await apiDelete('/contacts/' + id);
    showToast('삭제되었어요');
    await renderContacts();
  } catch(e) { showToast('삭제 실패: ' + e.message); }
}

// 모달 키보드 닫기
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  }
});

// ── MAIL TEMPLATES ────────────────────────────────────
let _allMail = [];

async function renderMailTemplates() {
  const q = (document.getElementById('mail-search')?.value || '').trim();
  const qs = q ? '?q=' + encodeURIComponent(q) : '';
  try { _allMail = await apiGet('/mail-templates' + qs); }
  catch(e) { showToast('서버 연결 실패'); return; }

  const grid = document.getElementById('mail-grid');
  if (_allMail.length === 0) {
    grid.innerHTML = `<div class="empty-full" style="margin-top:3rem">
      <i class="ti ti-mail" style="font-size:40px;display:block;margin-bottom:10px;opacity:0.25"></i>
      <p>${q ? `"${q}"에 대한 포맷이 없어요` : '자주 쓰는 메일 포맷을 저장해보세요'}</p>
    </div>`;
    return;
  }
  grid.innerHTML = '';
  _allMail.forEach(m => grid.appendChild(makeMailCard(m)));
}

function makeMailCard(m) {
  const card = document.createElement('div');
  card.className = 'tpl-card tpl-card-clickable';
  card.title = '클릭하면 전체 내용을 볼 수 있어요';
  card.innerHTML = `
    <div class="tpl-card-header">
      <div class="tpl-icon mail-icon"><i class="ti ti-mail"></i></div>
      <div class="tpl-header-info">
        <div class="tpl-title">${escHtml(m.title)}</div>
        ${m.recipients ? `<div class="tpl-sub"><i class="ti ti-user" style="font-size:11px"></i> ${escHtml(m.recipients)}</div>` : ''}
      </div>
      <div class="tpl-actions">
        <button class="card-btn" title="복사" onclick="event.stopPropagation();copyMailBody('${m.id}')"><i class="ti ti-copy"></i></button>
        <button class="card-btn" title="수정" onclick="event.stopPropagation();openMailModal('${m.id}')"><i class="ti ti-pencil"></i></button>
        <button class="card-btn del" title="삭제" onclick="event.stopPropagation();deleteMailTemplate('${m.id}','${escHtml(m.title)}')"><i class="ti ti-trash"></i></button>
      </div>
    </div>
    ${m.subject ? `<div class="tpl-subject"><span class="tpl-label">제목</span>${escHtml(m.subject)}</div>` : ''}
    <div class="tpl-body-preview">${escHtml(m.body || '').replace(/\n/g,'<br>')}</div>
    ${m.memo ? `<div class="tpl-memo"><i class="ti ti-info-circle"></i> ${escHtml(m.memo)}</div>` : ''}
  `;
  card.addEventListener('click', () => openMailViewModal(m.id));
  return card;
}

let _viewingMailId = null;

function openMailViewModal(id) {
  const m = _allMail.find(x => x.id === id);
  if (!m) return;
  _viewingMailId = id;

  document.getElementById('mail-view-title').textContent = m.title;

  const rec = document.getElementById('mail-view-recipients');
  rec.textContent = m.recipients ? `수신자: ${m.recipients}` : '';

  const subjectWrap = document.getElementById('mail-view-subject-wrap');
  if (m.subject) {
    subjectWrap.style.display = '';
    subjectWrap.innerHTML = `<span class="tpl-label">제목</span>${escHtml(m.subject)}`;
  } else {
    subjectWrap.style.display = 'none';
  }

  document.getElementById('mail-view-body').innerHTML =
    escHtml(m.body || '').replace(/\n/g, '<br>') || '<span style="color:var(--ink3);font-size:13px">본문 없음</span>';

  const memoWrap = document.getElementById('mail-view-memo-wrap');
  if (m.memo) {
    memoWrap.style.display = 'flex';
    document.getElementById('mail-view-memo').textContent = m.memo;
  } else {
    memoWrap.style.display = 'none';
  }

  document.getElementById('mail-view-modal').classList.add('open');
}

function closeMailViewModal(e) {
  if (e && e.target !== document.getElementById('mail-view-modal')) return;
  document.getElementById('mail-view-modal').classList.remove('open');
  _viewingMailId = null;
}

async function copyMailBodyFromView() {
  if (_viewingMailId) await copyMailBody(_viewingMailId);
}

function openMailModal(id) {
  const isEdit = !!id;
  document.getElementById('mail-modal-title').textContent = isEdit ? '메일 포맷 수정' : '새 메일 포맷';
  ['mail-id','mail-title','mail-recipients','mail-subject','mail-body','mail-memo'].forEach(i => {
    document.getElementById(i).value = '';
  });
  if (isEdit) {
    const m = _allMail.find(x => x.id === id);
    if (m) {
      document.getElementById('mail-id').value = m.id;
      document.getElementById('mail-title').value = m.title;
      document.getElementById('mail-recipients').value = m.recipients || '';
      document.getElementById('mail-subject').value = m.subject || '';
      document.getElementById('mail-body').value = m.body || '';
      document.getElementById('mail-memo').value = m.memo || '';
    }
  }
  document.getElementById('mail-modal').classList.add('open');
  setTimeout(() => document.getElementById('mail-title').focus(), 80);
}

function closeMailModal(e) {
  if (e && e.target !== document.getElementById('mail-modal')) return;
  document.getElementById('mail-modal').classList.remove('open');
}

async function saveMailTemplate() {
  const id = document.getElementById('mail-id').value;
  const title = document.getElementById('mail-title').value.trim();
  if (!title) { document.getElementById('mail-title').focus(); showToast('포맷 이름을 입력해주세요'); return; }
  const body = {
    title,
    recipients: document.getElementById('mail-recipients').value.trim(),
    subject: document.getElementById('mail-subject').value.trim(),
    body: document.getElementById('mail-body').value,
    memo: document.getElementById('mail-memo').value.trim(),
  };
  try {
    if (id) { await apiPut('/mail-templates/' + id, body); showToast('수정되었어요'); }
    else { await apiPost('/mail-templates', body); showToast('포맷이 추가되었어요'); }
    document.getElementById('mail-modal').classList.remove('open');
    await renderMailTemplates();
  } catch(e) { showToast('저장 실패: ' + e.message); }
}

async function deleteMailTemplate(id, name) {
  if (!confirm(`"${name}" 포맷을 삭제할까요?`)) return;
  try {
    await apiDelete('/mail-templates/' + id);
    showToast('삭제되었어요');
    await renderMailTemplates();
  } catch(e) { showToast('삭제 실패: ' + e.message); }
}

async function copyMailBody(id) {
  const m = _allMail.find(x => x.id === id);
  if (!m) return;
  const text = [
    m.subject ? `제목: ${m.subject}` : '',
    '',
    m.body || '',
  ].filter((l,i) => !(i===1 && !m.subject)).join('\n').trim();
  try {
    await navigator.clipboard.writeText(text);
    showToast('클립보드에 복사됐어요 📋');
  } catch(e) { showToast('복사 실패'); }
}

// ── PROCEDURES (SOP) ──────────────────────────────────
let _allSop = [];

async function renderProcedures() {
  const q = (document.getElementById('sop-search')?.value || '').trim();
  const qs = q ? '?q=' + encodeURIComponent(q) : '';
  try { _allSop = await apiGet('/procedures' + qs); }
  catch(e) { showToast('서버 연결 실패'); return; }

  const grid = document.getElementById('sop-grid');
  if (_allSop.length === 0) {
    grid.innerHTML = `<div class="empty-full" style="margin-top:3rem">
      <i class="ti ti-list-numbers" style="font-size:40px;display:block;margin-bottom:10px;opacity:0.25"></i>
      <p>${q ? `"${q}"에 대한 업무 순서가 없어요` : '반복 업무 진행 순서를 저장해보세요'}</p>
    </div>`;
    return;
  }
  grid.innerHTML = '';
  _allSop.forEach(p => grid.appendChild(makeSopCard(p)));
}

function makeSopCard(p) {
  const card = document.createElement('div');
  card.className = 'tpl-card';

  const stepsHtml = (p.steps || []).map((s, i) => `
    <div class="sop-step">
      <span class="sop-step-num">${i + 1}</span>
      <span class="sop-step-text">${escHtml(s)}</span>
    </div>
  `).join('');

  card.innerHTML = `
    <div class="tpl-card-header">
      <div class="tpl-icon sop-icon"><i class="ti ti-list-numbers"></i></div>
      <div class="tpl-header-info">
        <div class="tpl-title">${escHtml(p.title)}</div>
        ${p.category ? `<div class="tpl-sub"><i class="ti ti-tag" style="font-size:11px"></i> ${escHtml(p.category)}</div>` : ''}
      </div>
      <div class="tpl-actions">
        <button class="card-btn" title="수정" onclick="openSopModal('${p.id}')"><i class="ti ti-pencil"></i></button>
        <button class="card-btn del" title="삭제" onclick="deleteProcedure('${p.id}','${escHtml(p.title)}')"><i class="ti ti-trash"></i></button>
      </div>
    </div>
    <div class="sop-steps">${stepsHtml || '<span style="font-size:12px;color:var(--ink3)">단계 없음</span>'}</div>
    ${p.memo ? `<div class="tpl-memo"><i class="ti ti-info-circle"></i> ${escHtml(p.memo)}</div>` : ''}
  `;
  return card;
}

function openSopModal(id) {
  const isEdit = !!id;
  document.getElementById('sop-modal-title').textContent = isEdit ? '업무 순서 수정' : '새 업무 순서';
  ['sop-id','sop-title','sop-category','sop-memo'].forEach(i => document.getElementById(i).value = '');
  document.getElementById('sop-steps-list').innerHTML = '';

  if (isEdit) {
    const p = _allSop.find(x => x.id === id);
    if (p) {
      document.getElementById('sop-id').value = p.id;
      document.getElementById('sop-title').value = p.title;
      document.getElementById('sop-category').value = p.category || '';
      document.getElementById('sop-memo').value = p.memo || '';
      (p.steps || []).forEach(s => addSopStep(s));
    }
  }
  document.getElementById('sop-modal').classList.add('open');
  setTimeout(() => document.getElementById('sop-title').focus(), 80);
}

function closeSopModal(e) {
  if (e && e.target !== document.getElementById('sop-modal')) return;
  document.getElementById('sop-modal').classList.remove('open');
}

function addSopStep(text = '') {
  const list = document.getElementById('sop-steps-list');
  const idx = list.children.length + 1;
  const row = document.createElement('div');
  row.className = 'step-row';
  row.draggable = true;
  row.innerHTML = `
    <span class="step-num">${idx}</span>
    <i class="ti ti-grip-vertical step-drag-handle"></i>
    <input class="form-input step-input" type="text" value="${escHtml(text)}" placeholder="단계 ${idx} 내용...">
    <button class="card-btn del step-del" onclick="removeSopStep(this)" title="삭제"><i class="ti ti-x"></i></button>
  `;

  // 드래그 앤 드롭으로 순서 변경
  row.addEventListener('dragstart', e => {
    e.dataTransfer.effectAllowed = 'move';
    row.classList.add('step-dragging');
  });
  row.addEventListener('dragend', () => {
    row.classList.remove('step-dragging');
    reindexSteps();
  });
  row.addEventListener('dragover', e => {
    e.preventDefault();
    const dragging = list.querySelector('.step-dragging');
    if (dragging && dragging !== row) {
      const rect = row.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (e.clientY < mid) list.insertBefore(dragging, row);
      else list.insertBefore(dragging, row.nextSibling);
    }
  });

  list.appendChild(row);
  if (!text) row.querySelector('input').focus();
}

function removeSopStep(btn) {
  btn.closest('.step-row').remove();
  reindexSteps();
}

function reindexSteps() {
  document.querySelectorAll('#sop-steps-list .step-row').forEach((row, i) => {
    row.querySelector('.step-num').textContent = i + 1;
    row.querySelector('input').placeholder = `단계 ${i + 1} 내용...`;
  });
}

async function saveProcedure() {
  const id = document.getElementById('sop-id').value;
  const title = document.getElementById('sop-title').value.trim();
  if (!title) { document.getElementById('sop-title').focus(); showToast('업무명을 입력해주세요'); return; }

  const steps = [...document.querySelectorAll('#sop-steps-list .step-input')]
    .map(i => i.value.trim()).filter(Boolean);

  const body = {
    title,
    category: document.getElementById('sop-category').value.trim(),
    steps,
    memo: document.getElementById('sop-memo').value.trim(),
  };
  try {
    if (id) { await apiPut('/procedures/' + id, body); showToast('수정되었어요'); }
    else { await apiPost('/procedures', body); showToast('업무 순서가 추가되었어요'); }
    document.getElementById('sop-modal').classList.remove('open');
    await renderProcedures();
  } catch(e) { showToast('저장 실패: ' + e.message); }
}

async function deleteProcedure(id, name) {
  if (!confirm(`"${name}" 업무 순서를 삭제할까요?`)) return;
  try {
    await apiDelete('/procedures/' + id);
    showToast('삭제되었어요');
    await renderProcedures();
  } catch(e) { showToast('삭제 실패: ' + e.message); }
}

// ── INIT ──────────────────────────────────────────────
applyTitle();
updateSidebar();
renderBoard();
setInterval(updateSidebar, 60000);