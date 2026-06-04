/* eslint-disable */
/**
 * Preload bridge. Exposes a minimal `window.gestureMidi` API to the renderer
 * (MidiRouter detects it and routes MIDI to the native virtual port).
 * contextIsolation stays on; the renderer never touches Node directly.
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('gestureMidi', {
  isElectron: true,
  send: (bytes) => ipcRenderer.send('midi:send', bytes),
  listOutputs: () => ipcRenderer.invoke('midi:listOutputs'),
  selectOutput: (index) => ipcRenderer.invoke('midi:selectOutput', index),
  status: () => ipcRenderer.invoke('midi:status'),
})
