// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Every link touching this record, in two groups, with what each one is waiting for.
 *
 * ---------------------------------------------------------------------------------------
 * THE DIRECTION SPLIT IS THE POINT
 * ---------------------------------------------------------------------------------------
 * A link is stored once, in one direction, and the server hands back a label already written from
 * the point of view of the record you are looking at (`ResolvedLink.label`). So both groups read as
 * a sentence about THIS record: outgoing rows say what it does, incoming rows say what has been
 * done to it. Nothing here re-words a link; the two group notes say which side stores it.
 *
 * ---------------------------------------------------------------------------------------
 * THREE FACTS A ROW CARRIES BEYOND THE TITLE, AND WHY EACH IS DRAWN AND NOT DROPPED
 * ---------------------------------------------------------------------------------------
 *
 * INFERRED links look different from confirmed ones. `LinkMark` separates them four ways at once —
 * a broken arrow shaft, a dashed border, a different colour, and the word "inferred" — and this
 * file adds a dashed edge down the whole row, because the dash is this app's one reserved signal
 * for "Mole Office worked this out and nobody has confirmed it". It is spent on that and on nothing
 * else. A row a person asserted and a row the product guessed must never be one thing.
 *
 * GATES say how much a `blocks` link blocks: all the way, or only as far as a named stage. The
 * gate is stored once, on the link, and the server serves it on BOTH ends — which matters, because
 * the end that needs to say what it is waiting for is the blocked one, and that is the end that
 * stores nothing. The words come from `gateLabel` in the shared contract, through `GateMark`, so
 * the pipeline drawing and this panel cannot describe one stored pair two ways.
 *
 * A `blocks` LINK WITH NO GATE IS NOT A HARD GATE. Every link written before the gate columns
 * existed has nothing stored, and that means the author said A blocks B and said nothing about how
 * much. Drawing it as hard would put a word in their mouth and make work that is mostly doable look
 * completely stuck, so the row says plainly that nobody has said.
 *
 * A link whose other end has been deleted comes back marked `broken`. It stays in the list, in the
 * alarm colour, with the restore button next to it. Hiding it would lose the fact that the
 * connection ever existed, which is the failure this whole project is aimed at.
 */

import { t } from '@shared/i18n.ts'
import { isARecordId } from '@shared/messages.ts'
import { kindWord, linkWord } from '@shared/words.ts'
import { TieredPress } from './TieredPress.tsx'
import type { RecordKind } from '@shared/types.ts'
import type { TitleOption } from '@shared/blocks.ts'
import { useEffect, useId, useState } from 'react'
import type { Gate, GateKind } from '@shared/work.ts'
import { LINK_TYPES, isAnAnsweringLink, type GatedLink, type LinkGate, type LinkType, type ResolvedLink } from '@shared/types.ts'
import { faultOf, api, errorMessage } from '../api.ts'
import { useInspect } from '../lib/mode.ts'
import { currentWorkspace } from '../lib/workspace.ts'
import { writerNamed, type ParticipantsNamed } from '../lib/participant-lookup.ts'
import { declaredAttributes, type Declares } from './declares.ts'
import { everyRelationGroup } from '@shared/sections.ts'
import { theLinkedRecord } from './sections.ts'
import { DRAWS_THE_NAME } from './agent/pointing.ts'
import { recordPath } from './router.tsx'
import {
  Absence,
  Btn,
  ErrorNote,
  Explain,
  Field,
  GateMark,
  IncompleteMark,
  LinkMark,
  Panel,
  Row,
  Select,
  Stamp,
  StateChip,
  Tag,
  TextInput,
  OriginMark,
} from './ui.tsx'

const LINK_TYPE_KEYS = Object.keys(LINK_TYPES) as LinkType[]

/** The one link type that states a dependency, and so the only one a gate may ride on. */
const GATED_LINK_TYPE: LinkType = 'blocks'
const LINK_UNDO_MS = 10_000

// ============================================================================ the gate on a link

/**
 * The three gate fields, as a reply that may not have carried them.
 *
 * `LinkGate` is declared once, in shared/types.ts, with all three REQUIRED, because every link the
 * server serves goes through `readLinkGate` and comes back with all three. `RecordDetail.links` in
 * web/api.ts now says so too. This file used to keep its own optional copy of the three fields,
 * because at the time neither of those files was this pass's to change — one fact in three places,
 * and the browser's copy was the one that could go quietly wrong.
 *
 * `Partial` is what is left, and it is not the same thing. It exists for `gateOf` below, which
 * accepts a link whose reply did not carry the fields at all and answers `not-served` — a real
 * fifth answer, distinct from "nobody stated a gate". Saying that with `Partial<LinkGate>` keeps it
 * derived from the one declaration, so a fourth gate field would reach this reader on its own.
 */
export type LinkGateFields = Partial<LinkGate>

/** Re-exported so the pages and drawings that already import it from here keep working. It is the
 *  shared declaration, not a copy — there is nothing left in this file for it to disagree with. */
export type { GatedLink }

/** What this row can honestly say about how much the link blocks. Five answers, never four. */
export type GateReading =
  | { at: 'not-a-dependency' }
  | { at: 'not-served' }
  | { at: 'unstated' }
  | { at: 'unreadable'; problem: string }
  | { at: 'gate'; gate: Gate }

