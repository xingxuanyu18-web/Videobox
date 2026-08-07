import { ipcMain, BrowserWindow } from 'electron'

// ==================== IPC 注册器工具 ====================

/** 每个模块导出的注册函数签名 */
export type ModuleRegistrar = () => void

/** 向所有窗口广播事件 */
export function broadcast(channel: string, data: unknown): void {
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) win.webContents.send(channel, data)
  })
}

/**
 * 注册带统一 try-catch 的 IPC handler
 * 不用改 channel 名称，对渲染进程完全透明
 */
export function handle(
  channel: string,
  fn: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => Promise<any>
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await fn(event, ...args)
    } catch (e: any) {
      console.error(`[IPC ${channel}]`, e.message)
      throw e
    }
  })
}
