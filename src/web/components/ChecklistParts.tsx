// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { t } from '@shared/i18n.ts'
import {
  isClosed,
  styleOfChecklistItem,
  WAITING_ON_THE_OWNER,
  type ChecklistEvidence,
  type ChecklistItemState,
  type ChecklistLinked,
  type ChecklistNamed,
  type ChecklistPress,
  type ChecklistReading,
  type ChecklistRequest,
  type EvidenceChoice,
  type EvidenceKind,
} from '@shared/checklists.ts'
import type { EnteredFlowEndsOn, FlowOnAChecklist, FlowRunEnding } from '@shared/flow-run.ts'
import { sameParticipant } from '@shared/messages.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import type { RecordKind } from '@shared/types.ts'
import { api, errorMessage, faultOf } from '../api.ts'
import { TheItemsWords, theLinksInTheWords } from '../lib/item-words.tsx'
import { messagePath, recordPath, RouteLink } from './router.tsx'
import { ThePressReason } from './ThePressReason.tsx'
import { Btn, ErrorNote, Loading, theRefusalInWords, type AsyncState } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
/**
 * THE PARTS THE CHECKLISTS PAGE AND THE CHECKLISTS WINDOW BOTH DRAW: an item, its state, its evidence, its
 * owner and its checklist's progress.
 *
 * LESS ON EACH ITEM, by point 3 of a decision. A row shows its mark and its words, whole,
 * and a state in words only where somebody must act: an item waiting on the owner. Everything else about an
 * item is one level down, under the item itself when it is opened: its state, the message it came from, the
 * manual flag, its evidence, what replaced it and its reminder. None of those is printed on every row.
 *
 * AN ITEM'S LINKS OPEN THEIR RECORDS, one level down with the rest, as wave 13j round 57
 * decided. Each says the record's title, read from the checklist's `linked`, and a manual
 * section says its block too.
 */

/**
 * WHETHER THE WINDOW AT THE TOP RIGHT IS SHOWN IN THIS BROWSER. It is shown until somebody switches it off on
 * the checklists page, because the owner's own checklists are meant to be read there.
 *
 * A BROWSER THAT REFUSES SITE STORAGE throws on `window.localStorage` itself. There the switch cannot be kept,
 * so the window stays shown and the page says why its switch does nothing; it is never switched for this page
 * alone as though it had been kept.
 */
const WINDOW_SWITCH = 'mole-office.checklists.window'

export function theChecklistsWindowSwitch(): 'on' | 'off' | 'not kept' {
  try {
    return window.localStorage.getItem(WINDOW_SWITCH) === 'off' ? 'off' : 'on'
  } catch {
    return 'not kept'
  }
}

export function checklistsWindowIsOn(): boolean {
  return theChecklistsWindowSwitch() !== 'off'
}

/** Keeps the switch and tells the window. False when this browser keeps nothing, and then nothing changed. */
export function switchTheChecklistsWindow(on: boolean): boolean {
  try {
    window.localStorage.setItem(WINDOW_SWITCH, on ? 'on' : 'off')
  } catch {
    return false
  }
  window.dispatchEvent(new Event(WINDOW_SWITCH))
  return true
}

/** The event `switchTheChecklistsWindow` sends, so the window appears or goes without a reload. */
export const WINDOW_SWITCHED = WINDOW_SWITCH

/** The class of the checklists window's press. The review column reads it to be held below the press. */
export const CHECKLISTS_PRESS = 'ckw-press'

/**
 * AN ITEM WAITING ON THE OWNER SAYS "WAITS ON YOU", as decided: the browser is the person, so the owner it waits on is
 * the reader, under whoever's section the item stands.
 */
const STATE_KEYS = {
  open: 'checklists.state.open',
  'in progress': 'checklists.state.inProgress',
  'waiting on the owner': 'checklists.state.waitsOnYou',
  done: 'checklists.state.done',
  superseded: 'checklists.state.superseded',
} as const satisfies Record<ChecklistItemState, string>

/**
 * WHETHER AN ITEM IS OF THE EVIDENCE-OR-WORDS STYLE, the style a message asked for in wave 14a.
 * An item stored with no style reads as plain, so every item written before this round is plain too. The agent chooses
 * the style when it adds the item; it is not changed afterwards.
 */
export function aSpecialChecklistItem(item: ChecklistRequest): boolean {
  return styleOfChecklistItem(item) === 'evidence-or-words'
}

/**
 * The small mark before an item: a box, half filled, a question, a tick or a line through. An open standing item has no
 * box: three lines, as of a page, with no border. An item of the evidence-or-words
 * style that is not finished shows a pencil, because its box opens the picker rather than ticking it (wave 14a): the
 * icon says the press wants evidence or a few words, and it stays visible while the item is in progress or waiting on
 * the owner, whose colours the mark keeps from its state.
 */
export function ItemMark({ state, standing = false, special = false }: { state: ChecklistItemState; standing?: boolean; special?: boolean }) {
  const noBox = standing && state === 'open'
  const pencil = special && !isClosed(state) && !noBox
  return (
    <span
      className="ckp-mark"
      data-state={state}
      data-standing={noBox ? 'yes' : undefined}
      data-special={pencil ? 'yes' : undefined}
      aria-hidden="true"
    >
      {noBox ? '≡' : state === 'done' ? '✓' : state === 'superseded' ? '–' : pencil ? '✎' : state === 'waiting on the owner' ? '?' : ''}
    </span>
  )
}

/** What an item is, in words: its state, or for an open standing item that it is a standing item. */
function whatItIs(item: ChecklistRequest): string {
  return item.standing === true && item.state === 'open' ? t('w13j.checklistStanding.name') : t(STATE_KEYS[item.state])
}

/** Who owns a checklist, and whether that is a person or an agent. */
export function ownerWords(list: ChecklistReading): string {
  return t('checklists.ownedBy', {
    name: list.ownerName,
    kind: t(list.owner.kind === 'person' ? 'checklists.ownerKind.person' : 'checklists.ownerKind.agent'),
  })
}

/** The key one owner is filtered by: the door's own `kind:id` word. */
export function ownerKey(list: ChecklistReading): string {
  return `${list.owner.kind}:${list.owner.id}`
}

function evidenceWords(one: ChecklistEvidence): string {
  if (one.kind === 'commit') return t('checklists.evidence.commit', { hash: (one.commit ?? '').slice(0, 9) })
  if (one.kind === 'report') return t('checklists.evidence.report')
  if (one.kind === 'run') return t('checklists.evidence.run')
  return t('checklists.evidence.manual')
}

