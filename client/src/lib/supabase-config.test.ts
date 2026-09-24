import { describe, expect, it } from "vitest";

describe("Supabase public configuration", () => {
  it("accepts the configured publishable key at the Auth settings endpoint", async () => {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
    expect(url).toMatch(/^https:\/\/[a-z0-9]+\.supabase\.co$/);
    expect(key).toMatch(/^sb_publishable_[A-Za-z0-9_]+$/);

    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key!, Authorization: `Bearer ${key!}` },
    });
    expect(response.status).toBe(200);
  }, 15_000);
});
