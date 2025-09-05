import express from 'express';
import cors from 'cors';
import { listPlayers, upsertPlayer, deleteAllPlayers, deletePlayer, getReg, setReg, adjustReg } from './db.js';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
app.use(cors());
app.use(express.json());
// Serve static frontend from project root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');
app.use(express.static(webRoot));

const clients = new Set();
function broadcast(payload){ const data = JSON.stringify(payload); for (const res of clients) { res.write(`data: ${data}\n\n`); } }

// ping
app.get('/api/ping', (req,res)=>res.json({ ok: true }));

// players
app.get('/api/players', (req,res)=>{ res.json(listPlayers()); });
app.post('/api/players', (req,res)=>{
  const { name, x, y, slots } = req.body || {};
  if (!name || typeof x !== 'number' || typeof y !== 'number' || ![3,4].includes(slots)) return res.status(400).json({ error:'invalid' });
  const p = upsertPlayer({ name, x, y, slots });
  broadcast({ type:'players', player: p });
  res.json(p);
});
app.delete('/api/players', (req,res)=>{ deleteAllPlayers(); broadcast({ type:'players' }); res.json({ ok:true}); });
app.delete('/api/players/:id', (req,res)=>{ const { id } = req.params; deletePlayer(id); broadcast({ type:'players' }); res.json({ ok:true }); });

// registration state
app.get('/api/reg-state', (req,res)=>{ res.json(getReg() || {}); });
app.post('/api/reg/open', (req,res)=>{ const { minutes } = req.body || {}; const ms = Math.max(1, Number(minutes)||10) * 60 * 1000; const endAt = Date.now() + ms; setReg(true, endAt); broadcast({ type:'reg' }); res.json(getReg()); });
app.post('/api/reg/adjust', (req,res)=>{ const { deltaMs } = req.body || {}; const st = adjustReg(Number(deltaMs)||0); broadcast({ type:'reg' }); res.json(st); });
app.post('/api/reg/close', (req,res)=>{ setReg(true, Date.now()); broadcast({ type:'reg' }); res.json(getReg()); });

// sse stream
app.get('/api/stream', (req,res)=>{
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  clients.add(res);
  req.on('close', ()=>{ clients.delete(res); });
});

// Fallback routes for top-level pages
app.get(['/','/index.html'], (req,res)=>{ res.sendFile(path.join(webRoot, 'index.html')); });
app.get(['/register','/register.html'], (req,res)=>{ res.sendFile(path.join(webRoot, 'register.html')); });

const port = process.env.PORT || 3006;
app.listen(port, ()=>{ console.log('Server listening on', port); });
