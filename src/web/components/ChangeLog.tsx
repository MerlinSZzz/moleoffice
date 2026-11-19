// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Who changed what, and when. The server writes one row per changed field, so which FIELD moved is
 * read directly; what moved INSIDE an object value is worked out here.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A ROW DIFFS AN OBJECT VALUE INSTEAD OF PRINTING IT
 * ---------------------------------------------------------------------------------------
 * A change to a module's `data` stores the whole JSON bag on both sides. This component used to
 * print both, truncated at 90 characters, with the old one struck through — so a record whose
 * `parts` had changed showed two identical 90-character prefixes of its `context`, the first of
 * them crossed out. Four lines and about 100px said nothing, and worse, the strikethrough asserted
 * that text had been removed when the record still held it, in full, at the top of the same page.
 *
 * So an object value is compared KEY BY KEY and only the keys that differ are drawn. The comparison
 * walks into nested objects, and into arrays whose entries carry an `id`, so a change lands on the
 * thing that actually moved: `parts[#p1].items[#i2].state  failed → done`. That path spelling is
 * the SERVER'S own — it is what `PATCH /api/records/:id/checklist/:itemId` writes into `field`, and
 * what `itemPathTouch` in lib/attention.ts parses back out — so one notation means one thing across
 * the product.
 *
 * A value that is not an object on both sides is printed as it always was: one before, one after,
 * truncated with the whole thing on the tooltip. Nothing is lost, only folded.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A CHANGE ROW NEEDS A SECOND BLOCK TO NAME ITS SESSION
 * ---------------------------------------------------------------------------------------
 * `Change.sessionId` used to hold whatever an agent called its run — "checkpoint3" — which read
 * as a name because it was one. It now holds the session RECORD's id: `NS6wp_rmduzo`. That is a
 * better thing to store (an id joins, a name does not, and 28 rows once said "checkpoint3" while
 * "which session produced this page" was unanswerable) and a worse thing to print. An identifier
 * on screen where a name belongs is not information, it is a lookup nobody performs.
 *
 * GET /api/changes therefore answers with a `sessions` block: every session the returned rows
 * name, resolved to its record and its title. This component reads it and shows the TITLE,
 * linked to the session record — and where the join did not land it says which of the three
 * different things happened rather than falling back to printing the id as if it were a name:
 *
 *   - nothing answers to the stored value    -> the run name, said to be unresolved. The row was
 *                                               written under a name no session record claims,
 *                                               which is a repair job, not a display problem.
 *   - the caller did not fetch the block     -> the stored value, said to be unjoined. "Mole Office
 *                                               did not ask" and "nothing answered" are
 *                                               different sentences and must not share one.
 *   - the row carries no session at all      -> nothing. A person typing is not a missing
 *                                               session, it is no session.
 */

import type { Change, ProvedHolder } from '@shared/types.ts'
// The one field-path comparison in the product. It was written in this file and moved to
// src/shared/fielddiff.ts so the server's revision ledger reads the same walk; see below.
import { diffValues, stepsOfPath, type FieldDiff } from '@shared/fielddiff.ts'
import { content, t } from '@shared/i18n.ts'
import { isARecordId } from '@shared/messages.ts'
import { theModelsName } from '@shared/model-names.ts'
import { writerNamed } from '../lib/participant-lookup.ts'
import type { Mode } from '@shared/mode.ts'
// THE GENERIC ENGLISH READING OF A STORED KEY, the same de-snaking rule every unnamed field in the
// product already falls back to. See `pathLabel` below for why this file does not keep a second
// field-name table.
import { englishHeading } from '@shared/sections.ts'
import type { ChangeSession, ParticipantsReply } from '../api.ts'
import { recordPath } from './router.tsx'
import { useMode } from '../lib/mode.ts'
// ONE ANSWER TO "WHICH OF TWO AGENTS OF ONE NAME IS THE RETIRED ONE", the same function the chat's
// contact rows and the Embassy draw. Criterion I4.
import { theNameBesideItsDate } from './ContactChooser.tsx'
// A REFERENCE TO A RECORD INSIDE A SENTENCE IS STILL A REFERENCE TO THAT RECORD. Both anchors
// below go through the one declaration every link row already goes through; see the note on
// `SessionRef` for what was measured before they did.
import { currentWorkspace } from '../lib/workspace.ts'
import { declaredAttributes } from './declares.ts'
// THE ONE TABLE THAT NAMES A STORED FIELD IN THE READER'S WORDS. RecordHistory.tsx built it for
// the same question — "what is this path called, in a sentence" — and a second table here would be
// a second answer that could drift from the first. See `pathLabel`.
import { historyFieldName } from './RecordHistory.tsx'
import { theLinkedRecord } from './sections.ts'
import { DRAWS_THE_NAME } from './agent/pointing.ts'
// EVERY STORED WORD REACHES A SCREEN THROUGH HERE, so "human" and "system" are not printed raw.
import { actorTypeWord, changeVerb, stateWord } from '../lib/words.ts'
import { Empty, Panel, Row, Stamp, Tag } from './ui.tsx'

