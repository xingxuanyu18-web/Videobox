// ==================== Ollama Local LLM Manager ====================
//
// All-in-one Ollama lifecycle management:
//   - Detection: find install path, check if running
//   - Installation: download & install Ollama
//   - Service: auto-start ollama serve
//   - Models: pull recommended model (qwen3:4b)
//
// Uses OpenAI‑compatible /v1 endpoint for chat → api.ts handles it transparently.

import { execSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createWriteStream } from 'node:fs'
import { net } from 'electron'

const OLLAMA_HOST = 'http://localhost:11434'
const OLLAMA_DOWNLOAD_URL = 'https://ollama.com/download/OllamaSetup.exe'

export const RECOMMENDED_MODEL = 'qwen3:4b'

// Resolved path cache — avoids repeated filesystem checks
let _ollamaExePath: string | null | undefined = undefined

// ==================== Find Ollama Executable ====================

/**
 * Find the full path to ollama.exe (Windows) or ollama binary (macOS/Linux).
 * Checks PATH first, then standard install locations, then shell fallback.
 * Results are cached in memory for the process lifetime.
 */
export function findOllamaExe(): string | null {
  if (_ollamaExePath !== undefined) return _ollamaExePath

  if (process.platform === 'win32') {
    // 1. PATH (most reliable if Ollama was installed before app launched)
    try {
      const out = execSync('where ollama 2>nul', { encoding: 'utf8', timeout: 3000 }).trim()
      if (out) {
        _ollamaExePath = out.split('\n')[0].trim()
        return _ollamaExePath
      }
    } catch {}

    // 2. Default install directory (Ollama Windows installer puts it here)
    const homeDir = os.homedir()
    const winPaths = [
      path.join(homeDir, 'AppData', 'Local', 'Programs', 'Ollama', 'ollama.exe'),
      'C:\\Program Files\\Ollama\\ollama.exe',
      'C:\\Program Files (x86)\\Ollama\\ollama.exe',
    ]
    for (const p of winPaths) {
      if (fs.existsSync(p)) { _ollamaExePath = p; return p }
    }

    // 3. Shell:Startup shortcut or start menu (indirect)
    const startMenuPaths = [
      path.join(homeDir, 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Ollama', 'Ollama.lnk'),
      'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Ollama\\Ollama.lnk',
    ]
    for (const lnk of startMenuPaths) {
      if (fs.existsSync(lnk)) {
        // We know it's installed somewhere, try common paths again with broader search
        try {
          const out = execSync(
            `dir /s /b "${path.join(homeDir, 'AppData', 'Local', 'Programs')}\\ollama.exe" 2>nul`,
            { encoding: 'utf8', timeout: 5000 }
          ).trim()
          if (out && fs.existsSync(out)) { _ollamaExePath = out; return out }
        } catch {}
      }
    }
  } else {
    const macPaths = ['/usr/local/bin/ollama', '/opt/homebrew/bin/ollama']
    for (const p of macPaths) {
      if (fs.existsSync(p)) { _ollamaExePath = p; return p }
    }
    try {
      const out = execSync('which ollama 2>/dev/null', { encoding: 'utf8', timeout: 3000 }).trim()
      if (out && fs.existsSync(out)) { _ollamaExePath = out; return out }
    } catch {}
  }

  _ollamaExePath = null
  return null
}

/** Reset cached path (call after a fresh install in the same process). */
export function clearOllamaExeCache(): void {
  _ollamaExePath = undefined
}

// ==================== Detection ====================

export async function isOllamaRunning(): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 3000)
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: ctrl.signal })
    clearTimeout(t)
    return res.ok
  } catch (e: any) {
    console.log('[Ollama] isOllamaRunning:', e.message || e.code || String(e))
    return false
  }
}

export function isOllamaInstalled(): boolean {
  return findOllamaExe() !== null
}

// ==================== Models ====================

export interface OllamaModel {
  name: string
  size: number
  modifiedAt: string
  digest: string
}

export async function listModels(): Promise<OllamaModel[]> {
  const res = await fetch(`${OLLAMA_HOST}/api/tags`)
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`)
  const data = (await res.json()) as any
  return ((data.models || []) as any[]).map((m: any) => ({
    name: m.name || '',
    size: m.size || 0,
    modifiedAt: m.modified_at || '',
    digest: m.digest || '',
  }))
}

export async function hasModel(modelName: string): Promise<boolean> {
  try {
    const models = await listModels()
    return models.some(m => m.name === modelName || m.name.startsWith(modelName))
  } catch {
    return false
  }
}

// ==================== Pull Model ====================

export type PullProgressCallback = (progress: PullProgress) => void

export interface PullProgress {
  status: 'downloading' | 'completed' | 'error'
  total?: number
  completed?: number
  percent?: number
  message: string
  error?: string
}

export async function pullModel(
  modelName: string,
  onProgress?: PullProgressCallback
): Promise<void> {
  const res = await fetch(`${OLLAMA_HOST}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modelName, stream: true }),
  })

  if (!res.ok) throw new Error(`Pull request failed (HTTP ${res.status})`)
  if (!res.body) throw new Error('No response body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const obj = JSON.parse(line)
          const total = obj.total as number | undefined
          const completed = obj.completed as number | undefined
          const status = obj.status as string || ''
          if (status === 'success') {
            onProgress?.({ status: 'completed', total, completed, percent: 100, message: `${modelName} 安装完成` })
            return
          }
          const pct = total && total > 0 && completed ? Math.round((completed / total) * 100) : undefined
          onProgress?.({ status: 'downloading', total, completed, percent: pct, message: status })
        } catch {}
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// ==================== Service Lifecycle ====================

