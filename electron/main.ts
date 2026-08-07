import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron'
import { autoUpdater } from 'electron-updater'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { spawn, execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import puppeteer from 'puppeteer-core'
import { LicenseManager, FREE_DAILY_COPYWRITING_LIMIT } from './license/LicenseManager'
import { processAsr, ASR_ENGINES, isAudioFile, isVideoFile } from './asr/index'
import { runRewritePipeline, runGeneratePipeline, DEFAULT_AI_CONFIG, chat, autoDetect as ollamaAutoDetect, isOllamaRunning, findOllamaExe, startOllamaService, hasModel, pullModel as ollamaPullModel, listModels, oneClickSetup, RECOMMENDED_MODEL } from './copywriting/index'
import type { AIConfig } from './copywriting/index'
import { register as registerClipboard } from './modules/clipboard'
import { register as registerDialog } from './modules/dialog'
import { register as registerShell } from './modules/shell'
import { register as registerMirror } from './modules/mirror'
import { register as registerHistory } from './modules/history'
import { parseDouyinWithAPI, parseDouyinWithPuppeteer, setDebugLog as setDouyinDebugLog, getAvailableBrowser } from './modules/download/douyin-parser'
import { parseKuaishouWithAPI, parseKuaishouWithPuppeteer, setDebugLog as setKuaishouDebugLog } from './modules/download/kuaishou-parser'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ==================== Debug Logging ====================
let _debugLogPath = ''
function debugLogPath(): string {
  if (!_debugLogPath) {
    _debugLogPath = path.join(app.getPath('userData'), 'debug.log')
  }
  return _debugLogPath
}
function debugLog(tag: string, msg: string, obj?: any) {
  const now = new Date().toISOString()
  const line = `[${now}] [${tag}] ${msg}` + (obj ? ' ' + JSON.stringify(obj, null, 2) : '') + '\n'
  try {
    fs.appendFileSync(debugLogPath(), line, 'utf-8')
  } catch {}
  console.log(line.trim())
}

// Wire parser modules to use main's debugLog
setDouyinDebugLog(debugLog)
setKuaishouDebugLog(debugLog)

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

// 获取 yt-dlp 路径
function getYtDlpPath(): string {
  const possiblePaths = [
    path.join(process.env.APP_ROOT, 'yt-dlp.exe'),
    path.join(process.resourcesPath || '', 'yt-dlp.exe'),
    path.join(__dirname, '..', '..', 'yt-dlp.exe'),
  ]
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p
    }
  }
  return 'yt-dlp.exe'
}

// 获取 ffmpeg 路径（跨平台）
function getFfmpegPath(): string {
  const platform = process.platform
  const isWin = platform === 'win32'
  const ffmpegName = isWin ? 'ffmpeg.exe' : 'ffmpeg'

  const possiblePaths = [
    path.join(process.env.APP_ROOT || '', ffmpegName),
    path.join(process.resourcesPath || '', ffmpegName),
    path.join(__dirname, '..', '..', ffmpegName),
    path.join(process.cwd(), ffmpegName),
    ffmpegName
  ]

  for (const p of possiblePaths) {
    try { if (fs.existsSync(p)) return p } catch {}
  }

  // 最后尝试系统 PATH 查找
  try {
    const cmd = isWin ? 'where ffmpeg 2>nul' : 'which ffmpeg 2>/dev/null'
    const result = execSync(cmd, { encoding: 'utf8', timeout: 5000 }).trim()
    if (result && fs.existsSync(result.split('\n')[0].trim())) {
      return result.split('\n')[0].trim()
    }
  } catch {}

  return ffmpegName
}

