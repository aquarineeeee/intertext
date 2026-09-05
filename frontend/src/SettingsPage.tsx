import { useEffect, useMemo, useRef, useState } from 'react'
import { api, type ApiUser } from './api'
import { palette } from './theme'

type SectionId = 'reading-log' | 'appearance' | 'companion' | 'data' | 'account'
type Provider = 'openai' | 'anthropic' | 'ollama'

const sections: { id: SectionId; label: string }[] = [
  { id: 'reading-log', label: 'Reading Log' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'companion', label: 'Companion' },
  { id: 'data', label: 'Data' },
  { id: 'account', label: 'Account' },
]

function buildHeatmap() {
  const today = new Date()
  const start = new Date(today)
  start.setFullYear(start.getFullYear() - 1)
  return Array.from({ length: 365 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    const seed = date.getDate() * 17 + (date.getMonth() + 1) * 97
    return { date, count: (seed % 5) as 0 | 1 | 2 | 3 | 4 }
  })
}

function Heatmap({ data }: { data: ReturnType<typeof buildHeatmap> }) {
  const weeks = useMemo(() => {
    const result: (typeof data[number] | null)[][] = []
    let week: (typeof data[number] | null)[] = Array(data[0]?.date.getDay() ?? 0).fill(null)
    for (const day of data) {
      week.push(day)
      if (week.length === 7) { result.push(week); week = [] }
    }
    if (week.length) { while (week.length < 7) week.push(null); result.push(week) }
    return result
  }, [data])

  return (
    <div className="w-full select-none">
      <div className="flex gap-[3px] w-full">
        {weeks.map((week, wi) => <div key={wi} className="flex flex-col gap-[3px] flex-1 min-w-0">
          {week.map((day, di) => <div key={di} className="w-full rounded-[2px]" style={{ aspectRatio: '1', backgroundColor: day ? palette.settingsHeat[day.count] : 'transparent' }} title={day ? `${day.date.toLocaleDateString()}: ${day.count * 30} min` : ''} />)}
        </div>)}
      </div>
      <div className="flex items-center gap-1.5 mt-2.5"><span className="text-[10px]" style={{ color: palette.settingsMuted }}>Less</span>{palette.settingsHeat.map(color => <div key={color} className="w-2.5 h-2.5 rounded-[2px]" style={{ backgroundColor: color }} />)}<span className="text-[10px]" style={{ color: palette.settingsMuted }}>More</span></div>
    </div>
  )
}

function Divider() { return <div style={{ borderTop: `1px solid ${palette.settingsBorder}` }} /> }

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontFamily: 'Lora, Georgia, serif', fontSize: 18, fontWeight: 500, color: palette.settingsFg, marginBottom: 28 }}>{children}</h2>
}

function Row({ label, children, alignTop = false }: { label: string; children: React.ReactNode; alignTop?: boolean }) {
  return <div className={`flex gap-8 py-4 ${alignTop ? 'items-start' : 'items-center'}`}><span className="text-sm shrink-0 w-36" style={{ color: palette.settingsMuted, paddingTop: alignTop ? 2 : 0 }}>{label}</span><div className="flex-1 flex justify-end items-start">{children}</div></div>
}

function Seg({ options, value, onChange }: { options: string[]; value: string; onChange: (value: string) => void }) {
  return <div className="flex overflow-hidden rounded" style={{ border: `1px solid ${palette.settingsBorder}` }}>{options.map((option, index) => <button key={option} onClick={() => onChange(option)} className="px-4 py-1.5 text-sm" style={{ borderLeft: index ? `1px solid ${palette.settingsBorder}` : 'none', backgroundColor: value === option ? palette.settingsFg : 'transparent', color: value === option ? palette.settingsBg : palette.settingsFg }}>{option}</button>)}</div>
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return <button aria-label={on ? 'On' : 'Off'} onClick={onToggle} className="relative flex-shrink-0" style={{ width: 36, height: 20, borderRadius: 10, backgroundColor: on ? palette.settingsFg : palette.settingsBorder }}><span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 16, height: 16, borderRadius: '50%', backgroundColor: palette.white, transition: 'left .2s' }} /></button>
}