/** What the checklist's reading says of one record an item names, or undefined when the reading does not say. */
function theLinked(linked: readonly ChecklistLinked[] | undefined, id: string): ChecklistLinked | undefined {
  return linked?.find((one) => one.id === id)
}

/** The words for a record the reading could not title: not there, or a message this reader may not read. */
function notFoundWords(one: Extract<ChecklistLinked, { found: false }>): string {
  return t(one.because === 'no record' ? 'w13j.checklistLinks.noRecord' : 'w13j.checklistLinks.noMessage', { id: one.id })
}

/**
 * One piece of evidence: a link to the record it names, with its title and, for a manual section, its block; or a
 * commit's short hash, which has no page here. Without the reading's `linked` it says its kind alone, as before.
 */
export function EvidenceLink({ one, linked }: { one: ChecklistEvidence; linked?: readonly ChecklistLinked[] }) {
  if (one.record === undefined) return <code className="ckp-evidence">{evidenceWords(one)}</code>
  const record = theLinked(linked, one.record)
  if (record !== undefined && !record.found) return <span className="ckp-evidence">{`${evidenceWords(one)}: ${notFoundWords(record)}`}</span>
  const block = one.block === undefined || record === undefined ? undefined : record.blocks.find((each) => each.id === one.block)
  const words =
    record === undefined
      ? evidenceWords(one)
      : block === undefined
        ? t('w13j.checklistLinks.evidence', { kind: evidenceWords(one), title: record.title })
        : block.name === null
          ? t('w13j.checklistLinks.sectionGone', { kind: evidenceWords(one), block: block.id, title: record.title })
          : t('w13j.checklistLinks.section', { kind: evidenceWords(one), block: block.name, title: record.title })
  return (
    <RouteLink className="ckp-evidence" to={recordPath(one.record, record?.kind as RecordKind | undefined)}>
      {words}
    </RouteLink>
  )
}

/**
 * ONE RECORD AN ITEM IS ABOUT, from its `links`: a link that opens it, with its title. A link names only a record, never
 * a block. A record the reading could not title is said in words and not linked; one the reading does not mention is
 * linked by its id.
 */
function ItemLink({ id, linked }: { id: string; linked?: readonly ChecklistLinked[] }) {
  const record = theLinked(linked, id)
  return (
    <span className="ckp-fact ckp-link">
      {t('w13j.checklistLinks.about')}{' '}
      {record === undefined ? (
        <RouteLink to={recordPath(id)}>{id}</RouteLink>
      ) : record.found ? (
        <RouteLink to={recordPath(id, record.kind as RecordKind)}>{record.title}</RouteLink>
      ) : (
        notFoundWords(record)
      )}
    </span>
  )
}

/** A participant's name as the checklist's reading gives it, or its id when the reading does not name it. */
function nameIn(named: readonly ChecklistNamed[] | undefined, who: ParticipantRef): string {
  return named?.find((one) => sameParticipant(one.who, who))?.name ?? who.id
}

function namesIn(named: readonly ChecklistNamed[] | undefined, who: readonly ParticipantRef[]): string {
  return who.map((one) => nameIn(named, one)).join(', ')
}

/**
 * WHO WAS TOLD THAT THE PERSON MARKED THE ITEM DONE, from the mark the item door wrote.
 * Nothing at all for an item the person did not mark done.
 */
export function ToldWords({ item, named }: { item: ChecklistRequest; named?: readonly ChecklistNamed[] }) {
  const mark = item.doneByThePerson
  if (mark === undefined) return null
  return (
    <span className="ckp-fact ckp-told">
      {mark.told.length === 0 ? t('w13j.checklistDone.toldNobody') : t('w13j.checklistDone.told', { names: namesIn(named, mark.told) })}
    </span>
  )
}

/**
 * WHO ADDED THE ITEM, WHOM IT TELLS AND HOW THE PERSON MARKED IT DONE, in words. An item written
 * before 13 October 2026 says that nobody recorded who added it. Whom it tells is said only when the item names agents
 * of its own; otherwise the door tells whoever added it, which the line before says.
 */
function WhoFacts({ item, named, presses }: { item: ChecklistRequest; named?: readonly ChecklistNamed[]; presses?: readonly ChecklistPress[] }) {
  const mark = item.doneByThePerson
  // A MARK UNDER THE RAISE SAYS ITS PRESS'S REASON, which the checklist's reading gives from the press's row. A mark that
  // names no press, or a press with no row, says that no reason was written down.
  const reason = mark?.press === undefined ? null : (presses?.find((one) => one.id === mark.press)?.reason ?? null)
  return (
    <>
      <span className="ckp-fact">
        {item.addedBy === undefined ? t('w13j.checklistDone.addedByNobody') : t('w13j.checklistDone.addedBy', { name: nameIn(named, item.addedBy) })}
      </span>
      {item.tell === undefined ? null : <span className="ckp-fact">{t('w13j.checklistDone.tell', { names: namesIn(named, item.tell) })}</span>}
      {mark === undefined ? null : mark.onThePersonsWords !== undefined ? (
        <RouteLink className="ckp-fact" to={messagePath(mark.onThePersonsWords)}>
          {t('w13j.checklistDone.onWords', { name: nameIn(named, mark.by) })}
        </RouteLink>
      ) : (
        <span className="ckp-fact">
          {mark.underTheRaise === true ? t('w13j.checklistDone.underRaise', { name: nameIn(named, mark.by) }) : t('w13j.checklistDone.byPress')}
        </span>
      )}
      {mark?.underTheRaise === true ? (
        <ThePressReason reason={reason === null ? { written: null, because: 'none written' } : { written: reason }} className="ckp-fact ckp-reason" />
      ) : null}
      <ToldWords item={item} named={named} />
    </>
  )
}

/**
 * What an opened item shows: its state, its message, the manual flag, its links, its evidence, what replaced it, its
 * reminder, and who added it, whom it tells and who was told. A waiting item's state is already said on its row, so it
 * is not said again here. `notThese` are links the row already draws: the flow run of a flow's item.
 *
 * A STANDING ITEM SAYS SO in place of "Open", which would call it work still to do; superseded, it says both.
 */
