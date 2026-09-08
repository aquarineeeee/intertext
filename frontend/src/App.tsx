import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { api, isUnauthorized, type ApiUser } from './api'
import { palette as C } from './theme'
import SettingsPage from './SettingsPage'
import AuthPage from './AuthPage'
import ReadingPage from './ReadingPage'
import ParatextPage from './ParatextPage'

// ─── Design tokens ────────────────────────────────────────────────────────────
const SECTION_HEADER_HEIGHT = 114

// ─── SVG Icons ────────────────────────────────────────────────────────────────
function SvgSettings() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx={12} cy={12} r={3} />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function SvgChevronRight() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

// ─── Data types ───────────────────────────────────────────────────────────────
type BookStatus = 'reading' | 'read' | 'to-read'

interface Book {
  id: string | number
  title: string
  author: string
  genre: string
  color: string
  status: BookStatus
  progress: number
}

interface Entry {
  id: string | number
  type: 'annotation' | 'excerpt'
  text: string
  page: number
  bookTitle: string
  bookId: string | number
  date: string
}

interface Note {
  id: string | number
  title: string
  date: string
  bookTitle: string | null
}

interface HeatDay {
  date: Date
  pages: number
  level: 0 | 1 | 2 | 3 | 4
}

// ─── Mock data ────────────────────────────────────────────────────────────────
const BOOKS: Book[] = [
  { id: 1, title: 'The Name of the Rose', author: 'Umberto Eco', genre: 'Historical Fiction', color: C.bookCovers[0], status: 'reading', progress: 68 },
  { id: 2, title: 'Invisible Cities', author: 'Italo Calvino', genre: 'Literary Fiction', color: C.bookCovers[1], status: 'read', progress: 100 },
  { id: 3, title: 'The Plague', author: 'Albert Camus', genre: 'Philosophy', color: C.bookCovers[2], status: 'reading', progress: 34 },
  { id: 4, title: 'The Master and Margarita', author: 'Mikhail Bulgakov', genre: 'Satire', color: C.bookCovers[3], status: 'read', progress: 100 },
  { id: 5, title: 'Stoner', author: 'John Williams', genre: 'Literary Fiction', color: C.bookCovers[4], status: 'to-read', progress: 0 },
  { id: 6, title: 'Ways of Seeing', author: 'John Berger', genre: 'Art Criticism', color: C.bookCovers[5], status: 'read', progress: 100 },
  { id: 7, title: 'Ficciones', author: 'Jorge Luis Borges', genre: 'Short Stories', color: C.bookCovers[6], status: 'read', progress: 100 },
  { id: 8, title: 'The Stranger', author: 'Albert Camus', genre: 'Philosophy', color: C.bookCovers[5], status: 'to-read', progress: 0 },
]

const ENTRIES: Entry[] = [
  { id: 1, bookId: 1, bookTitle: 'The Name of the Rose', type: 'annotation', text: 'The labyrinth is a figure of the world — not what we know, but what we fear we cannot know.', page: 142, date: '2026-08-28' },
  { id: 2, bookId: 2, bookTitle: 'Invisible Cities', type: 'excerpt', text: 'Cities, like dreams, are made of desires and fears, even if the thread of their discourse is secret, their rules are absurd, their perspectives deceitful.', page: 44, date: '2026-08-21' },
  { id: 3, bookId: 1, bookTitle: 'The Name of the Rose', type: 'annotation', text: 'The library does not contain books — it contains the memory of books, which is not the same thing at all.', page: 186, date: '2026-08-25' },
  { id: 4, bookId: 3, bookTitle: 'The Plague', type: 'excerpt', text: "What's true of all the evils in the world is true of plague as well. It helps men to rise above themselves.", page: 308, date: '2026-08-15' },
  { id: 5, bookId: 7, bookTitle: 'Ficciones', type: 'annotation', text: 'The garden of forking paths — every story branches endlessly, and every branch is equally real.', page: 67, date: '2026-08-10' },
  { id: 6, bookId: 2, bookTitle: 'Invisible Cities', type: 'annotation', text: 'An invisible city is only visible to those who have ceased looking for it.', page: 89, date: '2026-08-18' },
  { id: 7, bookId: 6, bookTitle: 'Ways of Seeing', type: 'excerpt', text: 'Seeing comes before words. The child looks and recognizes before it can speak.', page: 7, date: '2026-07-30' },
  { id: 8, bookId: 4, bookTitle: 'The Master and Margarita', type: 'excerpt', text: 'Cowardice is the greatest sin.', page: 238, date: '2026-07-14' },
]

