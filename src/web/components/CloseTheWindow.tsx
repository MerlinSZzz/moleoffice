// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ONE PRESS THAT CLOSES THE KEY WINDOW. Criterion P83, point 6.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * The Settings page draws the list of callers that sent a name and no key, the person's name or an agent's.
 * While the window is open that claim still counts from this computer and from the machines this
 * office trusts, so the list is what they read before they close it. This is the press beside that list, and after the press it
 * is the line that says who closed the window and when.
 *
 * THE PAGE DOES NOT DECIDE WHO IS ASKING. It draws from `mayPress`, which is the same answer the
 * door enforces, rather than working out a second one. The key half of that answer is a fact this
 * browser cannot know — it never sees the key — so the reading carries it. An agent is still refused
 * by the door's own sentence naming who may; the page simply does not offer a press the door would
 * refuse.
 *
 * AND A CALLER THE WINDOW MADE THE PERSON IS NOT DRAWN THE PRESS EITHER. That caller holds no key,
 * so pressing would shut its browser out and a terminal would be the only way back (problem
 * OgdgFc68y3xq). The door refuses it, and the page must not offer a button the door refuses, so the
 * reading carries `mayPress` and the panel draws the sentence where the press would be.
 *
 * AND NOT WHILE A LIVE AGENT HOLDS NO PROVED KEY. As point 3 of a decision says, the door refuses the close until every
 * live agent holds a proved key. The reading carries the door's own sentence
 * (`closeIsRefusedBecause.says`), which names the agents, how many, and the ways out, and the panel draws it where the
 * press would be. The sentence is written once, on the server, by the function the door refuses with, so the page
 * cannot say something the door does not.
 *
 * A CLOSED WINDOW DRAWS NO PRESS. Once it is shut the press is gone and the line names the moment
 * and the one who closed it. A press still offered on a closed window would be a lie about what it
 * could do, so it is not offered.
 *
 * ---------------------------------------------------------------------------------------
 * THE WORDS
 * ---------------------------------------------------------------------------------------
 *
 * `open` is two sentences said before the press: what stops counting once it is closed, the person's name and
 * an agent's alike, and that closing it cannot be undone.
 * `refused` is said instead of the press to a caller that holds no key: three things, one idea per
 * sentence, and the same words the door refuses that caller with. Both are in the word lists under
 * `settingsPanel.window.*`. The closed line is labels and values, not
 * a sentence, so a reader can see the two facts — who and when — without reading prose.
 */

import { settingsControlWord } from '@shared/settings-declaration.ts'
import { content, t } from '@shared/i18n.ts'
import { api } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { TieredPress } from './TieredPress.tsx'
import { ErrorNote, Loading, useAsync } from './ui.tsx'

/** Every word this component draws that is not read off the reply. */
export const CLOSE_THE_WINDOW_WORDS = {
  /** Said before the press, and quoted in its question. */
  get open(): string { return t('settingsPanel.window.open') },
  /**
   * Said instead of the press to a browser that holds no key. Three ideas, and the door says the
   * same three before it refuses: holds no key, would be shut out, pair first.
   */
  get refused(): string { return t('settingsPanel.window.refused') },
  /** The press itself. */
  get press(): string { return t(settingsControlWord('settings.headeronly', 'settingsPanel.window.press')) },
  /** What the press says while it is being sent. */
  get closing(): string { return t('settingsPanel.window.closing') },
  /**
   * THE QUESTION THE PRESS ASKS FIRST. The warning says both paths: the
   * press ends, for good, the acceptance of a name sent with no key; a refusal changes nothing.
   */
  get question(): string { return t('settingsPanel.window.question') },
  get warning(): string { return t('settingsPanel.window.warning') },
  get cancel(): string { return t(settingsControlWord('settings.headeronly', 'settingsPanel.window.cancel')) },
  /** The labels on the closed line. Labels, never sentences. */
  get closedBy(): string { return t('settingsPanel.window.closedBy') },
  get closedAt(): string { return t('settingsPanel.window.closedAt') },
  /** Said where the row records a moment but no name. */
  get nobody(): string { return t('settingsPanel.window.nobody') },
}

