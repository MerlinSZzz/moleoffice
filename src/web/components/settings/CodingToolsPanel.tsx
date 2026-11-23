// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `Coding tools` — ONE LINE FOR EACH CODING TOOL THE OFFICE RUNS, WITH ITS SET UP PRESS. Wave 13u round 242.
 *
 * The person's words: the user says which tool or key; the secretary may check and install; the secretary leads the
 * user to the key page; the user only types the key and confirms. The owner's report is of a user in normal Settings
 * who found no place for a tool's key, so this panel is not behind the developer switch. The office's own keys and the
 * sandboxes' logins stay in the developer-only keys panel (src/web/components/KeysPanel.tsx).
 *
 * Each line shows where the tool's program is on the PATH the office's terminals get, or not installed; whether it is
 * signed in, as its own status command says (yes, no, or not readable and why); and one Set up press. The press asks
 * POST /api/harnesses/:id/set-up, which writes the person's ask to a secretary as his own message, and the line then
 * says which secretary it went to and why, or in one line what failed. The key itself is typed on the tool's own key
 * page, never here.
 */

import { useState } from 'react'
import type { HarnessReading, SignedIn, SignedInUnreadCode, TheSetUpSent, WhyThisSecretary } from '@shared/harnesses.ts'
import { t, type WordKey } from '@shared/i18n.ts'
import { settingsControlWord } from '@shared/settings-declaration.ts'
import { errorMessage, faultOf } from '../../api.ts'
import { setUpTheTool, theHarnesses, theSignInOf } from '../../lib/harnesses.ts'
import { useLanguage } from '../../lib/language.ts'
import { SETTINGS_NARROW } from '../SettingsFolds.tsx'
import { Absence, Btn, ErrorNote, Loading, Panel, theRefusalInWords, useAsync, type AsyncState } from '../ui.tsx'

/** Why a tool's sign-in could not be read, as a short state word. */
const SIGN_IN_UNREAD_WORDS: Record<SignedInUnreadCode, WordKey> = {
  notInstalled: 'settingsPanel.tools.signedIn.notInstalled',
  noStatusCommand: 'settingsPanel.tools.signedIn.noStatusCommand',
  didNotRun: 'settingsPanel.tools.signedIn.didNotRun',
  notUnderstood: 'settingsPanel.tools.signedIn.notUnderstood',
}

/** Which secretary a Set up press went to, and why that one, in one sentence. */
const SENT_WORDS: Record<WhyThisSecretary, WordKey> = {
  holdsTheDuty: 'settingsPanel.tools.sent.holdsTheDuty',
  theOnlySecretary: 'settingsPanel.tools.sent.theOnlySecretary',
  writtenToLast: 'settingsPanel.tools.sent.writtenToLast',
  registeredFirst: 'settingsPanel.tools.sent.registeredFirst',
}

/** The panel: the coding tools the office runs, one line each, read from the agent tools list the Terminals page reads. */
export function CodingToolsPanel() {
  useLanguage()
  const [state] = useAsync(() => theHarnesses(), [])
  return (
    <Panel titleIs="label" declares={{ surface: 'settings.codingtools' }} title={t('settingsPanel.title.codingtools')}>
      <style href="mole-office-coding-tools" precedence="default">
        {CODING_TOOLS_CSS}
      </style>
      {state.status === 'loading' ? (
        <Loading what={t('settingsPanel.tools.reading')} rows={1} />
      ) : state.status === 'error' ? (
        <ErrorNote message={state.message} fault={state.fault} />
      ) : (
        <CodingToolLines harnesses={state.value.harnesses} />
      )}
    </Panel>
  )
}

/** One line for each coding tool on the list, in the list's order. */
export function CodingToolLines({ harnesses }: { harnesses: readonly HarnessReading[] }) {
  return (
    <div className="ct-rows">
      {harnesses.map((one) => (
        <CodingToolLine key={one.id} one={one} />
      ))}
    </div>
  )
}

/** One coding tool's line, with its sign-in read and its Set up press sent from here. */
function CodingToolLine({ one }: { one: HarnessReading }) {
  const { language } = useLanguage()
  const [signIn] = useAsync(() => theSignInOf(one.id), [one.id])
  const [pressing, setPressing] = useState(false)
  const [sent, setSent] = useState<TheSetUpSent | null>(null)
  const [refused, setRefused] = useState<string | null>(null)

  const press = (): void => {
    setPressing(true)
    setSent(null)
    setRefused(null)
    // THE ASK IS WRITTEN IN THE PAGE'S LANGUAGE, and the test language is drawn from the English.
    setUpTheTool(one.id, language === 'xx' ? 'en' : language)
      .then((answer) => {
        setSent(answer)
      })
      .catch((err: unknown) => {
        setRefused(theRefusalInWords(errorMessage(err), faultOf(err)))
      })
      .finally(() => {
        setPressing(false)
      })
  }

  return <TheCodingToolLine one={one} signIn={signIn} pressing={pressing} sent={sent} refused={refused} onSetUp={press} />
}

