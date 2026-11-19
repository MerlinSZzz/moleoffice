// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SECRETARY'S ONE-LINE DUTY, UNDER ITS NAME. Wave 13y round 86, item 12 of the line's requirements.
 *
 * Item 12 is each person's public one-line duty under their name in the chat, so that people are easy to find, and on
 * each profile too. For a secretary that line is the area of its duties record, as
 * GET /api/secretaries/duties?scope=office answers it across the office: the chat belongs to no project, so a duty reads
 * the same from any project it is opened in (wave 13y round 111). A supervisor's line is the area its secretary wrote
 * for it in the secretary's own duties record (wave 13y round 91, item 12b). A worker shows no line: a role card's word
 * is not a duty, because every worker would read the same.
 *
 * ONE READ FOR THE PAGE. The chat's contact rows, its conversation heading and the profile page all draw `TheDutyLine`,
 * and every one of them reads the same answer through `readSecretariesDutiesOnce`. So a page load asks the door once
 * for each project it shows, and each time the door answers for the whole office. The answer is not read again while
 * the page stays open: a secretary's duties written after that show when the page is loaded again.
 *
 * WHAT IS DRAWN is worked out in one place, `theDutyLineOf`:
 *   - an agent the door lists with a duties record: the record's area;
 *   - an agent the door lists with no record: nothing, because no words stand in for a duty nobody recorded (wave 13y
 *     round 111);
 *   - an agent a listed secretary's duties name as a supervisor: the area those duties give it;
 *   - an agent, when the read failed: words saying its duty line could not be read, and why. The page cannot tell
 *     whether that agent is a secretary, so it does not draw nothing as if it had looked;
 *   - while the read is on its way, and for anybody else: nothing. Mole Office itself sits in the agent registry and
 *     is not an agent, so it is anybody else, and a failed read draws nothing under it either.
 */

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { t } from '@shared/i18n.ts'
import { isMoleOffice } from '@shared/participants.ts'
import { api, errorMessage, getActor } from '../api.ts'
import type { SecretariesDutiesReply } from '../api-parts/messages.ts'
import { useLanguage } from '../lib/language.ts'
import { oneRead } from '../lib/oneread.ts'
import { currentWorkspace, subscribeWorkspace } from '../lib/workspace.ts'

/** The read of GET /api/secretaries/duties, once for each project and reader. */
export const readSecretariesDutiesOnce = oneRead(() => api.secretariesDuties())

/** Where the page's one read of the door stands. */
export type TheDutiesReading =
  | { status: 'reading' }
  | { status: 'read'; reply: SecretariesDutiesReply }
  | { status: 'unread'; why: string }

/** What is drawn under one name. Null draws nothing. */
export type ADutyLine = { says: 'area'; area: string } | { says: 'unread'; why: string } | null

/** THE ONE PLACE THE LINE UNDER A NAME IS WORKED OUT, from the reading and the participant it is drawn under. */
export function theDutyLineOf(reading: TheDutiesReading, who: { kind: string; id: string }): ADutyLine {
  if (who.kind !== 'agent' || isMoleOffice({ kind: 'agent', id: who.id })) return null
  if (reading.status === 'reading') return null
  if (reading.status === 'unread') return { says: 'unread', why: reading.why }
  const listed = reading.reply.secretaries.find((one) => one.agent.id === who.id)
  if (listed !== undefined) return listed.duties === null ? null : { says: 'area', area: listed.duties.area }
  // A SUPERVISOR IS NAMED BY ONE SECRETARY'S DUTIES AT MOST, which the duties guard holds, so the first found is the one.
  for (const one of reading.reply.secretaries) {
    const named = one.duties?.supervisors?.find((entry) => entry.agent.id === who.id)
    if (named !== undefined) return { says: 'area', area: named.area }
  }
  return null
}

const ON_ITS_WAY: TheDutiesReading = { status: 'reading' }

/** The reading for one project and reader, and which those are. One reading at a time, as one page draws one project. */
let held: { key: string; reading: TheDutiesReading } | null = null
const listeners = new Set<() => void>()

/** Which project and reader a reading answers, as `oneRead` keys its own answers. */
function theKeyNow(): string {
  const actor = getActor()
  return `${currentWorkspace()}\n${actor.type}:${actor.id}:${actor.sessionId ?? ''}`
}

function theReadingNow(): TheDutiesReading {
  return held !== null && held.key === theKeyNow() ? held.reading : ON_ITS_WAY
}

