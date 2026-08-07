import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { handle, broadcast } from '../../core/ipc'

let historyFile = ''

export function register(): void {
  historyFile = path.join(app.getPath('userData'), 'download-history.json')

  handle('history:get', async () => {
    try {
      if (fs.existsSync(historyFile)) {
        const data = fs.readFileSync(historyFile, 'utf8')
        return JSON.parse(data)
      }
      return []
    } catch (e) {
      return []
    }
  })

  handle('history:add', async (_, record: any) => {
    try {
      let history: any[] = []
      if (fs.existsSync(historyFile)) {
        const data = fs.readFileSync(historyFile, 'utf8')
        history = JSON.parse(data)
      }
      const newRecord = {
        ...record,
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
      }
      history.unshift(newRecord)
      // 只保留最近 100 条
      history = history.slice(0, 100)
      fs.writeFileSync(historyFile, JSON.stringify(history, null, 2))

      broadcast('history:updated', history)
      return true
    } catch (e) {
      return false
    }
  })

  handle('history:delete', async (_, id: string) => {
    try {
      let history: any[] = []
      if (fs.existsSync(historyFile)) {
        const data = fs.readFileSync(historyFile, 'utf8')
        history = JSON.parse(data)
        history = history.filter((h: any) => h.id !== id)
        fs.writeFileSync(historyFile, JSON.stringify(history, null, 2))
      }

      broadcast('history:updated', history)
      return true
    } catch (e) {
      return false
    }
  })
}
