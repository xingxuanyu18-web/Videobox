/**
 * KuaiShouASR - 快手语音识别接口
 * 从 AsrTools Python 版本移植到 TypeScript
 */

import { ASRDataSeg } from './ASRData'
import { BaseASR } from './BaseASR'

export class KuaiShouASR extends BaseASR {
  constructor(audioPath: string, useCache: boolean = false) {
    super(audioPath, useCache)
  }

  async _run(): Promise<Record<string, unknown>> {
    return this.submit()
  }

  private async submit(): Promise<Record<string, unknown>> {
    const formData = new FormData()
    formData.append('typeId', '1')
    formData.append('file', new Blob([new Uint8Array(this.fileBinary)], { type: 'audio/mpeg' }), 'test.mp3')

    const resp = await fetch('https://ai.kuaishou.com/api/effects/subtitle_generate', {
      method: 'POST',
      body: formData
    })
    if (!resp.ok) throw new Error(`KuaiShou ASR failed: ${resp.status}`)
    return resp.json()
  }

  _makeSegments(respData: Record<string, unknown>): ASRDataSeg[] {
    const data = respData.data as { text: Array<{ text: string; start_time: number; end_time: number }> }
    return data.text.map(u => new ASRDataSeg(u.text, u.start_time, u.end_time))
  }
}
