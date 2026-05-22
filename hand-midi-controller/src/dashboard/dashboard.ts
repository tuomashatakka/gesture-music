import { MidiProvider } from '../midi/midiProvider'
import { noteToName, NOTE_VELOCITIES } from '../midi/types'
import type { MidiNoteEvent, MidiDeviceInfo, MidiProviderState, MidiMessage } from '../midi/types'

const NOTE_RANGE = { start: 36, end: 96 }
const BLACK_KEYS = [1, 3, 6, 8, 10]

interface Preset {
  name: string
  description: string
  notes: number[]
  velocity: number
  channel: number
  duration: number
}

const PRESETS: Preset[] = [
  { name: 'Bass Drop', description: 'Low octave sweep', notes: [36, 40, 43, 47], velocity: 110, channel: 1, duration: 400 },
  { name: 'Arp 1', description: 'C major arpeggio', notes: [48, 52, 55, 60], velocity: 90, channel: 1, duration: 200 },
  { name: 'Arp 2', description: 'A minor arpeggio', notes: [45, 48, 52, 57], velocity: 90, channel: 1, duration: 200 },
  { name: 'Chord Maj', description: 'C major chord', notes: [48, 52, 55], velocity: 100, channel: 1, duration: 800 },
  { name: 'Chord Min', description: 'A minor chord', notes: [45, 48, 52], velocity: 100, channel: 1, duration: 800 },
  { name: 'Drum Hit', description: 'Percussive stab', notes: [42, 44, 46], velocity: 120, channel: 10, duration: 100 },
  { name: 'Swell', description: 'Slow attack notes', notes: [60, 64, 67], velocity: 80, channel: 1, duration: 1500 },
  { name: 'Octaves', description: 'Octave jumps', notes: [48, 60, 72], velocity: 100, channel: 1, duration: 300 },
]

type DashboardView = 'piano' | 'grid' | 'presets' | 'log'

export class Dashboard {
  private midi: MidiProvider
  private container: HTMLElement
  private activeNotes: Set<number> = new Set()
  private currentView: DashboardView = 'piano'
  private currentPreset: Preset = PRESETS[0]
  private midiLog: MidiMessage[] = []
  private maxLogEntries = 100
  private logContainer: HTMLElement | null = null
  private pianoContainer: HTMLElement | null = null
  private gridContainer: HTMLElement | null = null
  private noteGrid: HTMLElement | null = null
  private keyboardElement: HTMLElement | null = null

  noteVelocity = 100
  noteChannel = 1
  noteDuration = 500

  constructor(midi: MidiProvider, container: HTMLElement) {
    this.midi = midi
    this.container = container
  }

  render(): void {
    this.container.innerHTML = ''
    this.renderHeader()
    this.renderDevicePanel()
    this.renderControlPanel()
    this.renderViews()
    this.renderInfoBar()

    this.midi.onStateChange(state => this.updateDeviceUI(state))
    this.midi.onMessage(msg => this.handleMidiInput(msg))
    this.setupKeyboardShortcuts()

    this.updateDeviceUI(this.midi.getState())
  }

  private renderHeader(): void {
    const header = document.createElement('div')
    header.className = 'header'
    header.innerHTML = `
      <h1>MIDI <span>Controller</span></h1>
      <div class="connection-status">
        <span class="status-dot" id="status-dot"></span>
        <span id="status-text">Disconnected</span>
      </div>
    `
    this.container.appendChild(header)
  }

  private renderDevicePanel(): void {
    const panel = document.createElement('div')
    panel.className = 'panel'
    panel.id = 'device-panel'
    panel.innerHTML = `
      <div class="panel-title">MIDI Devices</div>
      <div class="device-selector">
        <label>Output</label>
        <select id="midi-output-select">
          <option value="">No device selected</option>
        </select>
        <div class="connection-controls">
          <button class="btn btn-primary" id="connect-btn">Connect</button>
          <button class="btn btn-secondary" id="refresh-btn">Refresh</button>
        </div>
      </div>
      <div class="device-selector">
        <label>Input</label>
        <select id="midi-input-select">
          <option value="">No device selected</option>
        </select>
      </div>
    `
    this.container.appendChild(panel)

    const connectBtn = panel.querySelector('#connect-btn') as HTMLButtonElement
    const refreshBtn = panel.querySelector('#refresh-btn') as HTMLButtonElement
    const outputSelect = panel.querySelector('#midi-output-select') as HTMLSelectElement
    const inputSelect = panel.querySelector('#midi-input-select') as HTMLSelectElement

    connectBtn.addEventListener('click', () => this.toggleConnection())
    refreshBtn.addEventListener('click', () => {
      if (this.midi.getState().enabled) {
        location.reload()
      } else {
        this.toggleConnection()
      }
    })

    outputSelect.addEventListener('change', () => {
      this.midi.selectOutput(outputSelect.value || null)
    })

    inputSelect.addEventListener('change', () => {
      this.midi.selectInput(inputSelect.value || null)
    })
  }

