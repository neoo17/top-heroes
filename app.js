// Top Heroes — простая визуализация карты и распределение обменов
// Правила:
// - q1: только с ближайшим (требуем взаимно ближайших, иначе без пары)
// - q2,q3,q4: с любым, но одна пара игроков может обменяться только одним персонажем в сумме

const STORAGE_KEY = 'topHeroesPlayers';
const REG_STATE_KEY = 'topHeroesRegistration';

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

// Загружаем игроков из localStorage или используем демо
function defaultPlayers() {
  // Реальные игроки (заменяют старые демо)
  return [
    { id: uid(), name: 'Coppi',  x: 183, y: 409, slots: 4 },
    { id: uid(), name: 'UkKAmi', x: 183, y: 413, slots: 4 },
    { id: uid(), name: 'Coocie', x: 191, y: 405, slots: 4 },
    { id: uid(), name: 'Vanm',   x: 195, y: 417, slots: 4 },
    { id: uid(), name: 'tea',    x: 171, y: 405, slots: 4 },
    { id: uid(), name: 'CHT',    x: 195, y: 393, slots: 4 },
    { id: uid(), name: 'gaga',   x: 191, y: 409, slots: 4 },
  ];
}

async function loadPlayers() {
  // If API available, use it; otherwise localStorage fallback as before
  if (window.Api && (await Api.init())) {
    const list = await Api.getPlayers();
    return Array.isArray(list) && list.length ? list : [];
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPlayers();
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return defaultPlayers();
    const OLD = new Set(['Ares','Varya','Loki','Mira','Grom','Tara','Zed','Noir']);
    if (data.length && data.every(p => OLD.has(p.name))) {
      const fresh = defaultPlayers();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    }
    return data;
  } catch { return defaultPlayers(); }
}

async function savePlayers(players) {
  if (window.Api && Api.hasApi) { await Api.replaceAll(players); return; }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(players));
}

function loadRegState() {
  try { return JSON.parse(localStorage.getItem(REG_STATE_KEY) || '{}'); } catch { return {}; }
}
function saveRegState(state) { localStorage.setItem(REG_STATE_KEY, JSON.stringify(state)); }

