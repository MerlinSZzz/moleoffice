// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SANDBOXES' LOGINS, IN THE KEYS SECTION OF THE SETTINGS PAGE. The model logins the sandboxes are handed are the
 * person's to set here, pasted once, and the office writes them into the sandboxes' secrets
 * file.
 *
 * Each login the sandbox templates declare is one row: its name, the programs that read it, whether it is set, a box,
 * and a press to set it or clear it. No value is ever drawn back: the server never returns one, and the box is cleared
 * after a write, as a key's is. It is drawn inside the keys section and wears its rows, because it is the same kind of
 * thing: a login, set or not set.
 */

import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useState } from 'react'
import { AddSandboxLogin } from './AddSandboxLogin.tsx'

import { content, t } from '@shared/i18n.ts'
import type { SandboxLoginOnScreen, SandboxLogins } from '@shared/sandbox-logins.ts'
import { Absence, ErrorNote, Loading, useAsync } from './ui.tsx'
import { api, errorMessage } from '../api.ts'
import { useLanguage } from '../lib/language.ts'

export function SandboxLoginsHalf() {
  useLanguage()
  const [state, readAgain] = useAsync(() => api.sandboxLogins(), [])
  return (
    <div className="keys-half">
      <style href="mole-office-sandbox-logins" precedence="default">
        {LOGINS_CSS}
      </style>
      {/* NO WORDS ABOUT IT, ON PURPOSE: the heading, each row's name and who reads it say what this is, and the
          file's name and its protection are on the reading's own sentence below (docs/UX-CONTRACT.md 8.10). */}
      <h3 className="keys-heading">{t('settingsPanel.logins.heading')}</h3>
      <AddSandboxLogin />
      {state.status === 'loading' ? (
        <Loading what={t('settingsPanel.logins.loading')} />
      ) : state.status === 'error' ? (
        <ErrorNote message={state.message} fault={state.fault} />
      ) : (
        <Logins said={state.value} onChanged={readAgain} />
      )}
    </div>
  )
}

function Logins({ said, onChanged }: { said: SandboxLogins; onChanged: () => void }) {
  return (
    <>
      {said.unsafe === null ? null : <p className="keys-refuse">{said.unsafe}</p>}
      <div className="keys-rows">
        {said.names.map((one) => (
          <LoginRow key={`${one.name}:${String(one.set)}`} one={one} writable={said.file !== null} onChanged={onChanged} />
        ))}
      </div>
      <p className="keys-says" lang="en">{said.says}</p>
    </>
  )
}

/** One login: its name, who reads it, whether it is set, a box, and a press to set it or clear it. */
function LoginRow({ one, writable, onChanged }: { one: SandboxLoginOnScreen; writable: boolean; onChanged: () => void }) {
  useLanguage()
  const [text, setText] = useState('')
  const [fault, setFault] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const act = (press: () => Promise<unknown>): void => {
    setBusy(true)
    setFault(null)
    press()
      .then(() => {
        // THE BOX IS CLEARED because the login is written and is never read back.
        setText('')
        onChanged()
      })
      .catch((err: unknown) => {
        setFault(errorMessage(err))
      })
      .finally(() => {
        setBusy(false)
      })
  }

  const id = `sandbox-login-${one.name}`
  return (
    <div className="keys-row" data-login={one.name}>
      <div className="keys-words">
        <p className="keys-label">
          <code>{content(one.name)}</code>
        </p>
        <dl className="sandbox-login-facts">
          <dt>{t('settingsPanel.logins.readBy')}</dt>
          <dd>
            {one.readBy.length === 0 ? (
              <Absence word={t('settingsPanel.logins.nothing')} title={t('settingsPanel.logins.nothingTitle')} />
            ) : (
              content(one.readBy.join(', '))
            )}
          </dd>
        </dl>
      </div>
      <div className="keys-control">
        <label className="keys-box" htmlFor={id}>
          <span className="keys-box-name">{t(settingsControlWord('settings.keys', 'settingsPanel.logins.login'))}</span>
          <input
            id={id}
            className="keys-input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={text}
            disabled={busy || !writable}
            aria-label={t(settingsControlWord('settings.keys', 'settingsPanel.logins.loginLabel'), { name: one.name })}
            onChange={(event) => {
              setText(event.target.value)
            }}
          />
        </label>
        <button
          type="button"
          className="keys-press keys-set"
          onClick={() => act(() => api.setASandboxLogin(one.name, text))}
          disabled={busy || !writable || text.trim() === ''}
        >
          {t(settingsControlWord('settings.keys', 'settingsPanel.logins.set'))}
        </button>
        <button
          type="button"
          className="keys-press keys-clear"
          onClick={() => act(() => api.clearASandboxLogin(one.name))}
          disabled={busy || !writable || !one.set}
        >
          {t(settingsControlWord('settings.keys', 'settingsPanel.logins.clear'))}
        </button>
      </div>
      <p className={one.set ? 'keys-state' : 'keys-missing'}>{one.set ? t(settingsControlWord('settings.keys', 'settingsPanel.logins.set')) : <Absence word={t('settingsPanel.logins.notSet')} title={t('settingsPanel.logins.notSetTitle', { name: one.name })} />}</p>
      {fault === null ? null : <p className="keys-refuse">{fault}</p>}
    </div>
  )
}

/** The rows are the keys section's own; this adds only the name-and-value list. Every value is a token. */
const LOGINS_CSS = `
.sandbox-login-facts {
  display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 2px var(--pad); margin: 0;
  font: var(--fs-1)/var(--lh-tight) var(--font-ui);
}
.sandbox-login-facts dt { color: var(--text-3); }
.sandbox-login-facts dd { margin: 0; min-width: 0; color: var(--text-2); overflow-wrap: anywhere; }
`
