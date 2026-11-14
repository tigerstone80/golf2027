/* 2027 골프여행 웹앱 */
(function () {
'use strict';

// ───────── 표 정의 (apps-script/Code.gs 의 TABLES 와 키가 같아야 함) ─────────
const TABLE_KEYS = ['settings', 'members', 'schedule', 'rounds', 'scores', 'sponsors', 'expenses', 'photos'];
const CATEGORIES = ['골프장', '숙소', '차량', '식사', '캐디피·카트비', '시상·기념품', '기타'];
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

// ───────── 처음 데이터 (멤버·장소 미정: 가상의 8명 A~H) ─────────
function seedData() {
  // [이름, 핸디(빈칸 = 미정), 비고]
  const M = {
    A: ['현요섭', '8', '25년 챔피언'], B: ['선민영', '23', '24년 챔피언'], C: ['최돈흥', '17', '26년 챔피언'], D: ['김용욱', '24', ''],
    E: ['권순관', '', ''], F: ['김경래', '15', ''], G: ['오범석', '15', ''], H: ['H', '', ''],
  };
  // 조 편성은 관리자가 직접 (일차마다 1조·2조 빈 칸만 준비)
  const rounds = [];
  [1, 2, 3, 4].forEach(d => {
    rounds.push({ day: String(d), course: '미정', coursePart: '', group: '1조', tee: '', players: '', note: '' });
    rounds.push({ day: String(d), course: '미정', coursePart: '', group: '2조', tee: '', players: '', note: '' });
  });
  return {
    settings: [
      { key: 'title', value: '2027 골프여행' },
      { key: 'place', value: '장소 미정' },
      { key: 'startDate', value: '2027-01-18' },
      { key: 'endDate', value: '2027-01-21' },
      { key: 'fee', value: '1300000' },
      { key: 'minRounds', value: '3' },
      { key: 'par', value: '72' },
      { key: 'notice', value: '' },
    ],
    members: Object.values(M).map(([name, hcp, note]) => ({ name, hcp, paid: '0', note })),
    schedule: [
      { day: '1', time: '07:00', content: '출발', note: '' },
      { day: '1', time: '12:00', type: '라운딩', content: '골프장 미정', note: '' },
      { day: '1', time: '18:00', content: '숙소 체크인 · 저녁식사', note: '' },
      { day: '2', time: '06:30', content: '기상 및 아침식사', note: '' },
      { day: '2', time: '08:00', type: '라운딩', content: '골프장 미정', note: '' },
      { day: '2', time: '18:00', content: '저녁식사 · 휴식', note: '' },
      { day: '3', time: '06:30', content: '기상 및 아침식사', note: '' },
      { day: '3', time: '08:00', type: '라운딩', content: '골프장 미정', note: '' },
      { day: '3', time: '18:00', content: '저녁식사 · 휴식', note: '' },
      { day: '4', time: '06:30', content: '기상 및 아침식사', note: '' },
      { day: '4', time: '08:00', type: '라운딩', content: '골프장 미정', note: '' },
      { day: '4', time: '13:00', content: '점심 · 시상식 · 귀가', note: '' },
    ],
    rounds,
    scores: [],
    sponsors: [],
    expenses: [],
  };
}

// ───────── 유틸 ─────────
const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };
const has = v => String(v == null ? '' : v).replace(/[^0-9]/g, '') !== '';
const won = n => Math.round(n).toLocaleString('ko-KR') + '원';
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const splitNames = s => String(s || '').split(/[,·\/]/).map(x => x.trim()).filter(Boolean);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 무시 */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* 무시 */ } },
};

// ───────── 계산 로직 ─────────
function settingsMap(data) {
  const m = {};
  (data.settings || []).forEach(r => { m[r.key] = r.value; });
  return m;
}

function tripDays(S) {
  const start = new Date((S.startDate || '2027-01-18') + 'T00:00:00');
  const end = new Date((S.endDate || S.startDate || '2027-01-21') + 'T00:00:00');
  const days = [];
  for (let d = new Date(start), i = 1; d <= end && i <= 14; d.setDate(d.getDate() + 1), i++) {
    days.push({ n: i, date: new Date(d), label: `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})`, short: `${d.getMonth() + 1}/${d.getDate()}(${WEEK[d.getDay()]})` });
  }
  return days;
}

// 일자별 결과: 타수가 입력된 사람만, 핸디적용타수(net) = 타수 - 핸디, 동점은 공동순위
function dayResults(data, day) {
  const rows = (data.scores || [])
    .filter(s => String(s.day) === String(day) && has(s.gross) && num(s.gross) > 0)
    .map(s => ({ name: s.name, gross: num(s.gross), hcp: num(s.hcp), net: num(s.gross) - num(s.hcp) }));
  rows.sort((a, b) => a.net - b.net || a.gross - b.gross);
  rows.forEach((r, i) => { r.rank = i > 0 && rows[i - 1].net === r.net ? rows[i - 1].rank : i + 1; });
  const best = rows.length ? Math.min(...rows.map(r => r.gross)) : null;
  rows.forEach(r => { r.medalist = r.gross === best; });
  return rows;
}

// 종합: 평균 핸디적용타수로 순위. 최소 라운드 수(진행된 라운드 수를 넘지 않게) 미만은 순위 제외
function overallResults(data) {
  const S = settingsMap(data);
  const par = num(S.par) || 72;
  const days = tripDays(S).map(d => d.n);
  const playedDays = days.filter(d => dayResults(data, d).length > 0);
  const need = Math.max(1, Math.min(num(S.minRounds) || 1, playedDays.length));
  const names = [];
  (data.members || []).forEach(m => { if (m.name && !names.includes(m.name)) names.push(m.name); });
  (data.scores || []).forEach(s => { if (s.name && !names.includes(s.name)) names.push(s.name); });

  const rows = names.map(name => {
    const per = {};
    days.forEach(d => {
      const r = dayResults(data, d).find(x => x.name === name);
      if (r) per[d] = r;
    });
    const list = Object.values(per);
    const cnt = list.length;
    const totalGross = list.reduce((a, r) => a + r.gross, 0);
    const totalNet = list.reduce((a, r) => a + r.net, 0);
    const avgGross = cnt ? totalGross / cnt : null;
    const avgNet = cnt ? totalNet / cnt : null;
    const member = (data.members || []).find(m => m.name === name);
    return {
      name, per, cnt, totalGross, totalNet, avgGross, avgNet,
      hcp: member ? num(member.hcp) : null,
      nextHcp: cnt ? Math.max(0, Math.floor(avgGross) - par) : null,
      qualified: cnt >= need && cnt > 0,
    };
  });
  const q = rows.filter(r => r.qualified).sort((a, b) => a.avgNet - b.avgNet || a.avgGross - b.avgGross);
  q.forEach((r, i) => { r.rank = i > 0 && Math.abs(q[i - 1].avgNet - r.avgNet) < 1e-9 ? q[i - 1].rank : i + 1; });
  const rest = rows.filter(r => !r.qualified).sort((a, b) => b.cnt - a.cnt || a.name.localeCompare(b.name, 'ko'));
  return { ranked: q, rest, need, playedDays: playedDays.length, par };
}

