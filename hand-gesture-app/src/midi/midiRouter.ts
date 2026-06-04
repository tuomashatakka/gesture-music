/**
 * MidiRouter — one MIDI-out API for the whole app, with two interchangeable
 * backends chosen at runtime:
 *
 *   - Electron  : `window.gestureMidi` (exposed by the preload bridge) writes to
 *                 a real CoreMIDI virtual port named "Gesture Music" that a DAW
 *                 selects like a USB MIDI interface.
 *   - Browser   : the ported Web MIDI `MidiProvider`, sending to an existing OS
 *                 output port (e.g. a macOS IAC bus).
 *
 * Every outgoing message is mirrored to `onLog` listeners so the drawer's MIDI
 * debug tab can render the stream.
 */
import { MidiProvider } from './midiProvider'
import type { MidiMessage } from './types'

/** Shape of the bridge injected by electron/preload.cjs (absent in a browser). */
export interface GestureMidiBridge {
  isElectron:   boolean
  send:         (bytes: number[]) => void
  listOutputs:  () => Promise<string[]>
  selectOutput: (index: number | null) => Promise<void>
  status:       () => Promise<{ virtualPort: string; hardware: string | null }>
}

declare global {
  interface Window {
    gestureMidi?: GestureMidiBridge
  }
}

export interface OutgoingLogEntry {
  type:        MidiMessage['type']
  channel:     number
  note?:       number
  velocity?:   number
  controller?: number
  value?:      number
  timestamp:   number
}

type LogListener = (e: OutgoingLogEntry) => void

export class MidiRouter {
  readonly electron: GestureMidiBridge | null
  private provider:  MidiProvider | null = null
  private logListeners = new Set<LogListener>()

  constructor () {
    this.electron =
      typeof window !== 'undefined' && window.gestureMidi ? window.gestureMidi : null
  }

  get backendName (): string {
    return this.electron ? 'Gesture Music (virtual port)' : 'Web MIDI'
  }

  get isElectron (): boolean {
    return this.electron !== null
  }

  /** Web MIDI provider when running in the browser (else null). */
  get webProvider (): MidiProvider | null {
    return this.provider
  }

  async enable (): Promise<boolean> {
    if (this.electron)
      return true
    this.provider = new MidiProvider()
    return this.provider.enable()
  }

  onLog (fn: LogListener): () => void {
    this.logListeners.add(fn)
    return () => this.logListeners.delete(fn)
  }

  private emit (e: OutgoingLogEntry): void {
    this.logListeners.forEach(l => l(e))
  }

  private now (): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now()
  }

  private raw (bytes: number[]): void {
    if (this.electron)
      this.electron.send(bytes)
    else
      this.provider?.send(bytes)
  }

  noteOn (note: number, velocity = 100, channel = 1): void {
    this.raw([ 0x90 | channel - 1 & 0x0f, note & 0x7f, velocity & 0x7f ])
    this.emit({ type: 'noteon', channel, note, velocity, timestamp: this.now() })
  }

  noteOff (note: number, channel = 1): void {
    this.raw([ 0x80 | channel - 1 & 0x0f, note & 0x7f, 0 ])
    this.emit({ type: 'noteoff', channel, note, timestamp: this.now() })
  }

  cc (controller: number, value: number, channel = 1): void {
    this.raw([ 0xb0 | channel - 1 & 0x0f, controller & 0x7f, value & 0x7f ])
    this.emit({ type: 'cc', channel, controller, value, timestamp: this.now() })
  }

  /** value is the signed 14-bit bend, -8192..8191 (0 = centre). */
  pitchBend (value: number, channel = 1): void {
    const v = Math.max(0, Math.min(16383, Math.round(value) + 8192))
    this.raw([ 0xe0 | channel - 1 & 0x0f, v & 0x7f, v >> 7 & 0x7f ])
    this.emit({ type: 'pitchbend', channel, value, timestamp: this.now() })
  }

  allNotesOff (channel = 1): void {
    this.cc(123, 0, channel)
  }
}