export function ItemFacts({
  item,
  linked,
  named,
  presses,
  notThese = [],
}: {
  item: ChecklistRequest
  linked?: readonly ChecklistLinked[]
  named?: readonly ChecklistNamed[]
  presses?: readonly ChecklistPress[]
  notThese?: readonly string[]
}) {
  return (
    <span className="ckp-facts">
      {item.state === WAITING_ON_THE_OWNER || (item.standing === true && item.state === 'open') ? null : (
        <span className="ckp-state" data-state={item.state}>{t(STATE_KEYS[item.state])}</span>
      )}
      {item.standing === true ? <span className="ckp-fact ckp-standing">{t('w13j.checklistStanding.fact')}</span> : null}
      {item.fromMessage === undefined ? null : (
        <RouteLink className="ckp-fact" to={messagePath(item.fromMessage)}>{t('checklists.fromMessage')}</RouteLink>
      )}
      {item.mustBeInManual === true ? <span className="ckp-fact ckp-manual">{t('checklists.mustBeInManual')}</span> : null}
      {(item.links ?? [])
        .filter((id) => !notThese.includes(id))
        .map((id) => (
          <ItemLink key={id} id={id} linked={linked} />
        ))}
      {(item.evidence ?? []).map((one, index) => (
        <EvidenceLink key={index} one={one} linked={linked} />
      ))}
      {item.supersededBy === undefined ? null : (
        <RouteLink className="ckp-fact" to={messagePath(item.supersededBy)}>{t('checklists.supersededBy')}</RouteLink>
      )}
      {item.reminder === undefined ? null : <span className="ckp-fact">{t('checklists.reminderOn', { at: item.reminder.at.slice(0, 16) })}</span>}
      <WhoFacts item={item} named={named} presses={presses} />
      {/* THE OWNER'S OWN WORDS, written with the press that marked the item done, whole (wave 14a). */}
      {item.response === undefined ? null : <span className="ckp-fact ckp-response">{t('checklists.response', { words: item.response })}</span>}
    </span>
  )
}

/** What ends a flow, in the reader's words. */
const ENDS_ON_KEYS = {
  'the run is sealed': 'w13j.flowEntered.endsOn.sealed',
  'the run is released': 'w13j.flowEntered.endsOn.released',
  'the run ends': 'w13j.flowEntered.endsOn.ends',
  'the plan is submitted': 'w13j.flowEntered.endsOn.submitted',
} as const satisfies Record<EnteredFlowEndsOn, string>

/** How a flow ended, in the reader's words. */
const ENDED_KEYS = {
  submitted: 'w13j.flowEntered.ended.submitted',
  'ticked by hand': 'w13j.flowEntered.ended.tickedByHand',
  'the run is sealed': 'w13j.flowEntered.ended.sealed',
  'the run is released': 'w13j.flowEntered.ended.released',
  'the run ends': 'w13j.flowEntered.ended.ends',
} as const satisfies Record<FlowRunEnding, string>

/**
 * THE FLOW AN ITEM STANDS FOR, on the row, from wave 13j round 52: which flow and about what.
 * A flow or a record that is no longer there is said to be so, never left blank.
 */
function FlowLine({ flow }: { flow: FlowOnAChecklist }) {
  const missing = t('w13j.flowEntered.noTitle')
  return (
    <span className="ckp-flow">{t('w13j.flowEntered.inFlow', { flow: flow.flowTitle ?? missing, about: flow.aboutTitle ?? missing })}</span>
  )
}

/** The flow an opened item stands for: its flow run, what ends it, and whether it has ended. */
function FlowFacts({ flow }: { flow: FlowOnAChecklist }) {
  return (
    <span className="ckp-facts ckp-flow-facts">
      <span className="ckp-fact">
        {t('w13j.flowEntered.flowRun')} <RouteLink to={recordPath(flow.flowRun)}>{flow.flowRun}</RouteLink>
      </span>
      <span className="ckp-fact">{flow.endsOn === null ? t('w13j.flowEntered.endsOn.handOnly') : t(ENDS_ON_KEYS[flow.endsOn])}</span>
      <span className="ckp-fact">
        {flow.ended === null ? t('w13j.flowEntered.ended.no') : t(ENDED_KEYS[flow.ended.how], { when: flow.ended.at.slice(0, 16) })}
      </span>
    </span>
  )
}

/**
 * ONE ITEM: its mark and its words, whole, and the rest under it when it is opened. `press` is drawn beside
 * the words, outside what opens, so pressing it never opens the item. `under` is drawn below the row, open
 * or not: the window's evidence picker, or the evidence of an item just marked done. `inside` is drawn under the facts,
 * only when the item is opened: the page's press that makes an item standing.
 *
 * `box` IS THE EMPTY BOX ON THE LEFT THAT MARKS THE ITEM DONE: a button drawn in
 * place of the mark, outside what opens, so pressing it never opens the item. Without it the mark is drawn, inside.
 *
 * `moved` MARKS A ROW THAT MOVED WHEN THE VIEW READ THE CHECKLIST AGAIN, for the second it takes no press
 * (`useMovedRows`). What a row draws from the item and its checklist is what `whatTheRowDraws` says it draws.
 *
 * `opened` IS KEPT BY THE VIEW, and the item is open on screen exactly when it says so (wave 13j round loop-10): a press
 * that opens or closes the item is handed to `onOpened`, and the view's answer is what is drawn. So what the row is said
 * to draw and what it shows cannot part. Both views that mark moved rows pass both; without them the browser alone
 * keeps whether the item is open, as when a row is drawn once as markup.
 */
export function ItemRow({
  item,
  list,
  press,
  under,
  box,
  inside,
  moved,
  opened,
  onOpened,
}: {
  item: ChecklistRequest
  list?: ChecklistReading
  press?: ReactNode
  under?: ReactNode
  box?: ReactNode
  inside?: ReactNode
  moved?: boolean
  opened?: boolean
  onOpened?: (opened: boolean) => void
}) {
  // THE FLOW THIS ITEM STANDS FOR, when the checklist's reading names one: said on the row, its facts one level down.
  const flow = list?.flows.find((one) => one.item === item.id)
  return (
    <li
      className="ckp-item"
      data-state={item.state}
      data-box={box === undefined ? undefined : 'yes'}
      data-standing={item.standing === true ? 'yes' : undefined}
      data-moved={moved === true ? 'yes' : undefined}
    >
      <span className="ckp-item-line">
        {box}
        <details className="ckp-open" open={opened} onToggle={onOpened === undefined ? undefined : (event) => onOpened(event.currentTarget.open)}>
          <summary className="ckp-summary">
            {box === undefined ? (
              <ItemMark state={item.state} standing={item.standing === true} special={aSpecialChecklistItem(item)} />
            ) : null}
            <span className="ckp-words">
              {/* THE STATE IN WORDS FOR A SCREEN READER, which does not see the mark. */}
              <span className="ckp-hidden">{whatItIs(item)}: </span>
              <TheItemsWords words={item.words} linked={list?.linked} />
            </span>
            {item.state === WAITING_ON_THE_OWNER ? <span className="ckp-asks">{t(STATE_KEYS[item.state])}</span> : null}
            {flow === undefined ? null : <FlowLine flow={flow} />}
          </summary>
          <span className="ckp-details">
            <ItemFacts item={item} linked={list?.linked} named={list?.named} presses={list?.presses} notThese={flow === undefined ? [] : [flow.flowRun]} />
            {flow === undefined ? null : <FlowFacts flow={flow} />}
            {inside}
          </span>
        </details>
        {press === undefined ? null : <span className="ckp-press">{press}</span>}
      </span>
      {under}
    </li>
  )
}

