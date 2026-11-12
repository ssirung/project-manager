'use strict';
/* ===== 유틸 ===== */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const diff = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
const todayS = () => iso(new Date());
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const LV = ['대단위', '중단위', '소단위'], LVS = ['대', '중', '소'];
const RK = {'상': 3, '중': 2, '하': 1};
const SK = {'예정': 1, '진행중': 2, '완료': 3};
const SC = {'예정': 'var(--plan)', '진행중': 'var(--doing)', '완료': 'var(--ok)'};
const KEY = 'pm.v1';
let S, M = {}, needScroll = true;

/* ===== 데이터 ===== */
function blank(o) {
  return Object.assign({
    id: uid(), parentId: null, kind: 'long', title: '', start: '', end: '',
    dept: '', owner: '', importance: '중', priority: '중', status: '예정',
    progress: 0, memo: '', u: Date.now(), remind: ((S && S.settings.remind) || [1, 0]).slice()
  }, o || {});
}
function seed() {
  const t = todayS(), a = n => addDays(t, n), mk = o => blank(o);
  const p1 = mk({title: '신제품 출시 준비', start: a(-10), end: a(40), dept: '마케팅팀', owner: '김민수', importance: '상', priority: '상', status: '진행중', memo: '11월 말 런칭 목표'});
  const c1 = mk({parentId: p1.id, title: '시장 조사', start: a(-10), end: a(3), dept: '마케팅팀', owner: '김민수', importance: '상', priority: '상', status: '진행중'});
  const s1 = mk({parentId: c1.id, title: '경쟁사 분석', start: a(-8), end: a(1), dept: '마케팅팀', owner: '이지은', status: '진행중', progress: 80, remind: [1, 0]});
  const s2 = mk({parentId: c1.id, title: '고객 설문 진행', start: a(0), end: a(3), dept: '마케팅팀', owner: '박서준', status: '예정', progress: 0, remind: [3, 1, 0]});
  const c2 = mk({parentId: p1.id, title: '디자인 시안', start: a(2), end: a(20), dept: '디자인팀', owner: '최하나', importance: '중', priority: '중', status: '예정'});
  const s3 = mk({parentId: c2.id, title: '패키지 시안 3종', start: a(2), end: a(12), dept: '디자인팀', owner: '최하나', status: '예정', progress: 0});
  const p2 = mk({title: '홈페이지 개편', start: a(-20), end: a(-1), dept: 'IT팀', owner: '정우진', importance: '중', priority: '하', status: '진행중', progress: 90, memo: '오픈 지연 중 (샘플)'});
  const sp = mk({kind: 'spot', title: '거래처 견적서 회신', start: a(0), end: a(1), dept: '영업팀', owner: '한소희', importance: '상', priority: '상', status: '진행중', progress: 30, memo: '오늘 오후까지', remind: [0]});
  return {items: [p1, c1, s1, s2, c2, s3, p2, sp], settings: {}, ui: {}};
}
function load() {
  try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; }
  if (!S || !Array.isArray(S.items)) S = seed();
  S.settings = Object.assign({alertTime: '09:00', remind: [1, 0]}, S.settings || {});
  S.ui = Object.assign({view: 'table', zoom: 'day', kind: '', status: '', dept: '', q: '', collapsed: {}, calMonth: todayS().slice(0, 7), calSel: todayS(), calMode: 'leaf', sort: 'start', dir: 1}, S.ui || {});
  S.fired = S.fired || {};
  S.deleted = S.deleted || {};
  S.items.forEach(i => { if (!i.u) i.u = Date.now(); });
}
function saveLocal() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('저장 실패: 저장 공간을 확인하세요'); }
}
/* 상위 항목: 기간은 하위 항목을 포함하도록 넓히고, 상태는 하위 항목에서 자동 계산 */
function rollup() {
  idx();
  const now = Date.now(); let changed = false;
  S.items.slice().sort((a, b) => depthOf(b) - depthOf(a)).forEach(p => {
    const k = kids(p.id); if (!k.length) return;
    let start = p.start, end = p.end;
    const ss = k.map(c => c.start).filter(Boolean).sort(), ee = k.map(c => c.end).filter(Boolean).sort();
    if (ss.length && (!start || ss[0] < start)) start = ss[0];
    if (ee.length && (!end || ee[ee.length - 1] > end)) end = ee[ee.length - 1];
    const sts = k.map(c => c.status);
    const status = sts.every(x => x === '완료') ? '완료' : sts.some(x => x !== '예정') ? '진행중' : '예정';
    if (start !== p.start || end !== p.end || status !== p.status) { p.start = start; p.end = end; p.status = status; p.u = now; changed = true; }
  });
  return changed;
}
function save() {
  rollup(); assignColors(); saveLocal(); queueSync();
  if (DS) { const now = doneIds(); let n = 0; now.forEach(id => { if (!DS.has(id)) n++; }); DS = now; if (n) celebrate(n > 1 ? `🎉 ${n}건 완료! 수고하셨어요` : ''); }
}

/* ===== 트리 ===== */
const idx = () => { M = {}; S.items.forEach(i => M[i.id] = i); };
const kids = id => S.items.filter(i => i.parentId === id);
const depthOf = i => { let d = 0; while (i.parentId && M[i.parentId]) { i = M[i.parentId]; d++; } return d; };
const heightOf = i => { const k = kids(i.id); return k.length ? 1 + Math.max(...k.map(heightOf)) : 0; };
const subtree = id => { const r = []; kids(id).forEach(c => { r.push(c.id, ...subtree(c.id)); }); return r; };
const prog = i => { const k = kids(i.id); if (!k.length) return +i.progress || 0; return Math.round(k.reduce((a, c) => a + prog(c), 0) / k.length); };
const isOverdue = n => n.status !== '완료' && n.end && n.end < todayS();

const isToday = i => i.td === todayS();
const isHidden = i => { for (let c = i; c; c = M[c.parentId]) if (c.hide) return true; return false; };
function match(i) {
  const u = S.ui;
  if (!u.showHidden && isHidden(i)) return false;
  if (u.kind && i.kind !== u.kind) return false;
  if (u.status && i.status !== u.status) return false;
  if (u.dept && i.dept !== u.dept) return false;
  if (u.q) {
    const t = (i.title + ' ' + i.owner + ' ' + i.dept + ' ' + i.memo).toLowerCase();
    if (!t.includes(u.q.toLowerCase())) return false;
  }
  return true;
}
const filtering = () => !!(S.ui.status || S.ui.dept || S.ui.q);
function visibleSet() {
  const v = new Set();
  S.items.forEach(i => { if (match(i)) { let c = i; while (c) { v.add(c.id); c = M[c.parentId]; } } });
  return v;
}
function cmp(a, b) {
  const k = S.ui.sort, d = S.ui.dir;
  if (k === 'manual') return (Number.isFinite(a.o) ? a.o : 1e9) - (Number.isFinite(b.o) ? b.o : 1e9);
  if (k === 'title') return d * a.title.localeCompare(b.title, 'ko');
  let x, y;
  if (k === 'start' || k === 'end') { x = a[k] || '9999'; y = b[k] || '9999'; return d * (x < y ? -1 : x > y ? 1 : 0); }
  if (k === 'importance' || k === 'priority') return -d * (RK[a[k]] - RK[b[k]]);
  if (k === 'status') return d * (SK[a.status] - SK[b.status]);
  if (k === 'progress') return d * (prog(a) - prog(b));
  return 0;
}
const sibs = (arr, root) => arr.slice().sort((a, b) => (root && a.kind !== b.kind) ? (a.kind === 'long' ? -1 : 1) : cmp(a, b));
function flatten() {
  const vis = visibleSet(), out = [], force = filtering();
  let lastKind = null, inDone = false;
  const walk = (n, d, g) => {
    if (d === 0 && !inDone && !S.ui.kind && n.kind !== lastKind) { lastKind = n.kind; out.push({sec: n.kind === 'long' ? '장기 프로젝트' : '스팟 업무'}); }
    out.push({n, d, g});
    if (force || !S.ui.collapsed[n.id]) {
      const ch = sibs(kids(n.id), false).filter(c => vis.has(c.id));
      ch.forEach((c, i) => walk(c, d + 1, g.concat(i === ch.length - 1)));
    }
  };
  const roots = sibs(S.items.filter(i => !i.parentId || !M[i.parentId]), true).filter(r => vis.has(r.id));
  roots.filter(r => r.status !== '완료').forEach(r => walk(r, 0, []));
  // 완료된 대단위/스팟 업무는 하단 '완료된 업무' 묶음으로 (하위 단계는 완료돼도 제자리에 유지)
  const done = roots.filter(r => r.status === '완료');
  if (done.length) { inDone = true; out.push({sec: `완료된 업무 (${done.length})`, done: true}); done.forEach(r => walk(r, 0, [])); }
  return out;
}
/* ===== 드래그로 순서 변경 (같은 상위 항목 안에서) ===== */
const pKey = x => M[x.parentId] ? x.parentId : '';
const sameGroup = (a, x) => pKey(x) === pKey(a) && (pKey(a) || x.kind === a.kind);
const dragHandle = id => `<span class="dgh" data-id="${id}" title="끌어서 순서 변경" aria-label="순서 변경">⋮⋮</span>`;
function freezeOrder() {   // 지금 보이는 순서를 그대로 'o' 값으로 고정
  idx();
  const groups = {};
  S.items.forEach(i => { const k = pKey(i) || ('|' + i.kind); (groups[k] = groups[k] || []).push(i); });
  Object.values(groups).forEach(arr => sibs(arr, false).forEach((i, n) => { if (i.o !== n * 10) { i.o = n * 10; i.u = Date.now(); } }));
  S.ui.sort = 'manual'; S.ui.dir = 1;
}
function reorder(dragId, targetId, after) {
  idx(); const a = M[dragId], t = M[targetId];
  if (!a || !t || a === t || !sameGroup(a, t)) return;
  freezeOrder();
  const order = sibs(S.items.filter(x => sameGroup(a, x)), false).filter(x => x !== a);
  order.splice(order.indexOf(t) + (after ? 1 : 0), 0, a);
  order.forEach((i, n) => { if (i.o !== n * 10) { i.o = n * 10; i.u = Date.now(); } });
  save(); render(); toast('순서를 바꿨습니다');
}
let DR = null, noClickUntil = 0;
const rowOf = id => { const el = document.querySelector(`tr[data-id="${id}"], .tll[data-id="${id}"]`); return el && el.closest('tr,.tlrow'); };
const clearMarks = () => document.querySelectorAll('.dz-b,.dz-a').forEach(r => r.classList.remove('dz-b', 'dz-a'));
document.addEventListener('pointerdown', e => {
  const h = e.target.closest && e.target.closest('.dgh'); if (!h || (e.button || 0) > 0) return;
  DR = {id: h.dataset.id, tid: null, after: false, y: e.clientY, moved: false};
  try { h.setPointerCapture(e.pointerId); } catch (_) {}
  e.preventDefault();
});
document.addEventListener('pointermove', e => {
  if (!DR) return;
  if (!DR.moved) { if (Math.abs(e.clientY - DR.y) < 5) return; DR.moved = true; document.body.classList.add('dragging'); const r0 = rowOf(DR.id); if (r0) r0.classList.add('dragging-row'); }
  clearMarks(); DR.tid = null;
  const main = $('#main'), mr = main.getBoundingClientRect();
  if (e.clientY < mr.top + 56) main.scrollTop -= 14; else if (e.clientY > mr.bottom - 56) main.scrollTop += 14;
  idx(); const a = M[DR.id]; if (!a) return;
  const el = document.elementFromPoint(e.clientX, e.clientY), row = el && el.closest && el.closest('tr[data-id], .tlrow');
  const idEl = row && (row.matches('tr') ? row : row.querySelector('.tll[data-id]'));
  let c = idEl && M[idEl.dataset.id];
  while (c && !sameGroup(a, c)) c = M[c.parentId];
  if (!c || c === a) return;
  const rr = rowOf(c.id); if (!rr) return;
  const b = rr.getBoundingClientRect();
  DR.tid = c.id; DR.after = e.clientY > b.top + b.height / 2;
  rr.classList.add(DR.after ? 'dz-a' : 'dz-b');
});
const endDrag = ok => {
  if (!DR) return;
  const d = DR; DR = null; clearMarks();
  document.body.classList.remove('dragging'); document.querySelectorAll('.dragging-row').forEach(r => r.classList.remove('dragging-row'));
  if (d.moved) { noClickUntil = Date.now() + 400; if (ok && d.tid) reorder(d.id, d.tid, d.after); }
};
document.addEventListener('pointerup', () => endDrag(true));
document.addEventListener('pointercancel', () => endDrag(false));
document.addEventListener('click', e => { if ((e.target.closest && e.target.closest('.dgh')) || Date.now() < noClickUntil) { e.stopPropagation(); e.preventDefault(); } }, true);

