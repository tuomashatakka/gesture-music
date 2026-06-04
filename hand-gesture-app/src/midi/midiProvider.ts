/**
 * Web MIDI backend. Ported from hand-midi-controller with a pitch-bend helper
 * added. Sends to an existing OS/hardware output port (e.g. a macOS IAC bus).
 * Used as the fallback backend when the app is NOT running inside Electron.
 */
import type {
  MidiDeviceInfo,
  MidiProviderState,
  MidiMessage,
  MidiProviderListener,
  MidiDeviceChangeListener,
  MidiNoteEvent,
} from './types'


export class MidiProvider {
  private midiAccess: MIDIAccess | null = null
  private state: MidiProviderState = {
    inputs:         [],
    outputs:        [],
    selectedInput:  null,
    selectedOutput: null,
    enabled:        false,
  }

  private messageListeners: Set<MidiProviderListener> = new Set()
  private stateListeners:   Set<MidiDeviceChangeListener> = new Set()
  private scheduledNotes:   Map<string, number> = new Map()
  private inputPorts:       Map<string, MIDIInput> = new Map()
  private outputPorts:      Map<string, MIDIOutput> = new Map()

  getState (): Readonly<MidiProviderState> {
    return this.state
  }

  onMessage (listener: MidiProviderListener): () => void {
    this.messageListeners.add(listener)
    return () => this.messageListeners.delete(listener)
  }

  onStateChange (listener: MidiDeviceChangeListener): () => void {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  async enable (): Promise<boolean> {
    if (!navigator.requestMIDIAccess) {
      console.warn('Web MIDI API not available in this browser')
      return false
    }

    try {
      this.midiAccess    = await navigator.requestMIDIAccess({ sysex: false })
      this.state.enabled = true

      this.midiAccess.onstatechange = () => {
        this.scanDevices()
        this.autoSelectOutput()
      }

      this.scanDevices()
      this.autoSelectOutput()
      return true
    }
    catch (error) {
      console.error('Failed to access MIDI devices:', error)
      this.state.enabled = false
      this.notifyStateChange()
      return false
    }
  }

  private scanDevices (): void {
    if (!this.midiAccess)
      return

    this.inputPorts.clear()
    this.outputPorts.clear()

    const inputs: MidiDeviceInfo[]  = []
    const outputs: MidiDeviceInfo[] = []

    for (const input of this.midiAccess.inputs.values()) {
      inputs.push(this.deviceInfoFromPort(input))
      this.inputPorts.set(input.id, input)
    }

    for (const output of this.midiAccess.outputs.values()) {
      outputs.push(this.deviceInfoFromPort(output))
      this.outputPorts.set(output.id, output)
    }

    this.state = { ...this.state, inputs, outputs }
    this.notifyStateChange()
  }

  private deviceInfoFromPort (port: MIDIInput | MIDIOutput): MidiDeviceInfo {
    return {
      id:           port.id,
      name:         port.name ?? 'Unknown',
      manufacturer: port.manufacturer ?? 'Unknown',
      state:        port.state === 'connected' ? 'connected' : 'disconnected',
    }
  }

  selectOutput (id: string | null): void {
    this.state = { ...this.state, selectedOutput: id }
    this.notifyStateChange()
  }

  selectInput (id: string | null): void {
    this.state = { ...this.state, selectedInput: id }
    this.notifyStateChange()
  }

  private autoSelectOutput (): void {
    if (this.state.selectedOutput)
      return

    const connected = this.state.outputs.filter(d => d.state === 'connected')
    if (connected.length > 0) {
      // Prefer an IAC bus if present — that's the path to a DAW in the browser.
      const iac = connected.find(d => (/iac|loop|virtual|bus/i).test(d.name))
      this.selectOutput((iac ?? connected[0]).id)
    }
  }

  private port (): MIDIOutput | null {
    if (!this.state.selectedOutput)
      return null
    return this.outputPorts.get(this.state.selectedOutput) ?? null
  }

  send (bytes: number[]): void {
    const output = this.port()
    if (!output)
      return
    output.send(Uint8Array.from(bytes))
  }

  async sendNoteOn (note: number, velocity = 100, channel = 1): Promise<void> {
    this.send([ 0x90 | channel - 1 & 0x0f, note & 0x7f, velocity & 0x7f ])
  }

  async sendNoteOff (note: number, channel = 1): Promise<void> {
    this.send([ 0x80 | channel - 1 & 0x0f, note & 0x7f, 0 ])
  }

  async sendCC (controller: number, value: number, channel = 1): Promise<void> {
    this.send([ 0xb0 | channel - 1 & 0x0f, controller & 0x7f, value & 0x7f ])
  }

  /** value is the signed 14-bit bend, -8192..8191 (0 = centre). */
  async sendPitchBend (value: number, channel = 1): Promise<void> {
    const v = Math.max(0, Math.min(16383, value + 8192))
    this.send([ 0xe0 | channel - 1 & 0x0f, v & 0x7f, v >> 7 & 0x7f ])
  }

  async sendNote (event: MidiNoteEvent): Promise<void> {
    const key           = `${event.note}-${event.channel}`
    const existingTimer = this.scheduledNotes.get(key)
    if (existingTimer !== undefined) {
      clearTimeout(existingTimer)
      this.scheduledNotes.delete(key)
    }
    await this.sendNoteOn(event.note, event.velocity, event.channel)
    if (event.duration > 0) {
      const timer = window.setTimeout(() => {
        this.sendNoteOff(event.note, event.channel)
        this.scheduledNotes.delete(key)
      }, event.duration)
      this.scheduledNotes.set(key, timer)
    }
  }

  async sendAllNotesOff (channel?: number): Promise<void> {
    for (const [ key, timer ] of this.scheduledNotes) {
      clearTimeout(timer)

      const [ note, ch ] = key.split('-').map(Number)
      if (channel === undefined || ch === channel)
        await this.sendNoteOff(note, ch)
    }
    this.scheduledNotes.clear()
    // belt-and-braces all-notes-off CC 123 on the selected channel(s)
    for (let ch = 1; ch <= 16; ch++)
      if (channel === undefined || ch === channel)
        this.sendCC(123, 0, ch)
  }

  dispose (): void {
    this.sendAllNotesOff()
    this.messageListeners.clear()
    this.stateListeners.clear()
    this.inputPorts.clear()
    this.outputPorts.clear()
    this.midiAccess = null
    this.state      = {
      inputs:         [],
      outputs:        [],
      selectedInput:  null,
      selectedOutput: null,
      enabled:        false,
    }
  }

  private notifyStateChange (): void {
    this.stateListeners.forEach(listener => listener({ ...this.state }))
  }

  // kept for interface parity with the controller (unused here)
  parseMessage (data: Uint8Array, timestamp: number): MidiMessage {
    const status  = data[0] >> 4
    const channel = (data[0] & 0x0f) + 1
    if (status === 0x9)
      return { type: data[2] > 0 ? 'noteon' : 'noteoff', channel, note: data[1], velocity: data[2], raw: data, timestamp }
    if (status === 0x8)
      return { type: 'noteoff', channel, note: data[1], velocity: data[2], raw: data, timestamp }
    if (status === 0xb)
      return { type: 'cc', channel, controller: data[1], value: data[2], raw: data, timestamp }
    if (status === 0xe)
      return { type: 'pitchbend', channel, value: data[2] << 7 | data[1], raw: data, timestamp }
    return { type: 'other', channel, raw: data, timestamp }
  }
}
