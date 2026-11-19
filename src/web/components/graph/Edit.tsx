// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EDIT MODE: the drawer that changes what the drawing is made of, one action at a time.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT CHANGED HERE, AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * This used to be a section headed "the same requests an agent sends" sitting in the normal reading
 * flow of the pipelines page with EVERY form open at once — add a module, change a card, add a
 * relationship, remove a relationship. It was about 900px of a 2,600px page, it read like a debug
 * console, and it was there whether or not anybody was editing.
 *
 * The principle it was built to state is still true and is kept: a person and an agent make the SAME
 * semantic edits through the same operations. What has changed is that this is now said ONCE, quietly,
 * inside the fold at the foot of this drawer — not as a heading over the page. It is a fact about how
 * Mole Office works, not the name of the feature.
 *
 * So: nothing of this is on screen until somebody presses Edit, and then ONE action's fields are open
 * at a time. `ACTIONS` below is the closed list, and `openFor` decides what a given action needs.
 *
 * ---------------------------------------------------------------------------------------
 * TWO KINDS OF EDIT, AND THE LINE BETWEEN THEM
 * ---------------------------------------------------------------------------------------
 *
 * STRUCTURE AND CONTENT — a module, a card's words, a typed link, a gate, a pipeline step. Stored in
 * `records` and `links`, written with the ordinary API: POST/PATCH/DELETE /api/records, POST/DELETE
 * /api/links.
 *
 * PRESENTATION INTENT — direction, lane, order, role, emphasis, collapsed, near. The closed
 * vocabulary in src/shared/presentation.ts, written with PUT/DELETE /api/presentation/…. Every one of
 * them is CHOSEN FROM A LIST here, because that is what the boundary means: Mole Office is not becoming a
 * diagram editor, and there is no colour, no line style and no box to drag.
 *
 * There is no third kind. Nothing here writes a coordinate, and the server refuses one by name if
 * anything ever tries.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT CANNOT BE DONE HERE, SAID RATHER THAN WORKED AROUND
 * ---------------------------------------------------------------------------------------
 *
 * A LINK CANNOT BE CHANGED IN PLACE. There is no PATCH on /api/links: a link stores its two ends, its
 * type and its gate, and the server offers create and delete. So "change a relationship" is
 * remove-then-add, this drawer does exactly that, in that order, and reports both steps — including
 * the case where the removal succeeded and the replacement failed, which leaves the drawing with one
 * fewer line and has to be visible rather than swallowed.
 *
 * ONLY A `blocks` LINK MAY CARRY A GATE, and a partial gate has to say how far. The server refuses
 * everything else and its refusals are printed whole, unedited. The form disables what the server
 * would refuse and says why, so a person meets the rule before the error rather than after it.
 *
 * A BLOCK IS A RECORD, filed through its pipeline. `POST /api/records/<pipeline>/blocks` mints the
 * record and appends its id to that pipeline's order in ONE transaction, so saving a block is one
 * write rather than the read-modify-write of a whole array this drawer used to do — the arrangement
 * where two people adding a block at the same time each sent a list built before the other's write,
 * and the first block vanished with nothing reporting it.
 *
 * REMOVING A CARD IS A SOFT DELETE. Nothing in Mole Office is ever really removed — links to a deleted
 * record are shown as broken rather than disappearing — and the button says so.
 */

import { useEffect, useMemo, useState } from 'react'
import { t } from '@shared/i18n.ts'
import { kindWord, linkWord, stateWord } from '@shared/words.ts'
import { currentMode, useInspect } from '../../lib/mode.ts'
import { ConfirmPress, UndoPress, DRAWING_UNDO_MS } from './press.tsx'
import {
  EMPHASIS_ROLES,
  GRAPH_DIRECTIONS,
  NODE_ROLES,
  type EmphasisRole,
  type GraphDirection,
  type LayoutReport,
  type NodeIntent,
  type NodeRole,
  type ScopeIntent,
} from '@shared/presentation.ts'
import { BLOCK_KIND, BLOCK_TITLE_SEPARATOR, blockIdsOf, blockNameIn } from '@shared/blocks.ts'
import { ITEM_STATES, LINK_TYPES, type ItemState, type LinkType, type PanelRecord } from '@shared/types.ts'
import type { LinkAnswered, LinkOnTheWire } from '@shared/link-shapes.ts'
import { GATE_KINDS, type Gate, type GateKind } from '@shared/work.ts'
import { api, errorMessage, moleOfficeRequest, type RecordReply } from '../../api.ts'
import { Absence, Btn, Explain, Field, Select, TextArea, TextInput } from '../ui.tsx'
// `intentScopeKey` and `intentTargetOf` come from model.ts and are NOT rebuilt here. A scope is
// called `modules` by the model and `structure` by the stored vocabulary, and a node is a record id
// or `step:<id>`; two places building those strings is two chances to split one arrangement in half.
import {
  intentScopeKey,
  intentTargetOf,
  type GraphEdge,
  type GraphLink,
  type GraphNode,
  type StructureGraph,
} from './model.ts'

// ============================================================================ presentation over HTTP

/**
 * The presentation-intent calls. THE TRANSPORT UNDER THEM IS THE APP'S ONE TRANSPORT.
 *
 * It was a second one, written here while src/web/api.ts was not that pass's file, with its own
 * header reporting that fact and naming the drift it risked. The drift arrived with the project
 * boundary: presentation intent is stored per workspace, `x-mole-office-workspace` is the only thing
 * that says which, and a transport that did not send it would have arranged one project's graph
 * and saved the arrangement into another's — a write that lands in the wrong project and reports
 * success. `moleOfficeRequest` sends who is asking AND what about, in one place, and still serves the
 * server's own refusal sentence with nothing corrected on the way past.
 *
 * The one behaviour that changed: a reply that is not JSON now arrives as an ApiError saying so,
 * where this copy let JSON.parse throw a SyntaxError naming a character position. ApiError extends
 * Error, so every `catch` below reads the same.
 */
const send = moleOfficeRequest

/** What GET /api/presentation/:scope answers. Mirrors `StoredScopeIntent` in server/lib/presentation.ts. */
export interface StoredIntent {
  scope: string
  intent: ScopeIntent
  targets: { target: string; updatedAt: string; updatedBy: string }[]
  report: LayoutReport
  note: string
}

const enc = encodeURIComponent

export const presentation = {
  read: (scope: string) => send<StoredIntent>(`/api/presentation/${enc(scope)}`),
  putDirection: (scope: string, direction: GraphDirection) =>
    send<{ note: string }>(`/api/presentation/${enc(scope)}/direction`, {
      method: 'PUT',
      body: JSON.stringify({ intent: { direction } }),
    }),
  clearDirection: (scope: string) =>
    send<{ note: string }>(`/api/presentation/${enc(scope)}/direction`, { method: 'DELETE' }),
  putNode: (scope: string, target: string, intent: NodeIntent) =>
    send<{ note: string }>(`/api/presentation/${enc(scope)}/nodes/${enc(target)}`, {
      method: 'PUT',
      body: JSON.stringify({ intent }),
    }),
  clearNode: (scope: string, target: string) =>
    send<{ note: string }>(`/api/presentation/${enc(scope)}/nodes/${enc(target)}`, { method: 'DELETE' }),
  /**
   * FORGET EVERYTHING ARRANGED FOR ONE DRAWING — criterion D36. One request, and one change row on
   * the drawing rather than one per card; `clearScope` in server/lib/presentation.ts is where that
   * is decided. `removed` names every target that went.
   */
  clearScope: (scope: string) =>
    send<{ note: string; removed: string[] }>(`/api/presentation/${enc(scope)}`, { method: 'DELETE' }),
  /**
   * SAY HOW THE WHOLE DRAWING IS ARRANGED, in one request. It REPLACES what the scope stores: its
   * direction, every node and its lanes. The undo of Start again is the one caller.
   */
  putScope: (scope: string, intent: ScopeIntent) =>
    send<{ note: string }>(`/api/presentation/${enc(scope)}`, {
      method: 'PUT',
      body: JSON.stringify({ intent }),
    }),
}

/** Whether a drawing stores anything: a direction, a hint on a node, or a lane. */
function storesAnything(intent: ScopeIntent): boolean {
  return intent.direction !== undefined || Object.keys(intent.nodes ?? {}).length > 0 || (intent.lanes ?? []).length > 0
}

