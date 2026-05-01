import { describe, expect, it } from "bun:test";
import { signAppJwt } from "../src/github/app-auth.js";

// Test-only RSA-2048 PKCS8 key. Generated once via:
//   bun -e 'const k = await crypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5",
//     modulusLength:2048, publicExponent:new Uint8Array([1,0,1]), hash:"SHA-256"},
//     true, ["sign","verify"]); const pkcs8 = await crypto.subtle.exportKey("pkcs8",
//     k.privateKey); console.log(Buffer.from(pkcs8).toString("base64"));'
// then wrapped with PEM headers. Do not use anywhere except these tests.
const TEST_PEM = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDb297oEWx9Y/lQ
4VOTV0iWwnkun8rS4cRYW9NhrDXs1AwGinUHk0MZGb/FW//EdPreY76WQi8Itdq9
GbZ+dVgVY8ZXDTgduC+QEnD/86xqLS9A8XegWdFYXsaIDsMbZOpKI8b4ssUsdwps
Z2RYInMe8g70TmglnBXH41zbNYKlu293L/9PkhEO0YUE1pP8gpki/BHROivfXgC8
DZqPGhbRFGarcsgCFKWgS6z8DQElV4P6qdybs6k4hsYLwrMghE6+RpyF9yjICpTn
jkqXrleGSs9uoeTzFrGju57QGbI3JE4n8VSzT4jvYqFjYuNM4bT5lQAjbaCNKbWN
RmsWYja3AgMBAAECggEAIl/NiZ4TxsUHOXCJVxuJ81xDgxkjpnX680+kDHzWz4jV
un4STxVko7uFYq+AHTCm+ndA2JBPdz6rjO5EvJ/PHkUDwR+FewwNj6p6dWIdPlqD
LVWzfOQeGYFz69jXA2TzRpUyajbVIh8Yh5tgsnDsa9Wvpd3OZbbyJtby8Sj8HLoX
vNsSODeXbqhTkFrfaDcQBdOsFruCRddMDoNJczJB44PZ7oJX+j15UEAxJdSzQC42
g+ovA1oygNWTdOm2LZt+tOGhC231AezRYKdfpHSjFa7zw7QrqwjQZUP4qIi2emYx
I3JeiNmE7J/wjkgM1DvrzXQ7JZ3Y352aAlFxx8DNoQKBgQDzkeiDygz8GAPxFFYe
T/3Oj5D9jhjmkMJtSLUKNDKP3oUrR3g2HQeoUI9Z7mpvNMEAF6k/jVUgTbv+eGpv
Z2S9zaEduofEJWqLCm5MfafD+AW3nbx1yHyRFRgeQ6K22xLOCCVuLnVFSzTpQT2i
omXxAX/bn+AxqekM4tkyphm2FwKBgQDnFDEVFFJJD/Fv5TKz1Q5l5HyoWHn6Dv8Q
vQDLp8aCKzFK/yLLcZARRKewp+Dg5IWCMnWg5x0q3RLmyySFJgzB/Kr+X+2m687d
Hi1qBmGUgnbGeepiYcR6H5Mzr1Ikd98YEwRT3nta6RNk2xAgMSRIWcUNrqNFALJu
+rbfCliIYQKBgAqEjHPUb8cbCmCIrkdU0PLwhCRO1IhwS9UIRLkSE/TeeQWramd7
zW7ZO7d4ciQnNQZZ/zb9VWW1tZ6BeKci4djIXmK4QVCZBQbIBodLDcmKlkSdjRvQ
8oAZVxdHeGlJAIDhHSyq2OmLG9fOt2ikdp53oBvNxZKfca7axOJJBec1AoGBANca
Vq42onpcmvT8N/xq4eI7lUboRXNerlSYe7sYTJMzPcmAQpV6+w74B9lMDOuMDjOq
YREM0nvqGwQ4KaDAULPrTglIpuLxMzlmNAQ0OHWUFJihOGuocsrzxYUhOKe15jh0
y1x/B/kSaflCanptBEdNOT+JR3aeNXtVaxGogc1BAoGBAIUI7rvDOvxBgalTd3W5
aKUosGItUZLI5912UfUPRGmUCSeikqHwLFNTuVEsBmHJf5AgSi75a/awX6jlD374
vPXapxtVJo8UMN//4eglfk4QPNQ4BGoYBuzYkjRtvB7k4Dj5az7Q/epPnV9uYAfg
w3/eZwP9wtc/3sAZHdzha45e
-----END PRIVATE KEY-----`;

describe("signAppJwt", () => {
  it("produces a three-part JWT with valid header and payload claims", async () => {
    const jwt = await signAppJwt("123456", TEST_PEM);
    const parts = jwt.split(".");
    expect(parts).toHaveLength(3);

    const header = JSON.parse(b64UrlDecode(parts[0]!));
    expect(header).toEqual({ alg: "RS256", typ: "JWT" });

    const payload = JSON.parse(b64UrlDecode(parts[1]!));
    expect(payload.iss).toBe("123456");
    expect(typeof payload.iat).toBe("number");
    expect(typeof payload.exp).toBe("number");
    expect(payload.exp - payload.iat).toBeGreaterThan(0);
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(10 * 60 + 60);
  });

  it("signature is base64url with no padding", async () => {
    const jwt = await signAppJwt("123456", TEST_PEM);
    const sig = jwt.split(".")[2]!;
    expect(sig).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(sig).not.toContain("=");
  });
});

function b64UrlDecode(s: string): string {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(s.length + ((4 - (s.length % 4)) % 4), "=");
  return atob(padded);
}