// 检查 JS 运行时是否可用
function checkJsRuntime(): { available: boolean; path: string | null; name: string } {
  const platform = process.platform
  const isWin = platform === 'win32'
  
  // 1. 首先尝试 Node.js：通过系统命令动态查找，不依赖硬编码路径
  try {
    const findCmd = isWin ? 'where node.exe' : 'which node'
    // console.log('[checkJsRuntime] PATH:', process.env.PATH)
    const result = execSync(findCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
    // console.log('[checkJsRuntime] where result:', result)
    const nodePath = result.split(/\r?\n/)[0].trim()
    if (nodePath && fs.existsSync(nodePath)) {
      return { available: true, path: nodePath, name: 'Node.js' }
    }
  } catch (e) {
    console.log('[checkJsRuntime] where failed:', e)
  }
  
  // 2. 尝试 Deno
  const denoName = isWin ? 'deno.exe' : 'deno'
  const denoPaths = [
    denoName,
    path.join(process.env.APP_ROOT || '', denoName),
    path.join(process.resourcesPath || '', denoName),
    path.join(__dirname, '..', '..', denoName),
    path.join(process.cwd(), denoName),
  ]
  
  for (const p of denoPaths) {
    try {
      if (fs.existsSync(p)) {
        return { available: true, path: p, name: 'Deno' }
      }
    } catch {
    }
  }
  
  return { available: false, path: null, name: '' }
}

// 弹出提示让用户下载 Node.js
async function promptNodeDownload(): Promise<void> {
  const result = await dialog.showMessageBox({
    type: 'info',
    title: '需要 Node.js 运行时',
    message: 'YouTube 视频解析需要 Node.js 运行时',
    detail: '点击"确定"将跳转到 Node.js 下载页面，请下载 Windows Installer (.msi) 版本并安装后重试。',
    buttons: ['确定', '取消'],
    defaultId: 0,
  })

  if (result.response === 0) {
    shell.openExternal('https://nodejs.org/zh-cn/download/package-manager')
  }
}

// 检查 ffmpeg 是否可用（保留供将来使用）
// @ts-ignore
async function checkFfmpeg(): Promise<boolean> {
  return new Promise((resolve) => {
    const ffmpeg = spawn(getFfmpegPath(), ['-version'])
    ffmpeg.on('error', () => resolve(false))
    ffmpeg.on('close', (code) => resolve(code === 0))
  })
}

// 检查是否是抖音链接
function isDouyinUrl(url: string): boolean {
  return url.includes('douyin.com') || url.includes('v.douyin.com')
}

// 检查是否是快手链接
function isKuaishouUrl(url: string): boolean {
  return url.includes('kuaishou.com') || url.includes('v.kuaishou.com')
}

// 检查是否是B站链接（保留供将来使用）
// @ts-ignore
function isBilibiliUrl(url: string): boolean {
  return url.includes('bilibili.com') || url.includes('b23.tv')
}

// 默认下载目录
function getDefaultDownloadDir(): string {
  return path.join(os.homedir(), 'Downloads', 'Videobox')
}

// 确保下载目录存在
function ensureDownloadDir(dir: string): string {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

// 存储正在进行的下载任务
const activeDownloads = new Map<string, any>()

// 发送下载进度到所有窗口
function sendDownloadProgress(data: any) {
  const windows = BrowserWindow.getAllWindows()
  windows.forEach(window => {
    if (!window.isDestroyed()) {
      window.webContents.send('download:progress', data)
    }
  })
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'Videobox',
    backgroundColor: '#000000',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#000000',
      symbolColor: '#F97316',
      height: 36,
    },
    icon: path.join(process.env.APP_ROOT || '', 'public/videobox.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// 配置 electron-updater GitHub Provider
const GITHUB_OWNER = 'xingxuanyu18-web'
const GITHUB_REPO = 'Videobox'
autoUpdater.setFeedURL({
  provider: 'github',
  owner: GITHUB_OWNER,
  repo: GITHUB_REPO,
})
autoUpdater.autoDownload = false  // 手动下载，走镜像加速

// GitHub 加速镜像列表（ghfast.top 优先）
const DOWNLOAD_MIRRORS = [
  'https://ghfast.top/',
  'https://ghproxy.net/',
  'https://mirror.ghproxy.com/',
]

let downloadedInstallerPath: string | null = null

// 更新检测结果缓存（5分钟内不重复请求）
let lastUpdateCheckTime = 0
let lastUpdateCheckResult: any = null
const UPDATE_CACHE_MS = 5 * 60 * 1000

// 将 autoUpdater 事件转发到渲染进程
function setupAutoUpdater() {
  autoUpdater.on('checking-for-update', () => {
    win?.webContents.send('update:status', { status: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    win?.webContents.send('update:status', {
      status: 'available',
      version: info.version,
      releaseNotes: info.releaseNotes,
      releaseDate: info.releaseDate,
    })
    // 走镜像下载
    downloadUpdateWithMirrors(info.version)
  })

  autoUpdater.on('update-not-available', () => {
    win?.webContents.send('update:status', {
      status: 'no-update',
      version: app.getVersion(),
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    win?.webContents.send('update:status', {
      status: 'downloading',
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    win?.webContents.send('update:status', {
      status: 'downloaded',
      version: info.version,
    })
  })

  autoUpdater.on('error', (err) => {
    const msg = err?.message || String(err)
    // 过滤掉 autoUpdater 自身的连接错误——我们已用 net.fetch 替代
    if (msg.includes('ERR_CONNECTION') || msg.includes('net::ERR_')) {
      console.log('[Update] autoUpdater network error (ignored):', msg)
      return
    }
    win?.webContents.send('update:status', { status: 'error', error: msg })
  })
}

// ==================== 镜像下载 ====================

async function downloadUpdateWithMirrors(version: string) {
  const loadMirrorConfig = () => {
    try {
      const file = path.join(app.getPath('userData'), 'mirror_config.json')
      if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, 'utf8'))
      }
    } catch {}
    return { enabled: true }
  }

  const mirrorConfig = loadMirrorConfig()
  const filename = `Videobox.Setup.${version}.exe`
  const githubUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v${version}/${filename}`

  // 构建 URL 列表（GitHub 优先 → 国内镜像兜底）
  const urls: { url: string; label: string }[] = []
  urls.push({ url: githubUrl, label: 'GitHub' })
  if (mirrorConfig.enabled) {
    DOWNLOAD_MIRRORS.forEach(m => urls.push({ url: m + githubUrl, label: m.replace('https://', '').replace('/', '') }))
  }

  for (const { url, label } of urls) {
    console.log(`[Update] Trying ${label}: ${url}`)
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Videobox-Updater/1.0' },
      })
      if (!res.ok || !res.body) {
        console.log(`[Update] ${label} failed: HTTP ${res.status}`)
        continue
      }

      const totalSize = parseInt(res.headers.get('content-length') || '0')
      const tmpDir = os.tmpdir()
      const filePath = path.join(tmpDir, filename)
      const writer = fs.createWriteStream(filePath)
      const reader = res.body.getReader()

      const downloadStart = Date.now()
      let downloaded = 0
      let lastEmit = 0

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          downloaded += value.length
          writer.write(Buffer.from(value))

          const now = Date.now()
          if (now - lastEmit > 500 || done) {
            lastEmit = now
            const percent = totalSize > 0 ? Math.round((downloaded / totalSize) * 100) : 0
            const elapsed = (now - downloadStart) / 1000
            const speed = elapsed > 0 ? Math.round(downloaded / elapsed) : 0
            win?.webContents.send('update:status', {
              status: 'downloading',
              percent,
              bytesPerSecond: speed,
              transferred: downloaded,
              total: totalSize,
            })
          }
        }
      } finally {
        reader.releaseLock()
      }

      writer.end()
      await new Promise<void>((resolve, reject) => {
        writer.on('finish', resolve)
        writer.on('error', reject)
      })

      downloadedInstallerPath = filePath
      win?.webContents.send('update:status', {
        status: 'downloaded',
        version,
      })
      // 清理旧安装包
      cleanupOldInstallers(tmpDir, version)
      return
    } catch (e: any) {
      console.log(`[Update] ${label} error:`, e.message)
    }
  }

  // 全部失败
  win?.webContents.send('update:status', {
    status: 'error',
    error: '所有下载源均失败，请检查网络连接',
  })
}

function cleanupOldInstallers(tmpDir: string, _currentVersion: string) {
  try {
    const files = fs.readdirSync(tmpDir)
    for (const f of files) {
      if (f.startsWith('Videobox.Setup.') && f.endsWith('.exe')) {
        try { fs.unlinkSync(path.join(tmpDir, f)) } catch {}
      }
    }
  } catch {}
}

app.whenReady().then(async () => {
  try { await licenseManager.verifyOnline() } catch { /* 静默 */ }

  // 试用耗尽时弹窗提示
  const currentTier = licenseManager.getTier()
  if (currentTier === 'free' && licenseManager.isTrialExhausted()) {
    const promptedFile = path.join(app.getPath('userData'), '.trial_prompted')
    if (!fs.existsSync(promptedFile)) {
      fs.writeFileSync(promptedFile, '1', 'utf-8')
      dialog.showMessageBox({
        type: 'info',
        title: '试用已结束',
        message: '您的免费试用次数已用完',
        detail: '购买 Pro 买断版（99 元永久，2台设备）或订阅 Premium（19 元/月，3台设备）即可继续使用。',
        buttons: ['查看方案', '稍后再说'],
        defaultId: 0,
      }).then(({ response }) => {
        if (response === 0) {
          shell.openExternal('https://videobox-site.pages.dev?plan=pro')
        }
      })
    }
  }

  createWindow()
  // 最小菜单：保留 DevTools（F12 或 Ctrl+Shift+I）
  const isDev = !!VITE_DEV_SERVER_URL
  const appMenu = Menu.buildFromTemplate([
    {
      label: 'Videobox',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools', accelerator: 'F12' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' }
      ]
    }
  ])
  Menu.setApplicationMenu(appMenu)
  setupAutoUpdater()

  // 启动 10 秒后静默检测更新（使用 IPC handler，走代理）
  setTimeout(() => {
    ipcMain.emit('app:checkForUpdates-stub' as any)
  }, 10000)
  // 内部触发一次静默检查
  ;(async () => {
    await new Promise(r => setTimeout(r, 10000))
    try {
      const { net } = await import('electron')
      const res = await net.fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
        { headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Videobox/1.0' } }
      )
      if (res.ok) {
        const data = await res.json() as any
        const latestVersion = (data.tag_name || '').replace(/^v/, '')
        const currentVersion = app.getVersion()
        if (latestVersion && latestVersion !== currentVersion) {
          const githubUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v${latestVersion}/Videobox.Setup.${latestVersion}.exe`
          lastUpdateCheckResult = {
            hasUpdate: true, version: latestVersion, currentVersion,
            releaseNotes: data.body || '', releaseDate: data.published_at || '',
            downloadUrl: githubUrl,
            mirrorUrl: `https://ghfast.top/${githubUrl}`,
          }
          win?.webContents.send('update:status', { status: 'available', version: latestVersion, releaseNotes: data.body || '' })
        }
      }
    } catch {}
  })()
})

// 获取应用版本号
ipcMain.handle('app:getVersion', () => {
  return app.getVersion()
})

