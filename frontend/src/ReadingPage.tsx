import { useState, useRef, useEffect, Fragment, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { api, isUnauthorized, type ApiAnnotation, type ApiBook, type ApiChapter, type ApiConversation, type ApiMessage } from './api'
import { palette } from './theme'
import './ReadingPage.css'

// ─── Types ────────────────────────────────────────────────────────────────────

type AnnType = 'bookmark' | 'annotation' | 'discussion'

interface Msg { id: string; role: 'user' | 'ai'; content: string }

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
): ReactNode {
  const hits = anns
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
        className={`ann-highlight ann-${a.type}`}
        onMouseEnter={() => onHover(a.id)}
        onMouseLeave={() => onHover(null)}
        onClick={e => { e.stopPropagation(); onClickHighlight(a.id) }}
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

const TYPE_COLOR: Record<AnnType, string> = {
  bookmark:   'var(--color-amber)',
  annotation: 'var(--color-umber)',
  discussion: 'var(--color-slate)',
}

const COLLAPSE_AT = 4

interface AEProps {
  ann: Ann
  onHover: (id: string | null) => void
  onToHighlight: (id: string) => void
  onToggle: (id: string) => void
  replyVal: string
  onReplyChange: (id: string, v: string) => void
  onReplySubmit: (id: string) => void
  isTyping: boolean
}

function AnnotationEntry({ ann, onHover, onToHighlight, onToggle, replyVal, onReplyChange, onReplySubmit, isTyping }: AEProps) {
  const preview = ann.selectedText.length > 38
    ? ann.selectedText.slice(0, 38) + '…'
    : ann.selectedText

  const collapsed = !ann.expanded && ann.messages.length > COLLAPSE_AT
  const visibleMsgs = collapsed ? ann.messages.slice(0, 2) : ann.messages
  const showInput = !collapsed && !isTyping && ann.type === 'discussion'

  return (
    <div
      data-annotation-entry={ann.id}
      style={{ paddingLeft: '12px', borderLeft: `2px solid ${TYPE_COLOR[ann.type]}` }}
      onMouseEnter={() => onHover(ann.id)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Source reference */}
      <button
        className="w-full text-left mb-2"
        onClick={() => onToHighlight(ann.id)}
      >
        <span className="reading-hover-mid text-xs text-faint transition-colors italic" style={{ fontFamily: 'var(--font-ui)' }}>
          &ldquo;{preview}&rdquo;
        </span>
      </button>

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
              <div className="text-sm text-ink leading-relaxed">{msg.content}</div>
            </div>
          ))}

          {isTyping && (
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
            <div className="border-b border-rule pt-1">
              <input
                type="text"
                value={replyVal}
                onChange={e => onReplyChange(ann.id, e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && replyVal.trim()) onReplySubmit(ann.id) }}
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

function TOCDrawer({ open, onClose, chapters, book, currentChapterId, onSelect }: { open: boolean; onClose: () => void; chapters: Array<{ id: string; title: string; chapter_index: number }>; book: { title: string; author: string }; currentChapterId?: string; onSelect: (id: string) => void }) {
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
            <p className="text-sm text-ink" style={{ fontFamily: 'var(--font-ui)', fontWeight: 500 }}>{book.title}</p>
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

const TOOLBAR_ITEMS: { action: AnnType; label: string; icon: string }[] = [
  { action: 'bookmark',   label: '书签', icon: '🔖' },
  { action: 'annotation', label: '批注', icon: 'A' },
  { action: 'discussion', label: '问AI', icon: '✦' },
]

export default function App() {
  const query = new URLSearchParams(window.location.search)
  const requestedBookId = query.get('bookId') || undefined
  const requestedChapterId = query.get('chapterId') || undefined
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
  const [noteVal, setNoteVal] = useState('')
  const [tocOpen, setTocOpen] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [connector, setConnector] = useState<Connector | null>(null)
  const [aiTypingId, setAiTypingId] = useState<string | null>(null)
  const [replies, setReplies] = useState<Record<string, string>>({})
  const [annotationWidth, setAnnotationWidth] = useState(288)
  const [isResizingAnnotations, setIsResizingAnnotations] = useState(false)

  const noteRef = useRef<HTMLInputElement>(null)
  const annotationResizeStart = useRef<{ x: number; width: number } | null>(null)

  const activeBook = book || { ...FALLBACK_BOOK, id: '', author: FALLBACK_BOOK.author, description: null, status: 'ready', parse_error: null, created_at: '', updated_at: '', import_file: { id: '', file_name: '', file_format: '', file_size: 0, file_hash: '', created_at: '' } }
  const activeChapter = chapters.find(item => item.id === chapterId) || chapters[0]
  const activeChapterTitle = activeChapter?.title || FALLBACK_BOOK.chapter

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError(null)
      try {
        const books = await api.listBooks()
        const selected = requestedBookId ? books.find(item => item.id === requestedBookId) : books[0]
        if (!selected) throw new Error('暂无可阅读的书籍。')
        const [bookChapters, progressRecord, bookAnnotations, excerpts, bookConversations] = await Promise.all([
          api.listChapters(selected.id),
          api.getProgress(selected.id),
          api.listAnnotations(selected.id),
          api.listExcerpts(selected.id),
          api.listConversations(selected.id),
        ])
        const selectedChapterId = requestedChapterId || progressRecord?.chapter_id || bookChapters[0]?.id
        if (!selectedChapterId) throw new Error('这本书还没有可读章节。')
        const chapter = await api.getChapter(selected.id, selectedChapterId)
        const split = splitChapterText(chapter.text)
        const chapterIndex = new Map(bookChapters.map(item => [item.id, item.chapter_index]))
        const toParagraph = (text: string, id: string) => {
          const local = split.paragraphs.findIndex(item => item.includes(text))
          return local >= 0 ? local : Math.max(0, chapterIndex.get(id) || 0)
        }
        const anns: Ann[] = [
          ...excerpts.filter(item => item.chapter_id === chapter.id).map(item => ({ id: item.id, type: 'bookmark' as const, paragraphIndex: toParagraph(item.selected_text, item.chapter_id), selectedText: item.selected_text, note: '', messages: [], expanded: false, chapterId: item.chapter_id })),
          ...bookAnnotations.filter(item => item.chapter_id === chapter.id).map(item => ({ id: item.id, type: item.note_content ? 'annotation' as const : 'annotation' as const, paragraphIndex: toParagraph(item.selected_text, item.chapter_id), selectedText: item.selected_text, note: item.note_content || '', messages: [], expanded: false, chapterId: item.chapter_id })),
        ]
        const conversationMessages = await Promise.all(bookConversations.map(async conversation => [conversation.id, await api.listMessages(selected.id, conversation.id)] as const))
        const messageMap = Object.fromEntries(conversationMessages)
        for (const conversation of bookConversations) {
          if (!conversation.annotation_id) continue
          const anchor = anns.find(item => item.id === conversation.annotation_id)
          if (anchor) {
            anchor.type = 'discussion'
            anchor.conversationId = conversation.id
            anchor.messages = (messageMap[conversation.id] || []).filter(message => message.role === 'user' || message.role === 'assistant').map(message => ({ id: message.id, role: message.role === 'assistant' ? 'ai' : 'user', content: message.content }))
          }
        }
        if (cancelled) return
        setBook(selected)
        setChapters(bookChapters)
        setChapterId(chapter.id)
        setChapterText(chapter.text)
        setParagraphs(split.paragraphs)
        setParagraphStarts(split.starts)
        setAnnotations(anns)
        setConversations(bookConversations)
        setMessages(messageMap)
        void api.saveProgress(selected.id, chapter.id).catch(() => undefined)
      } catch (error) {
        if (!cancelled) setLoadError(isUnauthorized(error) ? '请先登录后再打开书籍。' : error instanceof Error ? error.message : '无法加载书籍。')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [requestedBookId, requestedChapterId])

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

  const sorted = [...annotations].sort((a, b) => {
    if (a.paragraphIndex !== b.paragraphIndex) return a.paragraphIndex - b.paragraphIndex
    return (paragraphs[a.paragraphIndex]?.indexOf(a.selectedText) ?? 0) - (paragraphs[b.paragraphIndex]?.indexOf(b.selectedText) ?? 0)
  })

  // ── Connector line ─────────────────────────────────────────────────────────

  useEffect(() => {
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
    setSel({ text, paragraphIndex: pi, rect, startOffset, endOffset: startOffset + utf16Length(text) })
  }

  // ── Toolbar action ─────────────────────────────────────────────────────────

  const handleAction = (action: AnnType) => {
    if (!sel) return
    if (action === 'bookmark') {
      if (!book || !chapterId) return
      void api.createExcerpt(book.id, { chapter_id: chapterId, start_offset: sel.startOffset, end_offset: sel.endOffset, selected_text: sel.text }).then(excerpt => {
        const id = excerpt.id
        setAnnotations(prev => [...prev, { id, type: 'bookmark', paragraphIndex: sel.paragraphIndex, selectedText: sel.text, note: '', messages: [], expanded: false, chapterId }])
        setSel(null)
        setTimeout(() => flashEl(`[data-annotation-entry="${id}"]`), 200)
      }).catch(error => setNotice(error instanceof Error ? error.message : '书签保存失败'))
    } else {
      setPending(action)
      window.getSelection()?.removeAllRanges()
      setTimeout(() => noteRef.current?.focus(), 50)
    }
  }

  // ── Note submit ────────────────────────────────────────────────────────────

  const handleNoteSubmit = () => {
    if (!sel || !pending || !noteVal.trim() || !book || !chapterId) return
    const content = noteVal.trim()
    const selection = sel
    const type = pending
    setSel(null); setPending(null); setNoteVal('')
    if (type === 'annotation') {
      void api.createAnnotation(book.id, { chapter_id: chapterId, start_offset: selection.startOffset, end_offset: selection.endOffset, selected_text: selection.text, note_content: content, color: 'umber' }).then(annotation => {
        const item: Ann = { id: annotation.id, type: 'annotation', paragraphIndex: selection.paragraphIndex, selectedText: selection.text, note: content, messages: [], expanded: false, chapterId }
        setAnnotations(prev => [...prev, item])
        setTimeout(() => scrollToEntry(item.id), 100)
      }).catch(error => setNotice(error instanceof Error ? error.message : '批注保存失败'))
      return
    }
    setAiTypingId(`pending-${selection.startOffset}`)
    void (async () => {
      try {
        const annotation = await api.createAnnotation(book.id, { chapter_id: chapterId, start_offset: selection.startOffset, end_offset: selection.endOffset, selected_text: selection.text, color: 'slate' })
        const conversation = await api.createConversation(book.id, '阅读讨论', annotation.id)
        const item: Ann = { id: annotation.id, type: 'discussion', paragraphIndex: selection.paragraphIndex, selectedText: selection.text, note: '', messages: [{ id: uid(), role: 'user', content }], expanded: false, chapterId, conversationId: conversation.id }
        setAnnotations(prev => [...prev, item])
        setConversations(prev => [...prev, conversation])
        setAiTypingId(annotation.id)
        const run = await api.createAIRun(book.id, conversation.id, { content, chapter_id: chapterId, selection: selection.text, client_message_id: uid() })
        let status = run.status
        for (let attempt = 0; attempt < 125 && ['queued', 'running'].includes(status); attempt += 1) {
          await new Promise(resolve => window.setTimeout(resolve, 1000))
          status = (await api.getAIRun(run.id)).status
        }
        const history = await api.listMessages(book.id, conversation.id)
        setMessages(prev => ({ ...prev, [conversation.id]: history }))
        setAnnotations(prev => prev.map(current => current.id === annotation.id ? { ...current, messages: history.filter(message => message.role === 'user' || message.role === 'assistant').map(message => ({ id: message.id, role: message.role === 'assistant' ? 'ai' : 'user', content: message.content })) } : current))
        setAiTypingId(null)
        setTimeout(() => scrollToEntry(annotation.id), 100)
      } catch (error) {
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
    setAnnotations(prev => prev.map(a => a.id === annId ? { ...a, messages: [...a.messages, { id: uid(), role: 'user', content }] } : a))
    setReplies(prev => ({ ...prev, [annId]: '' }))
    setAiTypingId(annId)
    void (async () => {
      try {
        const run = await api.createAIRun(book.id, ann.conversationId!, { content, chapter_id: chapterId, selection: ann.selectedText, client_message_id: uid() })
        let status = run.status
        for (let attempt = 0; attempt < 125 && ['queued', 'running'].includes(status); attempt += 1) {
          await new Promise(resolve => window.setTimeout(resolve, 1000))
          status = (await api.getAIRun(run.id)).status
        }
        const history = await api.listMessages(book.id, ann.conversationId!)
        setMessages(prev => ({ ...prev, [ann.conversationId!]: history }))
        setAnnotations(prev => prev.map(a => a.id === annId ? { ...a, messages: history.filter(message => message.role === 'user' || message.role === 'assistant').map(message => ({ id: message.id, role: message.role === 'assistant' ? 'ai' : 'user', content: message.content })) } : a))
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
    const el = document.querySelector(`[data-annotation-entry="${id}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    setTimeout(() => flashEl(`[data-annotation-entry="${id}"]`, 'flash-entry'), 300)
  }

  const scrollToHighlight = (id: string) => {
    const el = document.querySelector(`[data-annotation-id="${id}"][data-highlight]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => flashEl(`[data-annotation-id="${id}"][data-highlight]`, 'flash-span'), 300)
  }

  const toggleExpand = (id: string) => {
    setAnnotations(prev => prev.map(a => a.id === id ? { ...a, expanded: !a.expanded } : a))
  }

  const handleAnnotationResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    annotationResizeStart.current = { x: event.clientX, width: annotationWidth }
    setIsResizingAnnotations(true)
  }

  // ── Toolbar geometry ───────────────────────────────────────────────────────

  const tbLeft = sel ? Math.min(Math.max(130, sel.rect.left + sel.rect.width / 2), window.innerWidth - 130) : 0
  const tbTop  = sel ? Math.max(8, sel.rect.top - 46) : 0
  const inLeft = sel ? Math.max(16, Math.min(sel.rect.left, window.innerWidth - 300)) : 0
  const inTop  = sel ? sel.rect.bottom + 10 : 0

  const readingVars = {
    '--color-cream': palette.bg,
    '--color-surface': palette.cardDeep,
    '--color-ink': palette.fg,
    '--color-mid': palette.muted,
    '--color-faint': palette.muted,
    '--color-rule': palette.border,
    '--color-amber': palette.accent,
    '--color-umber': palette.fg,
    '--color-slate': palette.sidebar,
    '--color-overlay': palette.borderMid,
    '--font-body': "'Lora', Georgia, serif",
    '--font-ui': "'Source Sans 3', system-ui, sans-serif",
  } as CSSProperties

  if (loading) return <div className="reading-page-root h-full flex items-center justify-center bg-cream" style={readingVars}>正在加载书籍…</div>
  if (loadError || !book || !chapterId) return <div className="reading-page-root h-full flex items-center justify-center bg-cream" style={readingVars}>{loadError || '暂无可阅读内容。'}</div>

  return (
    <div className="reading-page-root h-full flex flex-col bg-cream" style={readingVars}>

      {notice && (
        <div className="fixed top-3 left-1/2 z-50 -translate-x-1/2 px-3 py-2 text-xs text-ink bg-surface" style={{ fontFamily: 'var(--font-ui)', border: '1px solid var(--color-rule)' }}>
          {notice}
          <button type="button" className="ml-3 text-faint" onClick={() => setNotice(null)} aria-label="关闭提示">×</button>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header
        className="shrink-0 h-12 flex items-center px-5 bg-cream relative z-10"
        style={{ borderBottom: '1px solid var(--color-rule)' }}
      >
        <button
          data-no-select
          className="reading-hover-ink flex items-center gap-1.5 text-xs text-mid transition-colors"
          style={{ fontFamily: 'var(--font-ui)' }}
          onClick={() => setTocOpen(true)}
        >
          <svg width="14" height="10" viewBox="0 0 14 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="0" y1="1"  x2="14" y2="1"/>
            <line x1="0" y1="5"  x2="10" y2="5"/>
            <line x1="0" y1="9"  x2="14" y2="9"/>
          </svg>
          目录
        </button>

        <div className="reading-header-title flex-1 text-center leading-none">
          <span className="text-sm text-mid" style={{ fontFamily: 'var(--font-ui)' }}>{activeBook.title}</span>
          <span className="text-faint text-xs mx-2">·</span>
          <span className="reading-header-chapter text-xs text-faint" style={{ fontFamily: 'var(--font-ui)' }}>{activeChapterTitle}</span>
        </div>

        <div className="w-14" />

      </header>

      {/* ── Main ───────────────────────────────────────────────────────────── */}
      <div className="reading-main flex-1 flex overflow-hidden">

        {/* Reading area */}
        <div
          className="reading-area flex-1 overflow-y-auto"
          onMouseUp={handleMouseUp}
        >
          <div className="reading-content mx-auto px-6 py-16">
            <h1
              className="text-ink mb-1"
              style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '1.55rem' }}
            >
              {activeBook.title}
            </h1>
            <p className="text-xs text-faint mb-12" style={{ fontFamily: 'var(--font-ui)' }}>
              {activeBook.author || activeBook.import_file.file_format.toUpperCase()} · {activeChapterTitle}
            </p>

            <div className="space-y-7">
              {paragraphs.map((p, i) => (
                <p
                  key={i}
                  data-paragraph-index={i}
                  className="text-ink"
                  style={{ fontFamily: 'var(--font-body)', fontSize: '1.08rem', lineHeight: '1.88' }}
                >
                  {renderParagraph(p, annotations, i, setHoveredId, scrollToEntry)}
                </p>
              ))}
            </div>
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
            className="reading-annotations h-full overflow-y-auto bg-cream"
            style={{ borderLeft: '1px solid var(--color-rule)' }}
          >
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
        onSelect={id => {
          const params = new URLSearchParams(window.location.search)
          params.set('chapterId', id)
          window.history.pushState({}, '', `${window.location.pathname}?${params.toString()}`)
          window.location.reload()
        }}
      />

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
          {TOOLBAR_ITEMS.map(({ action, label, icon }, idx) => (
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

      {/* ── Note / question input ──────────────────────────────────────────── */}
      {pending && pending !== 'bookmark' && sel && (
        <div
          data-no-select
          className="fixed z-50"
          style={{ top: inTop, left: inLeft, minWidth: 260 }}
        >
          <input
            ref={noteRef}
            type="text"
            value={noteVal}
            onChange={e => setNoteVal(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && noteVal.trim()) handleNoteSubmit()
              if (e.key === 'Escape') { setPending(null); setNoteVal(''); setSel(null) }
            }}
            placeholder={pending === 'annotation' ? '添加批注… Enter 提交' : '问 AI… Enter 提交'}
            className="reading-placeholder-faint w-full bg-transparent text-sm text-ink outline-none py-1.5"
            style={{
              fontFamily: 'var(--font-ui)',
              borderBottom: `2px solid var(--color-${pending === 'annotation' ? 'umber' : 'slate'})`,
            }}
          />
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
