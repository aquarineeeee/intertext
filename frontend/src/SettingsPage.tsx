import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronRight, RefreshCw, Trash2 } from "lucide-react"
import {
  api,
  type ApiAIProvider,
  type ApiMCPServer,
  type ApiMCPTool,
  type ApiReadingStats,
  type ApiUser,
  type CompanionStyle,
} from "./api"
import ConfirmDialog from "./ConfirmDialog"
import { palette } from "./theme"

type SectionId = "reading-log" | "appearance" | "companion" | "data" | "account"
type Provider = "openai" | "anthropic" | "ollama" | "others"
const sections: { id: SectionId label: string }[] = [
  { id: "reading-log", label: "Reading Log" },
  { id: "appearance", label: "Appearance" },
  { id: "companion", label: "Companion" },
  { id: "data", label: "Data" },
  { id: "account", label: "Account" },
]
const heatColors = ["#E7F0EA", "#CFE2D4", "#A9CBB3", "#78AC89", "#4F8B67"]
const emptyStats: ApiReadingStats = {
  day_streak: 0,
  active_days_this_month: 0,
  books_finished: 0,
  activity: [],
}
const providerDefaults: Record<Exclude<Provider, "others">, {
  baseUrl: string
  model: string
}> = {
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  anthropic: {
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-3-5-sonnet-latest",
  },
  ollama: { baseUrl: "http://localhost:11434/api", model: "llama3.2" },
}