/**
 * THE ORDER BOTH VIEWS DRAW A CHECKLIST IN, from wave 13j round loop-5: what is not finished
 * first, and what is finished after it, done before replaced. Among what is not finished, the items waiting on the owner
 * come first, then those in progress, then the open ones; a standing item is open, so it stays there. Within one state,
 * the order they were added.
 */
const ORDER: readonly ChecklistItemState[] = [WAITING_ON_THE_OWNER, 'in progress', 'open', 'done', 'superseded']

export function inOrder(items: readonly ChecklistRequest[]): ChecklistRequest[] {
  return [...items].sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state))
}

/**
 * A PRESS ON AN ITEM THAT THE DOOR REFUSED, AS BOTH VIEWS SAY IT (wave 13j round loop-8). Its words are the code's, in
 * the page's language, when the door gave a code, and the door's own sentence when it did not. A press refused because
 * the checklist changed after the page read it keeps the version it sent, and the view reads the checklist again; it
 * never presses again for the person.
 */
export interface RefusedPress {
  words: string
  /** The version the press sent, when the door refused it as changed since it was read. Null for any other refusal. */
  sentWith: string | null
  /** Whether the pressed row moved when the view read the checklist again after the refusal (`theseMoved`). */
  moved: boolean
}

export function aRefusedPress(error: unknown, list: ChecklistReading): RefusedPress {
  const fault = faultOf(error)
  return { words: theRefusalInWords(errorMessage(error), fault), sentWith: fault?.code === 'checklistChangedSinceRead' ? list.version : null, moved: false }
}

/**
 * WHAT A REFUSED PRESS SAYS NOW, for the checklist as the view holds it. Once the view holds a newer reading than the one
 * the press was sent with, it says it has read the checklist again, and "Press once more" only when `sameAct`, the press
 * it draws now does what the refused press asked, and its row has not moved since (wave 13j round loop-9): a second press
 * at the same place may land on another row.
 */
export function refusedPressWords(refused: RefusedPress, list: ChecklistReading, sameAct: boolean): string {
  if (refused.sentWith === null || list.version === refused.sentWith) return refused.words
  return t(sameAct && !refused.moved ? 'w13j.checklistPress.pressOnceMore' : 'w13j.checklistPress.readAgain', { refusal: refused.words })
}

/** These refusals, each one whose row is in `rows` now saying its row moved. The same map when none of them changes. */
export function theseMoved<Refused extends RefusedPress>(now: ReadonlyMap<string, Refused>, rows: ReadonlySet<string>): ReadonlyMap<string, Refused> {
  if (![...now].some(([row, one]) => rows.has(row) && !one.moved)) return now
  return new Map([...now].map(([row, one]) => [row, rows.has(row) ? { ...one, moved: true } : one]))
}

/**
 * A ROW THAT MOVED WHEN THE VIEW READ THE CHECKLIST AGAIN TAKES NO PRESS FOR THIS LONG, and is marked as moved for as long
 * (wave 13j round loop-9). A press must never act for the person on a row they did not aim at.
 */
export const MOVED_FOR_MS = 1000

/** One line a view draws, top to bottom: an item's row, or a line that is not a row, such as a checklist's heading. */
export interface DrawnLine {
  key: string
  /** Everything the line draws from what the view read, so that two drawings of it compare as equal or not. */
  draws: string
}

/**
 * WHAT AN ITEM'S ROW DRAWS FROM THE ITEM AND ITS CHECKLIST, as `ItemRow` draws it. Closed, only its line: the mark and the
 * state a screen reader is told before the words, which come from its state and whether it is standing, the words, and
 * the flow it stands for. Opened, the item itself, the flow it stands for, and the records, people and presses the
 * checklist names that the item names too.
 *
 * ONLY WHAT IS DRAWN COUNTS (wave 13j round loop-10). A change hidden inside a closed item moves nothing on screen, so
 * it is not in the closed row's line, and it marks neither that row nor the rows below it.
 */
export function whatTheRowDraws(item: ChecklistRequest, list: ChecklistReading, opened: boolean): string {
  const flow = list.flows.find((one) => one.item === item.id) ?? null
  // THE STYLE IS IN A CLOSED ROW'S LINE because the icon the box draws comes from it (wave 14a).
  if (!opened) {
    return JSON.stringify([item.state, item.standing === true, aSpecialChecklistItem(item), item.words, theLinksInTheWords(item.words, list.linked), flow === null ? null : [flow.flowTitle, flow.aboutTitle]])
  }
  const own = JSON.stringify(item)
  return JSON.stringify([
    item,
    flow,
    list.linked.filter((one) => own.includes(JSON.stringify(one.id))),
    theLinksInTheWords(item.words, list.linked),
    list.named.filter((one) => own.includes(JSON.stringify(one.who.id))),
    list.presses.filter((one) => own.includes(JSON.stringify(one.id))),
  ])
}

/** The items of a view that are opened, with this row opened or closed. The same set when that changes nothing. */
export function withOpened(now: ReadonlySet<string>, row: string, opened: boolean): ReadonlySet<string> {
  if (now.has(row) === opened) return now
  const next = new Set(now)
  if (opened) next.add(row)
  else next.delete(row)
  return next
}

/**
 * THE ROWS THAT MOVED BETWEEN TWO DRAWINGS OF ONE VIEW, worked out from what each line draws and never from the screen. A
 * row moved when its place among the lines changed, when it was not drawn before, or when anything drawn above it
 * changed. So every line after the first that differs moved, and that first line moved only when it is another line than
 * the one drawn there before. A first drawing is not a re-read: nothing in it moved.
 */
