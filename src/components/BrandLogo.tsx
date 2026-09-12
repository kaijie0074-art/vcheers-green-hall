import wordmark from '../assets/vcheers-logo.svg'
import mark from '../assets/vcheers-mark.svg'

export function BrandLogo({ symbol = false }: { symbol?: boolean }) {
  return <img className={`brand-logo${symbol ? ' brand-logo-symbol' : ''}`} src={symbol ? mark : wordmark} alt="V cheers" />
}
