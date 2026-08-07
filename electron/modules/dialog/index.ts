import { dialog } from 'electron'
import path from 'node:path'
import os from 'node:os'
import { handle } from '../../core/ipc'

function getDefaultDownloadDir(): string {
  return path.join(os.homedir(), 'Downloads', 'Videobox')
}

export function register(): void {
  handle('dialog:selectFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      defaultPath: getDefaultDownloadDir(),
    })
    return result.canceled ? null : result.filePaths[0]
  })

  handle('dialog:selectFile', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Text Files', extensions: ['txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  handle('dialog:selectVideo', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '视频文件', extensions: ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm', 'ts', 'rmvb'] },
        { name: '音频文件', extensions: ['mp3', 'wav', 'flac', 'm4a', 'ogg', 'aac', 'wma'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    })
    return result.canceled ? [] : result.filePaths
  })
}