export function movedRows(before: readonly DrawnLine[], after: readonly DrawnLine[]): string[] {
  if (before.length === 0) return []
  let first = 0
  while (first < before.length && first < after.length && before[first]!.key === after[first]!.key && before[first]!.draws === after[first]!.draws) first++
  return after.filter((line, at) => at > first || (at === first && line.key !== before[first]?.key)).map((line) => line.key)
}

/**
 * THE ROWS OF ONE VIEW THAT MOVED WHEN IT READ AGAIN, each for `MOVED_FOR_MS` from that read (wave 13j round loop-9).
 *
 * `readings` are what the view drew from what it read. Only a drawing in which one of them is another object than before
 * is compared with the drawing before it, so what the person does, such as opening an item or the fold, is never a move;
 * every drawing is kept as the one the next read is compared with. `drawing` names what the view shows, such as whose
 * checklists: a new one starts again with nothing marked. `onMoved` hears the rows that moved in a read, in the same
 * pass, before the drawing is shown.
 */
export function useMovedRows(drawn: readonly DrawnLine[], readings: readonly unknown[], drawing: string, onMoved: (rows: ReadonlySet<string>) => void): ReadonlySet<string> {
  const last = useRef<{ drawn: readonly DrawnLine[]; readings: readonly unknown[]; drawing: string } | null>(null)
  const [until, setUntil] = useState<ReadonlyMap<string, number>>(new Map())
  useLayoutEffect(() => {
    const before = last.current
    last.current = { drawn, readings, drawing }
    if (before === null) return
    if (before.drawing !== drawing) {
      setUntil((now) => (now.size === 0 ? now : new Map()))
      return
    }
    if (readings.length === before.readings.length && readings.every((one, at) => Object.is(one, before.readings[at]))) return
    const moved = movedRows(before.drawn, drawn)
    if (moved.length === 0) return
    const ends = Date.now() + MOVED_FOR_MS
    setUntil((now) => new Map([...now, ...moved.map((row) => [row, ends] as const)]))
    onMoved(new Set(moved))
  })
  useEffect(() => {
    if (until.size === 0) return
    const later = window.setTimeout(
      () => setUntil((now) => new Map([...now].filter(([, ends]) => ends > Date.now()))),
      Math.max(0, Math.min(...until.values()) - Date.now()),
    )
    return () => window.clearTimeout(later)
  }, [until])
  return useMemo(() => new Set(until.keys()), [until])
}

/** What a fold press says: how many finished items it holds, and whether any of them were replaced. */
export interface TheFold {
  count: number
  replaced: boolean
}

/**
 * THE FOLD OF A CARD, worked out from its counts, so a card read with only its open items says the same before a press
 * as a card read whole. `drawnOpen` are finished items the view draws with the open ones instead, as the window draws
 * an item marked done while it is open, and they are not in the fold.
 */
export function theFoldOf(list: ChecklistReading, drawnOpen: readonly ChecklistRequest[] = []): TheFold {
  const done = list.counts.done - drawnOpen.filter((item) => item.state === 'done').length
  const replaced = list.counts.superseded - drawnOpen.filter((item) => item.state === 'superseded').length
  return { count: done + replaced, replaced: replaced > 0 }
}

/**
 * THE PRESS THAT SHOWS OR HIDES WHAT IS FINISHED, drawn under what is not. Each view starts it closed and
 * keeps whether it is open. Closed, it says how many items it hides and whether any of them were replaced. While the
 * finished items it was pressed for are still being read, it stays as it is and says it is busy.
 */
export function FoldPress({ fold, open, busy = false, onPress }: { fold: TheFold; open: boolean; busy?: boolean; onPress: () => void }) {
  return (
    <button type="button" className="ckp-fold" aria-expanded={open} aria-busy={busy ? 'true' : undefined} onClick={onPress}>
      <span className="ckp-fold-mark" aria-hidden="true">
        {open ? '▾' : '▸'}
      </span>
      {t(open ? 'checklists.window.hideDone' : fold.replaced ? 'checklists.window.showDoneAndReplaced' : 'checklists.window.showDone', { n: fold.count })}
    </button>
  )
}

/** What a card's fold has to draw: nothing while it is shut, its checklist whole once that is at hand, or the failed read. */
export type TheFoldsReading = { status: 'shut' } | { status: 'waiting' } | { status: 'ready'; whole: ChecklistReading } | Extract<AsyncState<unknown>, { status: 'error' }>

/** One fold's read of its checklist by its id: the version it was asked for, the last whole reading and a failure. */
interface AFoldsRead {
  version: string
  whole: ChecklistReading | null
  failed: Extract<AsyncState<unknown>, { status: 'error' }> | null
}

/**
 * THE CHECKLISTS WHOLE, FOR THE FOLDS THE READER OPENED, by checklist. A card read whole holds its finished items
 * already. A card read with only its open items reads its checklist by its id when its fold is pressed, and again while
 * the fold is open whenever the list read brings another version. Until the next reading comes, the last one stays
 * drawn, so the finished items do not go and come back. `atHand` is a whole reading the view holds already, used when it
 * is of the version the list read brought. A fold shut lets its reading go.
 */
export function useTheFoldsReadings(lists: readonly ChecklistReading[], wanted: ReadonlySet<string>, atHand: ChecklistReading | null = null): ReadonlyMap<string, TheFoldsReading> {
  const [reads, setReads] = useState<ReadonlyMap<string, AFoldsRead>>(new Map())
  const sent = useRef(new Map<string, string>())
  const heldWhole = (list: ChecklistReading): ChecklistReading | null =>
    list.finishedItems === undefined ? list : atHand !== null && atHand.id === list.id && atHand.version === list.version ? atHand : null
  // EACH ASK BY ITS CHECKLIST AND VERSION, in one string, so a read goes out only when a fold opens or its checklist changed.
  const asks = lists
    .filter((list) => wanted.has(list.id) && heldWhole(list) === null)
    .map((list) => `${list.id} ${list.version}`)
    .join('\n')
  useEffect(() => {
    const now = new Map(asks === '' ? [] : asks.split('\n').map((one) => one.split(' ') as [string, string]))
    for (const id of [...sent.current.keys()]) if (!now.has(id)) sent.current.delete(id)
    setReads((before) => ([...before.keys()].every((id) => now.has(id)) ? before : new Map([...before].filter(([id]) => now.has(id)))))
    for (const [id, version] of now) {
      if (sent.current.get(id) === version) continue
      sent.current.set(id, version)
      const answered = (change: (before: AFoldsRead | undefined) => AFoldsRead): void => {
        if (sent.current.get(id) === version) setReads((before) => new Map([...before, [id, change(before.get(id))]]))
      }
      api.readChecklistAcross(id).then(
        (reply) => answered(() => ({ version, whole: reply.checklist, failed: null })),
        (error: unknown) =>
          answered((before) => ({ version, whole: before?.whole ?? null, failed: { status: 'error', message: errorMessage(error), fault: faultOf(error) } })),
      )
    }
  }, [asks])
  const out = new Map<string, TheFoldsReading>()
  for (const list of lists) {
    if (!wanted.has(list.id)) continue
    const whole = heldWhole(list)
    const read = reads.get(list.id)
    out.set(
      list.id,
      whole !== null
        ? { status: 'ready', whole }
        : read !== undefined && read.failed !== null && read.version === list.version
          ? read.failed
          : read !== undefined && read.whole !== null
            ? { status: 'ready', whole: read.whole }
            : { status: 'waiting' },
    )
  }
  return out
}

