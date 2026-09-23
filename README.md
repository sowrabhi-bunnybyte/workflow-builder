# Workflow Builder — Conversational Automation Planner

A chatbot that turns a plain-English automation request into a complete, structured
workflow — asking clarifying questions until it has everything it needs, and never
guessing at missing details.

> This tool **plans** workflows. It never executes anything or connects to any real
> external service — exactly as scoped in the assignment.

---

## Table of contents

1. [Live demo checklist (read this first)](#live-demo-checklist-read-this-first)
2. [The core idea — a hybrid, not a pure LLM wrapper](#the-core-idea--a-hybrid-not-a-pure-llm-wrapper)
3. [Project structure](#project-structure)
4. [Running it locally](#running-it-locally)
5. [Getting a free API key (optional but recommended)](#getting-a-free-api-key-optional-but-recommended)
6. [Environment variables](#environment-variables)
7. [How the engine actually works](#how-the-engine-actually-works)
8. [Testing](#testing)
9. [Hosting / deployment](#hosting--deployment)
10. [Known limitations & honest trade-offs](#known-limitations--honest-trade-offs)
11. [Design decisions worth asking about in the walkthrough](#design-decisions-worth-asking-about-in-the-walkthrough)

---

## Live demo checklist (read this first)

Because this only needs to run once for evaluation, here's the safest path:

1. **You do not need any API key for this to work.** The app ships with a fully
   deterministic, offline fallback engine (see below). If you never touch `.env`,
   the app still runs the whole conversation → clarification → generation flow correctly.
2. If you *do* want smarter, more natural conversations, get a **free** Groq API key
   (2 minutes, no credit card — see [below](#getting-a-free-api-key-optional-but-recommended))
   and put it in `server/.env`. If that key ever fails or rate-limits mid-demo, the
   app **automatically and silently falls back** to the offline engine for that turn —
   it will never crash or dead-end the conversation.
3. Run `npm run install:all` once, then `npm run dev` from the repo root, then open
   `http://localhost:5173`.
4. To rehearse exactly what the evaluator will see, try the example from the
   assignment PDF:
   > "Whenever a new invoice email arrives, notify my finance team on Slack if it's over ₹10,000"

---

## The core idea — a hybrid, not a pure LLM wrapper

The assignment's hardest requirement is also the easiest one to get subtly wrong:

> "Unlike a normal chatbot, your assistant must never assume missing information."

A pure "ask an LLM what to do next" chatbot **will** eventually assume something,
because free-tier LLMs are good at reading text but not perfectly reliable at
self-reporting "am I actually done collecting information yet?" — especially across
a long conversation, and especially on smaller/faster free models.

So this project deliberately splits the problem in two:

| Layer | Job | Where |
|---|---|---|
| **Extraction** (LLM, or rule-based fallback) | "What did the user just say, structured?" | `server/src/llm/`, `server/src/engine/ruleBasedExtractor.js` |
| **Control** (pure code, zero AI calls) | "What's missing? What's ambiguous? What contradicts? Are we ready? What do we ask next?" | `server/src/engine/dialogueManager.js`, `schema.js` |

The LLM (or its offline stand-in) is **never** asked "is the workflow ready?" — it's
only ever asked to pull structured fields out of one message. Every decision about
readiness, missing fields, ambiguity, and question order is computed in plain,
testable JavaScript against a fixed field registry (`schema.js`). This is what makes
the "never assume" guarantee actually hold, instead of being a hopeful prompt
instruction.

A second consequence of this split: **the app works with zero API keys at all.**
The rule-based extractor (`ruleBasedExtractor.js`) can bootstrap node discovery from
the opening message, and after that the dialogue manager relies on a simple but
airtight guarantee — *once it has asked one specific question about one specific
field, the user's raw reply **is** that field's value*. No deep NLU is needed to
accept an answer to a question you asked directly. That's what makes the offline
mode reliable rather than a stripped-down demo.

```
User message
     │
     ▼
┌─────────────────────┐        fails / no key       ┌───────────────────────┐
│   LLM extraction     │ ───────────────────────────▶│  Rule-based fallback  │
│ (Groq / Gemini, JSON)│                              │ (regex/keyword, safe) │
└─────────┬────────────┘                              └───────────┬───────────┘
          │                                                        │
          └──────────────────────┬─────────────────────────────────┘
                                  ▼
                  ┌───────────────────────────────┐
                  │   Deterministic dialogue core  │   (no AI calls here)
                  │  - merge fields, detect        │
                  │    contradictions              │
                  │  - detect ambiguity            │
                  │  - compute missing fields       │
                  │  - decide next question         │
                  │  - decide readiness             │
                  └───────────────┬────────────────┘
                                  ▼
                    Deterministic workflow builder
                    (always valid JSON schema, LLM
                     only optionally polishes labels)
```

---

## Project structure

```
workflow-builder/
├── package.json                 # root scripts (dev/build/start for both apps)
├── server/                      # Express API
│   ├── src/
│   │   ├── index.js             # entrypoint; serves API + built client in prod
│   │   ├── llm/
│   │   │   ├── provider.js      # Groq / Gemini / none — swappable in one place
│   │   │   └── prompts.js       # every prompt used, in one file
│   │   ├── engine/
│   │   │   ├── schema.js        # the field registry — the "never assume" contract
│   │   │   ├── dialogueManager.js   # the deterministic state machine
│   │   │   ├── ruleBasedExtractor.js # offline/opening-message extractor
│   │   │   ├── workflowGenerator.js  # builds the final JSON (always valid)
│   │   │   ├── sessionStore.js  # in-memory session storage w/ TTL
│   │   │   └── serialize.js     # UI-safe state view
│   │   └── routes/chat.js       # REST endpoints
│   ├── test/                    # offline unit + integration tests (no network needed)
│   └── .env.example
└── client/                      # React + Vite + Tailwind
    └── src/
        ├── App.jsx              # session lifecycle, layout
        ├── components/
        │   ├── ChatPanel.jsx / MessageBubble.jsx / Composer.jsx / TypingIndicator.jsx
        │   └── BlueprintPanel.jsx / NodeCard.jsx / WorkflowDiagram.jsx / JsonViewer.jsx / StatusStepper.jsx
        └── lib/api.js
```

---

## Running it locally

Requires **Node.js ≥ 18** (for native `fetch`) and npm.

```bash
# 1. Install both apps' dependencies
npm run install:all

# 2. (Optional) configure an LLM key — see next section. Works fine without this.
cp server/.env.example server/.env
# edit server/.env if you want to add GROQ_API_KEY

# 3. Run both the API (port 8787) and the Vite dev server (port 5173) together
npm run dev
```

Open **http://localhost:5173**.

Running the two apps separately also works if you prefer two terminals:

```bash
npm run dev:server   # http://localhost:8787
npm run dev:client   # http://localhost:5173 (proxies /api to the server)
```

### Production-style single-server run (what gets deployed)

```bash
npm run build          # builds client into client/dist
npm start               # Express serves both the API and the built client
```

Then open **http://localhost:8787** — everything (UI + API) is served from one process.
This is the exact mode used in the [hosting](#hosting--deployment) instructions below.

---

## Getting a free API key (optional but recommended)

The app defaults to **Groq**, which offers a genuinely free, fast API with no credit
card required. This is not required to run the app, but produces noticeably more
natural conversations and better free-text understanding.

**Groq (recommended):**
1. Go to <https://console.groq.com/keys> and sign in (Google/GitHub sign-in works).
2. Click "Create API Key", copy it.
3. Paste it into `server/.env` as `GROQ_API_KEY=gsk_...`.
4. Restart the server. The startup log will confirm: `LLM provider: groq — configured: true`.

**Google Gemini (alternative, also free):**
1. Go to <https://aistudio.google.com/app/apikey> and generate a key.
2. In `server/.env`, set `LLM_PROVIDER=gemini` and `GEMINI_API_KEY=...`.

Both are genuinely free tiers — **no OpenAI or Claude/Anthropic subscription is used
or required anywhere in this project**.

---

## Environment variables

See `server/.env.example` for the authoritative list. Summary:

| Variable | Default | Notes |
|---|---|---|
| `LLM_PROVIDER` | `groq` | `groq` \| `gemini`. Irrelevant if no key is set — falls back to offline mode. |
| `GROQ_API_KEY` | *(empty)* | From console.groq.com — free. |
| `GROQ_MODEL` | `openai/gpt-oss-20b` | Free-tier Groq model. |
| `GEMINI_API_KEY` | *(empty)* | From aistudio.google.com — free. |
| `GEMINI_MODEL` | `gemini-2.0-flash` | Free-tier Gemini model. |
| `LLM_TIMEOUT_MS` | `15000` | Falls back to rule-based engine if exceeded. |
| `PORT` | `8787` | API/server port. |
| `CLIENT_ORIGIN` | `http://localhost:5173` | CORS origin allowed in dev. |
| `SESSION_TTL_MS` | `7200000` (2h) | Idle in-memory sessions are pruned after this. |

The client needs no `.env` — `vite.config.js` proxies `/api` to the server in dev, and
in production the same Express server serves both, so there's nothing to configure.

---

## How the engine actually works

This section doubles as the code walkthrough.

### 1. The field registry (`schema.js`)

A workflow is made of up to three kinds of nodes, each with a fixed set of
*mandatory* fields:

- **trigger** → `source`, `event`
- **condition** → `field`, `operator`, `value`
- **action** (category `notify`) → `channel`, `recipient`
- **action** (category `create`/`update`/`other`) → `target`

This table is the single source of truth for "is this node done?" — nothing else
in the codebase is allowed to decide that independently.

### 2. Extraction (`llm/provider.js`, `llm/prompts.js`, `ruleBasedExtractor.js`)

Every user message goes through an extraction step that asks: *what fields did the
user just state or clearly imply?* The LLM is explicitly instructed to **never
invent a value** and to flag vague qualifiers ("a good lead", "an important ticket")
as `ambiguities` rather than guessing a threshold. If no key is configured, or the
call fails/times out, the rule-based extractor takes over for the opening message,
and the deterministic "asked field ⇒ raw reply is the value" rule takes over for
every turn after that.

### 3. Merging & contradiction detection (`dialogueManager.js`)

Extracted fields are merged onto the right node. If a field that's already resolved
gets a *different* value with no correction language ("actually", "instead",
"change it to"...) in the message, the merge stops and a **contradiction
confirmation** is asked before anything else — the system will not silently
overwrite a previously confirmed answer.

### 4. Deciding what to ask next (fully deterministic)

Priority order, computed purely from state:

1. Resolve a pending contradiction, if any.
2. Resolve the first flagged ambiguity (trigger → condition → action order).
3. Fill the first missing mandatory field, in the same node order.
4. Ask one optional closing question ("any other preferences?") — asked at most
   once, and answering "no" is enough to proceed.
5. Only once *all* of the above are satisfied: generate the workflow.

### 5. Generating the final JSON (`workflowGenerator.js`)

The node/connection JSON is **always assembled in code**, never by asking the LLM
to produce the final structure — this guarantees the output schema is valid no
matter what the model does. The LLM is only ever used, optionally, to write a nicer
node name/description; if that call fails, template-based text is used and the
output is structurally identical.

Branching is handled explicitly: if a condition exists, all actions fire on the
`true` branch and an explicit `end` node documents the `false` branch, matching the
reference diagram in the assignment PDF. Without a condition, actions chain
sequentially after the trigger.

### 6. Two-step reasoning loop, in one sentence

**Extract (AI-assisted, replaceable) → Decide (deterministic, testable) → Ask/Generate.**
Every "smart" part is swappable and every "correct" part is plain code.

---

## Testing

The entire dialogue engine is unit/integration-tested **without any network access
or API key**, because control flow never depends on the LLM being available:

```bash
cd server
npm test
```

This runs (`server/test/`):
- A full multi-turn conversation (the assignment's invoice/Slack example) all the
  way to a valid generated workflow, purely on the offline rule-based engine.
- A guard test proving the workflow is never generated while a mandatory field
  (e.g. trigger source) is missing.
- Contradiction detection and correction-language override, unit-tested directly
  against the merge function.
- Ambiguity detection for vague qualifiers vs. concrete numeric thresholds.
- Empty-input and "I don't know" handling.

---

## Hosting / deployment

The app is built as **one deployable Node service** (Express serves the built React
app and the API together), which makes hosting simple — one service, one URL.

### Option A — Render.com (recommended, has a genuinely free tier)

1. Push this repo to GitHub.
2. On [render.com](https://render.com), **New → Web Service**, connect the repo.
3. Settings:
   - **Build command:** `npm run install:all && npm run build`
   - **Start command:** `npm start`
   - **Node version:** 18+ (set via `NODE_VERSION` env var if needed, e.g. `20`)
4. Add environment variables from the table above (at minimum, nothing is required;
   add `GROQ_API_KEY` if you want AI-assisted mode live).
5. Deploy. Render gives you a public HTTPS URL serving both the UI and the API.

### Option B — Railway.app

1. New Project → Deploy from GitHub repo.
2. Railway auto-detects Node; set the build command to
   `npm run install:all && npm run build` and start command to `npm start`.
3. Add the same environment variables in the Railway dashboard's "Variables" tab.
4. Deploy — Railway provisions a public URL automatically.

### Option C — Any VM / your own server

```bash
git clone <repo>
cd workflow-builder
npm run install:all
npm run build
cp server/.env.example server/.env   # fill in as needed
PORT=8787 npm start
```
Put Nginx/Caddy in front for TLS if exposing publicly.

### Notes for all options
- Because the app has an offline fallback, deployment succeeds and the app is fully
  functional **even if you deploy without ever setting an LLM API key.**
- Sessions are in-memory (see `sessionStore.js`); a restart clears active
  conversations. That's an intentional, documented scope choice — the assignment
  does not require persistence across restarts.

---

## Known limitations & honest trade-offs

Documented deliberately, rather than hidden, since "problem-solving approach" is an
evaluation criterion:

- **Offline mode's opening-message parser is keyword/regex-based, not true NLU.**
  It reliably completes any conversation (every mandatory field will still get
  asked and filled), but its *first-pass guesses* can occasionally be imprecise —
  e.g. a captured "event" phrase may include extra words, or an ambiguity-resolution
  answer may be stored as the full sentence rather than a trimmed value. This is a
  deliberate trade-off: guarantee **termination and correctness with zero
  dependencies**, and layer in genuinely better free-text understanding only when a
  free LLM key is supplied. In AI-assisted mode this limitation goes away.
- **Multi-node graphs are conservative by design.** The engine supports multiple
  actions (e.g. "notify Slack *and* update the CRM") but only creates a second node
  of the same kind when the message contains an explicit continuation signal
  ("also", "and then", "as well") — this avoids accidentally splitting one
  instruction into duplicate nodes.
- **Sessions are in-memory only** (no database) — appropriate for a planning tool
  with no stated persistence requirement; documented above under Hosting.
- **The optional closing question** ("any other preferences?") is always asked once
  before generation, mirroring the reference conversation's "duplicate handling"
  step — a one-word "no" skips it immediately.

---

## Design decisions worth asking about in the walkthrough

A few choices that were deliberate, not defaults, in case they come up:

1. **Why not just prompt an LLM to "manage the whole conversation"?** Because
   correctness of "is this ready?" needs to be guaranteed, not hoped for — see
   [The core idea](#the-core-idea--a-hybrid-not-a-pure-llm-wrapper).
2. **Why does the final JSON get built in code instead of by the LLM?** Same
   reason — schema validity can't depend on model compliance.
3. **Why keep an offline fallback at all, if an LLM key is available?** Resilience:
   a rate limit or network hiccup mid-demo degrades gracefully to "slightly less
   articulate" instead of "broken."
4. **Why a two-pane UI instead of a single chat thread?** The assignment explicitly
   asks the system to track collected information and readiness state — making that
   state visible live (rather than only inside the final JSON) makes the engineering
   behind it inspectable, not just its end output.
