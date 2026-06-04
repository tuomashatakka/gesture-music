/**
 * Drawer tab 2 — the full gesture→MIDI routing-matrix editor.
 *
 * Per gesture: enable toggle, base note, channel, and a list of modulation
 * routes (source → target with input/output ranges). Edits mutate a working
 * config and call `onChange` (which persists to localStorage and pushes the new
 * config into the live MappingEngine). Structural edits re-render the panel;
 * value edits update in place so inputs keep focus.
 */
import {
  MAPPABLE_GESTURES, MOD_SOURCES, MOD_TARGETS, SOURCE_LABELS, TARGET_LABELS, newRouteId,
} from '../midi/mapping'
import type { MappingConfig, GestureMapping, ModRoute, ModSource, ModTarget } from '../midi/mapping'
import { noteToName } from '../midi/types'


export interface MappingTabDeps {
  getMapping: () => MappingConfig
  onChange:   (c: MappingConfig) => void
  onReset:    () => MappingConfig
}

function makeSelect (values: string[], labels: string[], selected: string): HTMLSelectElement {
  const sel     = document.createElement('select')
  sel.className = 'gm-select'
  values.forEach((v, i) => sel.add(new Option(labels[i], v, false, v === selected)))
  return sel
}

function numInput (value: number, onInput: (n: number) => void, width = 52): HTMLInputElement {
  const inp       = document.createElement('input')
  inp.type        = 'number'
  inp.className   = 'gm-input'
  inp.style.width = width + 'px'
  inp.value       = String(value)
  inp.step        = 'any'
  inp.addEventListener('input', () => {
    const n = parseFloat(inp.value)
    if (!Number.isNaN(n))
      onInput(n)
  })
  return inp
}

export class MappingTab {
  readonly el:  HTMLElement
  private deps: MappingTabDeps
  private cfg:  MappingConfig

  constructor (deps: MappingTabDeps) {
    this.deps         = deps
    this.cfg          = deps.getMapping()
    this.el           = document.createElement('div')
    this.el.className = 'gm-panel'
    this.render()
  }

  /** Persist + apply, then optionally rebuild the DOM. */
  private commit (rerender: boolean): void {
    this.deps.onChange(this.cfg)
    if (rerender)
      this.render()
  }

  private render (): void {
    this.el.innerHTML = ''

    // global controls
    const top     = document.createElement('div')
    top.className = 'gm-row'

    const velLabel       = document.createElement('label')
    velLabel.textContent = 'Base velocity'

    const vel            = numInput(this.cfg.baseVelocity, n => {
      this.cfg.baseVelocity = Math.max(1, Math.min(127, Math.round(n))); this.commit(false)
    }, 64)
    const reset       = document.createElement('button')
    reset.className   = 'gm-btn mini danger'
    reset.textContent = 'Reset to defaults'
    reset.addEventListener('click', () => {
      this.cfg = this.deps.onReset(); this.render()
    })
    top.append(velLabel, vel, reset)
    this.el.appendChild(top)

    const hint       = document.createElement('div')
    hint.className   = 'gm-hint'
    hint.textContent = 'transpose & velocity apply at note-on; CC & pitch-bend stream while held.'
    this.el.appendChild(hint)

    for (const m of this.cfg.gestures)
      this.el.appendChild(this.gestureCard(m))
  }

  private gestureCard (m: GestureMapping): HTMLElement {
    const card     = document.createElement('div')
    card.className = 'gm-card'

    const head     = document.createElement('div')
    head.className = 'gm-card-head'

    const enable   = document.createElement('input')
    enable.type    = 'checkbox'
    enable.checked = m.enabled
    enable.addEventListener('change', () => {
      m.enabled = enable.checked; this.commit(false)
    })

    const name       = document.createElement('span')
    name.className   = 'name'
    name.textContent = m.gesture

    const noteSel = makeSelect(
      Array.from({ length: 128 }, (_, n) => String(n)),
      Array.from({ length: 128 }, (_, n) => `${noteToName(n)} (${n})`),
      String(m.note),
    )
    noteSel.addEventListener('change', () => {
      m.note = parseInt(noteSel.value, 10); this.commit(false)
    })

    const chSel = makeSelect(
      Array.from({ length: 16 }, (_, i) => String(i + 1)),
      Array.from({ length: 16 }, (_, i) => 'ch ' + (i + 1)),
      String(m.channel),
    )
    chSel.addEventListener('change', () => {
      m.channel = parseInt(chSel.value, 10); this.commit(false)
    })

    head.append(enable, name, noteSel, chSel)
    card.appendChild(head)

    for (const r of m.routes)
      card.appendChild(this.routeRow(m, r))

    const add       = document.createElement('button')
    add.className   = 'gm-btn mini'
    add.textContent = '+ add route'
    add.addEventListener('click', () => {
      m.routes.push({ id: newRouteId(), source: 'ty', target: 'cc', ccNumber: 1, inMin: -0.3, inMax: 0.3, outMin: 0, outMax: 127 })
      this.commit(true)
    })
    card.appendChild(add)

    return card
  }

  private routeRow (m: GestureMapping, r: ModRoute): HTMLElement {
    const row     = document.createElement('div')
    row.className = 'gm-route'

    const src = makeSelect(MOD_SOURCES, MOD_SOURCES.map(s => SOURCE_LABELS[s]), r.source)
    src.addEventListener('change', () => {
      r.source = src.value as ModSource; this.commit(false)
    })

    const arrow       = document.createElement('span')
    arrow.className   = 'arrow'
    arrow.textContent = '→'

    const tgt = makeSelect(MOD_TARGETS, MOD_TARGETS.map(t => TARGET_LABELS[t]), r.target)
    tgt.addEventListener('change', () => {
      r.target = tgt.value as ModTarget; this.commit(true)
    })

    row.append(src, arrow, tgt)

    if (r.target === 'cc') {
      const ccWrap     = document.createElement('span')
      ccWrap.className = 'rng'
      ccWrap.append('CC#', numInput(r.ccNumber, n => {
        r.ccNumber = Math.max(0, Math.min(127, Math.round(n))); this.commit(false)
      }, 46))
      row.appendChild(ccWrap)
    }

    const range     = document.createElement('span')
    range.className = 'rng'
    range.append(
      'in', numInput(r.inMin, n => {
        r.inMin = n; this.commit(false)
      }), '…', numInput(r.inMax, n => {
        r.inMax = n; this.commit(false)
      }),
      'out', numInput(r.outMin, n => {
        r.outMin = n; this.commit(false)
      }), '…', numInput(r.outMax, n => {
        r.outMax = n; this.commit(false)
      }),
    )
    row.appendChild(range)

    const del       = document.createElement('button')
    del.className   = 'gm-btn mini danger'
    del.textContent = '×'
    del.addEventListener('click', () => {
      m.routes = m.routes.filter(x => x.id !== r.id)
      this.commit(true)
    })
    row.appendChild(del)

    return row
  }

  /** Replace the working config (e.g. external reset) and rebuild. */
  setConfig (cfg: MappingConfig): void {
    this.cfg = cfg
    this.render()
  }
}
