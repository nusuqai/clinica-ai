export default {
  // Auto-format any staged source/asset file.
  "*.{ts,tsx,js,jsx,mjs,cjs,json,css,md}": "prettier --write",
  // Keep the Prisma schema formatted (no env / DB access needed).
  "prisma/schema.prisma": () => "prisma format",
};
