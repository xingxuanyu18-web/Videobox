/**
 * BcutASR - 必剪 (Bilibili) 语音识别接口
 * 从 AsrTools Python 版本移植到 TypeScript
 */

import { ASRDataSeg } from './ASRData'
import { BaseASR } from './BaseASR'
import * as crypto from 'crypto'

const API_BASE_URL = 'https://member.bilibili.com/x/bcut/rubick-interface'
const API_REQ_UPLOAD = `${API_BASE_URL}/resource/create`
const API_COMMIT_UPLOAD = `${API_BASE_URL}/resource/create/complete`
const API_CREATE_TASK = `${API_BASE_URL}/task`
const API_QUERY_RESULT = `${API_BASE_URL}/task/result`

const HEADERS = {
  'User-Agent': 'Bilibili/1.0.0 (https://www.bilibili.com)',
  'Content-Type': 'application/json'
}

interface UploadResponse {
  data: {
    in_boss_key: string
    resource_id: string
    upload_id: string
    upload_urls: string[]
    per_size: number
    size: number
  }
}

export class BcutASR extends BaseASR {
  private inBossKey: string | null = null
  private resourceId: string | null = null
  private uploadId: string | null = null
  private uploadUrls: string[] = []
  private perSize: number = 0
  private clips: number = 0
  private etags: string[] = []
  private downloadUrl: string | null = null
  private taskId: string | null = null

  constructor(audioPath: string, useCache: boolean = false) {
    super(audioPath, useCache)
  }

  private async upload(): Promise<void> {
    const payload = JSON.stringify({
      type: 2,
      name: 'audio.mp3',
      size: this.fileBinary.length,
      ResourceFileType: 'mp3',
      model_id: '8'
    })

    // 1. 申请上传
    let reqResp: any
    try {
      reqResp = await fetch(API_REQ_UPLOAD, {
        method: 'POST',
        headers: HEADERS,
        body: payload
      })
    } catch (e: any) {
      throw new Error(`Bcut 上传请求网络失败: ${e.message}`)
    }
    if (!reqResp.ok) throw new Error(`Bcut 上传申请被拒 (HTTP ${reqResp.status})`)
    const reqData: UploadResponse = await reqResp.json()
    const respData = reqData.data
    if (!respData?.upload_urls?.length) throw new Error('Bcut 返回数据异常: ' + JSON.stringify(reqData).substring(0, 100))

    this.inBossKey = respData.in_boss_key
    this.resourceId = respData.resource_id
    this.uploadId = respData.upload_id
    this.uploadUrls = respData.upload_urls
    this.perSize = respData.per_size
    this.clips = respData.upload_urls.length

    console.log(`[BcutASR] 申请上传成功, ${Math.floor(respData.size / 1024)}KB, ${this.clips}分片`)

    // 2. 分片上传
    for (let clip = 0; clip < this.clips; clip++) {
      const startRange = clip * this.perSize
      const endRange = (clip + 1) * this.perSize
      const chunk = this.fileBinary.subarray(startRange, endRange)

      console.log(`[BcutASR] 上传分片${clip}: ${startRange}-${endRange}`)
      try {
        const resp = await fetch(this.uploadUrls[clip], {
          method: 'PUT',
          headers: HEADERS,
          body: new Uint8Array(chunk)
        })
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const etag = resp.headers.get('Etag') || ''
        this.etags.push(etag)
      } catch (e: any) {
        throw new Error(`Bcut 分片${clip}上传失败: ${e.message}`)
      }
    }

    // 3. 提交上传
    const commitData = JSON.stringify({
      InBossKey: this.inBossKey,
      ResourceId: this.resourceId,
      Etags: this.etags.join(','),
      UploadId: this.uploadId,
      model_id: '8'
    })

    try {
      const commitResp = await fetch(API_COMMIT_UPLOAD, {
        method: 'POST',
        headers: HEADERS,
        body: commitData
      })
      if (!commitResp.ok) throw new Error(`HTTP ${commitResp.status}`)
      const commitJson = await commitResp.json()
      this.downloadUrl = commitJson.data.download_url
      console.log('[BcutASR] 提交成功')
    } catch (e: any) {
      throw new Error(`Bcut 提交上传失败: ${e.message}`)
    }
  }

  private async createTask(): Promise<string> {
    const resp = await fetch(API_CREATE_TASK, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ resource: this.downloadUrl, model_id: '8' })
    })
    if (!resp.ok) throw new Error(`Create task failed: ${resp.status}`)
    const data = await resp.json()
    this.taskId = data.data.task_id
    console.log(`[BcutASR] 任务已创建: ${this.taskId}`)
    return this.taskId
  }

  private async result(taskId?: string): Promise<unknown> {
    const tid = taskId || this.taskId
    const params = new URLSearchParams({ model_id: '7', task_id: tid! })
    const resp = await fetch(`${API_QUERY_RESULT}?${params}`, { headers: HEADERS })
    if (!resp.ok) throw new Error(`Query result failed: ${resp.status}`)
    const data = await resp.json()
    return data.data
  }

  async _run(): Promise<Record<string, unknown>> {
    await this.upload()
    await this.createTask()

    // 轮询检查任务状态
    for (let i = 0; i < 500; i++) {
      const taskResp = await this.result() as { state: number; result: string }
      if (taskResp.state === 4) break
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    console.log('[BcutASR] 转换成功')
    const finalResp = await this.result() as { result: string }
    return JSON.parse(finalResp.result)
  }

  _makeSegments(respData: Record<string, unknown>): ASRDataSeg[] {
    const utterances = respData.utterances as Array<{ transcript: string; start_time: number; end_time: number }>
    return utterances.map(u => new ASRDataSeg(u.transcript, u.start_time, u.end_time))
  }
}
