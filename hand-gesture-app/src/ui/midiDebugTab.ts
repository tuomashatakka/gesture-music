/**
 * Drawer tab 1 — live outgoing MIDI debug log + output device selector.
 * Works against either MidiRouter backend (Electron virtual port or Web MIDI).
 */
import type { MidiRouter, OutgoingLogEntry } from '../midi/midiRouter'
import { noteToName } from '../midi/types'


const MAX_ROWS = 120

function clock (ms: number): string {
  return (ms / 1000).toFixed(2) + 's'
}

function detail (e: OutgoingLogEntry): string {
  switch (e.type) {
    case 'noteon':
    case 'noteoff':
      return `${noteToName(e.note ?? 0)} (${e.note}) v${e.velocity ?? 0} ch${e.channel}`
    case 'cc':
      return `CC${e.controller} = ${e.value} ch${e.channel}`
    case 'pitchbend':
      return `bend ${e.value} ch${e.channel}`
    default:
      return `ch${e.channel}`
  }
}

export class MidiDebugTab {
  readonly el:        HTMLElement
  private router:     MidiRouter
  private select:     HTMLSelectElement
  private statusLine: HTMLElement
  private log:        HTMLElement
  private rows = 0

  constructor (router: MidiRouter) {
    this.router = router

    this.el           = document.createElement('div')
    this.el.className = 'gm-panel active'

    const row     = document.createElement('div')
    row.className = 'gm-row'

    const label            = document.createElement('label')
    label.textContent      = 'Output'
    this.select            = document.createElement('select')
    this.select.className  = 'gm-select'
    this.select.style.flex = '1'

    const refresh       = document.createElement('button')
    refresh.className   = 'gm-btn mini'
    refresh.textContent = '⟳'
    refresh.addEventListener('click', () => this.refreshDevices())
    row.append(label, this.select, refresh)
    this.el.appendChild(row)

    this.statusLine           = document.createElement('div')
    this.statusLine.className = 'gm-hint'
    this.el.appendChild(this.statusLine)

    const clear       = document.createElement('button')
    clear.className   = 'gm-btn mini'
    clear.textContent = 'Clear log'
    clear.addEventListener('click', () => {
      this.log.innerHTML = ''; this.rows = 0
    })
    this.el.appendChild(clear)

    this.log                 = document.createElement('div')
    this.log.className       = 'gm-log'
    this.log.style.marginTop = '10px'
    this.el.appendChild(this.log)

    this.select.addEventListener('change', () => this.onSelect())
    void this.refreshDevices()
  }

  private async onSelect (): Promise<void> {
    const v = this.select.value
    if (this.router.electron) {
      const idx = v === '' ? null : parseInt(v, 10)
      await this.router.electron.selectOutput(idx !== null && Number.isNaN(idx) ? null : idx)
    }
    else if (this.router.webProvider)
      this.router.webProvider.selectOutput(v || null)
  }

  async refreshDevices (): Promise<void> {
    this.select.innerHTML = ''
    if (this.router.electron) {
      this.select.add(new Option('Gesture Music (virtual) only', ''))
      try {
        const outs = await this.router.electron.listOutputs()
        outs.forEach((name, i) => this.select.add(new Option('+ mirror → ' + name, String(i))))
      }
      catch {

        /* ignore */
      }
      this.statusLine.textContent = 'Backend: Electron virtual port "Gesture Music" — select it as input in your DAW.'
    }
    else if (this.router.webProvider) {
      const st = this.router.webProvider.getState()
      if (st.outputs.length === 0)
        this.select.add(new Option('(no MIDI outputs — enable a macOS IAC bus)', ''))
      st.outputs.forEach(o => {
        const opt = new Option(o.name, o.id)
        if (o.id === st.selectedOutput)
          opt.selected = true
        this.select.add(opt)
      })
      this.statusLine.textContent = 'Backend: Web MIDI — pick an IAC bus here, then select it as input in your DAW.'
    }
    else
      this.statusLine.textContent = 'MIDI unavailable in this environment.'
  }

  push (e: OutgoingLogEntry): void {
    const row     = document.createElement('div')
    row.className = 'gm-log-entry'

    const t       = document.createElement('span'); t.className = 't'; t.textContent = clock(e.timestamp)

    const ty                                                                   = document.createElement('span'); ty.className = 'ty'; ty.textContent = e.type

    const d                                                                        = document.createElement('span'); d.className = 'd'; d.textContent = detail(e)
    row.append(t, ty, d)
    this.log.insertBefore(row, this.log.firstChild)
    this.rows += 1
    while (this.rows > MAX_ROWS && this.log.lastChild) {
      this.log.removeChild(this.log.lastChild)
      this.rows -= 1
    }
  }
}
