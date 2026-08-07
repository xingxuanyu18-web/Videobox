import { app, shell } from 'electron'
import path from 'node:path'
import os from 'node:os'
import { handle } from '../../core/ipc'

function getDefaultDownloadDir(): string {
  return path.join(os.homedir(), 'Downloads', 'Videobox')
}

export function register(): void {
  handle('app:getDefaultDownloadDir', () => {
    return getDefaultDownloadDir()
  })

  handle('shell:openPath', async (_, filePath: string) => {
    await shell.openPath(filePath)
  })

  handle('shell:openExternal', async (_, url: string) => {
    await shell.openExternal(url)
  })

  // 获取带 referer 的图片（用于B站等需要referer的图片）
  handle('app:fetchImage', async (_, url: string, referer?: string) => {
    try {
      const response = await fetch(url, {
        headers: {
          'Referer': referer || 'https://www.bilibili.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const buffer = await response.arrayBuffer()
      const base64 = Buffer.from(buffer).toString('base64')
      const contentType = response.headers.get('content-type') || 'image/jpeg'
      return `data:${contentType};base64,${base64}`
    } catch (e) {
      return null
    }
  })
}