/**
 * THE PANEL'S BODY, drawn inside the same `Panel` as the list it sits beside.
 *
 * It fetches its own reading for the reason the list above it does: the Settings page is a page of
 * panels that each know one thing, and a page-level fetch for one panel would make the whole page
 * wait on it.
 */
export function CloseTheWindow() {
  useLanguage()
  const [state, readAgain] = useAsync(() => api.keyWindow(), [])

  if (state.status === 'loading') return <Loading what={t('settingsPanel.window.what')} />
  if (state.status === 'error') return <ErrorNote message={state.message} fault={state.fault} />

  const said = state.value
  if (!said.open) {
    return (
      <>
        <style href="mole-office-close-the-window" precedence="default">
          {CLOSE_THE_WINDOW_CSS}
        </style>
        <p className="ctw-closed">
          <span className="ctw-key">{CLOSE_THE_WINDOW_WORDS.closedBy}</span>
          <span className="ctw-value">
            {said.closedBy === null ? CLOSE_THE_WINDOW_WORDS.nobody : content(said.closedBy.id)}
          </span>
          <span className="ctw-key">{CLOSE_THE_WINDOW_WORDS.closedAt}</span>
          <span className="ctw-value">{content(said.closedAt) ?? CLOSE_THE_WINDOW_WORDS.nobody}</span>
        </p>
      </>
    )
  }

  // A refusal is thrown to the question, which draws the door's own sentence and stays open.
  const close = async (): Promise<void> => {
    await api.closeTheKeyWindow()
    readAgain()
  }

  // A BROWSER THAT HOLDS NO KEY IS NOT DRAWN A PRESS. The door would refuse it, and a button that
  // looks live and fails is the failure this panel exists to avoid. So the sentence stands where the
  // press would, and there is no control here a person can press.
  // AND WHILE A LIVE AGENT HOLDS NO PROVED KEY THERE IS NO PRESS EITHER, for the same reason: the
  // door would refuse it. Both sentences are drawn when both hold, the browser's first, because the
  // door asks about the browser first.
  const notYet = said.closeIsRefusedBecause
  if (!said.mayPress || notYet !== null) {
    return (
      <>
        <style href="mole-office-close-the-window" precedence="default">
          {CLOSE_THE_WINDOW_CSS}
        </style>
        {said.mayPress ? null : <p className="ctw-refused">{CLOSE_THE_WINDOW_WORDS.refused}</p>}
        {notYet === null ? null : <p className="ctw-not-yet" lang="en">{notYet.says}</p>}
      </>
    )
  }

  return (
    <>
      <style href="mole-office-close-the-window" precedence="default">
        {CLOSE_THE_WINDOW_CSS}
      </style>
      <p className="ctw-open">{CLOSE_THE_WINDOW_WORDS.open}</p>
      <TieredPress tier="confirm" press={CLOSE_THE_WINDOW_WORDS.press} pending={CLOSE_THE_WINDOW_WORDS.closing}
        question={CLOSE_THE_WINDOW_WORDS.question} quote={CLOSE_THE_WINDOW_WORDS.open}
        warning={CLOSE_THE_WINDOW_WORDS.warning} cancel={CLOSE_THE_WINDOW_WORDS.cancel} onPress={close} />
    </>
  )
}

/** The component's own rules. Every value is a token, and there is no backtick anywhere in here. */
const CLOSE_THE_WINDOW_CSS = `
.ctw-open { margin: 0 0 var(--pad); max-width: var(--measure-in-box); color: var(--text); font: var(--fs-1)/var(--lh-read) var(--font-ui); }
.ctw-refused { margin: 0; max-width: var(--measure-in-box); color: var(--text); font: var(--fs-1)/var(--lh-read) var(--font-ui); }
.ctw-refused + .ctw-not-yet { margin-top: var(--pad); }
.ctw-not-yet { margin: 0; max-width: var(--measure-in-box); color: var(--text); font: var(--fs-1)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.ctw-closed { margin: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px var(--pad); min-width: 0; }
.ctw-key {
  font-size: var(--fs-1); font-weight: 600; color: var(--text-3);
  letter-spacing: .06em; text-transform: uppercase;
}
.ctw-value { color: var(--text); font-size: var(--fs-1); overflow-wrap: anywhere; }
`