const NOTES: Note[] = [
  { id: 1, title: 'On reading slowly', date: '2026-08-29', bookTitle: null },
  { id: 2, title: "Eco's method of world-building", date: '2026-08-26', bookTitle: 'The Name of the Rose' },
  { id: 3, title: 'Calvino and architecture', date: '2026-08-20', bookTitle: 'Invisible Cities' },
  { id: 4, title: 'Why I return to Camus', date: '2026-08-14', bookTitle: 'The Plague' },
  { id: 5, title: 'On annotation as a practice', date: '2026-08-07', bookTitle: null },
]

// ─── Heatmap data ─────────────────────────────────────────────────────────────
function generateHeatmap(): HeatDay[] {
  const today = new Date(2026, 7, 30)
  const days: HeatDay[] = []
  for (let i = 363; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const s = d.getDate() * 17 + (d.getMonth() + 1) * 97 + (d.getFullYear() - 2000) * 31
    const r1 = ((s * 1103515245 + 12345) >>> 0) / 4294967296
    const r2 = ((s * 214013 + 2531011) >>> 0) / 4294967296
    let pages = 0
    let level: HeatDay['level'] = 0
    if (r1 > 0.40) {
      pages = Math.floor(r2 * 72) + 8
      level = pages <= 20 ? 1 : pages <= 38 ? 2 : pages <= 58 ? 3 : 4
    }
    days.push({ date: d, pages, level })
  }
  return days
}

function organizeWeeks(days: HeatDay[]): (HeatDay | null)[][] {
  const result: (HeatDay | null)[][] = []
  const startDow = days[0].date.getDay()
  let week: (HeatDay | null)[] = Array(startDow).fill(null)
  for (const day of days) {
    week.push(day)
    if (day.date.getDay() === 6) { result.push(week); week = [] }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null)
    result.push(week)
  }
  return result
}

// ─── Books Panel ──────────────────────────────────────────────────────────────
function BookCard({ book, onOpen }: { book: Book; onOpen: (bookId: string | number) => void }) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      type="button"
      aria-label={`Open ${book.title}`}
      onClick={() => onOpen(book.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: C.card,
        padding: 0, border: 0, borderRadius: 3,
        overflow: 'hidden',
        cursor: 'pointer',
        transform: hovered ? 'translateY(-2px)' : 'none',
         boxShadow: hovered ? '0 6px 20px rgba(81,74,69,0.13)' : 'none',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease',
      }}
    >
        <div style={{
          background: book.color,
          aspectRatio: '2 / 3',
          position: 'relative',
        }}>
        <div style={{
          position: 'absolute', inset: 0,
           backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 7px, rgba(81,74,69,0.025) 7px, rgba(81,74,69,0.025) 8px)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', inset: 0,
           background: 'linear-gradient(90deg, rgba(81,74,69,0.08) 0%, transparent 12%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', padding: 14, textAlign: 'center', pointerEvents: 'none',
        }}>
          <div style={{
            fontFamily: "'Lora', serif", fontSize: 15, fontWeight: 500,
            lineHeight: 1.35, color: C.fg,
          }}>
            {book.title}
          </div>
          <div style={{
            fontFamily: "'Source Sans 3', sans-serif", fontSize: 11,
            lineHeight: 1.35, color: C.muted, marginTop: 6,
          }}>
            {book.author}
          </div>
        </div>
        {book.progress > 0 && book.progress < 100 && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: 'rgba(81,74,69,0.12)' }}>
            <div style={{ width: `${book.progress}%`, height: '100%', background: 'rgba(81,74,69,0.28)' }} />
          </div>
        )}
      </div>
    </button>
  )
}

