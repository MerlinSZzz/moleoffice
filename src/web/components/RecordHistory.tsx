// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THIS RECORD HELD BEFORE, AND HOW TO PUT ONE OF THOSE VERSIONS BACK.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Mole Office has kept every version of every record for weeks, and until this panel a person could not
 * reach one. Four routes answered — the list, one whole version, a comparison of two, and putting
 * one back — and the browser called only the first, only to stamp a number on its own write. A
 * crawl of 24 pages pressed 1,696 controls and made zero requests to any of them (measured 20
 * August 2026, `design/round-nine/step9-revision-coverage.md`). The one control on a record page
 * carrying the word *history* opened the change log, which is a different thing: it says who
 * touched which field, and it cannot say what the record held or put any of it back.
 *
 * ---------------------------------------------------------------------------------------
 * THE WORDS ON SCREEN, AND WHY THEY ARE THESE ONES
 * ---------------------------------------------------------------------------------------
 *
 * Nothing here teaches a reader that Mole Office has a revision ledger, because they do not need to know
 * it exists in order to use it. A person sees VERSIONS of a record, what each one held, what
 * changed between two of them, and a way to PUT ONE BACK. No git word reaches a reader — not
 * commit, not checkout, not branch — and there is nothing to name anyway: putting a version back
 * writes it FORWARD as a new version, and nothing in the list is ever removed or rewritten.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT REFUSES TO PRETEND
 * ---------------------------------------------------------------------------------------
 *
 * Most records in this corpus have exactly one version, and it is a `baseline` — a row written by
 * the migration that built the ledger, holding what the record contained THAT DAY and not what it
 * contained when it was created. 539 of 617 rows are baselines. Presenting one as "the original"
 * would be the product inventing a past, so a baseline row says in words what it is and offers no
 * comparison it cannot make.
 *
 * The oldest entry's `changed` is null, which means THERE IS NOTHING EARLIER TO COMPARE WITH. That
 * is not the same as nothing having changed, and the row says the first rather than the second.
 *
 * WHAT THE RECORD HOLDS NOW is named by the server — `revisionSeq` on a record read, asked of the
 * ledger by content rather than by taking the newest row. When the ledger holds nothing with the
 * content on screen, this panel says so and offers no comparison "with now", because there would be
 * nothing truthful to compare against.
 *
 * ---------------------------------------------------------------------------------------
 * ONE COMPARISON, MADE ON THE SERVER
 * ---------------------------------------------------------------------------------------
 *
 * `differences` comes from the compare route, which uses the same field-path walk the change log
 * uses (`src/shared/fielddiff.ts`). This file draws that answer and never works one out, so a
 * record's versions and its change log cannot disagree about which field moved.
 *
 * What this file does add is READABILITY of one difference: two long pieces of prose are lined up
 * word by word, and a difference whose two sides are both JSON is opened one key at a time with the
 * same shared walk. Where a text cannot be lined up — because it is too long to do it quickly — it
 * says so and shows both sides whole.
 */

import { useState } from 'react'
import { t, type WordKey } from '@shared/i18n.ts'
import { kindWord, readerWord, stateWord } from '@shared/words.ts'
import { TieredPress } from './TieredPress.tsx'
import { diffValues, partsInside, stepsOfPath, type FieldDiff } from '@shared/fielddiff.ts'
// THE DECLARATION `POST /api/records` VALIDATES AGAINST, which is also what `GET /api/kinds/:kind`
// serves. A field on a comparison is named from here, so the name on screen and the name an agent
// is handed are one string.
import { KIND_SPECS } from '@shared/kinds.ts'
// THE FOUR WORDS A SURFACE DRAWS INSTEAD OF SAYING ONLY WHO DID SOMETHING, the sentence that says
// who acted and where and when the owner said what they acted on, and the sentence that says who
// took an act back. All three are written once, in @shared/warrant.ts, and the forks desk, the
// waiting list and the record page draw the same three from there. See `whoseWordsThisStandsOn`.
import { ON_THE_OWNERS_WORDS, whoActedOnThoseWords, whoRevokedIt } from '@shared/warrant.ts'
import type { RecordKind } from '@shared/types.ts'
import type { OneRevision, RestoredRevision, RevisionEntry } from '../../server/lib/revisions.ts'
import { api, type ParticipantsReply } from '../api.ts'
import { washJumpTarget } from '../lib/motion.ts'
import { writerNamed } from '../lib/participant-lookup.ts'
import { useMode, type Mode } from '../lib/mode.ts'
import { InReachMark, reachBox, useReach } from './InReach.tsx'
import { actorTypeWord, provenanceWord, relationWord } from '../lib/words.ts'
// THE CHANGE LOG'S OWN SENTENCE FOR A CHANGE ROW AND A LINK ROW, asked for rather than written
// again here. See `whatHappened`.
import { changeVerb } from './ChangeLog.tsx'
import type { HistoryEvent } from '../../server/lib/history.ts'
import { Absence, Btn, ErrorNote, Field, Hint, Panel, ServerNote, Stamp, Tag, TextArea } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { declaredAttributes, type Declares } from './declares.ts'
// WHAT THIS SECTION IS CALLED, from the one place a section's title is written. See `historyControl`.
import { DRAWS_THE_NAME } from './agent/pointing.ts'

// ============================================================================ words for one entry

/**
 * WHAT ONE ENTRY IS, IN THE WORDS A READER GETS.
 *
 * The stored `op` is a database word — `baseline`, `create`, `update`, `restore`, `delete`,
 * `undelete` — and none of them goes to a screen raw. `told` is what the row says it is; `warn` is
 * true only for the one case a reader must not misread, the migration baseline.
 *
 * IT IS A PURE FUNCTION AND IT IS EXPORTED, so the sentence a person reads about a baseline is
 * testable without a browser. tests/putting-an-old-version-back.test.ts is where it is asserted.
 */
export function whatThisVersionIs(entry: { op: string; at: string }): { told: string; warn: boolean } {
  if (entry.op === 'baseline') {
    return { told: t('record.history.baseline'), warn: true }
  }
  if (entry.op === 'create') return { told: t('record.history.filed'), warn: false }
  if (entry.op === 'restore') return { told: t('record.history.putBackEntry'), warn: false }
  if (entry.op === 'delete') return { told: t('record.history.deletedEntry'), warn: false }
  if (entry.op === 'undelete') return { told: t('record.history.undeletedEntry'), warn: false }
  return { told: t('record.history.changedEntry'), warn: false }
}

/**
 * WHOSE WORDS ONE VERSION STANDS ON, AND WHETHER IT STILL STANDS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE VERSION HISTORY HAS TO SAY THIS AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * An agent may make a governance write it is otherwise refused when it can quote what the owner
 * said, and `design/messages/ACCEPTANCE.md` W2 asks that the act be marked *on the owner's words*
 * wherever the product would otherwise say only who did it. This panel is one of those places and it
 * is the one a person opens to read a trail. Until this it drew `agent · claude-code` and nothing
 * else, so a write made on their own sentence looked exactly like one an agent made on its own
 * authority. Problem `LUdiXkVMUGcr`.
 *
 * ---------------------------------------------------------------------------------------
 * FOUR ANSWERS, AND THE ORDER THEY ARE ASKED IN MATTERS
 * ---------------------------------------------------------------------------------------
 *
 * `took-one-back` FIRST. A revocation is written through the ordinary restore or the ordinary
 * delete, so its `op` says "an earlier version put back" and nothing says a person took an act
 * back. `revokesSeq` is the only thing on the row that does. It is asked first so that a revocation
 * can never be drawn as an act on somebody's words, whatever else the row carries.
 *
 * `taken-back` SECOND. An act the owner has revoked no longer stands, so the four words are not
 * drawn on it — they mean this write has the person's authority, and it has not any more. The person's words stay on
 * the row, because the trail stays: they are entitled to see what was done in their name and that it was
 * undone. The record page's own panel keeps a revoked act for the same reason.
 *
 * `on-the-persons-words` THIRD, and it is the ordinary act. `nobody` is the ordinary version and is almost
 * every row.
 *
 * NOT ONE SENTENCE HERE IS WRITTEN HERE. `ON_THE_OWNERS_WORDS`, `whoActedOnThoseWords` and
 * `whoRevokedIt` live in @shared/warrant.ts; the two sentences take their words from
 * `g2b.onYourWords.*` in the word lists, which is the one place they are written. The forks desk,
 * the waiting list and the record page draw them from there and this asks for the same three.
 * A copy here would be a fourth telling of one sentence, free to come to disagree with the other
 * three about what an act on their words is and about what taking one back means. The marks are the
 * only words this file chooses, and each is a phrase on a label rather than a sentence.
 *
 * IT IS A PURE FUNCTION AND IT IS EXPORTED, so what a person reads on the row is testable without a
 * browser.
 */
