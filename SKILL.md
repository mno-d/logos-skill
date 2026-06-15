---
name: logos
description: Multi-model-when-available or independent multi-pass synthesis workflow for high-stakes decisions. Use when the user asks for Logos, GPT-Fusion-style review, three opinions, multi-model review, independent model opinions, Fable-inspired synthesis style without a bundled proprietary model, major refactoring review, architecture decisions, safety-critical changes, or code/design work where a single model being confidently wrong would be costly.
---

# Logos

Logos turns one hard task into independent opinions, then synthesizes them into one grounded decision. Use multiple models when available; otherwise use independent multi-pass review and explicitly say it was not multi-model. Use it sparingly: it costs time and tokens, and is for important judgment, not normal chat.

## Requirements

- Codex CLI for GPT/Codex panel calls.
- Optional: Claude CLI for Opus/Fable judge.
- Optional: OpenRouter API key for the free-model third-opinion caller, or local Ollama/Qwen as fallback.
- Optional: Node.js 18+ to run `scripts/logos-status.mjs` and `scripts/logos-openrouter-free.mjs`.

Run availability check when the environment is uncertain:

```bash
node scripts/logos-status.mjs
```

Run that command from the skill root, or pass the absolute script path. It checks `process.env` and `LOGOS_OPENROUTER_ENV_FILE` when set. Use `--env-file <path>` only when the user or local policy allows reading that file. The script reports counts, not local file paths.

## Default Panel

Use this panel unless the user specifies otherwise:

1. **Practical panel**: best available Codex/GPT model at medium effort.
2. **Stress-test panel**: best available Codex/GPT model at high effort; use xhigh only for serious, exhaustive, major-refactor, or safety-critical work.
3. **Third-opinion panel**: OpenRouter free-model caller when configured, or local Qwen/Ollama when OpenRouter is unavailable.
4. **Judge**: user-provided Claude/Opus CLI when available; otherwise the strongest available GPT/Codex model. The judge integrates, not averages.

Treat model names as examples, not guarantees. Use the best equivalent model available in the current environment. If a named or requested model is unavailable, fall back and say what was skipped. If the same model is used at different efforts, call it independent multi-pass review, not multi-model review.

## Fallback Rules

| Missing component | Fallback |
| --- | --- |
| Named/requested GPT model unavailable | Use the best available Codex/GPT model. |
| xhigh unavailable or too costly | Use high, then explicitly mark xhigh absent. |
| OpenRouter free unavailable/rate-limited/empty | Use local Qwen/Ollama. |
| No third-opinion model | Continue with the two main panels and mark third opinion absent. |
| Claude/Opus/Fable judge unavailable | Use strongest available GPT/Codex model as judge. |
| Only one model available | Do not fake a panel; answer normally and disclose limited verification. |
| Same model used for multiple panels | Mark it as multi-pass, not multi-model. |

## Workflow

1. Restate the concrete decision or artifact being judged.
2. Fan out independent opinions. Do not let one panelist see another panelist's output.
3. For code/artifact tasks, run or inspect the candidates before merging. Prefer observed behavior over persuasive prose.
4. Judge using:
   - consensus
   - contradictions
   - partial coverage
   - unique insights
   - blind spots
5. Return the final answer first, then a compact audit trail.

## Command Patterns

Use commands that match the installed tools. Keep prompts concise and identical except for the role instruction.
Confirm real model ids with the installed CLI or local config before substituting `<best-gpt-model>` or `<best-claude-model>`.
Placeholders such as `<best-gpt-model>` are instruction templates, not literal commands to paste unchanged.

Codex practical panel:

```bash
codex exec --skip-git-repo-check -m <best-gpt-model> -c 'model_reasoning_effort="medium"' "<task plus practical role instruction>"
```

Codex stress-test panel:

```bash
codex exec --skip-git-repo-check -m <best-gpt-model> -c 'model_reasoning_effort="high"' "<task plus stress-test role instruction>"
```

