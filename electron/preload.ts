import { ipcRenderer, contextBridge } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },
})

// 暴露 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 剪贴板
  clipboard: {
    readText: () => ipcRenderer.invoke('clipboard:readText'),
    writeText: (text: string) => ipcRenderer.invoke('clipboard:writeText', text),
  },

  // 对话框
  dialog: {
    selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
    selectFile: () => ipcRenderer.invoke('dialog:selectFile'),
    selectVideo: () => ipcRenderer.invoke('dialog:selectVideo'),
  },

  // 应用
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getDefaultDownloadDir: () => ipcRenderer.invoke('app:getDefaultDownloadDir'),
    fetchImage: (url: string, referer?: string) => ipcRenderer.invoke('app:fetchImage', url, referer),
  },

  // 系统操作
  shell: {
    openPath: (filePath: string) => ipcRenderer.invoke('shell:openPath', filePath),
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  },

  // YT-DLP 操作
  ytdlp: {
    parse: (url: string, cookiesFile?: string) => ipcRenderer.invoke('ytdlp:parse', url, cookiesFile),
    download: (options: { url: string; formatId: string; outputDir: string; filename?: string; taskId: string; directUrl?: string; cookiesFile?: string; downloadMode?: 'video' | 'audio' | 'subtitle'; audioTrack?: any; subtitles?: string[]; filenameTemplate?: string }) =>
      ipcRenderer.invoke('ytdlp:download', options),
    pauseDownload: (taskId: string) => ipcRenderer.invoke('ytdlp:pauseDownload', taskId),
  },

  // 下载进度监听
  onDownloadProgress: (callback: (data: any) => void) => {
    const handler = (_: any, data: any) => callback(data)
    ipcRenderer.on('download:progress', handler)
    return () => {
      ipcRenderer.off('download:progress', handler)
    }
  },

  // 历史记录
  history: {
    get: () => ipcRenderer.invoke('history:get'),
    add: (record: any) => ipcRenderer.invoke('history:add', record),
    delete: (id: string) => ipcRenderer.invoke('history:delete', id),
    onUpdated: (callback: (history: any[]) => void) => {
      const handler = (_: any, data: any[]) => callback(data)
      ipcRenderer.on('history:updated', handler)
      return () => {
        ipcRenderer.off('history:updated', handler)
      }
    },
  },

  // ASR 语音识别
  asr: {
    process: (filePath: string, engine: string, exportFormat: string) =>
      ipcRenderer.invoke('asr:process', filePath, engine, exportFormat),
    processUrl: (url: string, engine: string, exportFormat: string) =>
      ipcRenderer.invoke('asr:processUrl', url, engine, exportFormat),
    getEngines: () => ipcRenderer.invoke('asr:getEngines'),
    getCache: () => ipcRenderer.invoke('asr:getCache'),
    onProgress: (callback: (data: { filePath: string; status: string; message?: string }) => void) => {
      const handler = (_: any, data: any) => callback(data)
      ipcRenderer.on('asr:progress', handler)
      return () => { ipcRenderer.off('asr:progress', handler) }
    },
  },

  // 许可证
  license: {
    getStatus: () => ipcRenderer.invoke('license:getStatus'),
    activate: (key: string, deviceLabel?: string) => ipcRenderer.invoke('license:activate', key, deviceLabel),
    getTrialInfo: () => ipcRenderer.invoke('license:getTrialInfo'),
    getDailyUsage: () => ipcRenderer.invoke('license:getDailyUsage'),
    canDownload: () => ipcRenderer.invoke('license:canDownload'),
    canProcessAsr: () => ipcRenderer.invoke('license:canProcessAsr'),
    getDevices: () => ipcRenderer.invoke('license:getDevices'),
    deactivateDevice: (machineId: string) => ipcRenderer.invoke('license:deactivateDevice', machineId),
    getMachineId: () => ipcRenderer.invoke('license:getMachineId'),
  },

  // 更新检查
  checkForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),
  installUpdate: () => ipcRenderer.invoke('app:installUpdate'),
  onUpdateStatus: (callback: (data: {
    status: 'checking' | 'available' | 'no-update' | 'downloading' | 'downloaded' | 'error'
    version?: string
    percent?: number
    bytesPerSecond?: number
    releaseNotes?: string
    error?: string
  }) => void) => {
    const handler = (_: any, data: any) => callback(data)
    ipcRenderer.on('update:status', handler)
    return () => {
      ipcRenderer.off('update:status', handler)
    }
  },

  // 菜单事件监听
  onMenuShowAbout: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('menu:showAbout', handler)
    return () => {
      ipcRenderer.off('menu:showAbout', handler)
    }
  },
})

// --------- Preload scripts loading ---------
function domReady(condition: DocumentReadyState[] = ['complete', 'interactive']) {
  return new Promise((resolve) => {
    if (condition.includes(document.readyState)) {
      resolve(true)
    } else {
      document.addEventListener('readystatechange', () => {
        if (condition.includes(document.readyState)) {
          resolve(true)
        }
      })
    }
  })
}

