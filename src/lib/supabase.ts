import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = !!(
  url &&
  key &&
  !url.includes("YOUR_PROJECT") &&
  !key.includes("YOUR_PUBLIC")
);
export const db = configured
  ? createClient(url, key, {
      auth: {
        flowType: "pkce",
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;
export function client() {
  if (!db)
    throw new Error(
      "Connect Supabase using the deployment guide before using this feature.",
    );
  return db;
}
export async function rpc<T = unknown>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await client().rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}
export async function rows<T>(
  table: string,
  options: { offset?: number; limit?: number } = {},
): Promise<T[]> {
  const { data, error } = await client()
    .from(table)
    .select("*")
    .order(table === "staff_roles" ? "user_id" : "id")
    .range(
      options.offset ?? 0,
      (options.offset ?? 0) + (options.limit ?? 1000) - 1,
    );
  if (error) throw new Error(error.message);
  return data as T[];
}
export async function allRows<T>(table: string): Promise<T[]> {
  let result: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await rows<T>(table, { offset });
    result = result.concat(page);
    if (page.length < 1000) return result;
  }
}
export function authRedirect() {
  return new URL(import.meta.env.BASE_URL, window.location.origin).href;
}
