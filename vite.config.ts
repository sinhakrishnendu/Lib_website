import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { validatePublicConfig } from "./src/lib/public-config";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  validatePublicConfig(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  return {
    plugins: [react(), tailwindcss()],
    base: env.VITE_BASE_PATH || "/",
    test: {
      environment: "jsdom",
      include: ["tests/**/*.test.{ts,tsx}"],
      setupFiles: ["tests/setup.ts"],
    },
  };
});