/**
 * WHAT `gateOf` NEEDS, which is less than a `GatedLink`: the type, and the three gate fields.
 *
 * It is written as its own type because two callers hold two different link shapes. A record page
 * has a `ResolvedLink` — one end, a point of view — and the structure drawing has a row from
 * `GET /api/links`, which names both ends and has no point of view at all. Reading the gate does
 * not depend on which of those you are holding, and asking for the wider shape would have meant
 * the drawing inventing an `other` and an `isBacklink` to satisfy a parameter nothing reads.
 */
export type GateBearing = { type: LinkType } & LinkGateFields

export function gateOf(link: GateBearing): GateReading {
  // Only `blocks` states a dependency. `consumes` says what a thing is made of and `part_of` says
  // where it sits; neither can be half-blocking, and drawing a gate slot on them would invite one.
  if (link.type !== GATED_LINK_TYPE) return { at: 'not-a-dependency' }
  if (!('gate' in link)) return { at: 'not-served' }
  if (typeof link.gateProblem === 'string' && link.gateProblem.trim() !== '') {
    return { at: 'unreadable', problem: link.gateProblem }
  }
  const gate = link.gate
  if (gate === null || gate === undefined) return { at: 'unstated' }
  return { at: 'gate', gate }
}

/**
 * How the gate reads from THIS record's side, in one sentence.
 *
 * Written from the direction, because the same stored pair means two different things at the two
 * ends: on the blocked end it says what this record is waiting for, and on the other it says how
 * much this record is holding something else up. `GateMark` carries the shared wording; this adds
 * only whose problem it is.
 */
export function gateSentence(link: GatedLink, reading: GateReading, inspect = false): string | null {
  const waiting = link.isBacklink
  const them = `“${link.other.title}”`
  switch (reading.at) {
    case 'not-a-dependency':
      return null
    case 'not-served':
      return t('record.links.notServed')
    case 'unstated':
      return waiting
        ? t('record.links.unstatedIn', { title: them })
        : t('record.links.unstatedOut', { title: them })
    case 'unreadable':
      return inspect ? reading.problem : t('record.links.unreadableGate')
    case 'gate':
      if (reading.gate.kind === 'hard') {
        return waiting
          ? t('record.links.hardIn', { title: them })
          : t('record.links.hardOut', { title: them })
      }
      return waiting
        ? t('record.links.partialIn', { title: them, stage: reading.gate.upTo ?? t('record.links.unstated') })
        : t('record.links.partialOut', { title: them, stage: reading.gate.upTo ?? t('record.links.unstated') })
  }
}

// ============================================================================ one link

/**
 * How complete the record at the other end is, when that can be known.
 *
 * A link does not carry the other record's `data`, so its completeness cannot be worked out from
 * the link alone; it comes from the workspace listing the page already loads. `'not-shown'` means
 * the caller is not in the business of completeness. `'unknown'` means the listing did not have
 * this record and it is not deleted either, which is a disagreement worth naming rather than
 * passing off as a complete record.
 */
export type Unfilled = number | 'unknown' | 'not-shown'

