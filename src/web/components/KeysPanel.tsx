// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `Keys and runtimes` — THE OFFICE'S OWN KEYS, AND THE SANDBOXES' LOGINS. Criterion U2.
 *
 * ---------------------------------------------------------------------------------------
 * ONE QUESTION, TWO MECHANISMS, AND THE PANEL SHOWS THE DIFFERENCE
 * ---------------------------------------------------------------------------------------
 *
 * A reader arrives with one question: which keys does this office have? The answer has two halves
 * and they work in different ways, so the panel draws them apart, each under its own heading.
 *
 *   THE OFFICE'S OWN. Two keys, OpenRouter and Moonshot, both written from this page into one file
 *   beside the database. Each has a box to set it and a press to test it. The office answers only
 *   whether one is set: no reply and no row here ever carries a value.
 *
 *   THE SANDBOXES' LOGINS, in a file of their own (src/web/components/SandboxLoginsHalf.tsx).
 *
 *   EACH CODING TOOL'S OWN KEY WAS A THIRD HALF HERE, read-only rows that said set, not set or nobody
 *   has looked. Since wave 13u round 242 each tool has one line, with its Set up press, in a panel of
 *   its own that is not developer-only (src/web/components/settings/CodingToolsPanel.tsx).
 *
 *   THE SUMMONS MAIL'S THREE SETTINGS WERE HERE until the mail left the office for the mail tool, by
 *   two decisions of theirs. The tool is
 *   installed from its own panel, The summons mail, and its addresses are set on its own page. The
 *   entries they wrote stay in the file, read by nothing.
 *
 * ---------------------------------------------------------------------------------------
 * NO VALUE IS EVER DRAWN BACK
 * ---------------------------------------------------------------------------------------
 *
 * The box a person types into is a password field, and after a write it is cleared. The server never
 * returns the value, so there is nothing here to draw even by mistake.
 *
 * ---------------------------------------------------------------------------------------
 * THE PROTECTION IS SAID IN THE OPERATING SYSTEM'S OWN TERMS
 * ---------------------------------------------------------------------------------------
 *
 * The sentence comes from the server. It names mode 600 on Linux and Mac, and on Windows an access
 * list with one entry, this user's, with the words "unverified on Windows". The panel claims nothing
 * more than the operating system gives, and shows the sentence only in Developer mode, as decided.
 */

import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useState } from 'react'

import { content, t, type WordKey } from '@shared/i18n.ts'
// THE SANDBOXES' LOGINS: a half of this section, in a file of its own.
import { SandboxLoginsHalf } from './SandboxLoginsHalf.tsx'
import { SETTINGS_NARROW } from './SettingsFolds.tsx'
import {
  type KeyTestOutcome,
  type KeyTestResult,
  type OfficeKeyOnScreen,
  type OfficeKeyProvider,
  type TheKeys,
} from '@shared/office-keys.ts'
import { Absence, ErrorNote, Loading, Panel, ServerNote, useAsync } from './ui.tsx'
import { api, errorMessage } from '../api.ts'
import { useLanguage } from '../lib/language.ts'

/** A test press's outcome as a short word. The server's own sentence is shown only in Developer mode. */
const TESTED_WORDS: Record<KeyTestOutcome, WordKey> = {
  answered: 'settingsPanel.keys.tested.answered',
  refused: 'settingsPanel.keys.tested.refused',
  unreachable: 'settingsPanel.keys.tested.unreachable',
  'cannot-be-tested-without-spending': 'settingsPanel.keys.notTestable',
}

export function KeysPanel() {
  useLanguage()
  const [state, readAgain] = useAsync(() => api.theKeys(), [])
  if (state.status === 'loading') return <Loading what={t('settingsPanel.keys.loading')} />
  if (state.status === 'error') return <ErrorNote message={state.message} fault={state.fault} />
  return (
    <Panel titleIs="label" declares={{ surface: 'settings.keys' }} title={t('settingsPanel.title.keys')}>
      <style href="mole-office-keys" precedence="default">
        {KEYS_CSS}
      </style>
      <Keys said={state.value} onChanged={readAgain} />
    </Panel>
  )
}

/** The whole section: the office's own keys, and the sandboxes' logins. */
function Keys({ said, onChanged }: { said: TheKeys; onChanged: () => void }) {
  useLanguage()
  return (
    <div className="keys">
      <ServerNote text={said.protection} />
      <div className="keys-half">
        <h3 className="keys-heading">{t('settingsPanel.keys.officeHeading')}</h3>
        <div className="keys-rows">
          {said.office.map((one) => (
            <OfficeKeyRow
              key={`${one.provider}:${String(one.set)}`}
              one={one}
              onChanged={onChanged}
            />
          ))}
        </div>
      </div>
      <SandboxLoginsHalf />
    </div>
  )
}

