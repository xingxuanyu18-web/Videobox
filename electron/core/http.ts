import { net } from 'electron'

// ==================== 统一 HTTP 客户端 ====================

export interface HttpOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  headers?: Record<string, string>
  body?: string | object
  timeout?: number        // 默认 30000ms
  retry?: number          // 默认 0
  retryDelay?: number     // 基础延迟 ms，默认 1000
  retryOn?: number[]      // 哪些 HTTP 状态码重试，默认 [429, 500, 502, 503]
  signal?: AbortSignal
}

export interface HttpResponse {
  ok: boolean
  status: number
  data: any               // 已解析的 JSON object 或 text string
  headers: Record<string, string>
  elapsed: number         // 请求耗时 ms
}

// ============ 内部工具 ============

function isLocalUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  } catch {
    return false
  }
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// ============ 核心请求方法 ============

export async function request(url: string, options: HttpOptions = {}): Promise<HttpResponse> {
  const {
    method = 'GET',
    headers = {},
    body,
    timeout = 30000,
    retry = 0,
    retryDelay = 1000,
    retryOn = [429, 500, 502, 503],
  } = options

  const local = isLocalUrl(url)
  const t0 = Date.now()
  let lastError: Error | null = null

  // 序列化 body
  const bodyStr = typeof body === 'object' && body !== null ? JSON.stringify(body) : (body as string | undefined)
  if (bodyStr && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  for (let attempt = 0; attempt <= retry; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = local
        ? await fetch(url, { method, headers, body: bodyStr, signal: controller.signal })
        : await net.fetch(url, { method, headers, body: bodyStr, signal: controller.signal }) as unknown as Response

      clearTimeout(timeoutId)

      // 解析响应
      const contentType = response.headers.get('content-type') || ''
      const isJson = contentType.includes('application/json')
      const rawData = isJson ? await response.json() : await response.text()

      const respHeaders: Record<string, string> = {}
      response.headers.forEach((v, k) => { respHeaders[k] = v })

      const result: HttpResponse = {
        ok: response.ok,
        status: response.status,
        data: rawData,
        headers: respHeaders,
        elapsed: Date.now() - t0,
      }

      // 非成功状态码 — 按配置重试
      if (!response.ok) {
        if (retryOn.includes(response.status) && attempt < retry) {
          await sleep(retryDelay * Math.pow(2, attempt))
          continue
        }
        throw new HttpError(response.status, `HTTP ${response.status}`)
      }

      return result

    } catch (err: any) {
      clearTimeout(timeoutId)
      lastError = err

      if (err.name === 'AbortError') {
        const timeoutErr = new Error(`请求超时 (${timeout / 1000}s)`)
        timeoutErr.name = 'AbortError'
        throw timeoutErr
      }

      // 如果是 HttpError 且需要重试
      if (err instanceof HttpError && retryOn.includes(err.status) && attempt < retry) {
        await sleep(retryDelay * Math.pow(2, attempt))
        continue
      }

      // 如果是 HttpError 且不在重试范围内
      if (err instanceof HttpError) {
        throw err
      }

      // 认证错误不重试
      if (err.message?.includes('401') || err.message?.includes('403')) {
        throw err
      }

      // 网络错误可重试
      if (attempt < retry) {
        await sleep(retryDelay * Math.pow(2, attempt))
        continue
      }

      throw err
    }
  }

  throw lastError || new Error('请求失败')
}

// ============ HttpError ============

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

// ============ 便捷方法 ============

export function get(url: string, opts?: HttpOptions): Promise<HttpResponse> {
  return request(url, { ...opts, method: 'GET' })
}

export function post(url: string, body: any, opts?: HttpOptions): Promise<HttpResponse> {
  return request(url, { ...opts, method: 'POST', body })
}

export function put(url: string, body: any, opts?: HttpOptions): Promise<HttpResponse> {
  return request(url, { ...opts, method: 'PUT', body })
}

// ============ 内存缓存 ============

interface CacheEntry {
  data: HttpResponse
  timestamp: number
  ttl: number
}

const memCache = new Map<string, CacheEntry>()

/** 带缓存的 GET 请求，默认 TTL 5 分钟 */
export async function getCached(
  url: string,
  ttlMs: number = 5 * 60 * 1000,
  opts?: HttpOptions
): Promise<HttpResponse> {
  const cached = memCache.get(url)
  if (cached && Date.now() - cached.timestamp < cached.ttl) {
    return cached.data
  }

  const result = await get(url, opts)
  memCache.set(url, { data: result, timestamp: Date.now(), ttl: ttlMs })
  return result
}

/** 清除缓存（不传 url 则清空全部） */
export function clearCache(url?: string): void {
  if (url) {
    memCache.delete(url)
  } else {
    memCache.clear()
  }
}
