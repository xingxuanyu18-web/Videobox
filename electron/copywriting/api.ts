import type { AIConfig, ChatMessage } from './types'
import { request, HttpError } from '../core/http'

// ==================== AI API Client (OpenAI-compatible) ====================

/**
 * 发送聊天请求到 OpenAI-compatible API。
 * 本地 localhost/Ollama 走 Node.js 原生 fetch，外网 API 走 Electron net.fetch（走系统代理）。
 */
export async function chat(
  messages: ChatMessage[],
  config: AIConfig,
  temperature = 0.7
): Promise<string> {
  const url = `${config.baseUrl}/v1/chat/completions`
  const t0 = Date.now()

  try { console.log(`[COPYWRITING-API] chat() called: url=${url} model=${config.model}`) } catch {}

  try {
    const response = await request(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${config.apiKey}` },
      body: {
        model: config.model,
        messages,
        max_tokens: config.maxTokens,
        temperature,
      },
      timeout: config.timeout,
      retry: config.retry,
      retryDelay: 2000,
    })

    const elapsed = Date.now() - t0
    try { console.log(`[COPYWRITING-API] response: ok=${response.ok} status=${response.status} elapsed=${elapsed}ms`) } catch {}

    const content = response.data?.choices?.[0]?.message?.content
    if (!content || typeof content !== 'string') {
      throw new Error('AI 返回内容为空，请重试')
    }

    return content.trim()

  } catch (err: any) {
    try { console.log(`[COPYWRITING-API] error: name=${err.name} message=${err.message}`) } catch {}

    // 超时
    if (err.name === 'AbortError') {
      throw new Error(`请求超时 (${config.timeout / 1000}秒)，请检查网络或增加超时时间`)
    }

    // 具体 HTTP 错误
    if (err instanceof HttpError) {
      if (err.status === 401 || err.status === 403) {
        throw new Error(`API Key 无效或无权限 (HTTP ${err.status})`)
      }
      if (err.status === 402) {
        throw new Error('API 账户余额不足，请充值')
      }
      if (err.status === 429) {
        throw new Error('API 请求过于频繁，请稍后重试')
      }
      if (err.status >= 500) {
        throw new Error(`API 服务异常 (HTTP ${err.status})，请稍后重试`)
      }
      throw new Error(`API 请求失败 (HTTP ${err.status})`)
    }

    // 网络连接失败 — 给出明确的排查建议
    if (err.message?.includes('fetch failed') ||
        err.message?.includes('ERR_CONNECTION_REFUSED') ||
        err.code === 'UND_ERR_CONNECT_TIMEOUT' ||
        err.code === 'ECONNREFUSED') {
      try {
        const hostname = new URL(config.baseUrl).hostname
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
          throw new Error(`无法连接本地 Ollama 服务 (${config.baseUrl})\n请确认 Ollama 已启动：在终端运行 ollama serve`)
        }
        throw new Error(`无法访问 ${hostname}\n可能原因：\n1. 公司网络或防火墙拦截了该域名\n2. 需要配置系统代理\n3. 检查网络连接是否正常`)
      } catch (e: any) {
        if (e.message?.includes('无法连接') || e.message?.includes('无法访问')) throw e
      }
    }

    throw err
  }
}