function moneySummary(data) {
  const S = settingsMap(data);
  const fee = num(S.fee);
  const members = (data.members || []).filter(m => m.name);
  const n = members.length || 1;
  const duesPaid = members.reduce((a, m) => a + num(m.paid), 0);
  const duesExpected = fee * members.length;
  const sponsor = (data.sponsors || []).reduce((a, s) => a + num(s.amount), 0);
  const income = duesPaid + sponsor;
  const spent = (data.expenses || []).reduce((a, e) => a + num(e.amount), 0);
  const balance = income - spent;
  const byCat = {};
  (data.expenses || []).forEach(e => { const c = e.category || '기타'; byCat[c] = (byCat[c] || 0) + num(e.amount); });
  // 정산: (지출 - 찬조금) 을 인원수로 나눈 금액이 1인 부담액. 납부액과의 차이로 환급/추가납부
  const share = Math.max(0, spent - sponsor) / n;
  const settle = members.map(m => ({ name: m.name, paid: num(m.paid), unpaid: Math.max(0, fee - num(m.paid)), diff: num(m.paid) - share }));
  return { fee, duesPaid, duesExpected, sponsor, income, spent, balance, byCat, share, settle, count: members.length };
}

// node 에서 계산 로직 테스트용
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { seedData, dayResults, overallResults, moneySummary, tripDays, settingsMap };
  return;
}

// ───────── 데이터 연결 (구글 시트 or 체험 모드) ─────────
const API = ((window.APP_CONFIG || {}).API_URL || '').trim();
const DEMO = !API;
const CACHE_KEY = 'golf2027.cache';
const DEMO_KEY = 'golf2027.demo';
const PIN_KEY = 'golf2027.pin';

let data = null;
let tab = 'schedule';
let scoreTab = 'all';
let adminTab = 'expenses';
let adminPin = store.get(PIN_KEY) || '';
let draft = null; // 관리자 편집 중인 표 사본
let draftKey = null;
let dirty = false;
let scoreDay = null;

function normalize(d) {
  const o = {};
  TABLE_KEYS.forEach(k => { o[k] = Array.isArray(d && d[k]) ? d[k] : []; });
  return o;
}
function isEmpty(d) { return TABLE_KEYS.every(k => !d[k].length); }

async function loadData(showSpin) {
  const btn = document.getElementById('refresh');
  if (showSpin) btn.classList.add('spin');
  try {
    if (DEMO) {
      const saved = store.get(DEMO_KEY);
      data = normalize(saved ? JSON.parse(saved) : seedData());
    } else {
      const res = await fetch(API + (API.includes('?') ? '&' : '?') + 't=' + Date.now());
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || '불러오기 실패');
      data = normalize(j.data);
      store.set(CACHE_KEY, JSON.stringify(data));
    }
  } catch (e) {
    if (!data) {
      const c = store.get(CACHE_KEY);
      data = normalize(c ? JSON.parse(c) : {});
    }
    toast('최신 데이터를 불러오지 못했어요. 잠시 후 새로고침해 주세요.', true);
  } finally {
    btn.classList.remove('spin');
  }
  if (!dirty) render();
}

async function post(body) {
  if (DEMO) {
    if (String(body.pin) !== '1234') return { ok: false, error: 'PIN이 올바르지 않습니다. (체험 모드 PIN: 1234)' };
    if (body.action === 'save') data[body.table] = body.rows;
    if (body.action === 'saveMany') Object.assign(data, body.tables);
    store.set(DEMO_KEY, JSON.stringify(data));
    return { ok: true, data };
  }
  const res = await fetch(API, { method: 'POST', body: JSON.stringify(body) }); // text/plain → CORS 사전요청 없음
  return res.json();
}

async function saveTable(key, rows) {
  try {
    const j = await post({ pin: adminPin, action: 'save', table: key, rows });
    if (!j.ok) { toast(j.error || '저장 실패', true); return false; }
    if (j.data) data = normalize(j.data); else data[key] = rows;
    if (!DEMO) store.set(CACHE_KEY, JSON.stringify(data));
    toast('저장했어요 ✓');
    return true;
  } catch (e) {
    toast('저장하지 못했어요. 인터넷 연결을 확인해 주세요.', true);
    return false;
  }
}

// 일정의 '라운딩' 골프장 이름을 같은 일차의 라운딩(조 편성) 골프장 칸에 똑같이 넣음
async function syncCourses(sched) {
  const byDay = {};
  sched.filter(s => s.type === '라운딩' && String(s.content || '').trim()).forEach(s => {
    const k = String(s.day), name = String(s.content).trim();
    byDay[k] = byDay[k] || [];
    if (!byDay[k].includes(name)) byDay[k].push(name);
  });
  const rounds = clone(data.rounds || []);
  let changed = false;
  Object.keys(byDay).forEach(day => {
    const name = byDay[day].join(', ');
    const rs = rounds.filter(r => String(r.day) === day);
    if (!rs.length) { rounds.push({ day, course: name, coursePart: '', group: '1조', tee: '', players: '', note: '' }); changed = true; }
    rs.forEach(r => { if (r.course !== name) { r.course = name; changed = true; } });
  });
  if (changed && await saveTable('rounds', rounds)) toast('라운딩의 골프장 이름도 함께 바꿨어요');
}

