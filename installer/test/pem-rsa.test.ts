import { describe, expect, it } from "bun:test";
import { importRsaPrivateKey } from "../src/crypto/pem-rsa.js";

// Same test-only RSA-2048 key in two formats (PKCS#8 and PKCS#1).
// See test/app-auth.test.ts header comment for how it was generated.
const PKCS8_PEM = `-----BEGIN PRIVATE KEY-----
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

const PKCS1_PEM = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA29ve6BFsfWP5UOFTk1dIlsJ5Lp/K0uHEWFvTYaw17NQMBop1
B5NDGRm/xVv/xHT63mO+lkIvCLXavRm2fnVYFWPGVw04HbgvkBJw//Osai0vQPF3
oFnRWF7GiA7DG2TqSiPG+LLFLHcKbGdkWCJzHvIO9E5oJZwVx+Nc2zWCpbtvdy//
T5IRDtGFBNaT/IKZIvwR0Tor314AvA2ajxoW0RRmq3LIAhSloEus/A0BJVeD+qnc
m7OpOIbGC8KzIIROvkachfcoyAqU545Kl65XhkrPbqHk8xaxo7ue0BmyNyROJ/FU
s0+I72KhY2LjTOG0+ZUAI22gjSm1jUZrFmI2twIDAQABAoIBACJfzYmeE8bFBzlw
iVcbifNcQ4MZI6Z1+vNPpAx81s+I1bp+Ek8VZKO7hWKvgB0wpvp3QNiQT3c+q4zu
RLyfzx5FA8EfhXsMDY+qenViHT5agy1Vs3zkHhmBc+vY1wNk80aVMmo21SIfGIeb
YLJw7GvVr6XdzmW28ibW8vEo/By6F7zbEjg3l26oU5Ba32g3EAXTrBa7gkXXTA6D
SXMyQeOD2e6CV/o9eVBAMSXUs0AuNoPqLwNaMoDVk3Tpti2bfrThoQtt9QHs0WCn
X6R0oxWu88O0K6sI0GVD+KiItnpmMSNyXojZhOyf8I5IDNQ76810OyWd2N+dmgJR
ccfAzaECgYEA85Hog8oM/BgD8RRWHk/9zo+Q/Y4Y5pDCbUi1CjQyj96FK0d4Nh0H
qFCPWe5qbzTBABepP41VIE27/nhqb2dkvc2hHbqHxCVqiwpuTH2nw/gFt528dch8
kRUYHkOittsSzgglbi51RUs06UE9oqJl8QF/25/gManpDOLZMqYZthcCgYEA5xQx
FRRSSQ/xb+Uys9UOZeR8qFh5+g7/EL0Ay6fGgisxSv8iy3GQEUSnsKfg4OSFgjJ1
oOcdKt0S5sskhSYMwfyq/l/tpuvO3R4tagZhlIJ2xnnqYmHEeh+TM69SJHffGBME
U957WukTZNsQIDEkSFnFDa6jRQCybvq23wpYiGECgYAKhIxz1G/HGwpgiK5HVNDy
8IQkTtSIcEvVCES5EhP03nkFq2pne81u2Tu3eHIkJzUGWf82/VVltbWegXinIuHY
yF5iuEFQmQUGyAaHSw3JipZEnY0b0PKAGVcXR3hpSQCA4R0sqtjpixvXzrdopHae
d6AbzcWSn3Gu2sTiSQXnNQKBgQDXGlauNqJ6XJr0/Df8auHiO5VG6EVzXq5UmHu7
GEyTMz3JgEKVevsO+AfZTAzrjA4zqmERDNJ76hsEOCmgwFCz604JSKbi8TM5ZjQE
NDh1lBSYoThrqHLK88WFITinteY4dMtcfwf5Emn5Qmp6bQRHTTk/iUd2njV7VWsR
qIHNQQKBgQCFCO67wzr8QYGpU3d1uWilKLBiLVGSyOfddlH1D0RplAknopKh8CxT
U7lRLAZhyX+QIEou+Wv2sF+o5Q9++Lz12qcbVSaPFDDf/+HoJX5OEDzUOARqGAbs
2JI0bbwe5OA4+Ws+0P3qT51fbmAH4MN/3mcD/cLXP97AGR3c4WuOXg==
-----END RSA PRIVATE KEY-----`;

async function signOnce(key: CryptoKey, payload: string): Promise<string> {
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(payload),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("importRsaPrivateKey", () => {
  it("imports a PKCS#8 PEM", async () => {
    const key = await importRsaPrivateKey(PKCS8_PEM);
    expect(key.type).toBe("private");
    expect(key.algorithm.name).toBe("RSASSA-PKCS1-v1_5");
  });

  it("imports a PKCS#1 PEM (the format GitHub Apps generate)", async () => {
    const key = await importRsaPrivateKey(PKCS1_PEM);
    expect(key.type).toBe("private");
  });

  it("PKCS#1 and PKCS#8 forms of the same key sign payloads identically", async () => {
    // Strongest correctness check: if PKCS#1→PKCS#8 wrapping is byte-correct,
    // both keys produce the same RS256 signature for the same input.
    const a = await importRsaPrivateKey(PKCS8_PEM);
    const b = await importRsaPrivateKey(PKCS1_PEM);
    const payload = "agent-workflows.test.payload";
    expect(await signOnce(a, payload)).toBe(await signOnce(b, payload));
  });

  it("normalizes literal \\n sequences to actual newlines", async () => {
    // Some env-var stores deliver multi-line values with literal "\n"
    // sequences instead of real newlines. The importer must handle that.
    const escaped = PKCS8_PEM.replace(/\n/g, "\\n");
    const key = await importRsaPrivateKey(escaped);
    expect(key.type).toBe("private");
  });

  it("rejects malformed PEM", async () => {
    await expect(importRsaPrivateKey("not a pem")).rejects.toThrow();
  });
});
