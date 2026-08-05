// ==================== Ollama Local LLM Manager ====================
//
// Ollama exposes:
//   GET  http://localhost:11434/api/tags          — list installed models
//   POST http://localhost:11434/api/pull          — pull model (streams JSON lines)
//   POST http://localhost:11434/v1/chat/completions — OpenAI‑compatible endpoint
//
// We use the OpenAI‑compatible /v1 endpoint for chat, so existing api.ts works
// with baseUrl = 'http://localhost:11434/v1'

import { execSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createWriteStream } from 'node:fs'

const OLLAMA_HOST = 'http://localhost:11434'
const OLLAMA_DOWNLOAD_URL = 'https://ollama.com/download/OllamaSetup.exe'

// Recommended small model with good Chinese capabilities (~2.5 GB)
export const RECOMMENDED_MODEL = 'qwen3:4b'

// ==================== Detection ====================

/** Check whether the Ollama service is running and responding. */
export async function isOllamaRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

/** Check if ollama binary exists on this system. */
export function isOllamaInstalled(): boolean {
  try {
    const cmd = process.platform === 'win32' ? 'where ollama 2>nul' : 'which ollama 2>/dev/null'
    execSync(cmd, { encoding: 'utf8' })
    return true
  } catch {
    return false
  }
}

// ==================== Models ====================

export interface OllamaModel {
  name: string
  size: number          // bytes
  modifiedAt: string
  digest: string
}

/** List installed Ollama models. */
export async function listModels(): Promise<OllamaModel[]> {
  const res = await fetch(`${OLLAMA_HOST}/api/tags`)
  if (!res.ok) throw new Error(`Ollama returned ${res.status}`)
  const data = (await res.json()) as any
  return ((data.models || []) as any[]).map((m: any) => ({
    name: m.name || '',
    size: m.size || 0,
    modifiedAt: m.modified_at || '',
    digest: m.digest || '',
  }))
}

/** Check if a model is already installed. */
export async function hasModel(modelName: string): Promise<boolean> {
  const models = await listModels()
  return models.some(m => m.name === modelName || m.name.startsWith(modelName))
}

// ==================== Pull ====================

export type PullProgressCallback = (progress: PullProgress) => void

export interface PullProgress {
  status: 'downloading' | 'completed' | 'error'
  total?: number        // bytes
  completed?: number    // bytes
  percent?: number
  message: string
  error?: string
}

/**
 * Pull a model from Ollama registry.
 * Returns once the pull is complete. Calls onProgress for real-time updates.
 */
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

          const percent = total && total > 0 && completed ? Math.round((completed / total) * 100) : undefined
          onProgress?.({ status: 'downloading', total, completed, percent, message: status })
        } catch { /* skip unparseable lines */ }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// ==================== First-Run Auto-Setup ====================

export interface AutoSetupResult {
  ollamaFound: boolean
  ollamaRunning: boolean
  modelInstalled: boolean
  modelName: string
  needPull: boolean
  message: string
}

