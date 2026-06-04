/**
 * Right drawer shell: toggle button (+ 'm' key), sliding panel, two tabs
 * (MIDI debug log / routing-matrix editor) and a small settings strip
 * (swap-hands, panic). Built imperatively like the app's existing debug HUD.
 */
import { drawerStyles } from './styles'
import { MidiDebugTab } from './midiDebugTab'
import { MappingTab } from './mappingTab'
import type { MappingTabDeps } from './mappingTab'
import type { MidiRouter, OutgoingLogEntry } from '../midi/midiRouter'


export interface DrawerDeps {
  router:       MidiRouter
  mapping:      MappingTabDeps
  getSwapHands: () => boolean
  setSwapHands: (v: boolean) => void
  onPanic:      () => void
}

const EDITABLE = new Set([ 'INPUT', 'SELECT', 'TEXTAREA' ])

export class Drawer {
  readonly debug:      MidiDebugTab
  readonly mappingTab: MappingTab
  private panel:       HTMLElement
  private toggleBtn:   HTMLButtonElement
  private dot:         HTMLElement
  private statusText:  HTMLElement
  private isOpen = false

  constructor (deps: DrawerDeps) {
    if (!document.getElementById('gm-drawer-styles')) {
      const style       = document.createElement('style')
      style.id          = 'gm-drawer-styles'
      style.textContent = drawerStyles
      document.head.appendChild(style)
    }

    this.toggleBtn             = document.createElement('button')
    this.toggleBtn.className   = 'gm-toggle'
    this.toggleBtn.textContent = 'MIDI ▸'
    this.toggleBtn.addEventListener('click', () => this.toggle())
    document.body.appendChild(this.toggleBtn)

    this.panel           = document.createElement('div')
    this.panel.className = 'gm-drawer'

    // header
    const head     = document.createElement('div')
    head.className = 'gm-head'

    const title       = document.createElement('h2')
    title.textContent = 'Gesture MIDI'

    const status                = document.createElement('div')
    status.className            = 'gm-status'
    this.dot                    = document.createElement('span')
    this.dot.className          = 'gm-dot'
    this.statusText             = document.createElement('span')
    this.statusText.textContent = deps.router.backendName
    status.append(this.dot, this.statusText)

    const close       = document.createElement('button')
    close.className   = 'gm-close'
    close.textContent = '×'
    close.addEventListener('click', () => this.toggle())
    head.append(title, status, close)
    this.panel.appendChild(head)

    // settings strip
    const settings              = document.createElement('div')
    settings.className          = 'gm-row'
    settings.style.padding      = '8px 16px'
    settings.style.borderBottom = '1px solid #2a2a4a'

    const swapLabel = document.createElement('label')
    const swap      = document.createElement('input')
    swap.type       = 'checkbox'
    swap.checked    = deps.getSwapHands()
    swap.addEventListener('change', () => deps.setSwapHands(swap.checked))
    swapLabel.append(swap, ' swap hands (left performs)')

    const panic       = document.createElement('button')
    panic.className   = 'gm-btn mini danger'
    panic.textContent = 'Panic'
    panic.addEventListener('click', () => deps.onPanic())
    settings.append(swapLabel, panic)
    this.panel.appendChild(settings)

    // tab bar
    const tabbar     = document.createElement('div')
    tabbar.className = 'gm-tabbar'

    const tabDebug       = document.createElement('button')
    tabDebug.className   = 'gm-tab active'
    tabDebug.textContent = 'MIDI Debug'

    const tabMap       = document.createElement('button')
    tabMap.className   = 'gm-tab'
    tabMap.textContent = 'Mapping'
    tabbar.append(tabDebug, tabMap)
    this.panel.appendChild(tabbar)

    // body
    const body      = document.createElement('div')
    body.className  = 'gm-body'
    this.debug      = new MidiDebugTab(deps.router)
    this.mappingTab = new MappingTab(deps.mapping)
    body.append(this.debug.el, this.mappingTab.el)
    this.panel.appendChild(body)

    const selectTab = (which: 'debug' | 'map') => {
      const d = which === 'debug'
      tabDebug.classList.toggle('active', d)
      tabMap.classList.toggle('active', !d)
      this.debug.el.classList.toggle('active', d)
      this.mappingTab.el.classList.toggle('active', !d)
    }
    tabDebug.addEventListener('click', () => selectTab('debug'))
    tabMap.addEventListener('click', () => selectTab('map'))

    document.body.appendChild(this.panel)

    document.addEventListener('keydown', e => {
      if ((e.key === 'm' || e.key === 'M') && !EDITABLE.has((e.target as HTMLElement)?.tagName))
        this.toggle()
    })
  }

  toggle (): void {
    this.isOpen = !this.isOpen
    this.panel.classList.toggle('open', this.isOpen)
    this.toggleBtn.textContent = this.isOpen ? 'MIDI ◂' : 'MIDI ▸'
    if (this.isOpen)
      void this.debug.refreshDevices()
  }

  setEnabled (enabled: boolean): void {
    this.dot.classList.toggle('on', enabled)
    this.statusText.textContent = enabled ? this.statusText.textContent : 'MIDI off'
  }

  push (entry: OutgoingLogEntry): void {
    this.debug.push(entry)
  }
}
