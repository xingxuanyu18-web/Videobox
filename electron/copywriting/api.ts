import type { AIConfig, ChatMessage } from './types'

// ==================== AI API Client (OpenAI-compatible) ====================

export async function chat(
  messages: ChatMessage[],
  config: AIConfig,
  temperature = 0.7
): Promise<string> {
  const url = `${config.baseUrl}/v1/chat/completions`

  const body = JSON.stringify({
    model: config.model,
    messages,
    max_tokens: config.maxTokens,
    temperature,
  })

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= config.retry; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), config.timeout)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        const status = response.status

        // 不重试的错误类型
        if (status === 401 || status === 403) {
          throw new Error(`API Key 无效或无权限 (HTTP ${status})`)
        }
        if (status === 402) {
          throw new Error('API 账户余额不足，请充值')
        }
        if (status === 429) {
          // 限流可以重试
          if (attempt < config.retry) {
            const waitMs = Math.pow(2, attempt) * 2000
            await sleep(waitMs)
            continue
          }
          throw new Error('API 请求过于频繁，请稍后重试')
        }
        if (status >= 500) {
          // 服务端错误可以重试
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

      if (err.name === 'AbortError') {
        lastError = new Error(`请求超时 (${config.timeout / 1000}秒)，请检查网络或增加超时时间`)
      }

      // 如果是我们主动抛出的不重试错误，直接抛出
      if (err.message?.includes('API Key') ||
          err.message?.includes('余额不足') ||
          err.message?.includes('AI 返回内容为空')) {
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