// Подбор обменов
// Возвращает:
// - matches: [{a,b,tierA,tierB,dist}] — все обмены, включая кросс‑тиер
// - unmatchedLogs: string[]
function computeMatches(players) {
  const usedPairs = new Set(); // Глобально: одна пара игроков — максимум один обмен
  const matches = [];
  const unmatchedByTier = { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set() };

  // Пометка занятости игрока на конкретном тире
  const taken = { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set() };

  const pairKey = (a, b) => (a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`);

  // Шаг 1. q1 — строго взаимно ближайшие (каждый q1 только с самым близким ему игроком)
  {
    const eligible = players.filter(p => p.slots >= 1);
    // 1) Инициализация: жадное минимальное паросочетание по расстоянию
    const allEdges = [];
    for (let i = 0; i < eligible.length; i++) {
      for (let j = i + 1; j < eligible.length; j++) {
        const a = eligible[i], b = eligible[j];
        allEdges.push({ a, b, dist: distance(a, b) });
      }
    }
    allEdges.sort((x, y) => x.dist - y.dist);
    const used = new Set();
    const q1Pairs = [];
    for (const e of allEdges) {
      if (used.has(e.a.id) || used.has(e.b.id)) continue;
      q1Pairs.push([e.a, e.b]);
      used.add(e.a.id); used.add(e.b.id);
    }

    // 2) Локальные улучшения (2-opt): пробуем переставить пары, уменьшая суммарную дистанцию
    function d(a, b) { return distance(a, b); }
    function totalCost() { return q1Pairs.reduce((s, [a, b]) => s + d(a, b), 0); }
    let improved = true;
    let guard = 0;
    while (improved && guard < 8) { // ограничим число проходов, чтобы не зациклиться
      improved = false; guard++;
      for (let i = 0; i < q1Pairs.length; i++) {
        for (let j = i + 1; j < q1Pairs.length; j++) {
          const [a, b] = q1Pairs[i];
          const [c, d2] = q1Pairs[j];
          // Рассматриваем два альтернативных разбиения
          const cur = d(a, b) + d(c, d2);
          const alt1 = d(a, c) + d(b, d2);
          const alt2 = d(a, d2) + d(b, c);
          let choice = 0;
          if (alt1 + 1e-6 < cur && alt1 <= alt2) choice = 1;
          else if (alt2 + 1e-6 < cur) choice = 2;
          if (choice === 1) {
            q1Pairs[i] = [a, c];
            q1Pairs[j] = [b, d2];
            improved = true;
          } else if (choice === 2) {
            q1Pairs[i] = [a, d2];
            q1Pairs[j] = [b, c];
            improved = true;
          }
          if (improved) break;
        }
        if (improved) break;
      }
    }

    // 3) Зафиксируем пары q1, пометим занятость и запретим эти пары для других тиров
    for (const [pa, pb] of q1Pairs) {
      const key = pairKey(pa, pb);
      if (usedPairs.has(key)) continue; // на всякий случай
      usedPairs.add(key);
      taken[1].add(pa.id); taken[1].add(pb.id);
      matches.push({ a: pa, b: pb, tierA: 1, tierB: 1, dist: d(pa, pb) });
    }
    for (const p of eligible) if (!taken[1].has(p.id)) unmatchedByTier[1].add(p.id);
  }

  // Шаг 1.2. q2..q4 — жадно внутри того же тира
  for (let tier = 2; tier <= 4; tier++) {
    const eligible = players.filter(p => p.slots >= tier);
    const edges = [];
    for (let i = 0; i < eligible.length; i++) {
      for (let j = i + 1; j < eligible.length; j++) {
        const a = eligible[i], b = eligible[j];
        const key = pairKey(a, b);
        if (usedPairs.has(key)) continue;
        edges.push({ a, b, dist: distance(a, b), key });
      }
    }
    edges.sort((x, y) => x.dist - y.dist);
    for (const e of edges) {
      if (taken[tier].has(e.a.id) || taken[tier].has(e.b.id)) continue;
      if (usedPairs.has(e.key)) continue;
      usedPairs.add(e.key);
      taken[tier].add(e.a.id); taken[tier].add(e.b.id);
      matches.push({ a: e.a, b: e.b, tierA: tier, tierB: tier, dist: e.dist });
    }
    for (const p of eligible) if (!taken[tier].has(p.id)) unmatchedByTier[tier].add(p.id);
  }

  // Шаг 2. Кросс‑тиер: q1↔q2, затем q2↔q3, затем q3↔q4 (для оставшихся)
  function crossTier(fromTier, toTier) {
    const A = players.filter(p => p.slots >= fromTier && unmatchedByTier[fromTier].has(p.id));
    const B = players.filter(p => p.slots >= toTier && unmatchedByTier[toTier].has(p.id));
    const edges = [];
    for (const a of A) {
      for (const b of B) {
        if (a.id === b.id) continue;
        const key = pairKey(a, b);
        if (usedPairs.has(key)) continue;
        edges.push({ a, b, dist: distance(a, b), key });
      }
    }
    edges.sort((x, y) => x.dist - y.dist);
    for (const e of edges) {
      if (!unmatchedByTier[fromTier].has(e.a.id)) continue;
      if (!unmatchedByTier[toTier].has(e.b.id)) continue;
      if (usedPairs.has(e.key)) continue;
      usedPairs.add(e.key);
      unmatchedByTier[fromTier].delete(e.a.id);
      unmatchedByTier[toTier].delete(e.b.id);
      matches.push({ a: e.a, b: e.b, tierA: fromTier, tierB: toTier, dist: e.dist });
    }
  }

  crossTier(1, 2); // q1 с q2
  crossTier(2, 3); // q2 с q3
  crossTier(3, 4); // q3 с q4

  // Сформировать логи для оставшихся
  const unmatchedLogs = [];
  const byId = new Map(players.map(p => [p.id, p]));
  for (let tier = 1; tier <= 4; tier++) {
    for (const id of unmatchedByTier[tier]) {
      const p = byId.get(id);
      if (!p || p.slots < tier) continue;
      unmatchedLogs.push(`Player ${p.name} (${p.x},${p.y}) has no pair for q${tier}`);
    }
  }

  return { matches, unmatchedLogs };
}

// Визуализация на canvas
function drawMap(canvas, players, matchesList) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // фон-сетка
  ctx.fillStyle = '#0a0d1a';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#1a1f36';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 50) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += 50) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  if (players.length === 0) return;

  // масштабирование координат в область отступов
  const pad = 50;
  const xs = players.map(p => p.x);
  const ys = players.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const scaleX = (w - 2 * pad) / spanX;
  const scaleY = (h - 2 * pad) / spanY;
  const scale = Math.min(scaleX, scaleY);

  function toScreen(p) {
    return {
      x: pad + (p.x - minX) * scale,
      y: pad + (p.y - minY) * scale, // y растёт вниз, как в ваших координатах
    };
  }

  // Экранные точки + аккуратное разведение кластеров с сохранением порядка по Y
  const screenPoints = players.map(p => ({ id: p.id, p, s: toScreen(p) }));
  const minSep = 18; // минимальная вертикальная дистанция между точками в кластере
  const visited = new Set();
  for (let i = 0; i < screenPoints.length; i++) {
    if (visited.has(i)) continue;
    const gi = [i]; visited.add(i);
    const ai = screenPoints[i];
    for (let j = i + 1; j < screenPoints.length; j++) {
      if (visited.has(j)) continue;
      const aj = screenPoints[j];
      const dx = Math.abs(aj.s.x - ai.s.x);
      const dy = Math.abs(aj.s.y - ai.s.y);
      if (dx <= minSep && dy <= minSep) { gi.push(j); visited.add(j); }
    }
    if (gi.length > 1) {
      const group = gi.map(k => screenPoints[k]);
      // Сортируем по исходному Y по возрастанию: меньший Y — выше на экране
      group.sort((A, B) => A.p.y - B.p.y);
      const baseY = group.reduce((s, o) => s + o.s.y, 0) / group.length;
      const baseX = group.reduce((s, o) => s + o.s.x, 0) / group.length;
      const sepY = 12;
      const sepX = 2;
      for (let idx = 0; idx < group.length; idx++) {
        const offset = idx - (group.length - 1) / 2;
        group[idx].s.y = Math.max(8, Math.min(h - 8, baseY + offset * sepY));
        group[idx].s.x = Math.max(8, Math.min(w - 8, baseX + offset * sepX));
      }
    }
  }

  // провести линии обменов; цвет по минимальному тиру в паре
  const tierColor = {
    1: 'rgba(255, 77, 79, 0.95)',
    2: 'rgba(255, 176, 32, 0.95)',
    3: 'rgba(57, 217, 138, 0.95)',
    4: 'rgba(102, 144, 255, 0.95)',
  };
  const tierWidth = { 1: 4, 2: 3, 3: 2.5, 4: 2 };

  for (const m of matchesList) {
    const tier = Math.min(m.tierA, m.tierB);
    ctx.strokeStyle = tierColor[tier];
    ctx.lineWidth = tierWidth[tier];
    const a = screenPoints.find(o => o.id === m.a.id).s;
    const b = screenPoints.find(o => o.id === m.b.id).s;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // узлы игроков
  for (const o of screenPoints) {
    const p = o.p; const s = o.s;
    // точка
    ctx.beginPath();
    ctx.fillStyle = '#e9ecf1';
    ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5bbcff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // подпись
    ctx.fillStyle = '#cfd5e3';
    ctx.font = '12px ui-sans-serif, system-ui';
    const label = `${p.name} (${p.x},${p.y}) [${p.slots}]`;
    ctx.fillText(label, s.x + 8, s.y - 8);
  }
}

// Рендер «карточек» игроков с направлениями Отправляет/Получает
// Подбор потенциальных дополнительных обменов после основного распределения
function computePotential(players, matches) {
  const byId = new Map(players.map(p => [p.id, p]));
  const pairKey = (a, b) => (a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`);
  const usedPairs = new Set(matches.map(m => pairKey(m.a, m.b)));
  const usedTiers = new Map();
  for (const p of players) usedTiers.set(p.id, new Set());
  for (const m of matches) {
    usedTiers.get(m.a.id).add(m.tierA);
    usedTiers.get(m.b.id).add(m.tierB);
  }
  const freeTiers = new Map();
  for (const p of players) {
    const arr = [];
    for (let t = 1; t <= p.slots; t++) if (!usedTiers.get(p.id).has(t)) arr.push(t);
    freeTiers.set(p.id, arr);
  }

  // Для каждого свободного тира игрока найдём ближайшего партнёра с любым свободным тира
  const suggestionsByPlayer = new Map();
  for (const p of players) suggestionsByPlayer.set(p.id, []);
  for (const p of players) {
    const need = freeTiers.get(p.id);
    for (const t of need) {
      let best = null;
      for (const q of players) {
        if (q.id === p.id) continue;
        const qfree = freeTiers.get(q.id);
        if (!qfree.length) continue;
        // лучший по расстоянию любой свободный tier у q
        let candidateTier = qfree[0];
        const dist = distance(p, q);
        if (!best || dist < best.dist) {
          // предпочтём равный тиру, если есть
          candidateTier = qfree.includes(t) ? t : candidateTier;
          best = { q, dist, tierP: t, tierQ: candidateTier, blocked: usedPairs.has(pairKey(p, q)) };
        }
      }
      if (best) suggestionsByPlayer.get(p.id).push(best);
    }
  }
  return suggestionsByPlayer;
}

