import Database from 'better-sqlite3';
import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 8);

const db = new Database('data.db');

db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  slots INTEGER NOT NULL CHECK (slots IN (3,4)),
  createdAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reg_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  started INTEGER,
  endAt INTEGER
);

INSERT OR IGNORE INTO reg_state(id, started, endAt) VALUES (1, 0, NULL);
`);

export function listPlayers(){
  return db.prepare('SELECT id,name,x,y,slots,createdAt FROM players ORDER BY createdAt ASC').all();
}

export function upsertPlayer({name,x,y,slots}){
  const existing = db.prepare('SELECT * FROM players WHERE lower(name) = lower(?)').get(name);
  if (existing) return existing;
  const id = nanoid();
  const createdAt = Date.now();
  db.prepare('INSERT INTO players(id,name,x,y,slots,createdAt) VALUES(?,?,?,?,?,?)').run(id,name,x,y,slots,createdAt);
  return db.prepare('SELECT id,name,x,y,slots,createdAt FROM players WHERE id=?').get(id);
}

export function deleteAllPlayers(){ db.prepare('DELETE FROM players').run(); }

export function getReg(){ return db.prepare('SELECT started,endAt FROM reg_state WHERE id=1').get(); }
export function setReg(started, endAt){ db.prepare('UPDATE reg_state SET started=?, endAt=? WHERE id=1').run(started?1:0, endAt||null); }
export function adjustReg(deltaMs){ const r=getReg(); if(!r || !r.endAt) return getReg(); const endAt=r.endAt + deltaMs; setReg(true,endAt); return getReg(); }

export default db;

