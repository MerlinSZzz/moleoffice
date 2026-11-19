// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ROUND THE OFFICE PUTS IN THE MERGE QUEUE AT THE SEAL (wave 13u round 93), as the person reads it.
 *
 * On a run's own page, `TheSealInTheQueue` says what the office did with the run's seal: put it in the queue, found it
 * there already, keeps it waiting for an earlier entry of the same line or for the hold, did not queue it because that
 * entry ended without landing, or was refused. It reads the run's `atTheSeal.queued` and draws nothing when it is absent.
 *
 * Under it, a part of its own says what the office did about the run's next round at the seal (round 94), or at the
 * release (13r round AX), and its heading says which: it asked, and how that ask stands in the run's `nextRound`, or why
 * it asked nothing. It reads `atTheSeal.nextRound` and draws nothing when it is absent. Either part is drawn without the
 * other. Both are parts of one field since round 96, so they are drawn in one panel, which says it is the run's
 * `atTheSeal` section: a region is on one element only.
 *
 * On the merge queue page, `TheQueueIsHeld` says the queue is held, what that stops, and who held it, when and why, as
 * GET /api/merge-queue read them off the settings log. It draws nothing while the queue is not held.
 */
import { AT_THE_SEAL, readQueuedAtTheSeal, thePartAtTheSeal, type QueuedAtTheSeal } from '@shared/merge-queue-at-the-seal.ts'
import type { QueueHeld } from '@shared/merge-queue-page.ts'
import { readNextRoundAtTheSeal } from '@shared/next-round-at-the-seal.ts'
import { NEXT_ROUND, readTheNextRound, type TheNextRound } from '@shared/next-round.ts'
import { content, t } from '@shared/i18n.ts'
import type { PanelRecord } from '@shared/types.ts'
import { readParticipantsOnce } from '../lib/oneread.ts'
import type { Declares } from './declares.ts'
import { storedActorName } from './Governance.tsx'
import { shortTime } from './MergeQueuePush.tsx'
import { recordPath } from './router.tsx'
import { titleHere } from './sections.ts'
import { Panel } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'

/** The note's sentence, with `{entry}` left for the link to the entry. */
function theSentence(note: QueuedAtTheSeal, now: Date): string {
  if (note.outcome === 'queued') return t('atTheSeal.queued', { at: shortTime(note.at, now), entry: '{entry}' })
  if (note.outcome === 'already') return t('atTheSeal.already', { at: shortTime(note.at, now), entry: '{entry}' })
  if (note.outcome === 'waits') return note.for === 'the-hold' ? t('atTheSeal.waitsForTheHold') : t('atTheSeal.waitsForTheLine', { entry: '{entry}' })
  if (note.outcome === 'not-queued') return t(note.ended === 'bounced' ? 'atTheSeal.bounced' : 'atTheSeal.withdrawn', { entry: '{entry}' })
  return t('atTheSeal.cannot', { at: shortTime(note.at, now), says: content(note.says) })
}

/** One sentence, with the entry it names drawn as a link to the entry's page. */
function WithTheEntry({ sentence, entry }: { sentence: string; entry: string | null }) {
  const at = entry === null ? -1 : sentence.indexOf('{entry}')
  if (entry === null || at < 0) return <>{sentence}</>
  return (
    <>
      {sentence.slice(0, at)}
      <a href={`#${recordPath(entry)}`}>
        <code>{entry}</code>
      </a>
      {sentence.slice(at + '{entry}'.length)}
    </>
  )
}

const isAbsent = (value: unknown): boolean => value === undefined || value === null

/** ON A RUN'S OWN PAGE: what the office did at the seal, for the merge queue and for the next round, in one panel. Each part draws nothing when the office did nothing. */
export function TheSealInTheQueue({ record, sections }: { record: PanelRecord; sections: (key: string) => Declares }) {
  const data = (record.data as Record<string, unknown> | null) ?? {}
  const queued = thePartAtTheSeal(data, 'queued')
  const next = thePartAtTheSeal(data, 'nextRound')
  if (isAbsent(queued) && isAbsent(next)) return null
  const now = new Date()
  return (
    <>
      <style href="mole-office-at-the-seal" precedence="default">
        {AT_THE_SEAL_CSS}
      </style>
      <Panel declares={sections(AT_THE_SEAL)} title={titleHere(record.kind, AT_THE_SEAL)}>
        {isAbsent(queued) ? null : <TheQueueAtTheSeal stored={queued} now={now} />}
        {isAbsent(next) ? null : <TheNextRoundAtTheSeal stored={next} round={data[NEXT_ROUND]} now={now} />}
      </Panel>
    </>
  )
}

/** What the office did with the seal for the merge queue. */
function TheQueueAtTheSeal({ stored, now }: { stored: unknown; now: Date }) {
  const note = readQueuedAtTheSeal(stored)
  return (
    <div className="ats-part">
      <h3 className="ats-part-title">{t('atTheSeal.heading')}</h3>
      {note === null ? (
        <p className="ats-line" data-at-the-seal="unread">
          {t('atTheSeal.unreadable')}
        </p>
      ) : (
        <>
          <p className="ats-line" data-at-the-seal={note.outcome}>
            <WithTheEntry sentence={theSentence(note, now)} entry={'entry' in note ? note.entry : null} />
          </p>
          {note.outcome === 'not-queued' ? (
            <p className="ats-line">{note.told !== undefined ? t('atTheSeal.told') : t('atTheSeal.notTold', { why: content(note.notTold ?? '') })}</p>
          ) : null}
          <p className="ats-line ats-commit">{t('atTheSeal.commit', { commit: note.commit })}</p>
        </>
      )}
    </div>
  )
}