/**
 * Start ollama serve in background using the full path to the binary.
 * Returns true if the service came up within `timeoutSec` seconds.
 */
export async function startOllamaService(timeoutSec = 8): Promise<boolean> {
  const exe = findOllamaExe()
  if (!exe) return false

  console.log(`[Ollama] Starting service: ${exe} serve`)
  const child = spawn(exe, ['serve'], { detached: true, stdio: 'ignore', windowsHide: true })
  child.unref()
  child.on('error', (err) => console.log('[Ollama] spawn error:', err.message))

  for (let i = 0; i < timeoutSec * 2; i++) {
    await sleep(500)
    if (await isOllamaRunning()) return true
  }
  return false
}

// ==================== First-Run Auto-Detect ====================

export interface AutoSetupResult {
  ollamaFound: boolean
  ollamaRunning: boolean
  modelInstalled: boolean
  modelName: string
  needPull: boolean
  message: string
}

export async function autoDetect(modelName = RECOMMENDED_MODEL): Promise<AutoSetupResult> {
  const installed = isOllamaInstalled()
  if (!installed) {
    return { ollamaFound: false, ollamaRunning: false, modelInstalled: false, modelName, needPull: false, message: '未检测到 Ollama' }
  }
  const running = await isOllamaRunning()
  if (!running) {
    return { ollamaFound: true, ollamaRunning: false, modelInstalled: false, modelName, needPull: false, message: 'Ollama 已安装但未运行' }
  }
  const alreadyInstalled = await hasModel(modelName)
  return {
    ollamaFound: true, ollamaRunning: true, modelInstalled: alreadyInstalled, modelName,
    needPull: !alreadyInstalled,
    message: alreadyInstalled ? '本地模型已就绪' : `需要下载模型 ${modelName}`,
  }
}

// ==================== One-Click Setup ====================

export type SetupStep = 'checking' | 'downloading_installer' | 'installing' | 'starting_service' | 'pulling_model' | 'done' | 'error'

export interface SetupProgress {
  step: SetupStep
  status: 'running' | 'completed' | 'error'
  percent?: number
  message: string
  error?: string
}

/**
 * Full one-click setup:
 *   1. Download Ollama installer → %TEMP%/OllamaSetup.exe
 *   2. Run installer (silent, with fallback to visible)
 *   3. Locate ollama.exe and start the service
 *   4. Pull the recommended model
 */