export type WhoseWords =
  | { at: 'nobody' }
  | { at: 'on-the-persons-words'; mark: string; said: string; words: string }
  | { at: 'taken-back'; mark: string; said: string; words: string }
  | { at: 'took-one-back'; mark: string; said: string }

export function whoseWordsThisStandsOn(
  entry: Pick<RevisionEntry, 'seq' | 'at' | 'warrant' | 'revokesSeq' | 'who'>,
  /**
   * EVERY VERSION IN THE LIST, so a row can see the later one that took it back.
   *
   * NOTHING IS LOST TO TRUNCATION. A revocation is always a LATER version than the act it revokes,
   * and the listing drops the oldest first, so an act that is in the list has its revocation in the
   * list too.
   */
  all: readonly Pick<RevisionEntry, 'seq' | 'at' | 'revokesSeq' | 'who'>[],
): WhoseWords {
  if (entry.revokesSeq !== null) {
    return {
      at: 'took-one-back',
      mark: t('record.history.tookBack', { seq: entry.revokesSeq }),
      said: revocationSentence(entry),
    }
  }
  if (entry.warrant === null) return { at: 'nobody' }
  const said = whoActedOnThoseWords({
    actorType: entry.who.actorType,
    actorId: entry.who.actorId,
    warrant: entry.warrant,
  })
  const undone = all.find((one) => one.revokesSeq === entry.seq)
  if (undone !== undefined) {
    return {
      at: 'taken-back',
      mark: t('record.history.takenBack', { seq: undone.seq }),
      said: `${said} ${revocationSentence(undone)}`,
      words: entry.warrant.words,
    }
  }
  return { at: 'on-the-persons-words', mark: ON_THE_OWNERS_WORDS, said, words: entry.warrant.words }
}

/** Who took an act back and when, in the sentence @shared/warrant.ts writes for every surface. */
function revocationSentence(revocation: Pick<RevisionEntry, 'at' | 'who'>): string {
  return whoRevokedIt({
    revokedByType: revocation.who.actorType,
    revokedById: revocation.who.actorId,
    revokedAt: revocation.at,
  })
}

/**
 * WHAT CHANGED BETWEEN THIS ENTRY AND THE ONE BEFORE IT.
 *
 * THREE ANSWERS, AND THE FIRST TWO ARE THE ONES THAT GET CONFUSED. Null means there is no earlier
 * version to compare with — NOBODY COULD LOOK. An empty list means two versions were compared and
 * nothing in them differed — SOMEBODY LOOKED AND THERE IS NONE. Drawing the first as the second is
 * a clean bill of health nobody established, so they come back as different answers and the row
 * hands them to `Absence`, which is the one component that draws that pair apart.
 */
export type WhatMoved =
  | { at: 'nothing-earlier'; word: string; said: string }
  | { at: 'nothing-differs'; word: string; said: string }
  | { at: 'moved'; word: string; said: string }

export function whatMovedHere(changed: readonly FieldDiff[] | null, mode: Mode = 'normal'): WhatMoved {
  if (changed === null) {
    return {
      at: 'nothing-earlier',
      word: t('record.history.nothingEarlier'),
      said: t('record.history.oldestReason'),
    }
  }
  if (changed.length === 0) {
    return {
      at: 'nothing-differs',
      word: t('record.history.nothingDiffers'),
      said: t('record.history.sameReason'),
    }
  }
  if (mode === 'normal') {
    const said = t('record.history.changeCount', { n: changed.length })
    return { at: 'moved', word: said, said }
  }
  const paths = changed.map((d) => d.path)
  const head = paths.slice(0, 4).join(', ')
  const said = changed.length <= 4 ? t('record.history.changedPaths', { paths: head }) : t('record.history.morePaths', { paths: head, n: changed.length - 4 })
  return { at: 'moved', word: said, said }
}

// ============================================================================ lining up two texts

/** A run of one text diff: kept by both, only in the older one, or only in the newer one. */
export interface WordRun {
  at: 'same' | 'gone' | 'new'
  text: string
}

/**
 * How many words this will line up before it says it cannot. Two 900-word bodies are 810,000 cells,
 * which is the point where a browser doing it on a keypress becomes noticeable.
 */
export const WORD_LIMIT = 900

/**
 * TWO PIECES OF PROSE, LINED UP WORD BY WORD, so a reader sees what moved rather than two walls.
 *
 * The longest common subsequence of the two word lists, walked back into runs. Whitespace travels
 * with the word before it, so putting the runs back together end to end gives each side exactly as
 * it was typed — no words joined, none lost.
 *
 * IT REFUSES RATHER THAN CRAWLS. Over `WORD_LIMIT` words on either side it answers null, and the
 * caller says in words that it showed both sides whole instead. A quiet fallback to "here are two
 * blobs" would leave a reader thinking nothing moved.
 */
export function lineUpWords(before: string, after: string): WordRun[] | null {
  const a = before.match(/\S+\s*/g) ?? []
  const b = after.match(/\S+\s*/g) ?? []
  if (a.length > WORD_LIMIT || b.length > WORD_LIMIT) return null

  // table[i][j] = length of the longest common subsequence of a.slice(i) and b.slice(j). One flat
  // array, because a row read out of an array of arrays is an index the type checker cannot follow
  // and every read would need a cast asserting what this loop already knows.
  const width = b.length + 1
  const table = new Int32Array((a.length + 1) * width)
  const cell = (i: number, j: number): number => table[i * width + j] as number
  const words = (xs: string[], i: number): string => (xs[i] as string).trim()
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        words(a, i) === words(b, j) ? cell(i + 1, j + 1) + 1 : Math.max(cell(i + 1, j), cell(i, j + 1))
    }
  }

  const runs: WordRun[] = []
  const push = (at: WordRun['at'], text: string): void => {
    const last = runs[runs.length - 1]
    if (last !== undefined && last.at === at) last.text += text
    else runs.push({ at, text })
  }
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (words(a, i) === words(b, j)) {
      push('same', a[i] as string)
      i += 1
      j += 1
    } else if (cell(i + 1, j) >= cell(i, j + 1)) {
      push('gone', a[i] as string)
      i += 1
    } else {
      push('new', b[j] as string)
      j += 1
    }
  }
  while (i < a.length) {
    push('gone', a[i] as string)
    i += 1
  }
  while (j < b.length) {
    push('new', b[j] as string)
    j += 1
  }
  return runs
}

// ============================================================================ drawing one difference

const LONG_ENOUGH_TO_LINE_UP = 60

/**
 * WHAT ONE FIELD IS CALLED, IN THE WORDS THE RECORD'S OWN KIND USES.
 *
 * A stored path names where a value sits: `data.blocks[#b-af-h].text`. A person reading a report
 * has no use for either `data` — which is where Mole Office keeps a kind's own fields — or for the
 * brackets. What they know the field by is `blocks`, because that is what `GET /api/kinds/report`
 * calls it, and this reads that same declaration rather than a name written down here.
 *
 * THE DESCRIPTION ON THE ROW IS THE SCHEMA'S OWN. It is served to an agent by that endpoint and
 * shown to a person here, from one string, so the two cannot come to say different things.
 */
