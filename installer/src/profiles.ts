// Curated agent profiles surfaced in the setup form's dropdown.
// Each id maps to a (provider, model, secretName) triple the orchestrator uses
// to write the consumer repo's stub workflow and set the right Actions secret.
//
// Adding a new profile: append below + add a regression case in test/profiles.test.ts.

export type Provider = "anthropic" | "openai";

export interface AgentProfile {
  id: string;
  label: string;
  description: string;
  provider: Provider;
  model: string;
  secretName: "ANTHROPIC_API_KEY" | "OPENAI_API_KEY";
  apiKeyHelpUrl: string;
  recommended?: boolean;
}

export const PROFILES: readonly AgentProfile[] = [
  {
    id: "claude-sonnet",
    label: "Claude Sonnet 4.6",
    description: "Balanced cost and quality. Good default for most repos.",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    secretName: "ANTHROPIC_API_KEY",
    apiKeyHelpUrl: "https://console.anthropic.com/settings/keys",
    recommended: true,
  },
  {
    id: "claude-opus",
    label: "Claude Opus 4.7",
    description: "Most capable Anthropic model. Higher cost; pick when accuracy matters most.",
    provider: "anthropic",
    model: "claude-opus-4-7",
    secretName: "ANTHROPIC_API_KEY",
    apiKeyHelpUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "claude-haiku",
    label: "Claude Haiku 4.5",
    description: "Fastest and cheapest Anthropic tier. Good for high-volume scanning.",
    provider: "anthropic",
    model: "claude-haiku-4-5",
    secretName: "ANTHROPIC_API_KEY",
    apiKeyHelpUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "gpt-5",
    label: "GPT-5",
    description: "OpenAI flagship. Strongest reasoning at a higher price.",
    provider: "openai",
    model: "gpt-5",
    secretName: "OPENAI_API_KEY",
    apiKeyHelpUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "gpt-5-mini",
    label: "GPT-5 Mini",
    description: "Cheaper OpenAI tier. Reasonable for daily scans.",
    provider: "openai",
    model: "gpt-5-mini",
    secretName: "OPENAI_API_KEY",
    apiKeyHelpUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "gpt-5-codex",
    label: "GPT-5 Codex",
    description: "OpenAI's Codex-tuned model. Best alignment with the codex CLI agent.",
    provider: "openai",
    model: "gpt-5-codex",
    secretName: "OPENAI_API_KEY",
    apiKeyHelpUrl: "https://platform.openai.com/api-keys",
  },
] as const;

export function getProfile(id: string): AgentProfile | undefined {
  return PROFILES.find((p) => p.id === id);
}

export interface CustomProfileSpec {
  provider: Provider;
  model: string;
}

// Resolves either a curated profile id or a custom (provider, model) into the
// triple needed downstream. Throws on unknown ids.
export function resolveProfile(
  id: string,
  custom?: CustomProfileSpec,
): { provider: Provider; model: string; secretName: AgentProfile["secretName"] } {
  if (id === "custom") {
    if (!custom) throw new Error("custom profile requires { provider, model }");
    if (custom.provider !== "anthropic" && custom.provider !== "openai") {
      throw new Error(`unknown provider '${custom.provider}'`);
    }
    return {
      provider: custom.provider,
      model: custom.model,
      secretName: custom.provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY",
    };
  }
  const p = getProfile(id);
  if (!p) throw new Error(`unknown profile '${id}'`);
  return { provider: p.provider, model: p.model, secretName: p.secretName };
}
