// Simple registration page logic sharing the same localStorage model as admin
const STORAGE_KEY = 'topHeroesPlayers';
const REG_STATE_KEY = 'topHeroesRegistration';

function uid() { return Math.random().toString(36).slice(2, 9); }
function distance(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return Math.hypot(dx, dy); }
async function loadPlayers() { if (window.Api && (await Api.init())) { return await Api.getPlayers(); } try { const raw = localStorage.getItem(STORAGE_KEY); const arr = raw? JSON.parse(raw): []; return Array.isArray(arr)? arr: []; } catch { return []; } }
async function savePlayers(players) { if (window.Api && Api.hasApi) { await Api.replaceAll(players); return; } localStorage.setItem(STORAGE_KEY, JSON.stringify(players)); }
function loadReg() { if (window.Api && Api.hasApi) { /* synchronous caller uses async tick to update */ } try { return JSON.parse(localStorage.getItem(REG_STATE_KEY) || '{}'); } catch { return {}; } }
function saveReg(state) { if (window.Api && Api.hasApi) return; localStorage.setItem(REG_STATE_KEY, JSON.stringify(state)); }

function computeMatches(players) {
  const usedPairs = new Set();
  const matches = [];
  const unmatchedByTier = {1:new Set(),2:new Set(),3:new Set(),4:new Set()};
  const taken = {1:new Set(),2:new Set(),3:new Set(),4:new Set()};
  const pairKey = (a,b)=>(a.id<b.id?`${a.id}|${b.id}`:`${b.id}|${a.id}`);

  // q1: greedy initial + 2-opt
  {
    const elig = players.filter(p=>p.slots>=1);
    const edges=[]; for(let i=0;i<elig.length;i++) for(let j=i+1;j<elig.length;j++){const a=elig[i],b=elig[j];edges.push({a,b,dist:distance(a,b)});} edges.sort((x,y)=>x.dist-y.dist);
    const used=new Set(); const q1Pairs=[]; for(const e of edges){ if(used.has(e.a.id)||used.has(e.b.id))continue; q1Pairs.push([e.a,e.b]); used.add(e.a.id); used.add(e.b.id);} 
    let improved=true, guard=0; const d=(a,b)=>distance(a,b);
    while(improved&&guard<8){ improved=false; guard++; for(let i=0;i<q1Pairs.length;i++){ for(let j=i+1;j<q1Pairs.length;j++){ const [a,b]=q1Pairs[i], [c,d2]=q1Pairs[j]; const cur=d(a,b)+d(c,d2); const alt1=d(a,c)+d(b,d2); const alt2=d(a,d2)+d(b,c); if(alt1+1e-6<cur && alt1<=alt2){ q1Pairs[i]=[a,c]; q1Pairs[j]=[b,d2]; improved=true; break;} else if(alt2+1e-6<cur){ q1Pairs[i]=[a,d2]; q1Pairs[j]=[b,c]; improved=true; break;} } if(improved)break; } }
    for(const [pa,pb] of q1Pairs){ const key=pairKey(pa,pb); if(usedPairs.has(key))continue; usedPairs.add(key); taken[1].add(pa.id); taken[1].add(pb.id); matches.push({a:pa,b:pb,tierA:1,tierB:1,dist:d(pa,pb)}); }
    for(const p of elig) if(!taken[1].has(p.id)) unmatchedByTier[1].add(p.id);
  }
  // q2..q4
  for(let tier=2;tier<=4;tier++){
    const elig=players.filter(p=>p.slots>=tier); const edges=[]; const pk=(a,b)=>(a.id<b.id?`${a.id}|${b.id}`:`${b.id}|${a.id}`);
    for(let i=0;i<elig.length;i++) for(let j=i+1;j<elig.length;j++){ const a=elig[i], b=elig[j]; const key=pk(a,b); if(usedPairs.has(key))continue; edges.push({a,b,dist:distance(a,b),key}); }
    edges.sort((x,y)=>x.dist-y.dist);
    for(const e of edges){ if(taken[tier].has(e.a.id)||taken[tier].has(e.b.id))continue; if(usedPairs.has(e.key))continue; usedPairs.add(e.key); taken[tier].add(e.a.id); taken[tier].add(e.b.id); matches.push({a:e.a,b:e.b,tierA:tier,tierB:tier,dist:e.dist}); }
    for(const p of elig) if(!taken[tier].has(p.id)) unmatchedByTier[tier].add(p.id);
  }
  // cross-tier
  function cross(fromTier,toTier){ const A=players.filter(p=>p.slots>=fromTier && unmatchedByTier[fromTier].has(p.id)); const B=players.filter(p=>p.slots>=toTier && unmatchedByTier[toTier].has(p.id)); const edges=[]; for(const a of A) for(const b of B){ if(a.id===b.id)continue; const key=pairKey(a,b); if(usedPairs.has(key))continue; edges.push({a,b,dist:distance(a,b),key}); } edges.sort((x,y)=>x.dist-y.dist); for(const e of edges){ if(!unmatchedByTier[fromTier].has(e.a.id))continue; if(!unmatchedByTier[toTier].has(e.b.id))continue; if(usedPairs.has(e.key))continue; usedPairs.add(e.key); unmatchedByTier[fromTier].delete(e.a.id); unmatchedByTier[toTier].delete(e.b.id); matches.push({a:e.a,b:e.b,tierA:fromTier,tierB:toTier,dist:e.dist}); } }
  cross(1,2); cross(2,3); cross(3,4);
  return { matches };
}