// ───────── 스코어카드 사진 ─────────
const photoUrl = (id, w) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${w}`;

function scorePhotosCard(days) {
  const counts = days.map(d => ({ d, n: (data.photos || []).filter(p => String(p.day) === String(d.n)).length }));
  return `<section class="card">
    <h3 style="margin-bottom:8px">📷 일자별 스코어카드</h3>
    <div class="grid2">${counts.map(x => `<button class="btn ghost" data-photos="${x.d.n}" ${x.n ? '' : 'disabled'}>${x.d.n}일차 스코어 상세보기${x.n ? '' : ' (없음)'}</button>`).join('')}</div>
  </section>`;
}

function showPhotos(day) {
  const list = (data.photos || []).filter(p => String(p.day) === String(day))
    .sort((a, b) => String(a.group).localeCompare(String(b.group), 'ko'));
  const wrap = document.createElement('div');
  wrap.className = 'modal photomodal';
  wrap.innerHTML = `<div class="pbox"><div class="row between"><h3>${esc(day)}일차 스코어카드</h3><button class="btn small ghost" data-close>닫기</button></div>
    ${list.map(p => `<figure><figcaption>${esc(p.group)}</figcaption><a href="https://drive.google.com/file/d/${encodeURIComponent(p.fileId)}/view" target="_blank" rel="noopener"><img src="${photoUrl(p.fileId, 1600)}" alt="${esc(p.group)} 스코어카드" loading="lazy"></a></figure>`).join('') || '<div class="empty">사진이 없어요</div>'}
    <div class="note">사진을 누르면 크게 볼 수 있어요.</div></div>`;
  wrap.addEventListener('click', e => { if (e.target === wrap || e.target.closest('[data-close]')) wrap.remove(); });
  document.body.appendChild(wrap);
}

// 핸드폰 사진을 긴 변 max 픽셀 JPEG로 줄여 base64로 만듦
function imageToJpegB64(file, max) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.88).split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('사진을 열 수 없어요')); };
    img.src = url;
  });
}

// 인식 결과를 타수 칸에 채움 (저장은 사람이 확인 후)
function applyOcr(result, warn, typed) {
  const v = document.getElementById('view');
  const rowsEl = [...v.querySelectorAll('.scorein')];
  rowsEl.forEach(r => { const t = typed[r.dataset.name]; if (t) { r.querySelector('.sg').value = t.g; r.querySelector('.sh').value = t.h; r.querySelector('.sg').dispatchEvent(new Event('input')); } });
  const box = document.getElementById('ocrResult');
  if (!box) return;
  if (!result) { box.innerHTML = `<div class="ocr">사진은 저장했어요.${warn ? `<div class="note">자동 인식은 못 했어요: ${esc(warn)}</div>` : ''}</div>`; return; }
  const norm = s => String(s || '').replace(/\s/g, '');
  let filled = 0;
  const lines = (result.players || []).map(p => {
    const row = rowsEl.find(r => norm(r.dataset.name) === norm(p.name));
    const sumOk = num(p.front) + num(p.back) === num(p.total);
    if (row && num(p.total) > 0) {
      const inp = row.querySelector('.sg');
      inp.value = num(p.total); inp.classList.add('auto'); inp.dispatchEvent(new Event('input'));
      filled++;
    }
    return `<li><b>${esc(p.name)}</b> ${num(p.total)}타 <span class="meta">(${num(p.front)}+${num(p.back)})</span>${sumOk ? '' : ' <span class="chip red">합계 확인</span>'}${row ? '' : ' <span class="chip red">참가자에 없음</span>'}</li>`;
  });
  box.innerHTML = `<div class="ocr"><b>읽은 결과</b>${result.course ? ' · ' + esc(result.course) : ''}${result.date ? ' · ' + esc(result.date) : ''}
    <ul>${lines.join('')}</ul>
    <div class="note">${filled}명 타수를 채웠어요(초록 칸). 확인한 뒤 아래 '${scoreDay}일차 스코어 저장'을 눌러 주세요.</div></div>`;
}

// 확인 창 (브라우저 confirm 대신 화면 안에 표시)
function ask(msg) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.innerHTML = `<div class="box"><p>${esc(msg)}</p><div class="grid2"><button class="btn ghost" data-a="0">취소</button><button class="btn" data-a="1">확인</button></div></div>`;
    wrap.addEventListener('click', e => {
      const b = e.target.closest('[data-a]');
      if (!b && e.target !== wrap) return;
      wrap.remove();
      resolve(!!b && b.dataset.a === '1');
    });
    document.body.appendChild(wrap);
  });
}

let toastTimer;
function toast(msg, err) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 2600);
}

// ───────── 화면 ─────────
function render() {
  const S = settingsMap(data);
  const days = tripDays(S);
  document.title = S.title || '2027 골프여행';
  document.getElementById('title').textContent = S.title || '2027 골프여행';
  const first = days[0], last = days[days.length - 1];
  document.getElementById('subtitle').textContent =
    `${S.place || '장소 미정'} · ${first ? first.short : ''}${last && last !== first ? ' ~ ' + last.short : ''}`;
  let extra = '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (first) {
    const diff = Math.round((first.date - today) / 86400000);
    const lastDiff = Math.round((last.date - today) / 86400000);
    const txt = diff > 0 ? `D-${diff}` : lastDiff >= 0 ? `여행 ${1 - diff}일차 ⛳` : '여행 완료 🏆';
    extra += `<span class="dday">${txt}</span>`;
  }
  if (S.notice) extra += `<div class="notice">📢 ${esc(S.notice)}</div>`;
  if (DEMO) extra += `<div><span class="mode">체험 모드 · 이 기기에만 저장돼요</span></div>`;
  document.getElementById('heroExtra').innerHTML = extra;

  document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  const v = document.getElementById('view');
  const fn = { schedule: viewSchedule, rounds: viewRounds, scores: viewScores, money: viewMoney, members: viewMembers, admin: viewAdmin }[tab];
  v.innerHTML = fn(S, days);
  if (tab === 'admin') bindAdmin();
  if (tab === 'schedule') { const ms = document.getElementById('meSel'); if (ms) ms.onchange = () => { store.set(ME_KEY, ms.value); render(); }; }
}

function todayN(days) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const d = days.find(x => x.date.getTime() === t.getTime());
  return d ? d.n : null;
}

function roundsOf(day) {
  return (data.rounds || []).filter(r => String(r.day) === String(day))
    .sort((a, b) => String(a.tee).localeCompare(String(b.tee)) || String(a.group).localeCompare(String(b.group), 'ko'));
}

// ───────── 오늘 요약 · 길찾기 · 공유 ─────────
const ME_KEY = 'golf2027.me';
function mapLinks(q) {
  q = String(q || '').trim();
  if (!q || /미정/.test(q)) return '';
  const e = encodeURIComponent(q);
  return `<div class="maps"><a href="https://map.naver.com/p/search/${e}" target="_blank" rel="noopener">📍 네이버지도</a></div>`;
}

function todayCard(days) {
  if (!days.length) return '';
  const t = new Date(); t.setHours(0, 0, 0, 0);
  let n = todayN(days), title = '☀️ 오늘';
  if (!n) {
    if (t < days[0].date) { n = 1; title = '👀 첫날 미리보기'; } else return '';
  }
  const d = days.find(x => x.n === n);
  const items = (data.schedule || []).filter(s => String(s.day) === String(n)).sort((a, b) => String(a.time).localeCompare(String(b.time)));
  const golf = items.filter(s => s.type === '라운딩');
  const stay = items.filter(s => s.type === '숙소');
  const groups = roundsOf(n).filter(r => splitNames(r.players).length);
  const me = store.get(ME_KEY) || '';
  const members = (data.members || []).filter(m => m.name);
  const mine = me ? groups.find(r => splitNames(r.players).includes(me)) : null;
  const line = (tag, list, empty) => `<div class="tc-line">${tag}<div>${list.length ? list.map(s => `<div><b>${esc(s.content || empty)}</b>${s.time ? ` <span class="meta">${esc(s.time)}</span>` : ''}${mapLinks(s.content)}</div>`).join('') : `<span class="meta">${empty}</span>`}</div></div>`;
  return `<section class="card todaycard">
    <div class="row between"><h3>${title}</h3><span class="chip">${n}일차 · ${d.short}</span></div>
    <div class="tc-me"><span>나는</span><select id="meSel"><option value="">이름 선택</option>${members.map(m => `<option ${m.name === me ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>
    ${mine ? `<div class="tc-mine">내 조 <b>${esc(mine.group || '')}</b> · 티타임 <b>${esc(mine.tee || '미정')}</b><br><span class="meta">함께: ${splitNames(mine.players).filter(x => x !== me).map(esc).join(', ') || '-'}</span></div>` : ''}
    <div class="tc-sec">
      ${line('<span class="evtag round">⛳ 라운딩</span>', golf, '골프장 미정')}
      ${groups.map(r => `<div class="tc-group ${r === mine ? 'mine' : ''}"><b>${esc(r.group || '')}</b><span class="tee">${esc(r.tee || '시간 미정')}</span><span>${splitNames(r.players).map(esc).join(', ')}</span></div>`).join('')}
      ${line('<span class="evtag stay">🏨 숙소</span>', stay, '숙소 미정')}
    </div>
  </section>`;
}

async function shareText(text) {
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    ta.remove();
  }
  toast(ok ? '복사했어요. 단톡방에 붙여넣으세요' : '복사하지 못했어요', !ok);
}