/** The normal reading names prose and its structure. Stored wiring stays in developer mode. */
const HISTORY_FIELD_WORDS: Readonly<Record<string, WordKey>> = {
  'title': 'record.field.title',
  'summary': 'record.field.summary',
  'body': 'record.field.body',
  'context': 'record.field.context',
  'state': 'record.field.state',
  'kind': 'record.history.kind',
  'blocks': 'record.field.blocks',
  'summaryBlocks': 'record.field.summaryBlocks',
  'heading': 'record.field.heading',
  'text': 'record.field.text',
  'level': 'record.field.level',
  'caption': 'record.field.caption',
  'alt': 'record.field.alt',
  'items': 'record.field.items',
  'columns': 'record.field.columns',
  'rows': 'record.field.rows',
  'cells': 'record.field.cells',
  'label': 'record.field.label',
  'name': 'record.field.name',
  'date': 'record.field.date',
  'since': 'record.field.since',
  'symptom': 'record.field.symptom',
  'cause': 'record.field.cause',
  'fix': 'record.field.fix',
  'why_it_hurts': 'record.field.why_it_hurts',
  'how_to_tell_it_is_back': 'record.field.how_to_tell_it_is_back',
  'options': 'record.field.options',
  'attempts': 'record.field.attempts',
  'tried': 'record.field.tried',
  'found': 'record.field.found',
  'learned': 'record.field.learned',
  'outcome': 'record.field.outcome',
  'because': 'record.field.because',
  'also_waiting_on': 'record.field.also_waiting_on',
  'effort_hours': 'record.field.effort_hours',
  'why': 'record.field.why',
  'cost': 'record.field.cost',
  'currency': 'record.field.currency',
  'vendor': 'record.field.vendor',
  'needed_by': 'record.field.needed_by',
  'due': 'record.field.due',
  'condition': 'record.field.condition',
  'owedTo': 'record.field.owedTo',
  'what_proves_it_done': 'record.field.what_proves_it_done',
  'done': 'record.field.done',
  'fulfilledAt': 'record.field.fulfilledAt',
  'fulfilledNote': 'record.field.fulfilledNote',
  'evidence': 'record.field.evidence',
  'method': 'record.field.method',
  'measured': 'record.field.measured',
  'measured_on': 'record.field.measured_on',
  'numbers': 'record.field.numbers',
  'caveat': 'record.field.caveat',
  'what_would_prove_it_wrong': 'record.field.what_would_prove_it_wrong',
  'confidence': 'record.field.confidence',
  'retracted_because': 'record.field.retracted_because',
  'question': 'record.field.question',
  'recommendation': 'record.field.recommendation',
  'revisit_when': 'record.field.revisit_when',
  'resultWillBeUsedTo': 'record.field.resultWillBeUsedTo',
  'decided_on': 'record.field.decided_on',
  'alternatives_rejected': 'record.field.alternatives_rejected',
  'option_taken': 'record.field.option_taken',
  'words_since': 'record.field.words_since',
  'parked_because': 'record.field.parked_because',
  'would_need': 'record.field.would_need',
  'depth_reason': 'record.field.depth_reason',
  'what_is_not_known': 'record.field.what_is_not_known',
  'why_it_matters': 'record.field.why_it_matters',
  'next': 'record.field.next',
  'effort': 'record.field.effort',
  'saidInFull': 'record.field.saidInFull',
  'interpretation': 'record.field.interpretation',
  'notes': 'record.field.notes',
  'retiredBecause': 'record.field.retiredBecause',
  'doing': 'record.field.doing',
  'changed': 'record.field.changed',
  'remains': 'record.field.remains',
  'failed': 'record.field.failed',
  'drifted': 'record.field.drifted',
  'what': 'record.field.what',
  'substitute': 'record.field.substitute',
  'resolved_when': 'record.field.resolved_when',
  'allowed_uses': 'record.field.allowed_uses',
  'disallowed_claims': 'record.field.disallowed_claims',
  'objective': 'record.field.objective',
  'loss': 'record.field.loss',
  'expected': 'record.field.expected',
  'actual': 'record.field.actual',
  'direct_causes': 'record.field.direct_causes',
  'contributing_factors': 'record.field.contributing_factors',
  'corrective_actions': 'record.field.corrective_actions',
  'verification': 'record.field.verification',
  'sentence': 'record.field.sentence',
  'revoked_because': 'record.field.revoked_because',
  'state_at': 'record.field.state_at',
  'state_because': 'record.field.state_because',
  'says': 'record.field.says',
  'does': 'record.field.does',
  'whenToUse': 'record.field.whenToUse',
  'whenNotToUse': 'record.field.whenNotToUse',
  'costs': 'record.field.costs',
  'protects': 'record.field.protects',
  'entries': 'record.field.entries',
  'answerSays': 'record.field.answerSays',
  'quote': 'record.field.quote',
  'note': 'record.field.note',
  'reason': 'record.field.reason',
  'result': 'record.field.result',
}

export function historyFieldName(field: string): string | null {
  const key = HISTORY_FIELD_WORDS[field]
  return key === undefined ? null : t(key)
}