/** One of the office's own keys: what it is, whether it is set, a box, and a press to test it. */
function OfficeKeyRow({ one, onChanged }: { one: OfficeKeyOnScreen; onChanged: () => void }) {
  useLanguage()
  const [text, setText] = useState('')
  const [fault, setFault] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [test, setTest] = useState<KeyTestResult | null>(null)

  const set = (): void => {
    if (text.trim() === '') {
      setFault(t('settingsPanel.keys.typeFirst'))
      return
    }
    setBusy(true)
    setFault(null)
    setTest(null)
    api
      .setAKey(one.provider, text)
      .then(() => {
        // THE BOX IS CLEARED because the value is written and is never read back.
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

  const pressTest = (): void => {
    setTesting(true)
    setTest(null)
    api
      .testAKey(one.provider)
      .then((result) => {
        setTest(result)
      })
      .catch((err: unknown) => {
        setFault(errorMessage(err))
      })
      .finally(() => {
        setTesting(false)
      })
  }

  return (
    <div className="keys-row" data-key={one.provider}>
      <div className="keys-words">
        <p className="keys-label">{content(one.label)}</p>
        <p className="keys-setting">
          {/* One word with the setting's name inside it, so another language may put the two in its own order. */}
          {t('settingsPanel.keys.fallback', { setting: content(one.setting) })}
        </p>
      </div>
      <div className="keys-control">
        <label className="keys-box" htmlFor={`keys-${one.provider}`}>
          <span className="keys-box-name">{t(settingsControlWord('settings.keys', 'settingsPanel.keys.key'))}</span>
          <input
            id={`keys-${one.provider}`}
            className="keys-input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={text}
            disabled={busy}
            aria-label={t(settingsControlWord('settings.keys', 'settingsPanel.keys.keyLabel'), { label: one.label })}
            onChange={(event) => {
              setText(event.target.value)
            }}
          />
        </label>
        <button type="button" className="keys-press keys-set" onClick={set} disabled={busy}>
          {t(settingsControlWord('settings.keys', 'settingsPanel.keys.set'))}
        </button>
        {one.testable ? (
          <button type="button" className="keys-press keys-test" onClick={pressTest} disabled={testing}>
            {t(settingsControlWord('settings.keys', 'settingsPanel.keys.test'))}
          </button>
        ) : (
          <span className="keys-untestable">{t('settingsPanel.keys.notTestable')}</span>
        )}
      </div>
      <p className={one.set ? 'keys-state' : 'keys-missing'}>
        {one.set ? t(settingsControlWord('settings.keys', 'settingsPanel.keys.set')) : <Absence word={t('settingsPanel.keys.notSet')} />}
      </p>
      {fault === null ? null : <p className="keys-refuse">{fault}</p>}
      {test === null ? null : (
        <>
          <p className={test.outcome === 'answered' ? 'keys-state' : 'keys-refuse'}>{t(TESTED_WORDS[test.outcome])}</p>
          <ServerNote text={test.says} />
        </>
      )}
    </div>
  )
}

/** The section's own rules. Every value is a token, so a preset swap re-skins it with everything else. The OpenCode Go slots, drawn after it, wear them too. */
export const KEYS_CSS = `
.keys { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }
.keys-half { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; padding-top: var(--gut); border-top: var(--border-w) solid var(--border); }
.keys-heading { margin: 0; font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); color: var(--text); }
.keys-rows { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.keys-row {
  display: flex; flex-wrap: wrap; align-items: flex-start; gap: 4px var(--gut);
  padding: var(--pad); min-width: 0;
  border: var(--border-w) solid var(--border); border-radius: var(--radius-sm);
  background: var(--panel);
}
.keys-words { flex: 1 1 22rem; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.keys-label { margin: 0; font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); color: var(--text); }
.keys-setting { margin: 0; max-width: var(--measure-in-box); font: var(--fs-1)/var(--lh-tight) var(--font-ui); color: var(--text-3); }
.keys-setting code { font-family: var(--font-mono, monospace); }
/* THE CONTROL AND ITS BOX MAY BE NARROWER THAN THEY WANT: in a narrow card the box shrinks to the row, and the
   presses go onto the next line inside it rather than past the card's edge. The box's name keeps its own width and
   the input takes what is left, so a Chinese name is not broken between its characters. */
.keys-control { flex: 0 1 auto; min-width: 0; max-width: 100%; display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad); }
.keys-box { display: flex; align-items: center; gap: var(--pad); min-width: 0; max-width: 100%; }
.keys-box-name { flex: none; font-size: var(--fs-2); color: var(--text-2); }
.keys-input {
  width: 14rem; min-width: 0; max-width: 100%; min-height: 30px; padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
  background: var(--panel); color: var(--text); font: var(--fs-1)/var(--lh-tight) var(--font-ui);
}
.keys-input:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.keys-press {
  min-height: 30px; padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
  background: var(--panel); color: var(--text); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui);
  cursor: pointer;
}
.keys-press:hover:not(:disabled) { background: var(--hover); }
.keys-press:disabled { color: var(--text-3); cursor: default; }
.keys-untestable { max-width: 20rem; font: var(--fs-2)/var(--lh-tight) var(--font-ui); color: var(--text-3); }
.keys-stack { flex-direction: column; align-items: stretch; }
.keys-stack .keys-box { justify-content: space-between; }
.keys-stack .keys-box-name { min-width: 7rem; }
.keys-presses { display: flex; gap: var(--pad); }
.keys-state { flex: 1 1 100%; margin: 0; max-width: var(--measure-in-box); font: var(--fs-1)/var(--lh-tight) var(--font-ui); color: var(--text-2); }
.keys-missing { flex: 1 1 100%; margin: 0; max-width: var(--measure-in-box); font: var(--fs-1)/var(--lh-tight) var(--font-ui); color: var(--text-3); }
.keys-count { flex: 1 1 100%; margin: 0; max-width: var(--measure-in-box); font: var(--fs-2)/var(--lh-tight) var(--font-ui); color: var(--text-3); }
.keys-refuse {
  flex: 1 1 100%; margin: 0; max-width: 40ch; padding: 2px var(--pad);
  color: var(--st-failed); background: var(--st-failed-bg);
  border-left: var(--rail) solid var(--st-failed-line); border-radius: var(--radius-sm);
  font: var(--fs-1)/var(--lh-tight) var(--font-ui);
}
${SETTINGS_NARROW} {
  .keys-words { flex: 1 1 100%; }
  .keys-control { flex: 1 1 100%; }
  .keys-box { flex: 1 1 100%; }
  .keys-input { flex: 1 1 auto; width: auto; }
}
`

// The provider type is re-exported for a caller that names one, so the union lives in one place.
export type { OfficeKeyProvider }