export async function autoDetect(modelName: string = RECOMMENDED_MODEL): Promise<AutoSetupResult> {
  const installed = isOllamaInstalled()
  if (!installed) {
    return {
      ollamaFound: false, ollamaRunning: false,
      modelInstalled: false, modelName, needPull: false,
      message: '未检测到 Ollama',
    }
  }

  const running = await isOllamaRunning()
  if (!running) {
    return {
      ollamaFound: true, ollamaRunning: false,
      modelInstalled: false, modelName, needPull: false,
      message: 'Ollama 已安装但未运行',
    }
  }

  const alreadyInstalled = await hasModel(modelName)
  return {
    ollamaFound: true, ollamaRunning: true,
    modelInstalled: alreadyInstalled, modelName,
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
 * Full one-click setup pipeline:
 *   1. Download Ollama installer (if not installed)
 *   2. Run installer silently
 *   3. Start ollama serve
 *   4. Pull recommended model
 *
 * Calls onProgress with status updates at each stage.
 */
export async function oneClickSetup(
  modelName: string = RECOMMENDED_MODEL,
  onProgress?: (p: SetupProgress) => void
): Promise<{ success: boolean; error?: string }> {
  // ---- Step 0: Check current state ----
  onProgress?.({ step: 'checking', status: 'running', message: '正在检测环境...' })

  if (isOllamaInstalled() && await isOllamaRunning() && await hasModel(modelName)) {
    onProgress?.({ step: 'done', status: 'completed', message: '本地模型已就绪，无需配置' })
    return { success: true }
  }
  onProgress?.({ step: 'checking', status: 'completed', message: '检测完成' })

  // ---- Step 1: Download installer if not installed ----
  if (!isOllamaInstalled()) {
    onProgress?.({ step: 'downloading_installer', status: 'running', message: '正在下载 Ollama 安装程序...', percent: 0 })

    const tmpDir = os.tmpdir()
    const installerPath = path.join(tmpDir, 'OllamaSetup.exe')

    try {
      const res = await fetch(OLLAMA_DOWNLOAD_URL)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      if (!res.body) throw new Error('No response body')

      const totalSize = parseInt(res.headers.get('content-length') || '0')
      const fileStream = createWriteStream(installerPath)
      let downloaded = 0

      const reader = res.body.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          downloaded += value.length
          fileStream.write(value)
          if (totalSize > 0) {
            const pct = Math.round((downloaded / totalSize) * 100)
            onProgress?.({ step: 'downloading_installer', status: 'running', message: '正在下载 Ollama...', percent: pct })
          }
        }
      } finally {
        reader.releaseLock()
      }
      fileStream.end()
      await new Promise<void>((resolve, reject) => {
        fileStream.on('finish', resolve)
        fileStream.on('error', reject)
      })

      onProgress?.({ step: 'downloading_installer', status: 'completed', message: '下载完成', percent: 100 })

      // ---- Step 2: Install silently ----
      onProgress?.({ step: 'installing', status: 'running', message: '正在安装 Ollama（需要管理员权限）...' })

      await new Promise<void>((resolve, reject) => {
        const child = spawn(installerPath, ['/S'], { stdio: 'ignore' })
        child.on('close', (code) => {
          if (code === 0) resolve()
          else reject(new Error(`安装程序退出码 ${code}（可能需要手动以管理员身份运行）`))
        })
        child.on('error', reject)
        // Timeout after 120 seconds
        setTimeout(() => {
          try { child.kill() } catch {}
          resolve() // Don't fail — the installer might still be running
        }, 120_000)
      })

      // Clean up installer
      try { fs.unlinkSync(installerPath) } catch {}

      // Verify installation
      if (!isOllamaInstalled()) {
        throw new Error('安装后未找到 Ollama，请检查是否安装成功')
      }
      onProgress?.({ step: 'installing', status: 'completed', message: 'Ollama 安装完成' })
    } catch (e: any) {
      onProgress?.({ step: 'downloading_installer', status: 'error', message: '下载安装失败', error: e.message })
      return { success: false, error: e.message }
    }
  } else {
    onProgress?.({ step: 'downloading_installer', status: 'completed', message: 'Ollama 已安装' })
    onProgress?.({ step: 'installing', status: 'completed', message: 'Ollama 已安装' })
  }

  // ---- Step 3: Start ollama serve ----
  if (!(await isOllamaRunning())) {
    onProgress?.({ step: 'starting_service', status: 'running', message: '正在启动 Ollama 服务...' })

    try {
      // Spawn detached so it keeps running after parent exits
      const child = spawn('ollama', ['serve'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      })
      child.unref()

      // Wait for service to be ready (poll up to 30 seconds)
      let started = false
      for (let i = 0; i < 15; i++) {
        await sleep(2000)
        if (await isOllamaRunning()) {
          started = true
          break
        }
      }

      if (!started) {
        throw new Error('Ollama 服务启动超时，请手动运行 ollama serve')
      }
      onProgress?.({ step: 'starting_service', status: 'completed', message: 'Ollama 服务已启动' })
    } catch (e: any) {
      onProgress?.({ step: 'starting_service', status: 'error', message: '启动失败', error: e.message })
      return { success: false, error: e.message }
    }
  } else {
    onProgress?.({ step: 'starting_service', status: 'completed', message: 'Ollama 服务已在运行' })
  }

  // ---- Step 4: Pull model ----
  if (!(await hasModel(modelName))) {
    onProgress?.({ step: 'pulling_model', status: 'running', message: '正在下载模型...', percent: 0 })

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
      return { success: false, error: e.message }
    }
  } else {
    onProgress?.({ step: 'pulling_model', status: 'completed', message: '模型已安装' })
  }

  // ---- Done ----
  onProgress?.({ step: 'done', status: 'completed', message: '本地模型配置完成，现在可以使用 AI 文案功能了！' })
  return { success: true }
}

// ==================== Helpers ====================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