/**
 * PUT A FORGOTTEN ARRANGEMENT BACK — the server half of Start again's undo (`putItBack` in Canvas.tsx).
 *
 * Start again forgets every row of the scope, the lanes in the scope's own row included. So the undo
 * sends the whole of what it read before the press in one PUT, rather than the direction and each
 * node on their own, which left the lanes forgotten while the undo said the drawing was back.
 *
 * It refuses when anything is stored since the press, lanes included, because putting the old
 * arrangement back would replace the newer one. `doors` is `presentation` above; a test hands in
 * the server's own routes.
 */
export async function putTheArrangementBack(
  scope: string,
  before: ScopeIntent,
  doors: Pick<typeof presentation, 'read' | 'putScope'> = presentation,
): Promise<void> {
  if (storesAnything((await doors.read(scope)).intent)) throw new Error(t('g7b.undoChanged'))
  if (storesAnything(before)) await doors.putScope(scope, before)
}

// ============================================================================ honesty about hints

/**
 * How many hints one scope has stored.
 *
 * Counted from the intent itself rather than from the number of stored rows, because one row can
 * carry six hints at once and a count of rows would under-report what somebody arranged.
 *
 * WHAT HAPPENED TO EACH HINT is deliberately not answered here. `model.ts` applies direction, role,
 * emphasis, collapsed and near and reports on all five in `StructureGraph.report`; `layout.ts` adds
 * what ELK could do with a lane and an order. This file WRITES hints, and a third opinion about what
 * became of them would be the one place a hint could be reported as taken when it was not.
 */
export function storedHintCount(intent: ScopeIntent): number {
  let count = intent.direction === undefined ? 0 : 1
  for (const node of Object.values(intent.nodes ?? {})) count += Object.keys(node).length
  return count
}

// ============================================================================ the actions

export type EditActionId =
  | 'add-node'
  | 'edit-node'
  | 'add-link'
  | 'change-link'
  | 'remove-link'
  | 'step'
  | 'remove-item'
  | 'presentation'

export interface EditAction {
  id: EditActionId
  /** The words on the button that opens it. */
  label: string
  /** What opens, in one line, printed as the drawer's heading. Never "more". */
  opens: string
}

/**
 * Every action this drawer offers, and nothing else.
 *
 * A CLOSED LIST, checked by a test, for the same reason the presentation vocabulary is closed: a
 * drawer that grows an action per pass becomes the wall of forms this replaced. Each one names what it
 * opens, and only that action's fields are ever on screen.
 */
export const ACTIONS: readonly EditAction[] = [
  { id: 'add-node', get label() { return t('g7b.Edit.add_a_module') }, get opens() { return t('g7b.Edit.a_name_and_the_reason_it_exists') } },
  { id: 'edit-node', get label() { return t('g7b.Edit.edit_a_card') }, get opens() { return t('g7b.Edit.the_words_on_one_card') } },
  { id: 'add-link', get label() { return t('g7b.Edit.add_a_relationship') }, get opens() { return t('g7b.Edit.two_ends_the_relationship_and_how_much') } },
  { id: 'change-link', get label() { return t('g7b.Edit.change_a_relationship') }, get opens() { return t('g7b.Edit.one_line_s_relationship_and_its_gate') } },
  { id: 'remove-link', get label() { return t('g7b.Edit.remove_a_relationship') }, get opens() { return t('g7b.Edit.which_stored_line_to_remove') } },
  { id: 'step', get label() { return t('g7b.Edit.add_or_edit_a_block') }, get opens() { return t('g7b.Edit.one_pipeline_block_its_name_its_state') } },
  { id: 'remove-item', get label() { return t('g7b.Edit.remove_an_item') }, get opens() { return t('g7b.Edit.which_card_to_delete_recoverably') } },
  { id: 'presentation', get label() { return t('g7b.Edit.how_this_is_shown') }, get opens() { return t('g7b.Edit.direction_lane_order_role_emphasis_and_folding') } },
]

// ============================================================================ what happened

/** What a control did, in the server's words where there are any. Never a bare "Saved". */
export interface Outcome {
  ok: boolean
  /** The request that was sent, exactly as it went. */
  request: string
  /** What came back, or what failed. */
  said: string
}

function OutcomeLine({ outcome }: { outcome: Outcome | null }) {
  const inspect = useInspect()
  if (outcome === null) return null
  return (
    <p className="gx-outcome" data-ok={outcome.ok ? '1' : undefined} role="status">
      {inspect ? <code className="gx-outcome-req">{outcome.request}</code> : null}
      <span className="gx-outcome-said">{outcome.said}</span>
    </p>
  )
}

const linkTypeOptions = () => (Object.keys(LINK_TYPES) as LinkType[]).map((type) => ({
  value: type,
  label: `${linkWord(type, 'forward').text} / ${linkWord(type, 'reverse').text}`,
}))

/** The one link type that states a dependency, and so the only one a gate may ride on. */
const GATED_LINK_TYPE: LinkType = 'blocks'

/** How a gate is chosen. `none` is not "hard" — it means nobody has said how much. */
type GateChoice = 'none' | GateKind

function gateOptions(allowed: boolean): readonly { value: GateChoice; label: string }[] {
  if (!allowed) return [{ value: 'none', label: t('g7b.Edit.not_available_on_this_link_type') }]
  return [
    { value: 'none', label: t('g7b.Edit.nobody_has_said_how_much') },
    ...GATE_KINDS.map((kind) => ({
      value: kind as GateChoice,
      label: kind === 'hard' ? t('g7b.Edit.hard_nothing_can_proceed_until_it_finishes') : t('g7b.Edit.partial_it_may_go_as_far_as'),
    })),
  ]
}

function gateFrom(choice: GateChoice, upTo: string): Gate | null {
  if (choice === 'none') return null
  if (choice === 'partial') return upTo.trim() === '' ? { kind: 'partial' } : { kind: 'partial', upTo: upTo.trim() }
  return { kind: 'hard' }
}

// ============================================================================ steps, read and written

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * The block records a pipeline lists, in its stored order.
 *
 * IT USED TO READ `record.data.steps` AND FILTER FOR OBJECTS. A block is a record, so this resolves
 * ids against the records the page already has, and an id naming nothing is left out of the list
 * rather than turning into a step object with no name.
 */
export function storedBlocksOf(
  record: PanelRecord | undefined,
  records: readonly PanelRecord[],
): PanelRecord[] {
  if (record === undefined) return []
  const byId = new Map(records.map((r) => [r.id, r]))
  return blockIdsOf(record)
    .map((id) => byId.get(id))
    .filter((r): r is PanelRecord => r !== undefined && r.kind === BLOCK_KIND && r.deletedAt === null)
}

// THIS DRAWER NO LONGER MINTS AN ID, AND ITS NOT DOING SO IS THE POINT. It used to mint `step-<n>`,
// unique within ONE pipeline only — so the first block created through this drawer in two different
// pipelines would both have got the same one. Nothing checked that, because a step id was a string
// in a JSON array and nothing owned it. A block's id is minted by the server as an ordinary record
// id, which is unique across the workspace because it is a primary key.

// ============================================================================ the drawer

export interface EditProps {
  graph: StructureGraph
  /** Every record on file, so a pipeline's blocks can be resolved from the ids it lists. */
  records: readonly PanelRecord[]
  /** Every link on file, so which modules carry a block is read from the stored rows, not a title. */
  links: readonly GraphLink[]
  /** Every record a link may point at, by id, so the two ends are picked and never typed. */
  choices: readonly { id: string; title: string; kind: string }[]
  /** What is stored about how this drawing should be shown. Null while it is being read. */
  intent: StoredIntent | null
  /** Why the stored intent could not be read, in the server's words. Null when it could. */
  intentProblem: string | null
  /** Called after any successful write to the records or the links, so the page redraws. */
  onChanged: () => Promise<void>
  /** Called after any successful write to presentation intent, so the stored answer is re-read. */
  onIntentChanged: () => void
  /** Leave edit mode. */
  onClose: () => void
  /**
   * TRUE WHEN THE DRAWING READS ONLY A CARD'S LANE AND ITS ORDER, as a pipeline's lanes do. "How this is shown"
   * then offers those two and no other field: a direction, a room, an emphasis, a fold or a "kept beside" stored
   * there would be a hint the drawing never reads. Every field, when left out.
   */
  laneAndOrderOnly?: boolean
  /**
   * Which action is open at rest. Null — nothing open — is what a person always gets.
   *
   * IT EXISTS FOR THE TEST RUNNER, and that is said rather than hidden. This repository's runner has
   * no DOM, so no test can press one of these buttons; without a way to render an action open, the
   * property that matters most here — that ONE action's fields are on screen and no others — could
   * only ever be checked by eye on a screenshot.
   */
  openAction?: EditActionId | null
}