/* 상위-하위 연결선 (g[k-1]: 깊이 k 조상이 형제 중 마지막인지) */
function guidesHTML(g, d, x0, step) {
  if (!d) return '';
  let s = '';
  for (let k = 1; k <= d; k++) {
    const x = x0 + (k - 1) * step, cont = !g[k - 1];
    if (k < d) { if (cont) s += `<s class="gv" style="left:${x}px;top:0;bottom:0"></s>`; }
    else s += `<s class="gv" style="left:${x}px;top:0;bottom:${cont ? 0 : '50%'}"></s><s class="gh" style="left:${x}px;width:${step - 3}px"></s>`;
  }
  return `<span class="gd">${s}</span>`;
}

/* ===== 표시 보조 ===== */
const impCls = v => v === '상' ? 'hi' : v === '중' ? 'mid' : 'lo';
/* 프로젝트(대단위)별 색상 계열 — 하위 단계는 같은 색의 명도 단계로 표시 */
const PAL = [215, 168, 28, 328, 262, 48, 192, 95];
const PAL_NAME = ['파랑', '청록', '주황', '핑크', '보라', '골드', '하늘', '라임'];
let CM = {};
const isRoot = i => i.kind === 'long' && (!i.parentId || !M[i.parentId]);
function colorMap() {
  const m = {}, roots = S.items.filter(isRoot), n = PAL.length;
  const used = new Set(roots.filter(r => Number.isInteger(r.c)).map(r => r.c % n));
  roots.forEach(r => { if (Number.isInteger(r.c)) m[r.id] = r.c % n; });
  let k = 0;
  roots.filter(r => !Number.isInteger(r.c)).sort((x, y) => x.id < y.id ? -1 : 1).forEach(r => {
    let t = 0; while (used.has(k % n) && t < n) { k++; t++; }
    m[r.id] = k % n; used.add(k % n); k++;
  });
  return m;
}
const leastUsedColor = () => { const cnt = PAL.map(() => 0); Object.values(colorMap()).forEach(i => cnt[i]++); return cnt.indexOf(Math.min(...cnt)); };
function assignColors() {   // 색이 없는 기존 프로젝트에 한 번 고정 저장(기기마다 같은 값)
  idx(); const m = colorMap(); let ch = false;
  S.items.forEach(i => { if (isRoot(i) && !Number.isInteger(i.c)) { i.c = m[i.id]; i.u = Date.now(); ch = true; } });
  return ch;
}
function toneVars(n, d) {
  if (n.kind === 'spot') return `--h:262;--s:30%;--c:hsl(var(--h) var(--s) var(--l${Math.min(d, 2)}));--tc:var(--c)`;
  let c = n; while (c.parentId && M[c.parentId]) c = M[c.parentId];
  const hue = PAL[CM[c.id] ?? 0];
  return `--h:${hue};--c:hsl(var(--h) var(--s) var(--l${Math.min(d, 2)}));--tc:var(--c)`;
}
function barColor(n) { return isOverdue(n) ? 'var(--bad)' : SC[n.status]; }
// 상태 이모티콘: 완료 🎉 / 지연 1~2일 😢 / 지연 3일 이상 😡
function moodHTML(n, bare) {
  if (n.status === '완료') {
    if (bare) return '';
    const t = 1 + ([...String(n.id)].reduce((s, c) => s + c.charCodeAt(0), 0) % 3);
    return `<img class="mood mg ok" data-act="gifpop" data-d="ok" src="./done${t}.gif" alt="완료" title="완료! 수고하셨어요" loading="lazy" onerror="this.replaceWith(document.createTextNode('🎉'))">`;
  }
  if (!isOverdue(n)) return '';
  const d = -diff(todayS(), n.end), t = d >= 7 ? 3 : d >= 3 ? 2 : 1;
  if (!bare) return `<img class="mood mg" data-act="gifpop" data-d="${d}" src="./delay${t}.gif" alt="지연 ${d}일" title="지연 ${d}일 (눌러서 크게 보기)" loading="lazy" onerror="this.replaceWith(document.createTextNode('${t > 1 ? '😡' : '😢'}'))">`;
  return d >= 3 ? `<span class="mood m-mad" title="지연 ${d}일">😡</span>` : `<span class="mood m-cry" title="지연 ${d}일">😢</span>`;
}
function gifPop(src, d) {
  const o = document.createElement('div'); o.className = 'gpop';
  o.innerHTML = d === 'ok' ? `<div class="gbox ok"><img src="${src}" alt=""><b>🎉 완료! 수고하셨어요</b><span>눌러서 닫기</span></div>` : `<div class="gbox"><img src="${src}" alt=""><b>⏰ 지연 ${d}일</b><span>눌러서 닫기</span></div>`;
  o.addEventListener('click', () => o.remove()); document.body.appendChild(o);
  setTimeout(() => o.remove(), 6000);
}
const subCount = id => kids(id).reduce((s, c) => s + 1 + subCount(c.id), 0);
const cntHTML = n => S.ui.collapsed[n.id] && kids(n.id).length ? `<span class="cnt" title="접힌 하위 항목">+${subCount(n.id)}</span>` : '';
const anyOpen = () => S.items.some(i => kids(i.id).length && !S.ui.collapsed[i.id]);
const collapseBtn = () => `<button class="mbtn" data-act="collapseall" title="하위 항목 전체 접기/펼치기">${anyOpen() ? '▾ 모두 접기' : '▸ 모두 펼치기'}</button>`;
let DS = null;
const doneIds = () => new Set(S.items.filter(i => i.status === '완료' && !kids(i.id).length).map(i => i.id));
function celebrate(msg) {
  const box = document.createElement('div'); box.className = 'party'; box.setAttribute('aria-hidden', 'true');
  const em = ['🎉', '✨', '🎊', '⭐', '🥳'];
  for (let i = 0; i < 14; i++) {
    const s = document.createElement('span'); s.textContent = em[i % em.length];
    s.style.cssText = `left:${10 + Math.random() * 80}%;animation-delay:${Math.random() * .25}s;--dx:${Math.round((Math.random() - .5) * 120)}px;font-size:${14 + Math.round(Math.random() * 10)}px`;
    box.appendChild(s);
  }
  const b = document.createElement('div'); b.className = 'cheer'; b.textContent = msg || '🎉 완료! 수고하셨어요';
  const g = document.createElement('img'); g.className = 'cgif'; g.src = `./done${1 + Math.floor(Math.random() * 3)}.gif`; g.alt = '';
  g.onerror = () => g.remove();
  box.appendChild(g); box.appendChild(b); document.body.appendChild(box);
  setTimeout(() => box.remove(), 3000);
}
function ddayHTML(n) {
  if (n.status === '완료') return '<span class="chip ok">완료</span>';
  if (!n.end) return '';
  const d = diff(todayS(), n.end);
  if (d < 0) return `<span class="chip bad">지연 ${-d}일</span>`;
  if (d === 0) return '<span class="chip bad">D-day</span>';
  const mx = Math.max(0, ...(n.remind || []));
  return `<span class="chip ${d <= mx ? 'warn' : 'mute'}">D-${d}</span>`;
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 4000);
}