/**
 * How the run's own `nextRound` stands, when it is the ask the office made: asked by the office, for the brief whose
 * sha256 the office read. Another ask in its place is named as another, so its state is never drawn as the office's.
 */
function TheAskNow({ round, sha256, now }: { round: TheNextRound | null; sha256: string; now: Date }) {
  if (round === null) return <p className="ats-line">{t('nextAtTheSeal.noRound')}</p>
  if (round.brief.sha256 !== sha256 || round.askedBy.as !== 'the office') {
    return <p className="ats-line">{t('nextAtTheSeal.another', { at: shortTime(round.askedAt, now) })}</p>
  }
  if (round.state === 'started' && round.started !== undefined) {
    return (
      <p className="ats-line" data-next-round="started">
        <WithTheEntry sentence={t('nextAtTheSeal.started', { at: shortTime(round.started.at, now), run: '{entry}' })} entry={round.started.run} />
      </p>
    )
  }
  if (round.state === 'failed' && round.failed !== undefined) {
    return (
      <p className="ats-line" data-next-round="failed">
        {t('nextAtTheSeal.failed', { at: shortTime(round.failed.at, now), says: content(round.failed.says) })}
      </p>
    )
  }
  if (round.state === 'wanted' && round.waits !== undefined) {
    return (
      <>
        <p className="ats-line" data-next-round="waits">
          {t('nextAtTheSeal.waits')}
        </p>
        <p className="ats-line ats-commit">{content(round.waits.says)}</p>
      </>
    )
  }
  return (
    <p className="ats-line" data-next-round={round.state}>
      {t(round.state === 'starting' ? 'nextAtTheSeal.starting' : 'nextAtTheSeal.wanted')}
    </p>
  )
}

/** What the office did about the run's next round at the seal or at the release, and how the ask it made stands now. */
function TheNextRoundAtTheSeal({ stored, round, now }: { stored: unknown; round: unknown; now: Date }) {
  const note = readNextRoundAtTheSeal(stored)
  return (
    <div className="ats-part">
      <h3 className="ats-part-title">{t(note?.moment === 'release' ? 'nextAtTheRelease.heading' : 'nextAtTheSeal.heading')}</h3>
      {note === null ? (
        <p className="ats-line" data-next-at-the-seal="unread">
          {t('atTheSeal.unreadable')}
        </p>
      ) : note.outcome === 'asked' ? (
        <>
          <p className="ats-line" data-next-at-the-seal="asked">
            {t('nextAtTheSeal.asked', { at: shortTime(note.at, now), path: content(note.brief.path) })}
          </p>
          <TheAskNow round={readTheNextRound(round)} sha256={note.brief.sha256} now={now} />
        </>
      ) : (
        <p className="ats-line" data-next-at-the-seal={note.outcome}>
          {t('nextAtTheSeal.looked', { at: shortTime(note.at, now), says: content(note.says) })}
        </p>
      )}
    </div>
  )
}

/** ON THE MERGE QUEUE PAGE, ABOVE THE LANES: the hold, what it stops, and who held it, when and why. */
export function TheQueueIsHeld({ held, now }: { held: QueueHeld | null | undefined; now: Date }) {
  const [participants] = useProjectAsync(readParticipantsOnce, [])
  if (held === undefined || held === null) return null
  const names = participants.status === 'ready' ? participants.value : undefined
  const who = held.by === null || names === undefined ? null : storedActorName(held.by.id, names, held.by.kind)
  return (
    <div className="mq-held" role="status" data-queue-held="">
      <p className="mq-held-title">{t('mergeQueuePage.held.title')}</p>
      <p className="mq-held-line">{t('mergeQueuePage.held.says')}</p>
      <p className="mq-held-line">
        {held.at === null || held.because === null
          ? t('mergeQueuePage.held.byUnknown')
          : t('mergeQueuePage.held.by', { who: who === null ? t('mergeQueuePage.held.whoUnknown') : content(who), at: shortTime(held.at, now), because: content(held.because) })}
      </p>
    </div>
  )
}

/** The rules of the run page's block. */
const AT_THE_SEAL_CSS = `
.ats-part + .ats-part { margin-top: 0.75rem; }
.ats-part-title { margin: 0 0 0.35rem; color: var(--text); font: 600 var(--fs-2)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.ats-line { margin: 0 0 0.35rem; font: var(--fs-2)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.ats-commit { color: var(--text-3); }
`

/** The rules of the queue page's banner and of the office's words as a submitter, which the queue page puts in its own sheet. */
export const ON_THE_QUEUE_PAGE_CSS = `
.mq-held { display: grid; gap: 4px; padding: var(--pad); border: var(--border-w) solid var(--st-blocked-line); border-radius: var(--radius-sm); background: var(--st-blocked-row); min-width: 0; }
.mq-held-title { margin: 0; color: var(--text); font: 600 var(--fs-2)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.mq-held-line { margin: 0; color: var(--text-2); font: var(--fs-2)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.mq-by-office { font-family: var(--font-ui); }
`
