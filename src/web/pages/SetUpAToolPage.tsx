// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE AGENT TOOL'S KEY PAGE, #/set-up/<tool>/<way>. Wave 13u, round 242.
 *
 * The person asked that setting up a tool take only his ask, then typing and confirming. A secretary leads him here with
 * a page lead for exactly one tool and way (src/shared/setting-up-a-tool.ts), and the page is his: every door it asks
 * is the person's alone, so a secretary's grant presses neither its Confirm nor its Sign in.
 *
 * WHAT IS ON IT. The tool's name and the way, and then one of these:
 *   a key        one hidden input that takes a paste, and Confirm. One line says the key goes to the tool's own login
 *                and the office keeps no copy.
 *   an account   one Sign in press. The sign-in's address opens (lib/setting-up-a-tool.ts), its device code is shown as
 *                text with a Copy press, and the signed-in door is read until the tool answers or the sign-in stops.
 *                Claude Code's sign-in also takes the code its sign-in page shows, in one input with Confirm.
 * A tool that is not installed gets one line and no input. After Confirm there is one line saying it is checking, and
 * then the tool's answer, or one failure line in the page's language.
 *
 * THE KEY IS NEVER KEPT. The input is not tied to React's state: the press reads it once into the request's body and
 * empties it before the request goes out. It is in no address, and nothing here writes it down. The sign-in's code is
 * handled the same way.
 */

import { useEffect, useRef, useState } from 'react'
import { t, type WordKey } from '@shared/i18n.ts'
import type { NoSignInAddressCode, SignedIn, SignInStarted } from '@shared/harnesses.ts'
import { theSetUpWay, type SetUpWay } from '@shared/setting-up-a-tool.ts'
import { Btn, ErrorNote, Loading, theRefusalInWords, useAsync } from '../components/ui.tsx'
import { errorMessage, faultOf } from '../api.ts'
import { useCopy } from '../lib/copy.ts'
import { theHarnessList } from '../lib/harnesses.ts'
import { useLanguage } from '../lib/language.ts'
import { giveTheKey, giveTheSignInItsCode, openTheSignInAddress, startTheSignIn, theSignedInReading } from '../lib/setting-up-a-tool.ts'

/** How often the page reads the signed-in door while a sign-in it started is running. Each read runs the tool's status command. */
const THE_READ_EVERY_MS = 3000

/**
 * A way's address, "<tool>/<way>", built one way at a time, so it holds only the pairs the list holds. A template over
 * SetUpWay['tool'] and SetUpWay['way'] would join every tool with every way.
 */
type AWaysAddress<One extends SetUpWay = SetUpWay> = One extends SetUpWay ? `${One['tool']}/${One['way']}` : never

/** One way's address. TypeScript reads a way's tool and its way apart, so it is told here that they are one way's. */
function theWaysAddress(one: SetUpWay): AWaysAddress {
  return `${one.tool}/${one.way}` as AWaysAddress
}

/** The words that name each way, by its address. A way added to the list with no words here fails the type check. */
const THE_WAYS_WORDS = {
  'codex/api-key': 'setUpATool.way.codexApiKey',
  'codex/chatgpt': 'setUpATool.way.codexChatGpt',
  'opencode/opencode': 'setUpATool.way.openCodeZen',
  'opencode/opencode-go': 'setUpATool.way.openCodeGo',
  'claude-code/claude': 'setUpATool.way.claudeAccount',
} as const satisfies Record<AWaysAddress, WordKey>

/** Why no sign-in address was opened, by the server's code. */
const NO_ADDRESS_WORDS = {
  printedNone: 'setUpATool.noAddress.printedNone',
  notAnAddress: 'setUpATool.noAddress.notAnAddress',
  notHttps: 'setUpATool.noAddress.notHttps',
  hasAUser: 'setUpATool.noAddress.hasAUser',
  hasAPort: 'setUpATool.noAddress.hasAPort',
  anotherHost: 'setUpATool.noAddress.anotherHost',
} as const satisfies Record<NoSignInAddressCode, WordKey>

