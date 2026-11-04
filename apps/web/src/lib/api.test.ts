import { afterEach, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "./api";

vi.mock("./supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));

afterEach(() => vi.unstubAllGlobals());

it("แปลงเครือข่ายล้มเหลวเป็น ApiError กลางโดยไม่เผยรายละเอียดภายใน", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("private internal address")));
  const result = apiFetch("/transfers/requests");
  await expect(result).rejects.toBeInstanceOf(ApiError);
  await expect(result).rejects.toMatchObject({ status: 0, code: "NETWORK", message: "ต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง" });
});

it("ตอบกลับที่ไม่ใช่ JSON ต้องเป็น ApiError ไม่ใช่ TypeError", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError(); } }));
  await expect(apiFetch("/me")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});

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
