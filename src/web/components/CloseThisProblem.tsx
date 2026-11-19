// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERSON'S CLOSE PRESS ON A PROBLEM WHOSE MOVE IS THEIRS, AS ONE COMPONENT FOR BOTH OF A PROBLEM'S
 * ADDRESSES. Problems `QbIyPcjwZpNk` and `KyoZmFiuv9ma`.
 *
 * WHY IT IS A FILE OF ITS OWN. The press was first drawn by src/web/pages/ProblemPage.tsx alone, at
 * `#/problem/<id>`. The owner was then sent a link to a problem whose move was theirs at `#/r/<id>`, the
 * record page, which is the address most links carry, and found no press there (problem
 * `KyoZmFiuv9ma`). ProblemPage.tsx says the two addresses for one problem stay one page in two
 * places, so the record page now draws the same press. It lives here, imported by both pages, so
 * neither page imports the other for it and there is one press and not two copies that can drift.
 *
 * WHERE EACH PAGE PUTS IT. Both pages put it beside the state chip, under the title, in a row that
 * wraps, so it is in view at every width without opening `/edit`: `.pp-standing` on the problem's
 * own page and `.rp-standing` on the record page. The rule below that lets the open form take a
 * whole line assumes that row is a flex row that wraps.
 *
 * THE STYLESHEET IS HERE TOO, drawn only when the press is drawn, so a page that draws the press
 * cannot lose its layout by forgetting a stylesheet. Its class names keep the problem page's
 * prefix, `pp-close`, because tests and pictures already name them.
 */

import { useState } from 'react'
import { MOVE_ACTORS, PROBLEM_STATES } from '@shared/kinds.ts'
import { t, type WordKey } from '@shared/i18n.ts'
import { stateWord } from '@shared/words.ts'
import { progressOf, theWorkHasEnded } from '@shared/work.ts'
import type { PanelRecord } from '@shared/types.ts'
import { errorMessage, getActor } from '../api.ts'
import { useWriteThisRecord } from './AnotherWriter.tsx'
import { Btn, Field, TextArea } from './ui.tsx'

/**
 * THE VALUE OF `whose_move` THAT MEANS THE PERSON'S, typed against the declaration so a rename of
 * the vocabulary in src/shared/kinds.ts is a build failure here, as it is in the server's guard.
 */
const THE_PERSONS_MOVE: (typeof MOVE_ACTORS)[number] = 'person'

/**
 * THE WORDS THAT CLOSE A PROBLEM: every word of the problem's vocabulary that means the problem has
 * ended. Read from `PROBLEM_STATES` through `progressOf`, the same reading the server's guard asks,
 * so a word added to the vocabulary reaches this press without anybody editing it. Today they are
 * fixed, worked around and accepted.
 */
const CLOSING_STATES: readonly string[] = PROBLEM_STATES.filter((word) => progressOf(word) === 'finished')

/** What each closing word means, said beside it. A word with no line here is drawn with none. */
const WHAT_IT_MEANS: Readonly<Record<string, WordKey>> = {
  fixed: 'problemPage.close.means.fixed',
  worked_around: 'problemPage.close.means.worked_around',
  accepted: 'problemPage.close.means.accepted',
}

/**
 * Whether a closing word asks what closed it. `accepted` does not: the problem stays, so nothing
 * made it stop, and `fix` is the field for what makes it stop.
 */
const asksWhatClosedIt = (word: string): boolean => word !== 'accepted'

/**
 * THE PERSON'S PRESS THAT CLOSES A PROBLEM WHOSE MOVE IS THEIRS. Problem `QbIyPcjwZpNk`.
 *
 * WHEN IT IS DRAWN. All four must hold, and otherwise it draws nothing at all:
 *
 *   · the reader is the person. The browser asks `getActor().type === 'human'`, the way this
 *     product's other person-only presses do (the goal's confirm press on the horizons page). The
 *     server holds the rule: `assertMayRemoveAnAsk` in src/server/lib/records.ts refuses an agent
 *     that sets an ending state on a record carrying `whose_move: person`, except a secretary that
 *     closes a problem as fixed or worked around with its fix written. This check only decides
 *     whether the press is on the screen;
 *   · the record is a live problem;
 *   · its `whose_move` is `person`. The problem record asks for the press on exactly these. A problem
 *     whose move is an agent's is that agent's to close, and a close press on every open problem
 *     would invite them to end work an agent is doing. The record page's state control, behind
 *     `/edit`, still closes any problem;
 *   · it has not already ended, by the same reading the server's guard uses.
 *
 * WHAT IT WRITES. The press asks which ending it was. For fixed and worked around it also asks what
 * closed it, which is saved as the problem's `fix`, the field the kind declares for what makes a
 * problem stop. The box starts with the fix already stored, and an empty box leaves that fix as it
 * was, which the box's hint says. The problem kind requires nothing else to close: it has no rule
 * that ties `fix` to `state`. One `PATCH` with a `dataPatch`, the record page's own door.
 *
 * A REFUSAL IS SHOWN AS THE SERVER SAID IT, under the press, and nothing on the page changes.
 */