/* ===== 렌더 ===== */
function render() {
  idx(); CM = colorMap(); DS = doneIds();
  const main = $('#main'), sl = main.scrollLeft, st = main.scrollTop;
  $('#today').textContent = new Date().toLocaleDateString('ko-KR', {month: 'long', day: 'numeric', weekday: 'long'});
  document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === S.ui.view));
  document.querySelectorAll('#kindSeg button').forEach(b => b.classList.toggle('on', b.dataset.k === S.ui.kind));
  const depts = [...new Set(S.items.map(i => i.dept).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
  $('#fDept').innerHTML = '<option value="">부서 전체</option>' + depts.map(d => `<option ${d === S.ui.dept ? 'selected' : ''}>${esc(d)}</option>`).join('');
  $('#fStatus').value = S.ui.status;
  const nh = S.items.filter(i => i.hide).length, fh = $('#fHidden');
  fh.hidden = !nh && !S.ui.showHidden; fh.classList.toggle('on', !!S.ui.showHidden);
  fh.textContent = (S.ui.showHidden ? '숨김 항목 표시 중' : '숨김 항목 보기') + ' (' + nh + ')';
  const v = S.ui.view;
  $('#view').innerHTML = v === 'table' ? tableHTML() : v === 'timeline' ? tlHTML() : calHTML();
  if (v === 'timeline' && needScroll) { const t = $('#tlToday'); if (t) main.scrollLeft = Math.max(0, +t.dataset.x - 80); main.scrollTop = 0; needScroll = false; }
  else { main.scrollLeft = sl; main.scrollTop = st; }
  renderBadge(); renderToday();
}
function renderToday() {
  const box = $('#todayPanel'); if (!box) return;
  const list = S.items.filter(isToday).sort((x, y) => ((x.status === '완료') - (y.status === '완료')) || (RK[y.importance] - RK[x.importance]) || ((x.end || '9') < (y.end || '9') ? -1 : 1));
  const open = S.ui.todayOpen !== false, done = list.filter(i => i.status === '완료').length;
  let h = `<div class="tdh" data-act="todaytoggle"><b>오늘 할일</b><span class="chip ${list.length ? 'long' : 'mute'}">${done}/${list.length}</span><span class="hint">${list.length ? '' : '각 업무의 ‘오늘’ 체크박스를 켜면 여기에 모입니다'}</span><span class="tgl">${open ? '▾' : '▸'}</span></div>`;
  if (open && list.length) {
    h += '<div class="tdl">' + list.map(i => {
      const k = kids(i.id).length, d = depthOf(i), par = M[i.parentId] ? M[i.parentId].title + ' › ' : '';
      return `<div class="tdr${i.status === '완료' ? ' done' : ''}" data-act="edit" data-id="${i.id}"><input type="checkbox" data-tdone="${i.id}" ${i.status === '완료' ? 'checked' : ''} ${k ? 'disabled' : ''} aria-label="완료" title="${k ? '하위 항목에 따라 자동' : '완료 처리'}"><span class="chip ${i.kind === 'spot' ? 'spot' : 'mute'}">${i.kind === 'spot' ? '스팟' : LVS[d]}</span><span class="tt2"><span class="hint">${esc(par)}</span><b>${esc(i.title)}</b></span>${moodHTML(i)}<span class="hint">${esc(i.owner)}</span>${ddayHTML(i)}<button class="x" data-act="tdoff" data-id="${i.id}" title="오늘 할일에서 빼기" aria-label="오늘 할일에서 빼기">✕</button></div>`;
    }).join('') + '</div>';
  }
  box.innerHTML = h;
}
function alertList() {
  const t = todayS(), out = [];
  S.items.forEach(i => {
    if (i.status === '완료' || !i.end) return;
    const d = diff(t, i.end), mx = Math.max(-1, ...(i.remind || []));
    if (d < 0 || d <= mx) out.push({i, d});
  });
  return out.sort((a, b) => a.d - b.d);
}
function renderBadge() {
  const n = alertList().length, b = $('#badge');
  b.hidden = !n; b.textContent = n;
}

/* 표 */
function tableHTML() {
  const rows = flatten();
  if (!rows.length) return '<div class="empty">표시할 항목이 없습니다.<br>오른쪽 아래 <b>＋ 새 항목</b>으로 추가하세요.</div>';
  const th = (k, l) => `<th data-act="sort" data-key="${k}">${l}${S.ui.sort === k ? (S.ui.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  let h = `<table class="tbl"><thead><tr><th class="first" data-act="sort" data-key="title">제목${S.ui.sort === 'title' ? (S.ui.dir > 0 ? ' ▲' : ' ▼') : ''}<button class="mbtn${S.ui.sort === 'manual' ? ' on' : ''}" data-act="manual" title="끌어서 정한 순서로 보기">☰ 내 순서</button>${collapseBtn()}</th><th>오늘</th><th>표시</th><th>구분</th><th>담당부서</th><th>담당자</th>${th('start', '시작일')}${th('end', '종료일')}${th('importance', '중요도')}${th('priority', '우선순위')}${th('status', '상태')}${th('progress', '진행률')}<th>마감</th><th>메모</th></tr></thead><tbody>`;
  rows.forEach(({n, d, g, sec, done}) => {
    if (sec) { h += `<tr class="sec${done ? ' dsec' : ''}"><td class="first">${done ? '✅ ' : ''}${sec}</td><td colspan="13"></td></tr>`; return; }
    const k = kids(n.id), p = prog(n), col = !!S.ui.collapsed[n.id];
    h += `<tr data-act="edit" data-id="${n.id}" style="${toneVars(n, d)}" class="lv${d}${n.status === '완료' ? ' done' : ''}${d > 0 && n.status === '완료' ? ' dsub' : ''}${isHidden(n) ? ' hid' : ''}">
<td class="first">${guidesHTML(g, d, 21, 18)}<div class="tt" style="padding-left:${d * 18}px">${k.length ? `<button class="tg" data-act="toggle" data-id="${n.id}">${col ? '▸' : '▾'}</button>` : '<span class="tg"></span>'}<i class="cd" style="${toneVars(n, d)}"></i><span class="lvl" title="${n.kind === 'spot' ? '스팟 업무' : LV[d]}">${n.kind === 'spot' ? '스팟' : LVS[d]}</span><b title="${esc(n.title)}">${esc(n.title)}</b>${cntHTML(n)}${moodHTML(n)}${(n.kind === 'long' && d < 2) ? `<button class="add" data-act="addchild" data-id="${n.id}" title="하위 항목 추가" aria-label="하위 항목 추가">＋</button>` : ''}</div>${dragHandle(n.id)}</td>
<td class="ctr"><input type="checkbox" data-td="${n.id}" ${isToday(n) ? 'checked' : ''} aria-label="오늘 할일" title="오늘 할일에 추가"></td>
<td class="ctr"><button class="eye" data-act="hide" data-id="${n.id}" title="${n.hide ? '다시 표시' : '목록에서 숨김'}" aria-label="${n.hide ? '다시 표시' : '숨김'}">${n.hide ? '🙈' : '👁'}</button></td>
<td><span class="chip ${n.kind}">${n.kind === 'spot' ? '스팟 업무' : '장기'}</span></td>
<td>${esc(n.dept)}</td><td>${esc(n.owner)}</td>
<td>${esc(n.start)}</td><td class="${isOverdue(n) ? 'late' : ''}">${esc(n.end)}</td>
<td><span class="chip ${impCls(n.importance)}">${n.importance}</span></td>
<td><span class="chip ${impCls(n.priority)}">${n.priority}</span></td>
<td><select data-st="${n.id}" style="color:${SC[n.status]}" ${k.length ? 'disabled title="하위 항목에 따라 자동 계산"' : ''}>${['예정', '진행중', '완료'].map(s => `<option ${s === n.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
<td><span class="pbar"><i style="width:${p}%;background:${barColor(n)}"></i></span>${p}%</td>
<td>${ddayHTML(n)}</td>
<td class="memo" title="${esc(n.memo)}">${esc(n.memo)}</td></tr>`;
  });
  return h + '</tbody></table>';
}

/* 타임라인 */
function tlHTML() {
  const all = flatten(), rows = all.filter(r => !r.sec);
  const zoom = S.ui.zoom, pxd = {day: 30, week: 12, month: 4}[zoom], t = todayS();
  const zsel = `<div style="position:sticky;left:0;display:flex;gap:8px;align-items:center;padding:8px 14px;background:var(--bg);z-index:9;width:max-content"><span class="hint">보기 단위</span><div class="seg">${[['day', '일'], ['week', '주'], ['month', '월']].map(([k, l]) => `<button data-act="zoom" data-z="${k}" class="${zoom === k ? 'on' : ''}">${l}</button>`).join('')}</div><button class="ghost" data-act="gotoday">오늘로</button></div>`;
  if (!rows.length) return zsel + '<div class="empty">표시할 항목이 없습니다.</div>';
  let min = t, max = t;
  rows.forEach(({n}) => { const s = n.start || n.end, e = n.end || n.start; if (s && s < min) min = s; if (e && e > max) max = e; });
  min = addDays(min, -7); max = addDays(max, 21);
  const total = diff(min, max) + 1, W = total * pxd;
  const off = ((8 - parse(min).getDay()) % 7) * pxd;
  const sat = ((6 - parse(min).getDay() + 7) % 7) * pxd;
  const wk = `linear-gradient(to right,var(--we) ${2 * pxd}px,transparent ${2 * pxd}px)`;
  const bg = `background-image:${wk},linear-gradient(to right,var(--line) 1px,transparent 1px);background-size:${7 * pxd}px 100%,${pxd * (zoom === 'day' ? 1 : 7)}px 100%;background-position:${sat}px 0,${zoom === 'day' ? 0 : off}px 0;background-repeat:repeat-x`;
  const bgH = `background-image:${wk};background-size:${7 * pxd}px 100%;background-position:${sat}px 0;background-repeat:repeat-x`;
  const todayX = diff(min, t) * pxd;
  let months = '', cur = min;
  while (cur <= max) {
    const d = parse(cur), eom = iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)), end = eom < max ? eom : max;
    months += `<div class="mh" style="left:${diff(min, cur) * pxd}px;width:${(diff(cur, end) + 1) * pxd}px"><span class="ml">${d.getFullYear()}.${pad(d.getMonth() + 1)}</span></div>`;
    cur = addDays(end, 1);
  }
  let days = '';
  for (let i = 0; i < total; i++) {
    const ds = addDays(min, i), dt = parse(ds), dow = dt.getDay();
    if (zoom === 'day') days += `<div class="dh ${ds === t ? 'td' : (dow === 0 || dow === 6) ? 'we' : ''}" style="left:${i * pxd}px;width:${pxd}px">${dt.getDate()}</div>`;
    else if (dow === 1) days += `<div class="dh" style="left:${i * pxd}px">${dt.getMonth() + 1}/${dt.getDate()}</div>`;
  }
  let h = `${zsel}<div class="tl" style="width:calc(var(--lw) + ${W}px)">
<div class="tlrow h1"><div class="tll">월</div><div class="tlr" style="width:${W}px">${months}</div></div>
<div class="tlrow h2"><div class="tll">항목<button class="mbtn${S.ui.sort === 'manual' ? ' on' : ''}" data-act="manual" title="끌어서 정한 순서로 보기">☰ 순서</button>${collapseBtn()}</div><div class="tlr" style="width:${W}px;${bgH}">${days}</div></div>`;
  all.forEach(({n, d, g, sec, done}) => {
    if (sec) { if (done) h += `<div class="tlrow tsec"><div class="tll">✅ ${sec}</div><div class="tlr" style="width:${W}px;${bg}"></div></div>`; return; }
    const small = d > 0 && n.status === '완료';
    const s = n.start || n.end, e = n.end || n.start;
    let bar = '';
    if (s) {
      const l = diff(min, s) * pxd, w = Math.max(pxd, (diff(s, e) + 1) * pxd) - 2, p = prog(n);
      bar = `<div class="bar d${Math.min(d, 2)} ${d === 0 ? 'p0' : ''}${isOverdue(n) ? ' late' : ''}${n.status === '완료' ? ' done' : ''}" data-act="edit" data-id="${n.id}" style="left:${l}px;width:${w}px;${toneVars(n, d)}" title="${esc(n.title)} · ${p}%"><i style="width:${p}%"></i></div><span class="pct${isOverdue(n) ? ' late' : ''}" style="left:${l + w + 6}px">${p}%</span>`;
    }
    h += `<div class="tlrow${small ? ' dsub' : ''}${d === 0 ? ' r0' : ''}" style="${toneVars(n, d)}"><div class="tll" data-act="edit" data-id="${n.id}" style="padding-left:${8 + d * 14}px;${toneVars(n, d)}">${guidesHTML(g, d, 14, 14)}${kids(n.id).length ? `<button class="tg tgl" data-act="toggle" data-id="${n.id}" title="${S.ui.collapsed[n.id] ? '하위 펼치기' : '하위 접기'}" aria-label="하위 접기/펼치기">${S.ui.collapsed[n.id] ? '▸' : '▾'}</button>` : '<i class="cd"></i>'}<span class="chip lvb ${n.kind === 'spot' ? 'spot' : 'mute'}">${n.kind === 'spot' ? '스팟' : LVS[d]}</span><b>${esc(n.title)}</b>${cntHTML(n)}${moodHTML(n)}${dragHandle(n.id)}</div><div class="tlr" style="width:${W}px;${bg}"><i class="today" style="left:${todayX + pxd / 2}px"></i>${bar}</div></div>`;
  });
  return h + `</div><span id="tlToday" data-x="${todayX}" hidden></span>`;
}

