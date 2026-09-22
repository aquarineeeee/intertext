import { useState, useRef, useEffect, useLayoutEffect, useCallback, Fragment, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api, isUnauthorized, type ApiAIRunTranscriptEntry, type ApiAnnotation, type ApiBook, type ApiChapter, type ApiConversation, type ApiMessage, type ApiReadingBootstrap, type ApiReadingContext, type ApiReadingContextMessage } from './api'
import { palette } from './theme'
import RangeSlider from './RangeSlider'
import './ReadingPage.css'

// ─── Types ────────────────────────────────────────────────────────────────────

type AnnType = 'bookmark' | 'annotation' | 'discussion'

interface AssistantStep { kind: 'assistant'; content: string; thinking?: string }
interface ToolStep { kind: 'tool'; invocationId: string; toolName: string; arguments: unknown; status?: string; result?: unknown; error?: string; durationMs?: number }
type ConversationStep = AssistantStep | ToolStep

interface Msg { id: string; role: 'user' | 'ai'; content: string; steps?: ConversationStep[] }

interface Ann {
  id: string
  type: AnnType
  paragraphIndex: number
  selectedText: string
  note: string
  messages: Msg[]
  expanded: boolean
  chapterId?: string
  conversationId?: string
}

interface Sel { text: string; paragraphIndex: number; rect: DOMRect; startOffset: number; endOffset: number }

interface Connector { x1: number; y1: number; x2: number; y2: number; color: string }

// ─── Book content ─────────────────────────────────────────────────────────────

const FALLBACK_BOOK = {
  title: 'The Name of the Rose',
  author: 'Umberto Eco',
  chapter: 'Chapter III · The Second Day, Lauds',
}

const FALLBACK_CHAPTERS = [
  { id: 1, title: 'Prologue',     sub: 'In which the Manuscript is found' },
  { id: 2, title: 'Chapter I',   sub: 'The First Day, Terce' },
  { id: 3, title: 'Chapter II',  sub: 'The First Day, Vespers' },
  { id: 4, title: 'Chapter III', sub: 'The Second Day, Lauds', current: true },
  { id: 5, title: 'Chapter IV',  sub: 'The Second Day, Prime' },
  { id: 6, title: 'Chapter V',   sub: 'The Second Day, Terce' },
  { id: 7, title: 'Chapter VI',  sub: 'The Second Day, Sext' },
]

const FALLBACK_PARAGRAPHS = [
  "I had been awake for only a few minutes when I heard William's footsteps in the corridor. The abbey was still dark; the monks had not yet assembled for Lauds. I dressed quickly, shivering in the November cold that seeped through the stone walls like a slow revelation.",
  "William stood at the window of our cell, looking out at the courtyard below. The snow had begun again in the night, covering the garden in a silence that seemed almost deliberate, as though the world had agreed to withhold itself.",
  "“Adso,” he said without turning, “what do you make of a library that no one is permitted to enter?”",
  "I considered this. In the years since I had been his novice, I had learned that his questions were rarely what they appeared to be. He was a man who thought in spirals, approaching the center only after exhausting every possible approach from the periphery.",
  "“A library that cannot be read is not a library,” I said carefully. “It is a cemetery.”",
  "He turned then, and I saw something in his expression that I had only rarely seen — a kind of satisfied hunger, as though my answer, however imprecise, had confirmed a hypothesis he had not yet articulated even to himself.",
  "“Or,” he said, “it is a library that is reading us.”",
  "I did not understand, at the time, what he meant. I would not understand for many days, and by then the understanding would cost us more than I care to admit. But William was already moving toward the door, wrapping his cloak against the cold.",
  "The corridor outside was lit by a single torch. The flame moved in a draft from somewhere below, throwing shadows that seemed to have their own intentions. I followed William down the stairs toward the scriptorium, where we had been told the monks assembled each morning before the first office.",
  "The scriptorium was a long hall with high windows. In the grey predawn light, the illuminated manuscripts on their stands glowed faintly, as though lit from within. Monks in black habits moved between the lecterns like slow boats navigating a river they knew by feel. None of them looked up as we entered.",
]

function splitChapterText(text: string): { paragraphs: string[]; starts: number[] } {
  const paragraphs: string[] = []
  const starts: number[] = []
  const pattern = /\S(?:[\s\S]*?\S)?(?=\s*\n\s*\n|$)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text))) {
    paragraphs.push(match[0])
    starts.push(match.index)
  }
  return paragraphs.length ? { paragraphs, starts } : { paragraphs: [text], starts: [0] }
}

function utf16Length(value: string): number {
  return [...value].reduce((total, char) => total + (char.codePointAt(0)! > 0xffff ? 2 : 1), 0)
}

// ─── Mock AI ──────────────────────────────────────────────────────────────────

const INIT_AI = [
  "William’s inversion crystallizes the novel’s central epistemological question. A library that reads us rather than being read — this is Eco’s figure for the limits of human understanding. The labyrinth of knowledge becomes a subject rather than an object; meaning is not something we extract from signs but something signs impose upon us.",
  "The cold seeping ‘like a slow revelation’ is characteristic of Eco’s technique: physical sensation elevated to cognitive event. Throughout the novel, Adso’s body registers what his mind cannot yet articulate. This single simile already encodes the novel’s epistemology in miniature.",
  "Adso’s cemetery metaphor is more precise than it first appears. A cemetery preserves the dead; it also prevents them from circulating. He is identifying the library’s necrophilic function — it holds knowledge without allowing it to live. William’s response complicates this: the library is not inert, it is active. It reads back.",
  "The illuminated manuscripts glowing ‘as though lit from within’ beautifully inverts the metaphor of illumination as understanding. These texts give off light but remain opaque — they illuminate the room without illuminating the reader. The scriptorium is full of light and devoid of transparency.",
]

const FOLLOW_AI = [
  "That’s the precise tension Eco sustains throughout. If you push on this: does the novel ever resolve it, or does it deliberately refuse to? The ending — the destruction of the library — is Eco’s answer. Knowledge is not preserved; it burns. And yet the novel exists.",
  "Yes, and this is where the historical setting does essential philosophical work. For a medieval reader, signs and things had not yet cleanly separated — words participated in what they named. William represents the new episteme beginning to displace this. Adso, narrating in retrospect, inhabits both worlds simultaneously.",
  "The paradox you’re identifying runs through the whole text. Eco is fascinated by systems that become self-referential — readable only on their own terms. The library is the architectural embodiment of this condition: a space understood only from within, which means never fully understood at all.",
]

let aiI = 0; let fuI = 0
const nextAI = () => INIT_AI[aiI++ % INIT_AI.length]
const nextFU = () => FOLLOW_AI[fuI++ % FOLLOW_AI.length]
const uid = () => Math.random().toString(36).slice(2, 9)

function formatJson(value: unknown): string {
  if (typeof value === 'string') return value
  try { return JSON.stringify(value ?? null, null, 2) } catch { return String(value) }
}

