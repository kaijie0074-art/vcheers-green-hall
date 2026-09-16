import { RotateCcw } from 'lucide-react'
import { useStore } from '../domain/store'

export function PrototypeBar({ currentPath }: { currentPath: string }) {
  const { resetDemo } = useStore()
  return (
    <div className="prototype-bar">
      <div className="prototype-inner">
        <div className="prototype-note">
          <span className="prototype-dot" />
          本地交互原型 · 数据仅在当前标签页保存 · 请勿录入真实信息
        </div>
        <span className="prototype-view">{currentPath === '/admin' ? '管理端' : '用户预约'}</span>
        <button type="button" className="reset-button" onClick={resetDemo}>
          <RotateCcw size={16} /> 重置数据
        </button>
      </div>
    </div>
  )
}
