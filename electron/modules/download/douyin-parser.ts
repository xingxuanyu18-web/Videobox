import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { dialog, shell } from 'electron'
import puppeteer from 'puppeteer-core'

let _debugLog: (tag: string, msg: string, obj?: any) => void = () => {}
export function setDebugLog(fn: (tag: string, msg: string, obj?: any) => void) { _debugLog = fn }
function debugLog(tag: string, msg: string, obj?: any) { _debugLog(tag, msg, obj) }

async function promptChromeDownload(): Promise<void> {
  const result = await dialog.showMessageBox({
    type: 'info',
    title: '需要 Google Chrome 浏览器',
    message: '抖音/快手视频解析需要 Chrome 浏览器支持',
    detail: '点击"确定"将跳转到 Chrome 下载页面，请下载并安装 Chrome 后重试。',
    buttons: ['确定', '取消'],
    defaultId: 0,
  })

  if (result.response === 0) {
    shell.openExternal('https://www.google.com/chrome/')
  }
}

function getChromiumPath(): string | null {
  // 1. 优先使用系统 Chrome
  const chromePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ]
  for (const p of chromePaths) {
    if (fs.existsSync(p)) return p
  }

  // 2. 使用系统 Edge（Windows 10/11 预装）
  const edgePaths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ]
  for (const p of edgePaths) {
    if (fs.existsSync(p)) return p
  }

  return null
}

export function getAvailableBrowser(): string {
  // 优先检查 Chrome
  const chromePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ]
  for (const p of chromePaths) {
    if (fs.existsSync(p)) return 'chrome'
  }

  // 然后检查 Edge
  const edgePaths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ]
  for (const p of edgePaths) {
    if (fs.existsSync(p)) return 'edge'
  }

  return ''
}