/* 캘린더 */
function calSet() {
  let a = S.items.filter(match);
  if (S.ui.calMode === 'leaf') a = a.filter(i => !kids(i.id).length);
  return a;
}
function covers(i, d) {
  if (S.ui.calMode === 'due') return (i.end || i.start) === d;
  const s = i.start || i.end, e = i.end || i.start;
  return !!s && s <= d && d <= e;
}
function calHTML() {
  const [y, m] = S.ui.calMonth.split('-').map(Number), t = todayS();
  const first = new Date(y, m - 1, 1), startD = new Date(y, m - 1, 1 - first.getDay());
  const set = calSet().sort((a, b) => (RK[b.importance] - RK[a.importance]));
  let h = `<div class="cal"><div class="calhd"><button class="ghost" data-act="calprev" aria-label="이전 달">‹</button><h2>${y}년 ${m}월</h2><button class="ghost" data-act="calnext" aria-label="다음 달">›</button><button class="ghost" data-act="caltoday">오늘</button>
<select id="calMode"><option value="leaf" ${S.ui.calMode === 'leaf' ? 'selected' : ''}>할일 위주</option><option value="all" ${S.ui.calMode === 'all' ? 'selected' : ''}>모든 항목</option><option value="due" ${S.ui.calMode === 'due' ? 'selected' : ''}>마감일만</option></select></div>
<div class="grid7">${['일', '월', '화', '수', '목', '금', '토'].map(d => `<div class="dow">${d}</div>`).join('')}`;
  for (let i = 0; i < 42; i++) {
    const dt = new Date(startD); dt.setDate(startD.getDate() + i);
    if (i >= 35 && dt.getMonth() !== m - 1) break;
    const ds = iso(dt), its = set.filter(x => covers(x, ds));
    h += `<div class="cell ${dt.getMonth() !== m - 1 ? 'out' : ''} ${ds === t ? 'td' : ''} ${ds === S.ui.calSel ? 'sel' : ''} ${dt.getDay() === 0 ? 'sun' : ''} ${dt.getDay() === 6 ? 'sat' : ''}" data-act="calsel" data-d="${ds}"><span class="dn">${dt.getDate()}</span>`;
    its.slice(0, 3).forEach(x => { h += `<button class="cc ${x.status === '완료' ? 'dn2' : ''}${x.end === ds && S.ui.calMode !== 'due' ? ' due' : ''}" style="${toneVars(x, depthOf(x))}${isOverdue(x) ? ';--c:var(--bad)' : ''}" data-act="edit" data-id="${x.id}">${moodHTML(x, 1)}${esc(x.title)}</button>`; });
    if (its.length > 3) h += `<div class="more">+${its.length - 3}개 더</div>`;
    h += '</div>';
  }
  h += '</div>';
  const sel = S.ui.calSel, list = set.filter(x => covers(x, sel));
  h += `<div class="agenda"><h3>${sel} (${'일월화수목금토'[parse(sel).getDay()]}) · ${list.length}건<button class="primary" data-act="caladd" data-d="${sel}">＋ 이 날짜에 추가</button></h3>`;
  list.forEach(x => { h += `<div class="ag" data-act="edit" data-id="${x.id}"><span class="chip ${x.kind === 'spot' ? 'spot' : 'mute'}">${x.kind === 'spot' ? '스팟' : LVS[depthOf(x)]}</span><b>${esc(x.title)}</b>${moodHTML(x)}<span class="hint">${esc(x.owner)}</span>${ddayHTML(x)}</div>`; });
  if (!list.length) h += '<div class="hint" style="padding:8px 4px">이 날짜의 일정이 없습니다.</div>';
  return h + '</div></div>';
}

/* ===== 모달 ===== */
const openModal = html => { $('#sheet').innerHTML = html; $('#modal').hidden = false; };
let formDirty = false, downOnOverlay = false;
const closeModal = () => { formDirty = false; $('#modal').hidden = true; $('#sheet').innerHTML = ''; };
const tryClose = () => { if (formDirty && !confirm('입력 중인 내용이 저장되지 않습니다. 닫을까요?')) return; closeModal(); };
// 입력칸에서 드래그(텍스트 선택)하다 팝업 바깥에서 손을 떼도 닫히지 않도록, 누른 위치도 확인
document.addEventListener('pointerdown', e => { downOnOverlay = e.target === $('#modal'); }, true);
const opts = (list, v) => list.map(x => `<option ${x === v ? 'selected' : ''}>${x}</option>`).join('');

