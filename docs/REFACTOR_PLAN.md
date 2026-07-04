# Refactor ClinicaAI → Next.js Fullstack (TypeScript + Prisma + Supabase)

## Context

ClinicaAI was a **Vite + React 19 SPA in plain JavaScript** (`.jsx`): `react-router-dom` routing, Tailwind styling (Arabic/RTL, custom theme + Tajawal/Cairo/Amiri fonts), and `@supabase/supabase-js` called directly inside components (`useEffect` + `.from(...)`). Roles were detected *implicitly* (a user is a doctor only if a joined `doctors` row exists). The AI agent is a **TypeScript + LangChain (+ LangSmith)** service, currently external (proxied to a Koyeb URL); the frontend just POSTs to `/clinica/query`.

We are rebuilding on a **fresh Supabase project**. Goals:

1. **Frontend** — same UI, enhanced, ported to Next.js + TypeScript; integration via **server actions**.
2. **Supabase** — schema defined **in the repo via Prisma** (not the Supabase SQL editor).
3. **AI Agent** — TypeScript/LangChain code already exists; integrated **later**, living **inside the Next repo**, with Next exposing a **WhatsApp webhook API** so the agent and the **admin** can converse with clients.

### Decisions

- **Single Next.js app** (App Router); agent folder lives in the same repo; Next owns the WhatsApp webhook.
- Data access: **Prisma inside server actions**; **Supabase only for Auth/Storage/Realtime**. Authorization enforced in server actions (Prisma uses a direct DB connection and bypasses RLS); RLS kept as defense-in-depth.
- Roles: **patient, doctor, admin** only (no receptionist). **Admin can do anything** — including managing appointments and tracking/replying to messages from users (incl. WhatsApp). Explicit `role` enum so more roles are trivial later.
- Styling: keep Tailwind + current look, add **shadcn/ui** primitives.
- **Agent language is TypeScript + LangChain** (not Python).
- **Schema table design is deferred** — tables/columns designed in a separate focused session. For now only the *structure* (Prisma project, migration workflow, connection wiring).

### Execution philosophy

Restructure folders first, then tackle each part on its own, in order:
**(0) Folder restructure → (1) Supabase + Prisma setup → (2) UI port → (3) Features/integration → (4) AI chat + WhatsApp.**
Each phase is a separate, reviewable chunk; pause and align (especially before designing the actual schema).

---

## Target repository structure

```text
ClinicaAI/
  app/
    (marketing)/        # public landing
    (auth)/             # login, register
    (patient)/          # patient dashboard, guarded to role=patient
    (doctor)/           # doctor dashboard, guarded to role=doctor
    (admin)/            # manage everything incl. appointments + message inbox/replies
    api/whatsapp/webhook/route.ts   # GET verify + POST receive (wired later)
    layout.tsx          # root: html lang="ar" dir="rtl", fonts, providers
    globals.css
  components/{ui,chatbot,landing,dashboard,doctor}/
  lib/
    supabase/{client,server,middleware}.ts   # @supabase/ssr helpers (Phase 3)
    prisma.ts           # singleton PrismaClient (Phase 1)
    auth.ts             # getCurrentUser(), requireRole(role[]) (Phase 3)
    utils.ts            # cn(), date helpers
  server/
    actions/            # 'use server' modules (Phase 3)
    services/           # agentClient.ts, whatsapp.ts (Phase 4)
  prisma/               # schema.prisma + migrations (Phase 1)
  supabase/             # config.toml (Phase 1)
  agent/                # existing TS + LangChain agent (Phase 4)
  docs/REFACTOR_PLAN.md
  middleware.ts         # session refresh + role-based route protection (Phase 3)
```

---

## Phase 0 — Folder restructure & Next scaffold ✅ (current)

- Next.js (App Router, TS, Tailwind) scaffold; Vite removed (`vite.config.js`, `index.html`, `src/main.jsx`, old eslint, `vercel.json`).
- Tailwind config ported to `.ts` preserving brand palette + fonts; Tajawal/Cairo/Amiri loaded via `next/font`; `<html lang="ar" dir="rtl">`.
- shadcn/ui prerequisites (`components.json`, `lib/utils.ts` `cn`); `lucide-react`, `framer-motion`, `gsap`, `date-fns` retained.
- Empty folder skeleton + placeholder pages so each later phase has a home.
- Original components kept under `legacy/` as the Phase 2 port reference (excluded from build via tsconfig/eslint; renamed from `src/` so Next doesn't treat it as a Pages Router dir).

## Phase 1 — Supabase + Prisma setup (structure only; tables designed later)

- Add `prisma` + `@prisma/client`; `schema.prisma` with pooled `DATABASE_URL` (6543) + `directUrl` (5432).
- Wire migration workflow, `lib/prisma.ts` singleton, `supabase/config.toml`.
- **Do NOT finalize models yet** — connection + generator blocks + a `// TODO` marker. Tables designed together as a focused task.

## Phase 2 — UI port (JSX → TSX, same look)

- Convert in dependency order: `lib` → landing → `Auth` → patient dashboard → doctor dashboard → chatbot widget.
- Replace `react-router` with App Router (`redirect`, file routes, layout props). Add admin route group shell.
- Keep visuals identical; swap raw reads for server components/actions in Phase 3.

## Phase 3 — Features & integration (server actions + auth)

- `lib/supabase/{client,server,middleware}.ts` via `@supabase/ssr` (cookie sessions); `middleware.ts` enforces role-based access via explicit `role`.
- `lib/auth.ts`: `getCurrentUser()` + `requireRole(roles)`.
- Server actions in `server/actions/*`: auth, appointments, availability, profile, doctors, messages. Each calls `requireRole` then Prisma.

## Phase 4 — AI chat + WhatsApp (agent integrated last)

- `app/api/whatsapp/webhook/route.ts`: GET verify; POST validate signature, persist, hand off to agent.
- `server/services/agentClient.ts` + `whatsapp.ts`. Replies persisted and surfaced in the admin message inbox (Supabase realtime).
- Port `ChatbotWidget` to call a server action / API; preserve role-context injection and `clinica-refresh-data` behavior.

---

## Environment variables (`.env.example`)

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=        # pooled (pgbouncer 6543) for Prisma client
DIRECT_URL=          # direct (5432) for prisma migrate
AGENT_URL=           # TS/LangChain agent (later)
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
```

## Notes

- **Authz lives in server actions**, not RLS (Prisma connects directly); keep RLS as a second layer.
- Pooled connection for the app, direct only for migrations (serverless-safe on Vercel).
- Keep all migration SQL (triggers/views/RLS) in the Prisma migration folder so the whole schema is reproducible from the repo.
- **Schema design is intentionally deferred** to its own focused session before any models are committed.