const SHUT: TheFoldsReading = { status: 'shut' }

/** The fold of one card, as `useTheFoldsReadings` reads it. */
export function useTheFoldsReading(list: ChecklistReading, wanted: boolean, atHand: ChecklistReading | null = null): TheFoldsReading {
  return useTheFoldsReadings([list], new Set(wanted ? [list.id] : []), atHand).get(list.id) ?? SHUT
}

function same(a: ChecklistEvidence, b: ChecklistEvidence | null): boolean {
  return b !== null && a.kind === b.kind && a.record === b.record && a.block === b.block && a.commit === b.commit
}

const KIND_WORDS = {
  report: 'checklists.evidence.report',
  run: 'checklists.evidence.run',
  commit: 'checklists.picker.commit',
  'manual section': 'checklists.evidence.manual',
} as const satisfies Record<EvidenceKind, string>

/**
 * THE EVIDENCE PICKER, under an item of the evidence-or-words style, on the checklist's page and in the window. It
 * offers what the item may name, a kind at a time, newest first, with a search by words in the title and a press for
 * more. An item that must be in the manual is offered manual sections only, because the item door refuses anything else
 * for it. It draws a box for the owner's own words: they go with the press that marks the item done, exactly as typed,
 * and may be the whole of what is sent, because the owner's own "done" needs no evidence. A Save the door refuses
 * because the checklist changed after it was read makes the view read it again, and the words stay in the box.
 */
