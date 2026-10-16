// Validate at build/dev startup, before any public value is bundled.
export function validatePublicConfig(url?: string, key?: string): void {
  if (!url && !key) return; // Explicitly unconfigured local preview.
  if (!url || !key)
    throw new Error("Set both public Supabase configuration values.");
  if (url.includes("YOUR_PROJECT") && key.includes("YOUR_PUBLIC")) return;
  const parsed = new URL(url);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) {
    throw new Error("Supabase must use HTTPS outside local development.");
  }
  if (key.startsWith("sb_secret_"))
    throw new Error(
      "A privileged secret key must never enter a browser build. Use the public anon/publishable key.",
    );
  if (key.startsWith("sb_publishable_")) return;
  if (local && key === "test-public-key-only") return; // Browser test fixture, never production credentials.
  try {
    const payload = JSON.parse(
      atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    if (payload.role === "anon") return;
  } catch {
    /* The error below is safe and never echoes the supplied value. */
  }
  throw new Error(
    "Expected a public Supabase anon or publishable key. Privileged or malformed keys are rejected.",
  );
}
