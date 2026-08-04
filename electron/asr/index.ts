/**
 * ASR 引擎统一导出
 */

export { ASRData, ASRDataSeg } from './ASRData'
export { BaseASR } from './BaseASR'
export { BcutASR } from './BcutASR'
export { JianYingASR } from './JianYingASR'
export { KuaiShouASR } from './KuaiShouASR'
export { video2audio, isAudioFile, isVideoFile, getFfmpegPath, getSupportedExtensions } from './AudioConverter'

import { BcutASR } from './BcutASR'
import { JianYingASR } from './JianYingASR'
import { KuaiShouASR } from './KuaiShouASR'
import { ASRData } from './ASRData'
import { video2audio, isAudioFile } from './AudioConverter'

export type AsrEngineName = 'Bcut' | 'JianYing' | 'KuaiShou' | 'Whisper'

export const ASR_ENGINES: { name: AsrEngineName; label: string; available: boolean }[] = [
  { name: 'Bcut', label: 'B 接口', available: true },
  { name: 'JianYing', label: 'J 接口', available: true },
  { name: 'KuaiShou', label: 'K 接口', available: true },
  { name: 'Whisper', label: 'Whisper', available: false }
]

export async function processAsr(
  filePath: string,
  engine: AsrEngineName,
  exportFormat: string
): Promise<{ savePath: string; resultText: string }> {
  let audioPath = filePath
  if (!isAudioFile(filePath)) {
    console.log(`[ASR] Converting video to audio: ${filePath}`)
    audioPath = await video2audio(filePath)
  }

  let asr: BcutASR | JianYingASR | KuaiShouASR
  switch (engine) {
    case 'Bcut': asr = new BcutASR(audioPath, true); break
    case 'JianYing': asr = new JianYingASR(audioPath, true); break
    case 'KuaiShou': asr = new KuaiShouASR(audioPath, true); break
    default: throw new Error(`Unknown ASR engine: ${engine}`)
  }

  const result = await asr.run()

  let resultText: string
  const ext = exportFormat.toLowerCase()
  if (ext === 'srt') resultText = result.toSrt()
  else if (ext === 'ass') resultText = result.toAss()
  else if (ext === 'txt') resultText = result.toTxt()
  else resultText = result.toSrt()

  const savePath = filePath.replace(/\.[^.]+$/, '') + '.' + ext
  result.save(savePath)
  return { savePath, resultText }
}