  private renderControlPanel(): void {
    const panel = document.createElement('div')
    panel.className = 'panel'
    panel.innerHTML = `
      <div class="panel-title">Note Controls</div>
      <div class="controls-row">
        <div class="control-group">
          <label>Velocity</label>
          <div style="display:flex;align-items:center;gap:8px;">
            <input type="range" id="velocity-slider" min="1" max="127" value="${this.noteVelocity}">
            <span class="value-display" id="velocity-value">${this.noteVelocity}</span>
          </div>
        </div>
        <div class="control-group">
          <label>Channel</label>
          <select id="channel-select">
            ${Array.from({ length: 16 }, (_, i) => `
              <option value="${i + 1}" ${i + 1 === this.noteChannel ? 'selected' : ''}>${i + 1}</option>
            `).join('')}
          </select>
        </div>
        <div class="control-group">
          <label>Duration (ms)</label>
          <input type="number" id="duration-input" value="${this.noteDuration}" min="0" max="5000" step="10">
        </div>
        <div class="control-group">
          <label>&nbsp;</label>
          <button class="btn btn-danger" id="panic-btn">Panic</button>
        </div>
      </div>
    `
    this.container.appendChild(panel)

    const velocitySlider = panel.querySelector('#velocity-slider') as HTMLInputElement
    const velocityValue = panel.querySelector('#velocity-value') as HTMLElement
    const channelSelect = panel.querySelector('#channel-select') as HTMLSelectElement
    const durationInput = panel.querySelector('#duration-input') as HTMLInputElement
    const panicBtn = panel.querySelector('#panic-btn') as HTMLButtonElement

    velocitySlider.addEventListener('input', () => {
      this.noteVelocity = parseInt(velocitySlider.value)
      velocityValue.textContent = this.noteVelocity.toString()
    })

    channelSelect.addEventListener('change', () => {
      this.noteChannel = parseInt(channelSelect.value)
    })

    durationInput.addEventListener('change', () => {
      this.noteDuration = parseInt(durationInput.value) || 500
    })

    panicBtn.addEventListener('click', () => this.panic())
  }

  private renderViews(): void {
    const viewContainer = document.createElement('div')
    viewContainer.className = 'panel'

    const tabBar = document.createElement('div')
    tabBar.className = 'tab-bar'
    const tabs = [
      { id: 'piano', label: 'Piano' },
      { id: 'grid', label: 'Grid' },
      { id: 'presets', label: 'Presets' },
      { id: 'log', label: 'MIDI Log' },
    ]
    tabs.forEach(tab => {
      const btn = document.createElement('button')
      btn.className = `tab ${tab.id === this.currentView ? 'active' : ''}`
      btn.dataset.view = tab.id
      btn.textContent = tab.label
      btn.addEventListener('click', () => this.switchView(tab.id as DashboardView))
      tabBar.appendChild(btn)
    })
    viewContainer.appendChild(tabBar)

    this.pianoContainer = document.createElement('div')
    this.pianoContainer.id = 'piano-view'
    viewContainer.appendChild(this.pianoContainer)

    this.gridContainer = document.createElement('div')
    this.gridContainer.id = 'grid-view'
    this.gridContainer.style.display = 'none'
    viewContainer.appendChild(this.gridContainer)

    const presetContainer = document.createElement('div')
    presetContainer.id = 'presets-view'
    presetContainer.style.display = 'none'
    viewContainer.appendChild(presetContainer)
    this.renderPresets(presetContainer)

    this.logContainer = document.createElement('div')
    this.logContainer.id = 'log-view'
    this.logContainer.style.display = 'none'
    this.logContainer.className = 'midi-log'
    viewContainer.appendChild(this.logContainer)

    this.container.appendChild(viewContainer)

    this.renderPianoKeyboard()
    this.renderNoteGrid()
  }

