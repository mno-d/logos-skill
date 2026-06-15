import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_ENV_FILES = [
  process.env.LOGOS_OPENROUTER_ENV_FILE || ''
].filter(Boolean)
const envFiles = [...DEFAULT_ENV_FILES, ...parseEnvFiles(process.argv.slice(2))]

function hasCommand(command) {
  const exe = process.platform === 'win32' ? 'where.exe' : 'which'
  return spawnSync(exe, [command], { stdio: 'ignore', windowsHide: true }).status === 0
}

function envValue(key) {
  if (process.env[key]) return process.env[key]
  for (const file of envFiles) {
    try {
      const line = fs.readFileSync(file, 'utf-8')
        .split(/\r?\n/)
        .find(row => row.trim().startsWith(`${key}=`))
      if (line) return line.replace(new RegExp(`^${key}=`), '').trim().replace(/^["']|["']$/g, '')
    } catch {
      // Missing .env files are normal.
    }
  }
  return ''
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

function ollamaModels() {
  if (!hasCommand('ollama')) return []
  const result = spawnSync('ollama', ['list'], { encoding: 'utf-8', windowsHide: true })
  if (result.status !== 0) return []
  return result.stdout
    .split(/\r?\n/)
    .slice(1)
    .map(line => line.trim().split(/\s+/)[0])
    .filter(Boolean)
}

const models = ollamaModels()
const openrouterKeyPresent = Boolean(envValue('OPENROUTER_API_KEY') || envValue('OPEN_ROUTER_API_KEY'))
const thirdOpinion = openrouterKeyPresent
  ? 'openrouter:free:callable'
  : (models.find(name => /^qwen/i.test(name)) || null)
const status = {
  codex: hasCommand('codex'),
  claude: hasCommand('claude'),
  openrouter_key_present: openrouterKeyPresent,
  env_files_checked_count: envFiles.length,
  ollama: hasCommand('ollama'),
  local_qwen: models.filter(name => /^qwen/i.test(name)),
  recommended_panel: [
    hasCommand('codex') ? 'codex:best-available:medium' : null,
    hasCommand('codex') ? 'codex:best-available:high' : null,
    thirdOpinion,
    hasCommand('claude') ? 'judge:claude-or-opus' : (hasCommand('codex') ? 'judge:codex-best-available' : null)
  ].filter(Boolean)
}

console.log(JSON.stringify(status, null, 2))