function buildShare(kind) {
  const S = settingsMap(data);
  const title = S.title || '2027 골프여행';
  const link = location.href.split('#')[0].split('?')[0];
  const medal = r => r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : `${r.rank}.`;
  const lines = [];
  if (kind === 'day') {
    const days = tripDays(S);
    const d = days.find(x => String(x.n) === String(scoreTab)) || days[0];
    const course = [...new Set(roundsOf(d.n).map(r => r.course).filter(c => c && c !== '미정'))].join(', ');
    lines.push(`[${title}] ${d.n}일차 결과 (${d.short}${course ? ' · ' + course : ''})`);
    dayResults(data, d.n).forEach(r => lines.push(`${medal(r)} ${r.name} ${r.gross}타 - 핸디 ${r.hcp} = ${r.net}`));
  } else if (kind === 'all') {
    const o = overallResults(data);
    lines.push(`[${title}] 종합 순위 (${o.playedDays}라운드 진행)`);
    o.ranked.forEach(r => lines.push(`${medal(r)} ${r.name} 평균 핸디적용 ${f1(r.avgNet)} (평균 ${f1(r.avgGross)}타 · ${r.cnt}R)`));
  } else {
    const m = moneySummary(data);
    lines.push(`[${title}] 경비 현황`);
    lines.push(`남은 회비 ${won(m.balance)}`);
    lines.push(`수입 ${won(m.income)} (회비 ${won(m.duesPaid)} + 찬조 ${won(m.sponsor)})`);
    lines.push(`지출 ${won(m.spent)}`);
    const unpaid = m.settle.filter(p => p.unpaid > 0);
    if (unpaid.length) lines.push(`미납: ${unpaid.map(p => `${p.name} ${won(p.unpaid)}`).join(', ')}`);
    if (m.spent > 0) lines.push(`예상 1인 부담 ${won(m.share)}`);
  }
  lines.push('', link);
  return lines.join('\n');
}

const EV_TYPES = ['라운딩', '숙소', '기타'];
function evItem(s) {
  const ty = EV_TYPES.includes(s.type) ? s.type : '기타';
  const cls = ty === '라운딩' ? 'ev-round' : ty === '숙소' ? 'ev-stay' : '';
  const body = ty === '라운딩' ? `<span class="evtag round">⛳ 라운딩</span><b>${esc(s.content || '골프장 미정')}</b>`
    : ty === '숙소' ? `<span class="evtag stay">🏨 숙소</span><b>${esc(s.content || '장소 미정')}</b>`
    : esc(s.content);
  return `<li class="${cls}"><div class="t">${esc(s.time)}</div><div>${body}${s.note ? `<div class="n">${esc(s.note)}</div>` : ''}${ty !== '기타' ? mapLinks(s.content) : ''}</div></li>`;
}

function viewSchedule(S, days) {
  const tn = todayN(days);
  return todayCard(days) + days.map(d => {
    const items = (data.schedule || []).filter(s => String(s.day) === String(d.n))
      .sort((a, b) => String(a.time).localeCompare(String(b.time)));
    return `<section class="card ${tn === d.n ? 'today' : ''}">
      <div class="row"><h3>${d.n}일차</h3><span class="chip ${tn === d.n ? '' : 'gray'}">${tn === d.n ? '오늘 · ' : ''}${d.label}</span></div>
      ${items.length ? `<ul class="tl">${items.map(evItem).join('')}</ul>` : '<div class="empty">등록된 일정이 없어요</div>'}
    </section>`;
  }).join('');
}

function viewRounds(S, days) {
  const tn = todayN(days);
  const hcpOf = n => { const m = (data.members || []).find(x => x.name === n); return m ? (has(m.hcp) ? num(m.hcp) : '미정') : null; };
  const cards = days.map(d => {
    const rs = roundsOf(d.n);
    if (!rs.length) return '';
    const course = [...new Set(rs.map(r => r.course))].join(', ');
    return `<section class="card ${tn === d.n ? 'today' : ''}">
      <div class="row between"><h3>${esc(course || '골프장 미정')}</h3><span class="chip gray">${d.n}일차 · ${d.short}</span></div>
      <div class="groups">${rs.map(r => `<div class="group">
        <div class="g"><b>${esc(r.group || '')}${r.coursePart ? ` · ${esc(r.coursePart)}` : ''}</b><span class="tee">${esc(r.tee || '시간 미정')}</span></div>
        <div class="names">${splitNames(r.players).map(n => `<span class="name ${n === (store.get(ME_KEY) || '') ? 'me' : ''}">${esc(n)}${hcpOf(n) != null ? `<small>${hcpOf(n)}</small>` : ''}</span>`).join('') || '<span class="meta">조 편성 전</span>'}</div>
        ${r.note ? `<div class="note">${esc(r.note)}</div>` : ''}
      </div>`).join('')}</div>
    </section>`;
  }).join('');
  return cards || '<div class="card empty">등록된 라운딩이 없어요</div>';
}

function viewMembers() {
  const mem = (data.members || []).filter(m => m.name);
  return `<section class="card">
    <div class="row between" style="margin-bottom:6px"><h3>참가자</h3><span class="chip">${mem.length}명</span></div>
    ${mem.length ? `<table class="rank members"><thead><tr><th>이름</th><th>핸디</th><th>비고</th></tr></thead><tbody>
    ${mem.map(m => `<tr><td class="nm">${esc(m.name)}</td><td>${has(m.hcp) ? num(m.hcp) : '<span class="meta">미정</span>'}</td><td class="bg">${/챔피언/.test(m.note || '') ? `<span class="chip gold">🏆 ${esc(m.note)}</span>` : esc(m.note || '')}</td></tr>`).join('')}
    </tbody></table>` : '<div class="empty">등록된 참가자가 없어요</div>'}
  </section>`;
}

function medal(rank) {
  return `<span class="medal ${rank <= 3 ? 'm' + rank : ''}">${rank}</span>`;
}
const f1 = n => (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, '');

