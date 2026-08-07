import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { execSync } from 'node:child_process'

let _debugLog: (tag: string, msg: string, obj?: any) => void = () => {}
export function setDebugLog(fn: (tag: string, msg: string, obj?: any) => void) { _debugLog = fn }
function debugLog(tag: string, msg: string, obj?: any) { _debugLog(tag, msg, obj) }

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

async function promptChromeDownload(): Promise<void> {
  const result = await dialog.showMessageBox({
    type: 'info',
    title: '需要 Google Chrome 浏览器',
    message: '快手视频解析需要 Chrome 浏览器支持',
    detail: '点击"确定"将跳转到 Chrome 下载页面，请下载并安装 Chrome 后重试。',
    buttons: ['确定', '取消'],
    defaultId: 0,
  })

  if (result.response === 0) {
    shell.openExternal('https://www.google.com/chrome/')
  }
}

export async function parseKuaishouWithAPI(url: string): Promise<any> {

  
  // 从 URL 中提取视频 ID
  let videoId: string | null = null
  let shortCode: string | null = null
  
  // 尝试 /short-video/xxx 格式
  const shortVideoMatch = url.match(/\/short-video\/([^?&#]+)/)
  if (shortVideoMatch) {
    videoId = shortVideoMatch[1]
  }
  
  // 尝试短链接 f/xxx 格式
  const shortLinkMatch = url.match(/\/f\/([^?&#]+)/)
  if (shortLinkMatch) {
    shortCode = shortLinkMatch[1]
  }
  

  
  // 如果有 shortCode，先获取重定向后的 URL
  if (shortCode && !videoId) {
    try {
      const fullUrl = `https://www.kuaishou.com/f/${shortCode}`
      const response = await fetch(fullUrl, {
        redirect: 'follow',
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })
      const redirectedUrl = response.url

      
      const newVideoMatch = redirectedUrl.match(/\/short-video\/([^?&#]+)/)
      if (newVideoMatch) {
        videoId = newVideoMatch[1]
      }
      
      // 如果获取到 videoId，直接调用 API
      if (videoId) {
        return await queryKuaishouVideoById(videoId)
      }
    } catch (e) {

    }
  }
  
  // 如果有 videoId，直接调用 API
  if (videoId) {
    return await queryKuaishouVideoById(videoId)
  }
  
  throw new Error('无法从 URL 提取视频 ID')
}

export async function parseKuaishouWithPuppeteer(url: string): Promise<any> {
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
    let finalUrl = url  // 初始值为传入的 URL

    // 拦截网络请求
    await page.setRequestInterception(true)
    page.on('request', (request) => {
      request.continue()
    })

    page.on('response', async (response) => {
      const resUrl = response.url()

      // 拦截快手视频详情 API - 扩展更多 API 路径
      if (resUrl.includes('/graphql') || 
          resUrl.includes('/rest/wd/photo/info') || 
          resUrl.includes('/rest/wd/photo/detail') ||
          resUrl.includes('/api') ||
          resUrl.includes('/v1/')) {
        try {
          const data = await response.json()

          if (data?.data?.visionVideoDetail || data?.data?.videoDetail || data?.data?.photo || data?.data) {

            videoData = data
          }
        } catch (e) {
          // 忽略非 JSON 响应
        }
      }
    })

    // 访问页面
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })

    // 等待视频元素加载（减少超时）
    try {
      await page.waitForSelector('video', { timeout: 5000 })

    } catch (e) {

    }
    
    // 减少滚动等待时间
    try {
      await page.evaluate(() => {
        window.scrollTo(0, 200)
      })
      await new Promise(resolve => setTimeout(resolve, 1000))
      await page.evaluate(() => {
        window.scrollTo(0, 0)
      })
      await new Promise(resolve => setTimeout(resolve, 1000))
    } catch (e) {

    }
    
    // 减少额外等待时间
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // 更新 finalUrl
    finalUrl = page.url()


    // 从 URL 中提取视频 ID 并手动请求视频详情
    const videoIdMatch = finalUrl.match(/\/short-video\/([^?&#]+)/) || url.match(/\/short-video\/([^?&#]+)/)
    const videoId = videoIdMatch ? videoIdMatch[1] : null
    
    if (videoId) {
      // 手动发送 GraphQL 请求获取视频详情
      try {
        const graphqlQuery = {
          operationName: 'VisionVideoDetail',
          variables: { photoId: videoId },
          query: `query VisionVideoDetail($photoId: String!) {
            visionVideoDetail(photoId: $photoId) {
              status
              photo {
                id
                duration
                caption
                likeCount
                viewCount
                realLikeCount
                coverUrl
                photoUrl
                photoH265Url
                manifest {
                  version
                  businessType
                  mediaType
                  adaptationSet {
                    id
                    duration
                  }
                }
              }
              llsid
            }
          }`
        }
        
        const response = await page.evaluate(async (query) => {
          const res = await fetch('https://www.kuaishou.com/graphql', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(query)
          })
          return await res.json()
        }, graphqlQuery)
        
        if (response?.data?.visionVideoDetail?.photo) {
          videoData = response
        }
      } catch (e) {
      }
    }

    // 尝试从页面 SSR 数据中提取
    renderData = await page.evaluate(() => {
      // 尝试从 window.__INITIAL_STATE__ 获取
      const initialState = (window as any).__INITIAL_STATE__
      if (initialState) {
        return { source: '__INITIAL_STATE__', data: initialState }
      }

      // 尝试从 window.__APOLLO_STATE__ 获取
      const apolloState = (window as any).__APOLLO_STATE__
      if (apolloState) {
        return { source: '__APOLLO_STATE__', data: apolloState }
      }

      // 尝试从 window.__DATA__ 获取（快手常用）
      const windowData = (window as any).__DATA__
      if (windowData) {
        return { source: '__DATA__', data: windowData }
      }

      // 尝试从 window.KS_DATA 获取
      const ksData = (window as any).KS_DATA
      if (ksData) {
        return { source: 'KS_DATA', data: ksData }
      }

      // 尝试从 script 标签获取
      const scripts = document.querySelectorAll('script')
      for (const script of scripts) {
        const text = script.textContent || ''
        // 匹配 __INITIAL_STATE__
        let match = text.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]+?});?\s*$/m)
        if (match) {
          try {
            return { source: 'script_INITIAL', data: JSON.parse(match[1]) }
          } catch (e) {
            // ignore
          }
        }
        // 匹配 __APOLLO_STATE__
        match = text.match(/window\.__APOLLO_STATE__\s*=\s*({[\s\S]+?});?\s*$/m)
        if (match) {
          try {
            return { source: 'script_APOLLO', data: JSON.parse(match[1]) }
          } catch (e) {
            // ignore
          }
        }
        // 匹配 __DATA__
        match = text.match(/window\.__DATA__\s*=\s*({[\s\S]+?});?\s*$/m)
        if (match) {
          try {
            return { source: 'script_DATA', data: JSON.parse(match[1]) }
          } catch (e) {
            // ignore
          }
        }
      }
      return null
    })
    


    // 优先使用 API 数据，其次是 SSR 数据
    let detailData = videoData?.data?.visionVideoDetail?.photo ||
                     videoData?.data?.videoDetail?.photo ||
                     videoData?.data?.photo ||
                     videoData?.data?.visionVideoDetail ||
                     videoData?.data?.videoDetail
    
    // 处理 visionShortVideoReco.feeds 数据结构（快手推荐视频）
    if (!detailData && videoData?.data?.visionShortVideoReco?.feeds) {
      const feeds = videoData.data.visionShortVideoReco.feeds
      
      // 尝试从多个 URL 格式中提取视频 ID
      const possibleUrls = [finalUrl, url, page.url()]
      let targetVideoId: string | null = null
      
      for (const checkUrl of possibleUrls) {
        // 尝试 /short-video/xxx 格式
        const shortMatch = checkUrl.match(/\/short-video\/([^?&#/]+)/)
        if (shortMatch) {
          targetVideoId = shortMatch[1]
          break
        }
        // 尝试 shareToken=xxx 格式
        const shareMatch = checkUrl.match(/shareToken=([^&#]+)/)
        if (shareMatch) {
          targetVideoId = shareMatch[1]
          break
        }
        // 尝试 shareId=xxx 格式
        const shareIdMatch = checkUrl.match(/shareId=([^&#]+)/)
        if (shareIdMatch) {
          targetVideoId = shareIdMatch[1]
          break
        }
        // 尝试 objectId=xxx 格式
        const objectIdMatch = checkUrl.match(/objectId=([^&#]+)/)
        if (objectIdMatch) {
          targetVideoId = objectIdMatch[1]
          break
        }
      }
      
      // 查找当前 URL 对应的视频
      let found = false
      for (const feed of feeds) {
        const feedPhotoId = feed.photo?.id
        // 检查多种匹配方式
        const isMatch = feedPhotoId === targetVideoId ||
                       (targetVideoId && feed.photo?.caption?.includes(targetVideoId)) ||
                       (targetVideoId && feed.photo?.originCaption?.includes(targetVideoId))
        if (isMatch) {
          detailData = feed.photo
          found = true
          break
        }
      }
      
      // 如果没找到匹配的，尝试通过其他方式匹配
      if (!found) {
        
        // 从 URL 中提取 objectId 和 authorId
        const objectIdMatch = finalUrl.match(/shareObjectId=([^&#]+)/) || 
                             url.match(/shareObjectId=([^&#]+)/) ||
                             page.url().match(/shareObjectId=([^&#]+)/)
        const objectId = objectIdMatch ? objectIdMatch[1] : null
        
        const authorIdMatch = finalUrl.match(/authorId=([^&#]+)/) ||
                             url.match(/authorId=([^&#]+)/) ||
                             page.url().match(/authorId=([^&#]+)/)
        const authorId = authorIdMatch ? authorIdMatch[1] : null

        
        // 如果有 authorId，尝试使用作者主页 API 获取视频列表
        if (authorId && objectId) {
          try {

            const recoQuery = {
              operationName: 'visionNewRecoFeed',
              variables: { photoId: objectId, authorId: authorId },
              query: `query visionNewRecoFeed($photoId: String!, $authorId: String!) {
                visionNewRecoFeed(photoId: $photoId, authorId: $authorId) {
                  feeds {
                    type
                    photo {
                      id
                      duration
                      caption
                      photoUrl
                      coverUrl
                      __typename
                    }
                    __typename
                  }
                  __typename
                }
              }`
            }
            
            const recoResponse = await page.evaluate(async (query) => {
              const res = await fetch('https://www.kuaishou.com/graphql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(query)
              })
              return await res.json()
            }, recoQuery)
            
            // 在推荐视频列表中查找目标视频
            if (recoResponse?.data?.visionNewRecoFeed?.feeds) {
              const recoFeeds = recoResponse.data.visionNewRecoFeed.feeds
              for (const feed of recoFeeds) {
                if (feed.photo?.id === objectId) {
                  detailData = feed.photo
                  found = true
                  break
                }
              }
            }
          } catch (e) {
          }
        }
        
        // 如果仍然没找到，尝试点击页面上匹配 objectId 的视频元素
        if (!found && objectId) {

          try {
            const clicked = await page.evaluate((targetId) => {
              // 尝试多种方式找到并点击目标视频
              const selectors = [
                `[data-video-id="${targetId}"]`,
                `[data-id="${targetId}"]`,
                `a[href*="${targetId}"]`,
                `.video-card[data-id="${targetId}"]`,
              ]
              for (const selector of selectors) {
                const el = document.querySelector(selector)
                if (el) {
                  (el as HTMLElement).click()
                  return true
                }
              }
              return false
            }, objectId)
            
            if (clicked) {

              await new Promise(resolve => setTimeout(resolve, 5000))
            }
          } catch (e) {
  
          }
        }
        
        // 尝试从 DOM 中获取当前播放的视频信息
        if (!found) {

          const domVideoInfo = await page.evaluate(() => {
            const video = document.querySelector('video')
            if (video) {
              const sources: string[] = []
              video.querySelectorAll('source').forEach((source: any) => {
                if (source.src) sources.push(source.src)
              })
              return {
                src: video.src || sources[0] || '',
                duration: video.duration,
                currentSrc: video.currentSrc
              }
            }
            return null
          })

          
          // 如果 DOM 中有视频信息，尝试匹配
          if (domVideoInfo?.src) {
            for (const feed of feeds) {
              if (feed.photo?.photoUrl?.includes(domVideoInfo.src) || 
                  domVideoInfo.src?.includes(feed.photo?.id || '')) {

                detailData = feed.photo
                found = true
                break
              }
            }
          }
        }
      }
    }
    
    // 如果 detailData 没有有效的视频 URL，再尝试从 renderData 获取
    const hasValidVideoUrl = detailData?.photoUrl || detailData?.manifest || detailData?.mvUrls
    if (!hasValidVideoUrl) {
      
      // 尝试遍历 defaultClient 的所有键查找视频数据
      if (renderData?.data?.defaultClient) {
        const client = renderData.data.defaultClient
        for (const key of Object.keys(client)) {
          const item = client[key]
          // 查找包含 manifest、mvUrls、photoUrl 等视频相关字段的对象
          if (item && (item.manifest || item.mvUrls || item.mainMvUrls || item.photoUrl || item.url || item.playUrl)) {

            detailData = item
            break
          }
        }
      }
      
      // 如果仍然没有有效的视频URL，使用第一个 feed
      const stillHasValidUrl = detailData?.photoUrl || detailData?.manifest || detailData?.mvUrls
      if (!stillHasValidUrl && videoData?.data?.visionShortVideoReco?.feeds) {

        detailData = videoData.data.visionShortVideoReco.feeds[0]?.photo
      }
    }
    


    if (detailData) {
      const photo = detailData

      // 构建格式列表
      const formats: any[] = []

      // 从 APOLLO client 中获取真正的 manifest 数据（manifest 可能是引用）
      let manifestData = photo.manifest
      if (photo.manifest?.id && renderData?.data?.defaultClient?.[photo.manifest.id]) {
        manifestData = renderData.data.defaultClient[photo.manifest.id]
      }

      // adaptationSet 可能是引用，需要获取真正的数据
      let adaptationSet = manifestData?.adaptationSet
      if (Array.isArray(adaptationSet) && adaptationSet[0]?.id) {
        const adaptationSetId = adaptationSet[0].id
        if (renderData?.data?.defaultClient?.[adaptationSetId]) {
          adaptationSet = renderData.data.defaultClient[adaptationSetId]
        }
      }

      // 处理不同清晰度的视频 (manifest 格式)
      if (adaptationSet?.representation) {
        let representations = adaptationSet.representation
        // representation 可能是引用数组，需要获取真正的数据
        if (Array.isArray(representations) && representations[0]?.type === 'id') {
          representations = representations.map((ref: any) => {
            if (ref?.id && renderData?.data?.defaultClient?.[ref.id]) {
              return renderData.data.defaultClient[ref.id]
            }
            return ref
          })
        }
        representations.forEach((rep: any, index: number) => {
          if (rep.url) {
            // 估算文件大小：使用平均码率 * 时长 / 8
            // 如果 avgBitrate 是 bps，duration 是毫秒
            let filesize = rep.size || rep.fileSize || 0
            
            if (!filesize && photo.duration) {
              if (rep.avgBitrate) {
                // avgBitrate (bps) * duration (ms) / 1000 (to seconds) / 8 (to bytes)
                filesize = Math.floor((rep.avgBitrate * photo.duration) / 1000 / 8)
              } else {
                // 没有码率信息时，根据清晰度估算
                const durationSec = photo.duration / 1000
                const height = rep.height || 720
                let estimatedBitrate = 2000000 // 默认 2Mbps
                if (height >= 1080) estimatedBitrate = 5000000
                else if (height >= 720) estimatedBitrate = 2500000
                else if (height >= 480) estimatedBitrate = 1500000
                else if (height >= 360) estimatedBitrate = 800000
                filesize = Math.floor((estimatedBitrate * durationSec) / 8)
              }
            }
            
            formats.push({
              formatId: `ks_${index}`,
              quality: `${rep.height}p`,
              ext: 'mp4',
              filesize: filesize,
              width: rep.width || 0,
              height: rep.height || 0,
              fps: rep.frameRate || 30,
              hasAudio: true,
              url: rep.url
            })
          }
        })
      }

      // 处理 mvUrls (快手常用格式，包含多个清晰度)
      if (photo.mvUrls && Array.isArray(photo.mvUrls)) {
        photo.mvUrls.forEach((mv: any, index: number) => {
          if (mv.url) {
            let filesize = mv.size || 0
            
            // 如果没有文件大小，使用码率和时长估算
            if (!filesize && photo.duration) {
              const durationSec = photo.duration / 1000
              const height = mv.height || 720
              let estimatedBitrate = 2000000
              if (height >= 1080) estimatedBitrate = 5000000
              else if (height >= 720) estimatedBitrate = 2500000
              else if (height >= 480) estimatedBitrate = 1500000
              else if (height >= 360) estimatedBitrate = 800000
              filesize = Math.floor((estimatedBitrate * durationSec) / 8)
            }
            
            formats.push({
              formatId: `ks_mv_${index}`,
              quality: mv.quality || '默认',
              ext: 'mp4',
              filesize: filesize,
              width: mv.width || 0,
              height: mv.height || 0,
              fps: 30,
              hasAudio: true,
              url: mv.url
            })
          }
        })
      }

      // 处理 mainMvUrls
      if (formats.length === 0 && photo.mainMvUrls?.[0]?.url) {
        let filesize = photo.mainMvUrls[0].size || photo.size || 0
        
        // 如果没有文件大小，使用码率和时长估算
        if (!filesize && photo.duration) {
          const durationSec = photo.duration / 1000
          const height = photo.mainMvUrls[0].height || photo.height || 720
          let estimatedBitrate = 2000000
          if (height >= 1080) estimatedBitrate = 5000000
          else if (height >= 720) estimatedBitrate = 2500000
          else if (height >= 480) estimatedBitrate = 1500000
          else if (height >= 360) estimatedBitrate = 800000
          filesize = Math.floor((estimatedBitrate * durationSec) / 8)
        }
        
        formats.push({
          formatId: 'default',
          quality: '默认',
          ext: 'mp4',
          filesize: filesize,
          width: photo.mainMvUrls[0].width || photo.width || 0,
          height: photo.mainMvUrls[0].height || photo.height || 0,
          fps: 30,
          hasAudio: true,
          url: photo.mainMvUrls[0].url
        })
      }

      // 备用：使用 photoUrl
      if (formats.length === 0 && photo.photoUrl) {
        let filesize = photo.size || 0
        
        // 如果没有文件大小，使用码率和时长估算
        if (!filesize && photo.duration) {
          const durationSec = photo.duration / 1000
          const height = photo.height || 720
          let estimatedBitrate = 2000000
          if (height >= 1080) estimatedBitrate = 5000000
          else if (height >= 720) estimatedBitrate = 2500000
          else if (height >= 480) estimatedBitrate = 1500000
          else if (height >= 360) estimatedBitrate = 800000
          filesize = Math.floor((estimatedBitrate * durationSec) / 8)
        }
        
        formats.push({
          formatId: 'default',
          quality: '默认',
          ext: 'mp4',
          filesize: filesize,
          width: photo.width || 0,
          height: photo.height || 0,
          fps: 30,
          hasAudio: true,
          url: photo.photoUrl
        })
      }

      // 备用：使用任何包含 url 的字段
      if (formats.length === 0 && photo.url) {
        let filesize = photo.size || 0
        
        // 如果没有文件大小，使用码率和时长估算
        if (!filesize && photo.duration) {
          const durationSec = photo.duration / 1000
          const height = photo.height || 720
          let estimatedBitrate = 2000000
          if (height >= 1080) estimatedBitrate = 5000000
          else if (height >= 720) estimatedBitrate = 2500000
          else if (height >= 480) estimatedBitrate = 1500000
          else if (height >= 360) estimatedBitrate = 800000
          filesize = Math.floor((estimatedBitrate * durationSec) / 8)
        }
        
        formats.push({
          formatId: 'default',
          quality: '默认',
          ext: 'mp4',
          filesize: filesize,
          width: photo.width || 0,
          height: photo.height || 0,
          fps: 30,
          hasAudio: true,
          url: photo.url
        })
      }

      // 按高度降序排序
      formats.sort((a, b) => (b.height || 0) - (a.height || 0))

      // 验证视频 ID 是否匹配目标视频
      const targetVideoId = videoId || (finalUrl.match(/\/short-video\/([^?&#]+)/) || url.match(/\/short-video\/([^?&#]+)/) || [])[1]
      const returnedVideoId = photo.photoId || photo.id
      if (targetVideoId && returnedVideoId && targetVideoId !== returnedVideoId) {

        throw new Error(`视频 ID 不匹配: 目标视频 ${targetVideoId}，返回视频 ${returnedVideoId}`)
      }

      videoInfo = {
        id: photo.photoId || photo.id || Date.now().toString(),
        title: photo.caption || '快手视频',
        description: photo.caption,
        thumbnail: photo.coverUrls?.[0]?.url || photo.coverUrl || '',
        duration: photo.duration ? Math.floor(photo.duration / 1000) : 0,
        uploader: photo.userName || photo.authorName || '',
        webpageUrl: finalUrl,
        formats: formats
      }
    } else {
      // 如果 API 失败，尝试从页面 DOM 提取

      
      // 尝试触发视频加载 - 滚动和交互
      await page.evaluate(async () => {
        // 滚动到页面底部再回来
        window.scrollTo(0, document.body.scrollHeight)
        await new Promise(r => setTimeout(r, 1000))
        window.scrollTo(0, 0)
        await new Promise(r => setTimeout(r, 1000))
        
        // 尝试点击视频区域
        const videoContainer = document.querySelector('.video-container') || 
                             document.querySelector('[class*="video"]') ||
                             document.querySelector('video')
        if (videoContainer) {
          ;(videoContainer as HTMLElement).click()
          await new Promise(r => setTimeout(r, 2000))
        }
      })
      
      // 再等待一下让视频加载
      await new Promise(resolve => setTimeout(resolve, 3000))
      
      videoInfo = await page.evaluate(() => {
        // 尝试多种选择器
        const titleEl = document.querySelector('.video-title') ||
                        document.querySelector('[data-e2e="video-title"]') ||
                        document.querySelector('[class*="title"]') ||
                        document.querySelector('.caption') ||
                        document.querySelector('.video-info-title') ||
                        document.querySelector('h1') ||
                        document.querySelector('[class*="desc"]')
        const authorEl = document.querySelector('.user-name') ||
                         document.querySelector('[data-e2e="user-name"]') ||
                         document.querySelector('[class*="author"]') ||
                         document.querySelector('.author-name') ||
                         document.querySelector('.video-info-user-name')
        
        // 查找视频元素
        const videoEl = document.querySelector('video') as HTMLVideoElement
        
        // 尝试多种方式获取视频 URL
        let videoSrc: string | undefined = videoEl?.src
        if (!videoSrc) videoSrc = videoEl?.currentSrc
        if (!videoSrc) videoSrc = videoEl?.querySelector('source')?.src
        if (!videoSrc) videoSrc = (videoEl as any)?.dataset?.src
        if (!videoSrc) videoSrc = (videoEl as any)?.dataset?.videoSrc
        if (!videoSrc) videoSrc = (videoEl as any)?.dataset?.url
        if (!videoSrc) videoSrc = (videoEl as any)?.props?.src
        if (!videoSrc) videoSrc = (videoEl as any)?.props?.url
        
        // 尝试从 img 标签的 src 获取缩略图
        let thumbnail = ''
        const imgEl = document.querySelector('[class*="cover"] img') as HTMLImageElement || 
                    document.querySelector('[class*="thumbnail"] img') as HTMLImageElement ||
                    null
        const videoPoster = document.querySelector('video')?.poster
        if (imgEl) {
          thumbnail = imgEl.src || imgEl.getAttribute('data-src') || ''
        } else if (videoPoster) {
          thumbnail = videoPoster
        }
        
        return {
          id: Date.now().toString(),
          title: titleEl?.textContent?.trim() || '快手视频',
          description: titleEl?.textContent?.trim() || '',
          thumbnail: thumbnail,
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

