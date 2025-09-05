// Lightweight API wrapper with fallback to localStorage
(function(){
  const STORAGE_KEY = 'topHeroesPlayers';
  const REG_STATE_KEY = 'topHeroesRegistration';
  const BASE = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE.replace(/\/$/, '') : '';

  function timeout(ms){ return new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),ms)); }

  async function detectApi(){
    try {
      await Promise.race([
        fetch(`${BASE}/api/ping`, { cache: 'no-store' }),
        timeout(1200)
      ]);
      return true;
    } catch { return false; }
  }

  const Api = {
    hasApi: false,
    async init(){ this.hasApi = await detectApi(); if (typeof console !== 'undefined') console.info('[API] mode:', this.hasApi ? `external ${BASE||''}` : 'localStorage'); return this.hasApi; },
    async getPlayers(){
      if (this.hasApi){ const r = await fetch(`${BASE}/api/players`); return r.json(); }
      try { const raw = localStorage.getItem(STORAGE_KEY); const arr = raw? JSON.parse(raw): []; return Array.isArray(arr)? arr: []; } catch { return []; }
    },
    async addPlayer(p){
      if (this.hasApi){
        const r = await fetch(`${BASE}/api/players`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(p) });
        return r.json();
      }
      const list = await this.getPlayers(); list.push(p); localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); return p;
    },
    async replaceAll(players){
      if (this.hasApi){
        // naive seed: delete all then insert — only for demo/dev
        await fetch(`${BASE}/api/players`, { method:'DELETE' });
        for (const p of players) { await this.addPlayer(p); }
        return true;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(players)); return true;
    },
    async getRegState(){
      if (this.hasApi){ const r = await fetch(`${BASE}/api/reg-state`); return r.json(); }
      try { return JSON.parse(localStorage.getItem(REG_STATE_KEY) || '{}'); } catch { return {}; }
    },
    async openRegistration(minutes){ if (this.hasApi){ await fetch(`${BASE}/api/reg/open`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ minutes }) }); } else { const endAt=Date.now()+minutes*60*1000; localStorage.setItem(REG_STATE_KEY, JSON.stringify({ started:true, endAt })); } },
    async adjustRegistration(deltaMs){ if (this.hasApi){ await fetch(`${BASE}/api/reg/adjust`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ deltaMs }) }); } else { try { const st=JSON.parse(localStorage.getItem(REG_STATE_KEY)||'{}'); if(st && st.endAt){ st.endAt += deltaMs; localStorage.setItem(REG_STATE_KEY, JSON.stringify(st)); } } catch {} } },
    subscribe(onEvent){
      if (this.hasApi){
        try { const es = new EventSource(`${BASE}/api/stream`); es.onmessage = (e)=>{ try{ onEvent(JSON.parse(e.data)); } catch{} }; return ()=>es.close(); } catch { return ()=>{}; }
      }
      const handler = (e)=>{ if (e.key === STORAGE_KEY) onEvent({ type:'players' }); if (e.key === REG_STATE_KEY) onEvent({ type:'reg' }); };
      window.addEventListener('storage', handler);
      return ()=>window.removeEventListener('storage', handler);
    }
  };

  window.Api = Api;
})();
