// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO HAS CALLED WITH A CLAIM AND NO KEY. Criterion P83, point 6, the list half.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE LIST IS, AND WHO IT IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * For one version a claim with no key still counts from loopback and from the machines on the
 * trusted list, and every such request is folded into `header_only_calls` as one row per caller per
 * day. This list is what the person reads before they close the window: the callers that have not
 * been given a key yet, so the person's own tools, scripts and devices can get one first.
 *
 * IT IS WRITTEN FOR THEM AND NOT FOR AN ENGINEER: the plain word, and no sentence about the list,
 * as decided. It names CALLERS and never a secret: there is no key on this page and nothing here
 * could draw one.
 *
 * ---------------------------------------------------------------------------------------
 * AN EMPTY LIST IS AN ANSWER, NOT A GAP
 * ---------------------------------------------------------------------------------------
 *
 * The fifth invariant: "nothing has called" is a real answer and it is drawn as a word. An empty box
 * would read as "nobody looked", which is the one thing this list cannot say — the office keeps it.
 *
 * ---------------------------------------------------------------------------------------
 * THE PRESS THAT CLOSES THE WINDOW SITS BESIDE THIS LIST
 * ---------------------------------------------------------------------------------------
 *
 * The press has to record who closed the window and when. That fact now lives on the office's one
 * installation row, added by migration 0163, and the press is drawn by `CloseTheWindow`, in the same
 * panel as this list. This component is only the list: it names callers and never a secret, and the
 * press is one component away so the two readings it depends on — the callers and the window's own
 * state — cannot drift.
 */

import type { AHeaderOnlyCaller, WhatTheHeaderOnlyCallersSay } from '@shared/headeronlycalls.ts'
import { content, t } from '@shared/i18n.ts'
import { actorTypeWord } from '@shared/words.ts'
import { useLanguage } from '../lib/language.ts'
import { Absence } from './ui.tsx'

/** Every word this component draws that is not read off the reply. */
export const HEADER_ONLY_WORDS = {
  /** The word drawn where the list is empty. It is an answer and not a gap. */
  get none(): string { return t('settingsPanel.callers.none') },
  /** Short labels on a row. A label, never a sentence. */
  get seen(): string { return t('settingsPanel.callers.seen') },
  get firstSeen(): string { return t('settingsPanel.callers.firstSeen') },
  get lastSeen(): string { return t('settingsPanel.callers.lastSeen') },
  /** Where a call came from, in a reader's words rather than the stored token. */
  get fromThisComputer(): string { return t('settingsPanel.callers.fromThisComputer') },
  get fromAnotherComputer(): string { return t('settingsPanel.callers.fromAnotherComputer') },
  get fromNoWhere(): string { return t('settingsPanel.callers.fromNoWhere') },
  /** A caller that sent a kind of header but named nobody. */
  get noName(): string { return t('settingsPanel.callers.noName') },
}

/**
 * THE PANEL'S BODY. The page wraps it in its own `Panel`, the way `TrustedMachines` is wrapped.
 *
 * WHY THE BODY IS NOT THE PANEL. The surface id is a literal at the place it is drawn, because a
 * scanner reads it out of the source; a name built here would read as a part nothing draws.
 */
export function HeaderOnlyCallers({ said }: { said: WhatTheHeaderOnlyCallersSay }) {
  useLanguage()
  return (
    <>
      <style href="mole-office-header-only-callers" precedence="default">
        {HEADER_ONLY_CSS}
      </style>
      {said.callers.length === 0 ? (
        // AN EMPTY LIST IS AN ANSWER. `Absence` draws one word where the list would be, and "there
        // are none" still reads differently from "nobody looked".
        <p className="hoc-none" data-empty="true">
          <Absence word={HEADER_ONLY_WORDS.none} />
        </p>
      ) : (
        <ul className="hoc-list">
          {said.callers.map((one, at) => (
            <Row key={[one.day, one.actorId, one.clientAddr ?? '', one.clientOrigin ?? '', String(at)].join('|')} caller={one} />
          ))}
        </ul>
      )}
    </>
  )
}

/** One caller, as the row a person reads. */
function Row({ caller }: { caller: AHeaderOnlyCaller }) {
  useLanguage()
  const who = caller.actorId === '' ? HEADER_ONLY_WORDS.noName : content(caller.actorId)
  return (
    <li className="hoc-row">
      <div className="hoc-who">
        <span className="hoc-name">{who}</span>
        <span className="hoc-kind">{actorTypeWord(caller.actorType).text}</span>
      </div>
      <div className="hoc-facts">
        <span className="hoc-from">{whereItCameFrom(caller)}</span>
        <span className="hoc-key">{HEADER_ONLY_WORDS.seen}</span>
        <span className="hoc-value">{content(caller.day)}</span>
        <span className="hoc-key">{HEADER_ONLY_WORDS.firstSeen}</span>
        <span className="hoc-value">{content(caller.firstSeen)}</span>
        <span className="hoc-key">{HEADER_ONLY_WORDS.lastSeen}</span>
        <span className="hoc-value">{content(caller.lastSeen)}</span>
        <span className="hoc-count">{howManyCalls(caller.calls)}</span>
      </div>
    </li>
  )
}

/**
 * WHERE IT CAME FROM, in a reader's words.
 *
 * `local` is this computer and `remote` is another one; null is the honest third answer, because a
 * request that came through no listener cannot be put anywhere. The stored word is never drawn.
 */
function whereItCameFrom(caller: AHeaderOnlyCaller): string {
  if (caller.clientOrigin === 'local') return HEADER_ONLY_WORDS.fromThisComputer
  if (caller.clientOrigin === 'remote') {
    return caller.clientAddr === null
      ? HEADER_ONLY_WORDS.fromAnotherComputer
      : t('settingsPanel.callers.fromAnotherComputerAt', { address: content(caller.clientAddr) })
  }
  return HEADER_ONLY_WORDS.fromNoWhere
}

/** How many calls, with a singular that reads as one. */
function howManyCalls(calls: number): string {
  return t('settingsPanel.callers.calls', { n: calls })
}

/**
 * The panel's own rules. Every value is a token, so a preset swap re-skins it with everything else.
 *
 * NO BACKTICK ANYWHERE IN HERE, comments included: this is a template literal inside a .tsx file.
 */
const HEADER_ONLY_CSS = `
.hoc-none { margin: 0 0 var(--pad); color: var(--text); font: var(--fs-1)/var(--lh-read) var(--font-ui); }
.hoc-list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--pad); }
.hoc-row {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px var(--gut); min-width: 0;
  padding: var(--pad) 0; border-top: 1px solid var(--border);
}
.hoc-who { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px var(--pad); min-width: 0; flex: 1 1 14rem; }
.hoc-name { color: var(--text); font: 600 var(--fs-2)/var(--lh-tight) var(--font-ui); overflow-wrap: anywhere; }
.hoc-kind { color: var(--text-3); font-size: var(--fs-1); }
.hoc-facts { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px var(--pad); min-width: 0; flex: 1 1 18rem; }
.hoc-from { color: var(--text-2); font-size: var(--fs-1); overflow-wrap: anywhere; }
.hoc-key {
  font-size: var(--fs-1); font-weight: 600; color: var(--text-3);
  letter-spacing: .06em; text-transform: uppercase;
}
.hoc-value { color: var(--text-2); font-size: var(--fs-1); overflow-wrap: anywhere; }
.hoc-count { color: var(--text); font-size: var(--fs-1); font-weight: 600; }
`
