export const styles = `
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  --bg-primary: #1a1a2e;
  --bg-secondary: #16213e;
  --bg-tertiary: #0f3460;
  --accent: #00ff88;
  --accent-dim: #00cc6a;
  --danger: #ff6b6b;
  --warning: #ffd93d;
  --text-primary: #e0e0e0;
  --text-secondary: #a0a0a0;
  --text-dim: #666;
  --border: #2a2a4a;
  --piano-white: #f0f0f0;
  --piano-black: #222;
  --radius: 8px;
  --radius-sm: 4px;
}

body {
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  min-height: 100vh;
  overflow-x: hidden;
}

#app {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 28px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}

.header h1 {
  font-size: 24px;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: 0.5px;
}

.header h1 span {
  color: var(--text-primary);
  font-weight: 300;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--danger);
  transition: background 0.3s;
}

.status-dot.connected {
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent);
}

.panel {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
  margin-bottom: 20px;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-secondary);
  margin-bottom: 16px;
}

.device-selector {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.device-selector:last-child {
  margin-bottom: 0;
}

.device-selector label {
  font-size: 13px;
  color: var(--text-secondary);
  min-width: 60px;
}

.device-selector select {
  flex: 1;
  padding: 8px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  outline: none;
}

.device-selector select:focus {
  border-color: var(--accent);
}

.device-selector select option {
  background: var(--bg-primary);
  color: var(--text-primary);
}

.connection-controls {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--accent);
  color: var(--bg-primary);
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-dim);
  box-shadow: 0 0 12px rgba(0, 255, 136, 0.3);
}

.btn-danger {
  background: var(--danger);
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #ff4444;
}

.btn-secondary {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border);
}

.btn-secondary:hover:not(:disabled) {
  background: #1a4a7a;
}

.controls-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.control-group label {
  font-size: 11px;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.control-group input,
.control-group select {
  padding: 6px 10px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  width: 80px;
}

.control-group input:focus,
.control-group select:focus {
  border-color: var(--accent);
}

.control-group input[type="range"] {
  width: 120px;
  padding: 0;
  background: transparent;
  -webkit-appearance: none;
  accent-color: var(--accent);
}

.control-group input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--accent);
  cursor: pointer;
}

.control-group .value-display {
  font-size: 14px;
  font-weight: 600;
  color: var(--accent);
  min-width: 36px;
}

.piano-container {
  margin-top: 8px;
}

.piano-keyboard {
  display: flex;
  position: relative;
  height: 160px;
  user-select: none;
}

.piano-key {
  cursor: pointer;
  transition: background 0.05s;
  position: relative;
}

.piano-key.white {
  flex: 1;
  background: var(--piano-white);
  border: 1px solid #ccc;
  border-radius: 0 0 4px 4px;
  height: 100%;
  z-index: 1;
  color: #333;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 6px;
  font-size: 10px;
  font-weight: 600;
}

.piano-key.white:active,
.piano-key.white.active {
  background: #90e0c0;
  box-shadow: inset 0 -3px 0 var(--accent);
}

.piano-key.black {
  position: absolute;
  width: 6%;
  height: 60%;
  background: var(--piano-black);
  border-radius: 0 0 3px 3px;
  z-index: 2;
  color: #aaa;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 4px;
  font-size: 8px;
}

.piano-key.black:active,
.piano-key.black.active {
  background: #444;
  box-shadow: inset 0 -3px 0 var(--accent);
}

.note-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
  gap: 6px;
  margin-top: 12px;
}

.note-cell {
  padding: 10px 4px;
  text-align: center;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 11px;
  transition: all 0.1s;
}

.note-cell:hover {
  border-color: var(--accent);
  background: rgba(0, 255, 136, 0.1);
}

.note-cell .note-name {
  display: block;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.note-cell .note-num {
  display: block;
  font-size: 10px;
  color: var(--text-dim);
}

.note-cell.active {
  background: rgba(0, 255, 136, 0.2);
  border-color: var(--accent);
  box-shadow: 0 0 8px rgba(0, 255, 136, 0.3);
}

.tab-bar {
  display: flex;
  gap: 2px;
  margin-bottom: 16px;
  background: var(--bg-primary);
  border-radius: var(--radius-sm);
  padding: 2px;
}

.tab {
  padding: 8px 20px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all 0.2s;
}

.tab.active {
  background: var(--bg-tertiary);
  color: var(--accent);
}

.tab:hover:not(.active) {
  color: var(--text-primary);
}

.midi-log {
  max-height: 200px;
  overflow-y: auto;
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 12px;
  line-height: 1.6;
}

.midi-log-entry {
  padding: 2px 0;
  border-bottom: 1px solid var(--border);
  display: flex;
  gap: 12px;
}

.midi-log-entry .time {
  color: var(--text-dim);
  min-width: 70px;
}

.midi-log-entry .type {
  color: var(--accent);
  min-width: 50px;
}

.midi-log-entry .detail {
  color: var(--text-secondary);
}

.midi-log-entry.in {
  border-left: 2px solid var(--accent);
  padding-left: 8px;
}

.midi-log-entry.out {
  border-left: 2px solid var(--warning);
  padding-left: 8px;
}

.preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
}

.preset-btn {
  padding: 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  cursor: pointer;
  text-align: center;
  transition: all 0.2s;
}

.preset-btn:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
}

.preset-btn .preset-name {
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
}

.preset-btn .preset-desc {
  display: block;
  font-size: 11px;
  color: var(--text-secondary);
}

.info-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-top: 20px;
  font-size: 12px;
  color: var(--text-secondary);
}

.info-bar .keybind {
  display: inline-block;
  padding: 2px 6px;
  background: var(--bg-primary);
  border-radius: 3px;
  font-size: 11px;
  font-family: monospace;
  margin: 0 2px;
}

@media (max-width: 768px) {
  #app {
    padding: 12px;
  }
  .header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  .controls-row {
    flex-direction: column;
    align-items: stretch;
  }
  .piano-keyboard {
    height: 120px;
  }
  .note-grid {
    grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
  }
}
`
