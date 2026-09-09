import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { api, isUnauthorized } from './api'
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

function SvgSearch() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx={11} cy={11} r={8} />
      <path d="m21 21-4.35-4.35" />
    </svg>
  )
}

function SvgX() {
  return (
    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}

function SvgTrash() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5M14 11v5" />
    </svg>
  )
}

// ─── Data types ───────────────────────────────────────────────────────────────
type BookStatus = 'reading' | 'read' | 'to-read'

interface Book {
  id: string | number
  title: string
  author: string
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
  bookId: string | number
}

function PanelSearch({ onSearch }: { onSearch: (query: string) => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const [value, setValue] = useState('')
  const [hasSearch, setHasSearch] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const openSearch = () => {
    setIsOpen(true)
    window.setTimeout(() => inputRef.current?.focus(), 0)
  }

  const clearSearch = () => {
    setValue('')
    setHasSearch(false)
    setIsOpen(false)
    onSearch('')
  }

  const submitSearch = () => {
    const query = value.trim()
    setHasSearch(query.length > 0)
    onSearch(query)
  }

  const handleBlur = () => {
    if (value.trim()) {
      submitSearch()
      return
    }
    clearSearch()
  }

  const handleButtonClick = () => {
    if (hasSearch) {
      clearSearch()
    } else if (isOpen) {
      submitSearch()
    } else {
      openSearch()
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', minWidth: 0, width: '100%' }}>
      <input
        ref={inputRef}
        value={value}
        onChange={event => setValue(event.target.value)}
        onBlur={handleBlur}
        onKeyDown={event => {
          if (event.key === 'Enter') submitSearch()
          if (event.key === 'Escape') clearSearch()
        }}
        aria-label="Search"
        style={{
          width: isOpen ? 'min(200px, 60%)' : 0,
          minWidth: 0,
          boxSizing: 'border-box',
          border: 'none',
          borderBottom: isOpen ? `1px solid ${C.borderMid}` : '1px solid transparent',
          outline: 'none',
          background: 'transparent',
          fontFamily: "'Source Sans 3', sans-serif",
          fontSize: 12,
          color: C.fg,
          padding: isOpen ? '1px 2px 3px' : '1px 0 3px',
          overflow: 'hidden',
          transition: 'width 0.22s ease, border-color 0.22s ease, padding 0.22s ease',
        }}
      />
      <button
        type="button"
        onMouseDown={event => event.preventDefault()}
        onClick={handleButtonClick}
        title={hasSearch ? 'Clear search' : 'Search'}
        aria-label={hasSearch ? 'Clear search' : 'Search'}
        style={{
          width: 25,
          height: 25,
          flexShrink: 0,
          border: 'none',
          background: 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: hasSearch ? C.fg : C.muted,
          padding: 3,
          borderRadius: 3,
          transition: 'color 0.15s',
        }}
      >
        {hasSearch ? <SvgX /> : <SvgSearch />}
      </button>
    </div>
  )
}

function DeleteBookDialog({ book, isDeleting, error, onCancel, onConfirm }: { book: Book; isDeleting: boolean; error: string | null; onCancel: () => void; onConfirm: () => void }) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelButtonRef.current?.focus()
  }, [])

  return (
    <div
      role="presentation"
      onMouseDown={event => { if (event.target === event.currentTarget && !isDeleting) onCancel() }}
      style={{
        position: 'fixed',
        zIndex: 20,
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        padding: 20,
        background: 'rgba(47, 42, 39, 0.30)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-book-title"
        style={{
          width: 'min(360px, 100%)',
          padding: 20,
          border: `1px solid ${C.borderMid}`,
          borderRadius: 4,
          background: C.card,
          boxShadow: '0 16px 45px rgba(47,42,39,0.18)',
        }}
      >
        <h2 id="delete-book-title" style={{ margin: 0, color: C.fg, fontFamily: "'Lora', serif", fontSize: 18, fontWeight: 500 }}>
          Delete book?
        </h2>
        <p style={{ margin: '8px 0 0', color: C.muted, fontFamily: "'Source Sans 3', sans-serif", fontSize: 13, lineHeight: 1.5 }}>
          “{book.title}” and its reading data will be permanently removed.
        </p>
        {error && <p role="alert" style={{ margin: '10px 0 0', color: C.danger, fontFamily: "'Source Sans 3', sans-serif", fontSize: 12 }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button
            ref={cancelButtonRef}
            type="button"
            disabled={isDeleting}
            onClick={onCancel}
            style={{ padding: '6px 10px', border: `1px solid ${C.borderMid}`, borderRadius: 3, background: 'transparent', color: C.fg, fontFamily: "'Source Sans 3', sans-serif", fontSize: 12, cursor: isDeleting ? 'wait' : 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={onConfirm}
            style={{ padding: '6px 10px', border: 'none', borderRadius: 3, background: C.danger, color: C.white, fontFamily: "'Source Sans 3', sans-serif", fontSize: 12, cursor: isDeleting ? 'wait' : 'pointer', opacity: isDeleting ? 0.7 : 1 }}
          >
            {isDeleting ? 'Deleting' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}



// ─── Books Panel ──────────────────────────────────────────────────────────────
function BookCard({ book, onOpen, onDelete }: { book: Book; onOpen: (bookId: string | number) => void; onDelete: (bookId: string | number) => void }) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      style={{ position: 'relative', borderRadius: 3 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        aria-label={`Open ${book.title}`}
        onClick={() => onOpen(book.id)}
        style={{
          display: 'block', width: '100%',
          background: C.card,
          padding: 0, border: 0, borderRadius: 3,
          overflow: 'hidden',
          cursor: 'pointer',
          transform: hovered ? 'translateY(-2px)' : 'none',
          boxShadow: hovered ? '0 6px 20px rgba(81,74,69,0.13)' : 'none',
          transition: 'transform 0.18s ease, box-shadow 0.18s ease',
        }}
      >
        <div style={{ background: book.color, aspectRatio: '2 / 3', position: 'relative' }}>
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
            <div style={{ fontFamily: "'Lora', serif", fontSize: 15, fontWeight: 500, lineHeight: 1.35, color: C.fg }}>
              {book.title}
            </div>
            <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: 11, lineHeight: 1.35, color: C.muted, marginTop: 6 }}>
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

      <button
        type="button"
        aria-label={`Delete ${book.title}`}
        onClick={e => { e.stopPropagation(); onDelete(book.id) }}
        style={{
          position: 'absolute', top: 6, right: 6,
          width: 22, height: 22, borderRadius: '50%',
          border: 'none',
          background: 'rgba(246,243,239,0.82)',
          backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', zIndex: 3,
          color: C.danger,
          opacity: hovered ? 1 : 0,
          pointerEvents: hovered ? 'auto' : 'none',
          transition: 'opacity 0.15s',
        }}
      >
        <SvgTrash />
      </button>
    </div>
  )
}

function BookListRow({ book, onOpen, onDelete }: { book: Book; onOpen: (bookId: string | number) => void; onDelete: (bookId: string | number) => void }) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 12px', minHeight: 74,
        background: hovered ? 'rgba(81,74,69,0.03)' : 'transparent',
        borderBottom: `1px solid ${C.border}`,
        transition: 'background 0.1s',
        position: 'relative',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        aria-label={`Open ${book.title}`}
        onClick={() => onOpen(book.id)}
        style={{
          display: 'flex', flex: 1, alignItems: 'center', gap: 12, minWidth: 0,
          border: 0, background: 'transparent', textAlign: 'left', font: 'inherit',
          cursor: 'pointer', padding: 0,
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

      <button
        type="button"
        aria-label={`Delete ${book.title}`}
        onClick={() => onDelete(book.id)}
        style={{
          flexShrink: 0, width: 26, height: 26, borderRadius: '50%',
          border: 'none', background: 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: C.danger,
          opacity: hovered ? 1 : 0,
          pointerEvents: hovered ? 'auto' : 'none',
          transition: 'opacity 0.15s',
        }}
      >
        <SvgTrash />
      </button>
    </div>
  )
}

function BooksPanel({ books, loading, onBookImported, onOpenBook, onDeleteBook }: { books: Book[]; loading: boolean; onBookImported: (file: File) => Promise<void>; onOpenBook: (bookId: string | number) => void; onDeleteBook: (bookId: string | number) => Promise<void> }) {
  const [view, setView] = useState<'shelf' | 'list'>('shelf')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [bookPendingDelete, setBookPendingDelete] = useState<Book | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
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

  const requestDelete = (bookId: string | number) => {
    const book = books.find(item => item.id === bookId)
    if (!book) return
    setDeleteError(null)
    setBookPendingDelete(book)
  }

  const confirmDelete = async () => {
    if (!bookPendingDelete) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await onDeleteBook(bookPendingDelete.id)
      setBookPendingDelete(null)
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Unable to delete this book.')
    } finally {
      setDeleting(false)
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
           gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 198px))',
           gap: 14,
           alignContent: 'start',
           justifyContent: 'start',
         }}>
           {books.map(book => (
             <BookCard key={book.id} book={book} onOpen={onOpenBook} onDelete={requestDelete} />
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
             <BookListRow key={book.id} book={book} onOpen={onOpenBook} onDelete={requestDelete} />
           ))}
         </div>
       )}
      {bookPendingDelete && (
        <DeleteBookDialog
          book={bookPendingDelete}
          isDeleting={deleting}
          error={deleteError}
          onCancel={() => { if (!deleting) setBookPendingDelete(null) }}
          onConfirm={() => { void confirmDelete() }}
        />
      )}
    </div>
  )
}

