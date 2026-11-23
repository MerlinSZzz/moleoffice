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
 *
 * A LOGIN THAT IS SET HAS A TEST PRESS. It sends the login to its provider once, and the row draws one line of what the
 * answer was read as: the outcome, "credit not checked" when the answer said nothing about credit, the balance when the
 * provider showed one, and when it was read. Setting or clearing the login takes the line away, because it was about
 * the value that was sent.
 */

import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useState } from 'react'
import { AddSandboxLogin } from './AddSandboxLogin.tsx'

import { content, t } from '@shared/i18n.ts'
import type { SandboxLoginOnScreen, SandboxLoginTested, SandboxLogins } from '@shared/sandbox-logins.ts'
import { Absence, ErrorNote, Loading, ServerNote, WordsAroundAStamp, drawnDayWithTime, useAsync } from './ui.tsx'
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
      {/* NO WORDS ABOUT IT, ON PURPOSE: the heading, each row's name and who reads it say what this is. The
          reading's own sentence, with the file's name, is shown only in Developer mode, as decided. */}
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
      <p className="keys-count">{t('settingsPanel.logins.countSet', { set: said.names.filter((one) => one.set).length, total: said.names.length })}</p>
      <ServerNote text={said.says} />
    </>
  )
}

/** One login: its name, who reads it, whether it is set, a box, a press to set it or clear it, and one to test it. */
function LoginRow({ one, writable, onChanged }: { one: SandboxLoginOnScreen; writable: boolean; onChanged: () => void }) {
  useLanguage()
  const [text, setText] = useState('')
  const [fault, setFault] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [tested, setTested] = useState<SandboxLoginTested | null>(null)

  const act = (press: () => Promise<unknown>): void => {
    setBusy(true)
    setFault(null)
    press()
      .then(() => {
        // THE BOX IS CLEARED because the login is written and is never read back. The test line goes too: it was
        // about the value that was sent.
        setText('')
        setTested(null)
        onChanged()
      })
      .catch((err: unknown) => {
        setFault(errorMessage(err))
      })
      .finally(() => {
        setBusy(false)
      })
  }

  const pressTest = (): void => {
    setTesting(true)
    setFault(null)
    setTested(null)
    api
      .testASandboxLogin(one.name)
      .then((result) => {
        setTested(result)
      })
      .catch((err: unknown) => {
        setFault(errorMessage(err))
      })
      .finally(() => {
        setTesting(false)
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
              <Absence word={t('settingsPanel.logins.nothing')} />
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
            disabled={busy || testing || !writable}
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
          disabled={busy || testing || !writable || text.trim() === ''}
        >
          {t(settingsControlWord('settings.keys', 'settingsPanel.logins.set'))}
        </button>
        <button
          type="button"
          className="keys-press keys-clear"
          onClick={() => act(() => api.clearASandboxLogin(one.name))}
          disabled={busy || testing || !writable || !one.set}
        >
          {t(settingsControlWord('settings.keys', 'settingsPanel.logins.clear'))}
        </button>
        {one.set ? (
          <button type="button" className="keys-press keys-test" onClick={pressTest} disabled={busy || testing}>
            {t(settingsControlWord('settings.keys', 'settingsPanel.logins.test'))}
          </button>
        ) : null}
      </div>
      <p className={one.set ? 'keys-state' : 'keys-missing'}>{one.set ? t(settingsControlWord('settings.keys', 'settingsPanel.logins.set')) : <Absence word={t('settingsPanel.logins.notSet')} />}</p>
      {fault === null ? null : <p className="keys-refuse">{fault}</p>}
      {tested === null ? null : <TestedLine tested={tested} />}
    </div>
  )
}

/** The weight each outcome is drawn with: a working login as a state, one that cannot be used now as a refusal. */
const TESTED_CLASS: Record<SandboxLoginTested['outcome'], string> = {
  works: 'keys-state',
  refused: 'keys-refuse',
  limit: 'keys-refuse',
  'no-clear-answer': 'keys-missing',
  'no-test-known': 'keys-missing',
}

/** The outcome as a short word. A limit says when it resets only when the provider said; a status is shown as a status. */
function theOutcomeWord(tested: SandboxLoginTested): string {
  switch (tested.outcome) {
    case 'works':
      return t('settingsPanel.logins.tested.works')
    case 'refused':
      return t('settingsPanel.logins.tested.refused')
    case 'limit':
      return tested.resetsAt === null
        ? t('settingsPanel.logins.tested.limit')
        : t('settingsPanel.logins.tested.limitResets', { at: drawnDayWithTime(tested.resetsAt) })
    case 'no-clear-answer':
      return tested.status === null
        ? t('settingsPanel.logins.tested.noAnswer')
        : t('settingsPanel.logins.tested.noClearAnswer', { status: tested.status })
    case 'no-test-known':
      return t('settingsPanel.logins.tested.noTestKnown')
  }
}

/** One test's line: the outcome, then what else the answer showed, then when it was read. */
function TestedLine({ tested }: { tested: SandboxLoginTested }) {
  useLanguage()
  return (
    <p className={`sandbox-login-tested ${TESTED_CLASS[tested.outcome]}`}>
      <span>{theOutcomeWord(tested)}</span>
      {tested.creditChecked === false ? <span>{t('settingsPanel.logins.creditNotChecked')}</span> : null}
      {tested.balances.map((one) => (
        <span key={`${one.currency}:${one.total}`}>
          {t('settingsPanel.logins.balance', { balance: content(`${one.total} ${one.currency}`) })}
        </span>
      ))}
      {tested.readAt === null ? null : (
        <span>
          <WordsAroundAStamp
            words={(when) => t(tested.fromAnEarlierPress ? 'settingsPanel.logins.readEarlier' : 'settingsPanel.logins.readAt', { when })}
            at={tested.readAt}
          />
        </span>
      )}
    </p>
  )
}

/** The rows are the keys section's own; this adds only the name-and-value list and the test line. Every value is a token. */
const LOGINS_CSS = `
.sandbox-login-facts {
  display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 2px var(--pad); margin: 0;
  font: var(--fs-1)/var(--lh-tight) var(--font-ui);
}
.sandbox-login-facts dt { color: var(--text-3); }
.sandbox-login-facts dd { margin: 0; min-width: 0; color: var(--text-2); overflow-wrap: anywhere; }
.sandbox-login-tested { display: flex; flex-wrap: wrap; gap: 2px var(--pad); }
`
