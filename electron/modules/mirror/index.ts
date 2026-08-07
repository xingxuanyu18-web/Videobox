import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { handle } from '../../core/ipc'

export function register(): void {
  handle('app:getMirrorConfig', async () => {
    try {
      const file = path.join(app.getPath('userData'), 'mirror_config.json')
      if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, 'utf8'))
      }
    } catch { /* ignore */ }
    return { enabled: true }
  })

  handle('app:saveMirrorConfig', async (_event: any, config: { enabled: boolean }) => {
    try {
      const file = path.join(app.getPath('userData'), 'mirror_config.json')
      fs.writeFileSync(file, JSON.stringify(config, null, 2), 'utf8')
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })
}