function readablePath(path: string): boolean {
  const steps = stepsOfPath(path.replace(/\[(?:#[^\]]*|\d+)\]/g, ''))
  const own = steps[0] === 'data' ? steps.slice(1) : steps
  return own.length === 0 || own.every(step => historyFieldName(step) !== null)
}

function pathName(path: string): string {
  const steps = stepsOfPath(path.replace(/\[(?:#[^\]]*|\d+)\]/g, '')).filter(step => step !== 'data')
  return steps.map(historyFieldName).filter((name): name is string => name !== null).join(' · ') || t('record.history.wholeValue')
}

function fieldWords(path: string, kind: RecordKind, mode: Mode): { name: string; said: string | undefined } {
  if (mode === 'normal') return { name: pathName(path), said: undefined }
  const steps = stepsOfPath(path)
  const ownFields = steps[0] === 'data'
  const rest = ownFields ? steps.slice(1) : steps
  const declared = ownFields ? KIND_SPECS[kind].fields.find((f) => f.key === rest[0]) : undefined
  return { name: rest.length === 0 ? t('record.history.wholeRecord') : rest.join(' · '), said: declared?.description }
}

/**
 * ONE FIELD THAT MOVED, drawn the way that field can be read.
 *
 * Three shapes, and the row says which one it used:
 *   - both sides are JSON objects or arrays  -> the keys inside them that differ, by the shared walk
 *   - both sides are text and one is long    -> lined up word by word
 *   - anything else                          -> what each version held, side named by its number
 */
function OneDifference({ diff, kind, from, to }: { diff: FieldDiff; kind: RecordKind; from: number; to: number }) {
  // THE SHARED WALK DECIDES, NOT THIS FILE. `diffValues` parses both sides, answers with the keys
  // that differ when they are both structured, and answers null when they are not — which is the
  // signal to draw them as text. Asking that question here as well would be the same fact worked
  // out in two places.
  const mode = useMode()
  const inner = diffValues(diff.before, diff.after)?.filter(part => mode === 'inspect' || readablePath(part.path)) ?? null
  const named = fieldWords(diff.path, kind, mode)

  return (
    <li className="rh-diff">
      <div className="rh-diff-head">
        <span className="rh-name" title={named.said}>
          {named.name}
        </span>
        {diff.kind === 'added' ? <Tag tone="quiet">{t('record.history.added')}</Tag> : null}
        {diff.kind === 'removed' ? <Tag tone="quiet">{t('record.history.removed')}</Tag> : null}
      </div>
      {inner !== null ? (
        inner.length === 0 ? (
          <Absence />
        ) : (
          <ul className="rh-inner">
            {inner.map((d) => (
              <li key={d.path} className="rh-inner-row">
                <span className="rh-name">{mode === 'inspect' ? (d.path === '' ? t('record.history.wholeValue') : stepsOfPath(d.path).join(' · ')) : pathName(d.path)}</span>
                <SidesOf before={comparisonValue(d.before, [diff.path, d.path].filter(Boolean).join('.'), mode)} after={comparisonValue(d.after, [diff.path, d.path].filter(Boolean).join('.'), mode)} from={from} to={to} />
              </li>
            ))}
          </ul>
        )
      ) : (
        <SidesOf before={comparisonValue(diff.before, diff.path, mode)} after={comparisonValue(diff.after, diff.path, mode)} from={from} to={to} />
      )}
    </li>
  )
}

function comparisonValue(value: string | null, path: string, mode: Mode): string | null {
  if (mode === 'inspect' || value === null) return value
  if (path === 'kind') return kindWord(value).text
  if (path === 'data.state' || path === 'state') return stateWord(value).text
  return value
}

/**
 * WHAT EACH OF THE TWO VERSIONS HELD, each side labelled with its own version number.
 *
 * The labels used to be `was` and `now`, and one line at the top of the whole comparison said which
 * was which. That line was the broken sentence step 58 found. Naming each side by its number needs
 * no line, and it is right on every row rather than once for the list.
 *
 * Two long pieces of prose are still lined up word by word instead, because reading the same 400
 * words twice to find the three that moved is worse than either label.
 */
function SidesOf({
  before,
  after,
  from,
  to,
}: {
  before: string | null
  after: string | null
  from: number
  to: number
}) {
  if (before !== null && after !== null) {
    const worthLiningUp = before.length > LONG_ENOUGH_TO_LINE_UP || after.length > LONG_ENOUGH_TO_LINE_UP
    const runs = worthLiningUp ? lineUpWords(before, after) : null
    if (runs !== null) {
      return (
        <>
          {/* THE KEY, MADE OF THE SAME TWO MARKS THE PARAGRAPH USES. Struck through is what version
              `from` had and nothing else does; underlined is what version `to` has. A sentence
              saying that would be the sentence this change deleted. */}
          <p className="rh-legend">
            <span className="rh-word-gone">{t('record.history.sideVersion', { seq: from })}</span>
            <span className="rh-word-new">{t('record.history.sideVersion', { seq: to })}</span>
          </p>
          <p className="rh-lineup prose">
            {runs.map((run, index) => (
              <span
                key={`${String(index)}-${run.at}`}
                className={run.at === 'same' ? 'rh-same' : run.at === 'gone' ? 'rh-word-gone' : 'rh-word-new'}
              >
                {run.text}
              </span>
            ))}
          </p>
        </>
      )
    }
    if (worthLiningUp) {
      return (
        <>
          <OneSide tag={t('record.history.sideVersion', { seq: from })} value={before} />
          <OneSide tag={t('record.history.sideVersion', { seq: to })} value={after} />
        </>
      )
    }
  }
  return (
    <>
      <OneSide tag={t('record.history.sideVersion', { seq: from })} value={before} />
      <OneSide tag={t('record.history.sideVersion', { seq: to })} value={after} />
    </>
  )
}

/**
 * ONE VERSION'S SIDE OF ONE FIELD: which version it is, and what it held.
 *
 * A STRUCTURED VALUE IS OPENED UP RATHER THAN PRINTED. `partsInside` is the shared reader and it
 * answers with what the value holds, key by key, so a block that was added shows its heading and
 * its text instead of the object they sit in. Before this, a value with no other side to compare
 * against went through `JSON.stringify` and a reader got a wall of braces.
 *
 * NULL IS ITS OWN ANSWER and it is not an empty value: the field is not in this version at all.
 */
function OneSide({ tag, value }: { tag: string; value: string | null }) {
  const mode = useMode()
  const parts = partsInside(value)?.filter(part => mode === 'inspect' || readablePath(part.path)) ?? null
  return (
    <div className="rh-side">
      <span className="rh-side-tag">{tag}</span>
      {value === null ? (
        <Absence />
      ) : parts !== null ? (
        <ul className="rh-parts">
          {parts.length === 0 ? <li><Absence /></li> : null}
          {parts.map((part) => (
            <li key={part.path} className="rh-part">
              <span className="rh-name">{mode === 'inspect' ? (part.path === '' ? t('record.history.holds') : stepsOfPath(part.path).join(' · ')) : pathName(part.path)}</span>
              <span className="rh-part-said prose">{mode === 'normal' && (part.text === 'true' || part.text === 'false') ? t(part.text === 'true' ? 'record.history.yes' : 'record.history.no') : part.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <span className="rh-part-said prose">{mode === 'normal' && (value === 'true' || value === 'false') ? t(value === 'true' ? 'record.history.yes' : 'record.history.no') : value}</span>
      )}
    </div>
  )
}

// ============================================================================ one whole version

/** One version's stored content, as it was: title, summary, and every field it held. */
function VersionContent({ shown }: { shown: OneRevision }) {
  const mode = useMode()
  const entries = Object.entries(shown.content.data).filter(([key]) => mode === 'inspect' || historyFieldName(key) !== null)
  return (
    <div className="rh-content">
      <p className="rh-field">
        <span className="rh-field-name" data-title-is="its-label">{t('record.history.title')}</span>
        <span className="wrap-anywhere">{shown.content.title}</span>
      </p>
      <p className="rh-field">
        <span className="rh-field-name" data-title-is="its-label">{t('record.history.summary')}</span>
        {shown.content.summary === null ? (
          <Absence title={t('record.history.noSummary')} />
        ) : (
          <span className="wrap-anywhere">{shown.content.summary}</span>
        )}
      </p>
      <p className="rh-field">
        <span className="rh-field-name" data-title-is="its-label">{t('record.history.kind')}</span>
        <span>{kindWord(shown.content.kind, mode).text}</span>
      </p>
      {entries.length === 0 ? (
        <Absence title={t('record.history.noFields')} />
      ) : (
        entries.map(([key, value]) => (
          <div key={key} className="rh-field rh-field-block">
            <span className="rh-field-name" data-title-is="its-label">{mode === 'inspect' ? key : historyFieldName(key)}</span>
            {typeof value === 'string' ? (
              <span className="rh-stored prose wrap-anywhere">{key === 'state' ? readerWord(value, mode, shown.content.kind).text : value}</span>
            ) : (
              // WHAT WAS STORED, AS IT WAS STORED. A structured field drawn as though it were the
              // live record would be this panel pretending to be the page; this is the version's
              // own content and it is shown as content rather than summarised.
              mode === 'inspect' ? <StoredValue value={value} /> : <OneSide tag="" value={JSON.stringify(value)} />
            )}
          </div>
        ))
      )}
      {shown.content.deletedAt === null ? null : (
        <p className="rh-note">{t('record.history.whileDeleted')}</p>
      )}
    </div>
  )
}

// ============================================================================ putting one back

/**
 * A STRUCTURED FIELD OF AN OLD VERSION, DRAWN AS IT WAS STORED.
 *
 * IT WRAPS RATHER THAN SCROLLING SIDEWAYS, so nothing goes off the right of a box whose scrollbar is
 * 0px wide on this platform. What is left is the 24em cap, which does hide the foot of a long value,
 * and that bottom edge carries the mark. See components/InReach.tsx.
 */
function StoredValue({ value }: { value: unknown }) {
  const written = JSON.stringify(value, null, 2)
  const reach = useReach(written)
  return (
    <InReachMark reach={reach}>
      <pre className="rh-json" {...reachBox(reach, t('record.history.storedValue'))}>
        {written}
      </pre>
    </InReachMark>
  )
}

/**
 * PUT THIS VERSION BACK — the confirm, the optional reason, and what the server says it did.
 *
 * The sentence a reader gets afterwards is THE SERVER'S OWN. This component does not restate what
 * happened in its own words: the reply already says which version was put back, what number the new
 * one has, what moved, and — when it applies — that the delete stamp was left alone or that a
 * pipeline's blocks were renamed with it. A second telling here could disagree with the first.
 */
function PutBack({
  recordId,
  seq,
  onDone,
}: {
  recordId: string
  seq: number
  /**
   * Handed the whole reply, because THE PANEL KEEPS IT AND THIS COMPONENT CANNOT.
   *
   * A put-back re-reads the list and re-reads the record, and both of those replace the row this
   * button sits in — so a reply held here was mounted and unmounted in the same frame, and the one
   * sentence saying what the write actually did was never on screen long enough to read. Measured
   * in a browser on 20 August 2026: `saidAfterwards` came back null with the write plainly done.
   * The same defect is written up at the top of RecordPage.tsx for the whole page.
   */
  onDone: (reply: RestoredRevision) => void
}) {
  const [why, setWhy] = useState('')
  return (
    <div className="rh-put-back">
      <details>
        <summary>{t('record.history.why')}</summary>
        <Field label={t('record.history.why')}>
          <TextArea value={why} onChange={setWhy} rows={2} />
        </Field>
      </details>
      <TieredPress tier="confirm" size="sm" press={t('record.history.putBack')} confirm={t('record.history.putConfirm', { seq })}
        pending={t('record.history.putting')} question={t('record.history.putQuestion', { seq })}
        quote={t('record.history.version', { seq })} warning={t('record.history.putWarning', { seq })}
        cancel={t('record.history.leave')} onPress={async () => {
          const note = why.trim()
          const reply = await api.putRevisionBack(recordId, seq, note === '' ? undefined : { note })
          onDone(reply)
        }} />
    </div>
  )
}

// ============================================================================ the panel

export interface RecordHistoryProps {
  recordId: string
  /**
   * Everybody the registries hold, so a version and an event name their writer as a person knows them
   * (`writerNamed`, wave 13k round 34) rather than as "person" or "agent".
   */
  participants?: ParticipantsReply
  /** What kind of record this is. The kind's own schema is what names the fields a comparison lists. */
  kind: RecordKind
  /**
   * The version the record holds RIGHT NOW, or null when the ledger holds nothing with the content
   * on screen.
   *
   * IT IS THE SERVER'S ANSWER, not "the highest number in the list". `revisionSeq` on a record read
   * is asked of the ledger by content, so it really is the version this reader is looking at. Null
   * is a real state — a row edited outside the product, a database restored over the top — and this
   * panel says so instead of pointing at the newest row and calling it now.
   */
  nowSeq: number | null
  /** Redrawn whenever the record is written, so the list is re-read after a put-back. */
  changedAt: string
  /** True when the page is in its editing state. Putting a version back is a change to the record. */
  editable: boolean
  /**
   * TRUE WHEN THE EDIT PRESS AT THE TOP OF THE PAGE OPENS EDITING RIGHT NOW.
   *
   * Normal mode's one sentence in this panel tells the reader to press it, so the sentence is drawn only when
   * that press is there to be pressed. The page hands down the same answer that draws the press,
   * `theEditPressOpensEditing` in RecordPage.tsx, so the sentence and the press cannot disagree.
   */
  editPressOpensEditing: boolean
  /** Called after a put-back, so the page around this panel re-reads the record. */
  onChanged: () => void
  /**
   * TRUE WHEN THE ADDRESS ASKED FOR THIS SECTION: `#/r/<id>/history`.
   *
   * The versions of a record are a named section of the record's page, so an address can open them
   * — the same way an address says whether the page is being read or written in. It opens the fold
   * and moves the keyboard to it; it does not make a second page. See RECORD_SECTIONS in router.tsx
   * for what may follow a record's id.
   *
   * It is the STARTING state and not a lock: a reader who closes the fold has closed it, and the
   * address is not rewritten under them.
   */
  openAtLoad?: boolean
  /**
   * HOW MANY VERSIONS THIS RECORD HAS, out of the record read the page already holds.
   *
   * It is a prop and not something this panel counts, because the control has to be truthful in the
   * frame before the revisions listing has landed. Handed down, the word `History` and its numeral
   * are drawn from the same server statement the section's own line is; counted here, they would be
   * two readings of one fact that can disagree for as long as a fetch takes.
   */
  versions: number
  /**
   * TRUE WHEN THE ONE VERSION THIS RECORD HAS IS THE ROW THE LEDGER BACKFILL WROTE.
   *
   * This panel used to work this out itself — `count === 1 && revisions[0]?.op === 'baseline'` — off
   * the listing. That is the second computation of a fact the server now states, from a second read,
   * and it is deleted rather than left beside the prop: the badge on the control and the first line
   * of the section have to be the same answer.
   */
  baselineOnly: boolean
  /**
   * WHAT THIS FOLD IS — the record's provenance section, or nothing.
   *
   * It is handed down rather than built here because this component knows the record's id and kind
   * and not its stored data, and whether a record HAS a section is a reading of that data. The page
   * that already has the record asks `sectionsOf` once and hands the answer to every panel that
   * draws one of its sections, so there is one reader of that question on a record page.
   */
  declares: Declares
}

/**
 * WHAT THE `History` CONTROL SAYS, on every kind, out of three facts and never out of one.
 *
 * A single number would be false on half the pages in the owner's corpus. Measured 26 August 2026
 * on a copy by `tools/measure-the-history.mjs`: 361 of 707 records have exactly one revision, and
 * its `op` is `baseline` — the row written the day Mole Office started keeping versions, holding what the
 * record still holds. `History 1` there sends a reader to look at the page they came from.
 *
 * `nowSeq` is the third fact and it splits the baseline case in two: when the ledger holds nothing
 * with the content on screen, the one stored version is NOT what this record holds, so there really
 * is something behind the control and the numeral is true again.
 *
 * THE WORD IS THE SECTION'S DECLARED TITLE AND IS NOT WRITTEN IN THIS FILE. It used to be the
 * literal `History`, typed at four places here, while `SectionSpec.title` for `HISTORY_KEY` read
 * *How this record got here* — one fact in two places, free to disagree, and they did. Measured in
 * a browser on 2 September 2026: the fold on `OOOt4Kouc5dT` read *History 8*, the review pane called
 * a comment left on that fold *the section “How this record got here”*, and a reader looking for
 * that heading could not find it on the page. `titleHere` is the one reader of the declaration and
 * the caller passes what it says.
 *
 * Exported, and pure, so the table can be walked by a test rather than photographed.
 */
export function historyControl(facts: {
  /** What this section is called: `titleHere(kind, HISTORY_KEY)` and never a word typed here. */
  title: string
  versions: number
  baselineOnly: boolean
  nowSeq: number | null
}): {
  /** The word, and the numeral when there is a true one. This is what a reader sees. */
  label: string
  /** The numeral, or null when there is none to draw. */
  badge: number | null
  /** What a screen reader says. It never repeats the label; it says what is behind it. */
  accessibleName: string
} {
  const { title, versions, baselineOnly, nowSeq } = facts
  if (versions === 0) {
    return { label: title, badge: null, accessibleName: t('record.history.noVersions', { title }) }
  }
  if (versions === 1 && baselineOnly && nowSeq !== null) {
    return {
      label: title,
      badge: null,
      accessibleName: t('record.history.oneBaseline', { title }),
    }
  }
  if (versions === 1 && baselineOnly) {
    return {
      label: t('record.history.labelCount', { title, n: 1 }),
      badge: 1,
      accessibleName: t('record.history.oneOther', { title }),
    }
  }
  if (versions === 1) {
    return {
      label: t('record.history.labelCount', { title, n: 1 }),
      badge: 1,
      accessibleName: t('record.history.oneVersion', { title }),
    }
  }
  return {
    label: t('record.history.labelCount', { title, n: versions }),
    badge: versions,
    accessibleName: t('record.history.versionCount', { title, n: versions }),
  }
}

/**
 * MOVE THE READER TO THE SECTION THE ADDRESS NAMED, once, as it mounts.
 *
 * A section that opens 17,000px down a report is a section the address did not really open, so
 * `#/r/<id>/history` scrolls to it and puts the keyboard on its own summary. The next Tab then
 * continues from the section rather than from the top of the page.
 *
 * It runs from a ref callback, which React calls once when the element appears. Nothing here
 * changes the address: a reader who then closes the fold has closed it.
 */
function goToTheSection(el: HTMLDetailsElement | null): void {
  if (el === null) return
  el.scrollIntoView({ block: 'start' })
  washJumpTarget(el)
  const summary = el.querySelector('summary')
  if (summary instanceof HTMLElement) summary.focus({ preventScroll: true })
}

/**
 * THE VERSIONS OF ONE RECORD, on the record's own page, with no way in from a settings screen.
 *
 * The list is read on load rather than when the fold is opened, because the line a person reads
 * before opening anything — *4 versions kept* — is a fact about this record and has to be true.
 */
export function RecordHistory({
  recordId,
  kind,
  nowSeq,
  changedAt,
  editable,
  editPressOpensEditing,
  onChanged,
  openAtLoad,
  versions,
  baselineOnly,
  declares,
  participants,
}: RecordHistoryProps) {
  /* THE PROVENANCE SECTION IS ONE REGION AND IT IS DRAWN BY THIS ONE ELEMENT, in all three of this
     fold's states — reading, failed, and the list. Two elements carrying one region id would be two
     places a stored comment's mark could be painted, and `MarkLayer` finds a mark's element with
     `document.querySelector`, which takes the first. So the change log lower down the page stays
     see-through: it is inside the same section and the walk reaches this fold's answer through the
     record, which is what "root only as the final fallback" means. */
  const saysWhatItIs = declaredAttributes(declares)
  const control = historyControl({ title: t('record.history.history'), versions, baselineOnly, nowSeq })
  const mode = useMode()
  const [listing, readAgain] = useProjectAsync(async () => await api.revisions(recordId), [recordId, changedAt])
  const [openSeq, setOpenSeq] = useState<number | null>(null)
  const [compareSeq, setCompareSeq] = useState<number | null>(null)
  /** What the last put-back did, kept HERE so it survives the list re-reading itself. */
  const [did, setDid] = useState<RestoredRevision | null>(null)

  if (listing.status === 'loading') {
    return (
      <details className="rh-fold" {...saysWhatItIs}>
        <style href="mole-office-record-history" precedence="default">
          {RECORD_HISTORY_CSS}
        </style>
        {/* THE CONTROL IS ALREADY TRUE HERE. Its word and its numeral come from the record read the
            page is holding, so a reader looking for the history finds it in the first frame rather
            than after a second request lands. Only what is BEHIND it is still being read. */}
        <summary aria-label={control.accessibleName}>{control.label} — {t('record.history.readingList')}</summary>
      </details>
    )
  }
  if (listing.status === 'error') {
    return (
      <div className="rh-fold rh-fold-failed" {...saysWhatItIs}>
        <style href="mole-office-record-history" precedence="default">
          {RECORD_HISTORY_CSS}
        </style>
        <ErrorNote message={listing.message} fault={listing.fault} label={t('record.history.versionsFailed')} retry={readAgain} />
      </div>
    )
  }

  const { count, revisions, truncated, limit } = listing.value

  return (
    /* `open` RATHER THAN `defaultOpen`, WHICH `<details>` DOES NOT HAVE, and it is deliberately not
       a controlled value: React sets the attribute on the first render and the browser owns the
       fold from then on, so a reader who closes it has closed it. The address is not rewritten
       under them either — nothing here calls `navigate`. */
    <details
      className="rh-fold"
      data-versions={String(count)}
      open={openAtLoad === true}
      ref={openAtLoad === true ? goToTheSection : undefined}
      {...saysWhatItIs}
    >
      <style href="mole-office-record-history" precedence="default">
        {RECORD_HISTORY_CSS}
      </style>
      {/* ONE WORD, ON EVERY KIND, AND THE OWNER LOOKED FOR IT.

          It used to read "4 versions kept — see what this record held before, and put a version
          back", which is a sentence about revisions written by somebody who already knows what a
          revision is. The word they went looking for was `History`, and the product had spent it on
          the change log lower down this page and then taken it away again.

          THE NUMERAL IS NOT ALWAYS DRAWN, and that is the point of `historyControl`. On a record
          whose one version is the backfill's own row there is nothing behind the number, so there
          is no number. */}
      <summary aria-label={control.accessibleName}>
        {/* WHAT THE COMPOSER CALLS THIS SECTION, which is what the control already calls it. Without
            the mark the chip read the first heading inside the fold and said "Versions of this
            record" — one of the two panels in here — about a press on the section that holds both. */}
        <span {...DRAWS_THE_NAME}>{control.label}</span>
        {t('record.history.joint')}{t(baselineOnly ? 'record.history.seeBaseline' : count === 1 ? 'record.history.seeCurrent' : 'record.history.seeEarlier')}
      </summary>

      <Panel
        declares={{ surface: null }}
        titleIs="label" title={t('record.history.versions')}
        rank={2}
        actions={
          <>
            {/* ONLY WHERE IT IS TRUE: there is an earlier version to put back, and the press it names opens editing. */}
            {count > 1 && editPressOpensEditing ? <Hint>{t('record.history.pressEditToPutBack')}</Hint> : null}
            <Tag tone="quiet">{count}</Tag>
          </>
        }
      >
        {/* WHEN NO VERSION HOLDS WHAT THE RECORD HOLDS NOW, a plain state line says so, in both modes,
            because that changes what the list can do. */}
        {nowSeq === null ? <p className="rh-says">{t('record.history.inNoVersion')}</p> : null}
        {did === null ? null : (
          <div className="rh-did">
            {/* THE SERVER'S OWN SENTENCE, not a second telling of it. The reply already says which
                version was put back, what number the new one has, what moved, and — where they
                apply — that the delete stamp was left alone or that a pipeline's blocks moved with
                its title. A restatement here could disagree with it. */}
            <p className="rh-did-said">{did.newSeq === null ? t('record.history.putUnchanged', { seq: did.putBack }) : t('record.history.putDone', { seq: did.putBack, newSeq: did.newSeq })}</p>
            <ServerNote text={did.note} />
            {did.changed.length === 0 ? null : (
              <p className="rh-note">{whatMovedHere(did.changed, mode).said}</p>
            )}
            {did.throughKindChange === undefined ? null : <p className="rh-note">{t('record.history.kindChanged', { from: kindWord(did.throughKindChange.from).text, to: kindWord(did.throughKindChange.to).text })}</p>}
            {did.deletedStateUntouched === undefined ? null : (
              <>
                <p className="rh-note">{t('record.history.deletionUnchanged')}</p>
                <ServerNote text={did.deletedStateUntouched.whatToSend} />
              </>
            )}
          </div>
        )}
        {truncated ? (
          <p className="rh-note">
            {t('record.history.listed', { n: count, limit })}
          </p>
        ) : null}

        {revisions.length === 0 ? (
          <Absence />
        ) : (
          <ul className="rh-list">
            {revisions.map((entry) => (
              <VersionRow
                key={entry.seq}
                entry={entry}
                all={revisions}
                recordId={recordId}
                recordKind={kind}
                nowSeq={nowSeq}
                mode={mode}
                participants={participants}
                editable={editable}
                open={openSeq === entry.seq}
                comparing={compareSeq === entry.seq}
                onOpen={() => setOpenSeq(openSeq === entry.seq ? null : entry.seq)}
                onCompare={() => setCompareSeq(compareSeq === entry.seq ? null : entry.seq)}
                onPutBack={(reply) => {
                  setDid(reply)
                  readAgain()
                  onChanged()
                }}
              />
            ))}
          </ul>
        )}
      </Panel>

      {/* AND EVERYTHING ELSE THAT HAPPENED, which the versions list cannot show. A module's claims
          moving writes no revision, so a reader looking for it here found nothing at all until this
          panel. See `WhatHappenedHere`. */}
      <WhatHappenedHere recordId={recordId} changedAt={changedAt} participants={participants} />
    </details>
  )
}

/**
 * WHAT ONE STORED ROW SAYS, IN THE WORDS A READER GETS.
 *
 * FOUR TABLES AND NOT ONE OF THEM GOES TO A SCREEN RAW. `op` is `create`, `baseline`, `link`,
 * `implements`; `field` is a field path, a link type or a file pattern. Every one goes through a
 * reader the product already has, so this adds no vocabulary:
 *
 *   revisions             `whatThisVersionIs`, the same sentence the versions list draws
 *   changes and links     `changeVerb`, the same sentence the change log draws
 *   implementation_map    `relationWord`, which names an unknown relation out loud
 *
 * IT IS A PURE FUNCTION AND IT IS EXPORTED, so the sentence is testable without a browser.
 */
export function whatHappened(event: HistoryEvent, mode: Mode = 'normal'): string {
  if (event.source.table === 'revisions') return whatThisVersionIs(event).told
  if (event.source.table === 'implementation_map') {
    const relation = relationWord(event.op, mode)
    if (mode === 'normal') return t('record.history.codeRelation', { relation: relation.text })
    const pattern = event.field ?? null
    return pattern === null
      ? t('record.history.codeUnnamed', { relation: relation.text })
      : t('record.history.codePattern', { relation: relation.text, pattern })
  }
  // A change row and a link row read the same way and the change log already says how. `field` on
  // an update is a path and on a link row is the link type; `changeVerb` knows which is which.
  return changeVerb({ op: event.op, field: mode === 'normal' && event.op === 'update' ? null : event.field }, mode)
}

/**
 * WHO SAID IT. Two vocabularies, because two tables mean different things by the same column.
 *
 * On a revision, a change row or a link row, `who.actorType` is an actor type — `person`, `agent`,
 * `system`. On a row of the implementation map it is the row's PROVENANCE — where the claim came
 * from — because that is what `history.ts` puts there. Reading a provenance with the actor reader
 * would print *unknown actor: observed_write* about a row Mole Office understands perfectly.
 */
export function whoSaidIt(event: HistoryEvent, mode: Mode = 'normal', participants?: ParticipantsReply): string {
  // BY NAME IN NORMAL MODE (wave 13k round 34). A revision, a change row and a link row store who wrote
  // them, and "person" was the kind where the writer belongs. A map row's column is a provenance, not
  // a writer, so it keeps its word.
  if (mode === 'normal' && event.source.table !== 'implementation_map' && event.who.actorId !== '') {
    return writerNamed(event.who, participants)
  }
  const word = event.source.table === 'implementation_map' ? provenanceWord(event.who.actorType, mode) : actorTypeWord(event.who.actorType, mode)
  // ` · ` IS THIS PRODUCT'S OWN SEPARATOR for two facts on one meta line — the change log already
  // draws `person · <id>`. Without it the two ran together as one phrase: *somebody said so
  // system:module-claims-migration*, read on the owner's own corpus at 390.
  return mode === 'normal' || event.who.actorId === '' ? word.text : `${word.text} · ${event.who.actorId}`
}

/**
 * EVERYTHING THAT HAPPENED HERE, FROM THE READ THAT HAD NO SCREEN.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/records/<id>/history` answers with dated, attributed events, including where a module's
 * claims went. It landed in the wave titled *History a person can find* and nothing in the browser
 * called it: `grep -rn '/history' src/web/` found only the address fragment for the section this
 * panel now sits in, which is served by a different route. So the answer was real and reachable
 * only with curl.
 *
 * IT SITS BESIDE THE VERSIONS AND NOT INSTEAD OF THEM. They answer different questions and the
 * difference is the scope: a version is this record's own content at a time; an event is any stored
 * row about this record or about a block it carries. A module's claims moving writes no revision at
 * all, so the versions list is honestly silent about it and this is where it shows up.
 *
 * NOTHING HERE IS COUNTED TWICE. The rows are the server's, in the server's order, and the sentence
 * saying what was looked at is the server's own — printed as written rather than retold.
 */
function WhatHappenedHere({ recordId, changedAt, participants }: { recordId: string; changedAt: string; participants?: ParticipantsReply }) {
  const mode = useMode()
  const [reading, readAgain] = useProjectAsync(async () => await api.recordHistory(recordId), [recordId, changedAt])

  if (reading.status === 'loading') {
    return (
      <Panel declares={{ surface: null }} titleIs="label" title={t('record.history.events')} rank={2}>
        <p className="rh-note">{t('record.history.readingEvents')}</p>
      </Panel>
    )
  }
  if (reading.status === 'error') {
    return (
      <Panel declares={{ surface: null }} titleIs="label" title={t('record.history.events')} rank={2}>
        <ErrorNote
          message={reading.message}
          fault={reading.fault}
          label={t('record.history.eventsFailed')}
          retry={readAgain}
        />
      </Panel>
    )
  }

  const { events, read } = reading.value

  return (
    <Panel
      declares={{ surface: null }}
      titleIs="label" title={t('record.history.events')}
      rank={2}
      actions={<Tag tone="quiet">{events.length}</Tag>}
    >
      {/* WHAT WAS READ, IN DEVELOPER MODE ONLY: the server's own sentence, which tables were read and what
          it does not invent. */}
      <ServerNote text={read.sources} />
      {events.length === 0 ? (
        <Absence />
      ) : (
        <ul className="rh-happened">
          {events.map((event) => (
            <li key={`${event.source.table}:${event.source.id}`}>
              <span className="rh-happened-said">{whatHappened(event, mode)}</span>
              <span className="rh-happened-meta">
                <Stamp at={event.at} />
                <span>{whoSaidIt(event, mode, participants)}</span>
                {/* ON WHAT. Drawn only when the row is about something else — a block this record
                    carries, or a pipeline whose order gained or lost one. On this record's own rows
                    it would repeat the page's own title on every line. */}
                {event.because === 'itself' ? null : <span className="rh-happened-on">{t('record.history.on', { title: event.subject.title })}</span>}
                {mode === 'inspect' ? (
                  <span className="rh-happened-row">
                    {event.source.table} {event.source.id}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/**
 * One version in the list: what it is, what moved, and the three things a person can do with it.
 *
 * EXPORTED FOR THE SAME REASON `WhatChanged` IS: what one row says a person reads, and it is
 * asserted by rendering it rather than by reading this file.
 */
export function VersionRow({
  entry,
  all,
  recordId,
  recordKind,
  nowSeq,
  mode,
  participants,
  editable,
  open,
  comparing,
  onOpen,
  onCompare,
  onPutBack,
}: {
  entry: RevisionEntry
  /** Everybody the registries hold, so the version names its writer (`writerNamed`). */
  participants?: ParticipantsReply
  /** Every version listed, so this row can see the later one that took it back. */
  all: readonly RevisionEntry[]
  recordId: string
  recordKind: RecordKind
  nowSeq: number | null
  mode: Mode
  editable: boolean
  open: boolean
  comparing: boolean
  onOpen: () => void
  onCompare: () => void
  onPutBack: (reply: RestoredRevision) => void
}) {
  const says = whatThisVersionIs(entry)
  const moved = whatMovedHere(entry.changed, mode)
  const stood = whoseWordsThisStandsOn(entry, all)
  const isNow = nowSeq !== null && nowSeq === entry.seq

  return (
    <li className="rh-row" data-seq={String(entry.seq)}>
      <div className="rh-row-head">
        <span className="rh-seq">{t('record.history.version', { seq: entry.seq })}</span>
        {isNow ? <Tag tone="accent">{t('record.history.current')}</Tag> : null}
        {says.warn ? <Tag tone="warn">{t('record.history.notOriginal')}</Tag> : null}
        <Stamp at={entry.at} />
        <span className="rh-who">
          {/* WHO WROTE THIS VERSION, BY NAME (wave 13k round 34). It said "person" or "agent", the kind of
              writer where the writer belongs; developer mode keeps the kind and the stored id. */}
          {mode === 'inspect' ? `${actorTypeWord(entry.who.actorType, mode).text} · ${entry.who.actorId}` : writerNamed(entry.who, participants)}
        </span>
        {/* AND ON WHOSE WORDS, BESIDE WHO. The four words come from @shared/warrant.ts, which is
            where the forks desk and the waiting list take the same four from. This row is where a
            person comes to read a trail, so saying only who wrote a version leaves out the half
            that says whether the writer had the authority to. See `whoseWordsThisStandsOn`. */}
        {stood.at === 'nobody' ? null : (
          <Tag tone={stood.at === 'on-the-persons-words' ? 'ask' : 'quiet'}>{mode === 'inspect' ? stood.mark : stood.at === 'on-the-persons-words' ? t('record.history.normalWarrant') : t('record.history.normalRevoked')}</Tag>
        )}
      </div>
      {/* THEIR OWN SENTENCE, ON THE ROW, DRAWN WHOLE. A summary or a link would break the one check
          the warrant exists for — them reading what they said beside the act and saying it is not what
          they said — while looking exactly like it working. This is the record page's own pattern:
          Mole Office's sentence in ordinary text, and their words as a quotation marked as somebody
          else's, so a reader can tell the two apart. See components/OnYourWords.tsx. */}
      {stood.at === 'nobody' ? null : (
        <div className="rh-words-said">
          {mode === 'inspect' ? <p className="rh-said">{stood.said}</p> : null}
          {stood.at === 'took-one-back' ? null : (
            <blockquote className="rh-words px-owner-words">{stood.words}</blockquote>
          )}
        </div>
      )}
      <div className="rh-said">{says.told}</div>
      {entry.note === null ? null : <p className="rh-said rh-why">{entry.note}</p>}
      <p className="rh-moved">
        {moved.at === 'moved' ? (
          moved.said
        ) : (
          // NOBODY COULD LOOK versus SOMEBODY LOOKED AND FOUND NONE, drawn apart by the one
          // component that draws that pair apart. The whole sentence survives on the tooltip.
          <Absence tier={moved.at === 'nothing-earlier' ? 'told-apart' : 'ordinary'} looked={moved.at === 'nothing-differs'} word={moved.at === 'nothing-earlier' ? moved.word : undefined} title={moved.said} />
        )}
      </p>

      <div className="rh-acts">
        <Btn size="sm" variant="ghost" onClick={onOpen}>
          {open ? t('record.history.closeVersion') : t('record.history.openVersion')}
        </Btn>
        {nowSeq === null || isNow ? null : (
          <Btn size="sm" variant="ghost" onClick={onCompare}>
            {comparing ? t('record.history.closeComparison') : t('record.history.compareNow')}
          </Btn>
        )}
        {editable && !isNow ? <PutBack recordId={recordId} seq={entry.seq} onDone={onPutBack} /> : null}
      </div>

      {open ? <OpenedVersion recordId={recordId} seq={entry.seq} /> : null}
      {comparing && nowSeq !== null ? (
        <Comparison recordId={recordId} recordKind={recordKind} from={entry.seq} to={nowSeq} />
      ) : null}
    </li>
  )
}

/** One version fetched whole and drawn as content. */
function OpenedVersion({ recordId, seq }: { recordId: string; seq: number }) {
  const [state] = useProjectAsync(async () => await api.revision(recordId, seq), [recordId, seq])
  if (state.status === 'loading') return <p className="rh-note">{t('record.history.readingVersion', { seq })}</p>
  if (state.status === 'error') {
    return <ErrorNote message={state.message} fault={state.fault} label={t('record.history.versionFailed', { seq })} />
  }
  return <VersionContent shown={state.value} />
}

/** Two versions, and every field that differs between them. */
function Comparison({
  recordId,
  recordKind,
  from,
  to,
}: {
  recordId: string
  recordKind: RecordKind
  from: number
  to: number
}) {
  const [state] = useProjectAsync(async () => await api.compareRevisions(recordId, from, to), [recordId, from, to])
  if (state.status === 'loading') return <p className="rh-note">{t('record.history.comparing')}</p>
  if (state.status === 'error') {
    return <ErrorNote message={state.message} fault={state.fault} label={t('record.history.compareFailed')} />
  }
  return <WhatChanged recordKind={recordKind} from={from} to={to} differences={state.value.differences} />
}

/**
 * WHICH FIELDS CHANGED BETWEEN TWO VERSIONS, AND WHAT EACH ONE SAID BEFORE AND AFTER.
 *
 * It is separate from `Comparison` above, which fetches, so this can be rendered from a test with a
 * comparison in hand. What a reader is shown is the thing under test; a component that has to reach
 * the network first can only be checked in a browser.
 */
export function WhatChanged({
  recordKind,
  from,
  to,
  differences,
}: {
  recordKind: RecordKind
  from: number
  to: number
  differences: readonly FieldDiff[]
}) {
  const mode = useMode()
  const shown = differences.filter(d => mode === 'inspect' || readablePath(d.path))
  return (
    <div className="rh-compare">
      {/* THE HEADING SAYS WHICH TWO AND NOTHING ELSE. It used to carry a clause explaining that
          `was` meant the older one, and the clause was not English. Every row below names its own
          two sides by number, so there is nothing left for a heading to explain. */}
      <p className="rh-note">
        {t('record.history.compareTitle', { from, to })}
      </p>
      {shown.length === 0 ? (
        <Absence title={differences.length === 0 ? t('record.history.sameContent') : undefined} />
      ) : (
        <ul className="rh-diffs">
          {shown.map((d) => (
            <OneDifference key={d.path} diff={d} kind={recordKind} from={from} to={to} />
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Every class this file renders is styled here, tokens only, in the component rather than in
 * styles.css so the two can never go out of step. Quote class names with plain words in these
 * comments: a backtick inside this template literal ends the string.
 */
export const RECORD_HISTORY_CSS = `
.rh-fold { border-top: 1px solid var(--border); padding: calc(var(--pad) * 0.5) 0; }
.rh-fold > summary { cursor: pointer; color: var(--text-2); font-size: var(--fs-1); padding: calc(var(--pad) * 0.25) 0; }
.rh-fold > summary:hover { color: var(--text); }
.rh-fold-failed { padding: var(--pad) 0; }
.rh-lead { color: var(--text-2); font-size: var(--fs-1); margin: 0 0 var(--pad); }
.rh-note { color: var(--text-2); font-size: var(--fs-1); margin: calc(var(--pad) * 0.5) 0; }
/* What normal mode says in place of the boxes. It is in the page's ordinary text, not in a note's small
   grey, because it is written for the reader of the page. */
.rh-says { color: var(--text); font-size: var(--fs-2); margin: calc(var(--pad) * 0.5) 0; }
.rh-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: calc(var(--pad) * 0.75); }

/* EVERYTHING THAT HAPPENED HERE. One row per stored row: the sentence first, then the stamp, who
   said it, and — only when the row is about something else — what it was about. It wraps rather
   than scrolls sideways, because a file pattern and a record title are both long and a phone is
   390px wide. */
.rh-happened { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: calc(var(--pad) * 0.75); }
.rh-happened > li { display: flex; flex-direction: column; gap: calc(var(--pad) * 0.25); min-width: 0; }
.rh-happened-said { color: var(--text); font-size: var(--fs-2); overflow-wrap: anywhere; }
.rh-happened-meta {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: calc(var(--pad) * 0.75);
  color: var(--text-2); font-size: var(--fs-1); min-width: 0;
}
.rh-happened-on { overflow-wrap: anywhere; }
.rh-happened-row { font-family: var(--font-mono); }
.rh-row { border-top: 1px solid var(--border); padding-top: calc(var(--pad) * 0.75); min-width: 0; }
/* A row's rule divides it from what stands above it. When the list is the first thing in its panel, the
   panel title's own rule and space are already there, so the first row draws neither. */
.px-panel-body > .rh-list:first-child > .rh-row:first-child { border-top: 0; padding-top: 0; }
.rh-row-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: calc(var(--pad) * 0.5); min-width: 0; }
.rh-seq { font-weight: 600; }
.rh-who { color: var(--text-2); font-size: var(--fs-1); }
.rh-said { color: var(--text-2); font-size: var(--fs-1); margin: calc(var(--pad) * 0.25) 0 0; }
.rh-why { font-style: italic; }
/* ---- WHOSE WORDS THIS VERSION STANDS ON. The quotation is the owner's and is drawn as one: an indented
   block in the quiet panel colour, exactly as the record page's own panel draws it, so a reader can
   tell the owner's sentence from the product's. It wraps and never scrolls sideways, because a sentence
   somebody typed in a terminal has no line breaks and a phone is 390px wide. */
.rh-words-said { display: grid; gap: calc(var(--pad) * 0.25); margin-top: calc(var(--pad) * 0.25); min-width: 0; }
.rh-words {
  margin: 0;
  padding: calc(var(--pad) * 0.5) var(--pad);
  border-left: 3px solid var(--border-strong);
  background: var(--panel-2);
  font-size: var(--fs-1);
  line-height: var(--lh-read);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-width: 84ch;
  min-width: 0;
}
.rh-moved { font-size: var(--fs-1); margin: calc(var(--pad) * 0.25) 0 0; }
.rh-acts { display: flex; flex-wrap: wrap; gap: calc(var(--pad) * 0.5); margin-top: calc(var(--pad) * 0.5); }
.rh-confirm { border: 1px solid var(--border); border-radius: var(--radius); padding: var(--pad); margin-top: calc(var(--pad) * 0.5); }
.rh-did { border-left: 3px solid var(--border-strong); padding-left: var(--pad); margin-top: calc(var(--pad) * 0.5); }
.rh-did-said { font-size: var(--fs-1); margin: 0; }
.rh-content { margin-top: calc(var(--pad) * 0.5); border-left: 2px solid var(--border); padding-left: var(--pad); min-width: 0; }
.rh-field { display: flex; flex-wrap: wrap; gap: calc(var(--pad) * 0.5); margin: calc(var(--pad) * 0.35) 0; min-width: 0; }
.rh-field-block { flex-direction: column; }
.rh-field-name { color: var(--text-2); font-size: var(--fs-1); }
html[data-theme="light"] .rh-field-name[data-title-is="its-label"] { text-transform: uppercase; letter-spacing: 0.04em; }
.rh-none { color: var(--text-2); font-size: var(--fs-1); font-style: italic; }
.rh-stored { white-space: pre-wrap; min-width: 0; }
/* A LONG VALUE WRAPS. It used to run off the right of this box, which had no scrollbar to draw on
   this platform, so the end of an old version's value was simply not on the screen. JSON has no
   significant line breaks, so wrapping loses nothing and there is then nothing to announce. The
   24em cap stays and is marked, because a version's whole content in a side panel is not a panel. */
.rh-json { background: var(--panel-2); border-radius: var(--radius); padding: calc(var(--pad) * 0.5); white-space: pre-wrap; overflow-wrap: anywhere; max-height: 24em; overflow-y: auto; font-size: var(--fs-1); margin: 0; }
.rh-compare { margin-top: calc(var(--pad) * 0.5); border-left: 2px solid var(--border); padding-left: var(--pad); min-width: 0; }
.rh-diffs, .rh-inner { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: calc(var(--pad) * 0.5); }
.rh-diff { min-width: 0; }
.rh-diff-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: calc(var(--pad) * 0.5); }
.rh-inner-row { border-left: 1px solid var(--border); padding-left: calc(var(--pad) * 0.5); min-width: 0; }
.rh-path { font-size: var(--fs-1); color: var(--text-2); word-break: break-word; }
.rh-name { font-size: var(--fs-1); color: var(--text-2); overflow-wrap: anywhere; }
.rh-side { margin: calc(var(--pad) * 0.25) 0; font-size: var(--fs-1); min-width: 0; overflow-wrap: anywhere; }
.rh-side-tag { color: var(--text-2); text-transform: uppercase; font-size: 0.85em; letter-spacing: 0.04em; margin-right: calc(var(--pad) * 0.5); }
/* Every value a comparison draws wraps inside its own box. Nothing here scrolls sideways: a long
   line breaks, and the widest box is the pane. */
.rh-parts { list-style: none; margin: calc(var(--pad) * 0.25) 0 0; padding: 0; display: flex; flex-direction: column; gap: calc(var(--pad) * 0.25); min-width: 0; }
.rh-part { display: flex; flex-wrap: wrap; gap: calc(var(--pad) * 0.5); align-items: baseline; min-width: 0; }
.rh-part-said { white-space: pre-wrap; overflow-wrap: anywhere; min-width: 0; flex: 1 1 12rem; }
.rh-legend { display: flex; flex-wrap: wrap; gap: calc(var(--pad) * 0.75); font-size: var(--fs-1); color: var(--text-2); margin: calc(var(--pad) * 0.25) 0; }
.rh-lineup { margin: calc(var(--pad) * 0.25) 0; white-space: pre-wrap; overflow-wrap: anywhere; min-width: 0; }
.rh-word-gone { text-decoration: line-through; opacity: 0.7; }
.rh-word-new { font-weight: 600; text-decoration: underline; }
`