function openForm(id, preset) {
  idx();
  const isNew = !id, it = isNew ? blank(preset) : M[id];
  const hasKids = !isNew && kids(id).length > 0;
  const h = isNew ? 0 : heightOf(it);
  const excl = isNew ? new Set() : new Set([id, ...subtree(id)]);
  const startLvl = it.kind === 'spot' ? 'spot' : String(it.parentId && M[it.parentId] ? depthOf(it) : 0);
  const cand = d => S.items.filter(p => p.kind === 'long' && !excl.has(p.id) && depthOf(p) === d - 1);
  const plabel = p => (p.parentId && M[p.parentId] ? M[p.parentId].title + ' › ' : '') + p.title;
  const rootOf = p => { let c = p; while (c && c.parentId && M[c.parentId]) c = M[c.parentId]; return c; };
  const ctxRoot = it.parentId && M[it.parentId] ? rootOf(M[it.parentId]) : null;   // ＋로 들어온(또는 수정 중인) 대단위
  const projs = () => S.items.filter(p => p.kind === 'long' && !p.parentId && !excl.has(p.id))
    .sort((x, y) => (ctxRoot ? (y.id === ctxRoot.id) - (x.id === ctxRoot.id) : 0) || x.title.localeCompare(y.title, 'ko'));
  const popts = (d, sel, proj) => (d === 1 ? projs() : cand(2).filter(p => rootOf(p).id === proj)).map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(d === 1 ? p.title : plabel(p))}</option>`).join('');
  const allowed = {'0': true, '1': h <= 1 && projs().length > 0, '2': h === 0 && projs().length > 0, spot: !hasKids};
  const lvHtml = [['0', '대단위 (프로젝트)'], ['1', '중단위'], ['2', '소단위'], ['spot', '스팟 업무']].map(([v, l]) =>
    `<label style="${allowed[v] ? '' : 'opacity:.4'}"><input type="radio" name="lvl" value="${v}" ${startLvl === v ? 'checked' : ''} ${allowed[v] ? '' : 'disabled'}>${l}</label>`).join('');
  const hintLv = !projs().length ? '중단위·소단위는 먼저 대단위(프로젝트)를 만든 뒤 추가할 수 있습니다.' : '';
  const rm = [7, 3, 1, 0].map(v => `<label><input type="checkbox" name="rm" value="${v}" ${(it.remind || []).includes(v) ? 'checked' : ''}>${v === 0 ? '당일' : v + '일 전'}</label>`).join('');
  openModal(`<form id="f"><h2>${isNew ? '새 항목' : '항목 수정'}</h2>
<div class="fl"><span>구분 (단계)</span><div class="ck">${lvHtml}</div>${hintLv ? `<div class="hint" style="margin-top:6px">${hintLv}</div>` : ''}</div>
<div class="fl" id="colorBox" style="display:none"><span>프로젝트 색상 (타임라인·캘린더에 표시)</span><div class="swatches">${PAL.map((hu, i) => `<label title="${PAL_NAME[i]}"><input type="radio" name="pc" value="${i}" ${(Number.isInteger(it.c) ? it.c % PAL.length : leastUsedColor()) === i ? 'checked' : ''}><i style="background:hsl(${hu} 64% 50%)"></i></label>`).join('')}</div></div>
<label class="fl" id="projBox" style="display:none"><span>대단위 (프로젝트)</span><select id="f_proj"></select></label>
<label class="fl" id="parentBox"><span id="parentLbl">상위 항목</span><select id="f_parent"></select></label>
<div class="hint" id="noMid" style="display:none;margin:-6px 0 12px"></div>
<label class="fl"><span>제목 *</span><input id="f_title" required value="${esc(it.title)}" placeholder="프로젝트 / 업무 제목"></label>
<div class="g2"><label class="fl"><span>시작일</span><input id="f_start" type="date" value="${it.start}"></label><label class="fl"><span>종료일(마감)</span><input id="f_end" type="date" value="${it.end}"></label></div>
${hasKids ? '<div class="hint" style="margin:-6px 0 12px">하위 항목이 있어 기간은 하위 항목을 모두 포함하도록 자동으로 넓어집니다.</div>' : ''}
<div class="g2"><label class="fl"><span>담당부서</span><input id="f_dept" list="dl_dept" value="${esc(it.dept)}"></label><label class="fl"><span>담당자</span><input id="f_owner" list="dl_owner" value="${esc(it.owner)}"></label></div>
<datalist id="dl_dept">${[...new Set(S.items.map(i => i.dept).filter(Boolean))].map(d => `<option value="${esc(d)}">`).join('')}</datalist>
<datalist id="dl_owner">${[...new Set(S.items.map(i => i.owner).filter(Boolean))].map(d => `<option value="${esc(d)}">`).join('')}</datalist>
<div class="g3"><label class="fl"><span>중요도</span><select id="f_imp">${opts(['상', '중', '하'], it.importance)}</select></label>
<label class="fl"><span>우선순위</span><select id="f_pri">${opts(['상', '중', '하'], it.priority)}</select></label>
<label class="fl"><span>상태</span><select id="f_status" ${hasKids ? 'disabled' : ''}>${opts(['예정', '진행중', '완료'], it.status)}</select></label></div>
<label class="fl"><span>진행률 <b id="f_pv">${hasKids ? prog(it) : it.progress}%</b>${hasKids ? ' (하위 항목 평균으로 자동 계산, 상태도 자동)' : ''}</span><input id="f_prog" type="range" min="0" max="100" step="5" value="${hasKids ? prog(it) : it.progress}" ${hasKids ? 'disabled' : ''}></label>
<div class="fl"><span>표시 설정</span><div class="ck"><label><input type="checkbox" id="f_td" ${isToday(it) ? 'checked' : ''}>오늘 할일에 추가</label><label><input type="checkbox" id="f_hide" ${it.hide ? 'checked' : ''}>목록에서 숨김</label></div></div>
<div class="fl"><span>마감 알림</span><div class="ck">${rm}</div></div>
<label class="fl"><span>메모</span><textarea id="f_memo" rows="3">${esc(it.memo)}</textarea></label>
<div class="actions"><button class="primary" type="submit">저장</button><button class="ghost" type="button" id="f_cancel">취소</button>${isNew ? '' : '<button class="danger" type="button" id="f_del">삭제</button>'}</div></form>`);
  const lvl = () => { const r = document.querySelector('input[name=lvl]:checked'); return r ? r.value : '0'; };
  const fill = () => {
    const v = lvl(), prj = $('#f_proj');
    const pj = prj.value || (ctxRoot && ctxRoot.id) || (projs()[0] && projs()[0].id);
    $('#f_parent').innerHTML = popts(+v, $('#f_parent').value || it.parentId, pj);
    const none = v === '2' && !$('#f_parent').options.length;
    $('#noMid').style.display = none ? '' : 'none';
    $('#noMid').textContent = none ? '선택한 대단위에 중단위가 없습니다. 다른 대단위를 고르거나, 먼저 중단위를 추가하세요.' : '';
    $('#parentBox').style.display = none ? 'none' : '';
  };
  const syncLevel = () => {
    const v = lvl(), box = $('#parentBox'), pb = $('#projBox');
    if (v === '1' || v === '2') {
      $('#parentLbl').textContent = v === '1' ? '상위 대단위(프로젝트) 선택' : '상위 중단위 선택';
      if (v === '2') {
        const cur = $('#f_proj').value || (ctxRoot && ctxRoot.id);
        $('#f_proj').innerHTML = projs().map(p => `<option value="${p.id}" ${p.id === cur ? 'selected' : ''}>${esc(p.title)}</option>`).join('');
        pb.style.display = '';
      } else pb.style.display = 'none';
      box.style.display = '';
      fill();
    } else { box.style.display = 'none'; pb.style.display = 'none'; $('#noMid').style.display = 'none'; }
    $('#colorBox').style.display = v === '0' ? '' : 'none';
  };
  $('#f_proj').onchange = () => { $('#f_parent').innerHTML = ''; fill(); };
  syncLevel();
  document.querySelectorAll('input[name=lvl]').forEach(r => { r.onchange = syncLevel; });
  $('#f_prog').oninput = e => {
    $('#f_pv').textContent = e.target.value + '%';
    const st = $('#f_status');
    if (+e.target.value === 100) st.value = '완료';
    else if (+e.target.value > 0 && st.value === '예정') st.value = '진행중';
    else if (st.value === '완료') st.value = '진행중';
  };
  $('#f_status').onchange = e => {
    if (hasKids) return;
    const p = $('#f_prog');
    if (e.target.value === '완료') p.value = 100;
    else if (+p.value === 100) p.value = 90;
    $('#f_pv').textContent = p.value + '%';
  };
  $('#f_cancel').onclick = tryClose;
  if (!isNew) $('#f_del').onclick = () => {
    const n = subtree(id).length;
    if (!confirm(n ? `이 항목과 하위 ${n}개를 모두 삭제할까요?` : '삭제할까요?')) return;
    const rmv = new Set([id, ...subtree(id)]);
    const now = Date.now(); rmv.forEach(x => { S.deleted[x] = now; });
    S.items = S.items.filter(i => !rmv.has(i.id));
    save(); closeModal(); render();
  };
  $('#f').addEventListener('input', () => { formDirty = true; });
  $('#f').addEventListener('change', () => { formDirty = true; });
  $('#f').onsubmit = ev => {
    ev.preventDefault();
    const v = k => $('#' + k).value.trim();
    const start = $('#f_start').value, end = $('#f_end').value;
    if (start && end && end < start) { alert('종료일은 시작일 이후여야 합니다.'); return; }
    const lv = lvl();
    const parentId = (lv === '1' || lv === '2') ? ($('#f_parent').value || null) : null;
    if ((lv === '1' || lv === '2') && !parentId) { alert('상위 항목을 선택하세요.'); return; }
    const kind = lv === 'spot' ? 'spot' : 'long';
    const o = {
      parentId, kind, title: v('f_title'), start, end,
      dept: v('f_dept'), owner: v('f_owner'), importance: $('#f_imp').value, priority: $('#f_pri').value,
      status: hasKids ? it.status : $('#f_status').value, progress: hasKids ? it.progress : +$('#f_prog').value, memo: $('#f_memo').value,
      remind: [...document.querySelectorAll('input[name=rm]:checked')].map(c => +c.value), td: $('#f_td').checked ? todayS() : '', hide: $('#f_hide').checked, u: Date.now()
    };
    if (!o.title) return;
    if (lv === '0') { const pc = document.querySelector('input[name=pc]:checked'); if (pc) o.c = +pc.value; } else delete it.c;
    if (!hasKids) {
      if (o.status === '완료') o.progress = 100;
      else if (o.progress >= 100) o.status = '완료';
      else if (o.progress > 0 && o.status === '예정') o.status = '진행중';
    }
    if (isNew) S.items.push(Object.assign(it, o));
    else Object.assign(it, o);
    idx();
    for (let c = M[it.parentId]; c; c = M[c.parentId]) delete S.ui.collapsed[c.id];   // 접힌 상위 항목은 자동으로 펼침
    save(); closeModal(); render(); checkAlerts();
    if (!match(it)) toast('현재 필터 조건 때문에 목록에 보이지 않을 수 있습니다');
  };
  setTimeout(() => { if (isNew) $('#f_title').focus(); }, 50);
}

function openBell() {
  const l = alertList();
  openModal(`<h2>마감 알림</h2>${l.length ? l.map(({i, d}) => `<div class="alrow" data-act="edit" data-id="${i.id}"><b>${esc(i.title)}</b><span class="hint">${esc(i.owner)} · ${i.end}</span>${ddayHTML(i)}</div>`).join('') : '<div class="hint" style="padding:12px 0">임박하거나 지연된 항목이 없습니다. 👍</div>'}