// ─── Annotations / Excerpts Panel ─────────────────────────────────────────────
function AnnotationsPanel({ entries }: { entries: Entry[] }) {
  const [tab, setTab] = useState<'annotation' | 'excerpt'>('annotation')
  const [bookFilter, setBookFilter] = useState<string | number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const booksForTab = useMemo(() => {
    const seen = new Set<string | number>()
    return entries
      .filter(e => e.type === tab)
      .filter(e => !seen.has(e.bookId) && seen.add(e.bookId))
      .map(e => ({ id: e.bookId, title: e.bookTitle }))
  }, [tab])

  const filtered = entries.filter(
    e => e.type === tab &&
    (bookFilter === null || e.bookId === bookFilter) &&
    (searchQuery === '' || e.text.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  const truncate = (s: string, n: number) => s.length > n ? s.slice(0, n) + '…' : s

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', minHeight: 0,
      background: C.annotationsBg,
    }}>
      <div style={{ padding: '16px 20px 11px', flexShrink: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'max-content minmax(0, 1fr)', alignItems: 'center', columnGap: 12 }}>
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

          <PanelSearch onSearch={setSearchQuery} />
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
  const [searchQuery, setSearchQuery] = useState('')

  const filtered = notes.filter(
    n => searchQuery === '' || n.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, background: C.notesBg }}>
      <div style={{
        padding: '14px 20px 12px',
        display: 'grid', gridTemplateColumns: 'max-content minmax(0, 1fr)', alignItems: 'center', columnGap: 12,
        flexShrink: 0,
      }}>
        <h2 style={{ fontFamily: "'Lora', serif", fontSize: 16, fontWeight: 500, color: C.fg, margin: 0 }}>
          Notes
        </h2>

        <PanelSearch onSearch={setSearchQuery} />
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '18px 20px', color: C.muted, fontFamily: "'Source Sans 3', sans-serif", fontSize: 12 }}>
            {searchQuery ? 'No notes match your search.' : 'No notes yet.'}
          </div>
        ) : filtered.map(n => (
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
      <section className="cover-page" aria-label="Library introduction">
        <div className="cover-topline">VOLUME I: THE DIALOGUE</div>

        <div className="cover-center">
          <h1 className="cover-title cover-animate cover-animate-title">Library</h1>
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

        <div className="cover-year">LIBRARY / 2026</div>
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
  const [books, setBooks] = useState<Book[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const handleDeleteBook = async (bookId: string | number) => {
    await api.deleteBook(bookId)
    setBooks(current => current.filter(b => b.id !== bookId))
    setEntries(current => current.filter(e => e.bookId !== bookId))
    setNotes(current => current.filter(n => n.bookId !== bookId))
  }

  const handleBookImported = async (file: File) => {
    const imported = await api.importBook(file)
    const format = imported.import_file.file_format.toUpperCase()
    setBooks(current => [{
      id: imported.id,
      title: imported.title,
      author: format,
      color: C.bookCovers[current.length % C.bookCovers.length],
      status: 'to-read',
      progress: 0,
    }, ...current.filter(book => book.id !== imported.id)])
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        await api.me()
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
        setBooks(apiBooks.map((book, index) => {
          const total = chapterCounts.get(book.id) || 0
          const current = progress[index]?.furthest_read_chapter_id ? (chapterIndexes.get(progress[index]!.furthest_read_chapter_id!) ?? 0) + 1 : 0
          return {
            id: book.id,
            title: book.title,
            author: book.author || book.import_file.file_format.toUpperCase(),
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
          bookId: apiBooks[bookIndex].id,
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
        <BooksPanel books={books} loading={loading} onBookImported={handleBookImported} onOpenBook={bookId => onNavigate(`/paratext?bookId=${encodeURIComponent(String(bookId))}`)} onDeleteBook={handleDeleteBook} />
      </div>

      {/* Right: Annotations (top) + Notes (bottom) */}
      <div style={{ display: 'grid', gridTemplateRows: '6fr 4fr', rowGap: 12, padding: '12px 12px 12px 0', overflow: 'hidden' }}>
        <AnnotationsPanel entries={entries} />
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