const safeDOM = {
  append(parent: HTMLElement, child: HTMLElement) {
    if (!Array.from(parent.children).find(e => e === child)) {
      return parent.appendChild(child)
    }
  },
  remove(parent: HTMLElement, child: HTMLElement) {
    if (Array.from(parent.children).find(e => e === child)) {
      return parent.removeChild(child)
    }
  },
}

function useLoading() {
  const styleContent = `
/* ===== Videobox Cinematic Loading ===== */
@keyframes vb-logo-burst {
  0%   { transform: scale(0); opacity: 0; }
  40%  { transform: scale(1.15); opacity: 1; }
  55%  { transform: scale(0.92); }
  70%  { transform: scale(1.03); }
  85%  { transform: scale(0.98); }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes vb-glow-pulse {
  0%, 100% { box-shadow: 0 0 30px rgba(253,201,65,0.35), 0 0 80px rgba(253,201,65,0.10), 0 0 120px rgba(253,201,65,0.04); }
  50%      { box-shadow: 0 0 50px rgba(253,201,65,0.55), 0 0 120px rgba(253,201,65,0.20), 0 0 180px rgba(253,201,65,0.08); }
}
@keyframes vb-ring-1 {
  0%   { transform: scale(0.8); opacity: 0.6; }
  100% { transform: scale(1.8); opacity: 0; }
}
@keyframes vb-ring-2 {
  0%   { transform: scale(0.8); opacity: 0.5; }
  100% { transform: scale(2.2); opacity: 0; }
}
@keyframes vb-ring-3 {
  0%   { transform: scale(0.8); opacity: 0.4; }
  100% { transform: scale(2.6); opacity: 0; }
}
@keyframes vb-shimmer {
  0%   { left: -100%; }
  100% { left: 200%; }
}
@keyframes vb-fade-up {
  0%   { opacity: 0; transform: translateY(16px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes vb-fade-in-text {
  0%   { opacity: 0; }
  100% { opacity: 1; }
}
@keyframes vb-bar-dance { 0%,100% { height: 8px;  opacity: 0.4; } 30% { height: 36px; opacity: 1; } 60% { height: 14px; opacity: 0.7; } }
@keyframes vb-dot-bounce {
  0%, 80%, 100% { transform: scale(0); opacity: 0; }
  40%           { transform: scale(1); opacity: 1; }
}
@keyframes vb-particle-1 { 0% { transform: translate(0,0) scale(0); opacity: 1; } 100% { transform: translate(-40px,-80px) scale(1); opacity: 0; } }
@keyframes vb-particle-2 { 0% { transform: translate(0,0) scale(0); opacity: 1; } 100% { transform: translate(50px,-100px) scale(1); opacity: 0; } }
@keyframes vb-particle-3 { 0% { transform: translate(0,0) scale(0); opacity: 1; } 100% { transform: translate(-20px,-60px) scale(1); opacity: 0; } }
@keyframes vb-particle-4 { 0% { transform: translate(0,0) scale(0); opacity: 1; } 100% { transform: translate(30px,-70px) scale(1); opacity: 0; } }
@keyframes vb-particle-5 { 0% { transform: translate(0,0) scale(0); opacity: 1; } 100% { transform: translate(-50px,-90px) scale(1); opacity: 0; } }

.vb-loader-wrap {
  position: fixed;
  top: 0; left: 0;
  width: 100vw; height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  background: radial-gradient(ellipse at 50% 30%, #1A1508 0%, #000000 100%);
  z-index: 99999;
  transition: opacity 0.6s cubic-bezier(0.4,0,0.2,1), visibility 0.6s;
  overflow: hidden;
}
.vb-loader-wrap.fade-out { opacity: 0; visibility: hidden; pointer-events: none; }

/* Logo + ripple rings container */
.vb-logo-stage {
  position: relative;
  width: 120px; height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Ripple rings */
.vb-ripple-ring {
  position: absolute;
  width: 80px; height: 80px;
  border-radius: 20px;
  border: 2px solid rgba(253,201,65,0.3);
  pointer-events: none;
}
.vb-ripple-ring:nth-child(1) { animation: vb-ring-1 2.6s ease-out infinite; }
.vb-ripple-ring:nth-child(2) { animation: vb-ring-2 2.6s ease-out infinite 0.8s; }
.vb-ripple-ring:nth-child(3) { animation: vb-ring-3 2.6s ease-out infinite 1.6s; }

/* Main logo */
.vb-logo-box {
  position: relative;
  width: 72px; height: 72px;
  border-radius: 20px;
  background: #FDC941;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  animation: vb-logo-burst 1s cubic-bezier(0.16,1,0.3,1) forwards, vb-glow-pulse 2s ease-in-out 1s infinite;
  overflow: hidden;
}
/* Shimmer sweep */
.vb-logo-box::after {
  content: '';
  position: absolute;
  top: 0; left: -100%;
  width: 60%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
  transform: skewX(-20deg);
  animation: vb-shimmer 2.5s ease-in-out 1.2s infinite;
}
.vb-logo-box svg {
  width: 36px; height: 36px;
  position: relative;
  z-index: 1;
}

/* Floating particles */
.vb-particle {
  position: absolute;
  width: 4px; height: 4px;
  border-radius: 50%;
  background: #FDC941;
  pointer-events: none;
}
.vb-particle:nth-child(4) { animation: vb-particle-1 2s ease-out infinite; }
.vb-particle:nth-child(5) { animation: vb-particle-2 2s ease-out infinite 0.4s; }
.vb-particle:nth-child(6) { animation: vb-particle-3 2s ease-out infinite 0.8s; }
.vb-particle:nth-child(7) { animation: vb-particle-4 2s ease-out infinite 1.2s; }
.vb-particle:nth-child(8) { animation: vb-particle-5 2s ease-out infinite 1.6s; }

/* Audio bars */
.vb-bars-stage {
  display: flex;
  align-items: flex-end;
  gap: 5px;
  height: 36px;
}
.vb-bar {
  width: 4px;
  border-radius: 3px;
  background: #FDC941;
}
.vb-bar:nth-child(1) { animation: vb-bar-dance 1.1s ease-in-out infinite; }
.vb-bar:nth-child(2) { animation: vb-bar-dance 1.05s ease-in-out infinite 0.08s; }
.vb-bar:nth-child(3) { animation: vb-bar-dance 1.2s ease-in-out infinite 0.16s; }
.vb-bar:nth-child(4) { animation: vb-bar-dance 0.95s ease-in-out infinite 0.12s; }
.vb-bar:nth-child(5) { animation: vb-bar-dance 1.15s ease-in-out infinite 0.2s; }
.vb-bar:nth-child(6) { animation: vb-bar-dance 1.0s ease-in-out infinite 0.04s; }
.vb-bar:nth-child(7) { animation: vb-bar-dance 1.1s ease-in-out infinite 0.24s; }

/* Brand text */
.vb-brand {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 0.15em;
  color: #FFFFFF;
  opacity: 0;
  animation: vb-fade-up 0.7s cubic-bezier(0.16,1,0.3,1) 0.6s forwards;
}
.vb-tagline {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0.25em;
  color: #555555;
  opacity: 0;
  animation: vb-fade-up 0.6s cubic-bezier(0.16,1,0.3,1) 0.9s forwards;
}

/* Loading dots */
.vb-dots {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
.vb-dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: #FDC941;
  animation: vb-dot-bounce 1.5s ease-in-out infinite;
}
.vb-dot:nth-child(1) { animation-delay: 0s; }
.vb-dot:nth-child(2) { animation-delay: 0.2s; }
.vb-dot:nth-child(3) { animation-delay: 0.4s; }
    `

  const oStyle = document.createElement('style')
  oStyle.id = 'vb-loading-style'
  oStyle.innerHTML = styleContent

  const oDiv = document.createElement('div')
  oDiv.className = 'vb-loader-wrap'
  oDiv.innerHTML = `
    <div class="vb-logo-stage">
      <div class="vb-ripple-ring"></div>
      <div class="vb-ripple-ring"></div>
      <div class="vb-ripple-ring"></div>
      <div class="vb-particle"></div>
      <div class="vb-particle"></div>
      <div class="vb-particle"></div>
      <div class="vb-particle"></div>
      <div class="vb-particle"></div>
      <div class="vb-logo-box">
        <svg viewBox="0 0 32 32" fill="none">
          <path d="M6 4L16 12L6 20V4Z" fill="#000000" opacity="0.9"/>
          <path d="M16 12L26 4V20L16 12Z" fill="#000000" opacity="0.6"/>
          <rect x="6" y="22" width="20" height="4" rx="2" fill="#000000" opacity="0.7"/>
        </svg>
      </div>
    </div>
    <div class="vb-bars-stage">
      <div class="vb-bar"></div><div class="vb-bar"></div><div class="vb-bar"></div>
      <div class="vb-bar"></div><div class="vb-bar"></div><div class="vb-bar"></div>
      <div class="vb-bar"></div>
    </div>
    <div class="vb-brand">VIDEOBOX</div>
    <div class="vb-tagline">视频下载 · 智能语音识别</div>
    <div class="vb-dots">
      <div class="vb-dot"></div><div class="vb-dot"></div><div class="vb-dot"></div>
    </div>
  `

  return {
    appendLoading() {
      safeDOM.append(document.head, oStyle)
      safeDOM.append(document.body, oDiv)
    },
    removeLoading() {
      // 淡出动画
      oDiv.classList.add('fade-out')
      setTimeout(() => {
        safeDOM.remove(document.head, oStyle)
        safeDOM.remove(document.body, oDiv)
      }, 500)
    },
  }
}

// ----------------------------------------------------------------------

const { appendLoading, removeLoading } = useLoading()
domReady().then(appendLoading)

window.onmessage = (ev) => {
  ev.data.payload === 'removeLoading' && removeLoading()
}

setTimeout(removeLoading, 4999)