function viewScores(S, days) {
  const seg = `<div class="seg">
    <button data-st="all" class="${scoreTab === 'all' ? 'on' : ''}">종합</button>
    ${days.map(d => `<button data-st="${d.n}" class="${String(scoreTab) === String(d.n) ? 'on' : ''}">${d.n}일차</button>`).join('')}
  </div>`;
  let body;
  if (scoreTab === 'all') {
    const o = overallResults(data);
    if (!o.ranked.length) {
      body = `<section class="card empty">아직 입력된 스코어가 없어요.<br>라운딩 후 관리자 페이지에서 타수를 입력하면 자동으로 순위가 계산돼요.</section>` + scorePhotosCard(days);
    } else {
      const top = o.ranked.slice(0, 3);
      const pod = top.length >= 3 ? `<div class="podium">
        ${[1, 0, 2].map(i => `<div class="pod ${i === 0 ? 'first' : ''}"><div class="p">${['🥇', '🥈', '🥉'][i]}</div><b>${esc(top[i].name)}</b><span>평균 핸디적용 ${f1(top[i].avgNet)}</span></div>`).join('')}
      </div>` : '';
      body = pod + `<section class="card">
        <div class="row between" style="margin-bottom:6px"><h3>종합 순위</h3><span class="chip">${o.playedDays}라운드 진행</span></div>
        <table class="rank"><thead><tr><th>순위</th><th>이름</th><th>라운드</th><th>평균<br>타수</th><th>평균<br>핸디적용</th></tr></thead><tbody>
        ${o.ranked.map(r => `<tr><td class="rk">${medal(r.rank)}</td><td class="nm">${esc(r.name)}<span class="sub2">핸디 ${r.hcp != null ? r.hcp : '-'} · 핸디적용 합계 ${r.totalNet}</span></td><td>${r.cnt}</td><td>${f1(r.avgGross)}</td><td class="net">${f1(r.avgNet)}</td></tr>`).join('')}
        ${o.rest.filter(r => r.cnt > 0).map(r => `<tr class="out"><td class="rk">–</td><td class="nm">${esc(r.name)}<span class="sub2">${o.need}라운드 미만 · 순위 제외</span></td><td>${r.cnt}</td><td>${f1(r.avgGross)}</td><td>${f1(r.avgNet)}</td></tr>`).join('')}
        </tbody></table>
        <div class="note">순위 = 평균 핸디적용타수(타수 − 핸디) 낮은 순 · 같으면 평균 타수 낮은 순 · ${o.need}라운드 이상 참가자만 순위에 포함</div>
        <button class="btn ghost block sharebtn" data-share="all">📤 종합 순위 공유</button>
      </section>
      ${scorePhotosCard(days)}
      <section class="card">
        <h3 style="margin-bottom:6px">일자별 타수</h3>
        <table class="rank matrix"><thead><tr><th>이름</th>${days.map(d => `<th>${d.n}일</th>`).join('')}</tr></thead><tbody>
        ${o.ranked.concat(o.rest.filter(r => r.cnt > 0)).map(r => `<tr><td class="nm">${esc(r.name)}</td>${days.map(d => r.per[d.n] ? `<td>${r.per[d.n].gross}<span class="sub2">핸디적용 ${r.per[d.n].net}</span></td>` : '<td class="meta">–</td>').join('')}</tr>`).join('')}
        </tbody></table>
      </section>
      <section class="card">
        <h3 style="margin-bottom:6px">다음 여행 예상 핸디</h3>
        <ul class="list">${o.ranked.concat(o.rest.filter(r => r.cnt > 0)).map(r => `<li><div class="l"><b>${esc(r.name)}</b><small>평균 ${f1(r.avgGross)}타 → 소수점 버림 − ${o.par}</small></div><div class="r">${r.hcp != null ? `<span class="meta">${r.hcp} → </span>` : ''}${r.nextHcp}</div></li>`).join('')}</ul>
      </section>`;
    }
  } else {
    const d = days.find(x => String(x.n) === String(scoreTab)) || days[0];
    const rows = dayResults(data, d.n);
    const rs = roundsOf(d.n);
    const course = [...new Set(rs.map(r => r.course))].join(', ');
    const playersAll = [];
    rs.forEach(r => splitNames(r.players).forEach(n => { if (!playersAll.includes(n)) playersAll.push(n); }));
    const missing = playersAll.filter(n => !rows.find(r => r.name === n));
    body = `<section class="card">
      <div class="row between" style="margin-bottom:6px"><h3>${d.n}일차 순위</h3><span class="chip gray">${esc(course || '')} ${d.short}</span></div>
      ${rows.length ? `<table class="rank"><thead><tr><th>순위</th><th>이름</th><th>타수</th><th>핸디</th><th>핸디적용<br>타수</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td class="rk">${medal(r.rank)}</td><td class="nm">${esc(r.name)}</td><td>${r.gross}</td><td>${r.hcp}</td><td class="net">${r.net}</td></tr>`).join('')}
      </tbody></table>` : '<div class="empty">아직 입력된 스코어가 없어요</div>'}
      ${missing.length && rows.length ? `<div class="note">미입력: ${missing.map(esc).join(', ')}</div>` : ''}
      ${rows.length ? `<button class="btn ghost block sharebtn" data-share="day">📤 ${d.n}일차 결과 공유</button>` : ''}
    </section>`;
  }
  return seg + body;
}

function viewMoney(S) {
  const m = moneySummary(data);
  const pct = m.income > 0 ? Math.min(100, (m.spent / m.income) * 100) : (m.spent > 0 ? 100 : 0);
  const cats = Object.entries(m.byCat).sort((a, b) => b[1] - a[1]);
  const maxCat = cats.length ? cats[0][1] : 1;
  const ex = (data.expenses || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return `<section class="card money-hero">
      <div class="meta">남은 회비</div>
      <div class="big ${m.balance < 0 ? 'minus' : ''}">${won(m.balance)}</div>
      <div class="bar ${m.balance < 0 ? 'over' : ''}"><i style="width:${pct}%"></i></div>
      <div class="meta">수입 ${won(m.income)} 중 ${won(m.spent)} 사용 (${Math.round(pct)}%)</div>
      <div class="stats">
        <div class="stat"><span>회비 납부</span><b>${won(m.duesPaid)}</b></div>
        <div class="stat"><span>찬조금</span><b>${won(m.sponsor)}</b></div>
        <div class="stat"><span>지출</span><b class="minus">${won(m.spent)}</b></div>
      </div>
      <button class="btn ghost block sharebtn" data-share="money">📤 경비 현황 공유</button>
    </section>

    <div class="sect-title">회비 납부 현황 · 1인 ${won(m.fee)}</div>
    <section class="card"><ul class="list">
      ${m.settle.map(p => `<li><div class="l"><b>${esc(p.name)}</b><small>${won(p.paid)} 납부</small></div><div class="r">${p.unpaid > 0 ? `<span class="chip red">미납 ${won(p.unpaid)}</span>` : '<span class="chip">완납</span>'}</div></li>`).join('') || '<li class="empty">멤버 미등록</li>'}
    </ul>
    ${m.duesExpected ? `<div class="note">예정 회비 ${won(m.duesExpected)} 중 ${won(m.duesPaid)} 납부</div>` : ''}</section>

    ${(data.sponsors || []).length ? `<div class="sect-title">찬조</div><section class="card"><ul class="list">
      ${(data.sponsors || []).map(s => `<li><div class="l"><b>${esc(s.name)}</b><small>${esc(s.note || '감사합니다 🙏')}</small></div><div class="r plus">+${won(num(s.amount))}</div></li>`).join('')}
    </ul></section>` : ''}

    ${cats.length ? `<div class="sect-title">항목별 지출</div><section class="card">
      ${cats.map(([c, v]) => `<div class="catbar"><span>${esc(c)}</span><div class="b"><i style="width:${(v / maxCat) * 100}%"></i></div><b>${won(v)}</b></div>`).join('')}
    </section>` : ''}

    <div class="sect-title">지출 내역 (${ex.length}건)</div>
    <section class="card"><ul class="list">
      ${ex.map(e => `<li><div class="l"><b>${esc(e.content || e.category)}</b><small>${esc(e.date)} · ${esc(e.category)}${e.note ? ' · ' + esc(e.note) : ''}</small></div><div class="r minus">−${won(num(e.amount))}</div></li>`).join('') || '<li class="empty" style="display:block">아직 지출이 없어요</li>'}
    </ul></section>

    ${m.spent > 0 ? `<div class="sect-title">예상 정산 (지출 − 찬조) ÷ ${m.count}명 = 1인 ${won(m.share)}</div>
    <section class="card"><ul class="list">
      ${m.settle.map(p => `<li><div class="l"><b>${esc(p.name)}</b><small>납부 ${won(p.paid)}</small></div><div class="r ${p.diff >= 0 ? 'plus' : 'minus'}">${p.diff >= 0 ? '환급 ' + won(p.diff) : '추가 ' + won(-p.diff)}</div></li>`).join('')}
    </ul></section>` : ''}`;
}

// ───────── 관리자 ─────────
const ADMIN_TABS = [
  ['expenses', '지출'], ['scores', '스코어'], ['members', '멤버·회비'], ['sponsors', '찬조'],
  ['rounds', '라운딩'], ['schedule', '일정'], ['settings', '기본정보'],
];

const EDITORS = {
  members: {
    label: r => r.name || '새 멤버',
    blank: () => ({ name: '', hcp: '0', paid: '0', note: '' }),
    fields: [
      { k: 'name', l: '이름', w: 2 }, { k: 'hcp', l: '핸디', t: 'num', w: 1 },
      { k: 'paid', l: '회비 납부액(원)', t: 'money', w: 2 }, { k: 'note', l: '비고', w: 1 },
    ],
  },
  sponsors: {
    label: r => r.name || '새 찬조',
    blank: () => ({ name: '', amount: '', note: '' }),
    fields: [{ k: 'name', l: '이름', w: 1 }, { k: 'amount', l: '금액(원)', t: 'money', w: 1 }, { k: 'note', l: '비고' }],
  },
  schedule: {
    label: r => `${r.day}일차 ${r.time || ''} ${r.type && r.type !== '기타' ? '[' + r.type + '] ' : ''}${r.content || ''}`,
    rowClass: r => r.type === '라운딩' ? 'ev-round' : r.type === '숙소' ? 'ev-stay' : '',
    blank: () => ({ day: '1', time: '', type: '기타', content: '', note: '' }),
    sort: (a, b) => num(a.day) - num(b.day) || String(a.time).localeCompare(String(b.time)),
    fields: [
      { k: 'day', l: '일차', t: 'day', w: 1 }, { k: 'time', l: '시간', t: 'time', w: 1 },
      { k: 'type', l: '종류', t: 'evtype' },
      { k: 'content', l: r => r.type === '라운딩' ? '골프장 이름' : r.type === '숙소' ? '숙소 장소' : '내용', ph: r => r.type === '라운딩' ? '예) 포항CC' : r.type === '숙소' ? '예) 포항 에이원호텔' : '예) 저녁식사' },
      { k: 'note', l: '비고 (메모)' },
    ],
  },
  rounds: {
    label: r => `${r.day}일차 ${r.group || ''} ${r.tee || ''}`,
    blank: () => ({ day: '1', course: '', coursePart: '', group: '', tee: '', players: '', note: '' }),
    sort: (a, b) => num(a.day) - num(b.day) || String(a.group).localeCompare(String(b.group), 'ko'),
    fields: [
      { k: 'day', l: '일차', t: 'day', w: 1 }, { k: 'group', l: '조', w: 1 },
      { k: 'course', l: '골프장 (일정과 연동)', w: 1 }, { k: 'coursePart', l: '코스', w: 1 },
      { k: 'tee', l: '티타임', t: 'time', w: 1 }, { k: 'note', l: '비고 (캐디피 별도 등)', w: 1 },
      { k: 'players', l: '멤버 (눌러서 선택)', t: 'players' },
    ],
  },
  expenses: {
    label: r => `${r.date || ''} ${r.content || r.category || '새 지출'}`,
    blank: () => ({ date: '', category: '식사', content: '', amount: '', note: '' }),
    sort: (a, b) => String(b.date).localeCompare(String(a.date)),
    fields: [
      { k: 'date', l: '날짜', t: 'date', w: 1 }, { k: 'category', l: '분류', t: 'cat', w: 1 },
      { k: 'content', l: '내용' }, { k: 'amount', l: '금액(원)', t: 'money', w: 1 }, { k: 'note', l: '비고', w: 1 },
    ],
  },
};

function viewAdmin(S, days) {
  if (!adminPin) {
    return `<section class="card" style="margin-top:8px">
      <h3>관리자 로그인</h3>
      <div class="meta" style="margin-bottom:12px">${DEMO ? '체험 모드 PIN은 1234 입니다.' : 'Apps Script에 설정한 관리자 PIN을 입력하세요.'}</div>
      <div class="field"><input class="inp" id="pin" type="password" inputmode="numeric" autocomplete="off" placeholder="PIN"></div>
      <button class="btn block" id="login">로그인</button>
    </section>`;
  }
  const seg = `<div class="seg">${ADMIN_TABS.map(([k, l]) => `<button data-at="${k}" class="${adminTab === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  let banner = '';
  if (!DEMO && isEmpty(data)) {
    banner = `<div class="banner">구글 시트가 비어 있어요. 기본 일정(1/18~1/21)과 가상 멤버 8명(A~H)으로 시작할까요?<div style="margin-top:8px"><button class="btn small" id="seed">기본 데이터 넣기</button></div></div>`;
  }
  let body;
  if (adminTab === 'settings') body = adminSettings(S);
  else if (adminTab === 'scores') body = adminScores(days);
  else body = adminTable(adminTab, days);
  return seg + banner + body + `<div class="center" style="margin:22px 0 8px"><button class="btn small ghost" id="logout">로그아웃</button>${DEMO ? ' <button class="btn small danger" id="reset">체험 데이터 초기화</button>' : ''}</div>`;
}

function startDraft(key) {
  if (draftKey !== key || !draft) {
    draftKey = key;
    const ed = EDITORS[key];
    draft = clone(data[key] || []);
    if (ed && ed.sort) draft.sort(ed.sort);
    dirty = false;
  }
}

function inputFor(f, row, i, days) {
  const v = row[f.k] == null ? '' : row[f.k];
  const a = `data-i="${i}" data-k="${f.k}"`;
  if (f.t === 'day') return `<select class="inp" ${a}>${days.map(d => `<option value="${d.n}" ${String(v) === String(d.n) ? 'selected' : ''}>${d.n}일차 ${d.short}</option>`).join('')}</select>`;
  if (f.t === 'evtype') return `<select class="inp" ${a}>${EV_TYPES.map(c => `<option ${c === (v || '기타') ? 'selected' : ''}>${c}</option>`).join('')}</select>`;
  if (f.t === 'cat') return `<select class="inp" ${a}>${CATEGORIES.map(c => `<option ${c === v ? 'selected' : ''}>${c}</option>`).join('')}</select>`;
  if (f.t === 'date') return `<input class="inp" type="date" ${a} value="${esc(v)}">`;
  if (f.t === 'time') return `<input class="inp" type="time" ${a} value="${esc(v)}">`;
  if (f.t === 'num') return `<input class="inp" type="text" inputmode="numeric" ${a} value="${esc(v)}">`;
  if (f.t === 'money') return `<input class="inp" type="text" inputmode="numeric" ${a} value="${esc(v)}" placeholder="0">`;
  if (f.t === 'players') {
    const sel = splitNames(v);
    return `<div class="pick" data-players="${i}">${(data.members || []).filter(m => m.name).map(m => `<button type="button" data-p="${esc(m.name)}" class="${sel.includes(m.name) ? 'on' : ''}">${esc(m.name)}</button>`).join('')}</div>`;
  }
  const ph = typeof f.ph === 'function' ? f.ph(row) : (f.ph || '');
  return `<input class="inp" type="text" ${a} value="${esc(v)}" placeholder="${esc(ph)}">`;
}

function adminTable(key, days) {
  startDraft(key);
  const ed = EDITORS[key];
  const fields = ed.fields;
  const rowsHtml = draft.map((row, i) => {
    let html = '', buf = [];
    const flush = () => { if (buf.length) { html += `<div class="grid2">${buf.join('')}</div>`; buf = []; } };
    fields.forEach(f => {
      const cell = `<div class="field"><label>${typeof f.l === 'function' ? f.l(row) : f.l}</label>${inputFor(f, row, i, days)}</div>`;
      if (f.w === 1 || f.w === 2) { buf.push(cell); if (buf.length === 2) flush(); } else { flush(); html += cell; }
    });
    flush();
    return `<div class="editrow ${ed.rowClass ? ed.rowClass(row) : ''}"><div class="hd"><span>${esc(ed.label(row))}</span><button class="btn small danger" data-del="${i}">삭제</button></div>${html}</div>`;
  }).join('');
  let quick = '';
  if (key === 'expenses') {
    const tn = todayN(days);
    const today = new Date();
    const def = tn ? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}` : (settingsMap(data).startDate || '');
    quick = `<section class="card"><h3 style="margin-bottom:10px">빠른 지출 입력</h3>
      <div class="grid2"><div class="field"><label>날짜</label><input class="inp" type="date" id="qDate" value="${esc(def)}"></div>
      <div class="field"><label>분류</label><select class="inp" id="qCat">${CATEGORIES.map(c => `<option>${c}</option>`).join('')}</select></div></div>
      <div class="field"><label>내용</label><input class="inp" id="qContent" placeholder="예) 1일차 저녁 회식"></div>
      <div class="field"><label>금액(원)</label><input class="inp" id="qAmount" inputmode="numeric" placeholder="0"></div>
      <button class="btn block" id="qAdd">지출 추가 (바로 저장)</button>
      <div class="note">추가하면 남은 회비에서 바로 차감돼요.</div></section>
      <div class="sect-title">지출 내역 수정</div>`;
  }
  let help = '';
  if (key === 'members') help = `<div class="note" style="margin:0 2px 10px">이름을 바꾸면 라운딩 조 편성과 스코어의 이름도 함께 바꿔 주세요.</div>`;
  return quick + help + (rowsHtml || '<div class="card empty">항목이 없어요</div>') +
    `<div class="savebar"><div class="grid2"><button class="btn ghost" id="addRow">+ 추가</button><button class="btn" id="saveTable" ${dirty ? '' : 'disabled'}>저장</button></div></div>`;
}

function adminSettings(S) {
  const f = (k, l, type, extra) => `<div class="field"><label>${l}</label><input class="inp" data-s="${k}" type="${type || 'text'}" value="${esc(S[k] || '')}" ${extra || ''}></div>`;
  return `<section class="card">
    ${f('title', '여행 이름')}
    ${f('place', '장소')}
    <div class="grid2">${f('startDate', '시작일', 'date')}${f('endDate', '종료일', 'date')}</div>
    <div class="grid2">${f('fee', '1인 회비(원)', 'text', 'inputmode="numeric"')}${f('minRounds', '종합순위 최소 라운드', 'text', 'inputmode="numeric"')}</div>
    ${f('par', '기준 타수 (다음 핸디 계산용, 보통 72)', 'text', 'inputmode="numeric"')}
    <div class="field"><label>공지 (상단에 표시)</label><textarea class="inp" data-s="notice">${esc(S.notice || '')}</textarea></div>
    <button class="btn block" id="saveSettings">저장</button>
  </section>`;
}

function adminScores(days) {
  if (scoreDay == null) scoreDay = todayN(days) || 1;
  const rs = roundsOf(scoreDay);
  const order = [];
  rs.forEach(r => splitNames(r.players).forEach(n => { if (!order.includes(n)) order.push(n); }));
  const groupOf = {};
  rs.forEach(r => splitNames(r.players).forEach(n => { if (!groupOf[n]) groupOf[n] = r.group; }));
  (data.members || []).forEach(m => { if (m.name && !order.includes(m.name)) order.push(m.name); });
  const existing = {};
  (data.scores || []).filter(s => String(s.day) === String(scoreDay)).forEach(s => { existing[s.name] = s; if (!order.includes(s.name)) order.push(s.name); });
  const memHcp = n => { const m = (data.members || []).find(x => x.name === n); return m ? num(m.hcp) : 0; };
  const pGroups = (() => { const g = [...new Set(rs.map(r => r.group).filter(Boolean))]; return g.length ? g : ['1조', '2조']; })();
  const photoOf = g => (data.photos || []).find(p => String(p.day) === String(scoreDay) && p.group === g);
  return `<div class="seg">${days.map(d => `<button data-sd="${d.n}" class="${String(scoreDay) === String(d.n) ? 'on' : ''}">${d.n}일차</button>`).join('')}</div>
    <section class="card"><h3>📷 스마트스코어 사진</h3>
      <div class="note" style="margin:2px 0 10px">조별 스코어카드 캡처를 올리면 타수를 자동으로 읽어 아래 칸에 채워요. 확인한 뒤 저장을 눌러 주세요.</div>
      <div class="photo-slots">${pGroups.map(g => { const p = photoOf(g); return `<div class="pslot">${p ? `<img src="${photoUrl(p.fileId, 400)}" alt="${esc(g)} 스코어카드">` : '<div class="pempty">사진 없음</div>'}<label class="btn small ghost">${p ? esc(g) + ' 다시 올리기' : esc(g) + ' 사진 올리기'}<input type="file" accept="image/*" data-upload="${esc(g)}" hidden></label></div>`; }).join('')}</div>
      <div id="ocrResult"></div>
    </section>
    <section class="card">
      <div class="scorehead" style="grid-template-columns:1fr 64px 52px 64px"><span>이름</span><span>타수</span><span>핸디</span><span>핸디적용<br>타수</span></div>
      ${order.map(n => {
        const e = existing[n];
        const g = e ? e.gross : '';
        const h = e && has(e.hcp) ? num(e.hcp) : memHcp(n);
        return `<div class="scorein" data-name="${esc(n)}" style="grid-template-columns:1fr 64px 52px 64px">
          <div><b>${esc(n)}</b>${groupOf[n] ? ` <span class="chip gray">${esc(groupOf[n])}</span>` : ' <span class="chip gray">불참?</span>'}</div>
          <input class="inp sg" inputmode="numeric" value="${esc(g)}" placeholder="-">
          <input class="inp sh" inputmode="numeric" value="${esc(h)}">
          <div class="nt">${has(g) ? num(g) - h : '-'}</div>
        </div>`;
      }).join('')}
      <div class="note">타수를 비워 두면 그 라운드는 순위에서 빠져요(불참). 핸디는 멤버 핸디가 기본으로 들어가고, 이 라운드만 바꿀 수도 있어요.</div>
    </section>
    <div class="savebar"><button class="btn block" id="saveScores">${scoreDay}일차 스코어 저장</button><button class="btn block danger" id="resetScores" style="margin-top:8px">${scoreDay}일차 스코어 초기화</button></div>`;
}

function bindAdmin() {
  const v = document.getElementById('view');
  const $ = id => document.getElementById(id);

  if ($('login')) {
    const go = async () => {
      const pin = $('pin').value.trim();
      if (!pin) return;
      $('login').disabled = true;
      try {
        const j = await post({ pin, action: 'check' });
        if (j.ok) { adminPin = pin; store.set(PIN_KEY, pin); render(); toast('관리자 모드'); }
        else toast(j.error || 'PIN이 올바르지 않습니다.', true);
      } catch (e) { toast('연결하지 못했어요.', true); }
      if ($('login')) $('login').disabled = false;
    };
    $('login').onclick = go;
    $('pin').onkeydown = e => { if (e.key === 'Enter') go(); };
    return;
  }

  v.querySelectorAll('[data-at]').forEach(b => b.onclick = async () => {
    if (dirty && !(await ask('저장하지 않은 변경이 있어요. 이동할까요?'))) return;
    adminTab = b.dataset.at; draft = null; draftKey = null; dirty = false; render();
  });
  if ($('logout')) $('logout').onclick = () => { adminPin = ''; store.del(PIN_KEY); draft = null; dirty = false; render(); };
  if ($('reset')) $('reset').onclick = async () => { if (await ask('체험 데이터를 처음 상태로 되돌릴까요?')) { store.del(DEMO_KEY); data = normalize(seedData()); draft = null; dirty = false; render(); } };
  if ($('seed')) $('seed').onclick = async () => {
    try {
      const j = await post({ pin: adminPin, action: 'saveMany', tables: seedData() });
      if (j.ok) { data = normalize(j.data); toast('기본 데이터를 넣었어요'); draft = null; render(); } else toast(j.error, true);
    } catch (e) { toast('저장하지 못했어요.', true); }
  };

  // 기본정보
  if ($('saveSettings')) $('saveSettings').onclick = async () => {
    const S = settingsMap(data);
    v.querySelectorAll('[data-s]').forEach(el => { S[el.dataset.s] = el.value.trim(); });
    const rows = Object.keys(S).map(k => ({ key: k, value: S[k] }));
    if (await saveTable('settings', rows)) render();
  };

  // 스코어
  v.querySelectorAll('[data-sd]').forEach(b => b.onclick = () => { scoreDay = num(b.dataset.sd); render(); });
  v.querySelectorAll('.scorein').forEach(rowEl => {
    const upd = () => {
      const g = rowEl.querySelector('.sg').value, h = num(rowEl.querySelector('.sh').value);
      rowEl.querySelector('.nt').textContent = has(g) ? num(g) - h : '-';
    };
    rowEl.querySelectorAll('input').forEach(i => i.oninput = upd);
  });
  if ($('saveScores')) $('saveScores').onclick = async () => {
    const rows = (data.scores || []).filter(s => String(s.day) !== String(scoreDay));
    v.querySelectorAll('.scorein').forEach(rowEl => {
      const g = rowEl.querySelector('.sg').value.trim();
      if (has(g)) rows.push({ day: String(scoreDay), name: rowEl.dataset.name, gross: String(num(g)), hcp: String(num(rowEl.querySelector('.sh').value)) });
    });
    $('saveScores').disabled = true;
    if (await saveTable('scores', rows)) render();
    else if ($('saveScores')) $('saveScores').disabled = false;
  };
  // 스코어카드 사진 올리기 → 자동 인식
  v.querySelectorAll('[data-upload]').forEach(inp => inp.onchange = async () => {
    const file = inp.files && inp.files[0];
    if (!file) return;
    if (DEMO) { toast('체험 모드에서는 사진을 올릴 수 없어요', true); return; }
    const typed = {};
    v.querySelectorAll('.scorein').forEach(r => { typed[r.dataset.name] = { g: r.querySelector('.sg').value, h: r.querySelector('.sh').value }; });
    const box = document.getElementById('ocrResult');
    if (box) box.innerHTML = '<div class="ocr">⏳ 사진을 올리고 타수를 읽는 중이에요… (30초쯤 걸려요)</div>';
    v.querySelectorAll('[data-upload]').forEach(x => { x.disabled = true; });
    try {
      const b64 = await imageToJpegB64(file, 2000);
      const j = await post({ pin: adminPin, action: 'uploadScore', day: String(scoreDay), group: inp.dataset.upload, image: b64, mediaType: 'image/jpeg', recognize: true });
      if (!j.ok) { toast(j.error || '올리지 못했어요', true); if (box) box.innerHTML = ''; v.querySelectorAll('[data-upload]').forEach(x => { x.disabled = false; }); return; }
      data = normalize(j.data);
      render();
      applyOcr(j.result, j.warn, typed);
    } catch (e) {
      toast('올리지 못했어요. 인터넷 연결을 확인해 주세요.', true);
      if (box) box.innerHTML = '';
      v.querySelectorAll('[data-upload]').forEach(x => { x.disabled = false; });
    }
  });
  // 초기화: 그 일차의 타수만 비우고 라운드별 핸디는 그대로 둠
  if ($('resetScores')) $('resetScores').onclick = async () => {
    if (!(await ask(`${scoreDay}일차 타수를 모두 지울까요? (핸디는 그대로 남아요)`))) return;
    const rows = (data.scores || []).map(s => String(s.day) === String(scoreDay) ? Object.assign({}, s, { gross: '' }) : s);
    $('resetScores').disabled = true;
    if (await saveTable('scores', rows)) { render(); toast(`${scoreDay}일차 타수를 초기화했어요`); }
    else if ($('resetScores')) $('resetScores').disabled = false;
  };

  // 일반 표 편집
  if (draft && EDITORS[adminTab]) {
    const markDirty = () => { dirty = true; const s = $('saveTable'); if (s) s.disabled = false; };
    v.querySelectorAll('[data-i][data-k]').forEach(el => {
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => { draft[num(el.dataset.i)][el.dataset.k] = el.value; markDirty(); if (el.dataset.k === 'type') render(); });
    });
    v.querySelectorAll('[data-players]').forEach(box => {
      const i = num(box.dataset.players);
      box.querySelectorAll('button').forEach(b => b.onclick = () => {
        b.classList.toggle('on');
        draft[i].players = [...box.querySelectorAll('button.on')].map(x => x.dataset.p).join(',');
        markDirty();
      });
    });
    v.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!(await ask('이 항목을 삭제할까요? (아래 저장을 눌러야 반영돼요)'))) return;
      draft.splice(num(b.dataset.del), 1); dirty = true; render();
    });
    if ($('addRow')) $('addRow').onclick = () => {
      const r = EDITORS[adminTab].blank();
      if (adminTab === 'schedule' || adminTab === 'rounds') { draft.push(r); } else { draft.unshift(r); }
      dirty = true; render();
      if (adminTab === 'schedule' || adminTab === 'rounds') window.scrollTo(0, document.body.scrollHeight);
    };
    if ($('saveTable')) $('saveTable').onclick = async () => {
      // 빈 줄(일차·분류 같은 기본값만 있는 줄)은 버림
      const IGNORE = ['day', 'category', 'hcp', 'paid', 'type'];
      const rows = draft.filter(r => Object.keys(r).some(k => !IGNORE.includes(k) && String(r[k] || '').trim() !== ''));
      rows.forEach(r => ['amount', 'paid', 'hcp'].forEach(k => { if (k in r && has(r[k])) r[k] = String(num(r[k])); }));
      $('saveTable').disabled = true;
      if (await saveTable(adminTab, rows)) { if (adminTab === 'schedule') await syncCourses(rows); draft = null; draftKey = null; dirty = false; render(); }
      else $('saveTable').disabled = false;
    };
    if ($('qAdd')) $('qAdd').onclick = async () => {
      const amount = num($('qAmount').value);
      const content = $('qContent').value.trim();
      if (!amount) { toast('금액을 입력해 주세요', true); return; }
      const row = { date: $('qDate').value, category: $('qCat').value, content, amount: String(amount), note: '' };
      const rows = clone(data.expenses || []); rows.push(row);
      $('qAdd').disabled = true;
      if (await saveTable('expenses', rows)) { draft = null; draftKey = null; dirty = false; render(); toast(`${won(amount)} 차감 · 잔액 ${won(moneySummary(data).balance)}`); }
      else $('qAdd').disabled = false;
    };
  }
}

