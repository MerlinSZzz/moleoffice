// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { ProjectTag } from './ProjectTag.tsx'
import { Absence } from '../ui.tsx'
import { t, content } from '@shared/i18n.ts'
/**
 * A DECISION A PERSON HAS ALREADY MADE, AS A CARD — the same card on Home and on the decisions page.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A CARD AND NOT A ROW, WHICH IS A MEASUREMENT AND NOT A TASTE
 * ---------------------------------------------------------------------------------------
 *
 * The owner read the old list of settled decisions as more explanation rather than as a list of
 * things: *"a clear visual boundary for each decision"*, and a grid may fit better than a long
 * column. The audit measured why the column failed. Real decision sentences are long, they were set
 * at 14px grey, and there was no enclosure around one and no rule between two — which is exactly
 * what a paragraph of prose looks like. A card with a border is counted before it is read.
 *
 * Three across on a desk, one across on a phone. That is the whole layout, and it is `auto-fit`
 * with a floor rather than a fixed three, so two decisions are two cards and not two thirds of a
 * row.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS ON ONE, AND WHY THE QUESTION LEADS WHEN THERE IS ONE
 * ---------------------------------------------------------------------------------------
 *
 * The question, what was taken, and when. The question leads because that is what a person is
 * looking for when they come back to a decision — "what was this about" — and a decision's title is
 * written by Mole Office from the option taken, so leading with the title would print the answer twice
 * and never say what it answered.
 *
 * MOST DECISIONS IN THIS CORPUS ANSWER NO QUESTION AT ALL. Five of the eight were filed on their
 * own, with no proposal, so there is nothing to lead with but the decision itself. Those cards say
 * so in three words rather than drawing an empty line where a question would be — absence is a real
 * answer and this is where it is told apart from a gap.
 *
 * IT PRESENTS PROPS AND DOES NOTHING ELSE. The window, the cap, the ages and the phrase for what
 * was taken are all worked out in `home/decisions.ts`, shared by both surfaces, so Home and the
 * decisions page cannot say different things about one decision.
 */

// THE ONE FUNCTION IN THE BROWSER THAT NAMES A PROJECT. This card printed the stored id, so a
// decision filed in the catch-all project said "in unassigned" while the switcher beside it said
// "Not in a project". Imported from lib rather than components/projects.tsx because that file
// reaches window while it is still loading, and this component is rendered in plain Node tests.
import { projectName } from '../../lib/projects.ts'
// WHAT A CARD IS, said on the card. See the header of src/shared/targets.ts.
import { targetAttributes } from '@shared/targets.ts'
import type { Decided } from './decisions.ts'

export function DecidedCards({
  rows,
  here,
  onOpen,
}: {
  rows: readonly Decided[]
  /** The project the browser is on, so a card can say when a decision lives somewhere else. */
  here: string
  /** Open one of the two records this decision has. The parent crosses the project boundary. */
  onOpen: (workspaceId: string, recordId: string) => void
}) {
  return (
    <ul className="dq-past-grid">
      {rows.map((one) => (
        <DecidedCard key={one.recordId} one={one} here={here} onOpen={onOpen} />
      ))}
    </ul>
  )
}

function DecidedCard({
  one,
  here,
  onOpen,
}: {
  one: Decided
  here: string
  onOpen: (workspaceId: string, recordId: string) => void
}) {
  const question = one.question === null || one.question.trim() === '' ? null : one.question
  return (
    <li
      className="dq-past-card"
      {...targetAttributes({ kind: 'record', recordId: one.recordId, workspaceId: one.workspaceId })}
    >
      {/* THE QUESTION, OR THE DECISION ITSELF WHEN NOTHING ASKED IT. Two lines at most either way: the card
          is a way back to the record, and the record holds the whole of it. */}
      <button
        type="button"
        className="dq-past-q"
        onClick={() => onOpen(one.workspaceId, one.recordId)}
        title={content(question ?? one.title)}
      >
        {content(question ?? one.title)}
      </button>

      {/* WHAT WAS TAKEN, in the words the decision stores. Never matched back against the fork's
          options — see `whatWasTaken` in Governance.tsx — and never printed twice: when there was
          no question, the line above IS what was taken. */}
      {question === null || one.taken === null ? null : (
        <p className="dq-past-took">
          {one.ownAnswer ? (
            <>
              <span className="dq-past-own">{t('home.noneOfOptions')}</span> {content(one.taken)}
            </>
          ) : (
            content(one.taken)
          )}
        </p>
      )}

      <p className="dq-past-meta">
        <span title={one.ago}>
          <span className="sr-only">{one.ago}</span>
          <span aria-hidden="true">{one.agoShort}</span>
        </span>
        {/* THE QUESTION IS A SECOND RECORD, so reaching it is a second press. It is what "change my
            mind" needs: what was asked, the choices nobody took, and why. */}
        {one.proposalId === null ? (
          <span className="dq-past-alone"><Absence title={t('home.noQuestion')} /></span>
        ) : (
          <button
            type="button"
            className="dq-past-back"
            onClick={() => onOpen(one.workspaceId, one.proposalId ?? one.recordId)}
          >
            {t('home.theQuestion')}
          </button>
        )}
        {/* THE NAME IS QUOTED, and src/web/lib/projects.ts says why: the catch-all project is
            called "Not in a project", so this chip read "in Not in a project". */}
        <span className="dq-where">{one.workspaceTitle === null ? <Absence title={t('decisions.unnamedProject')} /> : <ProjectTag name={projectName(one.workspaceId, one.workspaceTitle)} />}</span>
      </p>
    </li>
  )
}
