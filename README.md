# Logos Skill

Logos is a Codex skill for high-stakes decisions where a single confident model answer is not enough.

It runs multi-model review when multiple providers are available. If only one provider is available, it falls back to independent multi-pass review and requires the agent to say that it was not multi-model.

Default panel:

1. Codex/GPT at medium effort
2. Codex/GPT at high effort
3. OpenRouter free-model third opinion, falling back to local Qwen/Ollama
4. Optional judge via a user-provided Claude CLI (Opus), when available

Logos does not bundle Claude, Opus, Fable, Fusion, model providers, or API keys. It is a Codex skill plus small helper scripts that use tools already available in the user's environment.

## Quick Start

1. Clone this repository into your Codex skills directory as `logos`.
2. Restart Codex so it reloads available skills.
3. Run `node scripts/logos-status.mjs` from the skill folder.
4. Ask Codex to use Logos for a high-stakes review or decision.

OpenRouter is optional. Without an OpenRouter key, Logos still works as an independent multi-pass review workflow and uses local fallbacks when available.

## Use Cases

- Architecture and model-routing decisions
- Major refactors
- Security, privacy, destructive, or paid actions
- Public release reviews
- Assistant behavior and long-running agent design
- Any task where being confidently wrong would be expensive

## Requirements

- Codex with skill support
- Git, if installing by clone
- Node.js 18+, for status checks and the OpenRouter free caller
- Optional: `OPENROUTER_API_KEY` or `OPEN_ROUTER_API_KEY` for OpenRouter free-model third opinions
- Optional: Ollama with a Qwen model pulled, used when OpenRouter is unavailable
- Optional: Claude CLI for the judge role

No `npm install` step is required. The scripts use Node.js built-ins, including the Node 18+ global `fetch`.

## Install

Clone or copy this repository into your Codex skills directory as `logos`.

```bash
mkdir -p ~/.codex/skills
git clone https://github.com/mno-d/logos-skill.git ~/.codex/skills/logos
```

On Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.codex\skills" | Out-Null
git clone https://github.com/mno-d/logos-skill.git "$env:USERPROFILE\.codex\skills\logos"
```

If the directory already exists, update it with `git pull` instead of deleting it. Restart Codex after installing or updating so the skill metadata is reloaded.

## Files

- `SKILL.md` - the skill instructions loaded by Codex
- `scripts/logos-status.mjs` - checks local availability for Codex, Claude, OpenRouter key presence, and Ollama/Qwen
- `scripts/logos-openrouter-free.mjs` - calls OpenRouter free-model candidates for a third opinion
- `references/panel.md` - short policy for when Logos is worth using
- `agents/openai.yaml` - optional Codex UI metadata

## Status Check

From the skill root:

```bash
node scripts/logos-status.mjs
```

By default this checks environment variables and `LOGOS_OPENROUTER_ENV_FILE` when set. To explicitly check another local `.env` file:

```bash
node scripts/logos-status.mjs --env-file .env
```

The script reports whether an OpenRouter key appears to be present, but it does not print key values.

OpenRouter free caller:

```bash
node scripts/logos-openrouter-free.mjs --prompt-file task.txt
```

Check OpenRouter configuration without sending a prompt:

```bash
node scripts/logos-openrouter-free.mjs --status
```

It only tries the free-model chain and verifies OpenRouter pricing is `prompt=0` and `completion=0` before calling a model. If every free candidate fails, is rate-limited, is unavailable, or is not verified as zero-price, Logos should continue with local Qwen/Ollama or mark the third opinion as skipped.

Default OpenRouter free priority:

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

This order was last checked on 2026-06-15 and favors metacognitive review behavior: naming weak assumptions, missing evidence, confidence, and what would change the conclusion. It also avoids relying on the generic router first. Override the first candidate with `LOGOS_OPENROUTER_FREE_MODEL` when testing a new free model. Overrides are accepted only when the model id is `openrouter/free` or ends with `:free`, and the script still verifies zero pricing before calling.

Status output guide:

- `codex: true` means Codex panel calls are possible.
- `claude: true` means a Claude/Opus judge may be possible.
- `openrouter_key_present: true` means the free caller can try OpenRouter; it does not guarantee availability.
- `env_files_checked_count` is a count only, so local paths are not printed.
- `recommended_panel` is a suggestion, not proof that every model call succeeded.
- `codex: true` and `claude: true` mean the command was found; authentication or model access can still fail.

## Verify Installation

After restarting Codex, ask:

```text
Use Logos to review this plan from practical and stress-test viewpoints.
```

The answer should include `Called models/tools:` and clearly mark which panels ran, failed, timed out, or were skipped.

Expected minimum status output:

```json
{
  "codex": true,
  "openrouter_key_present": false,
  "recommended_panel": ["codex:best-available:medium", "codex:best-available:high"]
}
```

`openrouter_key_present: false` is normal when you have not configured OpenRouter. `claude`, `ollama`, and `local_qwen` may be true or false depending on your machine.

To update an existing install:

```bash
cd ~/.codex/skills/logos
git pull
```

On Windows PowerShell:

```powershell
Set-Location "$env:USERPROFILE\.codex\skills\logos"
git pull
```

## What It Does Not Do

- It does not include API keys.
- It does not create OpenRouter accounts.
- It does not install Codex, Claude, Ollama, Node.js, or model weights.
- It does not guarantee OpenRouter free-model availability.
- The OpenRouter helper only accepts `openrouter/free` or model IDs ending in `:free`, then verifies zero pricing before calling.
- It does not claim multi-model review when only same-model multi-pass review ran.
- It does not bundle Claude, Opus, Fable, or Fusion implementations.

## Safety Rules

Logos requires the agent to:

- list the actual models and tools called
- mark skipped, failed, or timed-out panelists
- avoid claiming a model reviewed something unless it actually ran
- ask before destructive, paid, external-sharing, or privacy-sensitive actions
- distinguish multi-model review from same-model multi-pass review

The repository does not include API keys, does not create OpenRouter accounts, and does not guarantee free model availability. External model calls may send prompt content outside your machine, so private code or personal information should be removed unless external review is allowed.

## Public URL

https://github.com/mno-d/logos-skill