export async function parseDouyinWithAPI(url: string, cookieStr?: string): Promise<any> {
  // 从 URL 中提取视频 ID
  let videoId: string | null = null

  // 尝试多种 URL 格式
  const videoMatch = url.match(/\/video\/(\d+)/)
  if (videoMatch) {
    videoId = videoMatch[1]
  }

  // 短链接格式 https://v.douyin.com/xxxxx
  if (!videoId) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })
      const redirectedUrl = response.url
      const newVideoMatch = redirectedUrl.match(/\/video\/(\d+)/)
      if (newVideoMatch) {
        videoId = newVideoMatch[1]
      }
    } catch (e) {
    }
  }

  if (!videoId) {
    throw new Error('无法从 URL 提取视频 ID')
  }

  // 调用抖音 API
  const apiUrl = `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${videoId}&aid=6383&channel=channel_pc_web&detail_list=1`

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Referer': 'https://www.douyin.com/',
    'Accept': 'application/json',
    'Accept-Language': 'zh-CN,zh;q=0.9',
  }
  if (cookieStr) {
    headers['Cookie'] = cookieStr
  }

  const response = await fetch(apiUrl, { headers })

  // 检查响应是否为 JSON
  const text = await response.text()
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('抖音 API 返回非 JSON（需要浏览器 cookie），尝试备用方案')
  }

  if (!data.aweme_detail) {
    throw new Error('API 解析失败：' + (data.status_msg || '无视频数据'))
  }
  
  const detail = data.aweme_detail
  const video = detail.video
  
  // 用于去重，只保留每个清晰度的最佳版本
  const qualityMap = new Map<string, any>()
  
  // 处理 bit_rate 中的各种清晰度
  if (video.bit_rate && video.bit_rate.length > 0) {
    video.bit_rate.forEach((br: any, index: number) => {
      if (br.play_addr?.url_list[0]) {
        let quality = '默认'
        let qualityKey = 'default'
        let height = br.height || 0
        
        if (br.gear_name) {
          const match = br.gear_name.match(/(\d+)/)
          if (match) {
            quality = `${match[1]}p`
            qualityKey = match[1]
            height = parseInt(match[1])
          } else {
            quality = br.gear_name
            qualityKey = br.gear_name
          }
        } else if (br.height) {
          quality = `${br.height}p`
          qualityKey = String(br.height)
        }
        
        let filesize = br.data_size || 0
        if (!filesize && video.duration) {
          const durationSec = video.duration / 1000
          let estimatedBitrate = 2000000
          if (height >= 1080) estimatedBitrate = 5000000
          else if (height >= 720) estimatedBitrate = 2500000
          else if (height >= 480) estimatedBitrate = 1500000
          else if (height >= 360) estimatedBitrate = 800000
          filesize = Math.floor((estimatedBitrate * durationSec) / 8)
        }
        
        const existing = qualityMap.get(qualityKey)
        if (!existing || filesize > existing.filesize) {
          qualityMap.set(qualityKey, {
            formatId: `hd_${index}`,
            quality: quality,
            ext: 'mp4',
            filesize: filesize,
            width: br.width || 0,
            height: height,
            fps: br.fps || 30,
            hasAudio: true,
            url: br.play_addr.url_list[0]
          })
        }
      }
    })
  }
  
  // 如果没有从 bit_rate 获取到格式，尝试使用 play_addr
  if (qualityMap.size === 0 && video.play_addr) {
    const playAddr = video.play_addr
    let filesize = playAddr.data_size || 0
    
    if (!filesize && video.duration) {
      const durationSec = video.duration / 1000
      const height = playAddr.height || 720
      let estimatedBitrate = 2000000
      if (height >= 1080) estimatedBitrate = 5000000
      else if (height >= 720) estimatedBitrate = 2500000
      else if (height >= 480) estimatedBitrate = 1500000
      else if (height >= 360) estimatedBitrate = 800000
      filesize = Math.floor((estimatedBitrate * durationSec) / 8)
    }
    
    qualityMap.set('default', {
      formatId: 'normal',
      quality: '默认',
      ext: 'mp4',
      filesize: filesize,
      width: playAddr.width || 0,
      height: playAddr.height || 0,
      fps: 30,
      hasAudio: true,
      url: playAddr.url_list[0]
    })
  }
  
  const formats = Array.from(qualityMap.values())
    .filter(f => f.url)
    .sort((a, b) => (b.height || 0) - (a.height || 0))
  
  return {
    id: detail.aweme_id,
    title: detail.desc || '抖音视频',
    description: detail.desc,
    thumbnail: detail.video?.cover?.url_list[0] || detail.video?.dynamic_cover?.url_list[0] || '',
    duration: detail.video?.duration ? Math.floor(detail.video.duration / 1000) : 0,
    uploader: detail.author?.nickname || '',
    webpageUrl: url,
    formats: formats
  }
}

