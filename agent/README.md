# AI Agent (TypeScript + LangChain)

The existing Clinica AI agent (TypeScript + LangChain + LangSmith) will live here
and is integrated in **Phase 4** of the refactor (see `docs/REFACTOR_PLAN.md`).

The Next.js app reaches the agent through `server/services/agentClient.ts`, and the
WhatsApp webhook (`app/api/whatsapp/webhook/route.ts`) hands inbound messages to it.
The agent's tools reuse the same Prisma-backed server actions used by the web app.