const short = (value: string, max = 90) => (value.length <= max ? value : `${value.slice(0, max)}…`)

// ============================================================================ naming a session

/**
 * What this row can honestly say about the session that wrote it.
 *
 * A discriminated result rather than a string, so the component draws a LINK when there is a
 * record to open and plain text when there is not — and so the two failures keep their own
 * words. `sessions` is null when the caller has no block to offer.
 */
export type SessionName =
  | { at: 'none' }
  | { at: 'named'; title: string; recordId: string; stored: string; matchedBy: string; model: string | null }
  | { at: 'unresolved'; stored: string }
  | { at: 'unjoined'; stored: string }
  /** The session is real and is filed in another project. Named, never opened. */
  | { at: 'elsewhere'; stored: string; project: string }

export function sessionOf(
  change: Change,
  sessions: readonly ChangeSession[] | null,
): SessionName {
  const stored = change.sessionId
  if (stored === null || stored.trim() === '') return { at: 'none' }
  if (sessions === null) return { at: 'unjoined', stored }

  const found = sessions.find((s) => s.stored === stored)
  // A row whose stored value is in nobody's block is the same situation as no block at all: this
  // page cannot name it, and saying so is the only honest option. It is not "unresolved", which
  // is a statement about the WORKSPACE that only the server is entitled to make.
  if (found === undefined) return { at: 'unjoined', stored }
  // `unresolved` is the SERVER's answer to this exact question, and it is sent on every entry.
  // This used to re-derive it from recordId and title, which is a second opinion about a fact
  // only one side is entitled to hold — and the kind of copy that stops agreeing the day the
  // server starts sending a title for something it could not resolve. The null checks stay
  // because they are what narrows the two fields for TypeScript, not because they decide.
  // A SESSION IN ANOTHER PROJECT IS NOT AN UNRESOLVED ONE, and this branch is above the unresolved
  // one because both arrive with a null recordId. Moving a record carries its history and leaves
  // the session that wrote it where it was, so this row is attributed to a run that really exists
  // and that this project does not hold. Drawing it as "no session record answers to this name"
  // would be the one thing certainly untrue about it.
  if (found.matchedBy === 'elsewhere' && found.elsewhereIn !== null) {
    return { at: 'elsewhere', stored, project: found.elsewhereIn }
  }
  if (found.unresolved || found.recordId === null || found.title === null) {
    return { at: 'unresolved', stored }
  }
  return {
    at: 'named',
    title: found.title,
    recordId: found.recordId,
    stored,
    matchedBy: found.matchedBy,
    model: found.model ?? null,
  }
}

/**
 * THE MODEL A RUN WAS STARTED ON, IN WORDS (problem 2tbFWxiFyjtv), or null when its record names none. Its own name
 * from the one table, @shared/model-names.ts; a model the table does not hold is said to be one, and the stored id is
 * developer mode's. The change log's run and the fold's summary line both say it through here.
 */
export function theModelSaid(model: string | null | undefined, inspect: boolean): string | null {
  if (model === null || model === undefined) return null
  if (inspect) return model
  return theModelsName(model) ?? t('g2d.changeLog.modelUnnamed')
}

/** The model of the run that wrote this change, as `theModelSaid` says it, or null. */
export function theModelOfAChange(
  change: { sessionId: string | null },
  sessions: readonly ChangeSession[] | null,
  inspect: boolean,
): string | null {
  const name = sessionOf(change as Change, sessions)
  return name.at === 'named' ? theModelSaid(name.model, inspect) : null
}

/**
 * The session behind one change, as a name you can click.
 *
 * The tooltip carries the stored value in every case. The id is what you need when you are
 * grepping a log or asking the API about it, and dropping it entirely would trade one silence
 * for another — it is just not the thing to READ.
 *
 * ---------------------------------------------------------------------------------------
 * THE NAME IS A LINK TO A RECORD, SO IT DECLARES THAT RECORD
 * ---------------------------------------------------------------------------------------
 *
 * Measured on 31 August 2026 on problem `a62SOh9fsPe5`: a right-click on the session name in a
 * change row walked up TWELVE elements that said nothing and answered the problem whose page it
 * was printed on. Nine rows on that one page, twenty-four across the five records the person's gate names.
 * Their dogfood asks the opposite — *"A linked record reference should remain identifiable as a
 * linked semantic object"* — and their resolution order puts the exact visible object first.
 *
 * THE ROW AROUND IT IS UNCHANGED AND STILL ANSWERS THE RECORD IT IS THE HISTORY OF. A change row
 * is a sentence about a change to THIS record; only the name of the session is about the session.
 */