function renderPlayersView(container, players, matches, suggestionsByPlayer) {
  const outgoing = new Map();
  const incoming = new Map();
  for (const p of players) { outgoing.set(p.id, []); incoming.set(p.id, []); }
  for (const m of matches) {
    // Обмен двусторонний: запишем отправки и получения для обеих сторон
    outgoing.get(m.a.id).push({ who: m.b, from: m.tierA, to: m.tierB, dist: m.dist });
    incoming.get(m.a.id).push({ who: m.b, from: m.tierB, to: m.tierA, dist: m.dist });

    outgoing.get(m.b.id).push({ who: m.a, from: m.tierB, to: m.tierA, dist: m.dist });
    incoming.get(m.b.id).push({ who: m.a, from: m.tierA, to: m.tierB, dist: m.dist });
  }

  const parts = [];
  for (const p of players) {
    const out = outgoing.get(p.id);
    const inc = incoming.get(p.id);
    // Карта отправок по тиру, чтобы отрисовать q1..qN в порядке
    const sendByTier = {};
    for (const x of out) sendByTier[x.from] = x;
    const outLines = [];
    for (let t = 1; t <= p.slots; t++) {
      const x = sendByTier[t];
      if (x) {
        outLines.push(`<div class="flow-item"><span class="badge q${t}">q${t}</span> → <span class="who">${x.who.name}</span> <span class="small">(${x.who.x},${x.who.y}) · ${x.dist.toFixed(1)}</span></div>`);
      } else {
        outLines.push(`<div class="flow-item"><span class="badge q${t}">q${t}</span> → <span class="small" style="opacity:.7">—</span></div>`);
      }
    }
    const outHtml = outLines.join('');
    const incHtml = inc.length
      ? inc.map(x => `<div class="flow-item"><span class="badge q${x.from}">q${x.from}</span> from <span class="who">${x.who.name}</span> <span class="small">(${x.who.x},${x.who.y}) · ${x.dist.toFixed(1)}</span> <span class="small">for q${x.to}</span></div>`).join('')
      : '<div class="small" style="opacity:.7">—</div>';

    const sugg = suggestionsByPlayer?.get(p.id) || [];
    const suggHtml = sugg.length
      ? sugg.map(s => `<div class="pot-item"><span class="badge q${s.tierP}">q${s.tierP}</span> ↔ <span class="badge q${s.tierQ}">q${s.tierQ}</span> <span class="who">${s.q.name}</span> <span class="small">(${s.q.x},${s.q.y}) · ${s.dist.toFixed(1)}</span> ${s.blocked ? '<span class="badge lock">already traded</span>' : ''}</div>`).join('')
      : '<div class="small" style="opacity:.7">— no free tiers</div>';

    parts.push(`
      <div class="player-card">
        <div class="header">
          <div><strong>${p.name}</strong></div>
          <div class="meta">(${p.x},${p.y}) · slots: ${p.slots}</div>
        </div>
        <div class="flows">
          <div class="flow-col">
            <h3>Sends</h3>
            ${outHtml}
          </div>
          <div class="flow-col">
            <h3>Receives</h3>
            ${incHtml}
          </div>
        </div>
        <div class="potential">
          <h3>Potential extra trades</h3>
          ${suggHtml}
        </div>
      </div>
    `);
  }
  container.innerHTML = parts.join('\n');
}

