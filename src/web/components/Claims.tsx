// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO IS WORKING ON THIS, drawn on a record page and on the front page.
 *
 * Criterion M13 of design/messages/ACCEPTANCE.md: *Claims are drawn on the record and on the
 * dashboard.* Proposal `pg10HWny6J0j` asked for the same thing: show which folders or which
 * files an agent holds. The record page shows the tag while a claim is live.
 *
 * ---------------------------------------------------------------------------------------
 * TWO DRAWINGS, ONE ROW
 * ---------------------------------------------------------------------------------------
 *
 * The record page draws the claims naming that record; the front page draws every live claim in the
 * project. Both draw one claim the same way, through `ClaimLine` below, because two copies of one
 * row is the defect this repository keeps producing.
 *
 * ---------------------------------------------------------------------------------------
 * A CONFLICT IS DRAWN IN THE WRONG COLOUR ON BOTH
 * ---------------------------------------------------------------------------------------
 *
 * Two live claims on the same thing is the one state here somebody has to act on, so it is the one
 * state drawn in the colour that means something. The line says which group it is being sorted out
 * in, because a conflict with nowhere to go is a red mark and no next step.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING IS DRAWN WHEN NOBODY HAS CLAIMED ANYTHING
 * ---------------------------------------------------------------------------------------
 *
 * On a record page an empty panel would be permanent furniture on every record, and permanent
 * furniture stops being read. On the front page the heading is drawn with the short mark for
 * ordinary emptiness, which carries the sentence saying no agent has said what it is working on,
 * because that page is a list of what is going on and a silence there reads as a page that failed
 * to load.
 */

import { LEASE_STATES, type ClaimedKind, type ClaimOnTheWire, type LeaseInput, type LeaseState, type Overlap } from '@shared/claims.ts'
import { content, t, type WordKey } from '@shared/i18n.ts'
import { participantKey } from '@shared/messages.ts'
import { api, type ClaimsReply } from '../api.ts'
import { useInspect } from '../lib/mode.ts'
import { Absence } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
// THE NAMES AND THE GROUPS ARE ONE READ FOR THE WHOLE PAGE. These two components used to ask for
// both themselves, which was a second request for each beside the chat panels and the frame.
import { readGroupsOnce, readParticipantsOnce } from '../lib/oneread.ts'
import { useRecordTitles } from '../lib/titles.ts'
import { recordPath, RouteLink } from './router.tsx'

/** What the conflict line on one claim says: how many agents are on it, and where they are settling it. */
export interface Conflict {
  /** How many participants hold a live claim on something this one names, this one included. */
  agents: number
  /** The name of every group those clashes are being sorted out in, in the order they were found. */
  groups: string[]
}

/**
 * WHICH CONFLICTS EACH CLAIM IS IN, worked out once for whichever list is being drawn.
 *
 * ONE CLAIM CAN BE IN SEVERAL, and this used to be a map holding one. Problem `qpjjRnnfo-4i`: three
 * agents on one record make three overlaps, one per pair, and a map keyed by claim id kept whichever
 * was written last, so each row named one group where there were two and the other was drawn nowhere.
 *
 * BOTH LISTS ASK THIS ONE FUNCTION. The record page and the front page drew the same map twice, and
 * two copies of one rule is the defect this repository keeps producing. Home's Agents at work
 * (components/home/HomeSections.tsx) asks it too, with the words and the names below.
 */
export function conflictsByClaim(
  overlaps: readonly Overlap[],
  groupNamed: (id: string | null) => string | null,
): Map<string, Conflict> {
  const out = new Map<string, Conflict>()
  const whoIsOnIt = new Map<string, Set<string>>()
  for (const overlap of overlaps) {
    for (const claim of overlap.claims) {
      const held = out.get(claim.id) ?? { agents: 0, groups: [] }
      const name = groupNamed(overlap.groupId)
      if (name !== null && !held.groups.includes(name)) held.groups.push(name)
      out.set(claim.id, held)
      const parties = whoIsOnIt.get(claim.id) ?? new Set<string>()
      for (const one of overlap.claims) parties.add(participantKey(one.claimant))
      whoIsOnIt.set(claim.id, parties)
    }
  }
  for (const [id, held] of out) held.agents = whoIsOnIt.get(id)?.size ?? 2
  return out
}

/**
 * THE PANEL'S WORDS, FROM THE WORD LISTS. The server keeps its own English for the same facts in
 * src/shared/claims.ts; the page says them in the page's language.
 */
const LEASE_KEYS: Readonly<Record<LeaseState, { word: WordKey; means: WordKey }>> = {
  live: { word: 'homeWords.lease.live', means: 'homeWords.lease.liveMeans' },
  released: { word: 'homeWords.lease.released', means: 'homeWords.lease.releasedMeans' },
  'the run ended': { word: 'homeWords.lease.ended', means: 'homeWords.lease.endedMeans' },
}

