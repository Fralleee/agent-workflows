import { describe, expect, it } from "bun:test";
import { PROFILES, getProfile, resolveProfile } from "../src/profiles.js";

describe("profiles catalog", () => {
  it("has unique ids", () => {
    const ids = PROFILES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every profile points provider+secret consistently", () => {
    for (const p of PROFILES) {
      const expectedSecret =
        p.provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
      expect(p.secretName).toBe(expectedSecret);
    }
  });

  it("has exactly one recommended profile", () => {
    const rec = PROFILES.filter((p) => p.recommended);
    expect(rec.length).toBe(1);
  });

  it("getProfile returns the right entry", () => {
    expect(getProfile("claude-sonnet")?.model).toBe("claude-sonnet-4-6");
    expect(getProfile("gpt-5-codex")?.provider).toBe("openai");
    expect(getProfile("nope")).toBeUndefined();
  });

  it("resolveProfile maps curated ids to triples", () => {
    expect(resolveProfile("claude-sonnet")).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      secretName: "ANTHROPIC_API_KEY",
    });
    expect(resolveProfile("gpt-5-mini")).toEqual({
      provider: "openai",
      model: "gpt-5-mini",
      secretName: "OPENAI_API_KEY",
    });
  });

  it("resolveProfile handles custom", () => {
    expect(
      resolveProfile("custom", { provider: "openai", model: "gpt-5-thinking" }),
    ).toEqual({
      provider: "openai",
      model: "gpt-5-thinking",
      secretName: "OPENAI_API_KEY",
    });
  });

  it("resolveProfile rejects unknown ids", () => {
    expect(() => resolveProfile("nope")).toThrow(/unknown profile/);
  });

  it("resolveProfile rejects custom without spec", () => {
    expect(() => resolveProfile("custom")).toThrow(/custom profile requires/);
  });
});