function renderLogs(container, logs) {
  if (!logs || logs.length === 0) {
    container.innerHTML = '<div class="log-item" style="opacity:.7">All units are assigned.</div>';
    return;
  }
  container.innerHTML = logs.map(l => `<div class="log-item">${l}</div>`).join('\n');
}

function updateStats(players) {
  const el = document.getElementById('playerCount');
  el.textContent = `Players: ${players.length}`;
}

async function main() {
  let players = await loadPlayers();
  updateStats(players);

  const canvas = document.getElementById('map');
  const playersViewEl = document.getElementById('playersView');
  const logsEl = document.getElementById('logs');
  const listEl = document.getElementById('playerList');
  const openPlayersBtn = document.getElementById('openPlayersBtn');
  const playersModal = document.getElementById('playersModal');
  const closePlayersModal = document.getElementById('closePlayersModal');
  // registration controls
  const regStatusEl = document.getElementById('regStatus');
  const regMinutesEl = document.getElementById('regMinutes');
  const regStartBtn = document.getElementById('regStart');
  const regPlusBtn = document.getElementById('regPlus');
  const regMinusBtn = document.getElementById('regMinus');

  async function recomputeAndRender() {
    const { matches, unmatchedLogs } = computeMatches(players);
    const suggestions = computePotential(players, matches);
    renderPlayersView(playersViewEl, players, matches, suggestions);
    renderLogs(logsEl, unmatchedLogs);
    renderSidebarList(listEl, players);
    resizeCanvasToContainer(canvas);
    drawMap(canvas, players, matches);
    updateStats(players);
    updateRegUI();
  }

  // Форма добавления
  const form = document.getElementById('addPlayerForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('name').value.trim();
    const x = Number(document.getElementById('x').value);
    const y = Number(document.getElementById('y').value);
    const slots = Number(document.getElementById('slots').value);
    if (!name) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (slots < 3 || slots > 4) return;
    if (window.Api && Api.hasApi) {
      const created = await Api.addPlayer({ name, x, y, slots });
      players = await loadPlayers();
    } else {
      players.push({ id: uid(), name, x, y, slots });
      await savePlayers(players);
    }
    form.reset();
    document.getElementById('slots').value = String(slots);
    await recomputeAndRender();
  });

  // Сброс к демо-данным
  document.getElementById('resetSample').addEventListener('click', async () => {
    players = defaultPlayers();
    await savePlayers(players);
    await recomputeAndRender();
  });

  // Первичный рендер
  await recomputeAndRender();

  // Ресайз окна — подгоняем канвас и перерисовываем
  window.addEventListener('resize', async () => {
    resizeCanvasToContainer(canvas);
    const { matches } = computeMatches(players);
    drawMap(canvas, players, matches);
  });

  // Collapsible for Add Player (collapsed by default on mobile widths)
  const addCollapsible = document.getElementById('addCollapsible');
  const header = addCollapsible?.querySelector('.collapsible-header');
  if (header) {
    header.addEventListener('click', () => {
      const open = addCollapsible.classList.toggle('open');
      const arrow = addCollapsible.querySelector('.arrow');
      if (arrow) arrow.textContent = open ? '▼' : '▶';
    });
  }
  // collapse if small screen on load
  if (window.matchMedia('(max-width: 900px)').matches) {
    if (addCollapsible && addCollapsible.classList.contains('open')) {
      addCollapsible.classList.remove('open');
      const arrow = addCollapsible.querySelector('.arrow');
      if (arrow) arrow.textContent = '▶';
    }
  }
  // Modal open/close
  function openModal() {
    playersModal.classList.remove('hidden');
    renderSidebarList(listEl, players); // ensure fresh list
  }
  function closeModal() { playersModal.classList.add('hidden'); }
  openPlayersBtn?.addEventListener('click', openModal);
  closePlayersModal?.addEventListener('click', closeModal);
  playersModal?.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) closeModal();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  // Registration logic
  function isOpen(state){ const now=Date.now(); return state && state.started && state.endAt && now < state.endAt; }
  function leftFmt(ms){ const s=Math.floor(ms/1000)%60; const m=Math.floor(ms/60000)%60; const h=Math.floor(ms/3600000); return `${h? h+':':''}${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
  async function updateRegUI(){ const st = (window.Api && Api.hasApi) ? await Api.getRegState() : loadRegState(); const now=Date.now(); if(isOpen(st)){ regStatusEl.textContent = `Registration: OPEN — ${leftFmt(st.endAt-now)}`; regStartBtn.textContent='Restart'; regPlusBtn.disabled=false; regMinusBtn.disabled=false; } else if(st && st.started && st.endAt && now>=st.endAt){ regStatusEl.textContent='Registration: CLOSED'; regStartBtn.textContent='Open'; regPlusBtn.disabled=true; regMinusBtn.disabled=true; } else { regStatusEl.textContent='Registration: closed'; regStartBtn.textContent='Open'; regPlusBtn.disabled=true; regMinusBtn.disabled=true; }}
  async function startReg(){ const mins=Math.max(1, Number(regMinutesEl.value)||10); if (window.Api && Api.hasApi) { await Api.openRegistration(mins); } else { const endAt=Date.now()+mins*60*1000; const st={started:true,endAt}; saveRegState(st); } updateRegUI(); }
  async function adjustReg(deltaMs){ if (window.Api && Api.hasApi) { await Api.adjustRegistration(deltaMs); } else { const st=loadRegState(); if(!isOpen(st)) return; st.endAt += deltaMs; saveRegState(st); } updateRegUI(); }
  regStartBtn?.addEventListener('click', startReg);
  regPlusBtn?.addEventListener('click', ()=>adjustReg(60*1000));
  regMinusBtn?.addEventListener('click', ()=>adjustReg(-30*1000));
  setInterval(()=>{ updateRegUI(); }, 1000);
  updateRegUI();

  // Cross-tab realtime updates: reflect registrations and timer changes without reload
  if (window.Api && Api.hasApi) {
    Api.subscribe(async (ev) => {
      if (ev.type === 'players') { players = await loadPlayers(); await recomputeAndRender(); }
      if (ev.type === 'reg') { updateRegUI(); }
    });
  } else {
    window.addEventListener('storage', async (e) => {
      if (e.key === STORAGE_KEY) { players = await loadPlayers(); await recomputeAndRender(); }
      else if (e.key === REG_STATE_KEY) { updateRegUI(); }
    });
  }
}

document.addEventListener('DOMContentLoaded', main);

// Рендер списка игроков для правого сайдбара + редактирование
function renderSidebarList(container, players) {
  const items = players.map(p => `
    <div class="player-row" data-id="${p.id}">
      <div class="header"><span class="arrow">▶</span><div class="title">${p.name}</div></div>
      <div class="details">
        <label>Name
          <input class="pl-field" data-field="name" value="${p.name}" />
        </label>
        <div class="row">
          <label>X
            <input class="pl-field" data-field="x" type="number" step="1" value="${p.x}" />
          </label>
          <label>Y
            <input class="pl-field" data-field="y" type="number" step="1" value="${p.y}" />
          </label>
        </div>
        <label>Slots
          <select class="pl-field" data-field="slots">
            <option value="3" ${p.slots === 3 ? 'selected' : ''}>3</option>
            <option value="4" ${p.slots === 4 ? 'selected' : ''}>4</option>
          </select>
        </label>
      </div>
    </div>
  `);
  container.innerHTML = items.join('\n');

  // Делегирование изменений
  container.onchange = (e) => {
    const t = e.target;
    if (!t.classList.contains('pl-field')) return;
    const row = t.closest('.player-row');
    const id = row?.dataset.id;
    const field = t.dataset.field;
    if (!id || !field) return;
    const idx = players.findIndex(x => x.id === id);
    if (idx === -1) return;
    const valRaw = t.value;
    let val = valRaw;
    if (field === 'x' || field === 'y' || field === 'slots') val = Number(valRaw);
    if ((field === 'slots') && (val < 3 || val > 4)) return;
    players[idx] = { ...players[idx], [field]: val };
    savePlayers(players);
    // После изменения координат или слотов — перерасчёт
    const canvas = document.getElementById('map');
    const playersViewEl = document.getElementById('playersView');
    const logsEl = document.getElementById('logs');
    const { matches, unmatchedLogs } = computeMatches(players);
    const suggestions = computePotential(players, matches);
    renderPlayersView(playersViewEl, players, matches, suggestions);
    renderLogs(logsEl, unmatchedLogs);
    drawMap(canvas, players, matches);
    updateStats(players);
  };

  // Тогглинг раскрытия
  container.onclick = (e) => {
    const header = e.target.closest('.header');
    if (!header) return;
    const row = header.closest('.player-row');
    if (!row) return;
    const open = row.classList.toggle('open');
    const arrow = row.querySelector('.arrow');
    if (arrow) arrow.textContent = open ? '▼' : '▶';
  };
}

// Подгон размеров канваса к контейнеру с учётом DPR
function resizeCanvasToContainer(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}
