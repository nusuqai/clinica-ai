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
  /** A media attachment (e.g. an image or document a staff member sent). The URL
   *  streams from the owner-scoped media endpoint. */
  media?: {
    kind: "image" | "video" | "audio" | "document" | "sticker";
    url: string;
    mimeType?: string;
    filename?: string;
    caption?: string;
    width?: number;
    height?: number;
  };
}