<div class="actions"><button class="ghost" id="m_close">닫기</button></div>`);
  $('#m_close').onclick = closeModal;
}

function openSettings() {
  const np = ('Notification' in window) ? Notification.permission : 'unsupported';
  const ptxt = {granted: '허용됨', denied: '차단됨 (브라우저/기기 설정에서 허용 필요)', default: '아직 요청 안 함', unsupported: '이 브라우저는 알림을 지원하지 않음'}[np];
  openModal(`<h2>설정</h2>
<div class="sec2">알림</div>
<div class="g2"><label class="fl"><span>알림 시각</span><input id="s_time" type="time" value="${S.settings.alertTime}"></label>
<div class="fl"><span>새 항목 기본 알림</span><div class="ck">${[7, 3, 1, 0].map(v => `<label><input type="checkbox" name="srm" value="${v}" ${S.settings.remind.includes(v) ? 'checked' : ''}>${v === 0 ? '당일' : v + '일 전'}</label>`).join('')}</div></div></div>
<div class="hint">브라우저 알림: <b>${ptxt}</b></div>
<div class="actions"><button class="ghost" id="s_perm">알림 권한 요청</button><button class="ghost" id="s_test">테스트 알림</button></div>
<div class="hint" style="margin-top:8px">※ 앱 알림은 앱(또는 설치한 홈 화면 앱)이 열려 있거나 백그라운드에 있을 때 동작합니다. 앱을 완전히 종료해도 알림을 받으려면 아래 <b>캘린더(.ics) 내보내기</b>를 사용하세요. 기기 기본 캘린더가 마감일 알림을 대신 울려줍니다.</div>
<div class="sec2">데이터</div>
<div class="actions"><button class="ghost" id="s_ics">캘린더(.ics) 내보내기</button><button class="ghost" id="s_json">백업(JSON)</button><button class="ghost" id="s_imp">복원</button><button class="ghost" id="s_csv">CSV 내보내기</button></div>
<input type="file" id="s_file" accept=".json,application/json" hidden>
<div class="hint" style="margin-top:8px">데이터는 이 기기의 브라우저에 저장됩니다. 기기 간 이동은 백업(JSON) → 복원으로 할 수 있습니다.</div>
<div class="sec2">설치</div>
<div class="hint">• <b>iPhone/iPad</b>: Safari → 공유 → <b>홈 화면에 추가</b><br>• <b>Mac</b>: Safari → 파일 → <b>Dock에 추가</b> (또는 Chrome 설치 아이콘)<br>• <b>Windows</b>: Edge/Chrome 주소창의 <b>설치</b> 아이콘</div>
<div class="actions"><button class="danger" id="s_clear">모든 데이터 삭제</button><button class="primary" id="s_ok">확인</button></div>`);
  const saveSet = () => {
    S.settings.alertTime = $('#s_time').value || '09:00';
    S.settings.remind = [...document.querySelectorAll('input[name=srm]:checked')].map(c => +c.value);
    save(); updatePushPrefs();
  };
  $('#s_ok').onclick = () => { saveSet(); closeModal(); checkAlerts(); };
  $('#s_perm').onclick = async () => {
    if (!('Notification' in window)) { toast('이 브라우저는 알림을 지원하지 않습니다'); return; }
    const r = await Notification.requestPermission(); toast('알림 권한: ' + r); saveSet(); openSettings();
  };
  $('#s_test').onclick = () => notify('🔔 테스트 알림', '알림이 정상 동작합니다.', true);
  $('#s_ics').onclick = () => { saveSet(); download('project-deadlines.ics', toICS(), 'text/calendar'); };
  $('#s_json').onclick = () => download('project-backup-' + todayS() + '.json', JSON.stringify({items: S.items, settings: S.settings}, null, 2), 'application/json');
  $('#s_csv').onclick = () => download('projects-' + todayS() + '.csv', '\ufeff' + toCSV(), 'text/csv');
  $('#s_imp').onclick = () => $('#s_file').click();
  $('#s_file').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (!Array.isArray(d.items)) throw 0;
        if (!confirm('현재 데이터를 백업 파일로 교체할까요?')) return;
        const now = Date.now(), nu = d.items.map(x => blank(Object.assign({}, x, {u: now}))), keep = new Set(nu.map(x => x.id));
        S.items.forEach(x => { if (!keep.has(x.id)) S.deleted[x.id] = now; });
        keep.forEach(k => { delete S.deleted[k]; });
        S.items = nu; if (d.settings) Object.assign(S.settings, d.settings);
        S.fired = {}; save(); closeModal(); render(); toast('복원 완료');
      } catch (err) { alert('올바른 백업 파일이 아닙니다.'); }
    };
    r.readAsText(f);
  };
  $('#s_clear').onclick = () => { if (confirm('모든 항목을 삭제할까요? (되돌릴 수 없음)')) { const now = Date.now(); S.items.forEach(x => { S.deleted[x.id] = now; }); S.items = []; S.fired = {}; save(); closeModal(); render(); } };
}

/* ===== 내보내기 ===== */
function download(name, text, type) {
  const b = new Blob([text], {type}), a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function toCSV() {
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  idx();
  const rows = [['구분', '레벨', '상위항목', '제목', '시작일', '종료일', '담당부서', '담당자', '중요도', '우선순위', '상태', '진행률(%)', '메모']];
  flatten().filter(r => !r.sec).forEach(({n, d}) => rows.push([n.kind === 'spot' ? '스팟' : '장기', n.kind === 'spot' ? '스팟' : LV[d], M[n.parentId] ? M[n.parentId].title : '', n.title, n.start, n.end, n.dept, n.owner, n.importance, n.priority, n.status, prog(n), n.memo]));
  return rows.map(r => r.map(q).join(',')).join('\r\n');
}
function toICS() {
  const ic = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const [hh, mm] = S.settings.alertTime.split(':').map(Number), at = hh * 60 + mm;
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ProjectManager//KO//', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:프로젝트 마감'];
  S.items.filter(i => i.end && i.status !== '완료').forEach(i => {
    const e = i.end.replace(/-/g, ''), e2 = addDays(i.end, 1).replace(/-/g, '');
    L.push('BEGIN:VEVENT', `UID:${i.id}@pm-app`, `DTSTAMP:${now}`, `DTSTART;VALUE=DATE:${e}`, `DTEND;VALUE=DATE:${e2}`,
      `SUMMARY:${ic('[마감] ' + i.title)}`, `DESCRIPTION:${ic([i.dept, i.owner, '중요도 ' + i.importance, i.memo].filter(Boolean).join(' / '))}`);
    (i.remind || []).forEach(r => {
      const min = r * 1440 - at;
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${ic(i.title)}`, `TRIGGER:${min > 0 ? '-' : ''}PT${Math.abs(min)}M`, 'END:VALARM');
    });
    L.push('END:VEVENT');
  });
  L.push('END:VCALENDAR');
  return L.join('\r\n');
}

/* ===== 알림 ===== */
async function notify(title, body, force) {
  toast(title + ' — ' + body);
  if (typeof SY !== 'undefined' && SY.push && !force) return; // 푸시가 켜져 있으면 OS 알림은 서버 푸시가 담당(중복 방지)
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg) { await reg.showNotification(title, {body, icon: 'icon-192.png', tag: title}); return; }
    } catch (e) {}
    try { new Notification(title, {body, icon: 'icon-192.png'}); } catch (e) {}
  }
}
function checkAlerts() {
  const now = new Date(), t = todayS(), [h, m] = S.settings.alertTime.split(':').map(Number);
  renderBadge();
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return;
  Object.keys(S.fired).forEach(k => { if (!k.endsWith(t)) delete S.fired[k]; });
  const list = [];
  S.items.forEach(i => {
    if (i.status === '완료' || !i.end) return;
    const d = diff(t, i.end);
    const key = d < 0 ? `${i.id}|over|${t}` : ((i.remind || []).includes(d) ? `${i.id}|${d}|${t}` : null);
    if (key && !S.fired[key]) { S.fired[key] = 1; list.push({i, d}); }
  });
  if (!list.length) return;
  save();
  if (list.length <= 3) list.forEach(({i, d}) => notify(d < 0 ? `⚠️ 마감 지연: ${i.title}` : `⏰ 마감 ${d === 0 ? '오늘' : d + '일 전'}: ${i.title}`, `${i.owner ? i.owner + ' · ' : ''}종료일 ${i.end}`));
  else notify(`⏰ 마감 알림 ${list.length}건`, list.slice(0, 3).map(x => x.i.title).join(', ') + ' 외');
}

