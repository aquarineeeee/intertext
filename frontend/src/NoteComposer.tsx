import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import './NoteComposer.css'

type NoteBook = { id: string | number; title: string }

type NoteComposerProps = {
  books: NoteBook[]
  onClose: () => void
  onSave: (title: string, content: string, bookId?: string) => void
  saving?: boolean
  error?: string | null
  initialTitle?: string
  initialContent?: string
}

export default function NoteComposer({ books, onClose, onSave, saving = false, error, initialTitle = '', initialContent = '' }: NoteComposerProps) {
  const [title, setTitle] = useState(initialTitle)
  const [content, setContent] = useState(initialContent)
  const [selectedBook, setSelectedBook] = useState<NoteBook | null>(null)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const mention = useMemo(() => {
    const caret = textareaRef.current?.selectionStart ?? content.length
    const prefix = content.slice(0, caret)
    const at = prefix.lastIndexOf('@')
    if (at < 0 || (at > 0 && !/\s/.test(prefix[at - 1]))) return null
    const query = prefix.slice(at + 1)
    if (/\s/.test(query)) return null
    return { at, caret, query }
  }, [content])

  const suggestions = useMemo(() => {
    if (!suggestionsOpen || !mention) return []
    const query = mention.query.trim().toLowerCase()
    return books.filter(book => book.title.toLowerCase().includes(query)).slice(0, 6)
  }, [books, mention, suggestionsOpen])

  useEffect(() => {
    if (suggestions.length === 0) setActiveIndex(0)
    else setActiveIndex(index => Math.min(index, suggestions.length - 1))
  }, [suggestions.length])

  const handleContentChange = (value: string) => {
    setContent(value)
    const caret = textareaRef.current?.selectionStart ?? value.length
    const prefix = value.slice(0, caret)
    const at = prefix.lastIndexOf('@')
    const valid = at >= 0 && (at === 0 || /\s/.test(prefix[at - 1])) && !/\s/.test(prefix.slice(at + 1))
    setSuggestionsOpen(valid)
    if (selectedBook && !value.includes(`@${selectedBook.title}`)) setSelectedBook(null)
  }

  const chooseBook = (book: NoteBook) => {
    if (!mention) return
    const replacement = `@${book.title} `
    const nextContent = content.slice(0, mention.at) + replacement + content.slice(mention.caret)
    setContent(nextContent)
    setSelectedBook(book)
    setSuggestionsOpen(false)
    window.setTimeout(() => {
      const textarea = textareaRef.current
      if (!textarea) return
      const nextCaret = mention.at + replacement.length
      textarea.focus()
      textarea.setSelectionRange(nextCaret, nextCaret)
    }, 0)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestionsOpen && suggestions.length > 0 && (event.key === 'Tab' || event.key === 'Enter')) {
      event.preventDefault()
      chooseBook(suggestions[activeIndex])
      return
    }
    if (suggestionsOpen && event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex(index => (index + 1) % suggestions.length)
    } else if (suggestionsOpen && event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex(index => (index - 1 + suggestions.length) % suggestions.length)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  return (
    <div className="note-composer-backdrop" onClick={onClose}>
      <section className="note-composer" role="dialog" aria-modal="true" aria-label="新建笔记" onClick={event => event.stopPropagation()}>
        <header className="note-composer-header">
          <span>New note</span>
          <button type="button" onClick={onClose} disabled={saving} aria-label="关闭">×</button>
        </header>
        <input value={title} onChange={event => setTitle(event.target.value)} placeholder="标题（可选）" autoFocus />
        <div className="note-composer-editor-wrap">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={event => handleContentChange(event.target.value)}
            onKeyDown={handleKeyDown}
            onClick={() => setSuggestionsOpen(Boolean(mention))}
            placeholder={'输入@ 关联书籍，按Tab自动补全'}
            rows={8}
          />
          {suggestionsOpen && suggestions.length > 0 && (
            <div className="note-composer-suggestions" role="listbox" aria-label="关联书籍">
              {suggestions.map((book, index) => (
                <button
                  key={book.id}
                  type="button"
                  className={index === activeIndex ? 'is-active' : ''}
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => chooseBook(book)}
                >
                  <span>@</span>{book.title}
                  {index === activeIndex && <small>Tab</small>}
                </button>
              ))}
            </div>
          )}
        </div>
        {selectedBook && <div className="note-composer-linked">已关联：{selectedBook.title}</div>}
        {error && <p className="note-composer-error">{error}</p>}
        <footer className="note-composer-actions">
          <button type="button" onClick={onClose} disabled={saving}>取消</button>
          <button type="button" onClick={() => onSave(title.trim() || '阅读笔记', content.trim(), selectedBook ? String(selectedBook.id) : undefined)} disabled={!content.trim() || saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </footer>
      </section>
    </div>
  )
}