export function SessionRef({
  change,
  sessions,
}: {
  change: Change
  sessions: readonly ChangeSession[] | null
}) {
  const mode = useMode()
  const name = sessionOf(change, sessions)
  if (name.at === 'none') return null
  const model = name.at === 'named' ? theModelSaid(name.model, mode === 'inspect') : null

  if (name.at === 'named') {
    return (
      // The word "session" stays in front of the title. Without it the name is just another
      // phrase in a line of phrases — and on a change row about a session record it reads as the
      // record's own title said twice.
      <span className="chg-session-ref">
        <span className="chg-session-label">{t('g2d.changeLog.sessionWord')}</span>{' '}
        <a
          className="chg-session"
          href={`#${recordPath(name.recordId)}`}
          title={mode === 'inspect' ? t('pageWords.ChangeLog.expression01', { stored: String(name.stored), matchedBy: String(name.matchedBy) }) : name.title}
          // THE ANCHOR IS THE THING, so the declaration is on the anchor and not on a wrapper: the
          // word "session" in front of it is furniture, and a wrapper would sweep it into the name.
          {...declaredAttributes(theLinkedRecord(name.recordId, currentWorkspace()))}
          {...DRAWS_THE_NAME}
        >
          {name.title}
        </a>
        {model === null ? null : <span className="chg-session-model">{t('g2d.changeLog.modelOfTheRun', { model: content(model) })}</span>}
      </span>
    )
  }

  // Real, and filed somewhere this project cannot read. Plain text and no link, because the whole
  // point is that the record is not this project's to open — naming the project is the most this
  // page may truthfully say.
  if (name.at === 'elsewhere') {
    return (
      <span className="chg-session chg-session-elsewhere" title={mode === 'inspect' ? t('pageWords.ChangeLog.expression02', { stored: String(name.stored) }) : undefined}>
        {mode === 'inspect'
          ? t('g2d.changeLog.sessionElsewhere', { stored: content(name.stored), project: content(name.project) })
          : t('g2d.changeLog.sessionElsewhereNormal', { project: content(name.project) })}
      </span>
    )
  }

  if (name.at === 'unresolved') {
    return (
      <span className="chg-session chg-session-unresolved" title={mode === 'inspect' ? t('pageWords.ChangeLog.expression03', { stored: String(name.stored) }) : undefined}>
        {mode === 'inspect' ? t('g2d.changeLog.sessionUnresolved', { stored: content(name.stored) }) : t('g2d.changeLog.sessionUnresolvedNormal')}
      </span>
    )
  }

  return (
    <span
      className="chg-session chg-session-unjoined"
      title={mode === 'inspect' ? t('pageWords.ChangeLog.expression04', { stored: String(name.stored) }) : undefined}
    >
      {mode === 'inspect' ? t('g2d.changeLog.sessionUnjoined', { stored: content(name.stored) }) : t('g2d.changeLog.sessionUnjoinedNormal')}
    </span>
  )
}

// ============================================================================ what the write was

/**
 * WHAT THE WRITE WAS. THE FUNCTION IS NOT IN THIS FILE ANY MORE — it is in src/shared/words.ts,
 * and the line below re-exports it under the name every caller here already uses.
 *
 * It was written here, for this panel, because both change lists in the browser say it and a verb
 * that reads one way on one page and another way on the other is two vocabularies for one column.
 * It moved on 28 August 2026 for the next step of the same argument: the SERVER composes text a
 * person reads as well — the continuation assembler writes a line per change row into the text
 * previewed on the bundles page — and a file under src/web is not reachable from src/server. That
 * assembler was writing the stored columns straight out, so one change row read "unlink on record
 * ..." there and "unlinked (part of)" here. The answer was not a second copy on the server; it was
 * to move the one function down to the layer both sides import, exactly as diffValues and
 * STATE_WORDS moved before it.
 *
 * WHAT CHANGED WHILE IT MOVED, and nothing else did: the verb used to be the stored op with "d" or
 * "ed" stuck on the end, which is the stored word reaching a screen with a spelling accident in
 * between. It now reads CHANGE_OP_WORDS, so an op with no entry is named out loud instead of being
 * handed back inflected. The five ops that exist print exactly what they printed before.
 */
export { changeVerb }

/**
 * One change's meta line: what happened, who did it, and WHICH SESSION — by name.
 *
 * The session used to be printed as `session ${change.sessionId}`, and that field used to hold a
 * run name. It now holds a session record id, so the line read `session NS6wp_rmduzo`: a lookup
 * key where a name belongs. Both change lists in the app draw this one component, so they cannot
 * disagree about what to call a session or about what to say when the name did not resolve.
 */