export function EvidencePicker({
  list,
  item,
  moved,
  onCancel,
  onDone,
  onReadAgain,
}: {
  list: ChecklistReading
  item: ChecklistRequest
  /** The item's row moved when the view read again, under a second ago, so Save does nothing and says why. */
  moved: boolean
  onCancel: () => void
  onDone: (after: ChecklistReading) => void
  /** Reads the checklist again, after Save was refused because the checklist changed since it was read. */
  onReadAgain: () => void
}) {
  const kinds: EvidenceKind[] = item.mustBeInManual === true ? ['manual section'] : ['report', 'run', 'commit', 'manual section']
  const [kind, setKind] = useState<EvidenceKind>(kinds[0]!)
  const [typed, setTyped] = useState('')
  const [words, setWords] = useState('')
  const [wrote, setWrote] = useState('')
  const [more, setMore] = useState<EvidenceChoice[]>([])
  /** How many are left after the pages shown by "Show more"; null while only the first page is shown. */
  const [moreLeft, setMoreLeft] = useState<number | null>(null)
  const [chosen, setChosen] = useState<ChecklistEvidence | null>(null)
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<RefusedPress | null>(null)
  // THE SEARCH WAITS UNTIL THE TYPING STOPS, so each key is not a request.
  useEffect(() => {
    const later = window.setTimeout(() => setWords(typed), 300)
    return () => window.clearTimeout(later)
  }, [typed])
  const [first] = useProjectAsync(() => api.evidenceChoices(list, kind, words, 0), [kind, words])
  // A NEW KIND OR NEW WORDS START THE LIST AGAIN. A re-read of the same list does not: it would take the reader's
  // choice away under the press.
  useEffect(() => {
    setMore([])
    setMoreLeft(null)
    setChosen(null)
  }, [kind, words])
  const firstPage = first.status === 'ready' ? first.value.choices : []
  const choices = [...firstPage, ...more.filter((one) => !firstPage.some((shown) => same(one.evidence, shown.evidence)))]
  const left = moreLeft ?? (first.status === 'ready' ? first.value.left : 0)
  const showMore = async (): Promise<void> => {
    try {
      const page = await api.evidenceChoices(list, kind, words, choices.length)
      setMore((now) => [...now, ...page.choices])
      setMoreLeft(page.left)
    } catch (error) {
      setRefused(aRefusedPress(error, list))
    }
  }
  const send = async (): Promise<void> => {
    if (chosen === null && wrote.trim() === '') return
    setBusy(true)
    setRefused(null)
    try {
      const reply = await api.markChecklistItemDoneByThePerson(list, item.id, {
        // A WHITESPACE-ONLY BOX SENDS NO WORDS: chose evidence alone, and a blank response would be refused. A nonblank
        // one is sent exactly as typed, spaces and lines included.
        ...(wrote.trim() === '' ? {} : { words: wrote }),
        ...(chosen === null ? {} : { evidence: chosen }),
      })
      onDone(reply.checklist)
    } catch (error) {
      const one = aRefusedPress(error, list)
      setRefused(one)
      if (one.sentWith !== null) onReadAgain()
    } finally {
      setBusy(false)
    }
  }
  const name = `ckw-pick-${list.id}-${item.id}`
  return (
    <div className="ckw-picker" role="group" aria-label={t('checklists.picker.title')}>
      <p className="ckw-picker-title">{t('checklists.picker.title')}</p>
      {kinds.length === 1 ? (
        <p className="ckw-note">{t('checklists.picker.manualOnly')}</p>
      ) : (
        <span className="ckw-kinds" role="group" aria-label={t('checklists.picker.kind')}>
          {kinds.map((one) => (
            <button key={one} type="button" className="ckw-kind" aria-pressed={kind === one} onClick={() => setKind(one)}>
              {t(KIND_WORDS[one])}
            </button>
          ))}
        </span>
      )}
      <input
        type="search"
        className="px-input ckw-find"
        aria-label={t('checklists.picker.find')}
        placeholder={t('checklists.picker.find')}
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
      />
      {first.status === 'loading' ? <Loading what={t('checklists.picker.loading')} rows={2} /> : null}
      {first.status === 'error' ? <ErrorNote message={first.message} fault={first.fault} /> : null}
      {first.status === 'ready' && choices.length === 0 ? (
        <p className="ckw-note">{t(words.trim() === '' ? 'checklists.picker.none' : 'checklists.picker.noneWithWords')}</p>
      ) : null}
      {choices.length > 0 ? (
        <ul className="ckw-choices">
          {choices.map((one, index) => (
            <li key={index}>
              <label className="ckw-choice">
                <input type="radio" name={name} checked={same(one.evidence, chosen)} onChange={() => setChosen(one.evidence)} />
                <span className="ckw-choice-words">
                  <span className="ckw-choice-title">{one.title}</span>
                  <span className="ckw-choice-detail">{one.detail}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : null}
      {left > 0 ? (
        <button type="button" className="ckw-more" onClick={() => void showMore()}>
          {t('checklists.picker.more', { n: left })}
        </button>
      ) : null}
      {/* THE OWNER'S OWN WORDS: optional, sent exactly as typed with the press that marks the item done. */}
      <label className="ckw-words">
        <span className="ckw-words-label">{t('checklists.picker.yourWords')}</span>
        <textarea
          className="px-input ckw-wrote"
          aria-label={t('checklists.picker.yourWords')}
          value={wrote}
          rows={2}
          onChange={(event) => setWrote(event.target.value)}
        />
      </label>
      <span className="ckw-picker-presses">
        <Btn
          size="sm"
          variant="primary"
          onClick={() => void send()}
          pending={busy}
          disabled={moved || (chosen === null && wrote.trim() === '')}
          reason={t(moved ? 'w13j.checklistMoved.reason' : 'checklists.picker.chooseOrWrite')}
        >
          {t('checklists.window.save')}
        </Btn>
        <Btn size="sm" variant="ghost" onClick={onCancel}>
          {t('checklists.window.cancel')}
        </Btn>
      </span>
      {refused === null ? null : (
        <span className="ckw-refusal">{refusedPressWords({ ...refused, moved }, list, !isClosed(item.state) && item.standing !== true)}</span>
      )}
    </div>
  )
}

/**
 * How many items are still to do, and how many of those wait on the owner. An item waiting on the owner is
 * still to do, so it is counted once, inside the first number.
 */
export function countsWords(list: ChecklistReading): string {
  const { open, waitingOnTheOwner: waiting } = list.counts
  return waiting === 0 ? t('checklists.countsNoneWaiting', { open }) : t('checklists.counts', { open, waiting })
}

/**
 * HOW MANY STEPS WAIT ON THE OWNER in these checklists: the number the Checklists page heads a group with, and the
 * number the sidebar's Checklists entry draws.
 */
export function stepsWaitingOnTheOwner(lists: readonly ChecklistReading[]): number {
  return lists.reduce((sum, list) => sum + list.counts.waitingOnTheOwner, 0)
}

/**
 * A thin bar of how many items are done, with the words beside it. A replaced item is neither done nor still to do, so it
 * is left out of both numbers, and so is a standing item, which is never done and never work still to do.
 * A checklist with nothing left to count draws neither the bar nor the words.
 */
export function progressOf(list: ChecklistReading): { done: number; total: number } {
  // Every item is open work, standing, done or replaced, and a standing item is never done, so the open and the done
  // together are the items less the replaced and the standing ones, even when the list was read with only its open items.
  return { done: list.counts.done, total: list.counts.open + list.counts.done }
}

export function Progress({ list }: { list: ChecklistReading }) {
  const { done: closed, total } = progressOf(list)
  if (total === 0) return null
  return (
    <span className="ckp-progress">
      <span className="ckp-bar" aria-hidden="true">
        <span className="ckp-bar-done" style={{ width: total === 0 ? '0%' : `${String(Math.round((100 * closed) / total))}%` }} />
      </span>
      <span className="ckp-progress-words">{t('checklists.progress', { done: closed, total })}</span>
    </span>
  )
}

/** The stylesheet both the page and the window bring with them. */
export const CHECKLIST_PARTS_CSS = `
.ckp-item { padding: 6px 0; border-top: var(--border-w) solid var(--border); min-width: 0; }
.ckp-item:first-child { border-top: none; }
.ckp-item-line { display: flex; gap: 8px; align-items: flex-start; min-width: 0; }
.ckp-open { flex: 1 1 auto; min-width: 0; }
.ckp-summary { display: flex; flex-wrap: wrap; gap: 0 8px; align-items: flex-start; cursor: pointer; list-style: none; min-width: 0; border-radius: var(--radius-sm); }
.ckp-summary::-webkit-details-marker { display: none; }
.ckp-summary:hover .ckp-words { text-decoration: underline; text-decoration-color: var(--border-strong); }
.ckp-mark {
  flex: none; width: 1.15rem; height: 1.15rem; margin-top: 2px; border-radius: var(--radius-sm);
  border: 2px solid var(--border-strong); display: inline-flex; align-items: center; justify-content: center;
  font-size: 0.8rem; font-weight: 700; line-height: 1;
}
.ckp-mark[data-state='in progress'] { border-color: var(--st-doing); background: linear-gradient(90deg, var(--st-doing) 50%, transparent 50%); }
.ckp-mark[data-state='waiting on the owner'] { border-color: var(--ask); background: var(--ask-bg); color: var(--ask); }
.ckp-mark[data-state='done'] { border-color: var(--st-done); background: var(--st-done); color: var(--panel); }
.ckp-mark[data-state='superseded'] { border-style: dashed; color: var(--text-3); }
/* A STANDING ITEM HAS NO BOX: no border, and three lines in the text colour. */
.ckp-mark[data-standing='yes'] { border-color: transparent; color: var(--text-2); font-size: 1rem; font-weight: 400; }
.ckp-words { flex: 1 1 0; min-width: 0; line-height: var(--lh-body); overflow-wrap: anywhere; }
.ckp-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
/* UNDER THE WORDS, so a narrow window keeps the words their whole width. */
.ckp-asks { flex: 1 0 100%; font-size: var(--fs-1); font-weight: 600; color: var(--ask); padding-left: calc(1.15rem + 8px); }
.ckp-item[data-state='superseded'] .ckp-words { text-decoration: line-through; color: var(--text-3); }
/* THE FLOW AN ITEM STANDS FOR, under the words like the waiting line, so a narrow window keeps the words whole. */
.ckp-flow { flex: 1 0 100%; font-size: var(--fs-1); color: var(--text-2); padding-left: calc(1.15rem + 8px); overflow-wrap: anywhere; }
.ckp-flow-facts { margin-top: 2px; }
.ckp-flow-facts a { overflow-wrap: anywhere; }
.ckp-item[data-state='done'] .ckp-words { color: var(--text-2); }
.ckp-details { display: block; padding: 4px 0 2px calc(1.15rem + 8px); }
.ckp-press { flex: none; }
/* THE EMPTY BOX THAT MARKS AN ITEM DONE is drawn as the mark is, and its press reaches a little past the box. Outside
   what opens, it stands where the mark stood, so what is under the words needs no room kept for a mark. */
.ckp-box {
  flex: none; display: inline-flex; align-items: flex-start; justify-content: center; margin: -2px -4px; padding: 2px 4px;
  border: none; background: none; color: inherit; font: inherit; cursor: pointer; border-radius: var(--radius-sm);
}
.ckp-box:hover .ckp-mark, .ckp-box:focus-visible .ckp-mark { border-color: var(--accent); background: var(--hover); }
.ckp-box:disabled { cursor: progress; }
.ckp-item[data-box='yes'] .ckp-details, .ckp-item[data-box='yes'] .ckp-asks, .ckp-item[data-box='yes'] .ckp-flow { padding-left: 0; }
/* A ROW THAT MOVED WHEN THE VIEW READ AGAIN, for the second it takes no press: tinted, with a ring a little outside it
   drawn as a shadow, so the mark moves nothing; and its box faded. */
.ckp-item[data-moved='yes'] {
  background: var(--accent-soft); border-radius: var(--radius-sm);
  box-shadow: 0 0 0 4px var(--accent-soft), 0 0 0 6px var(--accent);
}
.ckp-box[aria-disabled='true'] { cursor: not-allowed; opacity: 0.55; }
.ckp-fold {
  display: inline-flex; align-items: center; gap: 6px; margin: 4px 0 0 0; padding: 2px 4px; border: none; background: none;
  color: var(--text-2); font: inherit; font-size: var(--fs-1); cursor: pointer; border-radius: var(--radius-sm);
}
.ckp-fold:hover { background: var(--hover); color: var(--text); }
.ckp-fold-mark { width: 0.8rem; }
.ckp-folded { margin-top: 2px; }
/* ON A PHONE THE BOX'S PRESS IS 44PX TALL, and its mark stays at the top of it, beside the first line of the words. */
@media (max-width: 480px) {
  .ckp-summary { min-height: 44px; }
  .ckp-box { min-width: 44px; min-height: 44px; margin: 0; padding: 0; align-items: flex-start; }
  .ckp-fold { min-height: 44px; }
}
.ckp-facts { display: flex; flex-wrap: wrap; gap: 2px 10px; font-size: var(--fs-1); color: var(--text-2); }
.ckp-state { font-weight: 600; }
.ckp-state[data-state='waiting on the owner'] { color: var(--ask); }
.ckp-state[data-state='done'] { color: var(--st-done); }
.ckp-state[data-state='in progress'] { color: var(--st-doing); }
.ckp-manual { font-weight: 600; }
.ckp-standing { font-weight: 600; }
.ckp-evidence { font-size: var(--fs-1); overflow-wrap: anywhere; }
.ckp-link { min-width: 0; overflow-wrap: anywhere; }
code.ckp-evidence { font-family: var(--font-mono); }
.ckp-progress { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
.ckp-bar { flex: none; width: 5rem; height: 6px; border-radius: 999px; background: var(--panel-2); overflow: hidden; border: var(--border-w) solid var(--border); }
.ckp-bar-done { display: block; height: 100%; background: var(--st-done); }
.ckp-progress-words { font-size: var(--fs-1); color: var(--text-2); white-space: nowrap; }
/* The reason a press under the grant gave for its mark: a line of its own, broken anywhere so a long one fits a phone. */
.ckp-reason { flex: 1 0 100%; min-width: 0; overflow-wrap: anywhere; }
/* Written response under an opened item: its lines, kept as written. */
.ckp-response { flex: 1 0 100%; white-space: pre-wrap; overflow-wrap: anywhere; }
/* THE EVIDENCE PICKER, under an item of the evidence-or-words style, on the page and in the window. */
.ckw-picker {
  display: flex; flex-direction: column; gap: 6px; margin: 6px 0 2px 0; padding: 8px; min-width: 0;
  border: var(--border-w) solid var(--border); border-radius: var(--radius-sm); background: var(--panel-2);
}
.ckw-picker-title { margin: 0; font-weight: 600; font-size: var(--fs-2); }
.ckw-note { margin: 0 0 6px 0; color: var(--text-2); font-size: var(--fs-1); }
.ckw-kinds { display: flex; flex-wrap: wrap; gap: 4px; }
.ckw-kind {
  border: var(--border-w) solid var(--border-strong); background: var(--panel); color: var(--text); font: inherit; font-size: var(--fs-1);
  padding: 2px 8px; border-radius: 999px; cursor: pointer;
}
.ckw-kind[aria-pressed='true'] { background: var(--accent); color: var(--accent-text); border-color: var(--accent); font-weight: 600; }
.ckw-find { width: 100%; min-width: 0; }
.ckw-choices { list-style: none; margin: 0; padding: 0; max-height: 14rem; overflow-y: auto; border: var(--border-w) solid var(--border); border-radius: var(--radius-sm); background: var(--panel); }
.ckw-choices > li + li { border-top: var(--border-w) solid var(--border); }
.ckw-choice { display: flex; gap: 8px; align-items: flex-start; padding: 6px 8px; cursor: pointer; min-width: 0; }
.ckw-choice:hover { background: var(--hover); }
.ckw-choice input { margin-top: 3px; flex: none; }
.ckw-choice-words { display: flex; flex-direction: column; min-width: 0; }
.ckw-choice-title { overflow-wrap: anywhere; }
.ckw-choice-detail { font-size: var(--fs-1); color: var(--text-2); overflow-wrap: anywhere; }
.ckw-more { align-self: flex-start; border: none; background: none; color: var(--accent); font: inherit; font-size: var(--fs-1); padding: 2px 0; cursor: pointer; }
.ckw-picker-presses { display: inline-flex; gap: 6px; }
.ckw-words { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ckw-words-label { font-size: var(--fs-1); color: var(--text-2); }
.ckw-wrote { width: 100%; min-width: 0; resize: vertical; font: inherit; }
.ckw-refusal { color: var(--st-failed); font-size: var(--fs-1); overflow-wrap: anywhere; }
@media (max-width: 480px) {
  .ckw-kind, .ckw-more { min-height: 44px; }
}
`