// 手动检测更新（带 5 分钟缓存防抖）
// 使用 Electron net.fetch 而不是 autoUpdater.checkForUpdates()，
// 因为 Chromium 网络栈走系统代理，公司网络环境下也能用
ipcMain.handle('app:checkForUpdates', async () => {
  const now = Date.now()
  if (now - lastUpdateCheckTime < UPDATE_CACHE_MS && lastUpdateCheckResult) {
    return lastUpdateCheckResult
  }
  lastUpdateCheckTime = now

  const currentVersion = app.getVersion()

  try {
    const { net } = await import('electron')
    const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`
    const res = await net.fetch(apiUrl, {
      headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Videobox-Updater/1.0' },
    })

    if (!res.ok) {
      throw new Error(`GitHub API 返回 HTTP ${res.status}`)
    }

    const data = await res.json() as any
    const latestVersion = (data.tag_name || '').replace(/^v/, '')
    const hasUpdate = latestVersion && latestVersion !== currentVersion

    if (!hasUpdate) {
      lastUpdateCheckResult = { hasUpdate: false, currentVersion }
      return lastUpdateCheckResult
    }

    const dlFilename = `Videobox.Setup.${latestVersion}.exe`
    const githubUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v${latestVersion}/${dlFilename}`
    lastUpdateCheckResult = {
      hasUpdate: true,
      version: latestVersion,
      currentVersion,
      releaseNotes: data.body || '',
      releaseDate: data.published_at || '',
      downloadUrl: githubUrl,
      mirrorUrl: `https://ghfast.top/${githubUrl}`,
    }

    // 触发镜像下载（不依赖 autoUpdater）
    downloadUpdateWithMirrors(latestVersion)

    return lastUpdateCheckResult
  } catch (error: any) {
    const errorMsg = error?.message || ''
    console.error('检测更新失败:', errorMsg)
    lastUpdateCheckResult = null
    return {
      hasUpdate: false,
      currentVersion,
      error: errorMsg.includes('fetch failed') || errorMsg.includes('ERR_')
        ? '网络连接失败，请检查代理设置或稍后重试'
        : (errorMsg || '检测更新失败，请检查网络连接'),
    }
  }
})

// 安装已下载的更新并重启
ipcMain.handle('app:installUpdate', async () => {
  // 优先使用镜像下载的安装包
  if (downloadedInstallerPath && fs.existsSync(downloadedInstallerPath)) {
    const { shell } = await import('electron')
    shell.openPath(downloadedInstallerPath)
    setTimeout(() => app.quit(), 2000)
    return
  }
  // 回退到 electron-updater
  autoUpdater.quitAndInstall()
})

// ==================== Clipboard / Dialog / Shell (moved to modules/) ====================
registerClipboard()
registerDialog()
registerShell()