export function ChangeMeta({
  change,
  sessions,
  participants,
  verb = true,
}: {
  change: Change
  sessions: readonly ChangeSession[] | null
  /** Everybody the registries hold, so a proved holder is named rather than printed as an id. */
  participants?: ParticipantsReply
  /** Off where the row's title already says what the write was, so it is not said twice. */
  verb?: boolean
}) {
  const mode = useMode()
  return (
    <span className="chg-meta">
      {verb ? (
        <>
          <span>{changeVerb(change, mode)}</span>
          <span className="chg-sep">·</span>
        </>
      ) : null}
      {/* WHO, BY NAME (wave 13k round 34). The stored id is a handle for an agent, which a person does not
          know them by; developer mode keeps it. With no registries handed over it is the writer's kind ("person", "agent"), as writerNamed says. */}
      <span>{mode === 'inspect' ? change.actorId : writerNamed(change, participants)}</span>
      {/* No proved-by words where the key proved the row's own writer: they would only repeat the name before them. */}
      {change.provedHolder === null || change.provedHolder === undefined || change.provedHolderIsTheWriter === true ? null : (
        <>
          <span className="chg-sep">·</span>
          <span className={change.provedHolder.how === 'the-office-key' ? 'chg-proved' : 'chg-proved-out'}>
            {provedHolderSentence(change.provedHolder, participants)}
          </span>
        </>
      )}
      {change.sessionId === null ? null : (
        <>
          <span className="chg-sep">·</span>
          <SessionRef change={change} sessions={sessions} />
        </>
      )}
    </span>
  )
}

/**
 * WHO A KEY PROVED, IN THE WORDS A PERSON READS. Criterion P83, point 5, the ruling of
 * 13 September 2026 (Q2), and criterion I4.
 *
 * TWO SENTENCES, AND THE DIFFERENCE IS THE POINT. Six of the office's own processes send the
 * office's key under an agent's name on every request, so the office acting as an agent is the
 * ordinary thing it is and reads that way — hiding it from them is what invariant 5 forbids. A key
 * held by one writer used under another's name is where a person should look, so that one stands
 * out. Both are drawn by the one component every change list uses, so no two lists can disagree.
 *
 * THE HOLDER IS NAMED AND NOT PRINTED AS AN ID. Criterion I4: the key's holder is a registry id
 * since I-5, and an id on screen where a name belongs is a lookup nobody performs. Where the
 * registry holds the holder, its name is drawn, with the retirement date on a retired agent so two
 * agents of one name can be told apart; where no row answers, the id is drawn as an id.
 *
 * IT NAMES THE STATE AND NOT THE MECHANISM, chapter 6 rule 4: who a key proved and who the request
 * named, never a key, a header, a hash or a column.
 */
export function provedHolderSentence(holder: ProvedHolder, participants?: ParticipantsReply): string {
  // A tool cannot write a change or acquire a person/agent identity. Keep even an imported
  // proof honest about that. H-forI_Vk5H7 and two decisions.
  if (holder.how === 'his-tool-key') return t('g2d.changeLog.theMailToolKey')
  if (holder.how === 'the-office-key') return t('g2d.changeLog.officeActingAs', { claimed: content(holder.claimed) })
  const found =
    participants === undefined
      ? undefined
      : [...participants.agents, ...participants.people].find((one) => one.id === holder.id)
  const who = theNameBesideItsDate(found?.name ?? holder.id, found?.retiredAt)
  return t('g2d.changeLog.wroteWhileNamed', { who: content(who), claimed: content(holder.claimed) })
}

// ============================================================================ diffing a value

/**
 * THE WALK ITSELF IS NOT HERE ANY MORE. It moved to src/shared/fielddiff.ts on 18 August 2026.
 *
 * It was written here, for this panel, and it was the only field-path comparison in the product
 * until the revision ledger needed the same answer about two stored revisions. Two walks would be
 * two answers to one question, and a record page and a ledger disagreeing about which field changed
 * is the drift this codebase keeps producing. `src/shared/` is the one directory the browser and the
 * server may both import, so the walk lives there and both read it.
 *
 * They are re-exported under their old names so that every caller of `diffValues` — this file, and
 * tests/record-page.test.ts, which calls the pure readers directly — goes on reading them from here.
 * That is a re-export and not a copy: there is still exactly one walk.
 */
export { diffValues, type FieldDiff }


/** How many changed keys a row shows before the rest go behind a disclosure that names them. */
export const DIFF_FOLD = 4

// ============================================================================ naming a link target

