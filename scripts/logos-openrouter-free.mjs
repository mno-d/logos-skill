import fs from 'node:fs'
import path from 'node:path'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'
const DEFAULT_TIMEOUT_MS = Number(process.env.LOGOS_OPENROUTER_TIMEOUT_MS || 45000)
const DEFAULT_MAX_TOKENS = Number(process.env.LOGOS_OPENROUTER_MAX_TOKENS || 700)
const MAX_PROMPT_CHARS = Number(process.env.LOGOS_OPENROUTER_MAX_PROMPT_CHARS || 12000)
const DEFAULT_ENV_FILES = [
  process.env.LOGOS_OPENROUTER_ENV_FILE || ''
].filter(Boolean)

const FREE_MODEL_CHAIN = [
  process.env.LOGOS_OPENROUTER_FREE_MODEL || '',
  'openai/gpt-oss-120b:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'google/gemma-4-31b-it:free',
  'qwen/qwen3-coder:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'openrouter/free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  'meta-llama/llama-3.3-70b-instruct:free'
].filter(Boolean).filter(isFreeModel)

const args = process.argv.slice(2)

if (args.includes('--status')) {
  const verified = await verifyFreeModels(FREE_MODEL_CHAIN)
  console.log(JSON.stringify({
    available: Boolean(getOpenRouterApiKey()),
    endpoint: OPENROUTER_URL,
    models_endpoint: OPENROUTER_MODELS_URL,
    model_chain: FREE_MODEL_CHAIN,
    verified_free_models: verified,
    policy: 'free-model third opinion only; verify pricing is zero before calling; skip on failure, rate limit, empty response, or paid-model suspicion'
  }, null, 2))
} else {
  const input = await readPrompt(args)
  const result = await runOpenRouterThirdOpinion(input, {
    maxTokens: Number(readArg(args, '--max-tokens')) || DEFAULT_MAX_TOKENS,
    timeoutMs: Number(readArg(args, '--timeout-ms')) || DEFAULT_TIMEOUT_MS
  })
  console.log(JSON.stringify(result, null, 2))
}

async function runOpenRouterThirdOpinion(input, options = {}) {
  const apiKey = getOpenRouterApiKey()
  if (!apiKey) return { ok: false, skipped: true, reason: 'OPENROUTER_API_KEY not set' }
  const inputText = String(input || '')
  if (!inputText.trim()) return { ok: false, skipped: true, reason: 'empty prompt' }
  const promptInfo = buildThirdOpinionPrompt(inputText)
  const freeModels = await verifyFreeModels(FREE_MODEL_CHAIN)
  if (!freeModels.length) return { ok: false, skipped: true, reason: 'no verified zero-price OpenRouter free candidates' }
  const errors = []
  for (const model of freeModels) {
    try {
      const text = await callOpenRouter({
        apiKey,
        model: model.id,
        prompt: promptInfo.prompt,
        timeoutMs: options.timeoutMs,
        maxTokens: options.maxTokens
      })
      return { ok: true, model: model.id, text, prompt: promptInfo.meta, errors }
    } catch (error) {
      errors.push({ model: model.id, error: sanitizeError(error?.message || String(error)) })
    }
  }
  return { ok: false, skipped: true, reason: 'all OpenRouter free candidates failed', errors }
}

async function readPrompt(args) {
  const inline = readArg(args, '--prompt')
  if (inline) return inline
  const file = readArg(args, '--prompt-file')
  if (file) return fs.readFileSync(path.resolve(file), 'utf-8')
  if (!process.stdin.isTTY) {
    const chunks = []
    for await (const chunk of process.stdin) chunks.push(chunk)
    return Buffer.concat(chunks).toString('utf-8')
  }
  throw new Error('provide --prompt, --prompt-file, or stdin')
}

function buildThirdOpinionPrompt(input) {
  const source = String(input || '')
  const clipped = source.slice(0, MAX_PROMPT_CHARS)
  const truncated = source.length > clipped.length
  const prompt = [
    'You are the Logos third-opinion reviewer.',
    'Find overlooked risks, contradictions, simpler alternatives, privacy issues, and concrete defects.',
    'Do not rewrite the whole answer. Be concise and adversarial but practical.',
    truncated ? `Input was truncated from ${source.length} to ${clipped.length} characters. State that limitation if it affects confidence.` : '',
    'Return Japanese.',
    '',
    clipped
  ].filter(Boolean).join('\n')
  return {
    prompt,
    meta: {
      input_chars: source.length,
      sent_chars: clipped.length,
      truncated
    }
  }
}