// 解析视频信息
ipcMain.handle('ytdlp:parse', async (_event, ...args) => {
  const url = args[0] as string
  const cookiesFile = args[1] as string | undefined
  // 抖音链接：API 优先（无需浏览器），Puppeteer 兜底
  if (isDouyinUrl(url)) {
    try {
      return await parseDouyinWithAPI(url)
    } catch (e1: any) {
      console.log('[Douyin] API failed:', e1.message, '- trying Puppeteer fallback')
      try {
        return await parseDouyinWithPuppeteer(url)
      } catch (e2: any) {
        throw new Error('抖音解析失败：请确认 Chrome 浏览器已安装且链接有效。API: ' + e1.message + ' | Puppeteer: ' + e2.message)
      }
    }
  }
  // 如果是快手链接，使用 Puppeteer 解析
  if (isKuaishouUrl(url)) {
    try {
      const result = await parseKuaishouWithAPI(url)
      return result
    } catch (e: any) {
      try {
        const result = await parseKuaishouWithPuppeteer(url)
        return result
      } catch (e2: any) {
      }
    }
  }
  
  return new Promise(async (resolve, reject) => {
    const ytdlpPath = getYtDlpPath()
    const isYoutube = url.includes('youtube.com') || url.includes('youtu.be')
    const isBilibili = url.includes('bilibili.com') || url.includes('b23.tv')

    const args: string[] = [
      '--no-playlist',
      '--no-check-certificates',
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      '--add-header', 'Accept-Language:en-US,en;q=0.9',
      '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    ]

    // YouTube 使用 --print 获取完整格式列表（含 m3u8 多音轨），其他站点用 --dump-json
    if (isYoutube) {
      args.unshift('--print', '%()j')
    } else {
      args.unshift('--dump-json')
    }

    // YouTube 需要 JS 运行时（优先使用 Node.js）
    if (isYoutube) {
      const runtimeCheck = checkJsRuntime()
      if (!runtimeCheck.available) {
        await promptNodeDownload()
        reject(new Error('需要安装 Node.js 运行时才能解析 YouTube 视频'))
        return
      }

      const runtimePath = runtimeCheck.path
      if (runtimePath) {
        const isNode = runtimePath.includes('node')
        const runtimeName = isNode ? 'node' : 'deno'
        args.push('--js-runtimes', `${runtimeName}:${runtimePath}`)
      }

      if (cookiesFile && fs.existsSync(cookiesFile)) {
        args.push('--cookies', cookiesFile)
      } else {
        const browser = getAvailableBrowser()
        if (browser) args.push('--cookies-from-browser', browser)
      }
    }

    // B站也需要 cookies 避免 412 错误
    if (isBilibili) {
      if (cookiesFile && fs.existsSync(cookiesFile)) {
        args.push('--cookies', cookiesFile)
      } else {
        const browser = getAvailableBrowser()
        if (browser) args.push('--cookies-from-browser', browser)
      }
    }
    
    args.push(url)
    
    // 设置工作目录为 yt-dlp 所在目录
    const cwd = path.dirname(ytdlpPath)
    const child = spawn(ytdlpPath, args, { cwd })
    let output = ''
    let errorOutput = ''
    
    child.stdout?.on('data', (data: Buffer) => {
      output += data.toString()
    })
    
    child.stderr?.on('data', (data: Buffer) => {
      errorOutput += data.toString()
    })
    
    child.on('close', (code: number | null) => {
      if (code !== 0) {
        reject(new Error(errorOutput || '解析失败'))
        return
      }
      
      try {
        const info = JSON.parse(output)

        // 返回所有视频格式（B站/Instagram可能音视频分离，yt-dlp会自动合并）
        let formats = (info.formats || [])
          .filter((f: any) => {
            // 只要有视频就可以（音频可以单独下载后合并）
            const hasVideo = f.vcodec !== 'none' && f.vcodec !== null && f.vcodec !== undefined && f.vcodec !== ''
            // 接受所有常见视频格式
            const isVideoFormat = f.height && f.height > 0
            // 排除 m3u8 格式（多音轨用，不显示在视频格式列表中）
            const isM3u8 = f.protocol && f.protocol.includes('m3u8')
            return hasVideo && isVideoFormat && !isM3u8
          })
          .map((f: any) => {
            // 获取文件大小：优先使用 filesize，其次是 filesize_approx
            // 对于 YouTube，还可以尝试通过码率和时长估算
            let filesize = f.filesize || f.filesize_approx || 0
            
            // 如果没有文件大小但有码率和视频时长，进行估算
            if (!filesize && f.tbr && info.duration) {
              // tbr (kbps) * duration (seconds) / 8 = bytes
              filesize = Math.floor((f.tbr * 1000 * info.duration) / 8)
            }
            
            return {
              formatId: f.format_id || '',
              quality: f.quality_label || f.resolution || f.format_note || `${f.height}p`,
              ext: f.ext || f.video_ext || 'mp4',
              filesize: filesize,
              width: f.width || 0,
              height: f.height || 0,
              fps: f.fps || 0,
              hasAudio: f.acodec && f.acodec !== 'none',
            }
          })
          .filter((f: any) => f.quality && f.quality !== 'undefinedp')
          // 添加码率信息用于排序和去重
          .map((f: any) => ({
            ...f,
            // 使用原始格式数据中的码率信息
            _tbr: info.formats ? info.formats.find((orig: any) => orig.format_id === f.formatId)?.tbr || 0 : 0,
            _vbr: info.formats ? info.formats.find((orig: any) => orig.format_id === f.formatId)?.vbr || 0 : 0,
          }))
          // 先按分辨率排序，再按码率排序，优先选择包含音频的格式
          .sort((a: any, b: any) => {
            const heightDiff = (b.height || 0) - (a.height || 0)
            if (heightDiff !== 0) return heightDiff
            // 相同分辨率优先选择包含音频的
            if (a.hasAudio && !b.hasAudio) return -1
            if (!a.hasAudio && b.hasAudio) return 1
            // 都包含音频或都不包含，按码率排序
            return (b._tbr || b._vbr || 0) - (a._tbr || a._vbr || 0)
          })
          // 去重：相同分辨率只保留码率最高的
          .filter((f: any, index: number, self: any[]) => {
            const firstIndex = self.findIndex((t: any) => t.quality === f.quality)
            if (index === firstIndex) return true
            // 如果已经有相同分辨率的，保留码率更高的
            const existing = self[firstIndex]
            const fBitrate = f._tbr || f._vbr || 0
            const eBitrate = existing._tbr || existing._vbr || 0
            if (fBitrate > eBitrate) {
              // 替换掉已存在的
              self[firstIndex] = { ...existing, _remove: true }
              return true
            }
            return false
          })
          .filter((f: any) => !f._remove)
          // 清理临时字段
          .map((f: any) => {
            const { _tbr, _vbr, _remove, ...rest } = f
            return rest
          })
          || []
        
        // 提取音频轨道信息（YouTube多音轨）
        const audioTracks: any[] = []
        if (isYoutube && info.formats) {
          const langNames: Record<string, string> = {
            'ja': '日本語', 'en': 'English', 'zh': '中文(原始)', 'zh-Hans': '中文(简体)',
            'zh-Hant': '中文(繁體)', 'zh-CN': '中文(简体)', 'zh-TW': '中文(繁體)',
            'zh-HK': '中文(香港)', 'ko': '한국어', 'fr': 'Français', 'de': 'Deutsch',
            'es': 'Español', 'pt': 'Português', 'ru': 'Русский', 'ar': 'العربية',
            'hi': 'हिन्दी', 'th': 'ไทย', 'vi': 'Tiếng Việt', 'id': 'Bahasa Indonesia',
            'it': 'Italiano', 'nl': 'Nederlands', 'pl': 'Polski', 'tr': 'Türkçe',
          }

          // 从 m3u8 格式中提取多音轨（m3u8 格式包含不同配音语言的视频+音频流）
          const m3u8BestFormat: Record<string, { formatId: string; lang: string; height: number }> = {}
          const m3u8Formats = info.formats.filter((f: any) =>
            f.protocol && f.protocol.includes('m3u8') && f.language
          )
          for (const f of m3u8Formats) {
            const lang = f.language
            if (!lang) continue
            const height = f.height || 0
            if (!m3u8BestFormat[lang] || height > m3u8BestFormat[lang].height) {
              m3u8BestFormat[lang] = { formatId: f.format_id, lang, height }
            }
          }

          if (Object.keys(m3u8BestFormat).length > 1) {
            // 有多个 m3u8 音轨语言，使用 m3u8 格式
            const seenLangs = new Set<string>()
            for (const [lang, best] of Object.entries(m3u8BestFormat)) {
              const baseLang = lang.split('-')[0]
              const key = baseLang
              if (!seenLangs.has(key)) {
                seenLangs.add(key)
              }
              audioTracks.push({
                id: lang,
                name: langNames[lang] || lang.toUpperCase(),
                language: lang,
                formatId: best.formatId,
              })
            }
          } else {
            // 没有 m3u8 多音轨，回退到音频格式提取
            const langBestFormat: Record<string, { formatId: string; lang: string; abr: number }> = {}
            const audioFormats = info.formats.filter((f: any) => f.vcodec === 'none' && f.acodec && f.acodec !== 'none')
            for (const f of audioFormats) {
              const lang = f.language
              if (!lang) continue
              const abr = f.abr || 0
              if (!langBestFormat[lang] || abr > langBestFormat[lang].abr) {
                langBestFormat[lang] = { formatId: f.format_id, lang, abr }
              }
            }
            for (const [lang, best] of Object.entries(langBestFormat)) {
              audioTracks.push({
                id: lang,
                name: langNames[lang] || lang.toUpperCase(),
                language: lang,
                formatId: best.formatId,
              })
            }
          }

          // 也检查 audio_tracks 字段补充名称
          if (info.audio_tracks && Array.isArray(info.audio_tracks)) {
            for (const at of info.audio_tracks) {
              const existing = audioTracks.find(t => t.language === at.language)
              if (existing && at.name) {
                existing.name = at.name
              }
            }
          }
          console.log('[audioTracks] 发现', audioTracks.length, '个音轨:', audioTracks.map(t => `${t.name}(${t.language}, fmt=${t.formatId})`).join(', '))
        }
        
        // 提取字幕信息
        // subtitles 格式: { 'en': [{url, name, ext}] }
        const subtitles = info.subtitles || {}
        const subtitleList = Object.keys(subtitles).map((lang: string) => {
          const subData = subtitles[lang]
          const firstSub = Array.isArray(subData) ? subData[0] : subData
          return {
            language: lang || '',
            name: firstSub?.name || lang || '',
            url: firstSub?.url || '',
          }
        })
        
        // 提取纯音频格式（去重，只保留不同码率的）
        const audioFormats = isYoutube && info.formats ? info.formats
          .filter((f: any) => {
            const isAudioOnly = f.vcodec === 'none' && f.acodec && f.acodec !== 'none'
            return isAudioOnly
          })
          .map((f: any) => ({
            formatId: f.format_id || '',
            quality: f.abr ? `${f.abr}kbps` : (f.format_note || '音频'),
            ext: f.ext || f.audio_ext || 'm4a',
            filesize: f.filesize || f.filesize_approx || 0,
            abr: f.abr || 0,
            acodec: f.acodec || '',
          }))
          // 去重：相同码率只保留一个
          .filter((f: any, index: number, self: any[]) => {
            const firstIndex = self.findIndex((t: any) => t.abr === f.abr)
            return index === firstIndex
          })
          .sort((a: any, b: any) => (b.abr || 0) - (a.abr || 0))
          // 只保留前6个最高质量的音频格式
          .slice(0, 6)
        : []
        
        resolve({
          id: info.id || '',
          title: info.title || '未知标题',
          description: info.description || '',
          thumbnail: info.thumbnail || '',
          duration: info.duration || 0,
          uploader: info.uploader || '',
          webpageUrl: info.webpage_url || url,
          formats: formats || [],
          audioTracks: audioTracks || [],
          subtitles: subtitleList || [],
          audioFormats: audioFormats || [],
          isYoutube: isYoutube === true,
        })
      } catch (e: any) {
        console.error('解析响应失败:', e)
        reject(new Error('解析响应失败: ' + (e.message || '未知错误')))
      }
    })
  })
})

// 直接下载文件（用于抖音等直接URL）
async function downloadDirectFile(url: string, outputPath: string, taskId: string): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://www.douyin.com/'
        }
      })

      if (!response.ok) {
        reject(new Error(`HTTP ${response.status}: ${response.statusText}`))
        return
      }

      const totalSize = parseInt(response.headers.get('content-length') || '0')
      const writer = fs.createWriteStream(outputPath)

      let downloaded = 0
      let lastProgressUpdate = 0
      const reader = response.body?.getReader()

      if (!reader) {
        reject(new Error('无法读取响应流'))
        return
      }

      // 发送开始下载事件
      sendDownloadProgress({
        taskId: taskId,
        url: url,
        percent: 0,
        status: 'downloading',
        speed: '0 MB/s',
        eta: '计算中...'
      })

      const startTime = Date.now()

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          writer.write(Buffer.from(value))
          downloaded += value.length

          // 计算进度 - 每下载 100KB 或每 500ms 更新一次
          const now = Date.now()
          if (totalSize > 0 && (downloaded - lastProgressUpdate > 102400 || now - startTime > 500)) {
            lastProgressUpdate = downloaded
            const percent = (downloaded / totalSize) * 100
            const elapsed = (now - startTime) / 1000
            const speed = elapsed > 0 ? (downloaded / 1024 / 1024 / elapsed).toFixed(2) : '0'
            const remaining = downloaded > 0 ? (totalSize - downloaded) / (downloaded / elapsed) : 0
            const eta = Math.ceil(remaining)

            sendDownloadProgress({
              taskId: taskId,
              url: url,
              percent: percent,
              status: 'downloading',
              totalSize: `${(totalSize / 1024 / 1024).toFixed(1)} MB`,
              speed: `${speed} MB/s`,
              eta: `${eta}s`
            })
          }
        }

        // 关闭写入流
        writer.end()

        // 等待写入完成
        await new Promise((resolveWriter, rejectWriter) => {
          writer.on('finish', () => {
            sendDownloadProgress({
              taskId: taskId,
              url: url,
              percent: 100,
              status: 'completed'
            })
            resolveWriter(undefined)
          })

          writer.on('error', (err) => {
            rejectWriter(err)
          })
        })

        resolve()
      } catch (readError) {
        writer.destroy()
        reject(readError)
      }
    } catch (e) {
      reject(e)
    }
  })
}

