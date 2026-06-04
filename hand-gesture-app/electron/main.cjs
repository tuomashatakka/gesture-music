/* eslint-disable */
/**
 * Electron main process. Hosts the Vite renderer and owns the "Gesture Music"
 * virtual MIDI port. CommonJS so `require('@julusian/midi')` (a native addon)
 * loads without ESM/CJS friction under the package's "type": "module".
 *
 *   dev  : `pnpm electron:dev`  -> loads the Vite dev server (ELECTRON_DEV=1)
 *   prod : `electron electron/main.cjs` after `vite build` -> loads dist/
 */
const { app, BrowserWindow, ipcMain, session } = require('electron')
const path = require('node:path')
const midiPort = require('./midiPort.cjs')

const DEV = !!process.env.ELECTRON_DEV
const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:3333/gesture-music/'

let win = null

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    backgroundColor: '#1a1a2e',
    title: 'Gesture Music',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Auto-grant camera so getUserMedia works without a prompt loop.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, cb) => cb(true))

  if (DEV) win.loadURL(DEV_URL)
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

app.whenReady().then(() => {
  try {
    midiPort.init('Gesture Music')
    console.log('[gesture-music] virtual MIDI port "Gesture Music" open')
  } catch (e) {
    console.error('[gesture-music] failed to open virtual MIDI port:', e)
  }
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

ipcMain.on('midi:send', (_e, bytes) => {
  try { midiPort.send(bytes) } catch (_) { /* noop */ }
})
ipcMain.handle('midi:listOutputs', () => {
  try { return midiPort.listOutputs() } catch (_) { return [] }
})
ipcMain.handle('midi:selectOutput', (_e, index) => {
  midiPort.selectOutput(index)
  return true
})
ipcMain.handle('midi:status', () => midiPort.status())

app.on('window-all-closed', () => {
  midiPort.dispose()
  if (process.platform !== 'darwin') app.quit()
})
app.on('quit', () => midiPort.dispose())