/** How one claim stands, in words. A state this page does not know is said to be unknown. */
function leaseWords(state: unknown): { word: string; means: string } {
  const keys = typeof state === 'string' && (LEASE_STATES as readonly string[]).includes(state)
    ? LEASE_KEYS[state as LeaseState]
    : { word: 'homeWords.lease.unknown' as const, means: 'homeWords.lease.unknownMeans' as const }
  return { word: t(keys.word), means: t(keys.means) }
}

/**
 * wNjQEfclwxjJ; USER.md invariants 2 and 5: every input has its own words. An unreadable
 * process keeps the claim held without saying the process is alive or trusting the record.
 */
const SOURCE_KEYS: Readonly<Record<LeaseInput, { says: WordKey; inFull: WordKey }>> = {
  'the ledger': { says: 'homeWords.lease.fromProcess', inFull: 'homeWords.lease.fromProcessInFull' },
  'the session record': { says: 'homeWords.lease.fromRecord', inFull: 'homeWords.lease.fromRecordInFull' },
  'a process that could not be checked': {
    says: 'homeWords.lease.fromUncheckedProcess', inFull: 'homeWords.lease.fromUncheckedProcessInFull',
  },
}

/** Which input keeps the claim held: the short line, and the longer one for the tooltip. */
function sourceWords(input: LeaseInput): { says: string; inFull: string } {
  const keys = SOURCE_KEYS[input]
  return { says: t(keys.says), inFull: t(keys.inFull) }
}

export function kindWords(kind: ClaimedKind): string {
  return t(kind === 'record' ? 'homeWords.claims.record' : 'homeWords.claims.path')
}

/** The conflict line: how many agents, and the groups it is being sorted out in. */
export function conflictWords(conflict: Conflict): string {
  const agents = conflict.agents === 2
    ? t('homeWords.claims.twoInConflict')
    : t('homeWords.claims.manyInConflict', { n: conflict.agents })
  if (conflict.groups.length === 0) return agents
  const groups = conflict.groups.length === 1
    ? t('homeWords.claims.oneGroup', { group: content(conflict.groups[0]!) })
    : t('homeWords.claims.manyGroups', { groups: conflict.groups.map((one) => content(one)).join(' · ') })
  return `${agents} ${groups}`
}

/**
 * WHO A CLAIM NAMES, AS A READER SEES THEM. A registered name when the page could read one.
 * Otherwise normal mode says "An agent" or "A person", and developer mode shows the id the claim
 * carries.
 */
export function useClaimantNames(): (ref: { kind: string; id: string }) => string {
  const inspect = useInspect()
  const [who] = useProjectAsync(() => readParticipantsOnce(), [])
  return (ref) => {
    const found = who.status !== 'ready'
      ? undefined
      : ref.kind === 'person'
        ? who.value.people.find((one) => one.id === ref.id)
        : who.value.agents.find((one) => one.id === ref.id)
    if (found !== undefined) return content(found.name)
    if (inspect) return ref.id
    return t(ref.kind === 'person' ? 'homeWords.claims.somePerson' : 'homeWords.claims.someAgent')
  }
}

/** One claim, drawn the same way wherever it is. */
function ClaimLine({
  claim,
  names,
  titles,
  conflict,
}: {
  claim: ClaimOnTheWire
  names: (who: { kind: string; id: string }) => string
  /** What each record a claim names is called. An id where a name belongs says nothing about it. */
  titles: Readonly<Record<string, string>>
  /** The conflicts this claim is in, or null because another live claim names nothing it names. */
  conflict: Conflict | null
}) {
  const inspect = useInspect()
  const lease = leaseWords(claim.state)
  const source = claim.from === null ? null : sourceWords(claim.from)
  return (
    <li className="claims-row" data-conflict={conflict === null ? 'no' : 'yes'}>
      <span className="claims-who">{t('homeWords.claims.since', { name: names(claim.claimant), at: claim.openedAt })}</span>
      <span className="claims-lease" title={source === null ? lease.means : source.inFull}>
        {source === null ? lease.word : t('homeWords.claims.leaseAndSource', { word: lease.word, says: source.says })}
      </span>
      <ul className="claims-things">
        {claim.things.map((thing) => (
          <li key={[thing.what, thing.id].join(':')} className="claims-thing">
            {thing.what === 'record' ? (
              <RouteLink to={recordPath(thing.id)}>{titles[thing.id] === undefined ? t('homeWords.claims.recordIsGone') : content(titles[thing.id])}</RouteLink>
            ) : inspect ? (
              // A PATH IS MACHINERY: developer mode shows it, and normal mode names only its kind.
              <span className="claims-path num">{thing.id}</span>
            ) : null}
            <span className="claims-kind">{kindWords(thing.what)}</span>
          </li>
        ))}
      </ul>
      {conflict === null ? null : <span className="claims-conflict">{conflictWords(conflict)}</span>}
    </li>
  )
}

