const BASE = '/api/chat';

async function handle(res) {
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.error || '';
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return res.json();
}

export async function createSession() {
  const res = await fetch(`${BASE}/session`, { method: 'POST' });
  return handle(res);
}

export async function sendMessage(sessionId, message) {
  const res = await fetch(`${BASE}/session/${sessionId}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  return handle(res);
}

export async function resetSession(sessionId) {
  const res = await fetch(`${BASE}/session/${sessionId}/reset`, { method: 'POST' });
  return handle(res);
}
