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
    inputs: [],
    outputs: [],
    selectedInput: null,
    selectedOutput: null,
    enabled: false,
  }
  private messageListeners: Set<MidiProviderListener> = new Set()
  private stateListeners: Set<MidiDeviceChangeListener> = new Set()
  private scheduledNotes: Map<string, number> = new Map()
  private inputPorts: Map<string, MIDIInput> = new Map()
  private outputPorts: Map<string, MIDIOutput> = new Map()

  getState(): Readonly<MidiProviderState> {
    return this.state
  }

  onMessage(listener: MidiProviderListener): () => void {
    this.messageListeners.add(listener)
    return () => this.messageListeners.delete(listener)
  }

  onStateChange(listener: MidiDeviceChangeListener): () => void {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  async enable(): Promise<boolean> {
    if (!navigator.requestMIDIAccess) {
      console.warn('Web MIDI API not available in this browser')
      return false
    }

    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: false })
      this.state.enabled = true

      this.midiAccess.onstatechange = (event: MIDIConnectionEvent) => {
        this.handleDeviceStateChange(event)
      }

      this.scanDevices()
      this.autoSelectOutput()
      return true
    } catch (error) {
      console.error('Failed to access MIDI devices:', error)
      this.state.enabled = false
      this.notifyStateChange()
      return false
    }
  }

  private scanDevices(): void {
    if (!this.midiAccess) return

    this.inputPorts.clear()
    this.outputPorts.clear()

    const inputs: MidiDeviceInfo[] = []
    const outputs: MidiDeviceInfo[] = []

    for (const input of this.midiAccess.inputs.values()) {
      inputs.push(this.deviceInfoFromPort(input))
      this.inputPorts.set(input.id, input)
      this.setupInputListener(input)
    }

    for (const output of this.midiAccess.outputs.values()) {
      outputs.push(this.deviceInfoFromPort(output))
      this.outputPorts.set(output.id, output)
    }

    this.state = {
      ...this.state,
      inputs,
      outputs,
    }

    this.notifyStateChange()
  }

  private deviceInfoFromPort(port: MIDIInput | MIDIOutput): MidiDeviceInfo {
    return {
      id: port.id,
      name: port.name ?? 'Unknown',
      manufacturer: port.manufacturer ?? 'Unknown',
      state: port.state === 'connected' ? 'connected' : 'disconnected',
    }
  }

  private setupInputListener(input: MIDIInput): void {
    input.onmidimessage = (event: MIDIMessageEvent) => {
      if (!event.data) return
      const message = this.parseMidiMessage(event.data, event.timeStamp)
      this.messageListeners.forEach(listener => listener(message))
    }
  }

  private parseMidiMessage(data: Uint8Array, timestamp: number): MidiMessage {
    const status = data[0] >> 4
    const channel = (data[0] & 0x0f) + 1

    switch (status) {
      case 0x9: {
        const velocity = data[2]
        return {
          type: velocity > 0 ? 'noteon' : 'noteoff',
          channel,
          note: data[1],
          velocity,
          raw: data,
          timestamp,
        }
      }
      case 0x8:
        return {
          type: 'noteoff',
          channel,
          note: data[1],
          velocity: data[2],
          raw: data,
          timestamp,
        }
      case 0xb:
        return {
          type: 'cc',
          channel,
          controller: data[1],
          value: data[2],
          raw: data,
          timestamp,
        }
      default:
        return {
          type: 'other',
          channel,
          raw: data,
          timestamp,
        }
    }
  }

  selectOutput(id: string | null): void {
    this.state = { ...this.state, selectedOutput: id }
    this.notifyStateChange()
  }

  selectInput(id: string | null): void {
    this.state = { ...this.state, selectedInput: id }
    this.notifyStateChange()
  }

  private autoSelectOutput(): void {
    if (this.state.selectedOutput) return
    const connected = this.state.outputs.filter(d => d.state === 'connected')
    if (connected.length > 0) {
      this.selectOutput(connected[0].id)
    }
  }

  private handleDeviceStateChange(event: MIDIConnectionEvent): void {
    this.scanDevices()
    this.autoSelectOutput()
  }

  async sendNoteOn(note: number, velocity: number = 100, channel: number = 1): Promise<void> {
    if (!this.state.selectedOutput) {
      console.warn('No MIDI output selected')
      return
    }

    const output = this.outputPorts.get(this.state.selectedOutput)
    if (!output) {
      console.warn('Selected MIDI output not available')
      return
    }

    const status = 0x90 | ((channel - 1) & 0x0f)
    const data = Uint8Array.from([status, note & 0x7f, velocity & 0x7f])
    output.send(data)
  }

  async sendNoteOff(note: number, channel: number = 1): Promise<void> {
    if (!this.state.selectedOutput) return
    const output = this.outputPorts.get(this.state.selectedOutput)
    if (!output) return

    const status = 0x80 | ((channel - 1) & 0x0f)
    const data = Uint8Array.from([status, note & 0x7f, 0])
    output.send(data)
  }

  async sendNote(event: MidiNoteEvent): Promise<void> {
    const key = `${event.note}-${event.channel}`

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

  async sendAllNotesOff(channel?: number): Promise<void> {
    for (const [key, timer] of this.scheduledNotes) {
      clearTimeout(timer)
      const [note, ch] = key.split('-').map(Number)
      if (channel === undefined || ch === channel) {
        await this.sendNoteOff(note, ch)
      }
    }
    this.scheduledNotes.clear()
  }

  async sendCC(controller: number, value: number, channel: number = 1): Promise<void> {
    if (!this.state.selectedOutput) return
    const output = this.outputPorts.get(this.state.selectedOutput)
    if (!output) return

    const status = 0xb0 | ((channel - 1) & 0x0f)
    const data = Uint8Array.from([status, controller & 0x7f, value & 0x7f])
    output.send(data)
  }

  dispose(): void {
    this.sendAllNotesOff()
    this.messageListeners.clear()
    this.stateListeners.clear()
    this.inputPorts.clear()
    this.outputPorts.clear()
    this.midiAccess = null
    this.state = {
      inputs: [],
      outputs: [],
      selectedInput: null,
      selectedOutput: null,
      enabled: false,
    }
  }

  private notifyStateChange(): void {
    this.stateListeners.forEach(listener => listener({ ...this.state }))
  }
}