// 下载视频（使用最佳格式，自动合并音视频）
ipcMain.handle('ytdlp:download', async (_event, options: {
  url: string
  formatId: string
  outputDir: string
  filename?: string
  taskId: string
  directUrl?: string
  cookiesFile?: string
  downloadMode?: 'video' | 'audio' | 'subtitle'
  audioTrack?: any
  subtitles?: string[]
  filenameTemplate?: string
}) => {
  // 许可证检查
  if (!licenseManager.canDownloadToday()) {
    const tier = licenseManager.getTier()
    if (tier === 'trial') {
      throw new Error('试用次数已用完（共5次），请购买 Pro 或 Premium 继续使用')
    }
    throw new Error('今日免费下载次数已用完（3次/天），请升级 Pro 或 Premium')
  }

  return new Promise(async (resolve, reject) => {
    const outputDir = ensureDownloadDir(options.outputDir)
    
    // 如果有直接下载链接（抖音），使用直接下载
    if (options.directUrl) {
      const filename = options.filename || `video_${Date.now()}.mp4`
      const outputPath = path.join(outputDir, filename)

      try {
        await downloadDirectFile(options.directUrl, outputPath, options.taskId)
        resolve({ filePath: outputPath })
        return
      } catch (e: any) {
        // 如果直接下载失败，回退到 yt-dlp
      }
    }
    
    const ytdlpPath = getYtDlpPath()
    const isYoutube = options.url.includes('youtube.com') || options.url.includes('youtu.be')
    const isBilibili = options.url.includes('bilibili.com') || options.url.includes('b23.tv')

    const userTemplate = options.filenameTemplate || '%(title)s'
    const outputTemplate = path.join(outputDir, `${userTemplate}.%(ext)s`)

    // 判断下载模式
    const isAudioOnly = options.downloadMode === 'audio'
    const isSubtitleOnly = options.downloadMode === 'subtitle'
    
    // 构建格式选择器
    let formatSelector: string
    if (isSubtitleOnly) {
      formatSelector = 'best'
    } else if (isAudioOnly) {
      formatSelector = options.formatId
    } else {
      if (options.audioTrack && options.audioTrack.formatId && options.audioTrack.formatId.includes('-')) {
        formatSelector = options.audioTrack.formatId
        console.log('[audioTrack] m3u8 format selector:', formatSelector)
      } else if (options.audioTrack && options.audioTrack.language) {
        formatSelector = `${options.formatId}+bestaudio[language^=${options.audioTrack.language}]/bestaudio/best`
        console.log('[audioTrack] fallback format selector:', formatSelector)
      } else {
        formatSelector = `${options.formatId}+bestaudio[ext=m4a]/bestaudio/best`
      }
    }

    const args: string[] = [
      '-o', outputTemplate,
      '--newline',
      '--no-playlist',
      '--encoding', 'utf-8',
    ]
    
    // 纯字幕下载模式不需要 -f 参数
    if (!isSubtitleOnly) {
      args.unshift('-f', formatSelector)
    }
    
    // 纯字幕下载模式
    if (isSubtitleOnly) {
      args.push('--skip-download')
      args.push('--write-subs')
      args.push('--sub-langs', options.subtitles?.join(',') || 'all')
      args.push('--convert-subs', 'srt')
    } else if (isAudioOnly) {
      // 纯音频下载选项
      args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0')
    } else {
      args.push('--merge-output-format', 'mp4')
    }
    
    args.push('--ffmpeg-location', getFfmpegPath())
    
    // 纯音频下载添加元数据
    if (isAudioOnly) {
      args.push('--postprocessor-args', 'FFmpegMetadata:-write_id3v1 1')
    }
    
    // 字幕下载选项（与视频一起下载时）
    if (!isSubtitleOnly && options.subtitles && options.subtitles.length > 0) {
      args.push('--write-subs')
      args.push('--sub-langs', options.subtitles.join(','))
      args.push('--convert-subs', 'srt')
    }

    // YouTube 需要 JS 运行时（优先使用 Node.js）
    if (isYoutube) {
      const runtimeCheck = checkJsRuntime()
      if (!runtimeCheck.available) {
        await promptNodeDownload()
        reject(new Error('需要安装 Node.js 运行时才能下载 YouTube 视频'))
        return
      }

      const runtimePath = runtimeCheck.path
      if (runtimePath) {
        const isNode = runtimePath.includes('node')
        const runtimeName = isNode ? 'node' : 'deno'
        args.push('--js-runtimes', `${runtimeName}:${runtimePath}`)
      }

      if (options.cookiesFile && fs.existsSync(options.cookiesFile)) {
        args.push('--cookies', options.cookiesFile)
      } else {
        const browser = getAvailableBrowser()
        if (browser) args.push('--cookies-from-browser', browser)
      }
    }

    // B站也需要 cookies 避免 412 错误
    if (isBilibili) {
      if (options.cookiesFile && fs.existsSync(options.cookiesFile)) {
        args.push('--cookies', options.cookiesFile)
      } else {
        const browser = getAvailableBrowser()
        if (browser) args.push('--cookies-from-browser', browser)
      }
    }
    
    args.push(options.url)
    
    // 设置工作目录为 yt-dlp 所在目录
    const cwd = path.dirname(ytdlpPath)
    const child = spawn(ytdlpPath, args, { cwd })
    let downloadedFile = ''
    let lastProgress = 0
    let hasStarted = false
    let isPaused = false
    let errorOutput = ''
    
    // 存储下载任务
    activeDownloads.set(options.taskId, {
      child,
      options,
      status: 'downloading',
      setPaused: (value: boolean) => { isPaused = value }
    })
    
    // 立即发送开始下载事件
    sendDownloadProgress({
      taskId: options.taskId,
      url: options.url,
      percent: 0,
      status: 'downloading',
      speed: '0 MiB/s',
      eta: '00:00'
    })
    
    child.stdout.on('data', (data) => {
      const line = data.toString()
      
      // 解析进度 - 匹配多种格式
      const progressPatterns = [
        // YouTube 格式: [download]  22.5% of ~ 304.50MiB at    1.38MiB/s ETA 02:45 (frag 55/249)
        /\[download\]\s+(\d+\.?\d*)%\s+of\s+~?\s*(\d+\.?\d*\w?)\s+at\s+([\d.]+\w?\/s)\s+ETA\s+(\d+:\d+)/,
        // 其他格式
        /\[download\]\s+(\d+\.?\d*)%\s+of\s+(\d+\.?\d*\w?)\s+at\s+([\d.]+\w?\/s)\s+ETA\s+(\d+:\d+)/,
        // 简单百分比
        /\[download\]\s+(\d+\.?\d*)%/,
      ]
      
      for (const pattern of progressPatterns) {
        const match = line.match(pattern)
        if (match) {
          const percent = parseFloat(match[1])
          // 允许进度更新（YouTube 进度可能会波动）
          if (Math.abs(percent - lastProgress) > 0.1 || !hasStarted) {
            lastProgress = percent
            hasStarted = true
            sendDownloadProgress({
              taskId: options.taskId,
              url: options.url,
              percent: percent,
              totalSize: match[2] || '',
              speed: match[3] || '',
              eta: match[4] || '',
              status: 'downloading'
            })
          }
          break
        }
      }
      
      // 获取下载完成的文件路径
      const destMatch = line.match(/\[download\] Destination: (.+)/)
      if (destMatch) {
        const rawPath = destMatch[1].trim()
        // 转换为绝对路径并规范化
        downloadedFile = path.resolve(rawPath.replace(/\//g, '\\'))
      }
      
      // 已存在文件
      const existsMatch = line.match(/\[download\] (.+) has already been downloaded/)
      if (existsMatch) {
        const rawPath = existsMatch[1].trim()
        downloadedFile = path.resolve(rawPath.replace(/\//g, '\\'))
      }
      
      // FFmpeg 合并中
      if (line.includes('[Merger]') || line.includes('Merging formats')) {
        sendDownloadProgress({
          taskId: options.taskId,
          url: options.url,
          percent: 99,
          status: 'merging',
          message: '正在合并音视频...'
        })
      }
      
      // 获取合并后的文件路径（Merger 输出了合并后的文件）
      const mergeMatch = line.match(/\[Merger\] Merging formats into "(.+)"/)
      if (mergeMatch) {
        const rawPath = mergeMatch[1].trim()
        downloadedFile = path.resolve(rawPath.replace(/\//g, '\\'))
      }
    })
    
    child.stderr.on('data', (data) => {
      const line = data.toString()
      errorOutput += line
      
      // 某些进度信息在 stderr 中
      const percentMatch = line.match(/(\d+\.?\d*)%/)
      if (percentMatch) {
        const percent = parseFloat(percentMatch[1])
        if (percent > lastProgress || !hasStarted) {
          lastProgress = percent
          hasStarted = true
          sendDownloadProgress({
            taskId: options.taskId,
            url: options.url,
            percent: percent,
            status: 'downloading'
          })
        }
      }
    })
    
    child.on('close', (code) => {
      // 清理任务
      activeDownloads.delete(options.taskId)
      
      // 如果是暂停导致的终止，不报错
      if (isPaused) {
        resolve({ filePath: downloadedFile, paused: true })
        return
      }
      
      if (code !== 0) {
        // 提取最后一行非空错误信息
        const errorLines = errorOutput.split('\n').filter((l: string) => l.trim())
        const lastError = errorLines.length > 0 ? errorLines[errorLines.length - 1].trim() : ''
        // 检查是否是 HTTP 429 错误
        if (lastError.includes('429') || lastError.includes('Too Many Requests')) {
          reject(new Error('YouTube 请求过于频繁，请等待几分钟后重试 (HTTP 429)'))
        } else {
          reject(new Error(lastError || '下载失败'))
        }
        return
      }
      
      // 字幕下载模式：构造字幕文件路径（yt-dlp 先写 .vtt 再转 .srt）
      if (isSubtitleOnly && !downloadedFile) {
        const firstLang = options.subtitles?.[0] || 'en'
        const basePath = outputTemplate.replace(/\.%(ext)s/, '')
        // 尝试 .srt（转换后）或 .vtt（原始）
        const srtPath = `${basePath}.${firstLang}.srt`
        const vttPath = `${basePath}.${firstLang}.vtt`
        if (fs.existsSync(srtPath)) {
          downloadedFile = srtPath
        } else if (fs.existsSync(vttPath)) {
          downloadedFile = vttPath
        } else {
          downloadedFile = srtPath
        }
      }
      
      // 如果没有获取到合并后的路径，手动构造 mp4 路径
      if (downloadedFile && downloadedFile.endsWith('.m4a')) {
        downloadedFile = downloadedFile.replace(/\.m4a$/, '.mp4')
      }
      
      // 清理临时文件
      if (downloadedFile) {
        const basePath = downloadedFile.replace(/\.[^.]+$/, '')
        const tempFiles = [
          `${basePath}.part`,
          `${basePath}.part-Frag*`,
          `${basePath}.ytdl`,
          `${basePath}.f*.part`,
          `${basePath}.f*.ytdl`,
        ]
        
        for (const pattern of tempFiles) {
          try {
            // 处理通配符
            if (pattern.includes('*')) {
              const dir = path.dirname(pattern)
              const baseName = path.basename(pattern).replace(/\*/g, '.*')
              const regex = new RegExp(baseName.replace(/\./g, '\\.'))
              
              if (fs.existsSync(dir)) {
                const files = fs.readdirSync(dir)
                for (const file of files) {
                  if (regex.test(file)) {
                    const fullPath = path.join(dir, file)
                    fs.unlinkSync(fullPath)
                  }
                }
              }
            } else if (fs.existsSync(pattern)) {
              fs.unlinkSync(pattern)
            }
          } catch (e) {
            // 忽略清理错误
          }
        }
      }
      
      // 发送完成事件
      sendDownloadProgress({
        taskId: options.taskId,
        url: options.url,
        percent: 100,
        status: 'completed'
      })
      
      // 记录下载用量
      licenseManager.recordDownload()

      resolve({
        success: true,
        filePath: downloadedFile,
      })
    })
    
    child.on('error', (err) => {
      reject(err)
    })
  })
})

// ==================== History (moved to modules/history) ====================
registerHistory()

// 暂停下载
ipcMain.handle('ytdlp:pauseDownload', async (_, taskId: string) => {
  const download = activeDownloads.get(taskId)
  if (download && download.child) {
    // 标记为暂停状态
    if (download.setPaused) {
      download.setPaused(true)
    }
    
    // Windows 上需要强制终止进程树
    const pid = download.child.pid
    
    // 先尝试正常终止
    download.child.kill()
    
    // Windows 上使用 taskkill 终止进程树
    if (process.platform === 'win32' && pid) {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'])
    }

    return true
  }
  return false
})

// 获取带 referer 的图片（用于B站等需要referer的图片）
const licenseManager = new LicenseManager(app.getPath('userData'))

ipcMain.handle('asr:process', async (_event: any, filePath: string, engine: string, exportFormat: string) => {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error('文件不存在: ' + filePath)
    }
    if (!licenseManager.canProcessAsrToday()) {
      const tier = licenseManager.getTier()
      if (tier === 'trial') throw new Error('试用次数已用完，请升级 Pro 或 Premium')
      throw new Error('今日免费次数已用完，请升级 Pro 或 Premium')
    }
    const availableEngines = licenseManager.getAvailableAsrEngines()
    if (!availableEngines.includes(engine)) {
      throw new Error('该引擎需要 Pro 或 Premium 版本')
    }
    if (!isAudioFile(filePath) && !isVideoFile(filePath)) {
      throw new Error('不支持的文件格式，请使用音频或视频文件')
    }
    console.log('[ASR IPC] Processing:', filePath, engine, exportFormat)
    const result = await processAsr(filePath, engine as any, exportFormat)
    licenseManager.recordAsrProcessing()
    console.log('[ASR IPC] Success:', result.savePath)
    return result
  } catch (e: any) {
    console.error('[ASR IPC] Raw error:', JSON.stringify(e, Object.getOwnPropertyNames(e)))
    console.error('[ASR IPC] Error type:', typeof e, 'name:', e?.name, 'message:', e?.message)
    const msg = e?.message || e?.name || String(e) || 'ASR 处理失败（未知错误）'
    throw new Error(msg)
  }
})

ipcMain.handle('asr:getEngines', () => {
  const available = licenseManager.getAvailableAsrEngines()
  return ASR_ENGINES.map(e => ({ ...e, locked: !available.includes(e.name) }))
})

// URL 字幕提取: 先尝试提取已有字幕，失败则下载音频 + ASR
ipcMain.handle('asr:processUrl', async (_event: any, url: string, engine: string, exportFormat: string) => {
  try {
    // 许可证检查（与 asr:process 一致）
    if (!licenseManager.canProcessAsrToday()) {
      const tier = licenseManager.getTier()
      if (tier === 'trial') throw new Error('试用次数已用完，请升级 Pro 或 Premium')
      throw new Error('今日免费次数已用完，请升级 Pro 或 Premium')
    }
    const availableEngines = licenseManager.getAvailableAsrEngines()
    if (!availableEngines.includes(engine)) {
      throw new Error('该引擎需要 Pro 或 Premium 版本')
    }

    const tmpDir = path.join(os.tmpdir(), 'videobox_asr')
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })

    const ytdlpPath = getYtDlpPath()
    const baseName = `sub_${Date.now()}`
    const outTemplate = path.join(tmpDir, baseName)

    // 步骤1: 尝试提取已有字幕
    let subExtracted = false
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(ytdlpPath, [
          '--skip-download', '--write-subs', '--write-auto-subs',
          '--sub-langs', 'all', '--convert-subs', 'srt',
          '--no-warnings', '-o', outTemplate, '--no-playlist',
          '--ffmpeg-location', getFfmpegPath(), url
        ], { cwd: path.dirname(ytdlpPath) })
        let stderr = ''
        child.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })
        child.on('close', (code) => {
          if (code === 0) resolve()
          else reject(new Error(stderr.slice(-200) || 'no subs'))
        })
        child.on('error', reject)
      })
      subExtracted = true
    } catch { /* 无字幕，跳转到下载+ASR */ }

    let resultText = ''
    let savePath = ''

    if (subExtracted) {
      const files = fs.readdirSync(tmpDir).filter(f => f.startsWith(baseName) && (f.endsWith('.srt') || f.endsWith('.vtt')))
      if (files.length > 0) {
        const subFile = path.join(tmpDir, files[0])
        resultText = fs.readFileSync(subFile, 'utf-8')
        const downloadDir = path.join(os.homedir(), 'Downloads', 'Videobox')
        if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true })
        savePath = path.join(downloadDir, files[0])
        fs.copyFileSync(subFile, savePath)
        files.forEach(f => { try { fs.unlinkSync(path.join(tmpDir, f)) } catch {} })
      }
    }

    // 步骤2: 无字幕 → 下载音频 + ASR
    if (!resultText) {
      console.log('[Subtitle] No subs found, downloading audio for ASR...')
      const audioFile = path.join(tmpDir, `audio_${Date.now()}.mp3`)

      // 抖音/快手用 Puppeteer 获取直链
      const isDouyin = url.includes('douyin.com')
      const isKuaishou = url.includes('kuaishou.com')
      let directUrl = ''

      if (isDouyin) {
        try { const info = await parseDouyinWithAPI(url); directUrl = info.formats[0]?.url } catch {}
        if (!directUrl) {
          try { const info = await parseDouyinWithPuppeteer(url); directUrl = info.formats[0]?.url } catch {}
        }
      }
      if (isKuaishou) {
        try { const info = await parseKuaishouWithAPI(url); directUrl = info.formats[0]?.url } catch {}
        if (!directUrl) {
          try { const info = await parseKuaishouWithPuppeteer(url); directUrl = info.formats[0]?.url } catch {}
        }
      }

      if (directUrl) {
        // 直链下载 → processAsr 会自动用 ffmpeg 提取音频
        await downloadDirectFile(directUrl, audioFile, `asr_${Date.now()}`)
        const asrResult = await processAsr(audioFile, engine as any, exportFormat)
        resultText = asrResult.resultText
        savePath = asrResult.savePath
        try { fs.unlinkSync(audioFile) } catch {}
      } else {
        // yt-dlp 通用下载
        await new Promise<void>((resolve, reject) => {
          const child = spawn(ytdlpPath, [
            '-f', 'bestaudio[ext=m4a]/bestaudio/best',
            '-o', audioFile, '--extract-audio', '--audio-format', 'mp3',
            '--audio-quality', '0', '--ffmpeg-location', getFfmpegPath(),
            '--no-playlist', '--no-warnings', url
          ], { cwd: path.dirname(ytdlpPath) })
          child.on('close', (code) => code === 0 ? resolve() : reject(new Error('音频下载失败')))
          child.on('error', reject)
        })
        const asrResult = await processAsr(audioFile, engine as any, exportFormat)
        resultText = asrResult.resultText
        savePath = asrResult.savePath
        try { fs.unlinkSync(audioFile) } catch {}
      }
    }

    licenseManager.recordAsrProcessing()
    return { savePath, resultText }
  } catch (e: any) {
    throw new Error(e.message || '文案提取失败')
  }
})