function transcriptToSteps(entries: ApiAIRunTranscriptEntry[]): ConversationStep[] {
  const steps: ConversationStep[] = []
  const tools = new Map<string, ToolStep>()
  for (const entry of entries) {
    const payload = entry.payload
    if (entry.entry_type === 'assistant') {
      const content = typeof payload.content === 'string' ? payload.content : ''
      const thinking = typeof payload.thinking === 'string' ? payload.thinking : undefined
      if (content || thinking) steps.push({ kind: 'assistant', content, thinking })
      continue
    }
    if (entry.entry_type === 'tool_call') {
      const invocationId = String(payload.invocation_id || `${entry.sequence}`)
      const tool: ToolStep = { kind: 'tool', invocationId, toolName: String(payload.tool_name || 'tool'), arguments: payload.arguments ?? {} }
      tools.set(invocationId, tool)
      steps.push(tool)
      continue
    }
    if (entry.entry_type === 'tool_result') {
      const invocationId = String(payload.invocation_id || '')
      const tool = tools.get(invocationId)
      if (!tool) continue
      tool.status = String(payload.status || 'completed')
      tool.result = payload.result
      tool.error = typeof payload.error === 'string' ? payload.error : undefined
      tool.durationMs = typeof payload.duration_ms === 'number' ? payload.duration_ms : undefined
    }
  }
  return steps
}

async function toDisplayMessages(items: ApiMessage[]): Promise<Msg[]> {
  const visibleItems = items.filter(message => message.role === 'user' || message.role === 'assistant')
  const result: Msg[] = new Array(visibleItems.length)
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(4, visibleItems.length) }, async () => {
    while (nextIndex < visibleItems.length) {
      const index = nextIndex++
      const message = visibleItems[index]
      let steps: ConversationStep[] | undefined
      if (message.role === 'assistant' && message.ai_run_id) {
        try { steps = transcriptToSteps(await api.getAIRunTranscript(message.ai_run_id)) } catch { steps = undefined }
      }
      result[index] = { id: message.id, role: message.role === 'assistant' ? 'ai' as const : 'user' as const, content: message.content, steps }
    }
  })
  await Promise.all(workers)
  return result
}

function embeddedDisplayMessages(items: ApiReadingContextMessage[]): Msg[] {
  return items
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .map(message => ({
      id: message.id,
      role: message.role === 'assistant' ? 'ai' as const : 'user' as const,
      content: message.content,
      steps: message.role === 'assistant' ? transcriptToSteps(message.transcript as ApiAIRunTranscriptEntry[]) : undefined,
    }))
}

function displayReadingContext(context: ApiReadingContext, toParagraph: (text: string, chapterId: string) => number) {
  const annotations: Ann[] = [
    ...context.excerpts.map(item => ({ id: item.id, type: 'bookmark' as const, paragraphIndex: toParagraph(item.selected_text, item.chapter_id), selectedText: item.selected_text, note: '', messages: [], expanded: false, chapterId: item.chapter_id })),
    ...context.annotations.map(item => ({ id: item.id, type: 'annotation' as const, paragraphIndex: toParagraph(item.selected_text, item.chapter_id), selectedText: item.selected_text, note: item.note_content || '', messages: [], expanded: false, chapterId: item.chapter_id })),
  ]
  const conversations = context.discussions.map(discussion => discussion.conversation)
  const messages = Object.fromEntries(context.discussions.map(discussion => [discussion.conversation.id, discussion.messages]))
  for (const discussion of context.discussions) {
    const anchor = annotations.find(item => item.id === discussion.annotation_id)
    if (anchor) {
      anchor.type = 'discussion'
      anchor.conversationId = discussion.conversation.id
      anchor.messages = embeddedDisplayMessages(discussion.messages)
    }
  }
  return { annotations, conversations, messages }
}

function Markdown({ children }: { children: string }) {
  return <div className="reading-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown></div>
}

function Transcript({ steps }: { steps: ConversationStep[] }) {
  return <div className="reading-transcript">
    {steps.map((step, index) => step.kind === 'assistant' ? (
      <Fragment key={`assistant-${index}`}>
        {step.thinking && <details className="reading-thinking" open>
          <summary>思考过程</summary>
          <Markdown>{step.thinking}</Markdown>
        </details>}
        {step.content && <Markdown>{step.content}</Markdown>}
      </Fragment>
    ) : (
      <details className="reading-tool-call" key={`${step.invocationId}-${index}`}>
        <summary><span>工具调用记录</span><code title={step.toolName}>{step.toolName}</code><span>{step.status === 'success' ? '已完成' : step.status ? '未完成' : '调用中'}</span></summary>
        <div className="reading-tool-detail">
          <strong>模型参数</strong>
          <pre>{formatJson(step.arguments)}</pre>
          {(step.result !== undefined || step.error) && <><strong>工具返回</strong><pre>{formatJson(step.result ?? step.error)}</pre></>}
          {step.durationMs !== undefined && <small>耗时 {step.durationMs} ms</small>}
        </div>
      </details>
    ))}
  </div>
}

function resizeComposer(element: HTMLTextAreaElement) {
  element.style.height = 'auto'
  element.style.height = `${Math.min(element.scrollHeight, 46)}px`
  element.style.overflowY = element.scrollHeight > 46 ? 'auto' : 'hidden'
}

// ─── Seed annotations ─────────────────────────────────────────────────────────

const SEEDS: Ann[] = [
  {
    id: 's1', type: 'bookmark', paragraphIndex: 0,
    selectedText: 'seeped through the stone walls like a slow revelation',
    note: '', messages: [], expanded: false,
  },
  {
    id: 's2', type: 'annotation', paragraphIndex: 3,
    selectedText: 'thought in spirals, approaching the center only after exhausting every possible approach from the periphery',
    note: 'Eco’s embedded portrait of the semiotic method — and of William of Ockham’s reasoning style. The spiral is the anti-syllogism.',
    messages: [], expanded: false,
  },
  {
    id: 's3', type: 'discussion', paragraphIndex: 6,
    selectedText: 'it is a library that is reading us',
    note: '',
    messages: [
      { id: 'm1', role: 'user', content: 'What does William mean by this inversion? How can a library read its readers?' },
      { id: 'm2', role: 'ai',   content: INIT_AI[0] },
      { id: 'm3', role: 'user', content: 'Is this connected to his theory of signs elsewhere in the novel?' },
      { id: 'm4', role: 'ai',   content: FOLLOW_AI[1] },
    ],
    expanded: false,
  },
]

// ─── Render highlighted paragraph ─────────────────────────────────────────────