// Potential extra trades (same logic as admin)
function computePotential(players, matches) {
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
        let candidateTier = qfree[0];
        const dist = distance(p, q);
        if (!best || dist < best.dist) {
          candidateTier = qfree.includes(t) ? t : candidateTier;
          best = { q, dist, tierP: t, tierQ: candidateTier, blocked: usedPairs.has(pairKey(p, q)) };
        }
      }
      if (best) suggestionsByPlayer.get(p.id).push(best);
    }
  }
  return suggestionsByPlayer;
}

function renderAssignedForPlayer(playerId){
  const players=loadPlayers();
  const me=players.find(p=>p.id===playerId);
  const box=document.getElementById('assignments');
  if(!me){ box.innerHTML='<div class="log-item">Player not found.</div>'; return; }
  const {matches}=computeMatches(players);
  // Build outgoing/incoming exactly like admin: record both directions
  const outgoing = [];
  const incoming = [];
  for (const m of matches) {
    if (m.a.id === playerId) {
      outgoing.push({ who: m.b, from: m.tierA, to: m.tierB, dist: m.dist });
      incoming.push({ who: m.b, from: m.tierB, to: m.tierA, dist: m.dist });
    }
    if (m.b.id === playerId) {
      outgoing.push({ who: m.a, from: m.tierB, to: m.tierA, dist: m.dist });
      incoming.push({ who: m.a, from: m.tierA, to: m.tierB, dist: m.dist });
    }
  }
  const sendByTier = {};
  for (const x of outgoing) sendByTier[x.from] = x;
  const outLines = [];
  for (let t = 1; t <= me.slots; t++) {
    const x = sendByTier[t];
    if (x) {
      outLines.push(`<div class="flow-item"><span class="badge q${t}">q${t}</span> → <span class="who">${x.who.name}</span> <span class="small">(${x.who.x},${x.who.y}) · ${x.dist.toFixed(1)}</span></div>`);
    } else {
      outLines.push(`<div class="flow-item"><span class="badge q${t}">q${t}</span> → <span class="small" style="opacity:.7">—</span></div>`);
    }
  }
  const outHtml = outLines.join('');
  const incHtml = incoming.length
    ? incoming.map(x => `<div class="flow-item"><span class="badge q${x.from}">q${x.from}</span> from <span class="who">${x.who.name}</span> <span class="small">(${x.who.x},${x.who.y}) · ${x.dist.toFixed(1)}</span> <span class="small">for q${x.to}</span></div>`).join('')
    : '<div class="small" style="opacity:.7">—</div>';

  // Potential extra trades for this player
  const suggMap = computePotential(players, matches);
  const sugg = suggMap.get(playerId) || [];
  const suggHtml = sugg.length
    ? sugg.map(s => `<div class="pot-item"><span class="badge q${s.tierP}">q${s.tierP}</span> ↔ <span class="badge q${s.tierQ}">q${s.tierQ}</span> <span class="who">${s.q.name}</span> <span class="small">(${s.q.x},${s.q.y}) · ${s.dist.toFixed(1)}</span> ${s.blocked ? '<span class="badge lock">already traded</span>' : ''}</div>`).join('')
    : '<div class="small" style="opacity:.7">— no free tiers</div>';

  box.innerHTML=`
    <div class="flows" style="margin-top:6px">
      <div class="flow-col"><h3>Sends</h3>${outHtml}</div>
      <div class="flow-col"><h3>Receives</h3>${incHtml}</div>
    </div>
    <div class="potential">
      <h3>Potential extra trades</h3>
      ${suggHtml}
    </div>`;
  // expand section
  const wrap=document.getElementById('assignWrap');
  wrap.classList.add('open');
  const arr=wrap.querySelector('.arrow'); if(arr) arr.textContent='▼';
}

