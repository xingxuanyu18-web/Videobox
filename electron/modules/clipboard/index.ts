import { clipboard } from 'electron'
import { handle } from '../../core/ipc'

export function register(): void {
  handle('clipboard:readText', async () => {
    return clipboard.readText()
  })

  handle('clipboard:writeText', async (_, text: string) => {
    clipboard.writeText(text)
  })
}