function BookListRow({ book, onOpen }: { book: Book; onOpen: (bookId: string | number) => void }) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      type="button"
      aria-label={`Open ${book.title}`}
      onClick={() => onOpen(book.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', width: '100%', border: 0, textAlign: 'left', font: 'inherit', alignItems: 'center', gap: 12,
        padding: '10px 12px', minHeight: 74,
        background: hovered ? 'rgba(81,74,69,0.03)' : 'transparent',
        borderBottom: `1px solid ${C.border}`,
        cursor: 'pointer', transition: 'background 0.1s',
      }}
    >
      <div style={{
        width: 36, height: 52, flexShrink: 0,
        background: book.color, borderRadius: 2,
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 7px, rgba(81,74,69,0.025) 7px, rgba(81,74,69,0.025) 8px)',
      }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontFamily: "'Lora', serif", fontSize: 14, fontWeight: 500,
          color: C.fg, lineHeight: 1.35,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {book.title}
        </div>
        <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: 11, color: C.muted, marginTop: 3 }}>
          {book.author}
        </div>
      </div>
      {book.progress > 0 && book.progress < 100 && (
        <div style={{ width: 56, height: 3, background: 'rgba(81,74,69,0.12)', flexShrink: 0 }}>
          <div style={{ width: `${book.progress}%`, height: '100%', background: 'rgba(81,74,69,0.28)' }} />
        </div>
      )}
    </button>
  )
}

function BooksPanel({ books, loading, onBookImported, onOpenBook }: { books: Book[]; loading: boolean; onBookImported: (file: File) => Promise<void>; onOpenBook: (bookId: string | number) => void }) {
  const [view, setView] = useState<'shelf' | 'list'>('shelf')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const views: { id: 'shelf' | 'list'; label: string }[] = [
    { id: 'shelf', label: 'Shelf' },
    { id: 'list', label: 'List' },
  ]

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setUploadError(null)
    setUploading(true)
    try {
      await onBookImported(file)
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : '书籍上传失败')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{
        padding: '18px 24px 13px',
        height: SECTION_HEADER_HEIGHT,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div>
          <h2 style={{ fontFamily: "'Lora', serif", fontSize: 22, fontWeight: 500, color: C.fg, margin: 0, lineHeight: 1 }}>
            Library
          </h2>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9.5, color: C.muted, marginTop: 4, letterSpacing: '0.05em' }}>
            {loading ? 'Loading…' : `${books.length} volumes`}
          </div>
        </div>
         <div style={{ display: 'flex', gap: 1, background: 'rgba(81,74,69,0.06)', borderRadius: 4, padding: 2 }}>
           {views.map(v => (
             <button
               key={v.id}
               onClick={() => setView(v.id)}
               style={{
                 padding: '3px 10px', borderRadius: 3, border: 'none',
                 fontFamily: "'Source Sans 3', sans-serif", fontSize: 11.5,
                 fontWeight: view === v.id ? 600 : 400,
                 color: view === v.id ? C.fg : C.muted,
                 background: view === v.id ? C.bg : 'transparent',
                 cursor: 'pointer', transition: 'all 0.12s ease',
                 boxShadow: view === v.id ? '0 1px 3px rgba(81,74,69,0.10)' : 'none',
               }}
             >
               {v.label}
             </button>
           ))}
         </div>
       </div>
       {view === 'shelf' ? (
         <div style={{
           flex: 1, overflow: 'auto',
           padding: '16px 24px',
           display: 'grid',
           gridTemplateColumns: 'repeat(4, 1fr)',
           gap: 14,
           alignContent: 'start',
         }}>
           {books.map(book => (
             <BookCard key={book.id} book={book} onOpen={onOpenBook} />
           ))}
           <button
             type="button"
             disabled={uploading}
             aria-label="Add book"
             onClick={() => fileInputRef.current?.click()}
             style={{
               width: '100%',
               padding: 0,
               color: 'inherit',
               font: 'inherit',
               background: 'transparent',
               borderRadius: 3,
               border: `1.5px dashed ${C.borderMid}`,
               aspectRatio: '2 / 3',
               display: 'flex', alignItems: 'center', justifyContent: 'center',
               flexDirection: 'column', gap: 6,
               cursor: uploading ? 'wait' : 'pointer', opacity: uploading ? 0.75 : 0.5,
               transition: 'opacity 0.15s',
             }}
             onMouseEnter={e => { if (!uploading) e.currentTarget.style.opacity = '0.9' }}
             onMouseLeave={e => { e.currentTarget.style.opacity = uploading ? '0.75' : '0.5' }}
           >
             <div style={{ fontSize: 20, color: C.muted, lineHeight: 1 }}>{uploading ? '…' : '+'}</div>
             <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
               {uploading ? 'Uploading' : 'Add book'}
             </div>
           </button>
           <input
             ref={fileInputRef}
             type="file"
             accept=".epub,.txt,application/epub+zip,text/plain"
             onChange={handleFileChange}
             style={{ display: 'none' }}
           />
           {uploadError && (
             <div style={{ gridColumn: '1 / -1', color: C.fg, fontSize: 12, lineHeight: 1.4 }} role="alert">
               {uploadError}
             </div>
           )}
         </div>
       ) : (
         <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
           {books.map(book => (
             <BookListRow key={book.id} book={book} onOpen={onOpenBook} />
           ))}
         </div>
       )}
    </div>
  )
}

