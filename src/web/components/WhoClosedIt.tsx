// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO CLOSED A PROBLEM, SAID BESIDE ITS STATE.
 *
 * A secretary now closes a fixed problem whose move was the person's, and the person can reopen it. They can
 * only reopen what they can see somebody else closed, so both of a problem's addresses draw this line
 * beside the state chip: `.pp-standing` on `#/problem/<id>` and `.rp-standing` on `#/r/<id>`. One
 * component, for the reason CloseThisProblem.tsx gives: one problem drawn at two addresses must not
 * say two things.
 *
 * WHERE THE ANSWER COMES FROM. The problem's own change log, as the page already reads it with
 * `GET /api/changes?recordId=<id>`, through `theClose` in src/web/lib/whoclosedit.ts. The name is
 * read from the registries with `storedActorName`, the reader of a stored actor id the decisions page
 * uses. Where no row names anybody, the stored id is drawn as it is.
 *
 * WHAT IT SAYS WHEN THE LOG DOES NOT SAY. The log the page reads holds the newest rows only. If no
 * row names the close and the log was cut short, the line says the close is older than what was
 * read. If no row names it and nothing was cut, the line says the log does not say who closed it.
 * Neither names anybody.
 *
 * IT DRAWS NOTHING on a record that is not a problem, on a deleted one, and on one that has not
 * ended.
 */

import { content, t } from '@shared/i18n.ts'
import { progressOf } from '@shared/work.ts'
import type { PanelRecord } from '@shared/types.ts'
import type { ChangesReply, ParticipantsReply } from '../api.ts'
import { theClose } from '../lib/whoclosedit.ts'
import { storedActorName } from './Governance.tsx'
import { WordsAroundAStamp } from './ui.tsx'

export function WhoClosedIt({
  record,
  log,
  participants,
}: {
  record: PanelRecord
  log: ChangesReply
  participants: ParticipantsReply
}) {
  if (record.kind !== 'problem' || record.deletedAt !== null) return null
  if (progressOf(record.data['state']) !== 'finished') return null
  const close = theClose(log.changes)
  const kind = close?.actorType === 'human' ? 'person' : close?.actorType === 'agent' ? 'agent' : undefined
  return (
    <p className="pp-closed-by">
      <style href="mole-office-who-closed-it" precedence="default">
        {WHO_CLOSED_IT_CSS}
      </style>
      {close === null ? (
        log.truncated ? (
          t('problemPage.closedBy.olderThanRead', { n: log.changes.length })
        ) : (
          t('problemPage.closedBy.notRecorded')
        )
      ) : (
        // THE TIME STANDS WHERE THE WORD PUTS {when}: after the name in English, first in Chinese.
        <WordsAroundAStamp
          at={close.at}
          words={(when) => t('problemPage.closedBy', { who: content(storedActorName(close.actorId, participants, kind) ?? close.actorId), when })}
        />
      )}
    </p>
  )
}

const WHO_CLOSED_IT_CSS = `
.pp-closed-by { margin: 0; min-width: 0; color: var(--text-2); font-size: var(--fs-2); overflow-wrap: anywhere; }
`