async function updateRegStatusUI(){
  const st = (window.Api && Api.hasApi) ? await Api.getRegState() : loadReg();
  const text=document.getElementById('regStatusText');
  const box=document.getElementById('regTimerBox');
  const timer=document.getElementById('regTimerText');
  const now=Date.now();
  box.classList.remove('open','closed');
  if(st.started && st.endAt && now<st.endAt){
    const left=st.endAt-now; const s=Math.floor(left/1000)%60; const m=Math.floor(left/60000)%60; const h=Math.floor(left/3600000);
    const t=`${h? h+':':''}${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    text.textContent='Registration is OPEN';
    timer.textContent=t;
    box.classList.add('open');
  } else if(st.started && st.endAt && now>=st.endAt){
    text.textContent='Registration is CLOSED.';
    timer.textContent='00:00';
    box.classList.add('closed');
  } else {
    text.textContent='Registration is not opened yet by R5/R4.';
    timer.textContent='--:--';
    box.classList.add('closed');
  }
}

async function main(){
  if (window.Api) { await Api.init(); }
  const form=document.getElementById('regForm');
  const msg=document.getElementById('regMessage');
  const coordsWrap=document.getElementById('coordsWrap');
  const submitBtn=document.getElementById('regSubmit');
  let currentPlayerId=null; // not persisted as requested
  let knownName=null;

  // hide coords until we check name
  coordsWrap.style.display='none';

  async function maybeRenderAssignments(){
    const st = (window.Api && Api.hasApi) ? await Api.getRegState() : loadReg();
    if (st && st.started && st.endAt && Date.now()>=st.endAt){
      await resolveIdByName();
      if (currentPlayerId) renderAssignedForPlayer(currentPlayerId);
    }
  }
  async function tick(){ await updateRegStatusUI(); await maybeRenderAssignments(); }
  setInterval(()=>{ tick(); },1000); tick();

  // collapsibles
  document.querySelectorAll('.collapsible .collapsible-header').forEach(h=>{
    h.addEventListener('click',()=>{ const par=h.parentElement; const open=par.classList.toggle('open'); const arrow=h.querySelector('.arrow'); if(arrow) arrow.textContent=open?'▼':'▶'; });
  });

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const name=document.getElementById('r_name').value.trim();
    if(!name){ msg.style.display='block'; msg.textContent='Enter your nickname.'; return; }

    const players= await loadPlayers();
    const existed=players.find(p=>p.name.toLowerCase()===name.toLowerCase());
    const st = (window.Api && Api.hasApi) ? await Api.getRegState() : loadReg();

    if(!existed){
      // not registered yet -> two‑step submit: first show coords, next actually register
      const coordsVisible = coordsWrap.style.display !== 'none';
      if(!coordsVisible){
        coordsWrap.style.display='block';
        submitBtn.textContent='Register';
        msg.style.display='block'; msg.textContent='Enter coordinates and slots, then press Register.';
        return;
      }
      const xStr=document.getElementById('r_x').value.trim();
      const yStr=document.getElementById('r_y').value.trim();
      const slots=Number(document.getElementById('r_slots').value);
      if(xStr===''||yStr===''){ msg.style.display='block'; msg.textContent='Enter coordinates and slots, then press Register.'; return; }
      const x=Number(xStr), y=Number(yStr);
      if(!Number.isFinite(x)||!Number.isFinite(y)|| !(slots===3||slots===4)){
        msg.style.display='block'; msg.textContent='Please provide valid coordinates and slots.'; return;
      }
      if(!(st.started && st.endAt && Date.now()<st.endAt)){
        msg.style.display='block'; msg.textContent='Registration is not open yet.'; return;
      }
      let me={ id: uid(), name, x, y, slots };
      if (window.Api && Api.hasApi) {
        const created = await Api.addPlayer({ name, x, y, slots });
        if (created && created.id) me.id = created.id;
      } else {
        players.push(me); await savePlayers(players);
      }
      currentPlayerId = me.id;
      knownName = name;
      // hide form after successful registration
      form.style.display='none';
      msg.style.display='block'; msg.textContent=`You are registered as ${me.name} (${me.x},${me.y}) · slots: ${me.slots}`;
      maybeRenderAssignments();
    } else {
      // already registered by name
      currentPlayerId = existed.id;
      knownName = existed.name;
      coordsWrap.style.display='none';
      // hide form for registered players
      form.style.display='none';
      msg.style.display='block';
      msg.textContent=`You are registered as ${existed.name} (${existed.x},${existed.y}) · slots: ${existed.slots}`;
      maybeRenderAssignments();
    }
  });

  // Fallback: if we lost ID (e.g. refresh), but know the name, resolve it on close
  async function resolveIdByName(){
    if (currentPlayerId || !knownName) return;
    const list = await loadPlayers();
    const found = list.find(p=>p.name.toLowerCase()===knownName.toLowerCase());
    if (found) currentPlayerId = found.id;
  }
}

document.addEventListener('DOMContentLoaded', main);
