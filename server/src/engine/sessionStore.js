/**
 * sessionStore.js
 * ---------------------------------------------------------------------------
 * Deliberately simple in-memory session storage. The spec explicitly marks
 * persistence beyond a session as a non-goal, so a Map keyed by sessionId is
 * enough; sessions are pruned after a period of inactivity so long-running
 * demo/dev servers don't leak memory. Swapping this for Redis later would
 * only mean changing this one file (NFR-01).
 * ---------------------------------------------------------------------------
 */

const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 1000 * 60 * 60 * 2); // 2h

const sessions = new Map();

function put(sessionId, state) {
  sessions.set(sessionId, { state, touchedAt: Date.now() });
}

function get(sessionId) {
  const entry = sessions.get(sessionId);
  if (!entry) return null;
  entry.touchedAt = Date.now();
  return entry.state;
}

function remove(sessionId) {
  sessions.delete(sessionId);
}

function cleanup() {
  const now = Date.now();
  for (const [id, entry] of sessions.entries()) {
    if (now - entry.touchedAt > SESSION_TTL_MS) sessions.delete(id);
  }
}

setInterval(cleanup, 1000 * 60 * 15).unref();

module.exports = { put, get, remove, size: () => sessions.size };
