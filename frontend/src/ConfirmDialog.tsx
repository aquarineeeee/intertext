import { useEffect, useRef } from 'react'
import './ConfirmDialog.css'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  isBusy?: boolean
  error?: string | null
  onCancel: () => void
  onConfirm: () => void
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  isBusy = false,
  error = null,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelButtonRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isBusy) onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isBusy, onCancel])

  return (
    <div
      className="confirm-dialog-backdrop"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !isBusy) onCancel()
      }}
    >
      <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-message">
        <h2 id="confirm-dialog-title">{title}</h2>
        <p id="confirm-dialog-message">{message}</p>
        {error && <p className="confirm-dialog-error" role="alert">{error}</p>}
        <div className="confirm-dialog-actions">
          <button ref={cancelButtonRef} type="button" disabled={isBusy} onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className="is-danger" disabled={isBusy} onClick={onConfirm}>
            {isBusy ? '处理中…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
