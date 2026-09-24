import { BookOpen, X } from 'lucide-react'
import './LinkedBook.css'

export default function LinkedBook({ title, onRemove, removing = false }: { title: string; onRemove?: () => void; removing?: boolean }) {
  return (
    <div className="linked-book" aria-label={`关联书籍：${title}`}>
      <BookOpen size={14} strokeWidth={1.7} aria-hidden="true" />
      <span>{title}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} disabled={removing} title="取消关联书籍" aria-label={`取消关联 ${title}`}>
          <X size={14} strokeWidth={1.8} />
        </button>
      )}
    </div>
  )
}