ipcMain.handle('asr:getCache', () => {
  const cacheFile = path.join(os.tmpdir(), 'bk_asr', 'asr_cache.json')
  if (fs.existsSync(cacheFile)) {
    try {
      const stat = fs.statSync(cacheFile)
      return { exists: true, size: stat.size, sizeFormatted: (stat.size / 1024).toFixed(1) + ' KB' }
    } catch { return { exists: false } }
  }
  return { exists: false }
})

ipcMain.handle('license:getStatus', () => {
  const tier = licenseManager.getTier()
  return {
    tier,
    trialRemaining: tier === 'trial' ? licenseManager.getRemainingTrial() : null,
    trialExhausted: licenseManager.isTrialExhausted(),
    licenseInfo: licenseManager.getLicenseInfo(),
    renewalStatus: licenseManager.getRenewalStatus(),
    limits: {
      dailyDownloads: licenseManager.getDailyLimit(),
      exportFormats: licenseManager.getExportFormats(),
      engines: licenseManager.getAvailableAsrEngines(),
      canBatch: licenseManager.canBatchProcess(),
      canFullQuality: licenseManager.canDownloadFullQuality()
    }
  }
})

ipcMain.handle('license:activate', async (_event: any, key: string, deviceLabel?: string) => {
  return licenseManager.activate(key, deviceLabel)
})