export function Edit(props: EditProps) {
  const inspect = useInspect()
  const { graph, records, links, choices, intent, intentProblem, onChanged, onIntentChanged, onClose } = props
  const [open, setOpen] = useState<EditActionId | null>(props.openAction ?? null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [busy, setBusy] = useState(false)

  const pick = (id: EditActionId) => {
    setOutcome(null)
    setOpen((current) => (current === id ? null : id))
  }

  const run = async (work: () => Promise<Outcome>, after: 'records' | 'intent'): Promise<Outcome> => {
    setBusy(true)
    setOutcome(null)
    try {
      const result = await work()
      if (result.ok) {
        if (after === 'records') await onChanged()
        else onIntentChanged()
      }
      setOutcome(result)
      return result
    } finally {
      setBusy(false)
    }
  }

  const shared = { graph, records, links, choices, busy, run }

  return (
    <div className="gx-edit">
      <div className="gx-edit-top">
        <h3 data-title-is="label" className="gx-edit-h">{t('g7b.Edit.editing_this_drawing')}</h3>
        {/* NOT "Done". It closes this drawer and writes nothing; three different controls said
            Done and a first-time user pressed one of them expecting another, which is recorded in
            the round-seven acceptance run. The two that still say Done both mean the work is
            finished. */}
        <Btn variant="secondary" size="sm" onClick={onClose}>{t('g7b.Edit.close')}</Btn>
      </div>

      <div className="gx-acts" role="group" aria-label={t('g7b.Edit.what_to_change')}>
        {ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            className="gx-act"
            aria-expanded={open === action.id}
            {...(open === action.id ? { 'data-current': '1' } : {})}
            onClick={() => pick(action.id)}
          >
            {action.label}
          </button>
        ))}
      </div>

      {open === null ? (
        <p className="gx-edit-idle">{t('g7b.Edit.pick_one_each_opens_only_the_fields')}</p>
      ) : (
        <div className="gx-form">
          <p className="gx-form-h">{ACTIONS.find((action) => action.id === open)?.opens}</p>
          {open === 'add-node' ? <AddNode {...shared} /> : null}
          {open === 'edit-node' ? <EditNode {...shared} /> : null}
          {open === 'add-link' ? <AddLink {...shared} /> : null}
          {open === 'change-link' ? <ChangeLink {...shared} /> : null}
          {open === 'remove-link' ? <RemoveLink {...shared} /> : null}
          {open === 'step' ? <BlockForm {...shared} /> : null}
          {open === 'remove-item' ? <RemoveItem {...shared} /> : null}
          {open === 'presentation' ? (
            <PresentationForm {...shared} intent={intent} intentProblem={intentProblem} laneAndOrderOnly={props.laneAndOrderOnly === true} />
          ) : null}
        </div>
      )}

      <OutcomeLine outcome={outcome} />

      {/*
        THE ONE QUIET STATEMENT. It used to be the heading over the whole page — "the same requests an
        agent sends" — which made ordinary product editing read as an implementation detail. It is a
        true and useful fact, so it is kept, once, where somebody who wants it can find it.
      */}
      {inspect ? <Explain declares={{ surface: 'structure.edit' }}
        meaning={<span>{t('g7b.Edit.a_person_and_an_agent_make_the')}</span>}
        opens={t('g7b.Edit.how_these_edits_are_stored_and_what')}
      >
        <p className="gx-prose">{t('g7b.Edit.every_control_here_sends_an_ordinary_mole')}<code>POST /api/records</code>,{' '}
          <code>PATCH /api/records/:id</code>, <code>POST /api/links</code>,{' '}
          <code>PUT /api/presentation/:scope/nodes/:node</code>{t('g7b.Edit.and_there_is_nothing_on_this_drawer')}</p>
        <p className="gx-prose">
          <b>{t('g7b.Edit.a_link_cannot_be_changed_in_place')}</b>{t('g7b.Edit.the_server_has_no_patch_for_one')}</p>
        <p className="gx-prose">
          <b>{t('g7b.Edit.only_a')}<code>blocks</code>{t('g7b.Edit.link_may_carry_a_gate')}</b>{t('g7b.Edit.and_a_partial_gate_has_to_say')}</p>
        <p className="gx-prose">
          <b>{t('g7b.Edit.how_this_is_shown_is_meaning_not')}</b>{t('g7b.Edit.direction_lane_order_role_emphasis_and_folding_1256')}</p>
      </Explain> : null}
    </div>
  )
}

// ============================================================================ shared props

interface FormProps {
  graph: StructureGraph
  records: readonly PanelRecord[]
  /** Every link the page loaded, so which modules carry a block is read from the stored rows. */
  links: readonly GraphLink[]
  choices: readonly { id: string; title: string; kind: string }[]
  busy: boolean
  run: (work: () => Promise<Outcome>, after: 'records' | 'intent') => Promise<Outcome>
}

async function checked(result: Promise<Outcome>): Promise<void> {
  const outcome = await result
  if (!outcome.ok) throw new Error(outcome.said)
}

function storedLink(link: GraphLink) {
  return { fromId: link.fromId, toId: link.toId, type: link.type,
    ...(link.gate.at === 'gate' ? { gate: link.gate.gate } : {}) }
}

const BUSY = () => t('g7b.Edit.a_write_is_in_flight_it_will')

/**
 * The cards that stand for a record on their own, excluding a pipeline's blocks.
 *
 * A BLOCK IS A RECORD NOW, so this is no longer "the ones that are records". It is "the ones this
 * form addresses by their card", and a block is addressed through its pipeline instead, because
 * its title and its position both belong to that pipeline.
 */
function recordNodes(graph: StructureGraph): GraphNode[] {
  return graph.nodes.filter((node) => node.stepId === null)
}

/** The module record ids linked to this block by an `implements` link, from the stored rows. */
function carriersOf(blockId: string, links: readonly GraphLink[]): string[] {
  if (blockId === '') return []
  return links.filter((link) => link.type === 'implements' && link.toId === blockId).map((link) => link.fromId)
}

function nodeLabel(node: GraphNode): string {
  return `${kindWord(node.kind).text} · ${node.ordinal === null ? '' : `${node.ordinal} `}${node.title}`
}

function removableEdges(graph: StructureGraph): GraphEdge[] {
  return graph.edges.filter((edge) => edge.linkId !== null)
}

function edgeOptions(graph: StructureGraph): { value: string; label: string }[] {
  return removableEdges(graph).map((edge) => {
    const from = graph.nodes.find((n) => n.id === edge.from)?.title ?? t('g7b.missingRecord')
    const to = graph.nodes.find((n) => n.id === edge.to)?.title ?? t('g7b.missingRecord')
    return { value: edge.id, label: `${from} — ${edge.label} → ${to}` }
  })
}

/** A node id back to the record id it draws. The prefixes are model.ts's; stripped in one place. */
function recordIdOfNodeId(graph: StructureGraph, nodeId: string): string {
  return graph.nodes.find((node) => node.id === nodeId)?.recordId ?? nodeId
}

/**
 * The options a Select is given, plus the value it is holding when nothing in the list matches.
 *
 * A card can disappear while this drawer is open — somebody deletes it here, an agent writes over the
 * API, a scope is redrawn. `Select` throws on a value it has no option for, and a select rendered
 * with an unknown value shows a blank box that reads as a choice nobody made. So the value that has
 * gone is kept in the list and NAMED, which is this product's rule about silence applied to a widget.
 */
export function withMissing<T extends string>(
  options: readonly { value: T; label: string }[],
  value: T,
  what: string,
): { value: T; label: string }[] {
  if (value === ('' as T) || options.some((option) => option.value === value)) return [...options]
  return [{ value, label: currentMode() === 'inspect' ? `${value} — ${what}` : what }, ...options]
}

// ============================================================================ what else is called this

/**
 * What else in this project already answers to the name that was just stored, in one sentence.
 *
 * Empty when nothing does, which is the ordinary case and is why the caller appends it rather than
 * printing it on its own line.
 *
 * WHY THIS IS NOT THE SERVER'S SENTENCE. The reply carries `sameTitleNote` beside the list, and it
 * is written for whoever called the API: it names the DELETE request that removes one of them. That
 * is the right sentence for an agent reading a 201 and the wrong one to put in front of a person
 * who has just typed a name. So the LIST is the fact, sent once by the server, and this is how this
 * screen says it. Nothing is decided here that the server did not already decide.
 *
 * IT SAYS THE WRITE WENT THROUGH, in its first words, because until 17 August 2026 a repeated title
 * was a refusal and somebody who met the old one will read a warning as one unless it says
 * otherwise.
 */