/**
 * ONE CODING TOOL'S LINE AS DRAWN: where its program is, whether it is signed in, and its Set up press with what the
 * press did. `refused` is the refusal already in words. It reads nothing and sends nothing itself.
 */
export function TheCodingToolLine({
  one,
  signIn,
  pressing,
  sent,
  refused,
  onSetUp,
}: {
  one: HarnessReading
  signIn: AsyncState<{ signedIn: SignedIn }>
  pressing: boolean
  sent: TheSetUpSent | null
  refused: string | null
  onSetUp: () => void
}) {
  return (
    <div className="ct-row" data-tool={one.id}>
      <div className="ct-words">
        <p className="ct-name">{one.name}</p>
        <dl className="ct-facts">
          <dt>{t('settingsPanel.tools.program')}</dt>
          <dd>{one.installed.path === null ? <Absence tier="told-apart" looked word={t('settingsPanel.tools.notInstalled')} /> : <code>{one.installed.path}</code>}</dd>
          <dt>{t('settingsPanel.tools.signedIn')}</dt>
          <dd>
            {signIn.status === 'loading' ? (
              <Absence tier="told-apart" looked={false} word={t('settingsPanel.tools.beingRead')} />
            ) : signIn.status === 'error' ? (
              <Absence tier="told-apart" looked={false} word={t('settingsPanel.tools.notRead')} title={signIn.message} />
            ) : (
              <SignedInWord signedIn={signIn.value.signedIn} />
            )}
          </dd>
        </dl>
      </div>
      <div className="ct-control">
        <Btn onClick={onSetUp} pending={pressing} pendingSucceeded={sent !== null} pendingFailed={refused !== null}>
          {t(settingsControlWord('settings.codingtools', 'settingsPanel.tools.setUp'))}
        </Btn>
      </div>
      {sent === null ? null : (
        <p className="ct-sent" role="status">
          {t(SENT_WORDS[sent.why], { name: sent.secretary.name })}
        </p>
      )}
      {refused === null ? null : (
        <p className="ct-refused" role="alert">
          {t('settingsPanel.tools.notSent', { why: refused })}
        </p>
      )}
    </div>
  )
}

/** Signed in yes, no, or not readable with the short word for why. Not readable is never drawn as yes or no. */
function SignedInWord({ signedIn }: { signedIn: SignedIn }) {
  switch (signedIn.answer) {
    case 'yes': return <>{t('settingsPanel.tools.signedIn.yes')}</>
    case 'no': return <>{t('settingsPanel.tools.signedIn.no')}</>
    case 'notReadable': return <Absence tier="told-apart" looked word={t('settingsPanel.tools.signedIn.notReadable', { why: t(SIGN_IN_UNREAD_WORDS[signedIn.why]) })} />
  }
}

/** The panel's own rules, the keys panel's row drawn again. Every value is a token, so a preset swap re-skins it with everything else. */
const CODING_TOOLS_CSS = `
.ct-rows { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.ct-row {
  display: flex; flex-wrap: wrap; align-items: flex-start; gap: 4px var(--gut);
  padding: var(--pad); min-width: 0;
  border: var(--border-w) solid var(--border); border-radius: var(--radius-sm);
  background: var(--panel);
}
.ct-words { flex: 1 1 22rem; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ct-name { margin: 0; font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); color: var(--text); }
.ct-facts { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px var(--pad); margin: 0; font: var(--fs-1)/var(--lh-tight) var(--font-ui); }
.ct-facts dt { color: var(--text-3); }
.ct-facts dd { margin: 0; min-width: 0; color: var(--text-2); overflow-wrap: anywhere; }
.ct-facts code { font-family: var(--font-mono, monospace); }
.ct-control { flex: 0 1 auto; min-width: 0; max-width: 100%; display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad); }
.ct-sent { flex: 1 1 100%; margin: 0; max-width: var(--measure-in-box); font: var(--fs-1)/var(--lh-tight) var(--font-ui); color: var(--text-2); }
.ct-refused {
  flex: 1 1 100%; margin: 0; max-width: 40ch; padding: 2px var(--pad);
  color: var(--st-failed); background: var(--st-failed-bg);
  border-left: var(--rail) solid var(--st-failed-line); border-radius: var(--radius-sm);
  font: var(--fs-1)/var(--lh-tight) var(--font-ui);
}
${SETTINGS_NARROW} {
  .ct-words { flex: 1 1 100%; }
  .ct-control { flex: 1 1 100%; }
}
`
