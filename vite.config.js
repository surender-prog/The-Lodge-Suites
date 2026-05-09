import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Honor the PORT env var so the preview-MCP wrapper can pin Vite to the
// port it has assigned; fall back to 5173 for plain `npm run dev`.
const PORT = Number(process.env.PORT) || 5173;

export default defineConfig({
  plugins: [react()],
  server: {
    port: PORT,
    strictPort: !!process.env.PORT,
    open: !process.env.PORT,
  },
});