function listen(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Ask the door for the project and reader on screen, unless this page already asked for them. */
function askForTheDuties(): void {
  const key = theKeyNow()
  if (held !== null && held.key === key) return
  held = { key, reading: ON_ITS_WAY }
  const settle = (reading: TheDutiesReading): void => {
    // AN ANSWER FOR A PROJECT NO LONGER ON SCREEN IS NOT KEPT, so it is never drawn under the next project's names.
    if (held === null || held.key !== key) return
    held = { key, reading }
    for (const listener of listeners) listener()
  }
  readSecretariesDutiesOnce().then(
    (reply) => {
      settle({ status: 'read', reply })
    },
    (err: unknown) => {
      settle({ status: 'unread', why: errorMessage(err) })
    },
  )
}

/** The page's one reading of the door, asked for the project on screen when it is first needed. */
export function useTheSecretariesDuties(): TheDutiesReading {
  const project = useSyncExternalStore(subscribeWorkspace, currentWorkspace, currentWorkspace)
  const reading = useSyncExternalStore(listen, theReadingNow, theReadingNow)
  useEffect(() => {
    askForTheDuties()
  }, [project])
  return reading
}

/**
 * The line under one name: a secretary's or a named supervisor's area, or words saying the read failed. Nothing for
 * anybody else. `folds` is for the open conversation's heading, which shows two lines of a longer duty and a press that
 * opens the rest (wave 13y round 113, item 45).
 */
export function TheDutyLine({ who, folds = false }: { who: { kind: string; id: string }; folds?: boolean }): React.ReactElement | null {
  useLanguage()
  const line = theDutyLineOf(useTheSecretariesDuties(), who)
  if (line === null) return null
  const words = line.says === 'area' ? line.area : t('chat.duty.unread', { why: line.why })
  return (
    <>
      <style href="mole-office-duty-line" precedence="default">
        {DUTY_LINE_CSS}
      </style>
      {folds ? (
        // KEYED BY THE AGENT, so another conversation starts folded again. Only an agent has a line, so its id is enough.
        <TheFoldedDuty key={who.id} words={words} says={line.says} />
      ) : (
        /* THE WHOLE LINE IS THE HOVER TEXT, because a narrow chat cuts it at the edge. */
        <span className="duty-line" data-says={line.says} title={words}>
          {words}
        </span>
      )}
    </>
  )
}

/**
 * TWO LINES OF THE DUTY IN THE OPEN HEADING, AND A PRESS FOR THE REST. Item 45 asks for less room at the top of the
 * chat, and a long duty took four or five lines above the messages. The press is drawn only when the two lines cut the
 * duty, and it closes the duty again once it is open. A new duty, or a new width, is measured again.
 */
function TheFoldedDuty({ words, says }: { words: string; says: 'area' | 'unread' }): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [cut, setCut] = useState(false)
  const shown = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const box = shown.current
    if (box === null || open) return
    const measure = (): void => {
      setCut(box.scrollHeight > box.clientHeight + 1)
    }
    measure()
    // IN THE NEXT FRAME, because the press drawn or taken away changes the size of the box being watched.
    let frame = 0
    const watch = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(measure)
    })
    watch.observe(box)
    return () => {
      window.cancelAnimationFrame(frame)
      watch.disconnect()
    }
  }, [open, words])
  // THE LINE HOLDS THE DUTY'S WORDS ALONE, as it does everywhere else, and the press stands beside it.
  return (
    <span className="duty-fold" data-open={open ? 'yes' : 'no'}>
      <span ref={shown} className="duty-line" data-says={says} title={open ? undefined : words}>
        {words}
      </span>
      {cut || open ? (
        <button
          type="button"
          className="duty-line-more"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open)
          }}
        >
          {open ? t('chat.duty.less') : t('chat.duty.more')}
        </button>
      ) : null}
    </span>
  )
}

const DUTY_LINE_CSS = `
.duty-line { display: block; min-width: 0; font-size: 0.75rem; line-height: 1.3; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.duty-line[data-says='unread'] { font-style: italic; color: var(--text-3); }
.duty-fold { display: flex; align-items: flex-end; gap: 0.3rem; min-width: 0; }
.duty-fold > .duty-line { flex: 1 1 auto; white-space: normal; overflow-wrap: anywhere; overflow: visible; text-overflow: clip; }
.duty-fold[data-open='no'] > .duty-line { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.duty-line-more { flex: none; font-family: inherit; font-size: 0.75rem; line-height: 1.3; color: var(--text-2); white-space: nowrap; border: none; background: none; padding: 0; text-decoration: underline; cursor: pointer; }
`
