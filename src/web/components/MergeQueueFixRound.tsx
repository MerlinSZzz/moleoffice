// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13u, the merge queue.
/**
 * A FEW-RED ENTRY THAT WAITS FOR A FIX ROUND, AS BOTH PAGES SAY IT (wave 13u round 90, item 25). The entry was red in
 * few enough feature test files to land handed back, but its line had no run going, so the office asked the next-round
 * door for a round itself. The queue page's row and the entry's own record page both say that it waits, until when,
 * whom the office asked, and what the door answered each time. Both draw it from here.
 *
 * The record page's body draws plain fields only, and the wait is an object, so the body leaves it out. A person is
 * named by the participants list; one the list does not name is said to be one the office cannot name. The door's own
 * words can name ids and paths, so the record page draws them in developer mode only. The queue page draws them always.
 */
import type { FixRoundAsk, WaitsForAFixRound } from '@shared/merge-queue.ts'
import { content, t } from '@shared/i18n.ts'
import type { PanelRecord } from '@shared/types.ts'
import { useInspect } from '../lib/mode.ts'
import { readParticipantsOnce } from '../lib/oneread.ts'
import type { Declares } from './declares.ts'
import { storedActorName, type StoredActorParticipants } from './Governance.tsx'
import { shortTime } from './MergeQueuePush.tsx'
import { Panel } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'

/** The stored wait, when the entry holds one in a shape this page can read; `unread` when it holds one it cannot. */
export function theFixRoundWait(machine: Record<string, unknown> | undefined): WaitsForAFixRound | 'unread' | null {
  const wait = machine?.['waitsForAFixRound']
  if (wait === undefined || wait === null) return null
  if (typeof wait !== 'object' || Array.isArray(wait)) return 'unread'
  const held = wait as Partial<Record<keyof WaitsForAFixRound, unknown>>
  if (typeof held.until !== 'string' || !Array.isArray(held.asks)) return 'unread'
  const asks = held.asks as unknown[]
  if (!asks.every((ask) => typeof ask === 'object' && ask !== null && typeof (ask as FixRoundAsk).at === 'string' && typeof (ask as FixRoundAsk).said === 'string')) return 'unread'
  return wait as WaitsForAFixRound
}

/** Whether the entry waits for a fix round that has not opened. A wait that cannot be read is said to be one. */
export function itWaitsForAFixRound(machine: Record<string, unknown> | undefined): boolean {
  const wait = theFixRoundWait(machine)
  return wait === 'unread' || (wait !== null && wait.opened === undefined)
}

/** Whom the office asked: the line's supervisor or the build sheriff, by the name the participants list gives. */
function whom(ask: FixRoundAsk, participants: StoredActorParticipants | undefined): string {
  if (ask.agent === undefined) return t(ask.for === 'line' ? 'fixRound.whom.lineNone' : 'fixRound.whom.sheriffNone')
  const who = participants === undefined ? null : storedActorName(ask.agent, participants, 'agent')
  if (who === null) return t(ask.for === 'line' ? 'fixRound.whom.lineUnknown' : 'fixRound.whom.sheriffUnknown')
  return t(ask.for === 'line' ? 'fixRound.whom.line' : 'fixRound.whom.sheriff', { who: content(who) })
}

/** What one ask was answered, in short sentences: the ask, the door's words when they are drawn, and what came of it. */
function theAnswerTo(ask: FixRoundAsk, participants: StoredActorParticipants | undefined, now: Date, saidToo: boolean): string[] {
  const asked = whom(ask, participants)
  if (ask.status === undefined) return [saidToo ? t('fixRound.ask.notAskedSaid', { whom: asked, said: content(ask.said) }) : t('fixRound.ask.notAsked', { whom: asked })]
  const lines = [t(ask.status === 202 ? 'fixRound.ask.took' : 'fixRound.ask.refused', { whom: asked, at: shortTime(ask.at, now) })]
  if (saidToo) lines.push(t('fixRound.ask.said', { said: content(ask.said) }))
  if (ask.status !== 202) return lines
  if (ask.started !== undefined) lines.push(t('fixRound.ask.started', { at: shortTime(ask.started.at, now) }))
  else if (ask.ended !== undefined) lines.push(saidToo ? t('fixRound.ask.endedSaid', { at: shortTime(ask.ended.at, now), says: content(ask.ended.says) }) : t('fixRound.ask.ended', { at: shortTime(ask.ended.at, now) }))
  else lines.push(t('fixRound.ask.waiting'))
  return lines
}

/** The wait, line by line: until when, whom the office asked and what each answered, and the round once it opened. */
export function TheFixRoundWait({ machine, now, saidToo, className }: { machine: Record<string, unknown> | undefined; now: Date; saidToo: boolean; className: string }) {
  const [participants] = useProjectAsync(readParticipantsOnce, [])
  const wait = theFixRoundWait(machine)
  if (wait === null) return null
  const names = participants.status === 'ready' ? participants.value : undefined
  const lines =
    wait === 'unread'
      ? [t('fixRound.unread')]
      : [
          wait.opened === undefined ? t('fixRound.until', { until: shortTime(wait.until, now) }) : t('fixRound.opened', { at: shortTime(wait.opened.at, now) }),
          ...wait.asks.flatMap((ask) => theAnswerTo(ask, names, now, saidToo)),
        ]
  return (
    <>
      {lines.map((line, at) => (
        <p key={`${String(at)} ${line}`} className={className} data-fix-round="">
          {line}
        </p>
      ))}
    </>
  )
}

/** ON A MERGE ENTRY'S OWN RECORD PAGE: the wait, drawn whole, while the entry holds one. It draws nothing otherwise. */
export function TheFixRoundOnItsPage({ record, sections }: { record: PanelRecord; sections: (key: string) => Declares }) {
  const inspect = useInspect()
  if (theFixRoundWait(record.data) === null) return null
  return (
    <>
      <style href="mole-office-a-fix-round" precedence="default">
        {FIX_ROUND_CSS}
      </style>
      <Panel declares={sections('waitsForAFixRound')} title={t('fixRound.heading')}>
        <TheFixRoundWait machine={record.data} now={new Date()} saidToo={inspect} className="fr-line" />
      </Panel>
    </>
  )
}

const FIX_ROUND_CSS = `
.fr-line { margin: 0 0 0.35rem; font: var(--fs-2)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
`
