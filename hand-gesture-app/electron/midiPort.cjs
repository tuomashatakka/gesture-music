/* eslint-disable */
/**
 * Owns the CoreMIDI ports in the Electron main process via @julusian/midi.
 *
 *   - a virtual OUTPUT port named "Gesture Music" that a DAW selects as an
 *     INPUT source (the whole point of going Electron);
 *   - an optional hardware output to mirror to.
 *
 * CommonJS (.cjs) so `require()` of the native addon works regardless of the
 * package's "type": "module".
 */
const midi = require('@julusian/midi')

let virtualOut = null
let hardwareOut = null
let hardwareName = null

function init(portName) {
  virtualOut = new midi.Output()
  virtualOut.openVirtualPort(portName)
}

function listOutputs() {
  const probe = new midi.Output()
  const names = []
  const count = probe.getPortCount()
  for (let i = 0; i < count; i++) names.push(probe.getPortName(i))
  return names
}

function selectOutput(index) {
  if (hardwareOut) {
    try { hardwareOut.closePort() } catch (_) { /* noop */ }
    hardwareOut = null
    hardwareName = null
  }
  if (index === null || index === undefined || index < 0) return
  hardwareOut = new midi.Output()
  hardwareOut.openPort(index)
  try { hardwareName = hardwareOut.getPortName(index) } catch (_) { hardwareName = String(index) }
}

function send(bytes) {
  if (virtualOut) virtualOut.sendMessage(bytes)
  if (hardwareOut) hardwareOut.sendMessage(bytes)
}

function status() {
  return { virtualPort: 'Gesture Music', hardware: hardwareName }
}

function dispose() {
  try { if (virtualOut) virtualOut.closePort() } catch (_) { /* noop */ }
  try { if (hardwareOut) hardwareOut.closePort() } catch (_) { /* noop */ }
  virtualOut = null
  hardwareOut = null
  hardwareName = null
}

module.exports = { init, listOutputs, selectOutput, send, status, dispose }
