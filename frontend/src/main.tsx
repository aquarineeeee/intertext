import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { palette } from './theme'
import './index.css'

const rootStyle = document.documentElement.style
rootStyle.setProperty('--color-bg', palette.bg)
rootStyle.setProperty('--color-fg', palette.fg)
rootStyle.setProperty('--color-card', palette.card)
rootStyle.setProperty('--color-card-deep', palette.cardDeep)
rootStyle.setProperty('--color-muted', palette.muted)
rootStyle.setProperty('--color-border', palette.border)
rootStyle.setProperty('--color-border-mid', palette.borderMid)
rootStyle.setProperty('--color-accent', palette.accent)
rootStyle.setProperty('--color-danger', palette.danger)
rootStyle.setProperty('--color-success', palette.success)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