// ───────── 시작 ─────────
document.querySelectorAll('nav.tabs button').forEach(b => b.onclick = async () => {
  if (tab === 'admin' && dirty && !(await ask('저장하지 않은 변경이 있어요. 이동할까요?'))) return;
  if (tab === 'admin') { draft = null; draftKey = null; dirty = false; }
  tab = b.dataset.tab; render(); window.scrollTo(0, 0);
});
document.getElementById('view').addEventListener('click', e => {
  const b = e.target.closest('[data-st]');
  if (b) { scoreTab = b.dataset.st; render(); }
  const pb = e.target.closest('[data-photos]');
  if (pb) showPhotos(pb.dataset.photos);
  const sb = e.target.closest('[data-share]');
  if (sb) shareText(buildShare(sb.dataset.share));
});
document.getElementById('refresh').onclick = async () => {
  if (dirty && !(await ask('저장하지 않은 변경이 있어요. 새로고침할까요?'))) return;
  dirty = false; draft = null; draftKey = null; loadData(true);
};
document.addEventListener('visibilitychange', () => { if (!document.hidden && !dirty && !DEMO) loadData(false); });

const cached = store.get(CACHE_KEY);
if (!DEMO && cached) { try { data = normalize(JSON.parse(cached)); render(); } catch (e) { /* 무시 */ } }
loadData(false);
})();