/**
 * What a `link` or `unlink` row stores, and what it can honestly be called.
 *
 * The server writes `logChange(fromId, 'link', actor, type, null, toId)` when a link is made and
 * `logChange(fromId, 'unlink', actor, type, toId, null)` when it is removed — so the row's field is
 * the link TYPE, and the TARGET RECORD'S ID is on whichever side the operation put it: the new
 * value for a link, the old value for an unlink. Both are read, because a reader that knew only
 * one of them would name half the rows and print an id for the other half.
 *
 * Printed straight, an id is the same defect this file argues against three screens up, one line
 * lower on the same panel: an identifier where a name belongs is not information, it is a lookup
 * nobody performs.
 *
 * The map is OPTIONAL and its absence is a real answer rather than a default. A caller that has
 * one gets a name it can click; a caller that has not gets the id it always got, marked as an id
 * rather than passed off as content. Nothing invents a title.
 */
export type RecordTitles = ReadonlyMap<string, string>

export type LinkTargetName =
  | { at: 'named'; title: string; recordId: string }
  | { at: 'unresolved'; stored: string }
  | { at: 'unjoined'; stored: string }

export function linkTargetOf(change: Change, titles: RecordTitles | undefined): LinkTargetName | null {
  if (change.op !== 'link' && change.op !== 'unlink') return null
  const stored = change.op === 'link' ? change.newValue : change.oldValue
  if (stored === null || stored.trim() === '') return null
  if (titles === undefined) return { at: 'unjoined', stored }
  const title = titles.get(stored)
  // A record the listing did not carry is a DELETED one — the listing is the only thing that leaves
  // those out — and saying "no record answers to this id" is the honest version of that.
  if (title === undefined) return { at: 'unresolved', stored }
  return { at: 'named', title, recordId: stored }
}

function LinkTarget({ name }: { name: LinkTargetName }) {
  const mode = useMode()
  if (name.at === 'named') {
    return (
      // THE OTHER END OF A `link` OR `unlink` ROW, and the same declaration for the same reason:
      // eight anchors across the person's five records answered the page they were printed on.
      <a
        className="chg-target"
        href={`#${recordPath(name.recordId)}`}
        title={mode === 'inspect' ? t('pageWords.ChangeLog.expression05', { recordId: String(name.recordId) }) : name.title}
        {...declaredAttributes(theLinkedRecord(name.recordId, currentWorkspace()))}
        {...DRAWS_THE_NAME}
      >
        {name.title}
      </a>
    )
  }
  if (name.at === 'unresolved') {
    return (
      <span
        className="chg-target chg-target-unresolved"
        title={mode === 'inspect'
          ? t('pageWords.ChangeLog.expression06', { stored: String(name.stored) })
          : t('g2d.changeLog.linkUnresolvedNormal')}
      >
        {mode === 'inspect' ? t('g2d.changeLog.linkUnresolved', { stored: content(name.stored) }) : t('g2d.changeLog.linkUnresolvedNormal')}
      </span>
    )
  }
  return (
    <span
      className="chg-target chg-target-unjoined"
      title={mode === 'inspect'
        ? t('pageWords.ChangeLog.expression07')
        : t('g2d.changeLog.linkUnjoinedNormal')}
    >
      {mode === 'inspect' ? name.stored : t('g2d.changeLog.linkUnjoinedNormal')}
    </span>
  )
}

// ============================================================================ the log

/**
 * ONE SIDE OF A CHANGED VALUE, read in words, WITH TWO NAMED EXCEPTIONS.
 *
 * A stored word already has a reading everywhere else this product draws it — `stateWord` is what
 * a state chip, a row and a fold all read — and a diff row printing the raw word instead is the
 * same defect this file's own header argues against for a session id: an identifier where a
 * reading belongs. RecordHistory.tsx makes the same exception for the same path, at
 * `path === 'data.state' || path === 'state'`; this reads that one path the same way so a state
 * change is not named two ways on two panels. Record ids inside a value are replaced with their
 * titles when known, or with a short unavailable name; the stored id stays in Inspect.
 */
function valueWithoutRecordIds(value: string, titles?: RecordTitles): string {
  const idWord = (id: string) => titles?.get(id) ?? t('g2d.changeLog.unavailableRecord')
  const mapIds = (one: unknown): { value: unknown; changed: boolean } => {
    if (typeof one === 'string' && isARecordId(one)) return { value: idWord(one), changed: true }
    if (Array.isArray(one)) {
      let changed = false
      const mapped = one.map((item) => {
        const result = mapIds(item)
        changed ||= result.changed
        return result.value
      })
      return { value: mapped, changed }
    }
    if (typeof one === 'object' && one !== null) {
      let changed = false
      const mapped = Object.fromEntries(Object.entries(one).map(([key, item]) => {
        const result = mapIds(item)
        changed ||= result.changed
        return [key, result.value]
      }))
      return { value: mapped, changed }
    }
    return { value: one, changed: false }
  }

  if (isARecordId(value)) return idWord(value)
  try {
    const result = mapIds(JSON.parse(value) as unknown)
    return result.changed ? JSON.stringify(result.value) : value
  } catch {
    return value
  }
}