function renderParagraph(
  text: string,
  anns: Ann[],
  pIdx: number,
  onHover: (id: string | null) => void,
  onClickHighlight: (id: string) => void,
  selectedId?: string | null,
  pendingSelection?: Sel | null,
  pendingType?: AnnType | null,
): ReactNode {
  const pendingAnn: Ann | null = pendingSelection && pendingType && pendingType !== 'bookmark' && pendingSelection.paragraphIndex === pIdx
    ? {
        id: '__pending-selection__',
        type: pendingType,
        paragraphIndex: pIdx,
        selectedText: pendingSelection.text,
        note: '',
        messages: [],
        expanded: false,
      }
    : null
  const hits = [...anns, ...(pendingAnn ? [pendingAnn] : [])]
    .filter(a => a.paragraphIndex === pIdx)
    .map(a => ({ a, i: text.indexOf(a.selectedText) }))
    .filter(x => x.i !== -1)
    .sort((a, b) => a.i - b.i)

  if (hits.length === 0) return text

  const nodes: ReactNode[] = []
  let cur = 0
  for (const { a, i } of hits) {
    if (i > cur) nodes.push(text.slice(cur, i))
    nodes.push(
      <span
        key={a.id}
        data-annotation-id={a.id}
        data-highlight="true"
        className={`ann-highlight ann-${a.type}${selectedId === a.id ? ' is-selected' : ''}`}
        onMouseEnter={() => onHover(a.id)}
        onMouseLeave={() => onHover(null)}
        onClick={e => { e.stopPropagation(); if (a.id !== '__pending-selection__') onClickHighlight(a.id) }}
      >
        {text.slice(i, i + a.selectedText.length)}
      </span>
    )
    cur = i + a.selectedText.length
  }
  if (cur < text.length) nodes.push(text.slice(cur))
  return <>{nodes}</>
}

// ─── AnnotationEntry ──────────────────────────────────────────────────────────

const COLLAPSE_AT = 4

interface AEProps {
  ann: Ann
  active: boolean
  onHover: (id: string | null) => void
  onToHighlight: (id: string) => void
  onToggle: (id: string) => void
  replyVal: string
  onReplyChange: (id: string, v: string) => void
  onReplySubmit: (id: string) => void
  isTyping: boolean
}