function LinkRow({
  link,
  recordId,
  titleById,
  participants,
  onUnlinked,
  unfilled,
  editable,
  onChanged,
}: {
  link: GatedLink
  recordId: string
  titleById: ReadonlyMap<string, string>
  /** The registries, so an answer names its writer by the name a person knows them by. */
  participants: ParticipantsNamed | undefined
  onUnlinked: (id: string) => void
  unfilled: Unfilled
  editable: boolean
  onChanged: () => void
}) {
  const inspect = useInspect()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const [removedUntil, setRemovedUntil] = useState<number | null>(null)
  const [lookedUpGateName, setLookedUpGateName] = useState<{ id: string; title: string | null } | null>(null)

  // Keep the row mounted while its undo is offered. Refreshing now would discard that offer.
  useEffect(() => {
    if (removedUntil === null) return
    const timer = window.setTimeout(onChanged, Math.max(0, removedUntil - Date.now()))
    return () => window.clearTimeout(timer)
  }, [removedUntil, onChanged])

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      onChanged()
    } catch (err) {
      setError({ message: errorMessage(err), fault: faultOf(err) })
    } finally {
      setBusy(false)
    }
  }

  const gate = gateOf(link)
  // A partial gate can name a stage by record id. That id is useful in Inspect, but in the normal
  // reader the gate's count and sentence name the step. Link titles already on this page answer
  // without another read; a block that is not linked here is fetched by its id. The server says
  // which sort the stage is (`gateStage`): a stage it stored as words or as a checklist item is not a
  // record and is never looked up. A link written before the sort was stored is looked up when its
  // stage has the shape of a record id.
  const gateRecordId = gate.at === 'gate' && gate.gate.kind === 'partial' &&
    link.gateStage !== 'words' && link.gateStage !== 'item' &&
    typeof gate.gate.upTo === 'string' && isARecordId(gate.gate.upTo)
    ? gate.gate.upTo
    : null
  const knownGateName = gateRecordId === null ? undefined : titleById.get(gateRecordId)
  const cachedGateName = gateRecordId !== null && lookedUpGateName?.id === gateRecordId
    ? lookedUpGateName.title
    : undefined

  useEffect(() => {
    if (inspect || gateRecordId === null || knownGateName !== undefined || cachedGateName !== undefined) return
    let current = true
    void api.getRecord(gateRecordId).then(({ record }) => {
      if (current) setLookedUpGateName({ id: gateRecordId, title: record.title })
    }).catch(() => {
      if (current) setLookedUpGateName({ id: gateRecordId, title: null })
    })
    return () => { current = false }
  }, [inspect, gateRecordId, knownGateName, cachedGateName])

  const resolvedGateName = knownGateName ?? cachedGateName
  const gateNameForReader = gateRecordId === null || inspect
    ? (gate.at === 'gate' && gate.gate.kind === 'partial' ? gate.gate.upTo : undefined)
    : resolvedGateName === undefined
      ? undefined
      : resolvedGateName ?? t('g2d.links.stepNameUnavailable')
  const readerGate: GateReading | null = gate.at === 'gate' && gate.gate.kind === 'partial' &&
    gateRecordId !== null && !inspect
    ? gateNameForReader === undefined
      ? null
      : { at: 'gate', gate: { ...gate.gate, upTo: gateNameForReader } }
    : gate
  const sentence = readerGate === null ? null : gateSentence(link, readerGate, inspect)
  // THE LINK'S OWN WRITER, for the two types that answer a plan. `createdByType` null means the
  // row records no kind and so cannot name a person or an agent; an empty id is no id at all.
  const answerWriter =
    link.createdBy === undefined || link.createdBy.trim() === '' || link.createdByType === undefined || link.createdByType === null
      ? null
      : { actorType: link.createdByType, actorId: link.createdBy }
  const answerAt = link.createdAt !== undefined && link.createdAt.trim() !== '' ? link.createdAt : null

  return (
    // The dashed edge is the app's reserved signal: Mole Office worked this link out and nobody has
    // confirmed it. It is on the row as well as on the mark so the difference survives a glance
    // down a list of twelve links, where nobody is reading any single chip.
    <div
      className="lp-link"
      data-inferred={link.inferred ? '1' : undefined}
      // THE ROW IS THE RECORD IT NAMES, and until 30 August 2026 it was nothing at all. Measured
      // across their five records: 120 anchors whose address is another record, 4 resolving to that
      // record and 116 resolving to the record they were printed on.
      //
      // IT IS DECLARED ON THE WRAPPER AND NOT THROUGH `Row.target`, AND THAT IS NOT A PREFERENCE.
      // A `Row` given a record target draws that record's id beside the title — round eleven
      // section 9, *"identity + meaning, never identity alone"* — and this panel's own criterion is
      // the opposite: tests/record-tiers.test.ts fails when a link row shows an id in normal mode,
      // because a list of twelve neighbours read as sentences is what this panel is for. Both rules
      // are right about their own surface, so the row says what it is without becoming a record row.
      //
      // A COMMENT LEFT HERE NOW BELONGS TO THE RECORD THIS ROW NAMES. That is a behaviour change and
      // it is the point: a review of the linked record collects it, and a review of the page it was
      // written on does not. `theLinkedRecord` in components/sections.ts carries the argument.
      {...declaredAttributes(theLinkedRecord(link.other.id, currentWorkspace()))}
    >
      <Row
        cols={LINK_COLS}
        // Broken takes the severity column, because a far end that is gone is the first thing to
        // say about the row. The link's own type and whether anybody asserted it move to the mark
        // beside the title, where they are still both drawn.
        state={link.broken ? 'broken' : undefined}
        sev={link.broken ? undefined : <LinkMark type={link.type} direction={link.isBacklink ? 'reverse' : 'forward'} inferred={link.inferred} />}
        leading={
          <span className="lp-lead">
            {link.broken ? <LinkMark type={link.type} direction={link.isBacklink ? 'reverse' : 'forward'} inferred={link.inferred} broken /> : null}
            <Tag kind={link.other.kind} />
            {/* HOW THE NEIGHBOUR GOT HERE. A link row is the other place a reader meets a record
                before opening it, and it used to carry id, kind, title and summary and no mark —
                so a claim leaning on a fixture record read exactly like one leaning on real work. */}
            <OriginMark record={link.other} />
            {typeof unfilled === 'number' ? (
              <IncompleteMark count={unfilled} what={kindWord(link.other.kind).text} />
            ) : null}
            {/* A deleted record is absent from the listing by design, and the row already says
                `broken`, which is the bigger fact about it. Any OTHER absence is a disagreement
                between two things that should agree, and it is named rather than passed off as
                a complete record. */}
            {unfilled === 'unknown' && !link.broken ? (
              <Tag
                tone="warn"
                title={
                  t('record.links.unknownCompleteness')
                }
              >
                {t('record.links.notChecked')}
              </Tag>
            ) : null}
          </span>
        }
        // WHICH PART OF THE ROW IS THE NAME. `Row` marks its own title when it is given a `target`,
        // and this row's target is on the wrapper above, so the mark is put here instead — same
        // attribute, same reader. Without it the chip above the composer reads the whole row back:
        // the severity chip, the tags and the summary, all of it, as one name.
        title={<span {...DRAWS_THE_NAME}>{link.other.title}</span>}
        href={link.broken ? undefined : `#${recordPath(link.other.id, link.other.kind)}`}
        meta={
          <span className="lp-meta">
            {link.broken ? (
              <span className="lp-gone">
                {t('record.links.deleted', { title: link.other.title })}
              </span>
            ) : link.other.summary !== null ? (
              <span className="lp-summary">{link.other.summary}</span>
            ) : null}
            {isAnAnsweringLink(link.type) ? (
              <span className="lp-answer">
                {answerWriter === null
                  ? t('record.links.answerAuthorUnknown')
                  : t('record.links.answerBy', { who: writerNamed(answerWriter, participants) })}
                {answerAt === null ? (
                  <span className="lp-answer-time">{t('record.links.answerTimeUnknown')}</span>
                ) : (
                  <Stamp at={answerAt} />
                )}
              </span>
            ) : null}
            {gate.at === 'not-a-dependency' ? null : (
              <span className="lp-gate">
                {readerGate?.at === 'gate' ? <GateMark gate={readerGate.gate} /> : null}
                {gate.at === 'unreadable' ? <GateMark gate={{ kind: 'hard' }} problem={inspect ? gate.problem : t('record.links.unreadableGate')} /> : null}
                {sentence === null ? null : <span className="lp-gate-said">{sentence}</span>}
              </span>
            )}
          </span>
        }
        right={
          <>
            {link.broken ? (
              <Btn size="sm" variant="primary" pending={busy} onClick={() => void run(() => api.restoreRecord(link.other.id))}>
                {t('record.links.restore')}
              </Btn>
            ) : null}
            {/* UNDOING ONE JOIN IS AN EDIT TO THE GRAPH, and it was a button on every row of every
                record page — twelve chances to delete a relationship on a page somebody opened to
                read one. It is still one switch away and nothing about it has changed; what has
                gone is a destructive control sitting in the reading path by default. */}
            {editable && inspect ? link.inferred || gate.at === 'unreadable' || gate.at === 'not-served' ? (
              <Btn size="sm" variant="ghost" pending={busy} onClick={() => void run(() => api.deleteLink(link.linkId))}>
                {t('record.links.unlink')}
              </Btn>
            ) : (
              <TieredPress tier="undo" size="sm" available={removedUntil === null} windowMs={LINK_UNDO_MS}
                press={t('record.links.unlink')} pending={t('record.links.unlinking')} done={t('record.links.unlinked')}
                undo={seconds => t('record.links.undo', { seconds })} undoing={t('record.links.undoing')}
                onPress={async () => {
                  const input = {
                    fromId: link.isBacklink ? link.other.id : recordId,
                    toId: link.isBacklink ? recordId : link.other.id,
                    type: link.type,
                    ...(gate.at === 'gate' ? { gate: gate.gate } : {}),
                  }
                  const started = Date.now()
                  await api.deleteLink(link.linkId)
                  setRemovedUntil(started + LINK_UNDO_MS)
                  onUnlinked(link.linkId)
                  return { remainingMs: Math.max(0, LINK_UNDO_MS - (Date.now() - started)), undo: async () => {
                    const restored = await api.createLink(input)
                    const current = await api.getRecord(recordId)
                    const joined = current.links.find(one => one.linkId === restored.id)
                    if (joined === undefined || joined.inferred || JSON.stringify(joined.gate) !== JSON.stringify(link.gate)) {
                      throw new Error(t('record.links.undoChanged'))
                    }
                    setRemovedUntil(null)
                    onChanged()
                  } }
                }} />
            ) : null}
          </>
        }
      />
      {error ? <ErrorNote message={error.message} fault={error.fault} /> : null}
    </div>
  )
}