  private renderPresets(container: HTMLElement): void {
    const grid = document.createElement('div')
    grid.className = 'preset-grid'
    PRESETS.forEach(preset => {
      const btn = document.createElement('button')
      btn.className = 'preset-btn'
      btn.innerHTML = `
        <span class="preset-name">${preset.name}</span>
        <span class="preset-desc">${preset.description}</span>
      `
      btn.addEventListener('click', () => this.playPreset(preset))
      grid.appendChild(btn)
    })
    container.appendChild(grid)
  }

  private renderPianoKeyboard(): void {
    if (!this.pianoContainer) return
    this.pianoContainer.innerHTML = ''
    this.keyboardElement = document.createElement('div')
    this.keyboardElement.className = 'piano-keyboard'

    const whiteKeys: number[] = []
    const blackKeyPositions: { note: number; position: number }[] = []

    for (let note = NOTE_RANGE.start; note <= NOTE_RANGE.end; note++) {
      const noteInOctave = note % 12
      if (BLACK_KEYS.includes(noteInOctave)) continue
      whiteKeys.push(note)
    }

    whiteKeys.forEach((note, idx) => {
      const key = document.createElement('div')
      key.className = 'piano-key white'
      key.dataset.note = note.toString()
      key.innerHTML = noteToName(note)

      key.addEventListener('mousedown', () => this.playNote(note))
      key.addEventListener('mouseup', () => this.stopNote(note))
      key.addEventListener('mouseleave', () => this.stopNote(note))
      key.addEventListener('touchstart', (e) => { e.preventDefault(); this.playNote(note) })
      key.addEventListener('touchend', (e) => { e.preventDefault(); this.stopNote(note) })

      this.keyboardElement!.appendChild(key)

      const nextNote = note + 1
      if (nextNote <= NOTE_RANGE.end) {
        const nextInOctave = nextNote % 12
        if (BLACK_KEYS.includes(nextInOctave)) {
          blackKeyPositions.push({ note: nextNote, position: idx })
        }
      }
    })

    whiteKeys.forEach((_, idx) => {
      const prevNote = NOTE_RANGE.start + idx
      const prevInOctave = prevNote % 12
      if (BLACK_KEYS.includes(prevInOctave)) {
        blackKeyPositions.push({ note: prevNote, position: idx - 1 })
      }
    })

    const keyWidth = 100 / whiteKeys.length

    blackKeyPositions.forEach(({ note, position }) => {
      const key = document.createElement('div')
      key.className = 'piano-key black'
      key.dataset.note = note.toString()
      key.style.left = `${(position + 1) * keyWidth - keyWidth * 0.33}%`
      key.textContent = noteToName(note).replace('#', '')

      key.addEventListener('mousedown', () => this.playNote(note))
      key.addEventListener('mouseup', () => this.stopNote(note))
      key.addEventListener('mouseleave', () => this.stopNote(note))
      key.addEventListener('touchstart', (e) => { e.preventDefault(); this.playNote(note) })
      key.addEventListener('touchend', (e) => { e.preventDefault(); this.stopNote(note) })

      this.keyboardElement!.appendChild(key)
    })

    this.pianoContainer.appendChild(this.keyboardElement)
  }

  private renderNoteGrid(): void {
    if (!this.gridContainer) return
    this.gridContainer.innerHTML = ''
    this.noteGrid = document.createElement('div')
    this.noteGrid.className = 'note-grid'

    for (let note = NOTE_RANGE.start; note <= NOTE_RANGE.end; note++) {
      const cell = document.createElement('div')
      cell.className = 'note-cell'
      cell.dataset.note = note.toString()
      cell.innerHTML = `
        <span class="note-name">${noteToName(note)}</span>
        <span class="note-num">${note}</span>
      `

      cell.addEventListener('mousedown', () => this.playNote(note))
      cell.addEventListener('mouseup', () => this.stopNote(note))
      cell.addEventListener('mouseleave', () => this.stopNote(note))
      cell.addEventListener('touchstart', (e) => { e.preventDefault(); this.playNote(note) })
      cell.addEventListener('touchend', (e) => { e.preventDefault(); this.stopNote(note) })

      this.noteGrid.appendChild(cell)
    }

    this.gridContainer.appendChild(this.noteGrid)
  }

