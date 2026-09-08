import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { api, isUnauthorized, type ApiAnnotation, type ApiBook, type ApiChapter, type ApiExcerpt, type ApiNote } from './api'
import { palette as C } from './theme'
import './ParatextPage.css'

interface ParatextPageProps {
  onNavigate: (path: string) => void
  bookId?: string
}

type LedgerEntry = {
  id: string
  kind: 'annotation' | 'excerpt' | 'note'
  quote: string
  note?: string
  date: string
  timestamp: number
}

type LedgerGroup = { month: string; entries: LedgerEntry[] }

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  return new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit' }).format(date)
}

function formatMonth(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 7)
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date)
}

function groupLedger(entries: LedgerEntry[]): LedgerGroup[] {
  const groups = new Map<string, LedgerGroup>()
  for (const entry of entries.sort((a, b) => b.timestamp - a.timestamp)) {
    const month = formatMonth(entry.date)
    const group = groups.get(month) || { month, entries: [] }
    group.entries.push(entry)
    groups.set(month, group)
  }
  return [...groups.values()]
}

function bookError(error: unknown): string {
  if (isUnauthorized(error)) return 'Please sign in before opening a book.'
  return error instanceof Error ? error.message : 'Unable to load this book.'
}

export default function ParatextPage({ onNavigate, bookId }: ParatextPageProps) {
  const [book, setBook] = useState<ApiBook | null>(null)
  const [chapters, setChapters] = useState<ApiChapter[]>([])
  const [progressChapterId, setProgressChapterId] = useState<string | null>(null)
  const [annotations, setAnnotations] = useState<ApiAnnotation[]>([])
  const [excerpts, setExcerpts] = useState<ApiExcerpt[]>([])
  const [notes, setNotes] = useState<ApiNote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const requestedBookId = bookId || new URLSearchParams(window.location.search).get('bookId') || undefined

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const books = await api.listBooks()
        const selected = requestedBookId ? books.find(item => item.id === requestedBookId) : books[0]
        if (!selected) throw new Error('No books are available in your library.')
        const [bookChapters, progress, bookAnnotations, bookExcerpts, bookNotes] = await Promise.all([
          api.listChapters(selected.id),
          api.getProgress(selected.id),
          api.listAnnotations(selected.id),
          api.listExcerpts(selected.id),
          api.listNotes(selected.id),
        ])
        if (cancelled) return
        setBook(selected)
        setChapters(bookChapters)
        setProgressChapterId(progress?.chapter_id || null)
        setAnnotations(bookAnnotations)
        setExcerpts(bookExcerpts)
        setNotes(bookNotes)
      } catch (loadError) {
        if (!cancelled) setError(bookError(loadError))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [requestedBookId])

  const style = {
    '--paratext-bg': C.bg,
    '--paratext-surface': C.card,
    '--paratext-surface-muted': C.cardDeep,
    '--paratext-ink': C.fg,
    '--paratext-muted': C.muted,
    '--paratext-rule': C.border,
    '--paratext-rule-strong': C.borderMid,
    '--paratext-accent': C.accent,
    '--paratext-cover': C.bookCovers[1],
  } as CSSProperties

  const chapterById = useMemo(() => new Map(chapters.map(chapter => [chapter.id, chapter])), [chapters])
  const currentChapterIndex = progressChapterId ? (chapterById.get(progressChapterId)?.chapter_index ?? 0) : -1
  const progressPercent = chapters.length && currentChapterIndex >= 0
    ? Math.round(((currentChapterIndex + 1) / chapters.length) * 100)
    : 0
  const ledger = useMemo(() => groupLedger([
    ...annotations.map(annotation => ({
      id: `annotation-${annotation.id}`,
      kind: 'annotation' as const,
      quote: `“${annotation.selected_text}”`,
      note: annotation.note_content || undefined,
      date: annotation.created_at,
      timestamp: Date.parse(annotation.created_at) || 0,
    })),
    ...excerpts.map(excerpt => ({
      id: `excerpt-${excerpt.id}`,
      kind: 'excerpt' as const,
      quote: `“${excerpt.selected_text}”${chapterById.get(excerpt.chapter_id) ? ` | ${chapterById.get(excerpt.chapter_id)!.title}` : ''}`,
      date: excerpt.created_at,
      timestamp: Date.parse(excerpt.created_at) || 0,
    })),
    ...notes.map(note => ({
      id: `note-${note.id}`,
      kind: 'note' as const,
      quote: note.content,
      date: note.updated_at,
      timestamp: Date.parse(note.updated_at) || 0,
    })),
  ]), [annotations, excerpts, notes, chapterById])

  const readPath = (chapterId?: string) => {
    if (!book) return '/read'
    const params = new URLSearchParams({ bookId: book.id })
    if (chapterId) params.set('chapterId', chapterId)
    return `/read?${params.toString()}`
  }

  if (loading) return <main className="paratext-page paratext-state" style={style}>Loading book…</main>
  if (error || !book) {
    return <main className="paratext-page paratext-state" style={style}>
      <p>{error || 'Book not found.'}</p>
      <button type="button" className="paratext-back" onClick={() => onNavigate('/library')}>&larr; Library</button>
    </main>
  }

  return (
    <main className="paratext-page" style={style}>
      <nav className="paratext-nav" aria-label="Page navigation">
        <button type="button" className="paratext-back" onClick={() => onNavigate('/library')}>
          <span aria-hidden="true">&larr;</span>
          Library
        </button>
      </nav>

      <div className="paratext-layout">
        <section className="paratext-archive" aria-labelledby="paratext-book-title">
          <div className="paratext-book-intro">
            <div className="paratext-cover" aria-label={`${book.title} book cover`}>
              <div className="paratext-cover-spine" />
              <div className="paratext-cover-copy">
                <strong>{book.title}</strong>
                <span>{book.import_file.file_format.toUpperCase()}</span>
              </div>
            </div>

            <div className="paratext-book-meta">
              <div>
                <h1 id="paratext-book-title">{book.title}</h1>
                <p className="paratext-subtitle">{book.import_file.file_name}</p>
                <p className="paratext-author">{book.status}</p>
              </div>
              <div className="paratext-progress-block">
                <div className="paratext-progress-label"><span>Reading progress</span><strong>{progressPercent}%{currentChapterIndex >= 0 ? ` (Ch. ${currentChapterIndex + 1})` : ''}</strong></div>
                <div className="paratext-progress-track"><span style={{ width: `${progressPercent}%` }} /></div>
                <button type="button" className="paratext-continue" onClick={() => onNavigate(readPath(progressChapterId || chapters[0]?.id))}>
                  Continue reading <span aria-hidden="true">&rarr;</span>
                </button>
              </div>
            </div>
          </div>

          <div className="paratext-synopsis">
            <h2>Book details</h2>
            <p>Imported {book.import_file.file_format.toUpperCase()} file with {chapters.length} {chapters.length === 1 ? 'chapter' : 'chapters'}.</p>
            <p>{book.import_file.file_size.toLocaleString()} bytes · Added {formatDate(book.created_at)}</p>
          </div>

          <section className="paratext-contents" aria-labelledby="contents-title">
            <div className="paratext-section-heading">
              <h2 id="contents-title">Contents</h2>
              <span>{chapters.length} {chapters.length === 1 ? 'chapter' : 'chapters'}</span>
            </div>
            <div className="paratext-chapter-list">
              {chapters.map(chapter => (
                <button type="button" className={`paratext-chapter${chapter.id === progressChapterId ? ' is-current' : ''}`} key={chapter.id} onClick={() => onNavigate(readPath(chapter.id))}>
                  <span className="paratext-chapter-number">{String(chapter.chapter_index + 1).padStart(2, '0')}.</span>
                  <span className="paratext-chapter-title">{chapter.title || `Chapter ${chapter.chapter_index + 1}`}</span>
                  <span className="paratext-chapter-page">{chapter.text_length.toLocaleString()} chars</span>
                </button>
              ))}
            </div>
          </section>
        </section>

        <section className="paratext-ledger" aria-labelledby="ledger-title">
          <header className="paratext-ledger-header"><h2 id="ledger-title">Reading Ledger</h2></header>
          <div className="paratext-ledger-scroll">
            {ledger.length === 0 ? <p className="paratext-empty">No annotations, excerpts, or notes yet.</p> : ledger.map(group => (
              <section className="paratext-ledger-group" key={group.month} aria-label={group.month}>
                <div className="paratext-month"><span>{group.month}</span><i /></div>
                <div className="paratext-entries">
                  {group.entries.map(entry => (
                    <article className={`paratext-entry paratext-entry-${entry.kind}`} key={entry.id}>
                      <div className="paratext-entry-main">
                        <p>{entry.quote}</p>
                        <time>{formatDate(entry.date)}</time>
                      </div>
                      {entry.note && <p className="paratext-entry-note">{entry.note}</p>}
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
