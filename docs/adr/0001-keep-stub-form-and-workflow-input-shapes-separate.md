# ADR 0001 — Keep Stub Workflow input shapes, install form fields, and Reusable Workflow YAML inputs separate

**Status**: Accepted

## Context

A natural-looking architectural suggestion is to unify the three places where the consumer-facing input surface is named:

1. The **Reusable Workflow**'s `inputs:` block in [`.github/workflows/daily-scan.yml`](../../.github/workflows/daily-scan.yml) — `provider`, `model`, `enable-auto-pr`, `scan-scope`, `label`, `validate-command`.
2. The `StubOptions` interface in [`installer/src/stub.ts`](../../installer/src/stub.ts) — fields used to render a Stub Workflow YAML file: `provider`, `model`, `secretName`, `enableAutoPr`, plus `hubRepo`/`hubRef`.
3. The `InstallFormData` interface in [`installer/src/handlers/install.ts`](../../installer/src/handlers/install.ts) — fields parsed from the Setup Form's POST: `installationId`, `profileId`, `customProvider`, `customModel`, `apiKey`, `enableAutoPr`.

The pitch for unification is "single source of truth for consumer-facing inputs; drift between these three is a silent bug class."

## Decision

Keep the three shapes **separate**. Do not introduce a TS schema layer that the stub generator, form parser, and workflow YAML all derive from.

## Reasoning

The three shapes look overlapping but represent three different concerns:

- **Reusable Workflow YAML inputs** are the contract between any Stub Workflow (consumer-side) and the Reusable Workflow (this Hub Repo). The YAML file *is* the source of truth — it's what GitHub Actions parses. A TS schema layer cannot remove this: the YAML stays authoritative regardless.
- **`StubOptions`** describes what goes *into* a rendered Stub Workflow. It includes `secretName` and the hub-coordinates (`hubRepo`, `hubRef`), which aren't workflow inputs.
- **`InstallFormData`** describes what the user submits via the Setup Form. It includes `profileId`, `customProvider`, `customModel`, and `apiKey` — none of which exist as Stub Workflow fields. The profileId+custom fields get *resolved* into the (provider, model, secretName) triple before stub rendering.

Forcing these through one schema would conflate orthogonal concerns. It would not remove the YAML duplication (the workflow file remains authoritative); it would only add a TS-side schema that has to be kept in sync with both the YAML and the form parser. The deletion test, applied honestly: deleting such a schema module would not concentrate complexity — it would just collapse three legitimately-different types back into where they belong.

A scan of the repo's git history shows the input surface has been stable since the multi-provider work landed; the drift risk this abstraction would insure against is low-frequency, while the cost (an extra layer obscuring which file is the source of truth) is permanent.

## Consequences

- The Reusable Workflow YAML's `inputs:` block stays the canonical declaration of what consumers can pass.
- `StubOptions` continues to be defined in `stub.ts` next to the rendering code.
- `InstallFormData` continues to be defined in `handlers/install.ts` next to the orchestrator.
- When a new input is added to the Reusable Workflow, three coordinated changes are required: YAML inputs block, `StubOptions` (if the stub should expose it), Setup Form/parser (if the user should pick a value via the form). This is intentional — each layer has its own decision to make about whether to surface the new input.
- Future architectural reviews should not re-suggest unifying these shapes; reference this ADR.