/**
 * The tool's "not signed in" line, by what the way takes. Each line says what to do next, and that is true only of the
 * page it is drawn on: under a key it is to check the key and press Confirm again, after a sign-in to press Sign in again.
 */
const NOT_SIGNED_IN_WORDS = {
  'a key': 'setUpATool.notSignedIn',
  'an account': 'setUpATool.notSignedInAfterSignIn',
} as const satisfies Record<SetUpWay['takes'], WordKey>

/** The one line under a press. */
type Said =
  | { kind: 'nothing' }
  | { kind: 'empty'; word: WordKey }
  | { kind: 'waiting' }
  | { kind: 'checking' }
  | { kind: 'answer'; signedIn: SignedIn }
  | { kind: 'stopped' }
  | { kind: 'failed'; line: string }

export function SetUpAToolPage({ tool, way }: { tool: string; way: string }) {
  useLanguage()
  const one = theSetUpWay(tool, way)
  // THE ADDRESS PARSER LETS ONLY THE LISTED WAYS THROUGH (src/shared/addresses.ts), so a way it did not find here is a
  // broken assumption, and it is thrown rather than drawn as a page with nothing to press.
  if (one === null) throw new Error(`The key page was opened for "${tool}/${way}", which is not one of the ways in src/shared/setting-up-a-tool.ts.`)
  const [list, readTheListAgain] = useAsync(() => theHarnessList(), [])
  const [reading, readAgain] = useAsync(() => theSignedInReading(one.tool), [one.tool])
  const name = list.status === 'ready' ? (list.value.harnesses.find((each) => each.id === one.tool)?.name ?? null) : null
  return (
    <main className="page sut-page" id="main" tabIndex={-1}>
      <style href="mole-office-set-up-a-tool" precedence="default">
        {SET_UP_A_TOOL_CSS}
      </style>
      {list.status === 'loading' ? <Loading what={t('setUpATool.title')} /> : null}
      {list.status === 'error' ? <ErrorNote message={list.message} fault={list.fault} retry={readTheListAgain} /> : null}
      {list.status === 'ready' && name === null ? <p className="sut-line">{t('setUpATool.notDeclared', { tool: one.tool })}</p> : null}
      {name !== null ? (
        <>
          <h1 className="sut-title">{name}</h1>
          <p className="sut-way">{t(THE_WAYS_WORDS[theWaysAddress(one)])}</p>
          {reading.status === 'loading' ? <Loading what={name} rows={1} /> : null}
          {reading.status === 'error' ? <ErrorNote message={reading.message} fault={reading.fault} retry={readAgain} /> : null}
          {reading.status === 'ready' && reading.value.signedIn.answer === 'notReadable' && reading.value.signedIn.why === 'notInstalled' ? (
            <p className="sut-line">{t('setUpATool.notInstalled', { tool: name })}</p>
          ) : reading.status === 'ready' ? (
            one.takes === 'a key' ? <TheKey one={one} name={name} /> : <TheSignIn one={one} name={name} />
          ) : null}
        </>
      ) : null}
    </main>
  )
}

