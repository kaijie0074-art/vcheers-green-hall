import { RotateCcw } from 'lucide-react'
import { useStore } from '../domain/store'

const entries = [
  { path: '/member', label: '用户预约' },
  { path: '/admin', label: '管理端' },
]

export function PrototypeBar({ currentPath }: { currentPath: string }) {
  const { resetDemo } = useStore()
  const baseUrl = import.meta.env.BASE_URL
  return (
    <div className="prototype-bar">
      <div className="prototype-inner">
        <div className="prototype-note">
          <span className="prototype-dot" />
          本地交互原型 · 数据仅在当前标签页保存 · 请勿录入真实信息
        </div>
        <nav aria-label="角色视图">
          {entries.map((entry) => (
            <a
              key={entry.path}
              className={currentPath === entry.path ? 'active' : ''}
              href={baseUrl === '/' ? entry.path : `${baseUrl}?view=${entry.path.slice(1)}`}
            >
              {entry.label}
            </a>
          ))}
        </nav>
        <button type="button" className="reset-button" onClick={resetDemo}>
          <RotateCcw size={16} /> 重置数据
        </button>
      </div>
    </div>
  )
}
