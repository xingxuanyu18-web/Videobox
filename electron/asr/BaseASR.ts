/**
 * BaseASR - ASR 引擎基类
 * 从 AsrTools Python 版本移植到 TypeScript
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as crypto from 'crypto'
import { ASRData, ASRDataSeg } from './ASRData'

export abstract class BaseASR {
  static SUPPORTED_SOUND_FORMAT = ['flac', 'm4a', 'mp3', 'wav']
  static CACHE_FILE = path.join(os.tmpdir(), 'bk_asr', 'asr_cache.json')

  audioPath: string
  fileBinary: Buffer
  crc32Hex: string
  useCache: boolean
  cache: Record<string, unknown>

  constructor(audioPath: string, useCache: boolean = false) {
    this.audioPath = audioPath
    this.fileBinary = Buffer.alloc(0)
    this.crc32Hex = ''
    this.useCache = useCache

    this.setData()
    this.cache = this.loadCache()
  }

  private loadCache(): Record<string, unknown> {
    if (!this.useCache) return {}
    const dir = path.dirname(BaseASR.CACHE_FILE)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    if (fs.existsSync(BaseASR.CACHE_FILE)) {
      try {
        const data = fs.readFileSync(BaseASR.CACHE_FILE, 'utf-8')
        const cache = JSON.parse(data)
        if (typeof cache === 'object' && cache !== null) {
          return cache
        }
      } catch {
        return {}
      }
    }
    return {}
  }

  private saveCache(): void {
    if (!this.useCache) return
    try {
      fs.writeFileSync(BaseASR.CACHE_FILE, JSON.stringify(this.cache, null, 2), 'utf-8')
      // 清理过大缓存 (> 10MB)
      if (fs.existsSync(BaseASR.CACHE_FILE)) {
        const stat = fs.statSync(BaseASR.CACHE_FILE)
        if (stat.size > 10 * 1024 * 1024) {
          fs.unlinkSync(BaseASR.CACHE_FILE)
        }
      }
    } catch (e) {
      console.error('Failed to save cache:', e)
    }
  }

  private setData(): void {
    const ext = this.audioPath.split('.').pop()?.toLowerCase() || ''
    if (!BaseASR.SUPPORTED_SOUND_FORMAT.includes(ext)) {
      throw new Error(`Unsupported sound format: ${ext}`)
    }
    if (!fs.existsSync(this.audioPath)) {
      throw new Error(`File not found: ${this.audioPath}`)
    }
    this.fileBinary = fs.readFileSync(this.audioPath)

    // 计算 CRC32
    const crcBuf = crypto.createHash('sha256').update(this.fileBinary).digest()
    this.crc32Hex = crcBuf.subarray(0, 4).toString('hex').padStart(8, '0')
  }

  protected getKey(): string {
    return `${this.constructor.name}-${this.crc32Hex}`
  }

  async run(): Promise<ASRData> {
    const k = this.getKey()
    let respData: unknown

    if (k in this.cache && this.useCache) {
      respData = this.cache[k]
    } else {
      respData = await this._run()
      this.cache[k] = respData
      this.saveCache()
    }

    const segments = this._makeSegments(respData as Record<string, unknown>)
    return new ASRData(segments)
  }

  protected abstract _run(): Promise<Record<string, unknown>>
  protected abstract _makeSegments(respData: Record<string, unknown>): ASRDataSeg[]
}