// ─── Annotations / Excerpts Panel ─────────────────────────────────────────────
function AnnotationsPanel({ entries, loading }: { entries: Entry[]; loading: boolean }) {
  const [tab, setTab] = useState<'annotation' | 'excerpt'>('annotation')
  const [bookFilter, setBookFilter] = useState<string | number | null>(null)

  const booksForTab = useMemo(() => {
    const seen = new Set<string | number>()
    return entries
      .filter(e => e.type === tab)
      .filter(e => !seen.has(e.bookId) && seen.add(e.bookId))
      .map(e => ({ id: e.bookId, title: e.bookTitle }))
  }, [tab])

  const filtered = entries.filter(
    e => e.type === tab && (bookFilter === null || e.bookId === bookFilter)
  )

  const truncate = (s: string, n: number) => s.length > n ? s.slice(0, n) + '…' : s

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', minHeight: 0,
      background: C.annotationsBg,
    }}>
      <div style={{
        padding: '16px 20px 11px',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 18 }}>
            {(['annotation', 'excerpt'] as const).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setBookFilter(null) }}
                style={{
                  padding: '0 0 6px', border: 'none',
                  borderBottom: tab === t ? `1.5px solid ${C.fg}` : '1.5px solid transparent',
                  background: 'transparent',
                  fontFamily: "'Lora', serif", fontSize: 16, fontWeight: tab === t ? 600 : 500,
                  color: tab === t ? C.fg : C.muted,
                  cursor: 'pointer', transition: 'all 0.13s ease',
                  letterSpacing: '-0.01em',
                }}
              >
                {t === 'annotation' ? 'Annotations' : 'Excerpts'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 5, marginTop: 9, flexWrap: 'wrap' }}>
          <button
            onClick={() => setBookFilter(null)}
            style={{
              padding: '2px 8px', borderRadius: 2, border: 'none',
              background: bookFilter === null ? C.fg : 'rgba(81,74,69,0.07)',
              color: bookFilter === null ? C.bg : C.muted,
              fontFamily: "'Source Sans 3', sans-serif", fontSize: 11,
              cursor: 'pointer', transition: 'all 0.12s',
            }}
          >
            All
          </button>
          {booksForTab.map(b => (
            <button
              key={b.id}
              onClick={() => setBookFilter(bookFilter === b.id ? null : b.id)}
              style={{
                padding: '2px 8px', borderRadius: 2, border: 'none',
                background: bookFilter === b.id ? C.fg : 'rgba(81,74,69,0.07)',
                color: bookFilter === b.id ? C.bg : C.muted,
                fontFamily: "'Source Sans 3', sans-serif", fontSize: 11,
                cursor: 'pointer', transition: 'all 0.12s', whiteSpace: 'nowrap',
              }}
            >
              {truncate(b.title, 18)}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '4px 0' }}>
        {filtered.map(entry => (
          <div
            key={entry.id}
            style={{
              padding: '13px 20px',
              cursor: 'pointer',
              transition: 'background 0.1s',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(81,74,69,0.03)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <blockquote style={{
              margin: 0, padding: '0 0 0 11px',
              borderLeft: `2px solid ${C.borderMid}`,
              fontFamily: "'Lora', serif",
              fontSize: 13, lineHeight: 1.68,
              color: C.fg, fontStyle: 'italic',
            }}>
              {entry.text}
            </blockquote>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginTop: 7, paddingLeft: 13,
            }}>
              <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: 11, color: C.muted }}>
                {truncate(entry.bookTitle, 24)}&nbsp;&middot;&nbsp;ch.&thinsp;{entry.page}
              </div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9.5, color: C.muted, letterSpacing: '0.02em' }}>
                {entry.date}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Notes Panel ─────────────────────────────────────────────────────────────
