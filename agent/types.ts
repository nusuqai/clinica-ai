import type { Role, Channel } from "@prisma/client";

/**
 * Per-request identity the agent acts on behalf of. Every tool authorizes
 * against this — the agent can only ever do what this actor is allowed to do.
 *
 * `role` is the effective role driving tool selection:
 *   - PATIENT | DOCTOR | ADMIN → an identified user (web always; WhatsApp when
 *     the phone matches a profile).
 *   - null → an unknown WhatsApp contact (info-only tools, no actions).
 */
export interface AgentContext {
  actorId: string | null;
  role: Role | null;
  channel: Channel;
  conversationId: string;
  sessionId: string;
  /** Display name used to greet the contact. */
  actorName: string;
}

/**
 * One tool invocation, captured during a run and persisted on the AGENT
 * message so the web chat can re-render its rich card after reload.
 * `id` links the AIMessage tool_call to its ToolMessage when rebuilding history.
 */
export interface ToolCallRecord {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result: unknown;
  status: "ok" | "error";
}

export interface AgentMessageMetadata {
  toolCalls: ToolCallRecord[];
}
