// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN OPEN PAGE FOLLOWS CHANGES TO WHAT IT SHOWS (wave 13y round 145, item 87).
 *
 * The server says `record.changed` when a record is stored again or a link to or from it changes
 * (src/server/lib/record-changes.ts). The event carries the record's id, kind and project and nothing the
 * record holds, so a page that shows the record reads it again through its own door. A page names what it
 * shows through `useAsync`'s `follows` (src/web/components/ui.tsx), and this file decides when it reads:
 *
 *   - half a second after the first change it follows, so a write that stores several revisions at once
 *     is read once;
 *   - and, when the page asks for a gap, at most once in that gap. Home and the lists ask for 5 seconds,
 *     because they follow whole kinds and agents store runs often.
 *
 * A page also reads once when events were lost or the stream came back, because a change in that time
 * was not heard, and when a change to a record may have been missed while the page connected. Lost events
 * and a change missed while connecting are read at once, as every list does (round 146): each comes as one
 * signal, so there are no revisions to wait out, and the page's mark waits for a read that has started
 * (src/web/lib/ready.ts) but not for a timer. Read half a second later, the record was asked for after the
 * page said it had finished drawing. The server sends a page only the events of the project it watches, so a
 * page that shows several projects follows only the one on screen.
 *
 * A page may also follow a list the server names in `list.changed`, such as the registry or the visits, which are not
 * records (round 147). It reads by the same timing.
 */
import type { AListAnEventCanName, ListChanged, RecordChanged } from '@shared/events.ts'
import { hearAlways, whenEventsWereLost, whenRecordChangesMayHaveBeenMissed, whenTheStreamCameBack } from './channel.ts'

/** What a read shows, so a change to it is read again. */
export interface Follows {
  /** These records, by id. */
  records?: readonly string[]
  /** Every record of these kinds, or of every kind. */
  kinds?: readonly string[] | 'every kind'
  /** These lists, when a write names them in `list.changed`. */
  lists?: readonly AListAnEventCanName[]
  /** At most one read in this many milliseconds. Left out, a page reads after each pause. */
  atMostEveryMs?: number
}

/** How long a page waits after the first change it follows before it reads. */
export const FOLLOW_PAUSE_MS = 500

/** Whether a change to this record is one this read shows. */
export function followsThisChange(follows: Follows, event: Pick<RecordChanged, 'recordId' | 'kind'>): boolean {
  if (follows.records?.includes(event.recordId) === true) return true
  if (follows.kinds === 'every kind') return true
  return follows.kinds?.includes(event.kind) === true
}

/** Whether a write that changed these lists changed one this read shows. */
export function followsThisList(follows: Follows, event: Pick<ListChanged, 'lists'>): boolean {
  return follows.lists?.some((one) => event.lists.includes(one)) === true
}

/** Call `readAgain` when something `follows` names changes, by the timing above. Returns the way to stop. */
export function followChanges(follows: Follows, readAgain: () => void): () => void {
  const gap = follows.atMostEveryMs ?? 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastRead = Number.NEGATIVE_INFINITY
  const read = (): void => {
    timer = null
    lastRead = Date.now()
    readAgain()
  }
  const soon = (): void => {
    if (timer !== null) return
    const now = Date.now()
    timer = setTimeout(read, Math.max(now + FOLLOW_PAUSE_MS, lastRead + gap) - now)
  }
  const atOnce = (): void => {
    if (Date.now() < lastRead + gap) return soon()
    if (timer !== null) clearTimeout(timer)
    read()
  }
  const stops = [
    hearAlways((event) => {
      if (event.name === 'record.changed' && followsThisChange(follows, event)) soon()
      if (event.name === 'list.changed' && followsThisList(follows, event)) soon()
    }, ['record.changed', 'list.changed']),
    whenEventsWereLost(atOnce),
    whenRecordChangesMayHaveBeenMissed(atOnce),
    whenTheStreamCameBack(soon),
  ]
  return () => {
    for (const stop of stops) stop()
    if (timer !== null) clearTimeout(timer)
  }
}
