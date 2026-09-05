import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import './theme/tokens.css'
import './theme/typography.css'
import './theme/primitives.css'
import './theme/ornaments.css'
import './theme/themes/amber.css'
import './theme/themes/calm.css'
import './theme/themes/neon.css'
import './theme/command-shell.css'
import './theme/market-command.css'
import './theme/war-room.css'
import './theme/workspaces.css'
import './theme/modals.css'
import './theme/responsive.css'
import './theme/r663-market-energy.css'
import './theme/r663-market-density.css'
import './theme/r663-chart-electric.css'
import './theme/r663-viewport-convergence.css'
import './theme/r663-reference-composition.css'
import './theme/r663-reference-lock.css'
import './theme/r663-first-viewport-command-017z.css'
import { applyStoredAppearance } from './components/ThemeStudio'

// 必须在 React 挂载**之前**同步套上主题。
// 放进组件的 effect 里会晚一帧，玩家会看到默认色闪一下再变 ——
// 深色界面上这一闪特别刺眼。
applyStoredAppearance()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