/** One hidden input that takes a paste, and Confirm. */
function TheKey({ one, name }: { one: SetUpWay; name: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [said, setSaid] = useState<Said>({ kind: 'nothing' })
  const checking = said.kind === 'checking'
  const confirm = async () => {
    const field = input.current
    if (field === null || checking) return
    // READ ONCE AND EMPTIED AT ONCE, before the request goes out. Spaces at either end are no part of a key.
    const key = field.value.trim()
    field.value = ''
    if (key === '') return setSaid({ kind: 'empty', word: 'setUpATool.noKey' })
    setSaid({ kind: 'checking' })
    try {
      const given = await giveTheKey(one.tool, one.provider, key)
      setSaid({ kind: 'answer', signedIn: given.signedIn })
    } catch (err) {
      setSaid({ kind: 'failed', line: theRefusalInWords(errorMessage(err), faultOf(err)) })
    }
  }
  return (
    <section className="sut-press">
      <p className="sut-line">{t('setUpATool.keyGoesToTheTool', { tool: name })}</p>
      <div className="sut-row">
        <label className="sut-field">
          <span className="sut-label">{t('setUpATool.key')}</span>
          <input
            ref={input}
            className="sut-input"
            type="password"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void confirm()
            }}
          />
        </label>
        <Btn variant="primary" pending={checking} onClick={() => void confirm()}>
          {t('setUpATool.confirm')}
        </Btn>
      </div>
      <TheLine said={said} name={name} takes={one.takes} />
    </section>
  )
}

/** One Sign in press, the sign-in's code to copy, and for Claude Code the code its sign-in page shows. */
function TheSignIn({ one, name }: { one: SetUpWay; name: string }) {
  const codeInput = useRef<HTMLInputElement>(null)
  const [pressing, setPressing] = useState(false)
  const [started, setStarted] = useState<SignInStarted | null>(null)
  /** Whether the address opened, or null when there was none to open. */
  const [opened, setOpened] = useState<boolean | null>(null)
  const [codeGiven, setCodeGiven] = useState(false)
  const [said, setSaid] = useState<Said>({ kind: 'nothing' })
  const { state: copied, copy } = useCopy()
  const watching = started !== null && (said.kind === 'waiting' || said.kind === 'checking')

  // THE SIGNED-IN DOOR IS READ until the tool says it is signed in or the sign-in stops. The server ends a sign-in after
  // ten minutes, so the reading ends then at the latest. Leaving the page stops it.
  useEffect(() => {
    if (!watching) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const readOnce = async () => {
      try {
        const now = await theSignedInReading(one.tool)
        if (stopped) return
        if (now.signedIn.answer === 'yes') return setSaid({ kind: 'answer', signedIn: now.signedIn })
        if (!now.signingIn) return setSaid({ kind: 'stopped' })
      } catch (err) {
        if (!stopped) setSaid({ kind: 'failed', line: theRefusalInWords(errorMessage(err), faultOf(err)) })
        return
      }
      if (!stopped) timer = setTimeout(() => void readOnce(), THE_READ_EVERY_MS)
    }
    timer = setTimeout(() => void readOnce(), THE_READ_EVERY_MS)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [watching, one.tool])

  const signIn = async () => {
    if (pressing) return
    setPressing(true)
    setSaid({ kind: 'nothing' })
    try {
      const answer = await startTheSignIn(one.tool)
      // A SECOND PRESS WHILE THE SIGN-IN RUNS answers the same one, and a code it was given stays given.
      if (!(answer.already && answer.id === started?.id)) setCodeGiven(false)
      setStarted(answer)
      setOpened(answer.address === null ? null : await openTheSignInAddress(answer.address))
      setSaid({ kind: 'waiting' })
    } catch (err) {
      setSaid({ kind: 'failed', line: theRefusalInWords(errorMessage(err), faultOf(err)) })
    } finally {
      setPressing(false)
    }
  }

  const giveTheCode = async () => {
    const field = codeInput.current
    if (field === null || started === null || said.kind === 'checking') return
    // READ ONCE AND EMPTIED AT ONCE, as the key is.
    const code = field.value.trim()
    field.value = ''
    if (code === '') return setSaid({ kind: 'empty', word: 'setUpATool.noSignInCode' })
    setSaid({ kind: 'checking' })
    try {
      await giveTheSignInItsCode(one.tool, started.id, code)
      setCodeGiven(true)
    } catch (err) {
      setSaid({ kind: 'failed', line: theRefusalInWords(errorMessage(err), faultOf(err)) })
    }
  }

  const over = said.kind === 'answer' || said.kind === 'stopped'
  return (
    <section className="sut-press">
      <div className="sut-row">
        <Btn variant="primary" pending={pressing} onClick={() => void signIn()}>
          {t('setUpATool.signIn')}
        </Btn>
      </div>
      {started !== null && !over ? (
        <>
          {started.noAddress !== null ? <p className="sut-line sut-failed">{t(NO_ADDRESS_WORDS[started.noAddress.code], { tool: name })}</p> : null}
          {opened === false ? <p className="sut-line sut-failed">{t('setUpATool.didNotOpen')}</p> : null}
          {started.aSecondTabMayOpen ? <p className="sut-line">{t('setUpATool.aSecondTabMayOpen', { tool: name })}</p> : null}
          {started.code !== null ? (
            <div className="sut-row">
              <span className="sut-label">{t('setUpATool.deviceCode')}</span>
              <code className="sut-code">{started.code}</code>
              <Btn size="sm" variant="ghost" onClick={() => copy(started.code ?? '')}>
                {copied === 'copied' ? t('setUpATool.copied') : t('setUpATool.copy')}
              </Btn>
            </div>
          ) : null}
          {copied === 'failed' ? <p className="sut-line sut-failed">{t('setUpATool.notCopied')}</p> : null}
          {started.takesACode && !codeGiven ? (
            <div className="sut-row">
              <label className="sut-field">
                <span className="sut-label">{t('setUpATool.signInCode')}</span>
                <input
                  ref={codeInput}
                  className="sut-input"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void giveTheCode()
                  }}
                />
              </label>
              <Btn variant="primary" pending={said.kind === 'checking'} onClick={() => void giveTheCode()}>
                {t('setUpATool.confirm')}
              </Btn>
            </div>
          ) : null}
        </>
      ) : null}
      <TheLine said={said} name={name} takes={one.takes} />
    </section>
  )
}