/**
 * ONE LIST OF LINK ROWS, GROUPED BY THE RELATION THEY ARE READ UNDER, EACH GROUP DECLARING IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, AND WHY A GROUP HAD TO EXIST AS AN ELEMENT
 * ---------------------------------------------------------------------------------------
 *
 * Every row here already declares the record it names — see `LinkRow` above. What a press on one
 * could not say was how the reader got to it. Measured on 31 August 2026 on report `m2Q0CybxoGNF`,
 * which is the report in their own screenshot: twenty rows in this panel, four pressed, four
 * composers naming the linked record and every one of them with NO "met on" chip at all, against
 * five rows in the rail above that each said *Met under “subject of” on “Round eight …” — report*.
 * Two of their four conditions — the relation, and the page it was met on — were being dropped by the
 * longest list of link rows on the page.
 *
 * The cause is mechanical: `theRegionThisWasDrawnIn` reads the nearest addressable element ABOVE
 * the row, and this panel put its rows in one flat list that said nothing. The rail says it with
 * `li.rd-relation`. This is the same declaration, on the same key, from the same function.
 *
 * ---------------------------------------------------------------------------------------
 * THE GROUP DRAWS NO BOX
 * ---------------------------------------------------------------------------------------
 *
 * `display: contents`, so the rows stay exactly where they were in this panel's own layout: this
 * step is about what a press answers and not about what the panel looks like. What the rows gain is
 * an order — the links come grouped by relation now instead of in the order the server sent them.
 *
 * ---------------------------------------------------------------------------------------
 * THE GROUP DECLARES NOTHING, AND THAT IS A CHANGE MADE ON 2 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * This group used to declare `section.<relation>`, the same region id the rail's own sentence list
 * declares, and the argument for it was that `MarkLayer` takes the first element carrying a key and
 * the rail comes first in the document. That argument was wrong in the way this repository keeps
 * finding: it made the region id name two elements, so the id no longer named a place. The owner
 * met the result by hand — a composer naming one row while the dashed frame was drawn round
 * another — and the rule they set is that the thing under the mouse, the composer's target and the
 * boxed thing are one thing. A key that names two elements cannot keep that promise.
 *
 * NOTHING IS LOST BY THE GROUP SAYING NOTHING. Each row declares the record it names, so a press on
 * a row still answers that record. The walk up from a row now reaches this panel, which declares
 * `section.links` — so a press in the fold says it was met under *Links*, which is where it was
 * met. The rail's list still declares each relation, and it is now the only element that does.
 *
 * IT CARRIES NO NAME EITHER. A `data-name` on an element carrying no target is read as the name of
 * whatever encloses it — `nameSaidBy` in components/agent/pointing.ts — so a name here would be
 * given to the panel, whose name is already *Links*.
 */
