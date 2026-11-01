import { afterEach, expect, it, vi } from "vitest";
import { apiFetch } from "./api";

vi.mock("./supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));

afterEach(() => vi.unstubAllGlobals());

it("ส่ง FormData โดยให้ browser กำหนด multipart boundary", async () => {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ data: { id: "leave-1" } }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  const form = new FormData();
  form.set("evidence", new Blob(["test"]), "leave.txt");
  await apiFetch("/leave-requests", { method: "POST", body: form });
  const init = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(new Headers(init[1].headers).has("Content-Type")).toBe(false);
  expect(init[1].body).toBe(form);
});