ipcMain.handle('license:getTrialInfo', () => licenseManager.getTrialInfo())
ipcMain.handle('license:getDailyUsage', () => licenseManager.getDailyUsage())
ipcMain.handle('license:canDownload', () => licenseManager.canDownloadToday())
ipcMain.handle('license:canProcessAsr', () => licenseManager.canProcessAsrToday())
ipcMain.handle('license:getDevices', () => licenseManager.getDevices())
ipcMain.handle('license:deactivateDevice', async (_event: any, machineId: string) => {
  return licenseManager.deactivateDevice(machineId)
})
ipcMain.handle('license:getMachineId', () => LicenseManager.getCurrentMachineId())

// ==================== Copywriting IPC Handlers ====================

// AI 配置文件路径
const aiConfigFile = path.join(app.getPath('userData'), 'ai_config.json')

function loadAiConfig(): AIConfig {
  try {
    if (fs.existsSync(aiConfigFile)) {
      const data = fs.readFileSync(aiConfigFile, 'utf8')
      const parsed = JSON.parse(data)
      // 迁移：修复旧版本 baseUrl 已包含 /v1 导致重复拼接的问题
      if (parsed.baseUrl && typeof parsed.baseUrl === 'string') {
        parsed.baseUrl = parsed.baseUrl.replace(/\/v1\/?$/, '')
      }
      return { ...DEFAULT_AI_CONFIG, ...parsed }
    }
  } catch {}
  return { ...DEFAULT_AI_CONFIG }
}

function saveAiConfig(config: Partial<AIConfig>): void {
  try {
    const current = loadAiConfig()
    const merged = { ...current, ...config }
    fs.writeFileSync(aiConfigFile, JSON.stringify(merged, null, 2), 'utf8')
  } catch {}
}
ipcMain.handle('copywriting:getConfig', async () => {
  const config = loadAiConfig()
  // 脱敏 API Key
  const maskedKey = config.apiKey
    ? config.apiKey.slice(0, 4) + '***' + config.apiKey.slice(-4)
    : ''
  return {
    provider: config.provider,
    apiKey: maskedKey,
    hasKey: !!config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
    maxTokens: config.maxTokens,
    timeout: config.timeout,
  }
})

ipcMain.handle('copywriting:saveConfig', async (_event: any, config: Partial<AIConfig>) => {
  saveAiConfig(config)
  return { success: true }
})

ipcMain.handle('copywriting:testConnection', async (_event: any, config: AIConfig) => {
  try {
    await chat(
      [{ role: 'user', content: 'Hi' }],
      { ...config, maxTokens: 10, timeout: 15000, retry: 0 },
      0
    )
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message || '连接失败' }
  }
})