function LinkRows({
  links,
  recordId,
  titleById,
  onUnlinked,
  unfilledFor,
  participants,
  editable,
  onChanged,
}: {
  links: readonly GatedLink[]
  recordId: string
  titleById: ReadonlyMap<string, string>
  onUnlinked: (id: string) => void
  unfilledFor: (otherId: string) => Unfilled
  /** The registries, so an answer row names its writer. */
  participants: ParticipantsNamed | undefined
  editable: boolean
  onChanged: () => void
}) {
  return (
    <div className="lp-list">
      {everyRelationGroup(links).map((group) => {
        return (
          <div key={group.relation} className="lp-relation">
            {group.rows.map((l) => (
              <LinkRow
                key={l.linkId}
                link={l}
                recordId={recordId}
                titleById={titleById}
                participants={participants}
                onUnlinked={onUnlinked}
                unfilled={unfilledFor(l.other.id)}
                editable={editable}
                onChanged={onChanged}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ============================================================================ adding a link

/** The three answers to "how much does this block", as a control. Absent is one of them. */
type GateChoice = '' | GateKind

const gateOptions = (): { value: GateChoice; label: string }[] => [
  { value: '', label: t('record.links.gateUnstated') },
  { value: 'hard', label: t('record.links.gateHard') },
  { value: 'partial', label: t('record.links.gatePartial') },
]

/**
 * The title box, with the workspace's titles as suggestions.
 *
 * Written out rather than composed from `Field` + `TextInput`, for one reason: `TextInputProps` has
 * no `list`, so a TextInput cannot be attached to a datalist. Both earlier versions of this panel
 * rendered `<datalist id="mole-office-titles">` next to an input that never referenced it — markup that
 * looks like a suggestion list and is not one, which is worse than no suggestions at all. Every
 * class here is one the component library already styles, and the label, the hint and the input are
 * wired by hand with `useId` because Field hands its generated id down a context only its own two
 * controls read.
 */
function TitleField({
  value,
  onChange,
  knownTitles,
}: {
  value: string
  onChange: (next: string) => void
  knownTitles: readonly TitleOption[]
}) {
  const inspect = useInspect()
  const base = useId()
  const id = `${base}-c`
  const hintId = `${base}-h`
  const listId = `${base}-l`
  // THE SUGGESTIONS ARE DRAWN WHEN THE BOX IS FIRST USED, and stay drawn. A browser shows a datalist only to a box that
  // has the focus, so nobody sees the list sooner. Drawn with the form, the 116,300 or so titles of the made-up office
  // shaped like the live project took about 250 ms of the edit form's wait (wave 13y round 143).
  const [used, setUsed] = useState(false)
  return (
    <div className="px-field">
      <label className="px-label" htmlFor={id}>
        {t('record.links.title')}
      </label>
      <input
        className="px-input"
        type="text"
        id={id}
        list={listId}
        value={value}
        aria-describedby={inspect ? hintId : undefined}
        placeholder={t('record.links.titleExample')}
        onFocus={() => setUsed(true)}
        onChange={(e) => onChange(e.target.value)}
      />
      {/* THE NOTE BESIDE A TITLE TWO RECORDS ANSWER TO, by criterion D23 and a decision.
          Titles may repeat, and a block's title is now its own name with no pipeline in it, so two
          steps called "Calibrate" read identically here. `titleOptions` in shared/blocks.ts works
          out what tells them apart — for a block, the pipeline or pipelines listing it — and puts
          it in the option's label, which a browser draws beside the value. A title only one record
          answers to gets no note, because a note on every row is a note nobody reads. */}
      <datalist id={listId}>
        {used
          ? knownTitles.map((one) => <option key={one.id} value={one.value} label={one.note ?? undefined} />)
          : null}
      </datalist>
      {/* A storage note, and it answers a question only somebody who knows there IS a stored
          direction can ask. In normal mode the form takes a title and a word and says so. */}
      {inspect ? (
        <span className="px-hint" id={hintId}>
          {t('record.links.reverseNote')}
        </span>
      ) : null}
    </div>
  )
}

function AddLinkForm({
  fromId,
  knownTitles,
  onChanged,
}: {
  fromId: string
  knownTitles: readonly TitleOption[]
  onChanged: () => void
}) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState<LinkType>('relates_to')
  const [gate, setGate] = useState<GateChoice>('')
  const [upTo, setUpTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)

  const gated = type === GATED_LINK_TYPE

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (title.trim() === '') return
    setBusy(true)
    setError(null)
    try {
      // Deliberately sends the title, not an id: an unknown title must be the server's refusal,
      // not a record this form invented to make itself succeed. The gate is sent exactly as it was
      // typed, including a partial with no stage — the server refuses that with a sentence saying
      // what to send instead, and correcting it here would hide the rule from the person writing it.
      const chosen: Gate | undefined =
        !gated || gate === ''
          ? undefined
          : gate === 'partial'
            ? { kind: 'partial', upTo: upTo.trim() }
            : { kind: 'hard' }
      await api.createLink({
        fromId,
        toTitle: title.trim(),
        type,
        ...(chosen === undefined ? {} : { gate: chosen }),
      })
      setTitle('')
      setUpTo('')
      onChanged()
    } catch (err) {
      setError({ message: errorMessage(err), fault: faultOf(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="lp-add" onSubmit={(e) => void submit(e)}>
      <div className="lp-add-line">
        <Field label={t('record.links.thisRecord')}>
          <Select<LinkType>
            value={type}
            onChange={setType}
            options={LINK_TYPE_KEYS.map((key) => ({ value: key, label: linkWord(key, 'forward').text }))}
          />
        </Field>
        <TitleField value={title} onChange={setTitle} knownTitles={knownTitles} />
      </div>

      {/* Only `blocks` may carry a gate, so the control exists only when the type is `blocks`.
          Leaving it at "nobody has said" is a real answer and the common one for old links. */}
      {gated ? (
        <div className="lp-add-line">
          {/* The three answers are the three options in the control, so the caption under it said
              nothing the control did not. What stays is the one thing the options cannot say:
              leaving it alone is not the same as saying it blocks completely. */}
          <Field label={t('record.links.howMuch')}>
            <Select<GateChoice> value={gate} onChange={setGate} options={gateOptions()} />
          </Field>
          {gate === 'partial' ? (
            <Field label={t('record.links.upTo')}>
              <TextInput value={upTo} onChange={setUpTo} placeholder={t('record.links.stageExample')} />
            </Field>
          ) : null}
        </div>
      ) : null}

      {error ? <ErrorNote message={error.message} fault={error.fault} /> : null}

      <div className="lp-add-act">
        <Btn
          type="submit"
          variant="primary"
          pending={busy}
          disabled={title.trim() === ''}
          reason={t('record.links.titleRequired')}
        >
          {t('record.links.add')}
        </Btn>
      </div>
    </form>
  )
}

// ============================================================================ the panel

/**
 * The link row's grid.
 *
 * A wider severity column than the app's 112px default, because what sits in it here is the link
 * TYPE as a word — "superseded by", "contradicted by" — and a link type nobody can read is a row
 * with no verb in it.
 */
const LINK_COLS = '160px minmax(0, 1fr) auto'

/** The one sentence that says what this record is waiting for, or null when it waits on nothing. */
export function waitingNote(links: readonly GatedLink[]): string | null {
  const waiting = links.filter((l) => l.isBacklink && l.type === GATED_LINK_TYPE && !l.broken)
  if (waiting.length === 0) return null
  const counts = { hard: 0, partial: 0, unstated: 0, unreadable: 0 }
  for (const link of waiting) {
    const reading = gateOf(link)
    if (reading.at === 'gate') counts[reading.gate.kind] += 1
    else if (reading.at === 'unreadable') counts.unreadable += 1
    else counts.unstated += 1
  }
  // One thing waited on needs no arithmetic, and "waiting for 1 thing: 1 that must finish first"
  // is the sentence a count-everything rule writes when it is not looking.
  if (waiting.length === 1) {
    const only =
      counts.hard === 1
        ? t('record.links.waitHard')
        : counts.partial === 1
          ? t('record.links.waitPartial')
          : counts.unreadable === 1
            ? t('record.links.waitUnreadable')
            : t('record.links.waitUnstated')
    return t('record.links.waitOne', { reason: only })
  }

  const parts: string[] = []
  if (counts.hard > 0) parts.push(t('record.links.countHard', { n: counts.hard }))
  if (counts.partial > 0) parts.push(t('record.links.countPartial', { n: counts.partial }))
  if (counts.unstated > 0) parts.push(t('record.links.countUnstated', { n: counts.unstated }))
  if (counts.unreadable > 0) parts.push(t('record.links.countUnreadable', { n: counts.unreadable }))
  const list =
    parts.length === 1
      ? parts[0]
      : t('record.links.lastReason', { before: parts.slice(0, -1).join(t('record.links.listSeparator')), last: parts[parts.length - 1] ?? '' })
  return t('record.links.waitMany', { n: waiting.length, reasons: list ?? '' })
}

/**
 * How many of the links on this record nobody has confirmed, as one sentence.
 *
 * Written out here rather than assembled in the markup because the awkward cases are the SMALL
 * ones, and a record with a single inferred link is the common case rather than a corner: "1 of
 * these 1 links was worked out" is the sentence a count-everything rule writes when it is not
 * looking. `waitingNote` above is written out for the same reason and the two now agree about it.
 *
 * Null when nothing was inferred, so the caller draws no disclosure at all — a fold that opens onto
 * "none of them" is a dead end.
 */
export function inferredNote(inferred: number, total: number): string | null {
  if (inferred <= 0) return null
  if (total === 1) return t('record.links.oneInferred')
  if (inferred === total) {
    return t('record.links.allInferred', { n: total })
  }
  if (inferred === 1) return t('record.links.someInferred', { n: 1, total })
  return t('record.links.someInferred', { n: inferred, total })
}

export function LinkPanel({
  declares,
  kind,
  recordId,
  links,
  knownTitles,
  unfilledByRecord,
  participants,
  editable,
  onChanged,
}: {
  /**
   * WHAT THE PANEL ITSELF IS: `section.links` of the record whose page this is.
   *
   * IT IS THE ONLY REGION THIS PANEL DECLARES, and that is the point. A row is inside a relation's
   * list, a relation's list is inside this panel, and this panel is a place on one record's page.
   * Until 31 August 2026 the panel said nothing, so a press on the word *Links* or on the count
   * beside it walked past every row to the whole record — measured on all eight record pages the
   * re-gate reads, two presses on each, eight out of eight. The relation groups inside it declared
   * a region too until 2 September 2026; see `LinkRows` for why they stopped.
   */
  declares: Declares
  /** The record's kind, so this panel's heading is the name the declaration holds and not a literal. */
  kind: RecordKind
  recordId: string
  links: readonly GatedLink[]
  knownTitles: readonly TitleOption[]
  /**
   * How many fields each record in the workspace still needs, by record id.
   *
   * OPTIONAL, the same way `Row`'s `state` is: leaving it out means this panel is not in the
   * business of completeness, not that everything is complete. A record MISSING from the map is a
   * deleted one — the listing it comes from is the only thing that leaves deleted records out —
   * and any other absence is drawn as an explicit "unknown" rather than passed off as complete.
   */
  unfilledByRecord?: ReadonlyMap<string, number>
  /**
   * The registries, so a `realises` or `instead_of` row names the person or agent who wrote it.
   * Optional for a caller that draws the panel with no lookup; the row then says the writer is not
   * recorded rather than printing a stored id.
   */
  participants?: ParticipantsNamed
  editable: boolean
  onChanged: () => void
}) {
  const inspect = useInspect()
  const [unlinked, setUnlinked] = useState<ReadonlySet<string>>(new Set())
  const onUnlinked = (id: string) => setUnlinked(before => new Set([...before, id]))
  const activeLinks = links.filter(link => !unlinked.has(link.linkId))
  const titleById = new Map(knownTitles.map((one) => [one.id, one.value]))
  for (const link of links) titleById.set(link.other.id, link.other.title)
  const outgoing = links.filter((l) => !l.isBacklink)
  const incoming = links.filter((l) => l.isBacklink)
  const broken = activeLinks.filter((l) => l.broken).length
  const inferred = activeLinks.filter((l) => l.inferred).length
  const inferredSaid = inferredNote(inferred, activeLinks.length)
  const waiting = waitingNote(activeLinks)

  const unfilledFor = (otherId: string): Unfilled =>
    unfilledByRecord === undefined ? 'not-shown' : (unfilledByRecord.get(otherId) ?? 'unknown')

  return (
    <>
      <style href="mole-office-links" precedence="default">
        {LINK_CSS}
      </style>
      <Panel declares={declares}
        titleIs="label" title={t('record.links.heading')}
        // WHICH WAY EACH LINK IS STORED IS A FACT ABOUT THE DATABASE, not about the work. It is
        // the panel's eyebrow in Inspect and nothing at all in normal mode, where the rows below
        // read as sentences that already carry the direction in their words.
        {...(inspect ? { kind: t('record.links.bothDirections') } : {})}
        // A broken link is the one fact on this panel that needs a human, so the whole panel
        // becomes an alarm when there is one. Nothing else on it ranks itself up.
        rank={broken > 0 ? 0 : 1}
        tone="broken"
        actions={
          <span className="lp-actions">
            {broken > 0 ? <StateChip state="broken" label={t('record.links.broken', { n: broken })} /> : null}
            <Tag tone="quiet">{t('record.links.count', { n: activeLinks.length })}</Tag>
          </span>
        }
      >
        {waiting === null ? null : <p className="lp-waiting">{waiting}</p>}
        {/* THE COUNT IS THE FACT AND THE CONVENTION IS THE EXPLANATION, so they are drawn as two
            different things. How many of the links below nobody has confirmed is about THIS record
            and stays on screen; what a dashed edge means is about the app, is read once, and is
            behind the same `Explain` every other surface now uses for exactly this. Before this
            pass the whole thing was one permanent paragraph, which made this panel the only place
            left in the product that explained itself by default. */}
        {inferredSaid === null ? null : (
          <div className="lp-inferred">
            <Explain declares={{ surface: null }} meaning={inferredSaid} opens={t('record.links.dashMeaning')}>
              {/* The count clause that used to open this sentence is the line above it now, so
                  saying it twice would be the whole point of the fold undone. What is left is the
                  half a reader cannot work out for themselves, and "that" still points at the sentence
                  directly above it. */}
              <p className="lp-note">
                {t('record.links.dashed')}
              </p>
            </Explain>
          </div>
        )}

        {/* THE OUTGOING/INCOMING SPLIT IS A STORAGE FACT, AND EVERY ROW ALREADY SAYS WHICH WAY IT
            READS. The server sends `label` as the phrase from THIS record's point of view, so an
            incoming `supersedes` arrives worded "superseded by" and needs no heading above it to be
            understood. What the split adds is where the row is written down — which is what Inspect
            is for. One list also stops a record with links in only one direction being told, in a
            heading and an empty state, about a direction it has none of.

            Nothing is lost either way: the same rows, in the same order, drawn by the same
            component. */}
        {inspect ? (
          <>
            <h3 className="lp-group" data-title-is="its-label">
              {t('record.links.outgoing')} <span className="lp-group-note">{t('record.links.outgoingNote')}</span>
            </h3>
            {outgoing.length === 0 ? (
              <Absence word={t('record.links.noOutgoing')} />
            ) : (
              <LinkRows
                recordId={recordId}
                titleById={titleById}
                participants={participants}
                onUnlinked={onUnlinked}
                links={outgoing}
                unfilledFor={unfilledFor}
                editable={editable}
                onChanged={onChanged}
              />
            )}

            <h3 className="lp-group" data-title-is="its-label">
              {t('record.links.incoming')} <span className="lp-group-note">{t('record.links.incomingNote')}</span>
            </h3>
            {incoming.length === 0 ? (
              <Absence word={t('record.links.noIncoming')} />
            ) : (
              <LinkRows
                recordId={recordId}
                titleById={titleById}
                participants={participants}
                onUnlinked={onUnlinked}
                links={incoming}
                unfilledFor={unfilledFor}
                editable={editable}
                onChanged={onChanged}
              />
            )}
          </>
        ) : links.length === 0 ? (
          // ITS WORDS, NOT A DASH (wave 13k round 34). With the sentence only on the tooltip and for a
          // screen reader, an opened links panel drew a lone "—", which a reviewer read as broken (review
          // in 3Zgf2lTGanJw). The three empty answers here say what they mean, quietly, as words.
          <Absence word={t('record.links.none')} />
        ) : (
          <LinkRows
            recordId={recordId}
            titleById={titleById}
            participants={participants}
            onUnlinked={onUnlinked}
            links={[...outgoing, ...incoming]}
            unfilledFor={unfilledFor}
            editable={editable}
            onChanged={onChanged}
          />
        )}

        {/* No "restore this record first" line where the form would be. The page carries one alarm
            at the top saying the record is deleted, with the button that brings it back. */}
        {editable ? <AddLinkForm fromId={recordId} knownTitles={knownTitles} onChanged={onChanged} /> : null}
      </Panel>
    </>
  )
}

// ============================================================================ styles

/**
 * This panel's own geometry. Tokens only, hoisted and de-duplicated by href, so a preset swap
 * re-skins all of it with no code change — and so a class this file renders cannot end up with no
 * rules at all, which is how a links panel once shipped as a wall of run-together words.
 */
export const LINK_CSS = `
.lp-actions { display: flex; align-items: center; gap: var(--pad); flex-wrap: wrap; }

.lp-group {
  margin: var(--gut) 0 var(--pad);
  display: flex; align-items: baseline; gap: var(--pad) var(--gut); flex-wrap: wrap;
  font-size: var(--fs-2);
  font-weight: 600;
  color: var(--text);
}
.lp-group-note { font-size: var(--fs-1); font-weight: 400; color: var(--text-3); }

.lp-list { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
/* THE GROUP OF ONE RELATION'S ROWS DRAWS NO BOX. It exists to say which relation the rows inside
   it are read under, so a press on one can name the relation as well as the record; the rows keep
   the list's own spacing because display contents takes the wrapper out of the layout entirely. */
.lp-relation { display: contents; }
.lp-link { min-width: 0; }

/* THE RESERVED SIGNAL. Dashed means Mole Office worked it out and nobody confirmed it, here and in the
   inferred link mark and nowhere else. It is a left edge rather than a full box so that a row can
   still carry the alarm spine when its far end is deleted. */
.lp-link[data-inferred="1"] {
  border-left: var(--border-w) dashed var(--st-inferred);
  border-radius: var(--radius-sm);
  padding-left: var(--pad);
}

.lp-lead { display: inline-flex; align-items: center; gap: var(--pad); flex-wrap: wrap; min-width: 0; max-width: 100%; }
.px-row-lead:has(> .lp-lead) { flex: 0 1 auto; min-width: 0; }
.lp-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.lp-summary { overflow-wrap: anywhere; }
.lp-answer { display: flex; align-items: baseline; gap: 4px var(--pad); flex-wrap: wrap; color: var(--text-2); }
.lp-gone { color: var(--st-broken); }
.lp-gate { display: flex; align-items: center; gap: var(--pad); flex-wrap: wrap; min-width: 0; }
.lp-gate-said { color: var(--text-2); overflow-wrap: anywhere; }

.lp-waiting {
  margin: 0 0 var(--pad);
  padding: 0 var(--pad);
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  color: var(--text);
}
.lp-note {
  margin: 0 0 var(--pad);
  padding: 0 var(--pad);
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-3);
}

/* The fold that holds what a dashed edge means. It takes the gap the paragraph it replaced had, and
   the note inside it drops its own inset, because Explain already sets one. */
.lp-inferred { margin: 0 0 var(--pad); min-width: 0; }
.px-explain-body > .lp-note { margin: 0; padding: 0; }

.lp-add { display: flex; flex-direction: column; gap: var(--pad); margin-top: var(--gut); min-width: 0; }
.lp-add-line {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--pad) var(--gut);
  min-width: 0;
}
@container panel (min-width: 30rem) {
  .lp-add-line { grid-template-columns: minmax(0, 14rem) minmax(0, 1fr); align-items: start; }
}
.lp-add-act { display: flex; align-items: center; gap: var(--pad); flex-wrap: wrap; }
`
