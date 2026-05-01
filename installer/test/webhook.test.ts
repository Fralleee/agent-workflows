import { describe, expect, it } from "bun:test";
import { handleWebhook } from "../src/handlers/webhook.js";

const SECRET = "test-webhook-secret-do-not-use-in-prod";

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("handleWebhook", () => {
  it("rejects requests with no signature", async () => {
    const req = new Request("https://x/webhook", { method: "POST", body: "{}" });
    const res = await handleWebhook(req, SECRET);
    expect(res.status).toBe(401);
  });

  it("rejects requests with a wrong signature", async () => {
    const body = '{"action":"created"}';
    const req = new Request("https://x/webhook", {
      method: "POST",
      body,
      headers: { "x-hub-signature-256": "sha256=deadbeef" },
    });
    const res = await handleWebhook(req, SECRET);
    expect(res.status).toBe(401);
  });

  it("accepts requests with the right signature and returns 204", async () => {
    const body = '{"action":"created"}';
    const sig = `sha256=${await hmacHex(SECRET, body)}`;
    const req = new Request("https://x/webhook", {
      method: "POST",
      body,
      headers: { "x-hub-signature-256": sig },
    });
    const res = await handleWebhook(req, SECRET);
    expect(res.status).toBe(204);
  });

  it("rejects malformed hex in the signature header", async () => {
    const body = "{}";
    const req = new Request("https://x/webhook", {
      method: "POST",
      body,
      headers: { "x-hub-signature-256": "sha256=zz" },
    });
    const res = await handleWebhook(req, SECRET);
    expect(res.status).toBe(401);
  });
});