ipcMain.handle('copywriting:rewrite', async (_event: any, input: { originalCopy: string; productInfo?: string; preferredDirection?: string; extraRequirements?: string }) => {
  debugLog('REWRITE', '=== 文案改写 IPC 开始 ===', { inputLength: input.originalCopy?.length })

  // 许可证检查
  const tier = licenseManager.getTier()
  debugLog('REWRITE', '许可证等级', { tier })
  if (tier === 'free') {
    const usage = licenseManager.getDailyUsage()
    const copywritingUses = usage.copywritingUses || 0
    debugLog('REWRITE', '免费用户用量', { copywritingUses, limit: FREE_DAILY_COPYWRITING_LIMIT })
    if (copywritingUses >= FREE_DAILY_COPYWRITING_LIMIT) {
      throw new Error(`DAILY_LIMIT:今日免费改写次数已用完（${FREE_DAILY_COPYWRITING_LIMIT}次/天），请升级 Pro 或 Premium`)
    }
  }
  if (tier === 'trial') {
    const remaining = licenseManager.getRemainingTrial()
    debugLog('REWRITE', '试用剩余', remaining)
    if ((remaining as any).copywriting !== undefined && (remaining as any).copywriting <= 0) {
      throw new Error('TRIAL_EXHAUSTED:试用改写次数已用完，请购买 Pro 或 Premium')
    }
  }

  const config = loadAiConfig()
  debugLog('REWRITE', 'AI 配置', { provider: config.provider, hasKey: !!config.apiKey, baseUrl: config.baseUrl, model: config.model })
  if (!config.apiKey && config.provider !== 'ollama') {
    throw new Error('请先在设置中配置 AI API Key')
  }

  // Ollama: 检查连通性，若未运行则尝试自动启动
  if (config.provider === 'ollama') {
    debugLog('REWRITE', '检查 Ollama...', { baseUrl: config.baseUrl })
    if (!(await isOllamaRunning())) {
      debugLog('REWRITE', 'Ollama 未运行，尝试自动启动...')
      debugLog('REWRITE', 'findOllamaExe', { path: findOllamaExe() })
      const started = await startOllamaService(5)
      debugLog('REWRITE', '自动启动结果', { started })
      if (!started) {
        throw new Error('Ollama 服务未启动，请从开始菜单打开 Ollama，或在设置页面点击"一键配置"')
      }
    }
    debugLog('REWRITE', 'Ollama 已就绪')
  }

  const rewriteInput = {
    originalCopy: input.originalCopy,
    productInfo: input.productInfo,
    preferredDirection: input.preferredDirection as any,
    extraRequirements: input.extraRequirements,
  }

  try {
    const onProgress = (data: any) => {
      debugLog('REWRITE', '进度', data)
      const windows = BrowserWindow.getAllWindows()
      windows.forEach(w => {
        if (!w.isDestroyed()) {
          w.webContents.send('copywriting:progress', data)
        }
      })
    }

    debugLog('REWRITE', '调用 runRewritePipeline...')
    const result = await runRewritePipeline(config, rewriteInput, onProgress)
    debugLog('REWRITE', 'Pipeline 完成', { resultCount: result.results?.length })
    licenseManager.recordCopywritingUse()
    return result
  } catch (e: any) {
    debugLog('REWRITE', 'Pipeline 异常', { message: e.message, stack: e.stack })
    throw new Error(e.message || '改写失败')
  }
})

ipcMain.handle('copywriting:generate', async (_event: any, input: { product: string; targetAudience: string; sellingPoints: string; marketingGoal?: string; tone?: string }) => {
  debugLog('GENERATE', '=== 文案生成 IPC 开始 ===', { product: input.product?.length, audience: input.targetAudience?.length })
  // 许可证检查
  const tier = licenseManager.getTier()
  debugLog('GENERATE', '许可证等级', { tier })
  if (tier === 'free') {
    const usage = licenseManager.getDailyUsage()
    const copywritingUses = usage.copywritingUses || 0
    if (copywritingUses >= FREE_DAILY_COPYWRITING_LIMIT) {
      throw new Error(`DAILY_LIMIT:今日免费生成次数已用完（${FREE_DAILY_COPYWRITING_LIMIT}次/天），请升级 Pro 或 Premium`)
    }
  }
  if (tier === 'trial') {
    const remaining = licenseManager.getRemainingTrial()
    if ((remaining as any).copywriting !== undefined && (remaining as any).copywriting <= 0) {
      throw new Error('TRIAL_EXHAUSTED:试用生成次数已用完，请购买 Pro 或 Premium')
    }
  }

  const config = loadAiConfig()
  if (!config.apiKey && config.provider !== 'ollama') {
    throw new Error('请先在设置中配置 AI API Key')
  }
  if (config.provider === 'ollama') {
    debugLog('GENERATE', '检查 Ollama...', { baseUrl: config.baseUrl })
    if (!(await isOllamaRunning())) {
      debugLog('GENERATE', 'Ollama 未运行，尝试自动启动...')
      const started = await startOllamaService(5)
      debugLog('GENERATE', '自动启动结果', { started })
      if (!started) {
        throw new Error('Ollama 服务未启动，请从开始菜单打开 Ollama，或在设置页面点击"一键配置"')
      }
    }
  }

  const generateInput = {
    product: input.product,
    targetAudience: input.targetAudience,
    sellingPoints: input.sellingPoints,
    marketingGoal: input.marketingGoal,
    tone: input.tone,
  }

  try {
    const onProgress = (data: any) => {
      const windows = BrowserWindow.getAllWindows()
      windows.forEach(w => {
        if (!w.isDestroyed()) {
          w.webContents.send('copywriting:progress', data)
        }
      })
    }

    const result = await runGeneratePipeline(config, generateInput, onProgress)
    licenseManager.recordCopywritingUse()
    return result
  } catch (e: any) {
    throw new Error(e.message || '生成失败')
  }
})

// ==================== Ollama / Local LLM IPC Handlers ====================

ipcMain.handle('copywriting:ollamaDetect', async () => {
  try {
    return await ollamaAutoDetect(RECOMMENDED_MODEL)
  } catch (e: any) {
    return {
      ollamaFound: false, ollamaRunning: false,
      modelInstalled: false, modelName: RECOMMENDED_MODEL, needPull: false,
      message: e.message || '检测失败',
    }
  }
})

ipcMain.handle('copywriting:ollamaIsRunning', async () => {
  return isOllamaRunning()
})

ipcMain.handle('copywriting:ollamaIsInstalled', async () => {
  return findOllamaExe() !== null
})

ipcMain.handle('copywriting:ollamaListModels', async () => {
  try {
    const models = await listModels()
    return { models }
  } catch (e: any) {
    return { models: [], error: e.message }
  }
})

ipcMain.handle('copywriting:ollamaHasModel', async (_event: any, modelName: string) => {
  try {
    return await hasModel(modelName)
  } catch {
    return false
  }
})

ipcMain.handle('copywriting:ollamaPullModel', async (_event: any, modelName: string) => {
  try {
    await ollamaPullModel(modelName, (progress) => {
      const windows = BrowserWindow.getAllWindows()
      windows.forEach(w => {
        if (!w.isDestroyed()) {
          w.webContents.send('copywriting:ollamaPullProgress', progress)
        }
      })
    })
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('copywriting:ollamaOpenSite', async () => {
  const { shell } = await import('electron')
  shell.openExternal('https://ollama.com/download/windows')
})

ipcMain.handle('copywriting:ollamaOneClickSetup', async (_event: any, modelName: string) => {
  try {
    await oneClickSetup(modelName || RECOMMENDED_MODEL, (progress) => {
      const windows = BrowserWindow.getAllWindows()
      windows.forEach(w => {
        if (!w.isDestroyed()) {
          w.webContents.send('copywriting:ollamaSetupProgress', progress)
        }
      })
    })
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

// ==================== Mirror Config (moved to modules/mirror) ====================
registerMirror()

