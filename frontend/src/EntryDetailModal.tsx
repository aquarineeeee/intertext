import { useEffect } from 'react'
import { X } from 'lucide-react'
import type { ApiMessage } from './api'
import LinkedBook from './LinkedBook'
import './EntryDetailModal.css'

export type EntryDetailKind = 'annotation' | 'excerpt' | 'note'

export type EntryDetailData = {
  kind: EntryDetailKind
  title?: string
  quote?: string
  content?: string
  date: string
  bookTitle?: string | null
  messages?: ApiMessage[]
}

type EntryDetailModalProps = {
  entry: EntryDetailData
  mode?: 'view' | 'edit'
  editTitle?: string
  editContent?: string
  loadingMessages?: boolean
  error?: string | null
  saving?: boolean
  onClose: () => void
  onOpenSource?: () => void
  onEdit?: () => void
  onEditTitleChange?: (value: string) => void
  onEditContentChange?: (value: string) => void
  onSave?: () => void
  onRemoveBook?: () => void
  removingBook?: boolean
  followup?: string
  submittingFollowup?: boolean
  onFollowupChange?: (value: string) => void
  onFollowupSubmit?: () => void
}

const labels: Record<EntryDetailKind, string> = {
  annotation: '批注详情',
  excerpt: '摘录详情',
  note: '阅读笔记',
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

export default function EntryDetailModal({
  entry,
  mode = 'view',
  editTitle = '',
  editContent = '',
  loadingMessages = false,
  error,
  saving = false,
  onClose,
  onOpenSource,
  onEdit,
  onEditTitleChange,
  onEditContentChange,
  onSave,
  onRemoveBook,
  removingBook = false,
  followup = '',
  submittingFollowup = false,
  onFollowupChange,
  onFollowupSubmit,
}: EntryDetailModalProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, saving])

  const hasConversation = loadingMessages || Boolean(entry.messages?.length)
  const canFollowup = Boolean(followup.trim()) && !submittingFollowup
  const canSave = entry.kind !== 'note' || Boolean(editContent.trim())

  return (
    <div className="entry-detail-backdrop" onClick={onClose}>
      <section className="entry-detail-modal" role="dialog" aria-modal="true" aria-label={labels[entry.kind]} onClick={event => event.stopPropagation()}>
        <header className="entry-detail-header">
          <span>{mode === 'edit' ? '编辑条目' : labels[entry.kind]}</span>
          <button type="button" className="entry-detail-close" aria-label="关闭" title="关闭" onClick={onClose} disabled={saving}>
            <X size={16} strokeWidth={1.7} />
          </button>
        </header>

        {mode === 'edit' && entry.kind === 'note' ? (
          <input
            className="entry-detail-input"
            value={editTitle}
            onChange={event => onEditTitleChange?.(event.target.value)}
            placeholder="标题"
            autoFocus
          />
        ) : entry.title ? (
          <h2 className="entry-detail-title">{entry.title}</h2>
        ) : null}

        {entry.kind === 'note' && entry.bookTitle && (
          <LinkedBook title={entry.bookTitle} onRemove={onRemoveBook} removing={removingBook} />
        )}

        {entry.quote && (onOpenSource ? (
          <button type="button" className="entry-detail-quote entry-detail-quote-link" onClick={onOpenSource} title="在正文中查看">
            {entry.quote}
          </button>
        ) : (
          <blockquote className="entry-detail-quote">{entry.quote}</blockquote>
        ))}

        {mode === 'edit' && entry.kind !== 'excerpt' ? (
          <textarea
            className="entry-detail-editor"
            value={editContent}
            onChange={event => onEditContentChange?.(event.target.value)}
            rows={8}
            autoFocus={entry.kind === 'annotation'}
          />
        ) : entry.content && !hasConversation ? (
          <div className="entry-detail-content">{entry.content}</div>
        ) : null}

        {mode === 'view' && hasConversation && (
          <div className="entry-detail-conversation" aria-label="与 AI 的完整对话">
            {loadingMessages ? (
              <p className="entry-detail-status">正在加载对话…</p>
            ) : <>
              {entry.messages?.map(message => (
                <article className={`entry-detail-message entry-detail-message-${message.role}`} key={message.id}>
                  <span>{message.role === 'assistant' ? 'AI' : message.role === 'user' ? '你' : '系统'}</span>
                  <p>{message.content}</p>
                </article>
              ))}
              {entry.kind === 'annotation' && entry.messages?.length && (
                <div className="entry-detail-followup">
                  <textarea
                    className="entry-detail-followup-input"
                    value={followup}
                    onChange={event => onFollowupChange?.(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault()
                        if (canFollowup) onFollowupSubmit?.()
                      }
                    }}
                    placeholder="继续追问…"
                    rows={3}
                    disabled={submittingFollowup}
                  />
                  <button type="button" disabled={!canFollowup} onClick={onFollowupSubmit}>
                    {submittingFollowup ? '生成中…' : '追问'}
                  </button>
                </div>
              )}
            </>}
          </div>
        )}

        {mode === 'view' && entry.kind === 'annotation' && !entry.content && !hasConversation && (
          <p className="entry-detail-status">暂无批注内容</p>
        )}

        <time className="entry-detail-date">{formatDate(entry.date)}</time>
        {error && <p className="entry-detail-error">{error}</p>}

        {((onEdit && !hasConversation) || (onSave && mode === 'edit')) && (
          <footer className="entry-detail-actions">
            {mode === 'view' && onEdit && !hasConversation && <button type="button" onClick={onEdit}>编辑</button>}
            {mode === 'edit' && onSave && (
              <button type="button" disabled={saving || !canSave} onClick={onSave}>{saving ? '保存中…' : '保存'}</button>
            )}
          </footer>
        )}
      </section>
    </div>
  )
}
