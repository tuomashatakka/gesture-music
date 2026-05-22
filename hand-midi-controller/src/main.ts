import { MidiProvider } from './midi/midiProvider'
import { Dashboard } from './dashboard/dashboard'
import { styles } from './dashboard/styles'

function init(): void {
  const styleEl = document.createElement('style')
  styleEl.textContent = styles
  document.head.appendChild(styleEl)

  const app = document.getElementById('app')
  if (!app) {
    console.error('#app element not found')
    return
  }

  const midi = new MidiProvider()
  const dashboard = new Dashboard(midi, app)
  dashboard.render()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