/* ===== 이벤트 ===== */
document.addEventListener('click', e => {
  if (e.target === $('#modal')) { if (downOnOverlay) tryClose(); downOnOverlay = false; return; }
  if (e.target.closest('select,input,textarea')) return;
  const a = e.target.closest('[data-act]'); if (!a) return;
  const act = a.dataset.act, id = a.dataset.id;
  switch (act) {
    case 'view': S.ui.view = a.dataset.v; needScroll = true; $('#main').scrollTop = 0; break;
    case 'kind': S.ui.kind = a.dataset.k; break;
    case 'toggle': S.ui.collapsed[id] = !S.ui.collapsed[id]; break;
    case 'edit': if (!$('#modal').hidden) closeModal(); openForm(id); return;
    case 'addchild': { idx(); const p = M[id]; openForm(null, {parentId: id, dept: p.dept, owner: p.owner, start: todayS(), importance: p.importance, priority: p.priority}); return; }
    case 'new': openForm(null, {start: todayS()}); return;
    case 'gifpop': gifPop(a.getAttribute('src'), a.dataset.d); return;
    case 'collapseall': { idx(); const open = anyOpen(); S.items.forEach(i => { if (kids(i.id).length) S.ui.collapsed[i.id] = open; }); break; }
    case 'manual': freezeOrder(); toast('내 순서(끌어서 정한 순서)로 정렬합니다'); break;
    case 'sort': if (S.ui.sort === a.dataset.key) S.ui.dir *= -1; else { S.ui.sort = a.dataset.key; S.ui.dir = 1; } break;
    case 'zoom': S.ui.zoom = a.dataset.z; needScroll = true; break;
    case 'gotoday': needScroll = true; break;
    case 'calprev': case 'calnext': { const [y, m] = S.ui.calMonth.split('-').map(Number); const d = new Date(y, m - 1 + (act === 'calnext' ? 1 : -1), 1); S.ui.calMonth = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; break; }
    case 'caltoday': S.ui.calMonth = todayS().slice(0, 7); S.ui.calSel = todayS(); break;
    case 'calsel': S.ui.calSel = a.dataset.d; break;
    case 'caladd': openForm(null, {start: a.dataset.d, end: a.dataset.d}); return;
    case 'bell': openBell(); return;
    case 'settings': openSettings(); return;
    case 'sync': openSync(); return;
    case 'todaytoggle': S.ui.todayOpen = S.ui.todayOpen === false; break;
    case 'showhidden': S.ui.showHidden = !S.ui.showHidden; break;
    case 'hide': { idx(); const it = M[id]; it.hide = !it.hide; it.u = Date.now(); toast(it.hide ? '숨겼습니다 (상단 ‘숨김 항목 보기’로 다시 볼 수 있어요)' : '다시 표시합니다'); break; }
    case 'tdoff': { idx(); const it = M[id]; it.td = ''; it.u = Date.now(); break; }
  }
  save(); render();
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset && t.dataset.st) {
    idx(); const it = M[t.dataset.st]; it.status = t.value; it.u = Date.now();
    if (!kids(it.id).length) { if (t.value === '완료') it.progress = 100; else if (it.progress >= 100) it.progress = 90; else if (t.value === '예정') it.progress = it.progress; }
    save(); render(); return;
  }
  if (t.dataset && t.dataset.td) { idx(); const it = M[t.dataset.td]; it.td = t.checked ? todayS() : ''; it.u = Date.now(); save(); render(); return; }
  if (t.dataset && t.dataset.tdone) {
    idx(); const it = M[t.dataset.tdone]; it.status = t.checked ? '완료' : '진행중'; it.progress = t.checked ? 100 : Math.min(+it.progress || 0, 90); it.u = Date.now(); save(); render(); return;
  }
  if (t.id === 'fStatus') { S.ui.status = t.value; save(); render(); }
  else if (t.id === 'fDept') { S.ui.dept = t.value; save(); render(); }
  else if (t.id === 'calMode') { S.ui.calMode = t.value; save(); render(); }
});
$('#fQ').addEventListener('input', e => { S.ui.q = e.target.value; render(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') tryClose(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); checkAlerts(); syncNow(); } });

/* ===== 클라우드 동기화 (Supabase) ===== */
let SY = {};
try { SY = JSON.parse(localStorage.getItem('pm.sync')) || {}; } catch (e) {}
const saveSY = () => { try { localStorage.setItem('pm.sync', JSON.stringify(SY)); } catch (e) {} };
let syncState = 'off', syncMsg = '', syncing = false, syncTimer = null, lastHash = '';
const configured = () => !!(SY.url && SY.key && SY.refresh && SY.uid);
const dataHash = () => JSON.stringify([S.items, S.deleted]);
const sig = d => JSON.stringify([[...d.items].sort((a, b) => a.id < b.id ? -1 : 1).map(i => [i.id, i.u || 0]), Object.entries(d.deleted || {}).sort()]);

function setSync(state, msg) {
  syncState = state; syncMsg = msg || '';
  const b = $('#syncBtn'); if (!b) return;
  b.dataset.state = state;
  const bn = $('#syncBanner'); if (bn) bn.hidden = configured();
  b.title = {off: '동기화 꺼짐', ok: '동기화됨', busy: '동기화 중…', err: '동기화 오류'}[state] + (msg ? ' — ' + msg : '');
}
async function sfetch(path, opt, auth) {
  opt = opt || {};
  const h = Object.assign({apikey: SY.key, 'Content-Type': 'application/json'}, opt.headers || {});
  if (auth !== false) { await ensureToken(); h.Authorization = 'Bearer ' + SY.access; }
  const r = await fetch(SY.url + path, Object.assign({}, opt, {headers: h}));
  const txt = await r.text(); let j = null;
  try { j = txt ? JSON.parse(txt) : null; } catch (e) {}
  if (!r.ok) {
    const err = new Error((j && (j.msg || j.message || j.error_description || j.error)) || ('HTTP ' + r.status));
    err.status = r.status; throw err;
  }
  return j;
}
function applySession(j) {
  SY.access = j.access_token; SY.refresh = j.refresh_token || SY.refresh;
  SY.exp = Date.now() + (j.expires_in || 3600) * 1000;
  if (j.user && j.user.id) SY.uid = j.user.id;
  saveSY();
}
async function ensureToken() {
  if (SY.access && Date.now() < (SY.exp || 0) - 60000) return;
  try {
    applySession(await sfetch('/auth/v1/token?grant_type=refresh_token', {method: 'POST', body: JSON.stringify({refresh_token: SY.refresh})}, false));
  } catch (e) {
    if (e.status === 400 || e.status === 401) { SY.refresh = ''; SY.access = ''; saveSY(); e.message = '로그인이 만료되었습니다. 상단 구름 아이콘에서 다시 로그인하세요'; }
    throw e;
  }
}
async function authenticate(mode, url, key, email, pw) {
  SY = {url: url.replace(/\/+$/, ''), key, email};
  const j = await sfetch(mode === 'up' ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password', {method: 'POST', body: JSON.stringify({email, password: pw})}, false);
  if (!j || !j.access_token) { saveSY(); throw new Error('확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 [로그인]하세요 (Supabase에서 Confirm email을 끄면 생략됩니다)'); }
  applySession(j); SY.linked = false; saveSY();
}
function mergeData(a, b) {
  const del = Object.assign({}, b.deleted);
  Object.keys(a.deleted).forEach(k => { del[k] = Math.max(del[k] || 0, a.deleted[k]); });
  const m = {};
  [...b.items, ...a.items].forEach(i => { const c = m[i.id]; if (!c || (i.u || 0) > (c.u || 0)) m[i.id] = i; });
  Object.keys(m).forEach(id => { if (del[id] && del[id] >= (m[id].u || 0)) delete m[id]; });
  const cut = Date.now() - 90 * 864e5;
  Object.keys(del).forEach(k => { if (del[k] < cut) delete del[k]; });
  return {items: Object.values(m), deleted: del};
}
function queueSync() {
  if (!configured() || dataHash() === lastHash) return;
  clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(), 1500);
}
async function syncNow() {
  if (!configured() || syncing) return;
  if (navigator.onLine === false) { setSync('err', '오프라인 — 연결되면 자동 동기화'); return; }
  syncing = true; setSync('busy');
  let changed = false;
  try {
    for (let n = 0; n < 4; n++) {
      const rows = await sfetch(`/rest/v1/pm_state?select=data,rev&user_id=eq.${SY.uid}`);
      const row = rows && rows[0];
      const local = {items: S.items, deleted: S.deleted};
      let merged;
      if (!row) merged = local;
      else {
        const remote = {items: (row.data && row.data.items) || [], deleted: (row.data && row.data.deleted) || {}};
        if (!SY.linked && remote.items.length && S.items.length &&
            confirm('서버에 이미 데이터가 있습니다.\n\n[확인] 이 기기의 데이터를 버리고 서버 데이터 사용\n[취소] 이 기기 데이터와 서버 데이터를 합치기')) merged = remote;
        else merged = mergeData(local, remote);
        SY.linked = true; saveSY();
      }
      if (sig(merged) !== sig(local)) { S.items = merged.items; S.deleted = merged.deleted; saveLocal(); changed = true; }
      if (row && sig(row.data || {items: [], deleted: {}}) === sig(merged)) break;
      const body = {data: {items: merged.items, deleted: merged.deleted}, updated_at: new Date().toISOString()};
      let res;
      try {
        if (!row) res = await sfetch('/rest/v1/pm_state', {method: 'POST', headers: {Prefer: 'return=representation'}, body: JSON.stringify(Object.assign({user_id: SY.uid, rev: 1}, body))});
        else res = await sfetch(`/rest/v1/pm_state?user_id=eq.${SY.uid}&rev=eq.${row.rev}`, {method: 'PATCH', headers: {Prefer: 'return=representation'}, body: JSON.stringify(Object.assign({rev: row.rev + 1}, body))});
      } catch (e) { if (e.status === 409) continue; throw e; }
      if (res && res.length) break;
    }
    SY.linked = true; SY.last = Date.now(); saveSY();
    lastHash = dataHash();
    const d = new Date(SY.last);
    setSync('ok', `마지막 동기화 ${pad(d.getHours())}:${pad(d.getMinutes())}`);
    if (changed) { if (rollup()) save(); render(); }
  } catch (e) {
    setSync('err', e.message || '오류');
  } finally {
    syncing = false;
    if (configured() && dataHash() !== lastHash && syncState === 'ok') queueSync();
  }
}
/* --- 푸시 알림 (앱 종료 상태에서도 수신) --- */
const b64u = s => { const p = '='.repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); };
const tzName = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul'; } catch (e) { return 'Asia/Seoul'; } };
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
async function enablePush() {
  if (!configured()) throw new Error('먼저 동기화에 로그인하세요');
  if (!pushSupported()) throw new Error('이 기기에서는 푸시를 쓸 수 없습니다 (iPhone/iPad는 홈 화면에 추가한 앱에서만 가능, iOS 16.4 이상)');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('알림 권한이 허용되지 않았습니다 (기기 설정에서 허용해 주세요)');
  let pub;
  try {
    const r = await fetch(SY.url + '/functions/v1/send-reminders?action=key', {headers: {apikey: SY.key}});
    if (!r.ok) throw 0;
    pub = (await r.json()).publicKey;
    if (!pub) throw 0;
  } catch (e) { throw new Error('푸시 서버 함수에 연결할 수 없습니다. supabase-push.sql 안내대로 send-reminders 함수를 배포했는지 확인하세요'); }
  const reg = await navigator.serviceWorker.ready;
  const old = await reg.pushManager.getSubscription();
  if (old) await old.unsubscribe();
  const sub = await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: b64u(pub)});
  const j = sub.toJSON();
  await sfetch('/rest/v1/pm_push?on_conflict=endpoint', {
    method: 'POST', headers: {Prefer: 'resolution=merge-duplicates,return=minimal'},
    body: JSON.stringify({user_id: SY.uid, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, tz: tzName(), alert_time: S.settings.alertTime, label: navigator.platform || 'device', last_sent: null})
  });
  SY.push = true; saveSY();
}
async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
    if (sub) {
      const ep = sub.endpoint; await sub.unsubscribe();
      if (configured()) await sfetch('/rest/v1/pm_push?endpoint=eq.' + encodeURIComponent(ep), {method: 'DELETE'}).catch(() => {});
    }
  } catch (e) {}
  SY.push = false; saveSY();
}
async function updatePushPrefs() {
  if (!configured() || !SY.push || !pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
    if (!sub) { SY.push = false; saveSY(); return; }
    await sfetch('/rest/v1/pm_push?endpoint=eq.' + encodeURIComponent(sub.endpoint), {method: 'PATCH', body: JSON.stringify({alert_time: S.settings.alertTime, tz: tzName()})});
  } catch (e) {}
}
async function testPush() {
  await ensureToken();
  const r = await fetch(SY.url + '/functions/v1/send-reminders?action=test', {method: 'POST', headers: {apikey: SY.key, Authorization: 'Bearer ' + SY.access}});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
  return j;
}