export async function parseDouyinWithPuppeteer(url: string): Promise<any> {
  const chromePath = getChromiumPath()

  if (!chromePath) {
    await promptChromeDownload()
    throw new Error('未检测到 Chrome 浏览器')
  }

  const launchOptions: any = {
    headless: true,
    executablePath: chromePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080'
    ]
  }

  const browser = await puppeteer.launch(launchOptions)

  try {
    const page = await browser.newPage()

    // 设置 User-Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

    // 设置视口
    await page.setViewport({ width: 1920, height: 1080 })

    // 存储拦截到的视频信息
    let videoInfo: any = null
    let videoData: any = null
    let renderData: any = null

    // 拦截网络请求
    await page.setRequestInterception(true)
    page.on('request', (request) => {
      request.continue()
    })

    page.on('response', async (response) => {
      const resUrl = response.url()

      // 拦截抖音视频详情 API
      if (resUrl.includes('/aweme/v1/web/aweme/detail/') ||
          resUrl.includes('/aweme/v1/aweme/detail/') ||
          resUrl.includes('/aweme/v1/multi/aweme/detail/')) {
        try {
          const data = await response.json()
          videoData = data
        } catch (e) {
          // 忽略非 JSON 响应
        }
      }
    })

    // 访问页面（短链接会重定向）
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })

    // 等待页面加载
    await new Promise(resolve => setTimeout(resolve, 3000))

    // 滚动页面触发视频加载
    await page.evaluate(async () => {
      const videoContainer = document.querySelector('.video-container') ||
                             document.querySelector('[data-e2e="video-container"]') ||
                             document.querySelector('.short-video') ||
                             document.body
      if (videoContainer) {
        videoContainer.scrollIntoView({ behavior: 'instant', block: 'center' })
      }
      await new Promise(r => setTimeout(r, 2000))
      
      const playBtn = document.querySelector('.play-button') ||
                      document.querySelector('[data-e2e="play-button"]') ||
                      document.querySelector('.video-play') ||
                      document.querySelector('.player-play')
      if (playBtn) {
        ;(playBtn as HTMLElement).click()
        await new Promise(r => setTimeout(r, 1000))
      }
    })

    // 尝试从页面 SSR 数据中提取
    renderData = await page.evaluate(() => {
      // 尝试从 window._SSR_HYDRATED_DATA 获取
      const ssrData = (window as any)._SSR_HYDRATED_DATA
      if (ssrData) {
        return { source: '_SSR_HYDRATED_DATA', data: ssrData }
      }

      // 尝试从 window.__INITIAL_STATE__ 获取
      const initialState = (window as any).__INITIAL_STATE__
      if (initialState) {
        return { source: '__INITIAL_STATE__', data: initialState }
      }

      // 尝试从 script 标签获取
      const scripts = document.querySelectorAll('script')
      for (const script of scripts) {
        const text = script.textContent || ''
        // 匹配 SSR_HYDRATED_DATA
        let match = text.match(/window\._SSR_HYDRATED_DATA\s*=\s*({[\s\S]+?});?\s*$/m)
        if (match) {
          try {
            return { source: 'script_SSR', data: JSON.parse(match[1]) }
          } catch (e) {
            // ignore
          }
        }
        // 匹配 __INITIAL_STATE__
        match = text.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]+?});?\s*$/m)
        if (match) {
          try {
            return { source: 'script_INITIAL', data: JSON.parse(match[1]) }
          } catch (e) {
            // ignore
          }
        }
      }
      return null
    })

    // 优先使用 API 数据，其次是 SSR 数据
    const detailData = videoData?.aweme_detail ||
                       renderData?.data?.aweme?.aweme_detail ||
                       renderData?.data?.app?.aweme_detail ||
                       renderData?.data?.aweme_detail

    if (detailData) {
      const detail = detailData
      const video = detail.video

      // 用于去重，只保留每个清晰度的最佳版本
      const qualityMap = new Map<string, any>()

      // 处理 bit_rate 中的各种清晰度
      if (video.bit_rate && video.bit_rate.length > 0) {
        video.bit_rate.forEach((br: any, index: number) => {
          if (br.play_addr?.url_list[0]) {
            // 从 gear_name 或 height 获取清晰度
            let quality = '默认'
            let qualityKey = 'default'
            let height = br.height || 0

            if (br.gear_name) {
              // 提取 gear_name 中的清晰度，如 "normal_720_0" -> "720p"
              const match = br.gear_name.match(/(\d+)/)
              if (match) {
                quality = `${match[1]}p`
                qualityKey = match[1]
                height = parseInt(match[1])
              } else {
                quality = br.gear_name
                qualityKey = br.gear_name
              }
            } else if (br.height) {
              quality = `${br.height}p`
              qualityKey = String(br.height)
            }

            // 只保留该清晰度下文件大小最大的
            let filesize = br.data_size || 0
            
            // 如果没有文件大小，使用码率和时长估算
            if (!filesize && video.duration) {
              // 抖音 duration 是毫秒，需要转换为秒
              const durationSec = video.duration / 1000
              // 估算码率：根据清晰度估算 (bps)
              let estimatedBitrate = 2000000 // 默认 2Mbps
              if (height >= 1080) estimatedBitrate = 5000000 // 1080p: 5Mbps
              else if (height >= 720) estimatedBitrate = 2500000 // 720p: 2.5Mbps
              else if (height >= 480) estimatedBitrate = 1500000 // 480p: 1.5Mbps
              else if (height >= 360) estimatedBitrate = 800000 // 360p: 0.8Mbps
              
              // 文件大小 = 码率 * 时长 / 8 (转换为字节)
              filesize = Math.floor((estimatedBitrate * durationSec) / 8)
            }
            
            const existing = qualityMap.get(qualityKey)

            if (!existing || filesize > existing.filesize) {
              qualityMap.set(qualityKey, {
                formatId: `hd_${index}`,
                quality: quality,
                ext: 'mp4',
                filesize: filesize,
                width: br.width || 0,
                height: height,
                fps: br.fps || 30,
                hasAudio: true,
                url: br.play_addr.url_list[0]
              })
            }
          }
        })
      }

      // 如果没有从 bit_rate 获取到格式，尝试使用 play_addr
      if (qualityMap.size === 0 && video.play_addr) {
        const playAddr = video.play_addr
        let filesize = playAddr.data_size || 0
        
        // 如果没有文件大小，使用码率和时长估算
        if (!filesize && video.duration) {
          const durationSec = video.duration / 1000
          const height = playAddr.height || 720
          let estimatedBitrate = 2000000
          if (height >= 1080) estimatedBitrate = 5000000
          else if (height >= 720) estimatedBitrate = 2500000
          else if (height >= 480) estimatedBitrate = 1500000
          else if (height >= 360) estimatedBitrate = 800000
          filesize = Math.floor((estimatedBitrate * durationSec) / 8)
        }
        
        qualityMap.set('default', {
          formatId: 'normal',
          quality: '默认',
          ext: 'mp4',
          filesize: filesize,
          width: playAddr.width || 0,
          height: playAddr.height || 0,
          fps: 30,
          hasAudio: true,
          url: playAddr.url_list[0]
        })
      }

      // 转换为数组并按高度降序排序（从高到低）
      const formats = Array.from(qualityMap.values())
        .filter(f => f.url)
        .sort((a, b) => (b.height || 0) - (a.height || 0))

      videoInfo = {
        id: detail.aweme_id,
        title: detail.desc || '抖音视频',
        description: detail.desc,
        thumbnail: detail.video?.cover?.url_list[0] || detail.video?.dynamic_cover?.url_list[0] || '',
        duration: detail.video?.duration ? Math.floor(detail.video.duration / 1000) : 0,
        uploader: detail.author?.nickname || '',
        webpageUrl: url,
        formats: formats
      }
    } else {
      // 如果 API 和 SSR 都失败，尝试从页面 DOM 提取
      videoInfo = await page.evaluate(() => {
        const videoEl = document.querySelector('video') as HTMLVideoElement
        const titleEl = document.querySelector('[data-e2e="video-desc"]') ||
                        document.querySelector('.title') ||
                        document.querySelector('h1')
        const authorEl = document.querySelector('[data-e2e="video-author"]') ||
                         document.querySelector('.author') ||
                         document.querySelector('[data-e2e="user-name"]')

        // 尝试获取视频 src
        let videoSrc: string | undefined = videoEl?.src
        if (!videoSrc) {
          const sourceEl = videoEl?.querySelector('source')
          videoSrc = sourceEl?.src
        }

        return {
          id: Date.now().toString(),
          title: titleEl?.textContent?.trim() || '抖音视频',
          description: titleEl?.textContent?.trim() || '',
          thumbnail: '',
          duration: videoEl?.duration || 0,
          uploader: authorEl?.textContent?.trim() || '',
          webpageUrl: window.location.href,
          formats: videoSrc ? [{
            formatId: 'default',
            quality: '默认',
            ext: 'mp4',
            filesize: 0,
            width: 0,
            height: 0,
            fps: 30,
            hasAudio: true,
            url: videoSrc
          }] : []
        }
      })
    }

    if (!videoInfo || videoInfo.formats.length === 0) {
      throw new Error('无法获取视频信息，请检查链接是否有效')
    }

    return videoInfo
  } finally {
    await browser.close()
  }
}

