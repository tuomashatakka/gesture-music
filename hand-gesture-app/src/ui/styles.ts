/**
 * Scoped styles for the right drawer. All rules live under `.gm-drawer` /
 * `.gm-*` so they never touch the rest of the app. Palette matches the sibling
 * hand-midi-controller (dark #1a1a2e / accent #00ff88).
 */
export const drawerStyles = `
.gm-toggle {
  position: fixed; top: 10px; right: 110px; z-index: 1001;
  padding: 8px 14px; border: none; border-radius: 4px;
  background: rgba(60,60,60,0.9); color: #fff; cursor: pointer;
  font-family: sans-serif; font-size: 14px;
}
.gm-toggle:hover { background: rgba(0,255,136,0.25); }

.gm-drawer {
  position: fixed; top: 0; right: 0; height: 100vh; width: 420px; max-width: 92vw;
  background: #16213e; border-left: 1px solid #2a2a4a; z-index: 1002;
  transform: translateX(100%); transition: transform 0.25s ease;
  display: flex; flex-direction: column; color: #e0e0e0;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  box-shadow: -8px 0 24px rgba(0,0,0,0.45);
}
.gm-drawer.open { transform: translateX(0); }

.gm-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; border-bottom: 1px solid #2a2a4a;
}
.gm-head h2 { margin: 0; font-size: 16px; color: #00ff88; letter-spacing: 0.5px; }
.gm-status { font-size: 11px; color: #a0a0a0; display: flex; align-items: center; gap: 6px; }
.gm-dot { width: 9px; height: 9px; border-radius: 50%; background: #ff6b6b; }
.gm-dot.on { background: #00ff88; box-shadow: 0 0 8px #00ff88; }
.gm-close { background: none; border: none; color: #a0a0a0; font-size: 20px; cursor: pointer; }

.gm-tabbar { display: flex; gap: 2px; padding: 8px; background: #1a1a2e; }
.gm-tab {
  flex: 1; padding: 8px 10px; border: none; background: transparent;
  color: #a0a0a0; font-size: 13px; cursor: pointer; border-radius: 4px;
}
.gm-tab.active { background: #0f3460; color: #00ff88; }
.gm-tab:hover:not(.active) { color: #fff; }

.gm-body { flex: 1; overflow-y: auto; padding: 12px 16px; }
.gm-panel { display: none; }
.gm-panel.active { display: block; }

.gm-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
.gm-row label { font-size: 12px; color: #a0a0a0; }
.gm-select, .gm-input {
  padding: 5px 8px; background: #1a1a2e; border: 1px solid #2a2a4a;
  border-radius: 4px; color: #e0e0e0; font-size: 12px; outline: none;
}
.gm-input { width: 64px; }
.gm-select:focus, .gm-input:focus { border-color: #00ff88; }

.gm-btn {
  padding: 6px 12px; border: none; border-radius: 4px; font-size: 12px;
  cursor: pointer; background: #0f3460; color: #e0e0e0; border: 1px solid #2a2a4a;
}
.gm-btn:hover { border-color: #00ff88; }
.gm-btn.primary { background: #00ff88; color: #1a1a2e; border: none; font-weight: 600; }
.gm-btn.danger { background: #ff6b6b; color: #fff; border: none; }
.gm-btn.mini { padding: 2px 8px; font-size: 11px; }

.gm-log { font-family: 'SF Mono', monospace; font-size: 11.5px; line-height: 1.55; }
.gm-log-entry { display: flex; gap: 10px; padding: 2px 0 2px 8px; border-left: 2px solid #ffd93d; border-bottom: 1px solid #20203a; }
.gm-log-entry .t { color: #666; min-width: 64px; }
.gm-log-entry .ty { color: #00ff88; min-width: 64px; }
.gm-log-entry .d { color: #a0a0a0; }

.gm-card {
  background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 8px;
  padding: 12px; margin-bottom: 12px;
}
.gm-card-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.gm-card-head .name { font-weight: 700; color: #00ff88; text-transform: uppercase; font-size: 13px; letter-spacing: 1px; flex: 1; }
.gm-route { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 6px; border-radius: 6px; background: #16213e; margin-bottom: 6px; }
.gm-route .arrow { color: #666; }
.gm-route .rng { display: flex; align-items: center; gap: 3px; font-size: 11px; color: #777; }
.gm-route .gm-input { width: 52px; }
.gm-hint { font-size: 11px; color: #777; margin: 4px 0 12px; }
`