Use xhigh only when justified:

```bash
codex exec --skip-git-repo-check -m <best-gpt-model> -c 'model_reasoning_effort="xhigh"' "<task plus stress-test role instruction>"
```

Claude/Opus judge when available:

```bash
claude -p --model <best-claude-model> --effort high "<judge prompt plus panel outputs>"
```

If the installed Claude CLI does not support `--effort`, remove that flag and continue.

Local Qwen/Ollama third opinion when available:

```bash
ollama run <qwen-model> "<task plus third-opinion role instruction>"
```

OpenRouter free third opinion when configured:

```bash
node scripts/logos-openrouter-free.mjs --prompt-file <task-file>
```

The OpenRouter caller only tries the configured free-model chain and verifies OpenRouter pricing is zero before calling a model. It never prints API key values. It sanitizes provider error text before output because API errors can contain account identifiers. If OpenRouter fails, is rate-limited, returns an empty response, appears unavailable, or is not verified as zero-price, skip it and use local Qwen/Ollama or continue without a third opinion. Do not use paid OpenRouter models.

Prefer this free-model order unless a newer measured candidate is better:

1. `openai/gpt-oss-120b:free`
2. `nvidia/nemotron-3-super-120b-a12b:free`
3. `nousresearch/hermes-3-llama-3.1-405b:free`
4. `nvidia/nemotron-3-ultra-550b-a55b:free`
5. `google/gemma-4-31b-it:free`
6. `qwen/qwen3-coder:free`
7. `qwen/qwen3-next-80b-a3b-instruct:free`
8. `openrouter/free`
9. `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`
10. `meta-llama/llama-3.3-70b-instruct:free`

Prefer models that explicitly name weak assumptions, missing evidence, confidence, and what would change the conclusion. Put the generic `openrouter/free` router late, not first, because it is less predictable for review quality. Override the first candidate with `LOGOS_OPENROUTER_FREE_MODEL` only when testing. Overrides must be `openrouter/free` or end with `:free`; the script still verifies zero pricing before calling.

## Panelist Prompts

Give every panelist the same task body. Add only this role-specific instruction:

- Medium panelist: "Give the most practical implementation path and obvious risks."
- High panelist: "Stress-test the plan. Find deep risks, hidden assumptions, and failure modes."
- Third-opinion panelist: "Be concise and adversarial. Find contradictions, simpler options, and missed risks. Do not rewrite the whole plan."

Do not assign artificial personas or decorative lenses. The diversity should come from independent runs and model differences.

## Output Shape

Lead with:

```text
Conclusion: ...
```

Then include only the useful audit trail:

```text
Called models/tools:
Consensus:
Contradictions:
Unique insights:
Blind spots:
Decision:
Verification:
```

For code changes, also state what was actually run or why execution was impossible.
In `Called models/tools:`, list the exact model/tool calls, failures, timeouts, and skipped panels. Do not claim a model, provider, or judge participated unless it was actually called.

## Safety

- Before sending user content, private code, logs, files, or prompts to external providers, check whether the user or project allows external transmission. If not clear, ask or use local-only review.
- Do not paste or reveal API keys, tokens, cookies, private prompts, or raw credentials in panel prompts or outputs.
- Do not claim a model reviewed the work unless that model was actually called.
- Do not present synthetic rankings or merged memories as independent model reviews.
- For destructive, irreversible, paid, or privacy-sensitive actions, require explicit user approval before execution.

## Local Resources

- `scripts/logos-status.mjs`: check local availability for Codex, Claude, OpenRouter key presence, and Ollama Qwen. It does not print key values.
- `scripts/logos-openrouter-free.mjs`: call OpenRouter free-model candidates for a third opinion when `OPENROUTER_API_KEY` or `OPEN_ROUTER_API_KEY` is configured.
- `references/panel.md`: short policy for when Logos is worth using.
- `agents/openai.yaml`: optional Codex UI metadata for skill lists and chips.
