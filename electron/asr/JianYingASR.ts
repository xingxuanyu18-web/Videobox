/**
 * JianYingASR - 剪映语音识别接口
 * 从 AsrTools Python 版本移植到 TypeScript
 * 需要 AWS V4 签名上传到字节跳动 VOD
 */

import * as crypto from 'crypto'
import { ASRDataSeg } from './ASRData'
import { BaseASR } from './BaseASR'

// ==================== AWS V4 签名工具函数 ====================

function hmacSha256(key: Buffer | string, msg: string): Buffer {
  if (typeof key === 'string') {
    key = Buffer.from(key, 'utf-8')
  }
  return crypto.createHmac('sha256', key).update(msg, 'utf-8').digest()
}

function sha256Hex(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf-8').digest('hex')
}

function getSignatureKey(secretKey: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmacSha256('AWS4' + secretKey, dateStamp)
  const kRegion = hmacSha256(kDate, region)
  const kService = hmacSha256(kRegion, service)
  const kSigning = hmacSha256(kService, 'aws4_request')
  return kSigning
}

function awsSignature(
  secretKey: string,
  requestParameters: string,
  headers: Record<string, string>,
  method: string = 'GET',
  payload: string = '',
  region: string = 'cn',
  service: string = 'vod'
): string {
  const canonicalUri = '/'
  const canonicalQuerystring = requestParameters
  const sortedHeaders = Object.keys(headers).sort()
  const canonicalHeaders = sortedHeaders.map(k => `${k}:${headers[k]}`).join('\n') + '\n'
  const signedHeaders = sortedHeaders.join(';')
  const payloadHash = sha256Hex(payload)
  const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQuerystring}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`

  const amzDate = headers['x-amz-date']
  const dateStamp = amzDate.split('T')[0]

  const algorithm = 'AWS4-HMAC-SHA256'
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`

  const signingKey = getSignatureKey(secretKey, dateStamp, region, service)
  return crypto.createHmac('sha256', signingKey).update(stringToSign, 'utf-8').digest('hex')
}

// ==================== JianYingASR ====================

export class JianYingASR extends BaseASR {
  private sessionToken: string | null = null
  private secretKey: string | null = null
  private accessKey: string | null = null
  private storeUri: string | null = null
  private auth: string | null = null
  private uploadId: string | null = null
  private sessionKey: string | null = null
  private uploadHosts: string | null = null
  private needWordTimeStamp: boolean
  private startTime: number
  private endTime: number
  private tdid: string

  constructor(
    audioPath: string,
    useCache: boolean = false,
    needWordTimeStamp: boolean = false,
    startTime: number = 0,
    endTime: number = 6000
  ) {
    super(audioPath, useCache)
    this.needWordTimeStamp = needWordTimeStamp
    this.startTime = startTime
    this.endTime = endTime
    this.tdid = '3943278516897751'
  }

  protected getKey(): string {
    return `${this.constructor.name}-${this.crc32Hex}-${this.needWordTimeStamp}`
  }