async function callOpenRouter({ apiKey, model, prompt, timeoutMs, maxTokens }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS))
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'http-referer': 'https://local.logos',
        'x-title': 'Logos OpenRouter Free Third Opinion'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: Math.max(100, Number(maxTokens) || DEFAULT_MAX_TOKENS)
      })
    })
    const body = await res.text()
    if (!res.ok) throw new Error(formatHttpError(res.status, body))
    const json = JSON.parse(body)
    const text = json?.choices?.[0]?.message?.content
    if (!text) throw new Error('empty response')
    return String(text).trim()
  } finally {
    clearTimeout(timer)
  }
}

function getOpenRouterApiKey() {
  return process.env.OPENROUTER_API_KEY ||
    process.env.OPEN_ROUTER_API_KEY ||
    findEnvFileValue('OPENROUTER_API_KEY') ||
    findEnvFileValue('OPEN_ROUTER_API_KEY') ||
    ''
}

function findEnvFileValue(key) {
  for (const file of [...DEFAULT_ENV_FILES, ...parseEnvFiles(args)]) {
    const value = readEnvFileValue(file, key)
    if (value) return value
  }
  return ''
}

function readEnvFileValue(file, key) {
  try {
    if (!file || !fs.existsSync(file)) return ''
    const line = fs.readFileSync(file, 'utf-8')
      .split(/\r?\n/)
      .find(row => row.trim().startsWith(`${key}=`))
    return line ? line.replace(new RegExp(`^${key}=`), '').trim().replace(/^["']|["']$/g, '') : ''
  } catch {
    return ''
  }
}

function parseEnvFiles(args) {
  const files = []
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--env-file' && args[i + 1]) {
      files.push(path.resolve(args[i + 1]))
      i += 1
    }
  }
  return files
}

function readArg(args, name) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : ''
}

function isFreeModel(model) {
  return model === 'openrouter/free' || String(model).endsWith(':free')
}

async function verifyFreeModels(models) {
  const unique = Array.from(new Set(models.filter(isFreeModel)))
  let data
  try {
    const res = await fetch(OPENROUTER_MODELS_URL)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    data = await res.json()
  } catch {
    return unique.map(id => ({ id, pricing_verified: false, pricing_prompt: null, pricing_completion: null }))
  }
  const byId = new Map((data?.data || []).map(model => [model.id, model]))
  return unique
    .map(id => {
      const model = byId.get(id)
      if (!model) return null
      const prompt = String(model?.pricing?.prompt ?? '')
      const completion = String(model?.pricing?.completion ?? '')
      if (prompt !== '0' || completion !== '0') return null
      return { id, pricing_verified: true, pricing_prompt: prompt, pricing_completion: completion }
    })
    .filter(Boolean)
}

function formatHttpError(status, body) {
  try {
    const json = JSON.parse(body)
    const code = json?.error?.code ? ` code:${json.error.code}` : ''
    const type = json?.error?.type ? ` type:${sanitizeError(json.error.type)}` : ''
    const message = json?.error?.message ? ` message:${sanitizeError(json.error.message).slice(0, 160)}` : ''
    return `HTTP ${status}${code}${type}${message}`.trim()
  } catch {
    return `HTTP ${status}`
  }
}

function sanitizeError(message) {
  return String(message)
    .replace(/sk-or-v1-[A-Za-z0-9_-]+/g, '[redacted-openrouter-key]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/[A-Za-z]:\\[^"'`\s]+/g, '[redacted-windows-path]')
    .replace(/\/(?:Users|home)\/[^"'`\s]+/g, '[redacted-posix-path]')
    .replace(/"user_id"\s*:\s*"[^"]+"/g, '"user_id":"[redacted]"')
    .replace(/"(?:account|account_id|org|org_id|organization|organization_id|team|team_id|tenant|tenant_id)"\s*:\s*"[^"]+"/gi, '"id":"[redacted]"')
    .replace(/user_[A-Za-z0-9_-]{8,}/g, 'user_[redacted]')
}