export default function SettingsPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [active, setActive] = useState<SectionId>('reading-log')
  const [typeface, setTypeface] = useState('Serif')
  const [textSize, setTextSize] = useState(16)
  const [lineHeight, setLineHeight] = useState(1.5)
  const [mode, setMode] = useState('Day')
  const [companionStyle, setCompanionStyle] = useState('Discussion')
  const [prompt, setPrompt] = useState('You are a thoughtful reading companion. Engage deeply with texts, offer interpretive perspectives, and ask questions that open new lines of thought rather than closing them.')
  const [advanced, setAdvanced] = useState(false)
  const [provider, setProvider] = useState<Provider>('ollama')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [shareStats, setShareStats] = useState(false)
  const [user, setUser] = useState<ApiUser | null>(null)
  const refs = useRef<Record<SectionId, HTMLElement | null>>({ 'reading-log': null, appearance: null, companion: null, data: null, account: null })
  const heatmap = useMemo(buildHeatmap, [])

  useEffect(() => { void api.me().then(setUser).catch(() => undefined) }, [])

  useEffect(() => {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) setActive(entry.target.id as SectionId) }), { rootMargin: '-60px 0px -65% 0px' })
    Object.values(refs.current).forEach(element => element && observer.observe(element))
    return () => observer.disconnect()
  }, [])

  const scrollTo = (id: SectionId) => { setActive(id); refs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  const signOut = async () => { await api.logout().catch(() => undefined); onNavigate('/') }

  return <div className="flex h-full min-h-0 overflow-auto" style={{ backgroundColor: palette.settingsBg, color: palette.settingsFg }}>
    <aside className="sticky top-0 h-screen flex-shrink-0 flex flex-col pt-10 pb-8 pl-8 pr-6" style={{ width: 210 }}>
      <button onClick={() => onNavigate('/')} className="text-left text-xs mb-8" style={{ color: palette.settingsMuted }}>← Library</button>
      <h1 className="font-medium mb-10 leading-snug" style={{ fontFamily: 'Lora, Georgia, serif', fontSize: 20, color: palette.settingsFg }}>Settings</h1>
      <nav className="flex flex-col">{sections.map(section => <button key={section.id} onClick={() => scrollTo(section.id)} className="text-left py-2.5 pl-3 text-[13px]" style={{ borderLeft: `2px solid ${active === section.id ? palette.settingsFg : 'transparent'}`, color: active === section.id ? palette.settingsFg : palette.settingsMuted, fontWeight: active === section.id ? 500 : 400 }}>{section.label}</button>)}</nav>
    </aside>

    <main className="flex-1 min-w-0 pt-10 pl-12 pr-16 pb-40" style={{ maxWidth: 820 }}>
      <section id="reading-log" ref={element => { refs.current['reading-log'] = element }} className="mb-16" style={{ scrollMarginTop: 32 }}><SectionHeading>Reading Log</SectionHeading><div className="flex gap-10 mb-10">{[['23', 'day streak'], ['14.2h', 'this month'], ['31', 'books finished']].map(([value, label]) => <div key={label}><div className="text-3xl font-medium" style={{ fontFamily: 'Lora, Georgia, serif' }}>{value}</div><div className="text-xs mt-1" style={{ color: palette.settingsMuted }}>{label}</div></div>)}</div><Heatmap data={heatmap} /></section>
      <Divider />

      <section id="appearance" ref={element => { refs.current.appearance = element }} className="my-16" style={{ scrollMarginTop: 32 }}><SectionHeading>Appearance</SectionHeading><Row label="Typeface"><Seg options={['Serif', 'Sans', 'Mono']} value={typeface} onChange={setTypeface} /></Row><Divider /><Row label="Text size"><div className="flex items-center gap-3"><span className="text-[11px]" style={{ color: palette.settingsMuted }}>A</span><input type="range" min={12} max={24} value={textSize} onChange={event => setTextSize(+event.target.value)} className="w-36" /><span className="text-[17px]" style={{ color: palette.settingsMuted }}>A</span><span className="text-xs ml-1 w-8" style={{ color: palette.settingsMuted }}>{textSize}px</span></div></Row><Divider /><Row label="Line height"><div className="flex items-center gap-3"><span className="text-xs" style={{ color: palette.settingsMuted }}>Compact</span><input type="range" min={1} max={2} step={0.05} value={lineHeight} onChange={event => setLineHeight(+event.target.value)} className="w-32" /><span className="text-xs" style={{ color: palette.settingsMuted }}>Airy</span></div></Row><Divider /><Row label="Mode"><Seg options={['Day', 'Night']} value={mode} onChange={setMode} /></Row></section>
      <Divider />

      <section id="companion" ref={element => { refs.current.companion = element }} className="my-16" style={{ scrollMarginTop: 32 }}><SectionHeading>Companion</SectionHeading><Row label="Style" alignTop><div className="flex flex-col gap-4">{[['Guided', 'Leads with questions and prompts'], ['Discussion', 'Engages as a reading partner'], ['Concise', 'Brief, focused responses only']].map(([value, description]) => <button key={value} onClick={() => setCompanionStyle(value)} className="flex items-start gap-3 text-left"><span className="mt-0.5 flex-shrink-0 flex items-center justify-center rounded-full" style={{ width: 15, height: 15, border: `2px solid ${companionStyle === value ? palette.settingsFg : palette.settingsBorder}`, backgroundColor: companionStyle === value ? palette.settingsFg : 'transparent' }}>{companionStyle === value && <span className="rounded-full" style={{ width: 5, height: 5, backgroundColor: palette.settingsBg }} />}</span><span><span className="block text-sm font-medium">{value}</span><span className="block text-xs mt-0.5" style={{ color: palette.settingsMuted }}>{description}</span></span></button>)}</div></Row><Divider /><div className="py-4"><p className="text-sm mb-3" style={{ color: palette.settingsMuted }}>Preset prompt</p><textarea value={prompt} onChange={event => setPrompt(event.target.value)} rows={4} className="w-full text-sm bg-transparent resize-none outline-none leading-relaxed rounded" style={{ border: `1px solid ${palette.settingsBorder}`, padding: '10px 12px', color: palette.settingsFg, fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1.65 }} /></div><Divider /><div className="py-4"><button onClick={() => setAdvanced(value => !value)} className="flex items-center gap-2 text-sm" style={{ color: palette.settingsMuted }}><span style={{ display: 'inline-block', transform: advanced ? 'rotate(90deg)' : undefined }}>▶</span>Advanced</button>{advanced && <div className="mt-6"><Row label="Provider" alignTop><div className="flex flex-wrap gap-1.5 justify-end">{(['ollama', 'openai', 'anthropic'] as Provider[]).map(value => <button key={value} onClick={() => setProvider(value)} className="px-3 py-1 text-xs rounded" style={{ border: `1px solid ${provider === value ? palette.settingsFg : palette.settingsBorder}`, backgroundColor: provider === value ? palette.settingsFg : 'transparent', color: provider === value ? palette.settingsBg : palette.settingsMuted }}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div></Row><Divider /><Row label="API Key"><input type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder="sk-..." className="bg-transparent outline-none text-sm pb-1" style={{ borderBottom: `1px solid ${palette.settingsBorder}`, color: palette.settingsFg, width: 280, fontFamily: 'ui-monospace, monospace' }} /></Row>{provider === 'ollama' && <><Divider /><Row label="Base URL"><input value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder="http://localhost:11434" className="bg-transparent outline-none text-sm pb-1" style={{ borderBottom: `1px solid ${palette.settingsBorder}`, color: palette.settingsFg, width: 280 }} /></Row></>}</div>}</div></section>
      <Divider />

      <section id="data" ref={element => { refs.current.data = element }} className="my-16" style={{ scrollMarginTop: 32 }}><SectionHeading>Data</SectionHeading><div className="flex items-center gap-2 mb-6"><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: palette.success }} /><span className="text-sm" style={{ color: palette.settingsMuted }}>Synced just now</span></div><Row label="Export all data"><a href="/api/v1/data/export" className="text-sm" style={{ color: palette.settingsFg }}>Export →</a></Row><Divider /><Row label="Clear cache"><button onClick={() => window.localStorage.clear()} className="text-sm" style={{ color: palette.danger }}>Clear →</button></Row></section>
      <Divider />

      <section id="account" ref={element => { refs.current.account = element }} className="my-16" style={{ scrollMarginTop: 32 }}><SectionHeading>Account & Privacy</SectionHeading><div className="flex items-center gap-4 mb-8"><div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium" style={{ backgroundColor: palette.settingsBorder, color: palette.settingsFg }}>{(user?.display_name || user?.email || 'R').charAt(0).toUpperCase()}</div><div><div className="text-sm" style={{ color: palette.settingsFg }}>{user?.display_name || 'Reader'}</div><div className="text-xs" style={{ color: palette.settingsMuted }}>{user?.email || 'Not signed in'}</div></div></div><Row label="Share reading stats"><Toggle on={shareStats} onToggle={() => setShareStats(value => !value)} /></Row><Divider /><Row label="Password"><button className="text-sm" style={{ color: palette.settingsFg }}>Change password →</button></Row><div className="flex items-center gap-6 mt-12"><button onClick={() => void signOut()} className="text-sm" style={{ color: palette.settingsMuted }}>Sign out</button><button className="text-sm" style={{ color: palette.danger }}>Delete account</button></div></section>
    </main>
  </div>
}
