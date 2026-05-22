export interface MidiNoteEvent {
  note: number
  velocity: number
  channel: number
  duration: number
}

export interface MidiDeviceInfo {
  id: string
  name: string
  manufacturer: string
  state: 'connected' | 'disconnected'
}

export interface MidiProviderState {
  inputs: MidiDeviceInfo[]
  outputs: MidiDeviceInfo[]
  selectedInput: string | null
  selectedOutput: string | null
  enabled: boolean
}

export interface MidiMessage {
  type: 'noteon' | 'noteoff' | 'cc' | 'other'
  channel: number
  note?: number
  velocity?: number
  controller?: number
  value?: number
  raw: Uint8Array
  timestamp: number
}

export type MidiProviderListener = (message: MidiMessage) => void

export type MidiDeviceChangeListener = (state: MidiProviderState) => void

export const NOTE_NAMES: string[] = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'
]

export function noteToName(note: number): string {
  const octave = Math.floor(note / 12) - 1
  const pitch = NOTE_NAMES[note % 12]
  return `${pitch}${octave}`
}

export const NOTE_VELOCITIES = {
  pp: 32,
  p: 48,
  mp: 64,
  mf: 80,
  f: 96,
  ff: 112,
  fff: 127,
} as const
