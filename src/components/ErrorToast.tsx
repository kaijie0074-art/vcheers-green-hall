import { AlertCircle, X } from 'lucide-react'
import { useStore } from '../domain/store'

export function ErrorToast() {
  const { error, clearError } = useStore()
  if (!error) return null
  return (
    <div className="error-toast" role="alert">
      <AlertCircle size={20} />
      <span>{error}</span>
      <button type="button" aria-label="关闭提示" onClick={clearError}>
        <X size={18} />
      </button>
    </div>
  )
}
