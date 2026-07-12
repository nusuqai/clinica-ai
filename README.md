# Clinica AI

A clinic management platform built with Next.js, Supabase, and Prisma, with an
AI agent (LangChain/LangGraph) that handles WhatsApp-based patient interactions.

## Stack

- **Framework:** Next.js 15 (App Router) + React 19
- **Database:** Supabase (Postgres, Auth, Storage, Realtime) via Prisma ORM
- **AI Agent:** LangChain + LangGraph, traced with LangSmith
- **Messaging:** WhatsApp via Evolution API
- **UI:** Tailwind CSS, Framer Motion, GSAP

## Project structure

```text
app/            Next.js routes, grouped by role: (admin), (doctor), (patient), (auth), (marketing)
agent/          AI agent (LangChain/LangGraph) — see agent/README.md
server/         Server actions and services shared by the app and the agent
prisma/         Prisma schema and migrations
supabase/       Supabase config and SQL migrations
docs/           Design and refactor documentation
legacy/         Previous implementation, kept for reference
```

## Getting started

1. Copy `.env.example` to `.env.hosted` (pointing at a real Supabase project) and/or
   `.env.localdb` (pointing at `npx supabase start`'s local stack), and fill in the values.

2. Install dependencies:

   ```bash
   npm install
   ```

3. Generate the Prisma client and apply migrations:

   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   ```

   If `prisma:migrate` fails with a shadow database error, see [prisma/README.md](prisma/README.md)
   for the workaround.

4. Run the dev server:

   ```bash
   npm run dev          # against the hosted Supabase project
   npm run dev:local    # against the local Supabase stack
   ```

## Scripts

| Script | Description |
| --- | --- |
| `dev` / `dev:local` | Start the Next.js dev server (hosted or local Supabase env) |
| `build` / `build:local` | Production build |
| `start` / `start:local` | Start the production server |
| `lint` | Run ESLint |
| `prisma:generate` / `prisma:generate:local` | Generate the Prisma client |
| `prisma:migrate` / `prisma:migrate:local` | Create and apply a new migration |
| `prisma:deploy` / `prisma:deploy:local` | Apply existing migrations (CI/production) |
| `prisma:studio` / `prisma:studio:local` | Open Prisma Studio |
| `supabase:start` / `supabase:stop` / `supabase:reset` | Manage the local Supabase stack |
| `tunnel` | Expose localhost via ngrok (for WhatsApp webhook testing) |

## AI Agent

The agent lives in [agent/](agent/README.md) and is reached from the Next.js app through
`server/services/agentClient.ts`. Inbound WhatsApp messages are handed to it via
`app/api/whatsapp/webhook/route.ts`, and it reuses the same Prisma-backed server actions
as the rest of the app.