  private renderInfoBar(): void {
    const info = document.createElement('div')
    info.className = 'info-bar'
    info.innerHTML = `
      <span>Click or touch keys to play notes</span>
      <span>
        <span class="keybind">Z</span>–<span class="keybind">M</span> lower octave
        <span class="keybind">Q</span>–<span class="keybind">U</span> upper octave
        <span class="keybind">Space</span> panic
      </span>
    `
    this.container.appendChild(info)
  }

  private switchView(view: DashboardView): void {
    this.currentView = view

    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
    document.querySelector(`.tab[data-view="${view}"]`)?.classList.add('active')

    const pianoView = document.getElementById('piano-view')
    const gridView = document.getElementById('grid-view')
    const presetsView = document.getElementById('presets-view')
    const logView = document.getElementById('log-view')

    if (pianoView) pianoView.style.display = view === 'piano' ? 'block' : 'none'
    if (gridView) gridView.style.display = view === 'grid' ? 'block' : 'none'
    if (presetsView) presetsView.style.display = view === 'presets' ? 'block' : 'none'
    if (logView) logView.style.display = view === 'log' ? 'block' : 'none'
  }

  private async toggleConnection(): Promise<void> {
    const connected = this.midi.getState().enabled
    if (connected) {
      this.midi.dispose()
      this.updateDeviceUI(this.midi.getState())
    } else {
      const ok = await this.midi.enable()
      if (!ok) {
        const statusText = document.getElementById('status-text')
        if (statusText) statusText.textContent = 'MIDI not available'
        return
      }
    }
    this.updateDeviceUI(this.midi.getState())
  }

  private updateDeviceUI(state: MidiProviderState): void {
    const statusDot = document.getElementById('status-dot')
    const statusText = document.getElementById('status-text')
    const connectBtn = document.getElementById('connect-btn') as HTMLButtonElement
    const outputSelect = document.getElementById('midi-output-select') as HTMLSelectElement
    const inputSelect = document.getElementById('midi-input-select') as HTMLSelectElement

    if (statusDot) statusDot.className = `status-dot ${state.enabled ? 'connected' : ''}`
    if (statusText) statusText.textContent = state.enabled
      ? `Connected${state.selectedOutput ? ` — ${this.getDeviceName(state.outputs, state.selectedOutput)}` : ' (no output)'}`
      : 'Disconnected'
    if (connectBtn) connectBtn.textContent = state.enabled ? 'Disconnect' : 'Connect'

    if (outputSelect) {
      const currentValue = outputSelect.value
      outputSelect.innerHTML = '<option value="">No device selected</option>'
      state.outputs
        .filter(d => d.state === 'connected')
        .forEach(d => {
          const opt = document.createElement('option')
          opt.value = d.id
          opt.textContent = `${d.name} (${d.manufacturer})`
          if (d.id === state.selectedOutput || d.id === currentValue) opt.selected = true
          outputSelect.appendChild(opt)
        })
    }

    if (inputSelect) {
      const currentValue = inputSelect.value
      inputSelect.innerHTML = '<option value="">No device selected</option>'
      state.inputs
        .filter(d => d.state === 'connected')
        .forEach(d => {
          const opt = document.createElement('option')
          opt.value = d.id
          opt.textContent = `${d.name} (${d.manufacturer})`
          if (d.id === state.selectedInput || d.id === currentValue) opt.selected = true
          inputSelect.appendChild(opt)
        })
    }
  }

  private getDeviceName(devices: MidiDeviceInfo[], id: string): string {
    return devices.find(d => d.id === id)?.name ?? 'Unknown'
  }

  private async playNote(note: number): Promise<void> {
    if (this.activeNotes.has(note)) return
    this.activeNotes.add(note)
    this.activateKey(note, true)

    const event: MidiNoteEvent = {
      note,
      velocity: this.noteVelocity,
      channel: this.noteChannel,
      duration: this.noteDuration,
    }

    await this.midi.sendNote(event)
    this.logMidiMessage({
      type: 'noteon',
      channel: this.noteChannel,
      note,
      velocity: this.noteVelocity,
      raw: new Uint8Array([0x90 | (this.noteChannel - 1), note, this.noteVelocity]),
      timestamp: performance.now(),
    })
  }