export function CloseThisProblem({ record, onChanged }: { record: PanelRecord; onChanged: () => void }) {
  const [open, setOpen] = useState(false)

  if (getActor().type !== 'human') return null
  if (record.kind !== 'problem' || record.deletedAt !== null) return null
  if (record.data['whose_move'] !== THE_PERSONS_MOVE) return null
  if (theWorkHasEnded(record.data)) return null

  return (
    <div className="pp-close" data-open={open ? 'yes' : undefined}>
      <style href="mole-office-close-this-problem" precedence="default">
        {CLOSE_CSS}
      </style>
      {open ? null : (
        <Btn variant="primary" onClick={() => setOpen(true)}>
          {t('problemPage.close.press')}
        </Btn>
      )}
      {!open ? null : <TheCloseForm record={record} onChanged={onChanged} done={() => setOpen(false)} />}
    </div>
  )
}

/**
 * THE OPEN FORM, drawn only while it is open, so its write stands on the version the page drew when the person opened
 * it, on the record page and on the problem's own page alike. A change by another writer since is asked about when the
 * person saves, as in the record's edit form (src/web/components/AnotherWriter.tsx).
 */
function TheCloseForm({ record, onChanged, done }: { record: PanelRecord; onChanged: () => void; done: () => void }) {
  const [choice, setChoice] = useState<string | null>(null)
  const storedFix = typeof record.data['fix'] === 'string' ? record.data['fix'] : ''
  const [what, setWhat] = useState(storedFix)
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const write = useWriteThisRecord(record.id, 'opened')

  async function close(): Promise<void> {
    if (choice === null) return
    setBusy(true)
    setRefusal(null)
    const said = what.trim()
    const patch: Record<string, unknown> = { state: choice }
    if (asksWhatClosedIt(choice) && said !== '' && said !== storedFix.trim()) patch['fix'] = said
    try {
      const written = await write({ dataPatch: patch })
      if ('notNow' in written) return
      done()
      onChanged()
    } catch (err) {
      setRefusal(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <fieldset className="pp-close-form">
      <legend>{t('problemPage.close.which')}</legend>
      <div className="pp-close-choices" role="radiogroup" aria-label={t('problemPage.close.which')}>
        {CLOSING_STATES.map((word) => {
          const means = WHAT_IT_MEANS[word]
          return (
            <label key={word} className="pp-close-choice" data-choice={word} data-chosen={choice === word ? 'yes' : undefined}>
              <input
                type="radio"
                name={`mole-office-close-${record.id}`}
                value={word}
                checked={choice === word}
                onChange={() => setChoice(word)}
              />
              <span className="pp-close-word">{stateWord(word, 'normal', record.kind).text}</span>
              {means === undefined ? null : <span className="pp-close-means">{t(means)}</span>}
            </label>
          )
        })}
      </div>
      {choice === null || !asksWhatClosedIt(choice) ? null : (
        <Field label={t('problemPage.close.what')} hint={t('problemPage.close.whatHint')} optional>
          <TextArea value={what} onChange={setWhat} rows={3} />
        </Field>
      )}
      <div className="pp-close-acts">
        <Btn
          variant="primary"
          pending={busy}
          disabled={choice === null}
          reason={t('problemPage.close.chooseFirst')}
          onClick={() => void close()}
        >
          {t('problemPage.close.confirm')}
        </Btn>
        <Btn variant="ghost" onClick={done}>
          {t('problemPage.close.cancel')}
        </Btn>
      </div>
      {refusal === null ? null : <p className="pp-close-refused" role="alert">{refusal}</p>}
    </fieldset>
  )
}

/**
 * THE PRESS'S OWN RULES, moved here from the problem page with the press. Every value is a token and
 * no colour or type size is written out here. The first rule lets the open form take a whole line of
 * the row the page puts the press in.
 */
const CLOSE_CSS = `
.pp-close[data-open="yes"] { flex: 1 1 100%; }
.pp-close { display: flex; flex-direction: column; align-items: flex-start; gap: var(--pad); min-width: 0; }
.pp-close-form { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; max-width: 100%; margin: 0; padding: var(--pad); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); background: var(--panel); }
.pp-close-form > legend { padding: 0 4px; font: 600 var(--fs-2)/var(--lh-tight) var(--font-ui); color: var(--text); }
.pp-close-choices { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.pp-close-choice { display: flex; align-items: baseline; gap: 6px; min-height: var(--row-h); padding: 4px var(--pad); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text); font: var(--fs-2)/var(--lh-tight) var(--font-ui); cursor: pointer; overflow-wrap: anywhere; }
.pp-close-choice input { margin: 0; accent-color: var(--chosen-edge); }
.pp-close-choice[data-chosen="yes"] { background: var(--chosen-bg); color: var(--chosen-ink); border-color: var(--chosen-edge); }
.pp-close-choice:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
.pp-close-word { font-weight: 600; white-space: nowrap; }
.pp-close-means { color: inherit; opacity: .8; }
.pp-close-acts { display: flex; flex-wrap: wrap; gap: var(--pad); }
.pp-close-refused { margin: 0; color: var(--st-failed); font-size: var(--fs-2); overflow-wrap: anywhere; }
@media (max-width: 40rem) {
  .pp-close-choice { min-height: 44px; align-items: center; }
}
`
