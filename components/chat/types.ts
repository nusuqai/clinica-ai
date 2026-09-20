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
  /** Playable audio for this message — a local object URL for the user's own
   *  recording, or the media endpoint for a spoken (TTS) agent reply. */
  audioUrl?: string;
  /** Autoplay the audio (only for a reply that just arrived live, never for
   *  history loaded on reload). */
  autoPlayAudio?: boolean;
}
