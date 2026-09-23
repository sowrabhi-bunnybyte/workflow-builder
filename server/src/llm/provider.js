/**
 * provider.js
 * ---------------------------------------------------------------------------
 * Thin, swappable wrapper around whichever free-tier LLM API is configured.
 * The rest of the app only ever calls `chatJSON(messages)` and never knows
 * which vendor answered. Supported today:
 *
 *   - "groq"   (default) — https://console.groq.com — free API key, no card.
 *   - "gemini"           — https://aistudio.google.com — free API key.
 *   - "none"             — no key configured; every call short-circuits so
 *                          the deterministic rule-based engine takes over.
 *
 * Set LLM_PROVIDER and the matching *_API_KEY in server/.env — see
 * server/.env.example and the project README for step-by-step, free
 * instructions to obtain a key.
 * ---------------------------------------------------------------------------
 */

const PROVIDER = (process.env.LLM_PROVIDER || 'groq').toLowerCase();
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

const REQUEST_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 15000);

function isConfigured() {
  if (PROVIDER === 'groq') return Boolean(GROQ_API_KEY);
  if (PROVIDER === 'gemini') return Boolean(GEMINI_API_KEY);
  return false;
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('LLM request timed out')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Extract the first valid JSON object from a string. LLMs occasionally wrap
 * JSON in prose or markdown fences despite instructions — this recovers it
 * instead of failing the whole turn.
 */
function extractJSON(text) {
  if (!text) throw new Error('Empty LLM response');
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('No JSON object found in LLM response');
  }
  const jsonSlice = candidate.slice(start, end + 1);
  return JSON.parse(jsonSlice);
}

async function callGroq(messages, { temperature }) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: temperature ?? 0.2,
      response_format: { type: 'json_object' },
      max_tokens: 1200,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Groq API error ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  return extractJSON(text);
}

async function callGemini(messages, { temperature }) {
  // Gemini's REST API doesn't use the OpenAI role/message shape, so we fold
  // the system + history into one prompt block.
  const systemMsg = messages.find((m) => m.role === 'system');
  const rest = messages.filter((m) => m.role !== 'system');
  const contents = rest.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: systemMsg ? { parts: [{ text: systemMsg.content }] } : undefined,
      contents,
      generationConfig: {
        temperature: temperature ?? 0.2,
        responseMimeType: 'application/json',
        maxOutputTokens: 1200,
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini API error ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return extractJSON(text);
}

/**
 * Send a chat-style message list and get back a parsed JSON object.
 * Throws on any failure — callers are expected to catch and fall back to
 * the deterministic rule-based engine (see engine/dialogueManager.js).
 */
async function chatJSON(messages, options = {}) {
  if (!isConfigured()) {
    throw new Error('No LLM provider configured');
  }
  const call = PROVIDER === 'gemini' ? callGemini : callGroq;
  return withTimeout(call(messages, options), REQUEST_TIMEOUT_MS);
}

module.exports = {
  chatJSON,
  isConfigured,
  PROVIDER,
};
