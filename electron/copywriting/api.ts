import type { AIConfig, ChatMessage } from './types'
import { net } from 'electron'

// ==================== AI API Client (OpenAI-compatible) ====================

/**
 * localhost/Ollama 用 Node.js 原生 fetch（net.fetch 在 main process 可能不兼容），
 * 外网 API 用 Electron net.fetch（走系统代理），解决公司网络 fetch failed 问题。
 */
function isLocalUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  } catch {
    return false
  }
}

export async function chat(
  messages: ChatMessage[],
  config: AIConfig,
  temperature = 0.7
): Promise<string> {
  const url = `${config.baseUrl}/v1/chat/completions`
  const local = isLocalUrl(url)
  const t0 = Date.now()

  try { console.log(`[COPYWRITING-API] chat() called: url=${url} local=${local} model=${config.model}`) } catch {}

  const body = JSON.stringify({
    model: config.model,
    messages,
    max_tokens: config.maxTokens,
    temperature,
  })

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= config.retry; attempt++) {
    try { console.log(`[COPYWRITING-API] attempt=${attempt}/${config.retry}`) } catch {}
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), config.timeout)

    try {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      }

      const response = local
        ? await fetch(url, { method: 'POST', headers, body, signal: controller.signal })
        : await net.fetch(url, { method: 'POST', headers, body, signal: controller.signal }) as unknown as Response

      clearTimeout(timeoutId)
      const elapsed = Date.now() - t0
      try { console.log(`[COPYWRITING-API] response: ok=${response.ok} status=${response.status} elapsed=${elapsed}ms`) } catch {}

      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        const status = response.status

        if (status === 401 || status === 403) {
          throw new Error(`API Key 无效或无权限 (HTTP ${status})`)
        }
        if (status === 402) {
          throw new Error('API 账户余额不足，请充值')
        }
        if (status === 429) {
          if (attempt < config.retry) {
            const waitMs = Math.pow(2, attempt) * 2000
            await sleep(waitMs)
            continue
          }
          throw new Error('API 请求过于频繁，请稍后重试')
        }
        if (status >= 500) {
          if (attempt < config.retry) {
            const waitMs = Math.pow(2, attempt) * 1000
            await sleep(waitMs)
            continue
          }
          throw new Error(`API 服务异常 (HTTP ${status})，请稍后重试`)
        }
        throw new Error(`API 请求失败 (HTTP ${status}): ${errorText.slice(0, 200)}`)
      }

      const data = await response.json() as any

      const content = data?.choices?.[0]?.message?.content
      if (!content || typeof content !== 'string') {
        throw new Error('AI 返回内容为空，请重试')
      }

      return content.trim()
    } catch (err: any) {
      clearTimeout(timeoutId)
      lastError = err
      try { console.log(`[COPYWRITING-API] error: name=${err.name} message=${err.message} code=${err.code}`) } catch {}

      if (err.name === 'AbortError') {
        lastError = new Error(`请求超时 (${config.timeout / 1000}秒)，请检查网络或增加超时时间`)
      }

      // 网络连接失败 — 给出明确的排查建议
      if (err.message?.includes('fetch failed') ||
          err.message?.includes('ERR_CONNECTION_REFUSED') ||
          err.code === 'UND_ERR_CONNECT_TIMEOUT' ||
          err.code === 'ECONNREFUSED') {
        const hostname = new URL(config.baseUrl).hostname
        if (isLocalUrl(config.baseUrl)) {
          lastError = new Error(`无法连接本地 Ollama 服务 (${config.baseUrl})\n请确认 Ollama 已启动：在终端运行 ollama serve`)
        } else {
          lastError = new Error(`无法访问 ${hostname}\n可能原因：\n1. 公司网络或防火墙拦截了该域名\n2. 需要配置系统代理\n3. 检查网络连接是否正常`)
        }
      }

      // 如果是我们主动抛出的不重试错误，直接抛出
      if (err.message?.includes('API Key') ||
          err.message?.includes('余额不足') ||
          err.message?.includes('AI 返回内容为空') ||
          err.message?.includes('无法连接') ||
          err.message?.includes('无法访问')) {
        throw err
      }

      // 重试
      if (attempt < config.retry && err.name !== 'AbortError') {
        const waitMs = Math.pow(2, attempt) * 1000
        await sleep(waitMs)
        continue
      }
    }
  }

  throw lastError || new Error('未知错误')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
