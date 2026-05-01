// POST /webhook — receives every event the GitHub App is subscribed to.
//
// We verify the HMAC signature and ack with 204; we don't currently react to
// any event (the install flow is entirely synchronous in /install). Treat this
// as a "GitHub Apps require a webhook URL even if you don't use it" no-op.

export async function handleWebhook(
  request: Request,
  webhookSecret: string,
): Promise<Response> {
  const sig = request.headers.get("x-hub-signature-256");
  if (!sig) return new Response("missing signature", { status: 401 });

  const body = await request.text();
  const valid = await verifyHmacSha256(webhookSecret, body, sig);
  if (!valid) return new Response("bad signature", { status: 401 });

  // Accepted; no further action.
  return new Response(null, { status: 204 });
}

async function verifyHmacSha256(
  secret: string,
  body: string,
  signatureHeader: string,
): Promise<boolean> {
  if (!signatureHeader.startsWith("sha256=")) return false;
  const expectedHex = signatureHeader.slice("sha256=".length);
  const expected = hexToBytes(expectedHex);
  if (!expected) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify("HMAC", key, expected, new TextEncoder().encode(body));
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length % 2 !== 0) return null;
  const buf = new ArrayBuffer(hex.length / 2);
  const out = new Uint8Array(buf);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) return null;
    out[i] = byte;
  }
  return out;
}