function NotesPanel({ notes }: { notes: Note[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, background: C.notesBg }}>
      <div style={{
        padding: '14px 20px 12px',
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <h2 style={{ fontFamily: "'Lora', serif", fontSize: 16, fontWeight: 500, color: C.fg, margin: 0 }}>
          Notes
        </h2>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {notes.length === 0 ? (
          <div style={{ padding: '18px 20px', color: C.muted, fontFamily: "'Source Sans 3', sans-serif", fontSize: 12 }}>
            No notes available from the API yet.
          </div>
        ) : notes.map(n => (
          <div
            key={n.id}
            style={{
              padding: '13px 20px',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 12,
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(81,74,69,0.03)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontFamily: "'Lora', serif", fontSize: 13.5, fontWeight: 500,
                color: C.fg, lineHeight: 1.4,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {n.title}
              </div>
              {n.bookTitle && (
                <div style={{
                  fontFamily: "'Source Sans 3', sans-serif", fontSize: 11,
                  color: C.accent, marginTop: 3,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {n.bookTitle}
                </div>
              )}
            </div>
            <div style={{
              fontFamily: "'DM Mono', monospace", fontSize: 9, color: C.muted,
              letterSpacing: '0.03em', flexShrink: 0,
            }}>
              {n.date}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── "更多" Overlay ───────────────────────────────────────────────────────────
const MINI = 9
const MINI_GAP = 2
const MINI_STEP = MINI + MINI_GAP
const MINI_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function MoreOverlay({ onClose, user, onNavigate }: { onClose: () => void; user: ApiUser | null; onNavigate: (path: string) => void }) {
  const allDays = useMemo(() => generateHeatmap(), [])

  // Last 26 weeks for compact display
  const weeks = useMemo(() => organizeWeeks(allDays.slice(-182)), [allDays])

  const monthLabels = useMemo(() => {
    const labels: { col: number; name: string }[] = []
    let lastMonth = -1
    weeks.forEach((week, col) => {
      for (const day of week) {
        if (day && day.date.getMonth() !== lastMonth) {
          lastMonth = day.date.getMonth()
          labels.push({ col, name: MINI_MONTHS[lastMonth] })
          break
        }
      }
    })
    return labels
  }, [weeks])

  const stats = useMemo(() => {
    const thisYear = allDays.filter(d => d.pages > 0 && d.date.getFullYear() === 2026)
    let streak = 0
    for (let i = allDays.length - 1; i >= 0; i--) {
      if (allDays[i].pages > 0) streak++
      else break
    }
    const aug = allDays.filter(d => d.pages > 0 && d.date.getMonth() === 7 && d.date.getFullYear() === 2026)
    const avgPages = aug.length > 0 ? Math.round(aug.reduce((s, d) => s + d.pages, 0) / aug.length) : 0
    return { daysRead: thisYear.length, streak, avgPages }
  }, [allDays])

  const settingsItems = [
    { label: 'Appearance', sub: 'Theme & display' },
    { label: 'Export data', sub: 'Backup your library' },
    { label: 'Notifications', sub: 'Reading reminders' },
  ]

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
           background: 'rgba(81,74,69,0.08)',
          zIndex: 40,
          backdropFilter: 'blur(0.5px)',
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', bottom: 56, right: 20,
        width: 340, zIndex: 50,
        background: C.bg,
        borderRadius: 8,
         boxShadow: '0 8px 40px rgba(81,74,69,0.18), 0 0 0 1px rgba(81,74,69,0.10)',
        overflow: 'hidden',
      }}>
        {/* Account */}
        <div style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
             background: C.sidebar, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Source Sans 3', sans-serif",
             fontSize: 14, fontWeight: 600, color: C.bg,
          }}>
            {(user?.display_name || user?.email || '?').slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div style={{ fontFamily: "'Lora', serif", fontSize: 14, fontWeight: 500, color: C.fg }}>
              {user?.display_name || 'Reader'}
            </div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9.5, color: C.muted, marginTop: 2, letterSpacing: '0.03em' }}>
              {user?.email || '—'}
            </div>
          </div>
        </div>

        {/* Reading Activity */}
        <div style={{ padding: '14px 20px 16px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div style={{ fontFamily: "'Lora', serif", fontSize: 13, fontWeight: 500, color: C.fg }}>
              Reading Activity
            </div>
            <div style={{ display: 'flex', gap: 20 }}>
              {[
                { v: stats.daysRead, l: 'days' },
                { v: stats.streak, l: 'streak' },
                { v: stats.avgPages, l: 'pg/day' },
              ].map(s => (
                <div key={s.l} style={{ textAlign: 'right' }}>
                  <span style={{ fontFamily: "'Lora', serif", fontSize: 15, fontWeight: 500, color: C.fg }}>{s.v}</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, color: C.muted, marginLeft: 3, letterSpacing: '0.04em' }}>{s.l}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Month labels */}
          <div style={{ position: 'relative', height: 13, marginBottom: 2 }}>
            {monthLabels.map((m, i) => (
              <span key={i} style={{
                position: 'absolute', left: m.col * MINI_STEP,
                fontFamily: "'DM Mono', monospace", fontSize: 8.5,
                color: C.muted, letterSpacing: '0.03em', whiteSpace: 'nowrap',
              }}>
                {m.name}
              </span>
            ))}
          </div>

          {/* Heatmap grid */}
          <div style={{ display: 'flex', gap: MINI_GAP }}>
            {weeks.map((week, wi) => (
              <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: MINI_GAP }}>
                {week.map((day, di) => (
                  <div
                    key={di}
                    title={day ? `${day.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${day.pages} pages` : ''}
                    style={{
                      width: MINI, height: MINI, borderRadius: 1.5,
                      background: day ? C.heat[day.level] : 'transparent',
                      flexShrink: 0,
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Settings items */}
        <div style={{ padding: '6px 0' }}>
          {settingsItems.map(item => (
            <button
              key={item.label}
              onClick={() => item.label === 'Appearance' && onNavigate('/settings')}
              style={{
                padding: '9px 20px', cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                transition: 'background 0.1s',
                width: '100%', border: 'none', textAlign: 'left', background: 'transparent',
              }}
               onMouseEnter={e => (e.currentTarget.style.background = 'rgba(81,74,69,0.04)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div>
                <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: 13, color: C.fg }}>
                  {item.label}
                </div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: C.muted, letterSpacing: '0.03em', marginTop: 1 }}>
                  {item.sub}
                </div>
              </div>
              <div style={{ color: C.muted, opacity: 0.6 }}>
                <SvgChevronRight />
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

// ─── "更多" floating button ───────────────────────────────────────────────────
function MoreButton({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title="Settings"
      style={{
        position: 'fixed', bottom: 20, right: 20,
        width: 34, height: 34, borderRadius: '50%',
        border: `1px solid ${hovered ? C.borderMid : C.border}`,
        background: hovered ? C.card : C.bg,
        color: C.muted,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
         boxShadow: hovered ? '0 3px 14px rgba(81,74,69,0.15)' : '0 1px 4px rgba(81,74,69,0.08)',
        transition: 'all 0.18s ease',
        zIndex: 60,
        flexShrink: 0,
      }}
    >
      <SvgSettings />
    </button>
  )
}

// ─── Landing cover ───────────────────────────────────────────────────────────
function LandingCover({ onNavigate }: { onNavigate: (path: string) => void }) {
  const scrollRoot = useRef<HTMLDivElement>(null)
  const [checkingSession, setCheckingSession] = useState(false)

  const enter = async () => {
    if (checkingSession) return
    setCheckingSession(true)
    try {
      await api.me()
      onNavigate('/library')
    } catch (error) {
      if (isUnauthorized(error)) onNavigate('/login')
      else onNavigate('/login')
    } finally {
      setCheckingSession(false)
    }
  }

  useEffect(() => {
    const root = scrollRoot.current
    if (!root) return
    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY > 0 && root.scrollTop < window.innerHeight * 0.45) {
        event.preventDefault()
        void enter()
      }
    }
    root.addEventListener('wheel', handleWheel, { passive: false })
    return () => root.removeEventListener('wheel', handleWheel)
  })

  return (
    <div className="landing-scroll" ref={scrollRoot}>
      <section className="cover-page" aria-label="Intertext introduction">
        <div className="cover-topline">VOLUME I: THE DIALOGUE</div>

        <div className="cover-center">
          <h1 className="cover-title cover-animate cover-animate-title">Intertext</h1>
          <div className="cover-chapter cover-animate cover-animate-chapter">
            <span />
            <span>CHAPTER 14 — INTENTION</span>
            <span />
          </div>
          <blockquote className="cover-quote cover-animate cover-animate-quote">
            <span>“Everything on the earth</span>
            <span>in between, and above</span>
            <span>Is arising from one effulgent source.”</span>
          </blockquote>
          <div className="cover-attribution cover-animate cover-animate-attribution">
            <strong>GAYATRI MANTRA</strong>
            <span>Translated by Donna Farhi</span>
          </div>
        </div>

        <div className="cover-year">INTERTEXT / 2026</div>
        <div className={`cover-scroll-hint ${checkingSession ? 'is-checking' : ''}`}>
          <span>{checkingSession ? 'CHECKING SESSION' : 'SCROLL TO ENTER'}</span>
          <i aria-hidden="true" />
        </div>
      </section>

    </div>
  )
}

// ─── App root ─────────────────────────────────────────────────────────────────
function LibraryApp({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [user, setUser] = useState<ApiUser | null>(null)
  const [books, setBooks] = useState<Book[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const handleBookImported = async (file: File) => {
    const imported = await api.importBook(file)
    const format = imported.import_file.file_format.toUpperCase()
    setBooks(current => [{
      id: imported.id,
      title: imported.title,
      author: format,
      genre: format,
      color: C.bookCovers[current.length % C.bookCovers.length],
      status: 'to-read',
      progress: 0,
    }, ...current.filter(book => book.id !== imported.id)])
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const currentUser = await api.me()
        const apiBooks = await api.listBooks()
        const chapters = await Promise.all(apiBooks.map(book => api.listChapters(book.id)))
        const progress = await Promise.all(apiBooks.map(book => api.getProgress(book.id)))
        const [annotations, excerpts, bookNotes] = await Promise.all([
          Promise.all(apiBooks.map(book => api.listAnnotations(book.id))),
          Promise.all(apiBooks.map(book => api.listExcerpts(book.id))),
          Promise.all(apiBooks.map(book => api.listNotes(book.id))),
        ])
        if (cancelled) return
        const chapterCounts = new Map(apiBooks.map((book, index) => [book.id, chapters[index].length]))
        const chapterIndexes = new Map(chapters.flat().map(chapter => [chapter.id, chapter.chapter_index]))
        setUser(currentUser)
        setBooks(apiBooks.map((book, index) => {
          const total = chapterCounts.get(book.id) || 0
          const current = progress[index]?.chapter_id ? (chapterIndexes.get(progress[index]!.chapter_id!) ?? 0) + 1 : 0
          return {
            id: book.id,
            title: book.title,
            author: book.import_file.file_format.toUpperCase(),
            genre: book.import_file.file_format.toUpperCase(),
            color: C.bookCovers[index % 5],
            status: current === 0 ? 'to-read' : total > 0 && current >= total ? 'read' : 'reading',
            progress: total > 0 ? Math.round((current / total) * 100) : 0,
          }
        }))
        setEntries([
          ...annotations.flatMap((items, bookIndex) => items.map(annotation => ({
          id: annotation.id,
          type: 'annotation' as const,
          text: annotation.note_content || annotation.selected_text,
          page: chapterIndexes.get(annotation.chapter_id) ?? 0,
          bookTitle: apiBooks[bookIndex].title,
          bookId: apiBooks[bookIndex].id,
          date: annotation.created_at.slice(0, 10),
          }))),
          ...excerpts.flatMap((items, bookIndex) => items.map(excerpt => ({
          id: excerpt.id,
          type: 'excerpt' as const,
          text: excerpt.selected_text,
          page: chapterIndexes.get(excerpt.chapter_id) ?? 0,
          bookTitle: apiBooks[bookIndex].title,
          bookId: apiBooks[bookIndex].id,
          date: excerpt.created_at.slice(0, 10),
          }))),
        ])
        setNotes(bookNotes.flatMap((items, bookIndex) => items.map(note => ({
          id: note.id,
          title: note.title,
          date: note.updated_at.slice(0, 10),
          bookTitle: apiBooks[bookIndex].title,
        }))))
      } catch (loadError) {
        if (!cancelled) setError(isUnauthorized(loadError) ? '请先在后端建立会话后再访问书架。' : (loadError as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  if (loading) return <div style={{ padding: 32, color: C.muted }}>Loading library…</div>
  if (error) return <div style={{ padding: 32, color: C.fg }}>{error}</div>

  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden',
      display: 'grid',
      gridTemplateColumns: '3fr 2fr',
      background: C.bg,
    }}>
      {/* Left: Library (full height) */}
      <div style={{ overflow: 'hidden' }}>
        <BooksPanel books={books} loading={loading} onBookImported={handleBookImported} onOpenBook={bookId => onNavigate(`/paratext?bookId=${encodeURIComponent(String(bookId))}`)} />
      </div>

      {/* Right: Annotations (top) + Notes (bottom) */}
      <div style={{ display: 'grid', gridTemplateRows: '6fr 4fr', rowGap: 12, padding: '12px 12px 12px 0', overflow: 'hidden' }}>
        <AnnotationsPanel entries={entries} loading={loading} />
        <NotesPanel notes={notes} />
      </div>

      {/* Floating settings entry */}
      <MoreButton onClick={() => onNavigate('/settings')} />
    </div>
  )
}

export default function App() {
  const [path, setPath] = useState(() => window.location.pathname)

  useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname)
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigate = (nextPath: string) => {
    window.history.pushState({}, '', nextPath)
    setPath(new URL(nextPath, window.location.href).pathname)
  }

  if (path === '/settings') return <SettingsPage onNavigate={navigate} />
  if (path === '/login' || path === '/register') return <AuthPage mode={path === '/register' ? 'register' : 'login'} onNavigate={navigate} />
  if (path === '/library') return <LibraryApp onNavigate={navigate} />
  if (path === '/paratext') return <ParatextPage onNavigate={navigate} />
  if (path === '/read') return <ReadingPage />
  return <LandingCover onNavigate={navigate} />
}