export function alsoCalledThis(sameTitle: RecordReply['sameTitle']): string {
  if (sameTitle === undefined || sameTitle.length === 0) return ''
  return t('g7b.sameTitle', { n: sameTitle.length })
}

// ============================================================================ add a module

function AddNode({ busy, run }: FormProps) {
  const [title, setTitle] = useState('')
  const [context, setContext] = useState('')

  const file = async (): Promise<Outcome> => {
    const body = { kind: 'module' as const, title: title.trim(), data: { context: context.trim(), parts: [] } }
    const request = `POST /api/records ${JSON.stringify(body)}`
    try {
      const reply = await api.createRecord(body)
      setTitle('')
      setContext('')
      return { ok: true, request, said: t('g7b.filed', { title: body.title }) + (reply.incomplete.length > 0 ? ' ' + t('g7b.incomplete') : '') + alsoCalledThis(reply.sameTitle) }
    } catch (err) {
      return { ok: false, request, said: errorMessage(err) }
    }
  }

  return (
    <>
      {/* THE HINT DOES NOT PROMISE A UNIQUE NAME ANY MORE. It used to read "Titles are unique in
          this workspace", and since 17 August 2026 that is false: the unique index was dropped and
          two records may hold one name. What it still does say is true — typing a name is how you
          link to something, because every title lookup on the server resolves a typed name.

          WHAT ELSE IS ALREADY CALLED THIS IS SAID AFTER THE WRITE, NOT BEFORE IT, and it is said by
          the outcome line rather than by this hint. The server answers the question on the 201 —
          sameTitle, the live records in this project that already held the name — and this form
          could not name that field until src/web/api.ts carried it, which is why the hint was left
          weaker and said so here. It is carried now, and alsoCalledThis above turns the list into
          the sentence. A hint written before anybody has typed anything cannot say it: Mole Office only
          knows what else is called this once it knows what you called it. */}
      <Field
        label={t('g7b.Edit.its_name')}
        hint={t('g7b.Edit.choose_a_name_that_helps_you_find')}
      >
        <TextInput value={title} onChange={setTitle} placeholder={t('g7b.Edit.archive_shelf')} />
      </Field>
      <Field
        label={t('g7b.Edit.why_it_exists')}
        hint={t('g7b.Edit.the_reason_not_the_description_what_goes')}
      >
        <TextArea
          value={context}
          onChange={setContext}
          rows={2}
          placeholder={t('g7b.Edit.the_reading_room_needs_a_place_to')}
        />
      </Field>
      <Btn
        variant="primary"
        onClick={() => void run(file, 'records')}
        disabled={busy || title.trim() === ''}
        reason={
          busy
            ? BUSY()
            : t('g7b.Edit.type_a_name_first_a_module_with')
        }
      >{t('g7b.Edit.file_it')}</Btn>
      <p className="gx-prose">{t('g7b.Edit.a_pipeline_is_filed_on_the_records')}<b>{t('g7b.Edit.add_or_edit_a_block')}</b>{t('g7b.Edit.a_block_is_a_record_of_its')}</p>
    </>
  )
}

// ============================================================================ edit a card

