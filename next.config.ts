import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // NOTE (Phase 4): the AI agent / WhatsApp proxy rewrites will be reintroduced
  // here once the agent integration lands. The old Vite `/clinica` proxy lived
  // in vercel.json and is intentionally dropped for now.
};

export default nextConfig;
