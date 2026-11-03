import assert from "node:assert/strict";
import { test } from "node:test";
import { readAdminText } from "./admin.ts";

test("reads UTF-8 including Thai and strips the BOM", async () => {
  assert.equal(await readAdminText(new File(["\uFEFFเนื้อหาความรู้"], "faq.txt")), "เนื้อหาความรู้");
});
test("rejects oversized uploads before decoding", async () => {
  await assert.rejects(readAdminText(new File(["x".repeat(200001)], "large.csv")), /200 KB/);
});
test("rejects invalid UTF-8 instead of corrupting content", async () => {
  await assert.rejects(readAdminText(new File([new Uint8Array([0xff, 0xfe, 0x80])], "invalid.txt")), /UTF-8/);
});
