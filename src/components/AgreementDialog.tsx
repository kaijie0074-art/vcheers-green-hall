import { useState } from 'react'
import { privacyNotice, spaceRules, type AgreementKind } from '../content/agreements'
import { Dialog } from './Dialog'

export function AgreementDialog({ kind, onClose }: { kind: AgreementKind | null; onClose: () => void }) {
  const content = kind === 'rules' ? spaceRules : privacyNotice
  return (
    <Dialog open={kind !== null} onClose={onClose} title={content.title} wide>
      <article className="agreement-content">
        <p className="agreement-version">版本 {content.version}</p>
        {kind === 'rules' ? <>
          <h3>{spaceRules.documentTitle}</h3>
          <p className="agreement-subtitle">{spaceRules.subtitle}</p>
          {spaceRules.introduction.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          <ol>{spaceRules.rules.map((rule) => <li key={rule}>{rule}</li>)}</ol>
          <div className="agreement-ending">{spaceRules.conclusion.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
          <footer>{spaceRules.contact.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</footer>
        </> : <>
          <p>{privacyNotice.introduction}</p>
          {privacyNotice.sections.map((section) => <section key={section.title}>
            <h3>{section.title}</h3>
            {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </section>)}
        </>}
      </article>
    </Dialog>
  )
}

// The text is also readable before the demo login or member binding.
export function AgreementLinks() {
  const [kind, setKind] = useState<AgreementKind | null>(null)
  return <>
    <nav className="agreement-access" aria-label="预约前阅读">
      <button type="button" className="agreement-link" onClick={() => setKind('privacy')} aria-haspopup="dialog">预约信息使用说明</button>
      <button type="button" className="agreement-link" onClick={() => setKind('rules')} aria-haspopup="dialog">空间使用守则</button>
    </nav>
    <AgreementDialog kind={kind} onClose={() => setKind(null)} />
  </>
}