/** Every live claim naming one record. Draws nothing when nobody has claimed it. */
export function WhoIsWorkingHere({ recordId }: { recordId: string }) {
  const [state] = useProjectAsync(() => api.claimsOnRecord(recordId), [recordId])
  const named = useClaimantNames()
  // AND THE GROUPS, so the conflict line can name the one it is being sorted out in. A red mark with
  // no next step is the reader being told there is a problem and not where it is being dealt with.
  const [groups] = useProjectAsync(() => readGroupsOnce(), [])
  // ASKED BEFORE THE EARLY RETURN, because a hook may not run only sometimes. `useRecordTitles` asks
  // for nothing when the list is empty.
  const titles = useRecordTitles(
    state.status === 'ready'
      ? state.value.claims.flatMap((one) => one.things.filter((t) => t.what === 'record').map((t) => t.id))
      : [],
  )
  if (state.status !== 'ready' || state.value.claims.length === 0) return null
  const groupNamed = (id: string | null): string | null => {
    if (id === null || groups.status !== 'ready') return null
    return groups.value.groups.find((one) => one.id === id)?.name ?? null
  }
  const conflicts = conflictsByClaim(state.value.overlaps, groupNamed)
  return (
    <section className="claims-here" aria-label={t('homeWords.claims.onThisRecord')}>
      <style href="mole-office-claims" precedence="default">
        {CSS}
      </style>
      <h2 className="claims-head">{t('homeWords.claims.onThisRecord')}</h2>
      <ul className="claims-list">
        {state.value.claims.map((claim: ClaimOnTheWire) => (
          <ClaimLine
            key={claim.id}
            claim={claim}
            names={named}
            titles={titles}
            conflict={conflicts.get(claim.id) ?? null}
          />
        ))}
      </ul>
    </section>
  )
}

/** Every live claim in this project, for the front page.
 *
 * THE CLAIMS AND THE TITLES ARE HANDED IN. HomePage reads the claims at page open (they are the
 * first of two reads this band needs — the titles are derived from the record ids they name), and
 * it starts the titles read as soon as the claims answer arrives, so neither lands in a later wave.
 * This component draws; see `readClaimsOnce` and `useRecordTitles` at the call site.
 */
export function WhatAgentsAreWorkingOn({
  claims,
  titles,
}: {
  claims: ClaimsReply
  /** What each record a claim names is called, already read by the page. */
  titles: Readonly<Record<string, string>>
}) {
  const named = useClaimantNames()
  const [groups] = useProjectAsync(() => readGroupsOnce(), [])
  const live = claims.claims.filter((one: ClaimOnTheWire) => one.state === 'live')
  const groupNamed = (id: string | null): string | null => {
    if (id === null || groups.status !== 'ready') return null
    return groups.value.groups.find((one) => one.id === id)?.name ?? null
  }
  const conflicts = conflictsByClaim(claims.overlaps, groupNamed)
  return (
    <section className="claims-here" aria-label={t('homeWords.claims.title')}>
      <style href="mole-office-claims" precedence="default">
        {CSS}
      </style>
      <h2 className="claims-head">{t('homeWords.claims.title')}</h2>
      {/* ORDINARY EMPTINESS: the short mark, with the sentence on it for a pointer and a screen
          reader. Nobody has to do anything about a project where no agent has claimed work. */}
      {live.length === 0 ? <p className="claims-nobody"><Absence title={t('homeWords.claims.nobody')} /></p> : null}
      <ul className="claims-list">
        {live.map((claim: ClaimOnTheWire) => (
          <ClaimLine
            key={claim.id}
            claim={claim}
            names={named}
            titles={titles}
            conflict={conflicts.get(claim.id) ?? null}
          />
        ))}
      </ul>
    </section>
  )
}

const CSS = `
.claims-here { margin: var(--pad) 0; }
.claims-head { font-size: var(--fs-2); margin: 0 0 var(--pad) 0; color: var(--text-2); }
.claims-nobody { margin: 0; font-size: var(--fs-1); color: var(--text-3); }
.claims-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--pad); }
.claims-row {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  border-left: 3px solid var(--border);
  padding-left: var(--pad);
}
.claims-row[data-conflict='yes'] { border-left-color: var(--st-broken); }
.claims-who { font-size: var(--fs-2); color: var(--text); }
.claims-lease { font-size: var(--fs-1); color: var(--text-3); }
.claims-things { list-style: none; margin: 0.1rem 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.4rem; }
.claims-thing { display: inline-flex; align-items: baseline; gap: 0.3rem; font-size: var(--fs-1); }
.claims-path { color: var(--text-2); overflow-wrap: anywhere; }
.claims-kind { color: var(--text-3); }
.claims-conflict { font-size: var(--fs-1); color: var(--st-broken); }
`
