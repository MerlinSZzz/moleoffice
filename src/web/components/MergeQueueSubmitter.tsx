// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13u, the merge queue.
/**
 * WHO SUBMITTED A MERGE ENTRY, ON THE ENTRY'S OWN RECORD PAGE (wave 13u round 97). The queue page's row says who sent
 * each entry, and the entry's own page did not: `submittedBy` holds an object, and the record page's body leaves objects
 * out. The page names the submitter the way it names every other writer of a record, with `writerNamed`: a person or an
 * agent by the name the registries give, a part of the office as that part, and anybody else as unregistered. The
 * stored id is developer mode's, in the stored fields the body draws there.
 *
 * AN ENTRY THE OFFICE SUBMITTED IS SAID IN THE QUEUE PAGE'S WORDS (wave 13u round 98). The office submits a sealed round
 * as its own writer, and the queue page's row says it sent it for a sealed round. This page says the same, from the same
 * answer to whether the office submitted it, so one entry is not worded two ways. The office's writer keeps its own
 * word everywhere else.
 */
import { t } from '@shared/i18n.ts'
import { submittedByTheOffice } from '@shared/merge-queue-page.ts'
import type { PanelRecord } from '@shared/types.ts'
import { writerNamed, type ParticipantsNamed } from '../lib/participant-lookup.ts'
import type { Declares } from './declares.ts'
import { Panel } from './ui.tsx'

/**
 * The stored submitter as the writer `writerNamed` names. The queue's submit door always writes one, but a record may be
 * filed without a field it requires, and the page then says that nobody recorded it, beside the incomplete list that
 * names the field. A stored value that is not a `{kind, id}` is said to be unreadable rather than guessed at.
 */
function theSubmitterOf(record: PanelRecord): { actorType: string; actorId: string } | 'the-office' | 'none' | 'unread' {
  const who = record.data['submittedBy'] as { kind?: unknown; id?: unknown } | null | undefined
  if (who === undefined || who === null) return 'none'
  if (typeof who.kind !== 'string' || typeof who.id !== 'string') return 'unread'
  if (submittedByTheOffice(who)) return 'the-office'
  return { actorType: who.kind === 'person' ? 'human' : who.kind, actorId: who.id }
}

/** ON A MERGE ENTRY'S OWN RECORD PAGE: who submitted it, in the entry's `submittedBy` section. */
export function TheSubmitterOnItsPage({ record, participants, sections }: { record: PanelRecord; participants: ParticipantsNamed | undefined; sections: (key: string) => Declares }) {
  const who = theSubmitterOf(record)
  return (
    <Panel declares={sections('submittedBy')} title={t('record.section.submittedBy')}>
      <p className="rd-prose prose wrap-anywhere" data-entry-submitter={typeof who === 'string' ? who : who.actorType}>
        {who === 'the-office'
          ? t('mergeQueuePage.submitterTheOffice')
          : who === 'none'
            ? t('entrySubmitter.none')
            : who === 'unread'
              ? t('entrySubmitter.unread')
              : writerNamed(who, participants)}
      </p>
    </Panel>
  )
}