  private async stopNote(note: number): Promise<void> {
    if (!this.activeNotes.has(note)) return
    this.activeNotes.delete(note)
    this.activateKey(note, false)
    await this.midi.sendNoteOff(note, this.noteChannel)
  }

  private activateKey(note: number, active: boolean): void {
    const selector = `.piano-key[data-note="${note}"], .note-cell[data-note="${note}"]`
    document.querySelectorAll(selector).forEach(el => {
      el.classList.toggle('active', active)
    })
  }

  private async playPreset(preset: Preset): Promise<void> {
    const velocity = preset.velocity
    const channel = preset.channel
    const duration = preset.duration

    preset.notes.forEach((note, idx) => {
      setTimeout(() => {
        const event: MidiNoteEvent = { note, velocity, channel, duration }
        this.midi.sendNote(event)
        this.logMidiMessage({
          type: 'noteon',
          channel,
          note,
          velocity,
          raw: new Uint8Array([0x90 | (channel - 1), note, velocity]),
          timestamp: performance.now(),
        })
      }, idx * (duration * 0.8))
    })
  }

  private async panic(): Promise<void> {
    this.activeNotes.clear()
    document.querySelectorAll('.piano-key.active, .note-cell.active').forEach(el => {
      el.classList.remove('active')
    })
    await this.midi.sendAllNotesOff()
    this.logMidiMessage({
      type: 'other',
      channel: 0,
      raw: new Uint8Array([0xfe]),
      timestamp: performance.now(),
    })
  }

  private logMidiMessage(msg: MidiMessage): void {
    this.midiLog.unshift(msg)
    if (this.midiLog.length > this.maxLogEntries) {
      this.midiLog.pop()
    }
    this.renderLog()
  }

  private handleMidiInput(msg: MidiMessage): void {
    this.logMidiMessage(msg)
  }

  private renderLog(): void {
    if (!this.logContainer) return
    this.logContainer.innerHTML = this.midiLog.map(msg => {
      const time = new Date(msg.timestamp).toISOString().slice(11, 23)
      const isOut = msg.type === 'noteon' || msg.type === 'noteoff'
      const detail = msg.note !== undefined
        ? `${noteToName(msg.note)} (${msg.note}) · vel ${msg.velocity} · ch ${msg.channel}`
        : msg.controller !== undefined
          ? `CC ${msg.controller} = ${msg.value} · ch ${msg.channel}`
          : `Raw: ${Array.from(msg.raw).map(b => b.toString(16).padStart(2, '0')).join(' ')}`

      return `<div class="midi-log-entry ${isOut ? 'out' : 'in'}">
        <span class="time">${time}</span>
        <span class="type">${msg.type.toUpperCase()}</span>
        <span class="detail">${detail}</span>
      </div>`
    }).join('')
  }

  private setupKeyboardShortcuts(): void {
    const lowerRow = ['z', 's', 'x', 'd', 'c', 'v', 'g', 'b', 'h', 'n', 'j', 'm', 'q']
    const upperRow = ['q', 'w', 'e', 'r', 't', 'y', 'u']
    const lowerNotes = [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60]
    const upperNotes = [60, 61, 62, 63, 64, 65, 66]

    const keyMap = new Map<string, number>()
    lowerRow.forEach((key, idx) => keyMap.set(key, lowerNotes[idx]))
    upperRow.forEach((key, idx) => keyMap.set(key, upperNotes[idx]))

    document.addEventListener('keydown', (e) => {
      if (e.repeat) return
      if (e.key === ' ') {
        e.preventDefault()
        this.panic()
        return
      }
      const note = keyMap.get(e.key.toLowerCase())
      if (note !== undefined) {
        e.preventDefault()
        this.playNote(note)
      }
    })

    document.addEventListener('keyup', (e) => {
      const note = keyMap.get(e.key.toLowerCase())
      if (note !== undefined) {
        e.preventDefault()
        this.stopNote(note)
      }
    })
  }
}
