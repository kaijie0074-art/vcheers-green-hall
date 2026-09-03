import { ErrorToast } from './components/ErrorToast'
import { PrototypeBar } from './components/PrototypeBar'
import { AdminApp } from './pages/AdminApp'
import { MemberApp } from './pages/MemberApp'

export default function App() {
  const requestedView = new URLSearchParams(window.location.search).get('view')
  const requestedPath = window.location.pathname
  const path = requestedView === 'admin' || requestedPath.endsWith('/admin') ? '/admin' : '/member'

  if (import.meta.env.BASE_URL === '/' && requestedPath !== path) {
    window.history.replaceState(null, '', path)
  }

  return (
    <>
      <PrototypeBar currentPath={path} />
      {path === '/admin' ? <AdminApp /> : <MemberApp />}
      <ErrorToast />
    </>
  )
}
