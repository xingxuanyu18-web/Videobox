/**
 * AudioConverter - 使用 FFmpeg 进行音频/视频转换
 */

import * as path from 'path'
import * as fs from 'fs'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const AUDIO_EXTS = ['.mp3', '.wav', '.flac', '.m4a', '.ogg', '.aac', '.wma']
const VIDEO_EXTS = ['.mp4', '.avi', '.mov', '.ts', '.mkv', '.wmv', '.flv', '.webm', '.rmvb']

export function isAudioFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return AUDIO_EXTS.includes(ext)
}

export function isVideoFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return VIDEO_EXTS.includes(ext)
}

export function getFfmpegPath(): string {
  const isWin = process.platform === 'win32'
  const ffmpegName = isWin ? 'ffmpeg.exe' : 'ffmpeg'

  // resourcesPath 在打包后指向 resources/ 目录（extraResources 内容在此）
  const resourcesPath = process.resourcesPath || ''

  const possiblePaths = [
    path.join(resourcesPath, ffmpegName),
    path.join(resourcesPath, 'app.asar.unpacked', ffmpegName),
    path.join(process.env.APP_ROOT || '', ffmpegName),
    path.join(process.cwd(), ffmpegName),
    ffmpegName
  ]

  console.log('[FFmpeg] Searching paths:', possiblePaths.slice(0, 3))
  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        console.log('[FFmpeg] Found:', p)
        return p
      }
    } catch { /* skip */ }
  }
  console.error('[FFmpeg] NOT FOUND, searched:', possiblePaths)
  return ffmpegName
}

export async function video2audio(inputFile: string, output?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const outPath = output || inputFile.replace(/\.[^.]+$/, '') + '.mp3'
    const dir = path.dirname(outPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const ffmpeg = getFfmpegPath()
    const args = [
      '-i', inputFile,
      '-ac', '1',
      '-f', 'mp3',
      '-af', 'aresample=async=1',
      '-y',
      outPath
    ]

    const child = spawn(ffmpeg, args)
    let stderr = ''

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    child.on('close', (code: number | null) => {
      if (code === 0 && fs.existsSync(outPath)) {
        resolve(outPath)
      } else {
        const ffPath = getFfmpegPath()
        const pathInfo = `ffmpeg路径=${ffPath}, 存在=${fs.existsSync(ffPath)}, 退出码=${code}, 输出存在=${fs.existsSync(outPath)}`
        reject(new Error(`FFmpeg conversion failed: ${pathInfo} | ${stderr.slice(-200)}`))
      }
    })

    child.on('error', (err: Error) => {
      const ffPath = getFfmpegPath()
      reject(new Error(`FFmpeg 启动失败: 路径=${ffPath}, 存在=${fs.existsSync(ffPath)}, ${err.message}`))
    })
  })
}

export function getSupportedExtensions(): string[] {
  return [...AUDIO_EXTS, ...VIDEO_EXTS]
}
