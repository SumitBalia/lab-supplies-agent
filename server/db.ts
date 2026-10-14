import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';
import type { ChatMessage, Proposal, AgentReply } from './types.js';
mkdirSync(config.DATA_DIR, { recursive: true });
export const db = new DatabaseSync(join(config.DATA_DIR, 'agent.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS sessions(user_id TEXT, session_id TEXT, messages TEXT NOT NULL DEFAULT '[]', updated_at INTEGER, PRIMARY KEY(user_id,session_id));
CREATE TABLE IF NOT EXISTS memory(user_id TEXT PRIMARY KEY, lab TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS proposals(id TEXT PRIMARY KEY, user_id TEXT, session_id TEXT, status TEXT, payload TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_proposal ON proposals(user_id,session_id) WHERE status IN ('pending','approved');
CREATE TABLE IF NOT EXISTS responses(user_id TEXT, session_id TEXT, request_id TEXT, input TEXT, response TEXT, PRIMARY KEY(user_id,session_id,request_id));`);
db.exec(
  'CREATE TABLE IF NOT EXISTS leases(user_id TEXT, session_id TEXT, owner TEXT, until INTEGER, PRIMARY KEY(user_id,session_id))',
);
export function claimSession(u: string, s: string, owner: string) {
  return (
    db
      .prepare(
        'INSERT INTO leases VALUES(?,?,?,?) ON CONFLICT(user_id,session_id) DO UPDATE SET owner=excluded.owner,until=excluded.until WHERE leases.until<?',
      )
      .run(u, s, owner, Date.now() + config.REQUEST_TIMEOUT_MS + 10000, Date.now()).changes === 1
  );
}
export function releaseSession(u: string, s: string, owner: string) {
  db.prepare('DELETE FROM leases WHERE user_id=? AND session_id=? AND owner=?').run(u, s, owner);
}
export function cleanup() {
  db.prepare('DELETE FROM memory WHERE updated_at<?').run(Date.now() - 90 * 86400000);
  db.prepare('DELETE FROM sessions WHERE updated_at<?').run(Date.now() - 30 * 86400000);
  // Request replay cache is bounded independently from long-lived purchase receipts.
  db.prepare(
    'DELETE FROM responses WHERE rowid NOT IN (SELECT rowid FROM responses ORDER BY rowid DESC LIMIT 10000)',
  ).run();
}
export const history = (u: string, s: string): ChatMessage[] => {
  const row = db
    .prepare('SELECT messages FROM sessions WHERE user_id=? AND session_id=?')
    .get(u, s) as { messages: string } | undefined;
  return row ? JSON.parse(row.messages) : [];
};
export function saveHistory(u: string, s: string, messages: ChatMessage[]) {
  db.prepare(
    'INSERT INTO sessions VALUES(?,?,?,?) ON CONFLICT(user_id,session_id) DO UPDATE SET messages=excluded.messages,updated_at=excluded.updated_at',
  ).run(u, s, JSON.stringify(messages.slice(-40)), Date.now());
}
export function getLab(u: string): string | null {
  const row = db
    .prepare('SELECT lab FROM memory WHERE user_id=? AND updated_at>?')
    .get(u, Date.now() - 90 * 86400000) as { lab: string } | undefined;
  return row?.lab ?? null;
}
export function rememberLab(u: string, lab: string) {
  db.prepare(
    'INSERT INTO memory VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET lab=excluded.lab,updated_at=excluded.updated_at',
  ).run(u, lab, Date.now());
}
export function getProposal(u: string, s: string): Proposal | null {
  const row = db
    .prepare(
      "SELECT payload FROM proposals WHERE user_id=? AND session_id=? AND status IN ('pending','approved')",
    )
    .get(u, s) as { payload: string } | undefined;
  return row ? JSON.parse(row.payload) : null;
}
export function saveProposal(p: Proposal) {
  db.prepare(
    'INSERT INTO proposals VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,payload=excluded.payload',
  ).run(p.id, p.userId, p.sessionId, p.status, JSON.stringify(p));
}
export function cachedReply(u: string, s: string, id: string, input: string): AgentReply | null {
  const row = db
    .prepare(
      'SELECT input,response FROM responses WHERE user_id=? AND session_id=? AND request_id=?',
    )
    .get(u, s, id) as { input: string; response: string } | undefined;
  if (row && row.input !== input)
    throw new Error('REQUEST_ID_CONFLICT: Use a new requestId for a different message.');
  return row ? JSON.parse(row.response) : null;
}
export function cacheReply(u: string, s: string, id: string, input: string, reply: AgentReply) {
  db.prepare('INSERT INTO responses VALUES(?,?,?,?,?)').run(u, s, id, input, JSON.stringify(reply));
}
export function latestReply(u: string, s: string): AgentReply | null {
  const row = db
    .prepare(
      'SELECT response FROM responses WHERE user_id=? AND session_id=? ORDER BY rowid DESC LIMIT 1',
    )
    .get(u, s) as { response: string } | undefined;
  return row ? JSON.parse(row.response) : null;
}
