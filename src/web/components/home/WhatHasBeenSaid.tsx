// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useInspect } from '../../lib/mode.ts'
import { Absence, ServerNote } from '../ui.tsx'
import { t, content } from '@shared/i18n.ts'
/**
 * HOME'S BAND FOR WHAT HAS BEEN SAID, IN THREE DIRECTIONS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Home carried exactly two numbers — what needs somebody, and what is waiting on you — and nothing
 * anywhere counted what has been said. Measured on the owner's corpus on 27 August 2026: seven
 * comments that had been written were in no review and had gone nowhere, one review had been
 * collected six days earlier and never sent, one conversation had been dispatched eight days earlier
 * and no worker had ever picked the run up. None of those four numbers appeared on any screen the
 * owner looks at.
 * The owner's brief, section 22, asks for the compact projection this band is.
 *
 * ---------------------------------------------------------------------------------------
 * MEANING FIRST, AND THE MEANING IS NOT THE THREE DIRECTIONS
 * ---------------------------------------------------------------------------------------
 *
 * The first line is about things the person recognises: comments, reviews, conversations. The three
 * directions are underneath it, small, because a count of a mechanism means nothing until you know
 * what is sitting in it. That is the aim: Home is not flooded with every message,
 * and it says the meaning first.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY DIRECTION SAYS HOW FAR IT ACTUALLY GETS
 * ---------------------------------------------------------------------------------------
 *
 * Not one of the three works end to end on this corpus and they fail in three different ways, so a
 * bare number for each would be three different facts under one shape. So each row carries a word:
 * *completes* when something has gone the whole way at least once, *stops short* when the way is
 * built and nothing has ever arrived, and *no door* when nothing on any screen starts one. The word
 * comes from the server, which measured it; this file draws it.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE IT SITS AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * After the ranked list and before Also. It is not what needs you now — nothing here is late and
 * nothing is blocked — and it is not one of Also's three questions, which are what is alive on this
 * machine, what has been written lately, and what is half-finished. It is its own question.
 *
 * It is NOT the `Nothing is listening` band the governance design names. That band is about
 * stuck-ness and belongs to the queue this file does not own.
 */

import type { Direction, HowFar, WhatHasBeenSaid } from '../../../server/lib/communication.ts'
import { readSaidOnce, useSharedRead } from '../../lib/homereads.ts'
import { Panel } from '../ui.tsx'

/** The word a person reads for how far a direction gets. The server's key is not shown. */
export const HOW_FAR_WORD: Readonly<Record<HowFar, string>> = {
  get completes() { return t('home.saidCompletes') },
  get 'stops-short'() { return t('home.saidStops') },
  get 'no-door'() { return t('home.saidNoDoor') },
}

/**
 * WHAT ONE DIRECTION'S COUNTS READ AS, IN ONE LINE, OR NOTHING AT ALL.
 *
 * A row of five zeroes is worse than no row: it puts five numbers on Home that say nothing and
 * pushes the one sentence that matters down five lines. So only the states that are not zero are
 * drawn, and a direction with nothing in it says so in words instead.
 */
export function countsLine(direction: Direction): string | null {
  const parts: string[] = []
  const c = direction.counts
  if (c.queued > 0) parts.push(t('home.saidQueued', { n: c.queued }))
  if (c.waiting > 0) parts.push(t('home.saidWaiting', { n: c.waiting }))
  if (c.unread > 0) parts.push(t('home.saidUnread', { n: c.unread }))
  if (c.handled > 0) parts.push(t('home.saidHandled', { n: c.handled }))
  if (c.failed > 0) parts.push(t('home.saidFailed', { n: c.failed }))
  if (c.needsAttention > 0) parts.push(t('home.saidNeeds', { n: c.needsAttention }))
  return parts.length === 0 ? null : parts.join(' · ')
}

export function WhatHasBeenSaidBand({ reloadKey }: { reloadKey: number }) {
  const [state] = useSharedRead(readSaidOnce, [reloadKey])
  // NOTHING IS DRAWN WHILE IT IS LOADING AND NOTHING IS DRAWN IF IT FAILS. A band that flashed a
  // skeleton would move every band under it on every visit, and a failure here is not something the
  // owner has to act on — the page's own error note already reports a server that is not answering.
  if (state.status !== 'ready') return null
  return <SaidBand reading={state.value} />
}

/**
 * The band itself, given a reading.
 *
 * EXPORTED FOR ONE TEST AND NOT FOR A CALLER, the same as `WorkingReading`: the component above
 * fetches, and the check is about what a direction with no door draws next to a direction that has
 * one.
 */
export function SaidBand({ reading }: { reading: WhatHasBeenSaid }) {
 const inspect = useInspect()
 return <Panel titleIs="label" declares={{ surface: 'home.said' }} title={t('home.said')} rank={2}>
  <ul className="hsaid-dirs">{reading.directions.map(direction => <li key={direction.key} className="hsaid-dir" data-how-far={direction.howFar}>
    <span className="hsaid-dir-word">{t(direction.key === 'human-to-agent' ? 'home.saidHumanAgent' : direction.key === 'agent-to-human' ? 'home.saidAgentHuman' : 'home.saidAgentAgent')}</span>
    <span className="hsaid-howfar">{HOW_FAR_WORD[direction.howFar]}</span>
    <span className="hsaid-counts">{countsLine(direction) ?? <Absence title={t('home.saidEmpty')} />}</span>
    {inspect ? <ul className="hsaid-mechs">{direction.mechanisms.map(one => <li key={one.what}><b>{one.what}</b> — {HOW_FAR_WORD[one.howFar]}<ServerNote text={one.says} /></li>)}</ul> : null}
   </li>)}</ul>
  <ServerNote text={reading.note} />
 </Panel>
}

/* Quoting with plain words in this stylesheet: a backtick anywhere in it would close the template
   string and turn the rest of the file into nonsense. */
export const WHAT_HAS_BEEN_SAID_CSS = `
.hsaid-lead { margin: 0; color: var(--text-2); font-size: var(--fs-1); max-width: var(--measure-in-box); }
.hsaid-dirs { list-style: none; margin: 0; padding: 0; }
.hsaid-dir { margin: 0 0 var(--pad) 0; display: grid; gap: 2px var(--pad); align-items: baseline;
  grid-template-columns: minmax(0, max-content) minmax(0, max-content) minmax(0, 1fr); }
.hsaid-dir-word { font-weight: 600; font-size: var(--fs-1); }
.hsaid-howfar { font-size: var(--fs-1); color: var(--text-3); }
.hsaid-dir[data-how-far="no-door"] .hsaid-howfar,
.hsaid-dir[data-how-far="stops-short"] .hsaid-howfar { border-bottom: 1px dashed var(--edge); }
.hsaid-counts { font-size: var(--fs-1); color: var(--text-2); min-width: 0; overflow-wrap: anywhere; }
.hsaid-mechs { grid-column: 1 / -1; list-style: none; margin: 2px 0 0 0; padding: 0;
  color: var(--text-3); font-size: var(--fs-1); max-width: var(--measure-in-box); }
.hsaid-mechs li { margin: 0 0 2px 0; }
@media (max-width: 40rem) {
  .hsaid-dir { grid-template-columns: minmax(0, 1fr); }
}
`