function EditNode({ graph, busy, run }: FormProps) {
  const nodes = recordNodes(graph)
  const [id, setId] = useState(nodes[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [context, setContext] = useState('')
  const picked = nodes.find((node) => node.id === id) ?? null

  const change = async (): Promise<Outcome> => {
    if (picked === null) return { ok: false, request: '(nothing picked)', said: t('g7b.Edit.pick_a_card_first') }
    const patch: { title?: string; dataPatch?: Record<string, unknown> } = {}
    if (title.trim() !== '') patch.title = title.trim()
    if (context.trim() !== '') patch.dataPatch = { context: context.trim() }
    const request = `PATCH /api/records/${picked.recordId} ${JSON.stringify(patch)}`
    if (Object.keys(patch).length === 0) {
      return { ok: false, request, said: t('g7b.Edit.nothing_was_typed_so_nothing_was_sent') }
    }
    try {
      const reply = await api.updateRecord(picked.recordId, patch)
      setTitle('')
      setContext('')
      // A RENAME SAYS WHAT ELSE IS CALLED THIS, exactly as filing one does. PATCH /api/records/:id
      // has answered sameTitle since 18 August 2026; before that this line could not have said it
      // however the reply was read, because the route never sent it.
      return { ok: true, request, said: t('g7b.changed', { title: reply.record.title }) + alsoCalledThis(reply.sameTitle) }
    } catch (err) {
      return { ok: false, request, said: errorMessage(err) }
    }
  }

  if (nodes.length === 0) {
    return <Absence />
  }

  return (
    <>
      <Field
        label={t('g7b.Edit.which_card')}
        hint={t('g7b.Edit.pressing_a_card_on_the_canvas_opens')}
      >
        <Select
          value={id}
          onChange={setId}
          options={withMissing(
            nodes.map((node) => ({ value: node.id, label: nodeLabel(node) })),
            id,
            t('g7b.Edit.no_longer_on_this_drawing'),
          )}
        />
      </Field>
      <Field label={t('g7b.Edit.new_name')} hint={t('g7b.Edit.leave_it_empty_to_keep_the_name')}>
        <TextInput value={title} onChange={setTitle} placeholder={picked?.title ?? ''} />
      </Field>
      <Field label={t('g7b.Edit.new_reason_for_it_existing')} hint={t('g7b.Edit.leave_it_empty_to_keep_what_is')}>
        <TextArea value={context} onChange={setContext} rows={2} placeholder={t('g7b.Edit.why_it_exists_1303')} />
      </Field>
      <Btn
        variant="primary"
        onClick={() => void run(change, 'records')}
        disabled={busy || picked === null}
        reason={busy ? BUSY() : t('g7b.Edit.pick_a_card_above_first')}
      >{t('g7b.Edit.change_it')}</Btn>
      <p className="gx-prose">{t('g7b.Edit.a_pipeline_block_is_not_here_its')}{' '}
        <b>{t('g7b.Edit.add_or_edit_a_block')}</b>{t('g7b.Edit.and_never_by_typing_a_title')}</p>
    </>
  )
}

// ============================================================================ add a relationship

function AddLink({ choices, busy, run }: FormProps) {
  const [fromId, setFromId] = useState(choices[0]?.id ?? '')
  const [toId, setToId] = useState(choices[1]?.id ?? choices[0]?.id ?? '')
  const [type, setType] = useState<LinkType>('relates_to')
  const [gateKind, setGateKind] = useState<GateChoice>('none')
  const [upTo, setUpTo] = useState('')
  const gateAllowed = type === GATED_LINK_TYPE
  const options = choices.map((choice) => ({ value: choice.id, label: `${kindWord(choice.kind).text} · ${choice.title}` }))

  const store = async (): Promise<Outcome> => {
    const gate = gateAllowed ? gateFrom(gateKind, upTo) : null
    const body = { fromId, toId, type, ...(gate === null ? {} : { gate }) }
    const request = `POST /api/links ${JSON.stringify(body)}`
    try {
      // `.id` off the reply rather than the reply itself: POST /api/links now answers with both
      // ends and a sentence, and this panel already prints the request it sent, so the id is the
      // only part of it this line is about.
      const { id } = await api.createLink(body)
      return {
        ok: true,
        request,
        said: t('g7b.saved'),
      }
    } catch (err) {
      return { ok: false, request, said: errorMessage(err) }
    }
  }

  const partialUnsaid = gateAllowed && gateKind === 'partial' && upTo.trim() === ''

  return (
    <>
      <Field label={t('g7b.Edit.from')}>
        <Select value={fromId} onChange={setFromId} options={options} />
      </Field>
      <Field
        label={t('g7b.Edit.which_relationship')}
        hint={t('g7b.Edit.stored_once_in_this_direction_the_other')}
      >
        <Select value={type} onChange={setType} options={linkTypeOptions()} />
      </Field>
      <Field label={t('g7b.Edit.to')}>
        <Select value={toId} onChange={setToId} options={options} />
      </Field>
      <GateFields
        allowed={gateAllowed}
        kind={gateKind}
        onKind={setGateKind}
        upTo={upTo}
        onUpTo={setUpTo}
      />
      <Btn
        variant="primary"
        onClick={() => void run(store, 'records')}
        disabled={busy || fromId === '' || toId === '' || fromId === toId || partialUnsaid}
        reason={
          busy
            ? BUSY()
            : fromId === toId
              ? t('g7b.Edit.both_ends_are_the_same_record_a')
              : partialUnsaid
                ? t('g7b.Edit.a_partial_gate_has_to_say_how')
                : t('g7b.Edit.pick_a_record_at_each_end_first')
        }
      >{t('g7b.Edit.store_the_link')}</Btn>
    </>
  )
}

/**
 * The gate controls, written once.
 *
 * Shared by "add" and "change" because the rule is the server's and there is one of it: a gate rides
 * on `blocks` and nothing else, and a partial gate says how far. Two copies of this would be two
 * chances to disagree with the server about what it will accept.
 */
function GateFields({
  allowed,
  kind,
  onKind,
  upTo,
  onUpTo,
}: {
  allowed: boolean
  kind: GateChoice
  onKind: (next: GateChoice) => void
  upTo: string
  onUpTo: (next: string) => void
}) {
  return (
    <>
      <Field
        label={t('g7b.Edit.how_much_it_blocks')}
        hint={
          allowed
            ? t('g7b.Edit.leaving_this_at_nobody_has_said_is')
            : t('g7b.Edit.only_a_blocking_relationship_can_say_how')
        }
      >
        <Select value={kind} onChange={onKind} options={gateOptions(allowed)} />
      </Field>
      {allowed && kind === 'partial' ? (
        <Field
          label={t('g7b.Edit.how_far_it_may_go')}
          hint={t('g7b.Edit.name_the_stage_that_may_be_reached')}
        >
          <TextInput value={upTo} onChange={onUpTo} placeholder={t('g7b.Edit.first_review')} />
        </Field>
      ) : null}
    </>
  )
}

// ============================================================================ change a relationship

function ChangeLink({ graph, busy, run }: FormProps) {
  const edges = removableEdges(graph)
  const [edgeId, setEdgeId] = useState(edges[0]?.id ?? '')
  const picked = edges.find((edge) => edge.id === edgeId) ?? null
  const [type, setType] = useState<LinkType>(picked?.linkType ?? 'relates_to')
  const [gateKind, setGateKind] = useState<GateChoice>(picked?.gate?.kind ?? 'none')
  const [upTo, setUpTo] = useState(picked?.gate?.upTo ?? '')
  const gateAllowed = type === GATED_LINK_TYPE
  const partialUnsaid = gateAllowed && gateKind === 'partial' && upTo.trim() === ''

  // The form opens on what the line ALREADY says, so "change the gate" does not silently reset the
  // relationship to `relates to`. It reloads when the line changes and at no other time, so what has
  // been typed since is not thrown away.
  useEffect(() => {
    const line = edges.find((edge) => edge.id === edgeId) ?? null
    setType(line?.linkType ?? 'relates_to')
    setGateKind(line?.gate?.kind ?? 'none')
    setUpTo(line?.gate?.upTo ?? '')
    // `edges` is rebuilt from the graph on every render; the id is what decides which line this is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edgeId])

  /** Change a relationship: remove, then add, and report both — including a half-done pair. */
  const change = async (): Promise<Outcome> => {
    if (picked === null || picked.linkId === null) {
      return { ok: false, request: '(nothing picked)', said: t('g7b.Edit.pick_a_stored_link_to_change') }
    }
    const gate = gateAllowed ? gateFrom(gateKind, upTo) : null
    const body = {
      fromId: recordIdOfNodeId(graph, picked.from),
      toId: recordIdOfNodeId(graph, picked.to),
      type,
      ...(gate === null ? {} : { gate }),
    }
    const request = `DELETE /api/links/${picked.linkId}, then POST /api/links ${JSON.stringify(body)}`
    try {
      await api.deleteLink(picked.linkId)
    } catch (err) {
      return { ok: false, request, said: t('g7b.Edit.nothing_was_changed_the_removal_failed', { v1: errorMessage(err) }) }
    }
    try {
      const { id } = await api.createLink(body)
      return { ok: true, request, said: t('g7b.linkChanged') }
    } catch (err) {
      return {
        ok: false,
        request,
        said: t('g7b.Edit.the_old_link_is_gone_and_the', { v1: errorMessage(err) }),
      }
    }
  }

  if (edges.length === 0) return <NoStoredLines />

  return (
    <>
      <Field label={t('g7b.Edit.which_line')}>
        <Select
          value={edgeId}
          onChange={setEdgeId}
          options={withMissing(edgeOptions(graph), edgeId, t('g7b.Edit.no_longer_on_this_drawing'))}
        />
      </Field>
      <Field
        label={t('g7b.Edit.the_relationship_it_should_be')}
        hint={t('g7b.Edit.this_removes_the_old_relationship_and_stores')}
      >
        <Select value={type} onChange={setType} options={linkTypeOptions()} />
      </Field>
      <GateFields allowed={gateAllowed} kind={gateKind} onKind={setGateKind} upTo={upTo} onUpTo={setUpTo} />
      <ConfirmPress press={t('g7b.press.replace')} question={t('g7b.press.replaceQuestion')}
        quote={edgeOptions(graph).find((edge) => edge.value === edgeId)?.label ?? ''}
        warning={t('g7b.press.replaceWarning')} disabled={busy || picked === null || partialUnsaid}
        disabledReason={busy ? BUSY() : partialUnsaid ? t('g7b.Edit.a_partial_gate_has_to_say_how') : t('g7b.Edit.pick_a_stored_link_first')}
        onPress={() => checked(run(change, 'records'))} />
    </>
  )
}

// ============================================================================ remove a relationship

function RemoveLink({ graph, links, busy, run }: FormProps) {
  const edges = removableEdges(graph)
  const [edgeId, setEdgeId] = useState(edges[0]?.id ?? '')
  const picked = edges.find((edge) => edge.id === edgeId) ?? null

  const remove = async (): Promise<Outcome> => {
    if (picked === null || picked.linkId === null) {
      return {
        ok: false,
        request: '(nothing picked)',
        said: t('g7b.Edit.pick_a_stored_link_first'),
      }
    }
    const request = `DELETE /api/links/${picked.linkId}`
    try {
      await api.deleteLink(picked.linkId)
      return { ok: true, request, said: t('g7b.Edit.the_link_is_gone_both_records_are') }
    } catch (err) {
      return { ok: false, request, said: errorMessage(err) }
    }
  }


  return (
    <>
      <Field label={t('g7b.Edit.which_line')}>
        <Select
          value={edgeId}
          onChange={setEdgeId}
          options={withMissing(edgeOptions(graph), edgeId, t('g7b.Edit.no_longer_on_this_drawing'))}
        />
      </Field>
      {edges.length === 0 ? <NoStoredLines /> : null}
      <UndoPress press={t('g7b.press.removeLink')} done={t('g7b.press.linkRemoved')}
        available={picked !== null} disabled={busy} onPress={async () => {
          const before = links.find((link) => link.linkId === picked?.linkId)
          if (before === undefined) throw new Error(t('g7b.missingRecord'))
          await checked(run(remove, 'records'))
          return { remainingMs: DRAWING_UNDO_MS, undo: async () => {
            await api.createLink(storedLink(before))
            await run(async () => ({ ok: true, request: '', said: t('g7b.press.linkRestored') }), 'records')
          } }
        }} />
    </>
  )
}

function NoStoredLines() {
  return <Absence />
}

// ============================================================================ a pipeline block

const NEW_BLOCK = '(new)'

/**
 * Add or change one block of one pipeline.
 *
 * NO READ-MODIFY-WRITE ANY MORE, and that is the whole difference. This used to read the pipeline's
 * whole `data.steps` array, change one element, and PATCH the array back — so two people adding a
 * block at the same time each sent a list built before the other's write, and the first block
 * vanished with nothing reporting it. A block is a record: this sends one create or one patch, and
 * the server writes the record and the pipeline's order in one transaction.
 *
 * WHICH MODULES CARRY IT IS A LINK, made and removed here as `implements` links from the module to
 * the block. It used to be a list of TITLES stored on the step beside a parallel `implements` link
 * that named the same modules by id — two representations of one fact, and one accepted module
 * rename broke ten of them behind a 200.
 */
function BlockForm({ graph, records, links, busy, run }: FormProps) {
  const pipelines = records.filter((record) => record.kind === 'pipeline')
  const inScope = graph.scope.at === 'pipeline' ? graph.scope.recordId : (pipelines[0]?.id ?? '')
  const [pipelineId, setPipelineId] = useState(inScope)
  const record = pipelines.find((p) => p.id === pipelineId)
  const stored = storedBlocksOf(record, records)

  const [blockId, setBlockId] = useState(NEW_BLOCK)
  const [name, setName] = useState('')
  const [state, setState] = useState<ItemState>('todo')
  const [carriers, setCarriers] = useState<string[]>([])
  const [adding, setAdding] = useState('')

  const modules = useMemo(
    () =>
      records
        .filter((r) => r.kind === 'module' && r.deletedAt === null)
        .sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0)),
    [records],
  )

  // Reading the picked block into the form is an EFFECT rather than a value worked out on render,
  // because these fields are then typed into: deriving them would throw a keystroke away on every
  // re-render. It runs when the pipeline or the block changes and at no other time.
  useEffect(() => {
    if (blockId === NEW_BLOCK) {
      setName('')
      setState('todo')
      setCarriers([])
      return
    }
    const found = stored.find((block) => block.id === blockId)
    setName(record === undefined || found === undefined ? '' : blockNameIn(found.title, record.title))
    const word = isObj(found?.data) && typeof found.data['state'] === 'string' ? found.data['state'] : 'todo'
    setState((ITEM_STATES as readonly string[]).includes(word) ? (word as ItemState) : 'todo')
    setCarriers(carriersOf(blockId === NEW_BLOCK ? '' : blockId, links))
    // `stored` is rebuilt on every render from the records prop, so it is not a dependency: the two
    // ids are what decide which block this form is showing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineId, blockId])

  const save = async (): Promise<Outcome> => {
    if (record === undefined) return { ok: false, request: '(no pipeline)', said: t('g7b.Edit.pick_a_pipeline_first') }
    const isNew = blockId === NEW_BLOCK
    const request = isNew
      ? `POST /api/records/${record.id}/blocks {"name":${JSON.stringify(name.trim())},"state":"${state}"}`
      : `PATCH /api/records/${record.id}/blocks/${blockId} {"name":…,"state":"${state}"}`
    try {
      const id = isNew
        ? (await api.addBlock(record.id, { name: name.trim(), state })).record.id
        : (await api.patchBlock(record.id, blockId, { name: name.trim(), state })).record.id

      // The carriers, as links. Added and removed one at a time and REPORTED one at a time, because
      // each is its own stored row and a summary that said "3 modules" would hide which of them the
      // server refused.
      const before = new Set<string>(carriersOf(isNew ? '' : blockId, links))
      const after = new Set(carriers)
      const added: string[] = []
      for (const moduleId of after) {
        if (before.has(moduleId)) continue
        await api.createLink({ fromId: moduleId, toId: id, type: 'implements' })
        added.push(moduleId)
      }
      const dropped: string[] = []
      for (const moduleId of before) {
        if (after.has(moduleId)) continue
        const edge = links.find(
          (link) => link.type === 'implements' && link.fromId === moduleId && link.toId === blockId,
        )
        if (edge === undefined) continue
        await api.deleteLink(edge.linkId)
        dropped.push(moduleId)
      }
      if (isNew) setBlockId(id)
      const carried =
        added.length === 0 && dropped.length === 0
          ? t('g7b.Edit.which_modules_carry_it_is_unchanged')
          : t('g7b.carriersChanged', { added: added.length, removed: dropped.length })
      return {
        ok: true,
        request,
        said: t('g7b.press.blockSaved') + ' ' + carried,
      }
    } catch (err) {
      return { ok: false, request, said: errorMessage(err) }
    }
  }

  if (pipelines.length === 0) return <Absence />

  const uncarried = modules.filter((module) => !carriers.includes(module.id))

  return (
    <>
      <Field label={t('g7b.Edit.which_pipeline')}>
        <Select
          value={pipelineId}
          onChange={(next) => {
            setPipelineId(next)
            setBlockId(NEW_BLOCK)
          }}
          options={withMissing(
            pipelines.map((p) => ({ value: p.id, label: p.title })),
            pipelineId,
            t('g7b.Edit.not_a_pipeline_on_file_any_more'),
          )}
        />
      </Field>
      <Field
        label={t('g7b.Edit.which_block')}
        hint={t('g7b.Edit.renaming_a_block_keeps_its_relationships_intact')}
      >
        <Select
          value={blockId}
          onChange={setBlockId}
          options={withMissing(
            [
              { value: NEW_BLOCK, label: t('g7b.Edit.a_new_block_at_the_end') },
              ...stored.map((block) => ({
                value: block.id,
                label: record === undefined ? block.title : blockNameIn(block.title, record.title),
              })),
            ],
            blockId,
            t('g7b.Edit.not_a_block_on_this_pipeline_any'),
          )}
        />
      </Field>
      <Field label={t('g7b.Edit.its_name')}>
        <TextInput value={name} onChange={setName} placeholder={t('g7b.Edit.read_and_review')} />
      </Field>
      <Field label={t('g7b.Edit.where_it_has_got_to')}>
        <Select
          value={state}
          onChange={setState}
          options={ITEM_STATES.map((word) => ({ value: word, label: stateWord(word).text }))}
        />
      </Field>
      <Field
        label={t('g7b.Edit.which_modules_carry_it')}
        hint={t('g7b.Edit.choose_the_modules_responsible_for_this_block')}
      >
        <Select
          value={adding}
          onChange={setAdding}
          options={[
            { value: '', label: uncarried.length === 0 ? t('g7b.Edit.every_module_already_carries_it') : t('g7b.Edit.pick_a_module') },
            ...uncarried.map((module) => ({ value: module.id, label: module.title })),
          ]}
        />
      </Field>
      <div className="gx-edit-row">
        <Btn
          size="sm"
          onClick={() => {
            setCarriers((current) => [...current, adding])
            setAdding('')
          }}
          disabled={adding === ''}
          reason={t('g7b.Edit.pick_a_module_in_the_list_above')}
        >{t('g7b.Edit.add_that_module')}</Btn>
      </div>
      <ul className="gx-carriers">
        {carriers.length === 0 ? (
          <li className="gx-carrier-none">
            <Absence />
          </li>
        ) : (
          carriers.map((moduleId) => (
            <li key={moduleId} className="gx-carrier">
              <span>{modules.find((m) => m.id === moduleId)?.title ?? t('g7b.missingRecord')}</span>
              <button
                type="button"
                className="gx-carrier-drop"
                onClick={() => setCarriers((current) => current.filter((t) => t !== moduleId))}
              >{t('g7b.Edit.stop_carrying')}</button>
            </li>
          ))
        )}
      </ul>
      {blockId === NEW_BLOCK ? (
        <Btn variant="primary" onClick={() => void run(save, 'records')}
          disabled={busy || name.trim() === '' || record === undefined}
          reason={busy ? BUSY() : record === undefined ? t('g7b.Edit.pick_a_pipeline_first') : t('g7b.press.blockNeedsName')}>{t('g7b.Edit.file_the_block')}</Btn>
      ) : (
        <UndoPress press={t('g7b.press.saveBlock')} done={t('g7b.press.blockSaved')} available
          disabledReason={busy ? BUSY() : record === undefined ? t('g7b.Edit.pick_a_pipeline_first') : t('g7b.press.blockNeedsName')}
          disabled={busy || name.trim() === '' || record === undefined} onPress={async () => {
            const before = stored.find((block) => block.id === blockId)
            if (record === undefined || before === undefined) throw new Error(t('g7b.missingRecord'))
            const prior = links.filter((link) => link.type === 'implements' && link.toId === blockId)
            await checked(run(save, 'records'))
            const pipeline = record
            const savedBlockId = blockId
            const savedRecord = (await api.getRecord(savedBlockId)).record
            const savedLinks: LinkAnswered<LinkOnTheWire, 'draw'>[] =
              await api.listLinks({ type: ['implements'], toId: savedBlockId, shape: 'draw' })
            return { remainingMs: DRAWING_UNDO_MS, undo: async () => {
              const current: LinkAnswered<LinkOnTheWire, 'draw'>[] =
                await api.listLinks({ type: ['implements'], toId: savedBlockId, shape: 'draw' })
              const currentRecord = (await api.getRecord(savedBlockId)).record
              if (JSON.stringify(currentRecord) !== JSON.stringify(savedRecord) || JSON.stringify(current) !== JSON.stringify(savedLinks)) {
                throw new Error(t('g7b.undoChanged'))
              }
              for (const link of prior) {
                if (!current.some((one) => one.fromId === link.fromId)) await api.createLink(storedLink(link))
              }
              for (const link of current) {
                if (!prior.some((one) => one.fromId === link.fromId)) await api.deleteLink(link.id)
              }
              await api.patchBlock(pipeline.id, savedBlockId, {
                name: blockNameIn(before.title, pipeline.title), state: before.data['state'] as ItemState,
              })
              setCarriers(prior.map((link) => link.fromId))
              setName(blockNameIn(before.title, pipeline.title))
              setState(before.data['state'] as ItemState)
              await run(async () => ({ ok: true, request: '', said: t('g7b.press.blockRestored') }), 'records')
            } }
          }} />
      )}

      {/* THE ORDER, AND TAKING ONE OUT — the two writes the server has always served and nothing in
          the browser ever called. `api.reorderBlocks` and `api.removeBlock` existed with no caller
          in src/web at all: the routes, and two tests, were everything that reached them.

          MOVE UP AND MOVE DOWN RATHER THAN DRAGGING. Both express the same operation, and this one
          works at 390 px, works from a keyboard, and needs no pointer — and the canvas deliberately
          has no hand-set positions, so a drag there would be inventing a gesture whose only meaning
          is an order this list already shows. Each press sends the WHOLE new order, which is what
          PUT /api/records/:id/blocks takes: it refuses a list that leaves a block out, so a partial
          reorder cannot be expressed, let alone stored. */}
      {record === undefined || stored.length === 0 ? null : (
        <>
          <p className="gx-label">{t('g7b.Edit.the_order_the_work_happens_in')}</p>
          <ol className="gx-order">
            {stored.map((block, at) => (
              <li key={block.id} className="gx-order-row">
                <span className="gx-order-at num">{at + 1}</span>
                <span className="gx-order-name">{blockNameIn(block.title, record.title)}</span>
                <button
                  type="button"
                  className="gx-order-move"
                  disabled={busy || at === 0}
                  title={at === 0 ? t('g7b.Edit.this_is_already_the_first_block') : t('g7b.Edit.move_it_one_earlier')}
                  onClick={() => void run(() => moveBlock(record, stored, at, -1), 'records')}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="gx-order-move"
                  disabled={busy || at === stored.length - 1}
                  title={at === stored.length - 1 ? t('g7b.Edit.this_is_already_the_last_block') : t('g7b.Edit.move_it_one_later')}
                  onClick={() => void run(() => moveBlock(record, stored, at, 1), 'records')}
                >
                  ↓
                </button>
                <ConfirmPress size="sm" press={t('g7b.press.removeBlock')}
                  question={t('sharedBlock.removeQuestion')} quote={block.title}
                  warning={t('sharedBlock.removeWarning')} disabled={busy}
                  onPress={() => checked(run(() => dropBlock(record, block, at), 'records'))} />
              </li>
            ))}
          </ol>
        </>
      )}

      <p className="gx-prose">{t('g7b.Edit.use_add_a_relationship_to_say_which')}</p>
    </>
  )
}

/**
 * Move one block one place, by sending the WHOLE new order.
 *
 * `PUT /api/records/:id/blocks` takes the entire array and refuses one that leaves a block out, so
 * a partial reorder is not a thing that can be sent — which is why this builds the full list rather
 * than an instruction. The swap is done on the ids read back from the pipeline a moment ago, so two
 * people reordering at once end with one of the two orders and never with a spliced third.
 */
async function moveBlock(
  pipeline: PanelRecord,
  stored: readonly PanelRecord[],
  at: number,
  by: 1 | -1,
): Promise<Outcome> {
  const ids = stored.map((block) => block.id)
  const to = at + by
  const request = `PUT /api/records/${pipeline.id}/blocks {"blockIds":[…${ids.length} ids…]}`
  if (to < 0 || to >= ids.length) {
    return { ok: false, request, said: t('g7b.Edit.that_block_is_already_at_the_end') }
  }
  const next = [...ids]
  const moved = next[at] as string
  next[at] = next[to] as string
  next[to] = moved
  try {
    await api.reorderBlocks(pipeline.id, next)
    return {
      ok: true,
      request,
      said: t('g7b.Edit.now_runs_in_the_new_order_the', { v1: pipeline.title, v2: at + 1, v3: ids.length, v4: to + 1 }),
    }
  } catch (err) {
    return { ok: false, request, said: errorMessage(err) }
  }
}

/**
 * Take one block out of this order; delete it only when no other live pipeline lists it.
 *
 * `DELETE /api/records/:id/blocks/:blockId` is the ONE way: deleting the block record on its own is
 * refused while a pipeline still lists it, because that leaves the order naming a record that is
 * gone — a hole a reader has to be told about and a person has to repair by hand.
 */
async function dropBlock(pipeline: PanelRecord, block: PanelRecord, at: number): Promise<Outcome> {
  const request = `DELETE /api/records/${pipeline.id}/blocks/${block.id}`
  try {
    const result = await api.removeBlock(pipeline.id, block.id)
    return {
      ok: true,
      request,
      said: result.deleted
        ? t('g7b.Edit.was_position_of_and_is_now_deleted', { v1: block.title, v2: at + 1, v3: pipeline.title }) +
          t('g7b.Edit.same_write_its_links_are_left_alone') +
          t('g7b.Edit.somebody_recorded_is_a_fact_about_the')
        : t('sharedBlock.removedStillListed', { v1: block.title, v2: pipeline.title, v3: result.stillListedBy.map((holder) => holder.title).join(', ') }),
    }
  } catch (err) {
    return { ok: false, request, said: errorMessage(err) }
  }
}

// ============================================================================ remove an item

function RemoveItem({ graph, busy, run }: FormProps) {
  const nodes = recordNodes(graph)
  const [id, setId] = useState(nodes[0]?.id ?? '')
  const picked = nodes.find((node) => node.id === id) ?? null

  const remove = async (): Promise<Outcome> => {
    if (picked === null) return { ok: false, request: '(nothing picked)', said: t('g7b.Edit.pick_a_card_first') }
    const request = `DELETE /api/records/${picked.recordId}`
    try {
      await api.deleteRecord(picked.recordId)
      return {
        ok: true,
        request,
        said: t('g7b.deleted', { title: picked.title }),
      }
    } catch (err) {
      return { ok: false, request, said: errorMessage(err) }
    }
  }

  if (nodes.length === 0) return <Absence />

  return (
    <>
      <Field label={t('g7b.Edit.which_card')}>
        <Select
          value={id}
          onChange={setId}
          options={withMissing(
            nodes.map((node) => ({ value: node.id, label: nodeLabel(node) })),
            id,
            t('g7b.Edit.no_longer_on_this_drawing'),
          )}
        />
      </Field>
      <p className="gx-prose">{t('g7b.Edit.the_record_can_be_restored_from_its')}</p>
      <ConfirmPress press={t('g7b.press.removeItem')} question={t('g7b.press.removeItemQuestion')}
        quote={picked?.title ?? ''} warning={t('g7b.press.removeItemWarning')}
        disabledReason={busy ? BUSY() : t('g7b.Edit.pick_a_card_above_first')}
        disabled={busy || picked === null} onPress={() => checked(run(remove, 'records'))} />
    </>
  )
}

// ============================================================================ how this is shown

/** "Mole Office decides" as a value in a select. Never stored; it is what absent looks like in a list. */
const UNSET = ''

function PresentationForm(
  props: FormProps & { intent: StoredIntent | null; intentProblem: string | null; laneAndOrderOnly: boolean },
) {
  const { graph, busy, run, intent, intentProblem, laneAndOrderOnly } = props
  const scope = intentScopeKey(graph.scope)
  const nodes = graph.nodes
  const [target, setTarget] = useState(nodes[0] === undefined ? '' : intentTargetOf(nodes[0]))

  const stored: NodeIntent = intent?.intent.nodes?.[target] ?? {}
  const [lane, setLane] = useState('')
  const [order, setOrder] = useState('')
  const [role, setRole] = useState<NodeRole | typeof UNSET>(UNSET)
  const [emphasis, setEmphasis] = useState<EmphasisRole | typeof UNSET>(UNSET)
  const [collapsed, setCollapsed] = useState<'' | 'yes' | 'no'>(UNSET)
  const [near, setNear] = useState('')

  // Load what is stored for the node being arranged. An effect and not a derived value, because the
  // lane is typed into: recomputing it on every render would drop a keystroke.
  useEffect(() => {
    const held = intent?.intent.nodes?.[target] ?? {}
    setLane(held.lane ?? '')
    setOrder(held.order === undefined ? '' : String(held.order))
    setRole(held.role ?? UNSET)
    setEmphasis(held.emphasis ?? UNSET)
    setCollapsed(held.collapsed === undefined ? UNSET : held.collapsed ? 'yes' : 'no')
    setNear(held.near ?? '')
  }, [target, intent])

  const built = ((): { intent: NodeIntent; problem: string | null } => {
    const next: NodeIntent = {}
    if (lane.trim() !== '') next.lane = lane.trim()
    if (order.trim() !== '') {
      const parsed = Number(order.trim())
      if (!Number.isFinite(parsed)) {
        return { intent: next, problem: t('g7b.Edit.is_not_a_number_order_is_a', { v1: order.trim() }) }
      }
      next.order = parsed
    }
    if (role !== UNSET) next.role = role
    if (emphasis !== UNSET) next.emphasis = emphasis
    if (collapsed !== UNSET) next.collapsed = collapsed === 'yes'
    if (near !== '') next.near = near
    return { intent: next, problem: null }
  })()

  const setDirection = (next: GraphDirection | typeof UNSET) => async (): Promise<Outcome> => {
    const request =
      next === UNSET
        ? `DELETE /api/presentation/${scope}/direction`
        : `PUT /api/presentation/${scope}/direction {"intent":{"direction":"${next}"}}`
    try {
      const reply = next === UNSET ? await presentation.clearDirection(scope) : await presentation.putDirection(scope, next)
      return { ok: true, request, said: t('g7b.saved') }
    } catch (err) {
      return { ok: false, request, said: errorMessage(err) }
    }
  }

  const storeNode = async (): Promise<Outcome> => {
    const request = `PUT /api/presentation/${scope}/nodes/${target} ${JSON.stringify({ intent: built.intent })}`
    if (built.problem !== null) return { ok: false, request, said: built.problem }
    try {
      const reply = await presentation.putNode(scope, target, built.intent)
      return { ok: true, request, said: t('g7b.saved') }
    } catch (err) {
      return { ok: false, request, said: errorMessage(err) }
    }
  }

  const forgetNode = async (): Promise<Outcome> => {
    const request = `DELETE /api/presentation/${scope}/nodes/${target}`
    try {
      const reply = await presentation.clearNode(scope, target)
      return { ok: true, request, said: t('g7b.saved') }
    } catch (err) {
      return { ok: false, request, said: errorMessage(err) }
    }
  }

  const direction: GraphDirection | typeof UNSET = intent?.intent.direction ?? UNSET
  const nothingSet = Object.keys(built.intent).length === 0
  const nearOptions = withMissing(
    [
      { value: '', label: t('g7b.Edit.nothing_mole_office_decides') },
      ...nodes
        .filter((node) => intentTargetOf(node) !== target)
        .map((node) => ({ value: intentTargetOf(node), label: nodeLabel(node) })),
    ],
    near,
    t('g7b.Edit.stored_and_not_on_this_drawing'),
  )
  const targetOptions = withMissing(
    nodes.map((node) => ({ value: intentTargetOf(node), label: nodeLabel(node) })),
    target,
    t('g7b.Edit.no_longer_on_this_drawing'),
  )

  return (
    <>
      <p className="gx-prose">{laneAndOrderOnly ? t('laneAndOrderForm.intro') : t('g7b.Edit.these_are_meanings_not_styling_and_each')}</p>

      {intentProblem !== null ? (
        <p className="gx-prose gx-warn">{t('g7b.Edit.what_is_already_stored_could_not_be')}{intentProblem}</p>
      ) : null}

      {laneAndOrderOnly ? null : (
        <Field
          label={t('g7b.Edit.which_way_this_drawing_runs')}
          hint={t('g7b.Edit.two_not_eight_dependencies_read_naturally_downward')}
        >
          <Select
            value={direction}
            onChange={(next) => void run(setDirection(next), 'intent')}
            options={[
              { value: UNSET as GraphDirection | typeof UNSET, label: t('g7b.Edit.mole_office_decides') },
              ...GRAPH_DIRECTIONS.map((word) => ({ value: word as GraphDirection | typeof UNSET, label: t(`g7b.direction.${word}`) })),
            ]}
          />
        </Field>
      )}

      <Field label={t('g7b.Edit.which_card_you_are_arranging')}>
        <Select value={target} onChange={setTarget} options={targetOptions} />
      </Field>
      <Field
        label={t('g7b.Edit.which_lane_it_belongs_in')}
        hint={t('g7b.Edit.a_name_in_your_own_words_perception')}
      >
        <TextInput value={lane} onChange={setLane} placeholder={t('g7b.Edit.perception')} />
      </Field>
      <Field label={t('g7b.Edit.its_order_within_that_lane')} hint={t('g7b.Edit.a_number_low_first_a_hint_the')}>
        <TextInput value={order} onChange={setOrder} mono placeholder="1" />
      </Field>
      {/* NOT OFFERED WHERE THE DRAWING READS ONLY LANE AND ORDER. What is stored for them is still loaded above and
          sent with a store, so storing a lane does not take away a room or an emphasis stored before. */}
      {laneAndOrderOnly ? null : (
        <>
          <Field label={t('g7b.Edit.how_much_room_it_gets')} hint={t('g7b.Edit.a_rank_not_a_size_in_pixels')}>
            <Select
              value={role}
              onChange={setRole}
              options={[
                { value: UNSET as NodeRole | typeof UNSET, label: t('g7b.Edit.mole_office_decides') },
                ...NODE_ROLES.map((word) => ({ value: word as NodeRole | typeof UNSET, label: t(`g7b.role.${word}`) })),
              ]}
            />
          </Field>
          <Field
            label={t('g7b.Edit.its_emphasis')}
            hint={t('g7b.Edit.a_meaning_never_a_colour_safety_where')}
          >
            <Select
              value={emphasis}
              onChange={setEmphasis}
              options={[
                { value: UNSET as EmphasisRole | typeof UNSET, label: t('g7b.Edit.mole_office_decides_from_its_recorded_state') },
                ...EMPHASIS_ROLES.map((word) => ({ value: word as EmphasisRole | typeof UNSET, label: t(`g7b.emphasis.${word}`) })),
              ]}
            />
          </Field>
          <Field label={t('g7b.Edit.drawn_folded')} hint={t('g7b.Edit.the_count_of_what_is_inside_a')}>
            <Select
              value={collapsed}
              onChange={setCollapsed}
              options={[
                { value: UNSET as '' | 'yes' | 'no', label: t('g7b.Edit.mole_office_decides') },
                { value: 'yes' as '' | 'yes' | 'no', label: t('g7b.Edit.folded') },
                { value: 'no' as '' | 'yes' | 'no', label: t('g7b.Edit.not_folded') },
              ]}
            />
          </Field>
          <Field label={t('g7b.Edit.kept_beside')} hint={t('g7b.Edit.a_request_to_the_layout_not_a')}>
            <Select value={near} onChange={setNear} options={nearOptions} />
          </Field>
        </>
      )}

      <div className="gx-edit-row">
        <Btn
          variant="primary"
          onClick={() => void run(storeNode, 'intent')}
          disabled={busy || nothingSet || target === ''}
          reason={
            busy
              ? BUSY()
              : target === ''
                ? t('g7b.Edit.pick_a_card_first')
                : t('g7b.Edit.nothing_is_set_so_there_is_nothing')
          }
        >{t('g7b.Edit.store_how_this_card_is_shown')}</Btn>
        <UndoPress press={t('g7b.press.forget')} done={t('g7b.press.forgot')} available
          disabledReason={busy ? BUSY() : target === '' ? t('g7b.Edit.pick_a_card_first') : t('g7b.press.nothingArranged')}
          disabled={busy || target === '' || Object.keys(stored).length === 0} onPress={async () => {
            const savedTarget = target
            const before = structuredClone(stored)
            await checked(run(forgetNode, 'intent'))
            return { remainingMs: DRAWING_UNDO_MS, undo: async () => {
              const current = (await presentation.read(scope)).intent.nodes?.[savedTarget]
              if (current !== undefined) throw new Error(t('g7b.undoChanged'))
              await presentation.putNode(scope, savedTarget, before)
              await run(async () => ({ ok: true, request: '', said: t('g7b.press.restored') }), 'intent')
            } }
          }} />
      </div>


    </>
  )
}