function Value({ label, value, asState, mode, titles }: { label: string; value: string | null; asState?: boolean; mode: Mode; titles?: RecordTitles }) {
  if (value === null) return null
  const readable = mode === 'normal' ? valueWithoutRecordIds(value, titles) : value
  const shown = asState && mode === 'normal' ? stateWord(value, mode).text : short(readable)
  return (
    <span className={`chg-value chg-${label}`} title={readable.slice(0, 2000)}>
      {shown}
    </span>
  )
}

/**
 * WHAT ONE CHANGED PATH IS CALLED, IN THE READER'S WORDS.
 *
 * `diff.path` is the server's own spelling — `parts[#p1].items[#i2].state` — and printing it
 * straight is a stored path on screen in Normal mode, which chapter 6 keeps for Developer mode
 * only. Each step is read through `historyFieldName`, the one table RecordHistory.tsx already
 * built for this exact question, so a field is not named two ways on two panels; a step that table
 * does not carry falls back to its English words, the same fallback `fieldLabel` uses on the record
 * page itself. `data` is dropped, because it is where a kind keeps its own fields and never a word
 * a person reads.
 */
function pathLabel(path: string): string {
  if (path === '') return t('record.history.wholeValue')
  const steps = stepsOfPath(path.replace(/\[(?:#[^\]]*|\d+)\]/g, '')).filter((step) => step !== 'data')
  if (steps.length === 0) return t('record.history.wholeValue')
  return steps.map((step) => historyFieldName(step) ?? englishHeading(step).toLowerCase()).join(' · ')
}

/** One changed key: its path, what it was, and what it is now. */
function DiffRow({ diff, mode, titles }: { diff: FieldDiff; mode: Mode; titles?: RecordTitles }) {
  return (
    <li className="chg-diffrow">
      {/* THE STORED PATH IS DEVELOPER MODE'S. A reader in Normal mode gets the field named in
          words; Inspect mode gets the exact path the server wrote, for somebody grepping a log. */}
      <code className="chg-diffpath">{mode === 'inspect' ? (diff.path === '' ? t('record.history.wholeValue') : diff.path) : pathLabel(diff.path)}</code>
      {diff.kind === 'added' ? <span className="chg-diffkind">{t('g2d.changeLog.added')}</span> : null}
      {diff.kind === 'removed' ? <span className="chg-diffkind">{t('g2d.changeLog.removed')}</span> : null}
      <span className="chg-diff">
        <Value label={t('pageWords.ChangeLog.001')} value={diff.before} asState={diff.path === 'state'} mode={mode} titles={titles} />
        {diff.before !== null && diff.after !== null ? (
          <span className="chg-arrow" aria-hidden="true">
            →
          </span>
        ) : null}
        <Value label={t('pageWords.ChangeLog.002')} value={diff.after} asState={diff.path === 'state'} mode={mode} titles={titles} />
      </span>
    </li>
  )
}

/**
 * The changed keys of one object value: the first few, then the rest behind a disclosure.
 *
 * The disclosure NAMES what is inside it rather than counting it. "4 more" is a count with no
 * content and cannot be acted on; "4 more keys changed: paths, source, extra, summaryBlocks" can.
 */
function DiffList({ diffs, mode, titles }: { diffs: readonly FieldDiff[]; mode: Mode; titles?: RecordTitles }) {
  if (diffs.length === 0) {
    return (
      <span className="chg-nodiff">
        {t('g2d.changeLog.wholeObjectSame')}
      </span>
    )
  }
  const head = diffs.slice(0, DIFF_FOLD)
  const rest = diffs.slice(DIFF_FOLD)
  return (
    <div className="chg-diffs">
      <ul className="chg-difflist">
        {head.map((d) => (
          <DiffRow key={d.path} diff={d} mode={mode} titles={titles} />
        ))}
      </ul>
      {rest.length === 0 ? null : (
        <details className="chg-more">
          <summary className="chg-more-sum">
            {t('g2d.changeLog.moreChanged', {
              n: rest.length,
              list: mode === 'inspect' ? rest.map((d) => d.path).join(', ') : rest.map((d) => pathLabel(d.path)).join(', '),
            })}
          </summary>
          <ul className="chg-difflist">
            {rest.map((d) => (
            <DiffRow key={d.path} diff={d} mode={mode} titles={titles} />
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

/**
 * One row's second line: who did it, and what moved.
 *
 * The choice between a field-level diff and the plain before-and-after is made HERE and once, so
 * every list that draws a change row makes it the same way.
 */
export function ChangeBody({
  change,
  sessions,
  titles,
  participants,
}: {
  change: Change
  sessions: readonly ChangeSession[] | null
  titles?: RecordTitles
  /** Everybody the registries hold, so a proved holder is named rather than printed as an id. */
  participants?: ParticipantsReply
}) {
  const mode = useMode()
  const target = linkTargetOf(change, titles)
  const diffs = target !== null ? null : diffValues(change.oldValue, change.newValue)
  return (
    <span className="chg-lines">
      {/* The verb is the row's title, so this line does not repeat it. */}
      <ChangeMeta change={change} sessions={sessions} participants={participants} verb={false} />
      {target !== null ? (
        <span className="chg-diff">
          <LinkTarget name={target} />
        </span>
      ) : diffs !== null ? (
        <DiffList diffs={diffs} mode={mode} titles={titles} />
      ) : change.oldValue !== null || change.newValue !== null ? (
        <span className="chg-diff">
          <Value label={t('pageWords.ChangeLog.003')} value={change.oldValue} asState={change.field === 'state' || change.field === 'data.state'} mode={mode} titles={titles} />
          {change.oldValue !== null && change.newValue !== null ? (
            <span className="chg-arrow" aria-hidden="true">
              →
            </span>
          ) : null}
          <Value label={t('pageWords.ChangeLog.004')} value={change.newValue} asState={change.field === 'state' || change.field === 'data.state'} mode={mode} titles={titles} />
        </span>
      ) : null}
    </span>
  )
}

export interface ChangeLogProps {
  changes: Change[]
  /**
   * The `sessions` block from GET /api/changes, or null when the caller did not fetch it.
   *
   * REQUIRED, and null is a real answer rather than a default: a caller that has not got the
   * block has to say so, and the rows then say so too. Leaving it optional would let a page
   * quietly go back to printing record ids, which is the bug this prop exists to end.
   */
  sessions: readonly ChangeSession[] | null
  /**
   * Everybody the registries hold, so a key-proved holder is drawn as a name.
   *
   * OPTIONAL, and absent is a real answer rather than a default: a caller that did not read the
   * registries gets the holder's id, marked as the lookup key it is, instead of a name this
   * component invented. Criterion I4. The record pages read the registries with the record and
   * hand them down, so the ordinary record page names the holder; a bare render in a test that
   * supplies none still draws its sentence.
   */
  participants?: ParticipantsReply
  /**
   * Record id -> title, for naming the target of a `link` or `unlink` row.
   *
   * OPTIONAL, because not every caller has the workspace listing to hand, and its absence is
   * carried through rather than defaulted: without it a link row prints the stored id marked as an
   * id, which is what it always did, instead of a title this component invented.
   */
  titles?: RecordTitles
}

/**
 * DRAWN WITH THE APP'S OWN PANEL AND ROW, not with markup of its own.
 *
 * This component used to render `<section className="panel">`, `<h2>`, `<ul className="changes">`
 * and six more class names that NOTHING IN THE APP STYLES. Every one of them was invented here
 * and never written into styles.css, so the record page's history rendered as a wall of
 * run-together words at 1440px while passing every test — the tests read text, and the text was
 * all there. Composing `Panel` and `Row` is what makes that impossible rather than fixed: a class
 * this file does not invent is a class this file cannot leave unstyled.
 *
 * The severity column is closed (`0` wide) because a change has no severity. `Row` still renders
 * the cell, which is what keeps these rows lined up with every other row in the app.
 */
const NO_SEVERITY_COLS = '0 minmax(0, 1fr) auto'

export function ChangeLog({ changes, sessions, titles, participants }: ChangeLogProps) {
  const mode = useMode()
  return (
    <>
      <style href="mole-office-changelog" precedence="default">
        {CHANGELOG_CSS}
      </style>
      <Panel declares={{ surface: null }}
        title={t('record.section.changes')}
        rank={2}
        // THE COUNT CARRIES ITS MEASURE WORD, "3 changes" / "3 项变化": a bare 1 beside 近期变化 named nothing (the
        // review of wave 13q's round 35 pictures). The history fold counts with the same word.
        actions={<Tag tone="quiet">{t('record.history.changeCount', { n: changes.length })}</Tag>}
      >
        {changes.length === 0 ? (
          <Empty message={t('g2d.changeLog.empty')} />
        ) : (
          changes.map((c) => (
            <Row
              key={c.id}
              cols={NO_SEVERITY_COLS}
              // WHAT THIS ROW IS: THE CHANGE. Measured on 31 August 2026 over the eight record
              // pages the re-gate read, 585 presses inside this panel answered the whole record
              // from eight to fifteen levels up — the diff path, the old value, the arrow, the new
              // value, the word "session", the stamp, all of them. Their order puts the root last,
              // and a change row is not a place the page had no name for: it is one write to one
              // field, with an id of its own in the ledger.
              //
              // THE WHOLE ROW CARRIES IT, so everything drawn inside the row that declares nothing
              // else — every part of the diff — reaches the change in two or three levels instead
              // of the record in twelve. The two things inside a row that ARE something else say
              // so themselves and keep saying it: the session name declares the session record and
              // the link target declares the record it names.
              target={{ kind: 'change', recordId: c.recordId, changeId: c.id }}
              // WHO WROTE IT, IN THE READER'S WORD AND NOT THE STORED ONE. This printed the actor
              // type straight out of the column, so a row on a record's history said "human" or
              // "system" — the database's spelling, on a page a person reads. `actorTypeWord`
              // answers "person" and "Mole Office", and the home page's change row reads the same
              // function, so one write is not described two ways on two screens. Developer mode
              // still shows the stored word.
              //
              // It leads the row as a word rather than a colour: who wrote it is one of the two
              // answers that change what you do next.
              leading={<Tag tone={c.actorType === 'agent' ? 'accent' : 'neutral'}>{actorTypeWord(c.actorType, mode).text}</Tag>}
              title={changeVerb(c, mode)}
              meta={<ChangeBody change={c} sessions={sessions} titles={titles} participants={participants} />}
              right={<Stamp at={c.at} />}
            />
          ))
        )}
      </Panel>
    </>
  )
}

/**
 * The bits of geometry that are this component's own: the session name, the meta line and the
 * folded before/after values. Tokens only, hoisted and de-duplicated by href, in the component
 * rather than in styles.css so the two can never go out of step.
 *
 * EVERY CLASS THIS FILE RENDERS IS STYLED HERE. That is checked by a test rather than by care —
 * see tests/changes.test.ts — because the last time it was left to care, eight class names went
 * out with no rules at all and the panel looked broken on screen while every test passed.
 */
export const CHANGELOG_CSS = `
.chg-lines { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.chg-meta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px var(--pad); min-width: 0; }
.chg-sep { color: var(--text-3); }
/* WHO A KEY PROVED. Criterion P83, point 5. The office's own key acting under an agent's name is
   ordinary and reads like the rest of the line. A key held by one writer under another's name is
   where a person should look, so it stands out in the state colour every other warning uses. */
.chg-proved { color: var(--text-3); }
.chg-proved-out { color: var(--st-overdue); font-weight: var(--st-overdue-weight); }
.chg-diff { display: inline-flex; align-items: baseline; gap: 6px; flex-wrap: wrap; min-width: 0; }

/* ---------------------------------------------------------------- the field-level diff */
/* One line per key that moved. The path is monospaced because it is a path — the same spelling
   the server writes into a change row's field column — and the two values sit beside it. */
.chg-diffs { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.chg-difflist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.chg-diffrow { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px var(--pad); min-width: 0; }
.chg-diffpath {
  font-family: var(--font-mono);
  font-size: var(--fs-1);
  color: var(--text-2);
  overflow-wrap: anywhere;
}
.chg-diffkind {
  font-size: var(--fs-1);
  font-weight: 700;
  letter-spacing: .05em;
  text-transform: uppercase;
  color: var(--text-3);
}
/* Said, not left blank. Two identical walls of JSON with one crossed out is what this replaced. */
.chg-nodiff { font-size: var(--fs-1); color: var(--text-3); font-style: italic; }

/* The record a link row points at. A title is a link; an id is monospaced, so it reads as the
   lookup key it is rather than as the name of anything. */
.chg-target {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: .16em;
}
.chg-target-unjoined { color: var(--text-3); text-decoration: none; font-family: var(--font-mono); }
.chg-target-unresolved { color: var(--st-broken); text-decoration: none; }
.chg-more { min-width: 0; }
.chg-more-sum { cursor: pointer; color: var(--text-2); overflow-wrap: anywhere; }
.chg-more-sum:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: 2px; }
.chg-value { overflow-wrap: anywhere; }
.chg-old { color: var(--text-3); text-decoration: line-through; }
.chg-new { color: var(--text-2); }
.chg-arrow { color: var(--text-3); flex: none; }
.chg-session-ref { min-width: 0; }
.chg-session-model { margin-inline-start: .3em; color: var(--text-2); }
.chg-session-label {
  font: var(--fs-1)/var(--lh-body) var(--font-ui);
  color: var(--text-3);
}
.chg-session {
  min-width: 0;
  font: var(--fs-1)/var(--lh-body) var(--font-ui);
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: .16em;
}
/* Not a link, so not underlined and not the accent colour: there is nothing to open. Both of
   these say something is unfinished, so they take the unfinished tone rather than an alarm. */
.chg-session-unresolved, .chg-session-unjoined {
  color: var(--text-3);
  text-decoration: none;
  font-style: italic;
}
.chg-session-unresolved { color: var(--st-broken); font-style: normal; }
`
