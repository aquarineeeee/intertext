import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { api, isUnauthorized, type ApiAnnotation, type ApiBook, type ApiChapter, type ApiExcerpt, type ApiMessage, type ApiNote, type ApiReadingBootstrap } from './api'
import { palette as C } from './theme'
import ConfirmDialog from './ConfirmDialog'
import EntryDetailModal from './EntryDetailModal'
import './ParatextPage.css'

interface ParatextPageProps {
  onNavigate: (path: string) => void
  onOpenReading?: (path: string, bootstrap: ApiReadingBootstrap) => void
  bookId?: string
}

type LedgerEntry = {
  id: string
  kind: 'annotation' | 'excerpt' | 'note'
  quote: string
  sourceText?: string
  chapterId?: string
  note?: string
  title?: string
  date: string
  timestamp: number
  sourceId: string
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

export default function ParatextPage({ onNavigate, onOpenReading, bookId }: ParatextPageProps) {
  const [book, setBook] = useState<ApiBook | null>(null)
  const [chapters, setChapters] = useState<ApiChapter[]>([])
  const [lastReadChapterId, setLastReadChapterId] = useState<string | null>(null)
  const [furthestReadChapterId, setFurthestReadChapterId] = useState<string | null>(null)
  const [annotations, setAnnotations] = useState<ApiAnnotation[]>([])
  const [excerpts, setExcerpts] = useState<ApiExcerpt[]>([])
  const [notes, setNotes] = useState<ApiNote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [noteComposerOpen, setNoteComposerOpen] = useState(false)
  const [newNoteTitle, setNewNoteTitle] = useState('')
  const [newNoteContent, setNewNoteContent] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<LedgerEntry | null>(null)
  const [entryModalMode, setEntryModalMode] = useState<'view' | 'edit'>('view')
  const [entryEditTitle, setEntryEditTitle] = useState('')
  const [entryEditContent, setEntryEditContent] = useState('')
  const [entryActionError, setEntryActionError] = useState<string | null>(null)
  const [entrySaving, setEntrySaving] = useState(false)
  const [pendingDeleteEntry, setPendingDeleteEntry] = useState<LedgerEntry | null>(null)
  const [entryDeleting, setEntryDeleting] = useState(false)
  const [entryMessages, setEntryMessages] = useState<ApiMessage[]>([])
  const [entryMessagesLoading, setEntryMessagesLoading] = useState(false)
  const entryMessageRequest = useRef(0)

  const requestedBookId = bookId || new URLSearchParams(window.location.search).get('bookId') || undefined

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const selected = requestedBookId ? await api.getBook(requestedBookId) : (await api.listBooks())[0]
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
        setLastReadChapterId(progress?.last_read_chapter_id || null)
        setFurthestReadChapterId(progress?.furthest_read_chapter_id || null)
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
  const currentChapterIndex = furthestReadChapterId ? (chapterById.get(furthestReadChapterId)?.chapter_index ?? 0) : -1
  const progressPercent = chapters.length && currentChapterIndex >= 0
    ? Math.round(((currentChapterIndex + 1) / chapters.length) * 100)
    : 0
  const ledger = useMemo(() => groupLedger([
    ...annotations.map(annotation => ({
      id: `annotation-${annotation.id}`,
      kind: 'annotation' as const,
      quote: annotation.first_user_message || `“${annotation.selected_text}”`,
      sourceText: annotation.selected_text,
      chapterId: annotation.chapter_id,
      note: annotation.note_content || undefined,
      date: annotation.created_at,
      timestamp: Date.parse(annotation.created_at) || 0,
      sourceId: annotation.id,
    })),
    ...excerpts.map(excerpt => ({
      id: `excerpt-${excerpt.id}`,
      kind: 'excerpt' as const,
      quote: `“${excerpt.selected_text}”${chapterById.get(excerpt.chapter_id) ? ` | ${chapterById.get(excerpt.chapter_id)!.title}` : ''}`,
      sourceText: excerpt.selected_text,
      chapterId: excerpt.chapter_id,
      date: excerpt.created_at,
      timestamp: Date.parse(excerpt.created_at) || 0,
      sourceId: excerpt.id,
    })),
    ...notes.map(note => ({
      id: `note-${note.id}`,
      kind: 'note' as const,
      quote: note.content,
      title: note.title,
      date: note.updated_at,
      timestamp: Date.parse(note.updated_at) || 0,
      sourceId: note.id,
    })),
  ]), [annotations, excerpts, notes, chapterById])

  const readPath = (chapterId?: string, highlightId?: string) => {
    if (!book) return '/read'
    const params = new URLSearchParams({ bookId: book.id })
    if (chapterId) params.set('chapterId', chapterId)
    if (highlightId) params.set('highlightId', highlightId)
    return `/read?${params.toString()}`
  }

  const openReading = (chapterId?: string, highlightId?: string) => {
    const path = readPath(chapterId, highlightId)
    if (book && onOpenReading) {
      onOpenReading(path, { book, chapters, last_read_chapter_id: lastReadChapterId })
      return
    }
    onNavigate(path)
  }

  const handleCreateNote = async () => {
    if (!book || !newNoteContent.trim() || noteSaving) return
    setNoteSaving(true)
    setNoteError(null)
    try {
      const note = await api.createNote(book.id, newNoteTitle.trim() || '阅读笔记', newNoteContent.trim())
      setNotes(current => [note, ...current])
      setNewNoteTitle('')
      setNewNoteContent('')
      setNoteComposerOpen(false)
    } catch (saveError) {
      setNoteError(saveError instanceof Error ? saveError.message : 'Unable to save this note.')
    } finally {
      setNoteSaving(false)
    }
  }

  const openEntryModal = (entry: LedgerEntry, mode: 'view' | 'edit' = 'view') => {
    const requestId = entryMessageRequest.current + 1
    entryMessageRequest.current = requestId
    setOpenMenuId(null)
    setSelectedEntry(entry)
    setEntryModalMode(mode)
    setEntryActionError(null)
    setEntryEditTitle(entry.title || '')
    setEntryEditContent(entry.kind === 'annotation' ? (entry.note || '') : entry.kind === 'note' ? entry.quote : entry.quote)
    setEntryMessages([])
    if (mode === 'view' && entry.kind === 'annotation' && book) {
      setEntryMessagesLoading(true)
      void api.listAnnotationMessages(book.id, entry.sourceId)
        .then(messages => { if (entryMessageRequest.current === requestId) setEntryMessages(messages) })
        .catch(loadError => { if (entryMessageRequest.current === requestId) setEntryActionError(loadError instanceof Error ? loadError.message : '无法加载对话。') })
        .finally(() => { if (entryMessageRequest.current === requestId) setEntryMessagesLoading(false) })
    } else {
      setEntryMessagesLoading(false)
    }
  }

  const closeEntryModal = () => {
    if (entrySaving) return
    entryMessageRequest.current += 1
    setSelectedEntry(null)
    setEntryMessagesLoading(false)
    setEntryActionError(null)
  }

  const requestEntryDelete = (entry: LedgerEntry) => {
    setOpenMenuId(null)
    setEntryActionError(null)
    setPendingDeleteEntry(entry)
  }

  const handleEntryDelete = async () => {
    if (!book || !pendingDeleteEntry || entryDeleting) return
    const entry = pendingDeleteEntry
    setEntryDeleting(true)
    setEntryActionError(null)
    try {
      if (entry.kind === 'annotation') {
        await api.deleteAnnotation(book.id, entry.sourceId)
        setAnnotations(current => current.filter(item => item.id !== entry.sourceId))
      } else if (entry.kind === 'excerpt') {
        await api.deleteExcerpt(book.id, entry.sourceId)
        setExcerpts(current => current.filter(item => item.id !== entry.sourceId))
      } else {
        await api.deleteNote(book.id, entry.sourceId)
        setNotes(current => current.filter(item => item.id !== entry.sourceId))
      }
      if (selectedEntry?.id === entry.id) closeEntryModal()
      setPendingDeleteEntry(null)
    } catch (deleteError) {
      setEntryActionError(deleteError instanceof Error ? deleteError.message : 'Unable to delete this item.')
    } finally {
      setEntryDeleting(false)
    }
  }

  const handleEntrySave = async () => {
    if (!book || !selectedEntry || selectedEntry.kind === 'excerpt' || entrySaving) return
    setEntrySaving(true)
    setEntryActionError(null)
    try {
      if (selectedEntry.kind === 'annotation') {
        const updated = await api.updateAnnotation(book.id, selectedEntry.sourceId, { note_content: entryEditContent.trim() || null })
        setAnnotations(current => current.map(item => item.id === updated.id ? updated : item))
      } else {
        const updated = await api.updateNote(book.id, selectedEntry.sourceId, { title: entryEditTitle.trim() || '阅读笔记', content: entryEditContent.trim() })
        setNotes(current => current.map(item => item.id === updated.id ? updated : item))
      }
      setSelectedEntry(null)
    } catch (saveError) {
      setEntryActionError(saveError instanceof Error ? saveError.message : 'Unable to save this item.')
    } finally {
      setEntrySaving(false)
    }
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
                <div className="paratext-progress-actions">
                  <button type="button" className="paratext-continue" onClick={() => openReading(lastReadChapterId || chapters[0]?.id)}>
                    Continue reading <span aria-hidden="true">&rarr;</span>
                  </button>
                  <button type="button" className="paratext-add-notes" onClick={() => { setNoteError(null); setNoteComposerOpen(true) }}>
                    add notes
                  </button>
                </div>
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
                <button type="button" className={`paratext-chapter${chapter.id === lastReadChapterId ? ' is-current' : ''}`} key={chapter.id} onClick={() => openReading(chapter.id)}>
                  <span className="paratext-chapter-number">{String(chapter.chapter_index + 1).padStart(2, '0')}.</span>
                  <span className="paratext-chapter-title">{chapter.title || `Chapter ${chapter.chapter_index + 1}`}</span>
                  <span className="paratext-chapter-page">{chapter.text_length.toLocaleString()} chars</span>
                </button>
              ))}
            </div>
          </section>
        </section>

        <section className="paratext-ledger" aria-labelledby="ledger-title">
          <header className="paratext-ledger-header"><h2 id="ledger-title">Margins</h2></header>
          <div className="paratext-ledger-scroll">
            {ledger.length === 0 ? <p className="paratext-empty">No annotations, excerpts, or notes yet.</p> : ledger.map(group => (
              <section className="paratext-ledger-group" key={group.month} aria-label={group.month}>
                <div className="paratext-month"><span>{group.month}</span><i /></div>
                <div className="paratext-entries">
                  {group.entries.map(entry => (
                    <article
                      className={`paratext-entry paratext-entry-${entry.kind}`}
                      key={entry.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openEntryModal(entry)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          openEntryModal(entry)
                        }
                      }}
                    >
                      <div className="paratext-entry-main">
                        <p>{entry.quote}</p>
                        <div className="paratext-entry-meta">
                          <time>{formatDate(entry.date)}</time>
                          <button
                            type="button"
                            className="paratext-entry-menu-trigger"
                            aria-label="Item actions"
                            aria-expanded={openMenuId === entry.id}
                            onClick={event => {
                              event.stopPropagation()
                              setOpenMenuId(current => current === entry.id ? null : entry.id)
                            }}
                          >
                            <span aria-hidden="true">…</span>
                          </button>
                          {openMenuId === entry.id && (
                            <div className="paratext-entry-menu" role="menu" onClick={event => event.stopPropagation()}>
                              {entry.kind !== 'excerpt' && (
                                <button type="button" role="menuitem" onClick={() => openEntryModal(entry, 'edit')}>编辑</button>
                              )}
                              <button type="button" role="menuitem" onClick={() => requestEntryDelete(entry)}>删除</button>
                            </div>
                          )}
                        </div>
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

      {noteComposerOpen && (
        <div className="paratext-note-modal-backdrop">
          <div className="paratext-note-modal" role="dialog" aria-modal="true" aria-label="New note">
            <div className="paratext-note-title">New note</div>
            <input
              value={newNoteTitle}
              onChange={event => setNewNoteTitle(event.target.value)}
              placeholder="Title (optional)"
              autoFocus
            />
            <textarea
              value={newNoteContent}
              onChange={event => setNewNoteContent(event.target.value)}
              placeholder="Write your thoughts…"
              rows={7}
            />
            {noteError && <p className="paratext-note-error">{noteError}</p>}
            <div className="paratext-note-actions">
              <button type="button" onClick={() => setNoteComposerOpen(false)}>Cancel</button>
              <button type="button" disabled={!newNoteContent.trim() || noteSaving} onClick={() => void handleCreateNote()}>
                {noteSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedEntry && (
        <EntryDetailModal
          entry={{
            kind: selectedEntry.kind,
            title: selectedEntry.title,
            quote: selectedEntry.sourceText,
            content: selectedEntry.kind === 'note' ? selectedEntry.quote : selectedEntry.note,
            date: selectedEntry.date,
            messages: entryMessages,
          }}
          mode={entryModalMode}
          editTitle={entryEditTitle}
          editContent={entryEditContent}
          loadingMessages={entryMessagesLoading}
          error={entryActionError}
          saving={entrySaving}
          onClose={closeEntryModal}
          onOpenSource={selectedEntry.kind !== 'note' && selectedEntry.chapterId ? () => openReading(selectedEntry.chapterId, selectedEntry.sourceId) : undefined}
          onEdit={selectedEntry.kind !== 'excerpt' ? () => openEntryModal(selectedEntry, 'edit') : undefined}
          onEditTitleChange={setEntryEditTitle}
          onEditContentChange={setEntryEditContent}
          onSave={() => void handleEntrySave()}
        />
      )}

      {pendingDeleteEntry && (
        <ConfirmDialog
          title="删除条目？"
          message={`“${pendingDeleteEntry.kind === 'note' ? pendingDeleteEntry.title || '阅读笔记' : pendingDeleteEntry.quote.replace(/^“|”$/g, '')}”将被永久删除。`}
          confirmLabel="删除"
          cancelLabel="取消"
          isBusy={entryDeleting}
          error={entryActionError}
          onCancel={() => { if (!entryDeleting) setPendingDeleteEntry(null) }}
          onConfirm={() => { void handleEntryDelete() }}
        />
      )}
    </main>
  )
}