function initSync() {
  setSync(configured() ? 'ok' : 'off', configured() ? '' : '');
  if (configured()) { syncNow(); updatePushPrefs(); }
  setInterval(() => { if (!document.hidden) syncNow(); }, 30000);
  window.addEventListener('online', () => syncNow());
  window.addEventListener('focus', () => syncNow());
}
function openSync() {
  if (configured()) {
    const last = SY.last ? new Date(SY.last).toLocaleString('ko-KR') : '-';
    const pSup = pushSupported(), pOn = !!SY.push && pSup && Notification.permission === 'granted';
    openModal(`<h2>동기화</h2>
<div class="hint">계정: <b>${esc(SY.email || '')}</b><br>상태: <b>${{ok: '정상', busy: '동기화 중…', err: '오류', off: '꺼짐'}[syncState]}</b>${syncMsg ? ' (' + esc(syncMsg) + ')' : ''}<br>마지막 동기화: ${esc(last)}</div>
<div class="hint" style="margin-top:8px">수정하면 몇 초 안에 서버로 올라가고, 다른 기기는 앱을 열거나 30초마다 자동으로 받아옵니다. 같은 항목을 동시에 고치면 나중에 저장한 쪽이 적용됩니다.</div>
<div class="sec2">푸시 알림 (앱을 완전히 종료해도 수신)</div>
<div class="hint">${pSup ? `상태: <b>${pOn ? '켜짐' : '꺼짐'}</b> · 알림 시각 ${esc(S.settings.alertTime)} (설정에서 변경)<br>기기마다 따로 켜야 합니다.` : '이 브라우저/기기는 푸시를 지원하지 않습니다. <b>iPhone·iPad</b>는 Safari에서 <b>홈 화면에 추가</b>한 앱으로 열어야 합니다 (iOS 16.4 이상).'}</div>
<div class="actions">${pSup ? (pOn ? '<button class="ghost" id="y_ptest">테스트 푸시</button><button class="ghost" id="y_poff">이 기기 푸시 끄기</button>' : '<button class="primary" id="y_pon">이 기기 푸시 켜기</button>') : ''}</div>
<div class="actions"><button class="primary" id="y_now">지금 동기화</button><button class="danger" id="y_out">연결 해제</button><button class="ghost" id="y_close">닫기</button></div>`);
    $('#y_now').onclick = async () => { await syncNow(); openSync(); };
    $('#y_out').onclick = async () => {
      if (!confirm('이 기기의 동기화 연결을 해제할까요? (이 기기의 데이터는 그대로 남고, 푸시도 꺼집니다)')) return;
      await disablePush();
      SY = {url: SY.url, key: SY.key, email: SY.email}; saveSY(); setSync('off'); closeModal();
    };
    $('#y_close').onclick = closeModal;
    const bOn = $('#y_pon'), bOff = $('#y_poff'), bTest = $('#y_ptest');
    if (bOn) bOn.onclick = async () => { try { await enablePush(); toast('이 기기의 푸시가 켜졌습니다'); } catch (e) { alert('실패: ' + e.message); } openSync(); };
    if (bOff) bOff.onclick = async () => { await disablePush(); toast('이 기기의 푸시를 껐습니다'); openSync(); };
    if (bTest) bTest.onclick = async () => {
      try { const j = await testPush(); toast(j.sent ? `테스트 푸시 전송: ${j.sent}대` : '등록된 기기가 없거나 전송에 실패했습니다'); }
      catch (e) { alert('실패: ' + e.message); }
    };
    return;
  }
  openModal(`<h2>기기 간 동기화 설정</h2>
<div class="hint">무료 Supabase 프로젝트가 필요합니다. 만드는 방법은 함께 드린 <b>supabase-setup.sql</b> 상단 안내를 따라 하세요. 모든 기기에서 <b>같은 URL·키·이메일</b>로 로그인하면 됩니다.</div>
<label class="fl" style="margin-top:10px"><span>Project URL</span><input id="y_url" placeholder="https://xxxx.supabase.co" value="${esc(SY.url || '')}" autocapitalize="off" autocorrect="off"></label>
<label class="fl"><span>anon public key</span><input id="y_key" value="${esc(SY.key || '')}" autocapitalize="off" autocorrect="off"></label>
<div class="g2"><label class="fl"><span>이메일</span><input id="y_email" type="email" value="${esc(SY.email || '')}" autocomplete="username"></label>
<label class="fl"><span>비밀번호 (6자 이상)</span><input id="y_pw" type="password" autocomplete="current-password"></label></div>
<div class="actions"><button class="primary" id="y_in">로그인</button><button class="ghost" id="y_up">새 계정 만들기</button><button class="ghost" id="y_close">닫기</button></div>`);
  const go = async mode => {
    const url = $('#y_url').value.trim(), key = $('#y_key').value.trim(), em = $('#y_email').value.trim(), pw = $('#y_pw').value;
    if (!/^https:\/\//.test(url) || !key || !em || pw.length < 6) { alert('https:// 로 시작하는 URL, anon key, 이메일, 비밀번호(6자 이상)를 모두 입력하세요.'); return; }
    try {
      setSync('busy'); await authenticate(mode, url, key, em, pw);
      closeModal(); await syncNow(); toast(syncState === 'ok' ? '동기화가 연결되었습니다' : '동기화 오류: ' + syncMsg);
    } catch (e) { setSync('off'); alert('실패: ' + e.message); }
  };
  $('#y_in').onclick = () => go('in');
  $('#y_up').onclick = () => go('up');
  $('#y_close').onclick = closeModal;
}

/* ===== 시작 ===== */
load(); save(); render(); checkAlerts();
$('#fQ').value = S.ui.q;
setInterval(checkAlerts, 60000);
initSync();
{ const q = new URLSearchParams(location.search);   // 홈 화면 아이콘 길게 누르기 바로가기
  if (['table', 'timeline', 'calendar'].includes(q.get('view'))) { S.ui.view = q.get('view'); render(); }
  if (q.get('new') === '1') { openForm(null, {start: todayS()}); history.replaceState(null, '', location.pathname); } }
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