function AnnotationEntry({ ann, active, onHover, onToHighlight, onToggle, replyVal, onReplyChange, onReplySubmit, isTyping }: AEProps) {
  const collapsed = !ann.expanded && ann.messages.length > COLLAPSE_AT
  const visibleMsgs = collapsed ? ann.messages.slice(0, 2) : ann.messages
  const showInput = !collapsed && !isTyping && ann.type === 'discussion'

  return (
    <div
      data-annotation-entry={ann.id}
      className={`reading-annotation-entry${active ? ' is-selected' : ''}`}
      onMouseEnter={() => onHover(ann.id)}
      onMouseLeave={() => onHover(null)}
      onClick={event => {
        if ((event.target as HTMLElement).closest('button, input, textarea, a, details')) return
        onToHighlight(ann.id)
      }}
    >
      {/* Bookmark */}
      {ann.type === 'bookmark' && (
        <p className="text-sm text-mid" style={{ fontFamily: 'var(--font-ui)' }}>已加书签</p>
      )}

      {/* User annotation */}
      {ann.type === 'annotation' && (
        <p className="text-sm text-ink leading-relaxed" style={{ fontFamily: 'var(--font-ui)' }}>
          {ann.note}
        </p>
      )}

      {/* AI discussion */}
      {ann.type === 'discussion' && (
        <div style={{ fontFamily: 'var(--font-ui)' }}>
          {visibleMsgs.map(msg => (
            <div key={msg.id} className="mb-3">
              <div className="text-xs text-faint mb-1">{msg.role === 'user' ? '你' : 'AI'}</div>
              <div className="text-sm text-ink leading-relaxed">
                {msg.role === 'ai' && msg.steps?.length ? <Transcript steps={msg.steps} /> : <Markdown>{msg.content}</Markdown>}
              </div>
            </div>
          ))}

          {isTyping && !visibleMsgs.some(message => message.id.startsWith('run-')) && (
            <div className="mb-3">
              <div className="text-xs text-faint mb-1">AI</div>
              <div className="text-sm text-faint animate-pulse">···</div>
            </div>
          )}

          {ann.messages.length > COLLAPSE_AT && (
            <button
              className="reading-hover-mid text-xs text-faint transition-colors mb-3 block"
              style={{ fontFamily: 'var(--font-ui)' }}
              onClick={() => onToggle(ann.id)}
            >
              {ann.expanded ? '收起 ↑' : `展开全部 ${ann.messages.length} 条 ↓`}
            </button>
          )}

          {showInput && (
            <div className="reading-composer border-b border-rule pt-1">
              <textarea
                value={replyVal}
                rows={1}
                onChange={e => { onReplyChange(ann.id, e.target.value); resizeComposer(e.currentTarget) }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && replyVal.trim()) { e.preventDefault(); onReplySubmit(ann.id) }
                }}
                placeholder="继续追问…"
                className="reading-placeholder-faint w-full bg-transparent text-sm text-ink outline-none py-1"
                style={{ fontFamily: 'var(--font-ui)' }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── TOC Drawer ───────────────────────────────────────────────────────────────

function TOCDrawer({ open, onClose, chapters, book, currentChapterId, onSelect, onBookClick }: { open: boolean; onClose: () => void; chapters: Array<{ id: string; title: string; chapter_index: number }>; book: { title: string; author: string }; currentChapterId?: string; onSelect: (id: string) => void; onBookClick: () => void }) {
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-20"
          style={{ background: 'var(--color-overlay)' }}
          onClick={onClose}
        />
      )}
      <aside
        className="fixed top-0 left-0 h-full z-30 w-60 bg-cream overflow-y-auto"
        style={{
          borderRight: '1px solid var(--color-rule)',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.24s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div className="pt-14 px-5 pb-8">
          <div className="mb-6">
            <button type="button" className="reading-book-link text-left text-sm text-ink" style={{ fontFamily: 'var(--font-ui)', fontWeight: 500 }} onClick={onBookClick}><span aria-hidden="true">←</span><span>{book.title}</span></button>
            <p className="text-xs text-faint mt-0.5" style={{ fontFamily: 'var(--font-ui)' }}>{book.author}</p>
          </div>
          <nav className="space-y-0.5">
            {chapters.map(ch => (
              <button
                key={ch.id}
                className={`w-full text-left px-3 py-2 rounded-sm transition-colors ${ch.id === currentChapterId ? 'text-ink bg-surface' : 'text-mid reading-toc-item'}`}
                onClick={() => { onSelect(ch.id); onClose() }}
              >
                <div className="text-xs text-faint mb-0.5" style={{ fontFamily: 'var(--font-ui)' }}>{ch.title || `Chapter ${ch.chapter_index + 1}`}</div>
                <div className="text-sm" style={{ fontFamily: 'var(--font-ui)' }}>第 {ch.chapter_index + 1} 章</div>
              </button>
            ))}
          </nav>
        </div>
      </aside>
    </>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

const TOOLBAR_ITEMS: { action: AnnType; label: string}[] = [
  { action: 'bookmark',   label: '摘录'},
  { action: 'annotation', label: '批注'},
  { action: 'discussion', label: '共读'},
]

export default function App({ bootstrap }: { bootstrap?: ApiReadingBootstrap }) {
  const query = new URLSearchParams(window.location.search)
  const requestedBookId = query.get('bookId') || undefined
  const requestedChapterId = query.get('chapterId') || undefined
  const requestedHighlightId = query.get('highlightId') || undefined
  const [book, setBook] = useState<ApiBook | null>(null)
  const [chapters, setChapters] = useState<ApiChapter[]>([])
  const [chapterId, setChapterId] = useState<string | undefined>(requestedChapterId)
  const [chapterText, setChapterText] = useState('')
  const [paragraphs, setParagraphs] = useState<string[]>(FALLBACK_PARAGRAPHS)
  const [paragraphStarts, setParagraphStarts] = useState<number[]>([])
  const [annotations, setAnnotations] = useState<Ann[]>([])
  const [conversations, setConversations] = useState<ApiConversation[]>([])
  const [messages, setMessages] = useState<Record<string, ApiMessage[]>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [sel, setSel] = useState<Sel | null>(null)
  const [pending, setPending] = useState<AnnType | null>(null)
  const [pendingSelection, setPendingSelection] = useState<Sel | null>(null)
  const [pendingType, setPendingType] = useState<AnnType | null>(null)
  const [noteVal, setNoteVal] = useState('')
  const [tocOpen, setTocOpen] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null)
  const [connector, setConnector] = useState<Connector | null>(null)
  const [aiTypingId, setAiTypingId] = useState<string | null>(null)
  const [replies, setReplies] = useState<Record<string, string>>({})
  const [annotationWidth, setAnnotationWidth] = useState(288)
  const [isResizingAnnotations, setIsResizingAnnotations] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [fontSize, setFontSize] = useState(() => Number(window.localStorage.getItem('intertext-reading-font-size') || 17))
  const [lineHeight, setLineHeight] = useState(() => Number(window.localStorage.getItem('intertext-reading-line-height') || 1.88))
  const [loadingNext, setLoadingNext] = useState(false)
  const [readingMode, setReadingMode] = useState<'chapter' | 'continuous'>(() => window.localStorage.getItem('intertext-reading-mode') === 'continuous' ? 'continuous' : 'chapter')
  const [noteComposerOpen, setNoteComposerOpen] = useState(false)
  const [newNoteTitle, setNewNoteTitle] = useState('')
  const [newNoteContent, setNewNoteContent] = useState('')
  const [annotationScrollTop, setAnnotationScrollTop] = useState(0)
  const [pendingComposerTop, setPendingComposerTop] = useState(52)

  const noteRef = useRef<HTMLTextAreaElement>(null)
  const annotationPanelRef = useRef<HTMLDivElement>(null)
  const pendingComposerRef = useRef<HTMLDivElement>(null)
  const annotationResizeStart = useRef<{ x: number; width: number } | null>(null)
  const eventSources = useRef<Record<string, EventSource>>({})
  const initialHighlightHandled = useRef(false)

  useEffect(() => () => {
    Object.values(eventSources.current).forEach(source => source.close())
    eventSources.current = {}
  }, [])

  const watchRun = useCallback((runId: string, annotationId: string) => {
    const messageId = `run-${runId}`
    let lastSequence = 0
    const updateSteps = (update: (steps: ConversationStep[]) => ConversationStep[]) => {
      setAnnotations(current => current.map(annotation => {
        if (annotation.id !== annotationId) return annotation
        const existing = annotation.messages.find(message => message.id === messageId)
        const nextMessage: Msg = { id: messageId, role: 'ai', content: '', steps: update(existing?.steps || []) }
        return { ...annotation, messages: existing ? annotation.messages.map(message => message.id === messageId ? nextMessage : message) : [...annotation.messages, nextMessage] }
      }))
    }
    const source = api.subscribeAIRunEvents(runId, {
      onEvent: event => {
        if (event.sequence <= lastSequence) return
        lastSequence = event.sequence
        const payload = event.payload
        if (event.event_type === 'text_delta' || event.event_type === 'thinking_delta') {
          const key = event.event_type === 'text_delta' ? 'content' : 'thinking'
          const value = String(payload[event.event_type === 'text_delta' ? 'text' : 'thinking'] || '')
          updateSteps(steps => {
            const last = steps.at(-1)
            if (last?.kind === 'assistant') return [...steps.slice(0, -1), { ...last, [key]: `${last[key] || ''}${value}` }]
            return [...steps, { kind: 'assistant', content: key === 'content' ? value : '', thinking: key === 'thinking' ? value : undefined }]
          })
        } else if (event.event_type === 'tool_call_started') {
          updateSteps(steps => [...steps, { kind: 'tool', invocationId: String(payload.invocation_id || uid()), toolName: String(payload.tool_name || 'tool'), arguments: payload.arguments ?? {} }])
        } else if (event.event_type === 'tool_call_completed') {
          updateSteps(steps => steps.map(step => step.kind === 'tool' && step.invocationId === String(payload.invocation_id || '') ? { ...step, status: String(payload.status || 'completed'), result: payload.result, error: typeof payload.error === 'string' ? payload.error : undefined, durationMs: typeof payload.duration_ms === 'number' ? payload.duration_ms : undefined } : step))
        } else if (['run_completed', 'failed', 'partial', 'cancelled'].includes(event.event_type)) {
          source.close()
          delete eventSources.current[runId]
        }
      },
      onError: () => undefined,
    })
    eventSources.current[runId] = source
    return source
  }, [])

  const activeBook = book || { ...FALLBACK_BOOK, id: '', author: FALLBACK_BOOK.author, description: null, status: 'ready', parse_error: null, created_at: '', updated_at: '', import_file: { id: '', file_name: '', file_format: '', file_size: 0, file_hash: '', created_at: '' } }
  const activeChapter = chapters.find(item => item.id === chapterId) || chapters[0]
  const activeChapterTitle = activeChapter?.title || FALLBACK_BOOK.chapter

  useEffect(() => { window.localStorage.setItem('intertext-reading-font-size', String(fontSize)) }, [fontSize])
  useEffect(() => { window.localStorage.setItem('intertext-reading-line-height', String(lineHeight)) }, [lineHeight])
  useEffect(() => { window.localStorage.setItem('intertext-reading-mode', readingMode) }, [readingMode])

  useEffect(() => {
    if (!settingsOpen) return
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Element
      if (!target.closest('.reading-settings, [aria-label="阅读设置"]')) setSettingsOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutside)
    return () => document.removeEventListener('pointerdown', closeOnOutside)
  }, [settingsOpen])

  const loadNextChapter = async () => {
    if (!book || !chapterId || loadingNext) return
    const currentIndex = chapters.findIndex(item => item.id === chapterId)
    const next = chapters[currentIndex + 1]
    if (!next) return
    setLoadingNext(true)
    try {
      const [chapter, readingContext] = await Promise.all([
        api.getChapter(book.id, next.id),
        api.getReadingContext(book.id, next.id),
      ])
      const split = splitChapterText(chapter.text)
      const offset = chapterText.length + 2
      const paragraphOffset = paragraphs.length + 1
      const displayed = displayReadingContext(readingContext, text => {
        const local = split.paragraphs.findIndex(item => item.includes(text))
        return local >= 0 ? paragraphOffset + local : paragraphOffset
      })
      setChapterText(prev => `${prev}\n\n${chapter.text}`)
      setParagraphs(prev => [...prev, `§ ${next.title || `第 ${next.chapter_index + 1} 章`}`, ...split.paragraphs])
      setParagraphStarts(prev => [...prev, offset, ...split.starts.map(start => start + offset)])
      setAnnotations(prev => [...prev, ...displayed.annotations])
      setConversations(prev => [...prev, ...displayed.conversations])
      setMessages(prev => ({ ...prev, ...displayed.messages }))
      setChapterId(next.id)
      void api.saveProgress(book.id, next.id).catch(() => undefined)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '下一章加载失败')
    } finally { setLoadingNext(false) }
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError(null)
      try {
        const canUseBootstrap = bootstrap && (!requestedBookId || bootstrap.book.id === requestedBookId)
        const selected = canUseBootstrap
          ? bootstrap.book
          : requestedBookId
            ? await api.getBook(requestedBookId)
            : (await api.listBooks())[0]
        if (!selected) throw new Error('暂无可阅读的书籍。')
        const [bookChapters, fallbackProgress] = canUseBootstrap
          ? [bootstrap.chapters, null]
          : await Promise.all([api.listChapters(selected.id), api.getProgress(selected.id)])
        const selectedChapterId = requestedChapterId || (canUseBootstrap ? bootstrap.last_read_chapter_id : fallbackProgress?.last_read_chapter_id) || bookChapters[0]?.id
        if (!selectedChapterId) throw new Error('这本书还没有可读章节。')
        const [chapter, readingContext] = await Promise.all([
          api.getChapter(selected.id, selectedChapterId),
          api.getReadingContext(selected.id, selectedChapterId),
        ])
        const split = splitChapterText(chapter.text)
        const chapterIndex = new Map(bookChapters.map(item => [item.id, item.chapter_index]))
        const toParagraph = (text: string, id: string) => {
          const local = split.paragraphs.findIndex(item => item.includes(text))
          return local >= 0 ? local : Math.max(0, chapterIndex.get(id) || 0)
        }
        const displayed = displayReadingContext(readingContext, toParagraph)
        if (cancelled) return
        setBook(selected)
        setChapters(bookChapters)
        setChapterId(chapter.id)
        setChapterText(chapter.text)
        setParagraphs(split.paragraphs)
        setParagraphStarts(split.starts)
        setAnnotations(displayed.annotations)
        setConversations(displayed.conversations)
        setMessages(displayed.messages)
        void api.saveProgress(selected.id, chapter.id).catch(() => undefined)
      } catch (error) {
        if (!cancelled) setLoadError(isUnauthorized(error) ? '请先登录后再打开书籍。' : error instanceof Error ? error.message : '无法加载书籍。')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [bootstrap, requestedBookId, requestedChapterId])

  useEffect(() => {
    if (!isResizingAnnotations) return
    const handlePointerMove = (event: PointerEvent) => {
      const start = annotationResizeStart.current
      if (!start) return
      const maxWidth = Math.max(240, Math.min(560, window.innerWidth - 420))
      setAnnotationWidth(Math.min(maxWidth, Math.max(240, start.width + start.x - event.clientX)))
    }
    const handlePointerUp = () => {
      annotationResizeStart.current = null
      setIsResizingAnnotations(false)
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [isResizingAnnotations])

  useLayoutEffect(() => {
    const panel = annotationPanelRef.current
    if (!panel || !pendingSelection || !pendingType || pendingType === 'bookmark') return

    const panelRect = panel.getBoundingClientRect()
    const composerHeight = pendingComposerRef.current?.offsetHeight || 38
    const gap = 18
    let candidate = Math.max(52, (pendingSelection.rect.top + pendingSelection.rect.bottom) / 2 - panelRect.top + panel.scrollTop - composerHeight / 2)
    const entries = Array.from(panel.querySelectorAll<HTMLElement>('[data-annotation-entry]'))
      .map(entry => {
        const rect = entry.getBoundingClientRect()
        return {
          top: rect.top - panelRect.top + panel.scrollTop,
          bottom: rect.bottom - panelRect.top + panel.scrollTop,
        }
      })
      .sort((a, b) => a.top - b.top)

    for (const entry of entries) {
      const overlaps = candidate < entry.bottom + gap && candidate + composerHeight > entry.top - gap
      if (overlaps) candidate = entry.bottom + gap
    }
    setPendingComposerTop(candidate)
  }, [pendingSelection, pendingType, annotations, annotationScrollTop, annotationWidth, fontSize, lineHeight])

  const sorted = [...annotations].sort((a, b) => {
    if (a.paragraphIndex !== b.paragraphIndex) return a.paragraphIndex - b.paragraphIndex
    return (paragraphs[a.paragraphIndex]?.indexOf(a.selectedText) ?? 0) - (paragraphs[b.paragraphIndex]?.indexOf(b.selectedText) ?? 0)
  })

  // ── Connector line ─────────────────────────────────────────────────────────

  const refreshConnector = useCallback(() => {
    if (!hoveredId) { setConnector(null); return }
    const hl = document.querySelector(`[data-annotation-id="${hoveredId}"][data-highlight]`)
    const ae = document.querySelector(`[data-annotation-entry="${hoveredId}"]`)
    if (!hl || !ae) { setConnector(null); return }
    const hr = hl.getBoundingClientRect()
    const ar = ae.getBoundingClientRect()
    const ann = annotations.find(a => a.id === hoveredId)
    const clr: Record<AnnType, string> = { bookmark: palette.accent, annotation: palette.fg, discussion: palette.sidebar }
    setConnector({ x1: hr.right, y1: (hr.top + hr.bottom) / 2, x2: ar.left, y2: (ar.top + ar.bottom) / 2, color: ann ? clr[ann.type] : palette.accent })
  }, [hoveredId, annotations])

  useLayoutEffect(() => {
    refreshConnector()
  }, [refreshConnector, annotationScrollTop, annotationWidth, fontSize, lineHeight, paragraphs])

  useEffect(() => {
    const readingArea = document.querySelector('.reading-area')
    const annotationPanel = annotationPanelRef.current
    let frame = 0
    const scheduleRefresh = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        refreshConnector()
      })
    }
    readingArea?.addEventListener('scroll', scheduleRefresh, { passive: true })
    annotationPanel?.addEventListener('scroll', scheduleRefresh, { passive: true })
    window.addEventListener('resize', scheduleRefresh)
    return () => {
      readingArea?.removeEventListener('scroll', scheduleRefresh)
      annotationPanel?.removeEventListener('scroll', scheduleRefresh)
      window.removeEventListener('resize', scheduleRefresh)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [refreshConnector])

  // ── Text selection ─────────────────────────────────────────────────────────

  const handleMouseUp = (e: React.MouseEvent) => {
    if ((e.target as Element).closest('[data-no-select]')) return
    const s = window.getSelection()
    if (!s || s.isCollapsed || !s.toString().trim()) {
      if (!pending) setSel(null)
      return
    }
    const text = s.toString().trim()
    const range = s.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    let node: Node | null = range.startContainer
    let pi = -1
    while (node) {
      if (node instanceof HTMLElement && node.dataset.paragraphIndex !== undefined) {
        pi = parseInt(node.dataset.paragraphIndex); break
      }
      node = node.parentElement
    }
    if (pi === -1) return
    const paragraphStart = paragraphStarts[pi] ?? 0
    const localStart = paragraphs[pi]?.indexOf(text) ?? -1
    if (localStart < 0 || !chapterId) return
    const startOffset = utf16Length(chapterText.slice(0, paragraphStart + localStart))
    setPendingSelection(null)
    setPendingType(null)
    setSel({ text, paragraphIndex: pi, rect, startOffset, endOffset: startOffset + utf16Length(text) })
  }

  // ── Toolbar action ─────────────────────────────────────────────────────────

  const handleAction = (action: AnnType) => {
    if (!sel) return
    if (action === 'bookmark') {
      if (!book || !chapterId) return
      void api.createExcerpt(book.id, { chapter_id: chapterId, start_offset: sel.startOffset, end_offset: sel.endOffset, selected_text: sel.text }).then(excerpt => {
        setNotice(null)
        const id = excerpt.id
        setAnnotations(prev => [...prev, { id, type: 'bookmark', paragraphIndex: sel.paragraphIndex, selectedText: sel.text, note: '', messages: [], expanded: false, chapterId }])
        setSel(null)
        setTimeout(() => flashEl(`[data-annotation-entry="${id}"]`), 200)
      }).catch(error => setNotice(error instanceof Error ? error.message : '书签保存失败'))
    } else {
      setPendingSelection(sel)
      setPendingType(action)
      setPending(action)
      window.getSelection()?.removeAllRanges()
      setTimeout(() => noteRef.current?.focus(), 50)
    }
  }

  const cancelPending = () => {
    setPending(null)
    setPendingSelection(null)
    setPendingType(null)
    setNoteVal('')
    setSel(null)
    window.getSelection()?.removeAllRanges()
  }

  const handlePageClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!pending) return
    const target = event.target as Element
    if (target.closest('[data-no-select], [data-highlight], [data-annotation-entry], button, input, textarea')) return
    cancelPending()
  }

  // ── Note submit ────────────────────────────────────────────────────────────

  const handleNoteSubmit = () => {
    if (!sel || !pending || !noteVal.trim() || !book || !chapterId) return
    const content = noteVal.trim()
    const selection = sel
    const type = pending
    setSel(null); setPending(null); setNoteVal('')
    setPendingSelection(selection)
    setPendingType(type)
    if (type === 'annotation') {
      void api.createAnnotation(book.id, { chapter_id: chapterId, start_offset: selection.startOffset, end_offset: selection.endOffset, selected_text: selection.text, note_content: content, color: 'umber' }).then(annotation => {
        setNotice(null)
        const item: Ann = { id: annotation.id, type: 'annotation', paragraphIndex: selection.paragraphIndex, selectedText: selection.text, note: content, messages: [], expanded: false, chapterId }
        setAnnotations(prev => [...prev, item])
        setPendingSelection(null)
        setPendingType(null)
        setTimeout(() => scrollToEntry(item.id), 100)
      }).catch(error => {
        setPendingSelection(null)
        setPendingType(null)
        setNotice(error instanceof Error ? error.message : '批注保存失败')
      })
      return
    }
    setAiTypingId(`pending-${selection.startOffset}`)
    void (async () => {
      try {
        const annotation = await api.createAnnotation(book.id, { chapter_id: chapterId, start_offset: selection.startOffset, end_offset: selection.endOffset, selected_text: selection.text, color: 'slate' })
        const conversation = await api.createConversation(book.id, '阅读讨论', annotation.id)
        const item: Ann = { id: annotation.id, type: 'discussion', paragraphIndex: selection.paragraphIndex, selectedText: selection.text, note: '', messages: [{ id: uid(), role: 'user', content }], expanded: false, chapterId, conversationId: conversation.id }
        setAnnotations(prev => [...prev, item])
        // The persisted discussion now owns this highlight. Clear the temporary
        // selection overlay so renderParagraph does not paint the same text twice
        // while the AI run is streaming.
        setPendingSelection(null)
        setPendingType(null)
        setConversations(prev => [...prev, conversation])
        setAiTypingId(annotation.id)
        const run = await api.createAIRun(book.id, conversation.id, { content, chapter_id: chapterId, selection: selection.text, client_message_id: uid() })
        watchRun(run.id, annotation.id)
        let currentRun = run
        for (let attempt = 0; attempt < 24 && ['queued', 'running'].includes(currentRun.status); attempt += 1) {
          await new Promise(resolve => window.setTimeout(resolve, 5000))
          currentRun = await api.getAIRun(run.id)
        }
        if (['failed', 'partial', 'cancelled'].includes(currentRun.status)) {
          throw new Error(currentRun.error_message || 'AI 运行失败')
        }
        const history = await api.listMessages(book.id, conversation.id)
        const displayHistory = await toDisplayMessages(history)
        setNotice(null)
        setMessages(prev => ({ ...prev, [conversation.id]: history }))
        setAnnotations(prev => prev.map(current => current.id === annotation.id ? { ...current, messages: displayHistory } : current))
        setPendingSelection(null)
        setPendingType(null)
        setAiTypingId(null)
        setTimeout(() => scrollToEntry(annotation.id), 100)
      } catch (error) {
        setPendingSelection(null)
        setPendingType(null)
        setAiTypingId(null)
        setNotice(error instanceof Error ? error.message : 'AI 请求失败')
      }
    })()
  }

  // ── Reply submit ───────────────────────────────────────────────────────────

  const handleReply = (annId: string) => {
    const content = replies[annId]?.trim()
    const ann = annotations.find(item => item.id === annId)
    if (!content || !ann?.conversationId || !book) return
    setAnnotations(prev => prev.map(a => a.id === annId ? { ...a, expanded: true, messages: [...a.messages, { id: uid(), role: 'user', content }] } : a))
    setReplies(prev => ({ ...prev, [annId]: '' }))
    setAiTypingId(annId)
    void (async () => {
      try {
        const run = await api.createAIRun(book.id, ann.conversationId!, { content, chapter_id: chapterId, selection: ann.selectedText, client_message_id: uid() })
        watchRun(run.id, annId)
        let currentRun = run
        for (let attempt = 0; attempt < 24 && ['queued', 'running'].includes(currentRun.status); attempt += 1) {
          await new Promise(resolve => window.setTimeout(resolve, 5000))
          currentRun = await api.getAIRun(run.id)
        }
        if (['failed', 'partial', 'cancelled'].includes(currentRun.status)) {
          throw new Error(currentRun.error_message || 'AI 运行失败')
        }
        const history = await api.listMessages(book.id, ann.conversationId!)
        const displayHistory = await toDisplayMessages(history)
        setNotice(null)
        setMessages(prev => ({ ...prev, [ann.conversationId!]: history }))
        setAnnotations(prev => prev.map(a => a.id === annId ? { ...a, messages: displayHistory } : a))
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'AI 请求失败')
      } finally {
        setAiTypingId(null)
      }
    })()
  }

  // ── DOM helpers ────────────────────────────────────────────────────────────

  const flashEl = (sel: string, cls = 'flash-entry') => {
    const el = document.querySelector(sel)
    if (!el) return
    el.classList.add(cls)
    setTimeout(() => el.classList.remove(cls), 700)
  }

  const scrollToEntry = (id: string) => {
    setSelectedAnnotationId(id)
    const panel = annotationPanelRef.current
    const el = panel?.querySelector<HTMLElement>(`[data-annotation-entry="${id}"]`)
    if (panel && el) {
      const panelRect = panel.getBoundingClientRect()
      const entryRect = el.getBoundingClientRect()
      const targetTop = panel.scrollTop + entryRect.top - panelRect.top - (panel.clientHeight - entryRect.height) / 2
      const maxTop = Math.max(0, panel.scrollHeight - panel.clientHeight)
      panel.scrollTo({ top: Math.max(0, Math.min(maxTop, targetTop)), behavior: 'smooth' })
    } else {
      document.querySelector(`[data-annotation-entry="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
    window.setTimeout(() => {
      refreshConnector()
      flashEl(`[data-annotation-entry="${id}"]`, 'flash-entry')
      setSelectedAnnotationId(current => current === id ? null : current)
    }, 350)
  }

  const scrollToHighlight = (id: string) => {
    setSelectedAnnotationId(id)
    const el = document.querySelector(`[data-annotation-id="${id}"][data-highlight]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => {
      flashEl(`[data-annotation-id="${id}"][data-highlight]`, 'flash-span')
      setSelectedAnnotationId(current => current === id ? null : current)
    }, 300)
  }

  useEffect(() => {
    if (loading || !requestedHighlightId || initialHighlightHandled.current) return
    if (!annotations.some(annotation => annotation.id === requestedHighlightId)) return
    initialHighlightHandled.current = true
    const frame = window.requestAnimationFrame(() => scrollToHighlight(requestedHighlightId))
    return () => window.cancelAnimationFrame(frame)
  }, [annotations, loading, requestedHighlightId])

  const toggleExpand = (id: string) => {
    setAnnotations(prev => prev.map(a => a.id === id ? { ...a, expanded: !a.expanded } : a))
  }

  const navigateToChapter = (id?: string) => {
    if (!id) return
    const params = new URLSearchParams(window.location.search)
    params.set('chapterId', id)
    window.history.pushState({}, '', `${window.location.pathname}?${params.toString()}`)
    window.location.reload()
  }

  const handleReadingModeChange = (continuous: boolean) => {
    const nextMode = continuous ? 'continuous' : 'chapter'
    window.localStorage.setItem('intertext-reading-mode', nextMode)
    setReadingMode(nextMode)
    if (!continuous) window.setTimeout(() => window.location.reload(), 0)
  }

  const handleAnnotationResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    annotationResizeStart.current = { x: event.clientX, width: annotationWidth }
    setIsResizingAnnotations(true)
  }

  const handleCreateNote = () => {
    if (!book || !newNoteContent.trim()) return
    void api.createNote(book.id, newNoteTitle.trim() || '阅读笔记', newNoteContent.trim()).then(() => {
      setNotice('笔记已保存')
      setNoteComposerOpen(false)
      setNewNoteTitle('')
      setNewNoteContent('')
    }).catch(error => setNotice(error instanceof Error ? error.message : '笔记保存失败'))
  }

  // ── Toolbar geometry ───────────────────────────────────────────────────────

  const tbLeft = sel ? Math.min(Math.max(130, sel.rect.left + sel.rect.width / 2), window.innerWidth - 130) : 0
  const tbTop  = sel ? Math.max(8, sel.rect.top - 46) : 0

  const readingVars = {
    '--color-cream': palette.bg,
    '--color-surface': palette.cardDeep,
    '--color-ink': palette.fg,
    '--color-mid': palette.muted,
    '--color-faint': palette.muted,
    '--color-rule': palette.border,
    '--color-amber': palette.amber,
    '--color-umber': palette.fg,
    '--color-slate': palette.sidebar,
    '--color-overlay': palette.borderMid,
    '--font-body': "'Lora', Georgia, serif",
    '--font-ui': "'Source Sans 3', system-ui, sans-serif",
  } as CSSProperties

  if (loading) return <div className="reading-page-root h-full flex items-center justify-center bg-cream" style={readingVars}>正在加载书籍…</div>
  if (loadError || !book || !chapterId) return <div className="reading-page-root h-full flex items-center justify-center bg-cream" style={readingVars}>{loadError || '暂无可阅读内容。'}</div>

  return (
    <div className="reading-page-root h-full flex flex-col bg-cream" style={readingVars} onClick={handlePageClick}>

      {notice && (
        <div className="fixed top-3 left-1/2 z-50 -translate-x-1/2 px-3 py-2 text-xs text-ink bg-surface" style={{ fontFamily: 'var(--font-ui)', border: '1px solid var(--color-rule)' }}>
          {notice}
          <button type="button" className="ml-3 text-faint" onClick={() => setNotice(null)} aria-label="关闭提示">×</button>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      {/* ── Main ───────────────────────────────────────────────────────────── */}
      <div className="reading-main flex-1 flex overflow-hidden">

        {/* Reading area */}
        <div
          className="reading-area flex-1 overflow-y-auto"
          onMouseUp={handleMouseUp}
          onScroll={event => {
            const el = event.currentTarget
            if (readingMode === 'continuous' && el.scrollTop + el.clientHeight >= el.scrollHeight - 80) void loadNextChapter()
          }}
        >
          <div className="reading-content mx-auto px-6 py-10">
            <div className="reading-chapter-header" style={{ fontFamily: 'var(--font-ui)' }}>
              <button type="button" className="reading-menu-button" aria-label="打开目录" onClick={() => setTocOpen(true)}>≡</button>
              <h1>{activeChapterTitle}</h1>
            </div>

            <div className="space-y-7">
              {paragraphs.map((p, i) => p.startsWith('§ ') ? (
                <div key={i} className="reading-next-chapter" style={{ fontFamily: 'var(--font-ui)' }}>{p.slice(2)}</div>
              ) : (
                <p key={i} data-paragraph-index={i} className="text-ink" style={{ fontFamily: 'var(--font-body)', fontSize: `${fontSize}px`, lineHeight }}>
                  {renderParagraph(p, annotations, i, setHoveredId, scrollToEntry, selectedAnnotationId, pendingSelection, pendingType)}
                </p>
              ))}
            </div>
            {readingMode === 'chapter' && (
              <div className="reading-chapter-navigation" style={{ fontFamily: 'var(--font-ui)' }}>
                <button
                  type="button"
                  disabled={!chapters[chapters.findIndex(item => item.id === chapterId) - 1]}
                  onClick={() => navigateToChapter(chapters[chapters.findIndex(item => item.id === chapterId) - 1]?.id)}
                >← 上一章</button>
                <button
                  type="button"
                  disabled={!chapters[chapters.findIndex(item => item.id === chapterId) + 1]}
                  onClick={() => navigateToChapter(chapters[chapters.findIndex(item => item.id === chapterId) + 1]?.id)}
                >下一章 →</button>
              </div>
            )}
          </div>
        </div>

        {/* Annotation panel */}
        <div
          className="reading-annotations-wrap shrink-0 relative"
          style={{ width: annotationWidth, flexBasis: annotationWidth }}
        >
          <div
            className={`reading-annotations-resizer${isResizingAnnotations ? ' is-resizing' : ''}`}
            onPointerDown={handleAnnotationResizeStart}
          />
          <div
            ref={annotationPanelRef}
            className="reading-annotations h-full overflow-y-auto bg-cream"
            onScroll={event => setAnnotationScrollTop(event.currentTarget.scrollTop)}
            style={{ borderLeft: '1px solid var(--color-rule)' }}
          >
            <div className="reading-annotation-header px-5" style={{ fontFamily: 'var(--font-ui)' }}>
              <button type="button" className="reading-control" aria-label="阅读设置" onClick={() => setSettingsOpen(value => !value)}>Aa</button>
              <button type="button" className="reading-control reading-add" aria-label="新建笔记" onClick={() => setNoteComposerOpen(true)}>+</button>
            </div>
            <div className="px-5 py-6">
              <p
                className="text-xs text-faint mb-6 uppercase"
                style={{ fontFamily: 'var(--font-ui)', letterSpacing: '0.12em' }}
              >
                批注
              </p>

              {sorted.length === 0 && (
                <p className="text-sm text-faint" style={{ fontFamily: 'var(--font-ui)' }}>
                  选中文字，开始批注或提问。
                </p>
              )}

              <div className="space-y-7">
                {sorted.map(ann => (
                  <AnnotationEntry
                    key={ann.id}
                    ann={ann}
                    active={selectedAnnotationId === ann.id}
                    onHover={setHoveredId}
                    onToHighlight={scrollToHighlight}
                    onToggle={toggleExpand}
                    replyVal={replies[ann.id] ?? ''}
                    onReplyChange={(id, v) => setReplies(prev => ({ ...prev, [id]: v }))}
                    onReplySubmit={handleReply}
                    isTyping={aiTypingId === ann.id}
                  />
                ))}
              </div>
            </div>

            {pending && pending !== 'bookmark' && sel && (
              <div
                data-no-select
                className="reading-pending-composer"
                ref={pendingComposerRef}
                style={{
                  top: pendingComposerTop,
                }}
              >
                <textarea
                  ref={noteRef}
                  rows={1}
                  value={noteVal}
                  onChange={e => { setNoteVal(e.target.value); resizeComposer(e.currentTarget) }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && noteVal.trim()) { e.preventDefault(); handleNoteSubmit() }
                    if (e.key === 'Escape') cancelPending()
                  }}
                  placeholder={pending === 'annotation' ? 'Type here… Enter to submit' : '问 AI… Enter 提交'}
                  className="reading-placeholder-faint w-full bg-transparent text-sm text-ink outline-none py-1"
                  style={{
                    fontFamily: 'var(--font-ui)',
                    borderBottom: `1px solid var(--color-${pending === 'annotation' ? 'umber' : 'slate'})`,
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── TOC drawer ─────────────────────────────────────────────────────── */}
      <TOCDrawer
        open={tocOpen}
        onClose={() => setTocOpen(false)}
        chapters={chapters}
        book={{ title: activeBook.title, author: activeBook.author || activeBook.import_file.file_format.toUpperCase() }}
        currentChapterId={chapterId}
        onBookClick={() => { window.location.href = `/paratext?bookId=${encodeURIComponent(activeBook.id)}` }}
        onSelect={id => {
          const params = new URLSearchParams(window.location.search)
          params.set('chapterId', id)
          window.history.pushState({}, '', `${window.location.pathname}?${params.toString()}`)
          window.location.reload()
        }}
      />

      {settingsOpen && (
        <div className="reading-settings" style={{ fontFamily: 'var(--font-ui)' }}>
          <div className="reading-settings-title">阅读设置</div>
          <label>字号 <RangeSlider min={14} max={24} step={1} value={fontSize} onChange={setFontSize} ariaLabel="字号" size="compact" /><span>{fontSize}px</span></label>
          <label>行距 <RangeSlider min={1.4} max={2.4} step={0.05} value={lineHeight} onChange={setLineHeight} ariaLabel="行距" size="compact" /><span>{lineHeight.toFixed(2)}</span></label>
          <div className="reading-mode-options">
            <label>
              <input type="checkbox" checked={readingMode === 'continuous'} onChange={event => handleReadingModeChange(event.target.checked)} />
              <span>连续阅读</span>
            </label>
            <small>{readingMode === 'continuous' ? '滚动到底部自动载入下一章' : '一次阅读一章'}</small>
          </div>
        </div>
      )}

      {noteComposerOpen && (
        <div className="reading-note-popover" data-no-select style={{ fontFamily: 'var(--font-ui)' }}>
          <div className="reading-settings-title">新建笔记</div>
          <input value={newNoteTitle} onChange={event => setNewNoteTitle(event.target.value)} placeholder="标题（可选）" />
          <textarea value={newNoteContent} onChange={event => setNewNoteContent(event.target.value)} placeholder="写下你的想法…" rows={5} autoFocus />
          <div className="reading-note-actions"><button type="button" onClick={() => setNoteComposerOpen(false)}>取消</button><button type="button" disabled={!newNoteContent.trim()} onClick={handleCreateNote}>保存</button></div>
        </div>
      )}

      {/* ── Selection toolbar ──────────────────────────────────────────────── */}
      {sel && !pending && (
        <div
          data-no-select
          className="fixed z-50 flex items-center rounded"
          style={{
            top: tbTop,
            left: tbLeft,
            transform: 'translateX(-50%)',
            background: 'var(--color-cream)',
            border: '1px solid var(--color-rule)',
            padding: '3px',
            boxShadow: '0 2px 10px rgba(42,33,24,0.08)',
          }}
        >
          {TOOLBAR_ITEMS.map(({ action, label }, idx) => (
            <Fragment key={action}>
              {idx > 0 && <div className="w-px h-3.5 bg-rule mx-0.5" />}
              <button
                className="reading-toolbar-item flex items-center gap-1 px-2.5 py-1 rounded-sm text-xs text-mid transition-colors"
                style={{ fontFamily: 'var(--font-ui)' }}
                onClick={() => handleAction(action)}
              >
                <span style={{ fontSize: action === 'annotation' ? '10px' : '13px' }}>{icon}</span>
                {label}
              </button>
            </Fragment>
          ))}
        </div>
      )}

      {/* ── Connector SVG ──────────────────────────────────────────────────── */}
      {connector && (
        <svg
          className="fixed inset-0 pointer-events-none z-10"
          style={{ width: '100vw', height: '100vh' }}
        >
          <path
            d={`M ${connector.x1} ${connector.y1} C ${connector.x1 + (connector.x2 - connector.x1) * 0.5} ${connector.y1}, ${connector.x1 + (connector.x2 - connector.x1) * 0.5} ${connector.y2}, ${connector.x2} ${connector.y2}`}
            stroke={connector.color}
            strokeWidth="1"
            strokeOpacity="0.35"
            strokeDasharray="3 3"
            fill="none"
          />
        </svg>
      )}
    </div>
  )
}