  private async generateSignParameters(url: string, pf: string = '4', appvr: string = '4.0.0'): Promise<[string, string]> {
    const currentTime = String(Math.floor(Date.now() / 1000))
    const data = { url, current_time: currentTime, pf, appvr, tdid: this.tdid }

    try {
      console.log('[JianYingASR] sign request to bkfeng.top...')
      const resp = await fetch('https://asrtools-update.bkfeng.top/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      console.log('[JianYingASR] sign response:', resp.status, resp.statusText)
      if (!resp.ok) throw new Error(`Sign request failed: ${resp.status}`)
      const respData = await resp.json()
      const sign = respData.sign
      if (!sign) throw new Error("No 'sign' in response")
      return [sign.toLowerCase(), currentTime]
    } catch (e) {
      console.error('[JianYingASR] sign FAILED:', e)
      throw new Error(`Sign generation failed: ${e}`)
    }
  }

  private buildHeaders(deviceTime: string, sign: string): Record<string, string> {
    return {
      'User-Agent': 'Cronet/TTNetVersion:01594da2 2023-03-14 QuicVersion:46688bb4 2022-11-28',
      'appvr': '4.0.0',
      'device-time': deviceTime,
      'pf': '4',
      'sign': sign,
      'sign-ver': '1',
      'tdid': this.tdid
    }
  }

  private uploadHeaders(): Record<string, string> {
    return {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.138 Safari/537.36 Thea/1.0.1',
      'Authorization': this.auth || '',
      'Content-CRC32': this.crc32Hex
    }
  }

  private async uploadSign(): Promise<void> {
    const url = '/lv/v1/upload_sign'
    const [sign, deviceTime] = await this.generateSignParameters(url)
    const headers = this.buildHeaders(deviceTime, sign)

    const resp = await fetch('https://lv-pc-api-sinfonlinec.ulikecam.com/lv/v1/upload_sign', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ biz: 'pc-recognition' })
    })
    if (!resp.ok) throw new Error(`Upload sign failed: ${resp.status}`)
    const data = await resp.json()
    this.accessKey = data.data.access_key_id
    this.secretKey = data.data.secret_access_key
    this.sessionToken = data.data.session_token
  }

  private async uploadAuth(): Promise<void> {
    const fileSize = this.fileBinary.length
    const requestParameters = `Action=ApplyUploadInner&FileSize=${fileSize}&FileType=object&IsInner=1&SpaceName=lv-mac-recognition&Version=2020-11-19&s=5y0udbjapi`

    const now = new Date()
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').substring(0, 15) + 'Z'
    const dateStamp = amzDate.split('T')[0]

    const headers: Record<string, string> = {
      'x-amz-date': amzDate,
      'x-amz-security-token': this.sessionToken!
    }

    const signature = awsSignature(this.secretKey!, requestParameters, headers, 'GET', '', 'cn', 'vod')
    const authorization = `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${dateStamp}/cn/vod/aws4_request, SignedHeaders=x-amz-date;x-amz-security-token, Signature=${signature}`
    headers['authorization'] = authorization

    const resp = await fetch(`https://vod.bytedanceapi.com/?${requestParameters}`, { headers })
    if (!resp.ok) throw new Error(`Upload auth failed: ${resp.status}`)
    const data = await resp.json()

    const storeInfo = data.Result.UploadAddress.StoreInfos[0]
    this.storeUri = storeInfo.StoreUri
    this.auth = storeInfo.Auth
    this.uploadId = storeInfo.UploadID
    this.sessionKey = data.Result.UploadAddress.SessionKey
    this.uploadHosts = data.Result.UploadAddress.UploadHosts[0]
  }

  private async uploadFile(): Promise<void> {
    const url = `https://${this.uploadHosts}/${this.storeUri}?partNumber=1&uploadID=${this.uploadId}`
    const resp = await fetch(url, {
      method: 'PUT',
      headers: this.uploadHeaders(),
      body: new Uint8Array(this.fileBinary)
    })
    const data = await resp.json()
    if (data.success !== 0) {
      throw new Error(`File upload failed: ${JSON.stringify(data)}`)
    }
  }

  private async uploadCheck(): Promise<void> {
    const url = `https://${this.uploadHosts}/${this.storeUri}?uploadID=${this.uploadId}`
    const resp = await fetch(url, {
      method: 'POST',
      headers: this.uploadHeaders(),
      body: `1:${this.crc32Hex}`
    })
    await resp.json()
  }

  private async uploadCommit(): Promise<void> {
    const url = `https://${this.uploadHosts}/${this.storeUri}?uploadID=${this.uploadId}&partNumber=1&x-amz-security-token=${this.sessionToken}`
    await fetch(url, {
      method: 'PUT',
      headers: this.uploadHeaders(),
      body: new Uint8Array(this.fileBinary)
    })
  }

  private async upload(): Promise<void> {
    await this.uploadSign()
    await this.uploadAuth()
    await this.uploadFile()
    await this.uploadCheck()
    await this.uploadCommit()
  }

  private async submit(): Promise<string> {
    const [sign, deviceTime] = await this.generateSignParameters('/lv/v1/audio_subtitle/submit')
    const headers = this.buildHeaders(deviceTime, sign)

    const payload = {
      adjust_endtime: 200,
      audio: this.storeUri,
      caption_type: 2,
      client_request_id: '45faf98c-160f-4fae-a649-6d89b0fe35be',
      max_lines: 1,
      songs_info: [{ end_time: this.endTime, id: '', start_time: this.startTime }],
      words_per_line: 16
    }

    const resp = await fetch('https://lv-pc-api-sinfonlinec.ulikecam.com/lv/v1/audio_subtitle/submit', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const data = await resp.json()
    return data.data.id
  }

  private async query(queryId: string): Promise<Record<string, unknown>> {
    const [sign, deviceTime] = await this.generateSignParameters('/lv/v1/audio_subtitle/query')
    const headers = this.buildHeaders(deviceTime, sign)

    const resp = await fetch('https://lv-pc-api-sinfonlinec.ulikecam.com/lv/v1/audio_subtitle/query', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: queryId, pack_options: { need_attribute: true } })
    })
    return resp.json()
  }

  async _run(): Promise<Record<string, unknown>> {
    console.log('[JianYingASR] Step 1/4: upload...')
    try {
      await this.upload()
      console.log('[JianYingASR] upload done, storeUri=', this.storeUri)
    } catch (e: any) {
      console.error('[JianYingASR] upload FAILED:', e.message, e.stack)
      throw e
    }

    console.log('[JianYingASR] Step 2/4: submit...')
    let queryId: string
    try {
      queryId = await this.submit()
      console.log('[JianYingASR] submit done, queryId=', queryId)
    } catch (e: any) {
      console.error('[JianYingASR] submit FAILED:', e.message, e.stack)
      throw e
    }

    console.log('[JianYingASR] Step 3/4: query...')
    try {
      const respData = await this.query(queryId)
      console.log('[JianYingASR] query done, hasData=', !!respData?.data)
      return respData
    } catch (e: any) {
      console.error('[JianYingASR] query FAILED:', e.message, e.stack)
      throw e
    }
  }

  _makeSegments(respData: Record<string, unknown>): ASRDataSeg[] {
    const data = respData.data as { utterances: Array<{ text: string; start_time: number; end_time: number; words?: Array<{ text: string; start_time: number; end_time: number }> }> }

    if (this.needWordTimeStamp && data.utterances[0]?.words) {
      return data.utterances.flatMap(u =>
        u.words!.map(w => new ASRDataSeg(w.text.trim(), w.start_time, w.end_time))
      )
    }
    return data.utterances.map(u => new ASRDataSeg(u.text, u.start_time, u.end_time))
  }
}
