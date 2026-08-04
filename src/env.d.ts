/// <reference types="vite/client" />

interface Window {
  electronAPI: {
    // 剪贴板
    clipboard: {
      readText: () => Promise<string>
      writeText: (text: string) => Promise<void>
    }
    dialog: {
      selectFolder: () => Promise<string | null>
      selectFile: () => Promise<string | null>
      selectVideo: () => Promise<string[]>
    }
    // 应用信息
    app: {
      getVersion: () => Promise<string>
      getDefaultDownloadDir: () => Promise<string>
      fetchImage: (url: string, referer?: string) => Promise<string>
    }
    shell: {
      openPath: (filePath: string) => Promise<void>
      openExternal: (url: string) => Promise<void>
    }
    ytdlp: {
      parse: (url: string, cookiesFile?: string) => Promise<any>
      download: (options: {
        url: string
        formatId: string
        outputDir: string
        filename?: string
        taskId: string
        directUrl?: string 
        cookiesFile?: string
        downloadMode?: 'video' | 'audio'
        audioTrack?: any
        subtitles?: string[]
      }) => Promise<any>
      pauseDownload: (taskId: string) => Promise<boolean>
    }
    onDownloadProgress: (callback: (data: any) => void) => () => void
    history: {
      get: () => Promise<any[]>
      add: (record: any) => Promise<boolean>
      delete: (id: string) => Promise<boolean>
      onUpdated: (callback: (history: any[]) => void) => () => void
    }
    // 更新检查
    checkForUpdates: () => Promise<{
      hasUpdate: boolean
      version?: string
      currentVersion?: string
      releaseNotes?: string
      releaseDate?: string
      downloadUrl?: string
      error?: string
    }>
    installUpdate: () => Promise<void>
    onUpdateStatus: (callback: (data: {
      status: 'checking' | 'available' | 'no-update' | 'downloading' | 'downloaded' | 'error'
      version?: string
      percent?: number
      bytesPerSecond?: number
      releaseNotes?: string
      error?: string
    }) => void) => () => void
    // 菜单事件监听
    onMenuShowAbout: (callback: () => void) => () => void
    // ASR 语音识别
    asr: {
      process: (filePath: string, engine: string, exportFormat: string) => Promise<{ savePath: string; resultText: string }>
      processUrl: (url: string, engine: string, exportFormat: string) => Promise<{ savePath: string; resultText: string }>
      getEngines: () => Promise<Array<{ name: string; label: string; available: boolean; locked: boolean }>>
      getCache: () => Promise<{ exists: boolean; size?: number; sizeFormatted?: string }>
      onProgress: (callback: (data: { filePath: string; status: string; message?: string }) => void) => () => void
    }
    // 许可证
    license: {
      getStatus: () => Promise<{
        tier: string
        trialRemaining: { downloads: number; asr: number } | null
        trialExhausted: boolean
        licenseInfo: { tier: string; activatedAt: string; expiresAt: string | null } | null
        limits: {
          dailyDownloads: number | null
          exportFormats: string[]
          engines: string[]
          canBatch: boolean
          canFullQuality: boolean
        }
      }>
      activate: (key: string) => Promise<{ success: boolean; tier?: string; message: string }>
      getTrialInfo: () => Promise<any>
      getDailyUsage: () => Promise<{ downloads: number; asrProcessings: number; limit: number | null }>
      canDownload: () => Promise<boolean>
      canProcessAsr: () => Promise<boolean>
    }
  }
}