function Heatmap({ data }: { data: ApiReadingStats["activity"] }) {
  const days = useMemo(
    () =>
      data.map((day) => ({
        date: new Date(`${day.date}T00:00:00`),
        count: Math.min(4, Math.max(0, day.count)),
      })),
    [data],
  )
  const weeks = useMemo(() => {
    if (!days.length) return []
    const result: (typeof days[number] | null)[][] = []
    let week: (typeof days[number] | null)[] = Array(
      days[0].date.getDay(),
    ).fill(null)
    for (const day of days) {
      week.push(day)
      if (week.length === 7) {
        result.push(week)
        week = []
      }
    }
    if (week.length) {
      while (week.length < 7) week.push(null)
      result.push(week)
    }
    return result
  }, [days])
  const monthLabels = weeks
    .map((week, index) => {
      const first = week.find(Boolean)
      return first && (index === 0 || first.date.getDate() <= 7)
        ? {
            index,
            label: first.date.toLocaleDateString(undefined, { month: "short" }),
          }
        : null
    })
    .filter(Boolean) as Array<{ index: number label: string }>
  return (
    <div
      className="settings-heatmap"
      aria-label="Reading activity over the last year"
    >
      <div className="settings-heatmap-months">
        {monthLabels.map((item) => (
          <span
            key={`${item.index}-${item.label}`}
            style={{
              left: `${(item.index / Math.max(1, weeks.length - 1)) * 100}%`,
            }}
          >
            {item.label}
          </span>
        ))}
      </div>
      <div className="settings-heatmap-grid">
        {weeks.map((week, wi) => (
          <div key={wi} className="settings-heatmap-week">
            {week.map((day, di) => (
              <div
                key={di}
                className="settings-heat-cell"
                title={
                  day
                    ? `${day.date.toLocaleDateString()}: ${day.count} activity`
                    : ""
                }
                style={{
                  backgroundColor: day ? heatColors[day.count] : "transparent",
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="settings-heatmap-legend">
        <span>Less</span>
        {heatColors.map((color) => (
          <i key={color} style={{ backgroundColor: color }} />
        ))}
        <span>More</span>
      </div>
    </div>
  )
}
function Divider() {
  return <div className="settings-divider" />
}
function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="settings-section-heading">{children}</h2>
}
function Row({
  label,
  children,
  alignTop = false,
}: {
  label: string
  children: React.ReactNode
  alignTop?: boolean
}) {
  return (
    <div className={`settings-row ${alignTop ? "settings-row-top" : ""}`}>
      <span>{label}</span>
      <div>{children}</div>
    </div>
  )
}
function Seg({
  options,
  value,
  onChange,
}: {
  options: string[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="settings-seg">
      {options.map((option) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          className={value === option ? "is-selected" : ""}
        >
          {option}
        </button>
      ))}
    </div>
  )
}
function Toggle({
  on,
  onToggle,
  label,
}: {
  on: boolean
  onToggle: () => void
  label?: string
}) {
  return (
    <button
      type="button"
      aria-label={label || (on ? "On" : "Off")}
      aria-pressed={on}
      onClick={onToggle}
      className={`settings-toggle ${on ? "is-on" : ""}`}
    >
      <span />
    </button>
  )
}

export default function SettingsPage({
  onNavigate,
}: {
  onNavigate: (path: string) => void
}) {
  const [active, setActive] = useState<SectionId>("reading-log")
  const [typeface, setTypeface] = useState("Serif")
  const [textSize, setTextSize] = useState(16)
  const [lineHeight, setLineHeight] = useState(1.5)
  const [mode, setMode] = useState("Day")
  const [companionStyle, setCompanionStyle] =
    useState<CompanionStyle>("discussion")
  const [prompt, setPrompt] = useState("")
  const [promptNotice, setPromptNotice] = useState("")
  const [promptSaving, setPromptSaving] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const [provider, setProvider] = useState<Provider>("ollama")
  const [apiKey, setApiKey] = useState("")
  const [baseUrl, setBaseUrl] = useState(providerDefaults.ollama.baseUrl)
  const [model, setModel] = useState(providerDefaults.ollama.model)
  const [interfaceFormat, setInterfaceFormat] =
    useState<"openai" | "anthropic" | "ollama">("openai")
  const [providerName, setProviderName] = useState("My provider")
  const [providerNotice, setProviderNotice] = useState("")
  const [providerId, setProviderId] = useState<string | null>(null)
  const [providerHasKey, setProviderHasKey] = useState(false)
  const [providerSaving, setProviderSaving] = useState(false)
  const [mcpServers, setMcpServers] = useState<ApiMCPServer[]>([])
  const [mcpLoading, setMcpLoading] = useState(false)
  const [mcpNotice, setMcpNotice] = useState("")
  const [mcpAdding, setMcpAdding] = useState(false)
  const [mcpSaving, setMcpSaving] = useState(false)
  const [mcpRefreshing, setMcpRefreshing] = useState<Record<string, boolean>>(
    {},
  )
  const [mcpToolsOpen, setMcpToolsOpen] = useState<Record<string, boolean>>({})
  const [pendingMcpDelete, setPendingMcpDelete] = useState<ApiMCPServer | null>(
    null,
  )
  const [mcpDeleting, setMcpDeleting] = useState(false)
  const [mcpDeleteError, setMcpDeleteError] = useState<string | null>(null)
  const [mcpName, setMcpName] = useState("")
  const [mcpEndpoint, setMcpEndpoint] = useState("")
  const [mcpTransport, setMcpTransport] =
    useState<ApiMCPServer["transport"]>("streamable-http")
  const [mcpToken, setMcpToken] = useState("")
  const [stats, setStats] = useState<ApiReadingStats>(emptyStats)
  const [statsLoading, setStatsLoading] = useState(true)
  const [shareStats, setShareStats] = useState(false)
  const [user, setUser] = useState<ApiUser | null>(null)
  const [providers, setProviders] = useState<ApiAIProvider[]>([])
  const refs = useRef<Record<SectionId, HTMLElement | null>>({
    "reading-log": null,
    appearance: null,
    companion: null,
    data: null,
    account: null,
  })
  useEffect(() => {
    void api
      .me()
      .then(setUser)
      .catch(() => undefined)
    void api
      .getReadingStats()
      .then(setStats)
      .catch(() => undefined)
      .finally(() => setStatsLoading(false))
    void api
      .listAIProviders()
      .then(setProviders)
      .catch(() => undefined)
    setMcpLoading(true)
    void api
      .listMCPServers()
      .then(async (servers) => {
        const discovered = await Promise.all(
          servers.map(async (server) => {
            if (!server.enabled) return server
            try {
              const tools = await api.discoverMCPTools(server.id)
              return { ...server, capabilities: { tools } }
            } catch {
              return server
            }
          }),
        )
        setMcpServers(discovered)
      })
      .catch(() => undefined)
      .finally(() => setMcpLoading(false))
    void api
      .getUserSettings()
      .then((settings) => {
        setCompanionStyle(settings.style)
        setPrompt(settings.prompt)
      })
      .catch(() => undefined)
  }, [])
  useEffect(() => {
    if (providers.length && providerId === null) selectProvider(provider)
  }, [providers])
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(entry.target.id as SectionId)
        }),
      { rootMargin: "-40px 0px -65% 0px" },
    )
    Object.values(refs.current).forEach(
      (element) => element && observer.observe(element),
    )
    return () => observer.disconnect()
  }, [])
  const scrollTo = (id: SectionId) => {
    setActive(id)
    refs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" })
  }
  const selectProvider = (value: Provider) => {
    setProvider(value)
    setProviderNotice("")
    const existing =
      value === "others"
        ? providers.find((item) => item.provider_type === "custom")
        : providers.find((item) => item.provider_type === value)
    setProviderId(existing?.id || null)
    setProviderHasKey(Boolean(existing?.has_api_key))
    setApiKey("")
    if (existing) {
      setBaseUrl(
        existing.base_url ||
          (value === "others" ? "" : providerDefaults[value].baseUrl),
      )
      setModel(existing.model)
      setProviderName(existing.name)
      if (existing.interface_format)
        setInterfaceFormat(existing.interface_format)
    } else if (value === "others") {
      setBaseUrl("")
      setModel("")
      setProviderName("My provider")
      setInterfaceFormat("openai")
    } else {
      setBaseUrl(providerDefaults[value].baseUrl)
      setModel(providerDefaults[value].model)
      setProviderName(value[0].toUpperCase() + value.slice(1))
    }
  }
  const saveProvider = async () => {
    const needsKey = provider === "openai" || provider === "anthropic"
    if (
      (needsKey && !apiKey.trim() && !providerHasKey) ||
      !model.trim() ||
      !baseUrl.trim()
    ) {
      setProviderNotice(
        needsKey && !apiKey.trim() && !providerHasKey
          ? "请填写 API Key"
          : "请填写 Model 和 Base URL",
      )
      return
    }
    setProviderSaving(true)
    try {
      const payload = {
        name:
          provider === "others"
            ? providerName.trim() || "My provider"
            : providerName,
        provider_type: provider === "others" ? "custom" as const : provider,
        ...(provider === "others" ? { interface_format: interfaceFormat } : {}),
        model: model.trim(),
        base_url: baseUrl.trim(),
        ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
      }
      const saved = providerId
        ? await api.updateAIProvider(providerId, payload)
        : await api.createAIProvider(payload)
      setProviders((current) =>
        providerId
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [...current, saved],
      )
      setProviderId(saved.id)
      setProviderHasKey(saved.has_api_key)
      setProviderNotice("已保存")
      setApiKey("")
    } catch (error) {
      setProviderNotice(error instanceof Error ? error.message : "保存失败")
    } finally {
      setProviderSaving(false)
    }
  }
  const signOut = async () => {
    await api.logout().catch(() => undefined)
    onNavigate("/")
  }
  const chooseStyle = async (style: CompanionStyle) => {
    const previousStyle = companionStyle
    setCompanionStyle(style)
    setPromptNotice("")
    if (style === "custom") return
    try {
      const settings = await api.updateUserSettings({ style })
      setPrompt(settings.prompt)
    } catch (error) {
      setCompanionStyle(previousStyle)
      setPromptNotice(error instanceof Error ? error.message : "保存失败")
    }
  }
  const saveCustomPrompt = async () => {
    const customPrompt = prompt.trim()
    if (!customPrompt) {
      setPromptNotice("请输入自定义提示词")
      return
    }
    setPromptSaving(true)
    setPromptNotice("")
    try {
      const settings = await api.updateUserSettings({
        style: "custom",
        prompt: customPrompt,
      })
      setPrompt(settings.prompt)
      setPromptNotice("已保存")
    } catch (error) {
      setPromptNotice(error instanceof Error ? error.message : "保存失败")
    } finally {
      setPromptSaving(false)
    }
  }
  const resetMcpForm = () => {
    setMcpName("")
    setMcpEndpoint("")
    setMcpTransport("streamable-http")
    setMcpToken("")
    setMcpAdding(false)
  }
  const refreshMcpTools = async (
    serverId: string,
  ): Promise<ApiMCPTool[] | null> => {
    setMcpRefreshing((current) => ({ ...current, [serverId]: true }))
    setMcpNotice("")
    try {
      const tools = await api.discoverMCPTools(serverId)
      setMcpServers((current) =>
        current.map((server) =>
          server.id === serverId
            ? { ...server, capabilities: { tools } }
            : server,
        ),
      )
      return tools
    } catch (error) {
      setMcpNotice(error instanceof Error ? error.message : "工具发现失败")
      return null
    } finally {
      setMcpRefreshing((current) => ({ ...current, [serverId]: false }))
    }
  }
  const saveMcpServer = async () => {
    const name = mcpName.trim()
    if (!name || !mcpEndpoint.trim()) {
      setMcpNotice("请填写名称和 Endpoint")
      return
    }
    if (mcpServers.some((server) => server.name === name)) {
      setMcpNotice("MCP Server 名称已存在")
      return
    }
    setMcpSaving(true)
    setMcpNotice("")
    try {
      const saved = await api.createMCPServer({
        name,
        endpoint: mcpEndpoint.trim(),
        transport: mcpTransport,
        token: mcpToken.trim() || undefined,
        enabled: true,
      })
      let enriched = saved
      const tools = await refreshMcpTools(saved.id)
      if (tools) enriched = { ...saved, capabilities: { tools } }
      setMcpServers((current) => [...current, enriched])
      resetMcpForm()
      setMcpNotice("MCP Server 已保存")
    } catch (error) {
      setMcpNotice(error instanceof Error ? error.message : "保存失败")
    } finally {
      setMcpSaving(false)
    }
  }
  const toggleMcpServer = async (server: ApiMCPServer) => {
    try {
      const updated = await api.updateMCPServer(server.id, {
        enabled: !server.enabled,
      })
      setMcpServers((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      )
    } catch (error) {
      setMcpNotice(error instanceof Error ? error.message : "更新失败")
    }
  }
  const requestMcpDelete = (server: ApiMCPServer) => {
    setMcpDeleteError(null)
    setPendingMcpDelete(server)
  }
  const removeMcpServer = async () => {
    if (!pendingMcpDelete || mcpDeleting) return
    const server = pendingMcpDelete
    setMcpDeleting(true)
    setMcpDeleteError(null)
    try {
      await api.deleteMCPServer(server.id)
      setMcpServers((current) =>
        current.filter((item) => item.id !== server.id),
      )
      setPendingMcpDelete(null)
    } catch (error) {
      setMcpDeleteError(error instanceof Error ? error.message : "删除失败")
    } finally {
      setMcpDeleting(false)
    }
  }
  return (
    <div
      className="settings-page"
      style={{ backgroundColor: palette.bg, color: palette.fg }}
    >
      <aside className="settings-sidebar">
        <button
          onClick={() => onNavigate("/library")}
          className="settings-back"
        >
          ← Library
        </button>
        <h1>Settings</h1>
        <nav>
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => scrollTo(section.id)}
              className={active === section.id ? "is-active" : ""}
            >
              {section.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="settings-main">
        <section
          id="reading-log"
          ref={(element) => {
            refs.current["reading-log"] = element
          }}
          className="settings-section"
        >
          <SectionHeading>Reading Log</SectionHeading>
          <div className="settings-metrics">
            <div>
              <strong>{statsLoading ? "—" : stats.day_streak}</strong>
              <span>day streak</span>
            </div>
            <div>
              <strong>
                {statsLoading ? "—" : stats.active_days_this_month}
              </strong>
              <span>active days this month</span>
            </div>
            <div>
              <strong>{statsLoading ? "—" : stats.books_finished}</strong>
              <span>books finished</span>
            </div>
          </div>
          {stats.activity.length ? (
            <Heatmap data={stats.activity} />
          ) : (
            <p className="settings-empty">No reading activity recorded yet.</p>
          )}
        </section>
        <Divider />
        <section
          id="appearance"
          ref={(element) => {
            refs.current.appearance = element
          }}
          className="settings-section"
        >
          <SectionHeading>Appearance</SectionHeading>
          <Row label="Typeface">
            <Seg
              options={["Serif", "Sans", "Mono"]}
              value={typeface}
              onChange={setTypeface}
            />
          </Row>
          <Divider />
          <Row label="Text size">
            <div className="settings-range">
              <span>A</span>
              <input
                type="range"
                min={12}
                max={24}
                value={textSize}
                onChange={(event) => setTextSize(+event.target.value)}
              />
              <b>A</b>
              <em>{textSize}px</em>
            </div>
          </Row>
          <Divider />
          <Row label="Line height">
            <div className="settings-range">
              <span>Compact</span>
              <input
                type="range"
                min={1}
                max={2}
                step={0.05}
                value={lineHeight}
                onChange={(event) => setLineHeight(+event.target.value)}
              />
              <span>Airy</span>
            </div>
          </Row>
          <Divider />
          <Row label="Mode">
            <Seg options={["Day", "Night"]} value={mode} onChange={setMode} />
          </Row>
        </section>
        <Divider />
        <section
          id="companion"
          ref={(element) => {
            refs.current["companion"] = element
          }}
          className="settings-section"
        >
          <SectionHeading>Companion</SectionHeading>
          <Row label="Style" alignTop>
            <div className="settings-options">
              {[
                ["guided", "Guided", "Leads with questions and prompts"],
                ["discussion", "Discussion", "Engages as a reading partner"],
                ["concise", "Concise", "Brief, focused responses only"],
                ["custom", "Custom", "Use your own system prompt"],
              ].map(([value, label, description]) => (
                <button
                  key={value}
                  onClick={() => void chooseStyle(value as CompanionStyle)}
                  className={companionStyle === value ? "is-selected" : ""}
                >
                  <span>
                    <b>{label}</b>
                    <small>{description}</small>
                  </span>
                  <strong>›</strong>
                </button>
              ))}
            </div>
          </Row>
          {companionStyle === "custom" && (
            <>
              <Divider />
              <div className="settings-prompt">
                <label htmlFor="custom-companion-prompt">Custom prompt</label>
                <textarea
                  id="custom-companion-prompt"
                  value={prompt}
                  onChange={(event) => {
                    setPrompt(event.target.value)
                    setPromptNotice("")
                  }}
                  rows={4}
                  maxLength={20000}
                  placeholder="Describe how you want your reading companion to respond…"
                />
                <div className="settings-prompt-actions">
                  <span
                    className={promptNotice === "已保存" ? "is-success" : ""}
                  >
                    {promptNotice}
                  </span>
                  <button
                    onClick={() => void saveCustomPrompt()}
                    disabled={promptSaving}
                  >
                    {promptSaving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </>
          )}
          <Divider />
          <div className="settings-advanced">
            <button
              onClick={() => setAdvanced((value) => !value)}
              className="settings-advanced-toggle"
            >
              <span className={advanced ? "is-open" : ""}>›</span>Advanced
            </button>
            {advanced && (
              <div className="settings-advanced-body">
                <Row label="Provider" alignTop>
                  <div className="settings-provider-list">
                    {([
                      "openai",
                      "anthropic",
                      "ollama",
                      "others",
                    ] as Provider[]).map((value) => (
                      <button
                        key={value}
                        onClick={() => selectProvider(value)}
                        className={provider === value ? "is-selected" : ""}
                      >
                        {value[0].toUpperCase() + value.slice(1)}
                      </button>
                    ))}
                  </div>
                </Row>
                <Divider />
                {provider === "others" && (
                  <>
                    <Row label="Name">
                      <input
                        className="settings-input"
                        value={providerName}
                        onChange={(event) =>
                          setProviderName(event.target.value)
                        }
                      />
                    </Row>
                    <Divider />
                    <Row label="Interface format">
                      <select
                        className="settings-input"
                        value={interfaceFormat}
                        onChange={(event) =>
                          setInterfaceFormat(
                            event.target.value as typeof interfaceFormat,
                          )
                        }
                      >
                        <option value="openai">OpenAI compatible</option>
                        <option value="anthropic">Anthropic compatible</option>
                        <option value="ollama">Ollama compatible</option>
                      </select>
                    </Row>
                    <Divider />
                  </>
                )}
                <Row label="API Key">
                  <input
                    type="password"
                    className="settings-input"
                    value={apiKey}
                    onChange={(event) => {
                      setApiKey(event.target.value)
                      setProviderNotice("")
                    }}
                    placeholder={
                      providerHasKey
                        ? "已配置，留空则保持不变"
                        : provider === "ollama"
                          ? "可选"
                          : "sk-..."
                    }
                  />
                </Row>
                <Divider />
                <Row label="Base URL">
                  <input
                    className="settings-input"
                    value={baseUrl}
                    onChange={(event) => setBaseUrl(event.target.value)}
                    readOnly={provider !== "others"}
                    aria-label={
                      provider === "others" ? "Base URL" : "默认 Base URL"
                    }
                  />
                </Row>
                <Divider />
                <Row label="Model">
                  <input
                    className="settings-input"
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    placeholder="model name"
                  />
                </Row>
                <div className="settings-provider-actions">
                  <button
                    onClick={() => void saveProvider()}
                    disabled={providerSaving}
                  >
                    {providerSaving ? "Saving…" : "Save provider"}
                  </button>
                  {providerNotice && (
                    <span
                      className={
                        providerNotice === "已保存" ? "is-success" : ""
                      }
                    >
                      {providerNotice}
                    </span>
                  )}
                </div>
                <Divider />
                <div className="settings-mcp">
                  <div className="settings-mcp-heading">
                    <div>
                      <h3>MCP Servers</h3>
                      <p>启用后即可使用该 Server；停用后不会发起调用。</p>
                    </div>
                  </div>
                  {mcpLoading ? (
                    <p className="settings-empty">Loading MCP Servers…</p>
                  ) : mcpServers.length ? (
                    <div className="settings-mcp-list">
                      {mcpServers.map((server) => {
                        const tools = server.capabilities?.tools || []
                        const refreshing = Boolean(mcpRefreshing[server.id])
                        const toolsOpen = Boolean(mcpToolsOpen[server.id])
                        const toolsId = `mcp-tools-${server.id}`
                        return (
                          <div className="settings-mcp-server" key={server.id}>
                            <div className="settings-mcp-server-header">
                              <div className="settings-mcp-server-info">
                                <div className="settings-mcp-server-name">
                                  <strong title={server.name}>
                                    {server.name}
                                  </strong>
                                  <button
                                    type="button"
                                    className="settings-mcp-delete"
                                    aria-label={`Delete ${server.name}`}
                                    title={`Delete ${server.name}`}
                                    onClick={() => requestMcpDelete(server)}
                                  >
                                    <Trash2
                                      size={15}
                                      strokeWidth={1.8}
                                      aria-hidden="true"
                                    />
                                  </button>
                                </div>
                                <small title={server.endpoint}>
                                  {server.endpoint}
                                </small>
                                <em>
                                  {server.transport}
                                  {server.has_token
                                    ? " · Token configured"
                                    : ""}
                                  {tools.length
                                    ? ` · ${tools.length} tools discovered`
                                    : " · No tools discovered"}
                                </em>
                              </div>
                              <div className="settings-mcp-enabled">
                                <span>Enabled</span>
                                <Toggle
                                  on={server.enabled}
                                  label={`${
                                    server.enabled ? "Disable" : "Enable"
                                  } ${server.name}`}
                                  onToggle={() => void toggleMcpServer(server)}
                                />
                              </div>
                            </div>
                            <div className="settings-mcp-tools">
                              <div className="settings-mcp-tools-row">
                                <button
                                  type="button"
                                  className="settings-mcp-tools-toggle"
                                  aria-expanded={toolsOpen}
                                  aria-controls={toolsId}
                                  onClick={() =>
                                    setMcpToolsOpen((current) => ({
                                      ...current,
                                      [server.id]: !toolsOpen,
                                    }))
                                  }
                                >
                                  <ChevronRight
                                    size={14}
                                    strokeWidth={1.8}
                                    className={toolsOpen ? "is-open" : ""}
                                    aria-hidden="true"
                                  />
                                  <span>View tools ({tools.length})</span>
                                </button>
                                <button
                                  type="button"
                                  className="settings-mcp-refresh"
                                  aria-label={`Refresh tools for ${server.name}`}
                                  title={
                                    server.enabled
                                      ? "Refresh tools"
                                      : "Enable this server to refresh tools"
                                  }
                                  onClick={() =>
                                    void refreshMcpTools(server.id)
                                  }
                                  disabled={!server.enabled || refreshing}
                                >
                                  <RefreshCw
                                    size={14}
                                    strokeWidth={1.8}
                                    className={refreshing ? "is-spinning" : ""}
                                    aria-hidden="true"
                                  />
                                  <span>
                                    {refreshing ? "Refreshing…" : "Refresh"}
                                  </span>
                                </button>
                              </div>
                              {toolsOpen && (
                                <div
                                  id={toolsId}
                                  className="settings-mcp-tool-list"
                                  role="region"
                                  aria-label={`Tools for ${server.name}`}
                                >
                                  {tools.length ? (
                                    tools.map((tool, index) => (
                                      <article
                                        className="settings-mcp-tool"
                                        key={`${tool.name || "tool"}-${index}`}
                                      >
                                        <strong>
                                          {tool.name || "Unnamed tool"}
                                        </strong>
                                        {tool.description && (
                                          <p>{tool.description}</p>
                                        )}
                                        {tool.inputSchema && (
                                          <pre>
                                            {JSON.stringify(
                                              tool.inputSchema,
                                              null,
                                              2,
                                            )}
                                          </pre>
                                        )}
                                      </article>
                                    ))
                                  ) : (
                                    <p className="settings-empty">
                                      No tools discovered.
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="settings-empty">No MCP Servers configured.</p>
                  )}
                  {mcpAdding ? (
                    <div className="settings-mcp-form">
                      <input
                        className="settings-input"
                        value={mcpName}
                        onChange={(event) => setMcpName(event.target.value)}
                        placeholder="Server name"
                      />
                      <input
                        className="settings-input"
                        value={mcpEndpoint}
                        onChange={(event) => setMcpEndpoint(event.target.value)}
                        placeholder="https://…/mcp"
                      />
                      <div className="settings-mcp-form-row">
                        <select
                          className="settings-input"
                          value={mcpTransport}
                          onChange={(event) =>
                            setMcpTransport(
                              event.target.value as ApiMCPServer["transport"],
                            )
                          }
                        >
                          <option value="streamable-http">
                            Streamable HTTP
                          </option>
                          <option value="sse">SSE</option>
                        </select>
                        <input
                          className="settings-input"
                          type="password"
                          value={mcpToken}
                          onChange={(event) => setMcpToken(event.target.value)}
                          placeholder="Token (optional)"
                        />
                      </div>
                      <div className="settings-provider-actions">
                        <button
                          onClick={() => void saveMcpServer()}
                          disabled={mcpSaving}
                        >
                          {mcpSaving ? "Saving…" : "Add MCP Server"}
                        </button>
                        <button
                          type="button"
                          className="settings-secondary-action"
                          onClick={resetMcpForm}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="settings-mcp-add"
                      onClick={() => {
                        setMcpAdding(true)
                        setMcpNotice("")
                      }}
                    >
                      + Add MCP Server
                    </button>
                  )}
                  {mcpNotice && (
                    <p
                      className={`settings-mcp-notice ${
                        mcpNotice.includes("已") ? "is-success" : ""
                      }`}
                    >
                      {mcpNotice}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
        <Divider />
        <section
          id="data"
          ref={(element) => {
            refs.current.data = element
          }}
          className="settings-section"
        >
          <SectionHeading>Data</SectionHeading>
          <div className="settings-sync">
            <i />
            Synced from your account
          </div>
          <Row label="Export all data">
            <a href="/api/v1/data/export">Export →</a>
          </Row>
          <Divider />
          <Row label="Clear cache">
            <button
              className="settings-danger"
              onClick={() => window.localStorage.clear()}
            >
              Clear →
            </button>
          </Row>
        </section>
        <Divider />
        <section
          id="account"
          ref={(element) => {
            refs.current.account = element
          }}
          className="settings-section"
        >
          <SectionHeading>Account & Privacy</SectionHeading>
          <div className="settings-user">
            <div>
              {(user?.display_name || user?.email || "R")
                .charAt(0)
                .toUpperCase()}
            </div>
            <span>
              {user?.display_name || "Reader"}
              <small>{user?.email || "Not signed in"}</small>
            </span>
          </div>
          <Row label="Share reading stats">
            <Toggle
              on={shareStats}
              onToggle={() => setShareStats((value) => !value)}
            />
          </Row>
          <Divider />
          <Row label="Password">
            <button>Change password →</button>
          </Row>
          <div className="settings-account-actions">
            <button onClick={() => void signOut()}>Sign out</button>
            <button className="settings-danger">Delete account</button>
          </div>
        </section>
      </main>
      {pendingMcpDelete && (
        <ConfirmDialog
          title="Delete MCP Server?"
          message={`“${pendingMcpDelete.name}” will be permanently removed.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          isBusy={mcpDeleting}
          error={mcpDeleteError}
          onCancel={() => {
            if (!mcpDeleting) setPendingMcpDelete(null)
          }}
          onConfirm={() => void removeMcpServer()}
        />
      )}
    </div>
  )
}
