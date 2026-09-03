import { useEffect, useState } from 'react'

/**
 * 驱动所有按时间派生的预约状态。每 15 秒刷新，并在用户重新回到页面时立即校时。
 */
export function useCurrentTime() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const refresh = () => setNow(new Date())
    const timer = window.setInterval(refresh, 15_000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  return now
}