/** The one line under a press: checking, waiting, the tool's answer, or one failure line. */
function TheLine({ said, name, takes }: { said: Said; name: string; takes: SetUpWay['takes'] }) {
  if (said.kind === 'nothing') return null
  if (said.kind === 'failed') return <p className="sut-line sut-failed" role="alert">{said.line}</p>
  if (said.kind === 'empty') return <p className="sut-line sut-failed" role="alert">{t(said.word)}</p>
  const line =
    said.kind === 'waiting' ? t('setUpATool.waiting')
    : said.kind === 'checking' ? t('setUpATool.checking')
    : said.kind === 'stopped' ? t('setUpATool.signInStopped')
    : said.signedIn.answer === 'yes' ? t('setUpATool.signedIn', { tool: name })
    : said.signedIn.answer === 'no' ? t(NOT_SIGNED_IN_WORDS[takes], { tool: name })
    : t('setUpATool.signedInUnread', { tool: name })
  return <p className="sut-line sut-said" role="status">{line}</p>
}

const SET_UP_A_TOOL_CSS = `
.sut-page { max-width: 40rem; }
.sut-title { margin: 0 0 0.25rem 0; }
.sut-way { margin: 0 0 var(--pad) 0; color: var(--text-2); }
.sut-press { display: grid; gap: 0.6rem; }
.sut-row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.5rem; min-width: 0; }
.sut-field { display: grid; gap: 0.25rem; flex: 1 1 14rem; min-width: 0; }
.sut-label { color: var(--text-3); font-size: 0.85em; }
.sut-input { width: 100%; min-width: 0; padding: 0.4rem 0.5rem; border: var(--border-w, 1px) solid var(--border-strong); border-radius: var(--radius-sm); background: var(--panel); }
.sut-code { font-family: var(--font-mono); font-size: 1.15em; overflow-wrap: anywhere; }
.sut-line { margin: 0; color: var(--text-2); overflow-wrap: anywhere; }
.sut-said { color: var(--text); font-weight: 600; }
.sut-failed { color: var(--st-failed); }
`
