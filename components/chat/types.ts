export interface ClientToolCall {
  name: string;
  args: Record<string, unknown>;
  // Parsed tool result — shape depends on the tool; cards narrow it.
  result: Record<string, unknown> | null;
  status: "ok" | "error";
}

export interface ChatMessage {
  id: string;
  role: "user" | "agent" | "admin";
  content: string;
  toolCalls?: ClientToolCall[];
  streaming?: boolean;
  error?: boolean;
  /** Local object URL for a voice message the user just recorded, so they can
   *  play back their own submission immediately (not persisted across reloads). */
  audioUrl?: string;
}