export async function oneClickSetup(
  modelName = RECOMMENDED_MODEL,
  onProgress?: (p: SetupProgress) => void
): Promise<{ success: boolean; error?: string }> {
  // ---- Step 0: Already ready? ----
  onProgress?.({ step: 'checking', status: 'running', message: '正在检测环境...' })
  if (isOllamaInstalled() && await isOllamaRunning() && await hasModel(modelName)) {
    onProgress?.({ step: 'done', status: 'completed', message: '本地模型已就绪，无需配置' })
    return { success: true }
  }
  onProgress?.({ step: 'checking', status: 'completed', message: '检测完成' })

  // ---- Step 1: Download installer (if needed) ----
  let needInstall = !isOllamaInstalled()
  let installerPath = ''

  if (needInstall) {
    onProgress?.({ step: 'downloading_installer', status: 'running', message: '正在下载 Ollama 安装程序...', percent: 0 })

    const tmpDir = os.tmpdir()
    installerPath = path.join(tmpDir, 'OllamaSetup.exe')

    // Reuse cached installer if it exists and is > 1 MB
    if (fs.existsSync(installerPath) && fs.statSync(installerPath).size > 1024 * 1024) {
      console.log('[Ollama] Reusing cached installer:', installerPath)
      onProgress?.({ step: 'downloading_installer', status: 'completed', message: '安装包已缓存', percent: 100 })
    } else {
      try {
        // Use net.fetch for proxy support; fall back to native fetch
        let res: any
        try {
          res = await net.fetch(OLLAMA_DOWNLOAD_URL)
        } catch {
          console.log('[Ollama] net.fetch failed, trying native fetch...')
          res = await fetch(OLLAMA_DOWNLOAD_URL)
        }

        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        if (!res.body) throw new Error('No response body')

        const totalSize = parseInt(res.headers.get('content-length') || '0')
        const fileStream = createWriteStream(installerPath)
        let downloaded = 0

        // Node ReadableStream vs web ReadableStream compat
        const reader = (res.body as any).getReader ? (res.body as any).getReader() : null
        if (reader) {
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              downloaded += value.length
              fileStream.write(value)
              if (totalSize > 0) {
                onProgress?.({ step: 'downloading_installer', status: 'running', message: '正在下载 Ollama...', percent: Math.round((downloaded / totalSize) * 100) })
              }
            }
          } finally { reader.releaseLock() }
        } else {
          // Fallback for Node.js body
          for await (const chunk of res.body as any) {
            downloaded += chunk.length
            fileStream.write(chunk)
            if (totalSize > 0) {
              onProgress?.({ step: 'downloading_installer', status: 'running', message: '正在下载 Ollama...', percent: Math.round((downloaded / totalSize) * 100) })
            }
          }
        }
        fileStream.end()
        await new Promise<void>((resolve, reject) => {
          fileStream.on('finish', resolve)
          fileStream.on('error', reject)
        })
        onProgress?.({ step: 'downloading_installer', status: 'completed', message: '下载完成', percent: 100 })
      } catch (e: any) {
        onProgress?.({ step: 'downloading_installer', status: 'error', message: '下载失败', error: e.message })
        return { success: false, error: `下载 Ollama 失败: ${e.message}\n\n请手动下载安装:\n1. 浏览器打开 https://ollama.com/download/windows\n2. 下载后双击安装\n3. 安装完成后回到此页面点击"一键配置"即可` }
      }
    }

    // ---- Step 2: Install ----
    onProgress?.({ step: 'installing', status: 'running', message: '正在安装 Ollama...' })

    try {
      // Try silent install first
      await new Promise<void>((resolve, reject) => {
        const child = spawn(installerPath, ['/S'], { stdio: 'ignore' })
        let settled = false
        const finish = (err?: Error) => { if (!settled) { settled = true; err ? reject(err) : resolve() } }
        child.on('close', (code) => {
          if (code === 0) finish()
          else finish(new Error(`安装程序退出码 ${code}`))
        })
        child.on('error', (err) => finish(err))
        setTimeout(() => finish(), 120_000) // timeout → assume success
      })
    } catch (e: any) {
      console.log('[Ollama] Silent install failed:', e.message, '— trying visible install')
      // Fallback: run installer visibly so user can interact
      try {
        await new Promise<void>((resolve) => {
          const child = spawn(installerPath, [], { stdio: 'ignore', detached: true })
          child.unref()
          setTimeout(() => resolve(), 300_000) // 5 min for user interaction
        })
      } catch {}
    }

    // Verify install
    clearOllamaExeCache()
    if (!isOllamaInstalled()) {
      onProgress?.({ step: 'installing', status: 'error', message: '安装验证失败', error: '安装后未找到 Ollama' })
      return { success: false, error: 'Ollama 安装后未找到，可能被安全软件拦截。请手动下载安装: https://ollama.com/download/windows' }
    }

    // Clean up installer
    try { fs.unlinkSync(installerPath) } catch {}
    onProgress?.({ step: 'installing', status: 'completed', message: 'Ollama 安装完成' })
  } else {
    onProgress?.({ step: 'downloading_installer', status: 'completed', message: 'Ollama 已安装' })
    onProgress?.({ step: 'installing', status: 'completed', message: 'Ollama 已安装' })
  }

  // ---- Step 3: Start service ----
  if (!(await isOllamaRunning())) {
    onProgress?.({ step: 'starting_service', status: 'running', message: '正在启动 Ollama 服务...' })
    const started = await startOllamaService(15)
    if (!started) {
      onProgress?.({ step: 'starting_service', status: 'error', message: '服务启动超时', error: '请手动启动' })
      return { success: false, error: 'Ollama 服务启动超时，请从开始菜单打开 Ollama 或重启电脑后重试' }
    }
    onProgress?.({ step: 'starting_service', status: 'completed', message: 'Ollama 服务已启动' })
  } else {
    onProgress?.({ step: 'starting_service', status: 'completed', message: 'Ollama 服务已在运行' })
  }

  // ---- Step 4: Pull model ----
  if (!(await hasModel(modelName))) {
    onProgress?.({ step: 'pulling_model', status: 'running', message: '正在下载模型（约 2.5 GB，首次较慢）...', percent: 0 })
    try {
      await pullModel(modelName, (pull) => {
        onProgress?.({
          step: 'pulling_model',
          status: pull.status === 'error' ? 'error' : 'running',
          percent: pull.percent,
          message: pull.status === 'downloading' ? `下载模型中... ${pull.percent || 0}%` : pull.message,
          error: pull.error,
        })
      })
      onProgress?.({ step: 'pulling_model', status: 'completed', message: '模型下载完成', percent: 100 })
    } catch (e: any) {
      onProgress?.({ step: 'pulling_model', status: 'error', message: '模型下载失败', error: e.message })
      return { success: false, error: `模型下载失败: ${e.message}\n请检查网络后重试` }
    }
  } else {
    onProgress?.({ step: 'pulling_model', status: 'completed', message: '模型已安装' })
  }

  // ---- Done ----
  onProgress?.({ step: 'done', status: 'completed', message: '本地模型配置完成！现在可以使用 AI 文案功能了' })
  return { success: true }
}

// ==================== Helpers ====================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
