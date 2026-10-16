import { describe, it, expect } from "vitest";
import { validatePublicConfig } from "../src/lib/public-config";
describe("public credential safety", () => {
  it("supports explicitly unconfigured preview and public publishable keys", () => {
    expect(() => validatePublicConfig()).not.toThrow();
    expect(() =>
      validatePublicConfig(
        "https://example.supabase.co",
        "sb_publishable_test",
      ),
    ).not.toThrow();
  });
  it("accepts only the anon role in legacy JWTs", () => {
    const key = (role: string) =>
      "e30." + btoa(JSON.stringify({ role })) + ".test";
    expect(() =>
      validatePublicConfig("https://example.supabase.co", key("anon")),
    ).not.toThrow();
    expect(() =>
      validatePublicConfig("https://example.supabase.co", key("service_role")),
    ).toThrow("Privileged");
  });
  it("rejects secret keys, incomplete settings and insecure remote URLs", () => {
    expect(() =>
      validatePublicConfig("https://example.supabase.co", "sb_secret_test"),
    ).toThrow("privileged");
    expect(() => validatePublicConfig("https://example.supabase.co")).toThrow(
      "both",
    );
    expect(() =>
      validatePublicConfig("http://example.supabase.co", "sb_publishable_test"),
    ).toThrow("HTTPS");
  });
});
