// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A READINESS CHECKLIST: AN OPERATION WHOSE EFFECT REACHES OTHERS RUNS ONLY AFTER THOSE IT AFFECTS HAVE SIGNED. The
 * owner's decisions, 3 October 2026, wave 13u round 13.
 *
 * WHAT THE DECISIONS ASK, AND WHERE EACH PART IS BELOW.
 *   1. Three levels by how far an operation reaches (`theReach` of each gated operation). `itself`: it affects only
 *      whoever asks, and runs with no checklist. `a-group`: the highest responsible party among those affected signs.
 *      `everyone`: every secretary and the person sign.
 *   2. Who must sign is worked out by the office from who is affected (`theSignersFor`), never chosen by whoever raises
 *      the checklist, and it is written down when the checklist is raised.
 *   3. If not everyone has signed in time, nothing runs (`endsAt`, `expireIfItsTimeIsUp`). A signer may withdraw before
 *      it runs. The person may always cancel.
 *   4. The person's own signature goes only through a door only the person may use (`signAsThePerson`). An agent signs
 *      only with its own key (`signAsAnAgent`), and only for itself.
 *
 * THE GATE IS A LOOKUP (`throughTheReadinessGate`). A gated door asks it before it acts. The checklist waiting on the
 * same operation with the same inputs is found by the partial unique index on `on_what`, and its signatures by the
 * unique index on their checklist. Neither table is scanned. When everyone has signed, the office runs the operation
 * itself, once, and the checklist then says what it did or why it could not run.
 *
 * THE GATED OPERATIONS ARE THIS ONE LIST (`GATED_OPERATIONS`). Each names the door's own operation and runs the door's
 * own action (`openTheInstallTerminal`), so the gate and the door cannot disagree about what is done.
 *
 * STOPPING A WORLD IS NOT GATED. Neither decision names it, and the person's own Stop press must never wait on an
 * agent's signature (message t0Iv6NeCMlFC).
 *
 * NOT THE CHECKLISTS OF src/server/api/checklists.ts. Those are somebody's own list of requests. What this file reuses
 * from elsewhere: the one-press request's shape (its own table, a known list of acts, the act run once on the last press,
 * a conditional update so two presses cannot both run it) in src/server/lib/one-press.ts; the person-only check
 * `assertThePersonIsProved`; the secretaries as `theSecretaries` reads them; and each gated door's own action.
 */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import { db, sqlite } from '../db/client.ts'
import { readinessChecklists, readinessSignatures } from '../db/schema.ts'
import { THE_PERSON } from '@shared/person.ts'
import { localStamp } from '@shared/time.ts'
import {
  READINESS_STATES,
  type AReadinessSigner,
  type AReadinessSignerNow,
  type ReadinessLevel,
  type ReadinessState,
} from '@shared/readiness-checklists.ts'
import { anOfficeId } from './ids.ts'
import { theOneAgentAStringNames } from './agent-references.ts'
import { assertThePersonIsProved, type Actor } from './records.ts'
import { now } from '@shared/now.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from './panel-error.ts'
import { theRoleCardsAreRead } from './roles.ts'
import { theSecretaries } from './secretariat.ts'
import { theWorldsOwnAuthority } from './worldauthority.ts'
import { announce } from './events.ts'
import { openTheInstallTerminal, theHarnessesAsked } from './harnesses.ts'
import { gatePosition } from '../../config/settings.mjs'
import { gateMet } from './gate-counts.ts'

// ============================================================================ who is asking

/** Who an actor is, as a signer: the proved person, an agent proved by its own key, or nobody a checklist counts. */
export type ASignerRef = { kind: 'person'; id: string } | { kind: 'agent'; id: string }

/** The agent that holds the key this request was proved with, or null when no agent key proved it. */
function theAgentWhoseKeyThisIs(actor: Actor): { id: string; handle: string } | null {
  if (actor.provedBy !== 'an-agent-key' || actor.keyHolder === undefined) return null
  return theOneAgentAStringNames(sqlite, actor.keyHolder)
}

/** The caller as a checklist counts it, or null. A program that sends the person's name with no proof is not the person. */
export function theCallerAsASigner(actor: Actor): ASignerRef | null {
  if (actor.type === 'human' && thePersonIsProved(actor)) return { kind: 'person', id: THE_PERSON }
  const agent = theAgentWhoseKeyThisIs(actor)
  return agent === null ? null : { kind: 'agent', id: agent.id }
}

// ============================================================================ the gated operations

/** How far one operation on one target reaches, and who it affects, worked out by the office. */
export type AReach =
  | { level: 'itself' }
  | { level: 'a-group'; signers: AReadinessSigner[] }
  | { level: 'everyone' }

/** What running an operation said, and what its door returns. */
export interface WhatItDid {
  said: string
  reply: Record<string, unknown>
}

/** One gated operation: its inputs, the sentence a signer reads, how far it reaches, and what it does. */
interface GatedOperation<I> {
  inputs: z.ZodType<I>
  /** Whether only the person may raise it, because only the person may press its door. */
  onlyThePersonRaises: boolean
  /** Check the inputs against the office as it stands, and put them in one order. Throws in words. */
  checked: (inputs: I) => I
  /** The sentence every signer reads. */
  shows: (inputs: I) => string
  /** How far it reaches when this caller asks for it. */
  reach: (inputs: I, caller: ASignerRef | null) => AReach
  /** Run it, once. `because` is the raiser's own words. Throws in words when it cannot. */
  run: (inputs: I, as: { person: ASignerRef | null; actor: Actor }, workspaceId: string, because: string | null) => Promise<WhatItDid>
}

const harnessInputs = z.strictObject({ harnesses: z.array(z.string()).min(1, 'No agent tool was named.') })

export const GATED_OPERATIONS = {
  /**
   * INSTALLING OR UPGRADING THE AGENT TOOLS. A decision names a uniform harness upgrade among its
   * examples:
   * every agent that runs on the tool is affected, so it reaches everyone, and every secretary and the person sign.
   * The person raises one, or a secretary whose Install press passed the grant check. Each signs as itself, and the
   * person's own signature is still needed (src/server/api/terminal-harnesses.ts).
   */
  'harnesses.install': {
    inputs: harnessInputs,
    onlyThePersonRaises: true,
    checked: (inputs) => ({ harnesses: theHarnessesAsked(inputs.harnesses).map((one) => one.id) }),
    shows: (inputs) => {
      const names = theHarnessesAsked(inputs.harnesses).map((one) => one.name)
      return `Install or upgrade ${inList(names)}, which every agent that runs on ${names.length === 1 ? 'it' : 'them'} uses.`
    },
    reach: () => ({ level: 'everyone' }),
    run: async (inputs, as, workspaceId) => {
      if (as.person === null) throw new PanelError('Installing agent tools runs as the person, and the person neither pressed it nor signed for it. Nothing was installed.', 409)
      const chosen = theHarnessesAsked(inputs.harnesses)
      const reply = await openTheInstallTerminal(chosen, as.person.id, workspaceId)
      return { said: `A terminal opened that installs ${inList(chosen.map((one) => one.name))}.`, reply }
    },
  } satisfies GatedOperation<z.infer<typeof harnessInputs>>,
} as const

export type GatedOperationName = keyof typeof GATED_OPERATIONS

export function isAGatedOperation(name: unknown): name is GatedOperationName {
  return typeof name === 'string' && Object.hasOwn(GATED_OPERATIONS, name)
}

function inList(names: readonly string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`
}

/** One operation's own entry, typed loosely enough to call. */
function theOperation(name: GatedOperationName): GatedOperation<Record<string, unknown>> {
  return GATED_OPERATIONS[name] as unknown as GatedOperation<Record<string, unknown>>
}

// ============================================================================ the signers

/**
 * WHO MUST SIGN, worked out by the office. `everyone`: every secretary on the registry today, then the person, and with
 * no live secretary that is the person alone.
 * `a-group`: whoever the operation's own reach names. The caller's choice is never read.
 */
export function theSignersFor(reach: Exclude<AReach, { level: 'itself' }>): AReadinessSigner[] {
  if (reach.level === 'a-group') return reach.signers
  // NOBODY HAS LOOKED IS NOT NOBODY IS THERE. Before the role cards are read, `theSecretaries` answers nobody, and the
  // checklist would then wait on the person alone and run at the person's press.
  if (!theRoleCardsAreRead()) {
    throw new PanelError('The office has not read its role cards, so it cannot say who the secretaries are, and every one of them must sign this. Nothing ran.', 503)
  }
  return [...theSecretaries().map((one) => ({ kind: 'agent' as const, id: one.id, why: 'a-secretary' as const })), { kind: 'person', id: THE_PERSON, why: 'the-person' }]
}

/** What one operation with its inputs is, as one hash: what a signature is given on. */
export function onWhat(operation: GatedOperationName, inputs: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify([operation, inputs])).digest('hex').slice(0, 32)
}

// ============================================================================ reading

/** One checklist as the doors and the pages read it. */
export interface AReadinessChecklist {
  id: string
  workspaceId: string
  operation: GatedOperationName
  inputs: Record<string, unknown>
  onWhat: string
  shows: string
  level: Exclude<ReadinessLevel, 'itself'>
  signers: AReadinessSignerNow[]
  /** The signers who have not signed, in the order above. Empty once everyone has. */
  notSigned: AReadinessSignerNow[]
  raisedBy: { kind: string; id: string; name: string | null }
  because: string | null
  state: ReadinessState
  raisedAt: string
  endsAt: string
  closedAt: string | null
  closedBy: { kind: string; id: string } | null
  outcome: string | null
}

/** A signer's name: the person is "the person"; an agent is its handle, or its id when the registry has none. */
function nameOf(kind: string, id: string): string | null {
  if (kind === 'person') return 'the person'
  return theOneAgentAStringNames(sqlite, id)?.handle ?? null
}

/** The gate's two reads, named so tests/an-operation-that-reaches-others-waits-for-their-signatures.test.ts plans these. */
export const THE_GATES_LOOKUP = "SELECT id, ends_at FROM readiness_checklists WHERE on_what = ? AND state = 'waiting'"
export const THE_SIGNATURES_LOOKUP = 'SELECT signer_kind, signer_id, signed_at, on_what FROM readiness_signatures WHERE checklist_id = ? AND withdrawn_at IS NULL'

/** The standing signatures of one checklist, by signer, found through the unique index on their checklist. */
function theSignaturesOf(checklistId: string, onWhatNow: string): Map<string, string> {
  const rows = sqlite
    .prepare(THE_SIGNATURES_LOOKUP)
    .all(checklistId) as { signer_kind: string; signer_id: string; signed_at: string; on_what: string }[]
  // A SIGNATURE COUNTS ONLY FOR WHAT IT WAS GIVEN ON. The hash cannot change on a stored checklist, so this guards the
  // shape rather than a path that exists; it is one comparison.
  return new Map(rows.filter((row) => row.on_what === onWhatNow).map((row) => [`${row.signer_kind}:${row.signer_id}`, row.signed_at]))
}

function fromTheRow(row: typeof readinessChecklists.$inferSelect): AReadinessChecklist {
  const stored = JSON.parse(row.signers) as AReadinessSigner[]
  const signed = theSignaturesOf(row.id, row.onWhat)
  const signers = stored.map((one) => ({ ...one, name: nameOf(one.kind, one.id), signedAt: signed.get(`${one.kind}:${one.id}`) ?? null }))
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    operation: row.operation as GatedOperationName,
    inputs: JSON.parse(row.inputs) as Record<string, unknown>,
    onWhat: row.onWhat,
    shows: row.shows,
    level: row.level as Exclude<ReadinessLevel, 'itself'>,
    signers,
    notSigned: signers.filter((one) => one.signedAt === null),
    raisedBy: { kind: row.raisedByKind, id: row.raisedById, name: nameOf(row.raisedByKind, row.raisedById) },
    because: row.because,
    state: row.state as ReadinessState,
    raisedAt: row.raisedAt,
    endsAt: row.endsAt,
    closedAt: row.closedAt,
    closedBy: row.closedByKind === null || row.closedById === null ? null : { kind: row.closedByKind, id: row.closedById },
    outcome: row.outcome,
  }
}

/** One checklist, or a 404 in words. A waiting one whose time is up is closed first. */
export function theReadinessChecklist(id: string): AReadinessChecklist {
  expireIfItsTimeIsUp(id)
  const row = db.select().from(readinessChecklists).where(eq(readinessChecklists.id, id)).get()
  if (row === undefined) throw new PanelError(`There is no readiness checklist with the id ${id}. Nothing was written.`, 404)
  return fromTheRow(row)
}

/** The newest checklists, `limit` of them, of one state or of all. */
export function theNewestChecklists(limit: number, state: ReadinessState | null): AReadinessChecklist[] {
  expireEveryOneWhoseTimeIsUp()
  const query = db.select().from(readinessChecklists)
  const rows = (state === null ? query : query.where(eq(readinessChecklists.state, state))).orderBy(desc(readinessChecklists.raisedAt), desc(readinessChecklists.id)).limit(limit).all()
  return rows.map(fromTheRow)
}

/**
 * EVERY WAITING CHECKLIST THAT WAITS FOR ONE SIGNER, oldest first. It reads the waiting ones through the state index,
 * so its cost is the number of checklists waiting, never the number ever raised.
 */
export function theChecklistsWaitingFor(signer: ASignerRef): AReadinessChecklist[] {
  expireEveryOneWhoseTimeIsUp()
  return db
    .select()
    .from(readinessChecklists)
    .where(eq(readinessChecklists.state, 'waiting'))
    .orderBy(readinessChecklists.raisedAt, readinessChecklists.id)
    .all()
    .map(fromTheRow)
    .filter((one) => one.notSigned.some((who) => who.kind === signer.kind && who.id === signer.id))
}

// ============================================================================ time running out

/** The sentence a checklist closes with when its time ran out. */
function itsTimeRanOut(checklist: AReadinessChecklist): string {
  const names = checklist.notSigned.map((one) => one.name ?? one.id)
  return `Its time ran out at ${checklist.endsAt} before everyone signed, so nothing ran. Not signed: ${inList(names)}.`
}

/** Close one waiting checklist whose time is up. Returns whether it did. */
function expireIfItsTimeIsUp(id: string): boolean {
  const row = db.select().from(readinessChecklists).where(eq(readinessChecklists.id, id)).get()
  if (row === undefined || row.state !== 'waiting' || row.endsAt > now()) return false
  return closeAWaitingOne(id, 'expired', itsTimeRanOut(fromTheRow(row)), null)
}

function expireEveryOneWhoseTimeIsUp(): void {
  const due = sqlite.prepare("SELECT id FROM readiness_checklists WHERE state = 'waiting' AND ends_at <= ?").all(now()) as { id: string }[]
  for (const one of due) expireIfItsTimeIsUp(one.id)
}

/** Close a checklist that still waits, so two presses cannot both close it. Returns whether this one did. */
function closeAWaitingOne(id: string, state: Exclude<ReadinessState, 'waiting' | 'ran' | 'could-not'> | 'running', outcome: string | null, by: ASignerRef | null): boolean {
  const written = db
    .update(readinessChecklists)
    .set({ state, outcome, closedAt: state === 'running' ? null : now(), closedByKind: by?.kind ?? null, closedById: by?.id ?? null })
    .where(and(eq(readinessChecklists.id, id), eq(readinessChecklists.state, 'waiting')))
    .run()
  if (written.changes === 1) tellThePages()
  return written.changes === 1
}

/** Tell every open page that what waits for a signature changed. */
function tellThePages(): void {
  announce({ name: 'list.changed', workspaceId: null, lists: ['needsYou'], about: null, groupId: null, because: 'A readiness checklist was raised, signed or closed.' })
}

// ============================================================================ raising, signing, running

/** The longest and shortest time a checklist may wait, in minutes, and the time it waits when nobody says. */
export const READINESS_MINUTES = { least: 5, most: 7 * 24 * 60, unsaid: 60 } as const

/** What the gate answers: the operation ran, or it waits on a checklist. */
export type ThroughTheGate = { ran: true; did: WhatItDid; checklist: AReadinessChecklist | null } | { ran: false; checklist: AReadinessChecklist }

/**
 * RAISE A CHECKLIST, or find the one already waiting on the same operation with the same inputs, and sign it for the
 * caller where the caller is one of its signers. When that makes everyone, the office runs it now. `itself` runs at once
 * and writes no checklist.
 */
export async function raiseOrSign(input: {
  operation: unknown
  inputs: unknown
  because: string | null
  minutes: number | null
  actor: Actor
  workspaceId: string
  /** Run it at once with no checklist, because the gate held-for-readiness-signatures is off. Only a door asks this. */
  withoutTheSignatures?: true
}): Promise<ThroughTheGate> {
  if (!isAGatedOperation(input.operation)) {
    throw new PanelError(
      `"${String(input.operation)}" is not one of the operations that wait for signatures. They are ${Object.keys(GATED_OPERATIONS).map((one) => `"${one}"`).join(' and ')}. Nothing was raised.`,
      400,
    )
  }
  const operation = theOperation(input.operation)
  const parsed = operation.inputs.safeParse(input.inputs ?? {})
  if (!parsed.success) {
    throw new PanelError(`The inputs of "${input.operation}" are not right: ${parsed.error.issues.map((one) => `${one.path.join('.') || 'inputs'}: ${one.message}`).join('; ')}. Nothing was raised.`, 400)
  }
  const inputs = operation.checked(parsed.data)
  const caller = theCallerAsASigner(input.actor)
  const because = input.because === null || input.because.trim() === '' ? null : input.because.trim()
  const reach = operation.reach(inputs, caller)
  if (reach.level === 'itself') {
    return { ran: true, did: await operation.run(inputs, { person: caller?.kind === 'person' ? caller : null, actor: input.actor }, input.workspaceId, because), checklist: null }
  }
  if (caller === null) {
    throw new PanelError(
      'A readiness checklist is raised by the person or by an agent proved by its own key, and this request carried neither. Nothing was raised.',
      403,
    )
  }
  const raisedUnderTheGrant = input.actor.press?.operation === input.operation && input.actor.press?.underTheGrant !== undefined
  if (operation.onlyThePersonRaises && caller.kind !== 'person' && !raisedUnderTheGrant) {
    throw new PanelError(`Only the person or a secretary whose press the grant carries may raise the checklist for "${input.operation}". Nothing was raised.`, 403)
  }
  // AT OFF, A DOOR'S PRESS RUNS AT ONCE (wave 13r round U). Who may press is asked above as at block. No checklist is
  // raised, nobody signs, and one already waiting on the same operation is left waiting. It runs as the person only when
  // the person pressed, so an operation that runs only as the person refuses in its own words when anybody else did. In a
  // test world the person's press is refused as it is at block.
  if (input.withoutTheSignatures === true) {
    if (caller.kind === 'person') refuseThePersonsSignatureInATestWorld()
    gateMet('held-for-readiness-signatures', 'off')
    const did = await operation.run(inputs, { person: caller.kind === 'person' ? caller : null, actor: input.actor }, input.workspaceId, because)
    const said = 'This ran at once, with no readiness checklist and no signature, because the hold on readiness signatures is off.'
    return { ran: true, did: { said: `${did.said} ${said}`, reply: { ...did.reply, withoutTheSignatures: said } }, checklist: null }
  }
  const hash = onWhat(input.operation, inputs)
  // THE GATE'S LOOKUP: the one checklist waiting on this operation with these inputs, through the partial unique index.
  let id = theWaitingOneOn(hash)
  if (id === null) {
    const signers = theSignersFor(reach)
    if (caller.kind === 'person' && signers.some((one) => one.kind === 'person')) refuseThePersonsSignatureInATestWorld()
    const minutes = input.minutes ?? READINESS_MINUTES.unsaid
    if (!Number.isInteger(minutes) || minutes < READINESS_MINUTES.least || minutes > READINESS_MINUTES.most) {
      throw new PanelError(`A checklist waits between ${String(READINESS_MINUTES.least)} minutes and ${String(READINESS_MINUTES.most)} minutes; ${String(minutes)} is not that. Nothing was raised.`, 400)
    }
    id = anOfficeId()
    db.insert(readinessChecklists)
      .values({
        id,
        workspaceId: input.workspaceId,
        operation: input.operation,
        inputs: JSON.stringify(inputs),
        onWhat: hash,
        shows: operation.shows(inputs),
        level: reach.level,
        signers: JSON.stringify(signers),
        raisedByKind: caller.kind,
        raisedById: caller.id,
        because,
        state: 'waiting',
        raisedAt: now(),
        endsAt: localStamp(new Date(Date.now() + minutes * 60_000)),
      })
      .run()
    tellThePages()
  }
  return signAndRunWhenComplete(id, caller, input.actor, { mustBeASigner: false })
}

/** The id of the checklist waiting on one hash, or null. One indexed lookup. */
export function theWaitingOneOn(hash: string): string | null {
  const row = sqlite.prepare(THE_GATES_LOOKUP).get(hash) as { id: string; ends_at: string } | undefined
  if (row === undefined) return null
  if (row.ends_at <= now()) {
    expireIfItsTimeIsUp(row.id)
    return null
  }
  return row.id
}

/**
 * IN A TEST WORLD THE PERSON'S SIGNATURE IS NEVER WRITTEN, as a one-press request is never agreed to there
 * (src/server/lib/one-press.ts): whoever sends the person's name to a test world is whoever started it.
 */
function refuseThePersonsSignatureInATestWorld(): void {
  if (theWorldsOwnAuthority().inATestWorld) {
    throw new PanelError("This Mole Office is a test world, and the person's signature on a readiness checklist is given only on the office itself. Nothing was signed.", 409)
  }
}

/** A checklist that still waits, or a 409 saying what it is now. */
function stillWaiting(id: string): AReadinessChecklist {
  const checklist = theReadinessChecklist(id)
  if (checklist.state !== 'waiting') {
    throw new PanelError(`The readiness checklist ${id} is ${STATE_IN_WORDS[checklist.state]}${checklist.closedAt === null ? '' : ` since ${checklist.closedAt}`}. Nothing was written.`, 409)
  }
  return checklist
}

const STATE_IN_WORDS: Readonly<Record<ReadinessState, string>> = {
  waiting: 'waiting for signatures',
  running: 'running now',
  ran: 'done: its operation ran',
  'could-not': 'closed: everyone signed and its operation could not run',
  cancelled: 'cancelled',
  expired: 'closed: its time ran out',
}

/** Sign for this signer, if it is one, then run the operation when that made everyone. */
async function signAndRunWhenComplete(id: string, signer: ASignerRef, actor: Actor, opts: { mustBeASigner: boolean }): Promise<ThroughTheGate> {
  const checklist = stillWaiting(id)
  const isASigner = checklist.signers.some((one) => one.kind === signer.kind && one.id === signer.id)
  if (!isASigner && opts.mustBeASigner) {
    const who = signer.kind === 'person' ? 'The person is' : `${nameOf('agent', signer.id) ?? signer.id} is`
    throw new PanelError(`${who} not one of the signers of the readiness checklist ${id}. Its signers are ${inList(checklist.signers.map((one) => one.name ?? one.id))}. Nothing was signed.`, 403)
  }
  if (isASigner && signer.kind === 'person') refuseThePersonsSignatureInATestWorld()
  if (isASigner) {
    sqlite
      .prepare(
        `INSERT INTO readiness_signatures (id, checklist_id, signer_kind, signer_id, on_what, signed_at, withdrawn_at) VALUES (?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT (checklist_id, signer_kind, signer_id) DO UPDATE SET on_what = excluded.on_what, signed_at = excluded.signed_at, withdrawn_at = NULL`,
      )
      .run(anOfficeId(), id, signer.kind, signer.id, checklist.onWhat, now())
    tellThePages()
  }
  const after = theReadinessChecklist(id)
  if (after.notSigned.length > 0) return { ran: false, checklist: after }
  return { ran: true, did: await runIt(after, actor), checklist: theReadinessChecklist(id) }
}

/**
 * EVERYONE HAS SIGNED: THE OFFICE RUNS THE OPERATION ONCE. The checklist is moved from waiting to running by a
 * conditional update first, so two last signatures arriving together cannot both run it.
 */
async function runIt(checklist: AReadinessChecklist, actor: Actor): Promise<WhatItDid> {
  if (!closeAWaitingOne(checklist.id, 'running', null, null)) {
    throw new PanelError(`The readiness checklist ${checklist.id} was run or closed by somebody else first. Nothing more was done.`, 409)
  }
  const person = checklist.signers.some((one) => one.kind === 'person') ? ({ kind: 'person', id: THE_PERSON } as const) : null
  try {
    const did = await theOperation(checklist.operation).run(checklist.inputs, { person, actor }, checklist.workspaceId, checklist.because)
    finish(checklist.id, 'ran', did.said)
    return did
  } catch (err) {
    finish(checklist.id, 'could-not', `Everyone signed, and it could not run: ${err instanceof Error ? err.message : String(err)}`)
    throw err
  }
}

function finish(id: string, state: 'ran' | 'could-not', outcome: string): void {
  db.update(readinessChecklists).set({ state, outcome, closedAt: now() }).where(and(eq(readinessChecklists.id, id), eq(readinessChecklists.state, 'running'))).run()
  tellThePages()
}

/** AN AGENT SIGNS, for itself, proved by its own key. */
export async function signAsAnAgent(id: string, actor: Actor): Promise<ThroughTheGate> {
  const agent = theAgentWhoseKeyThisIs(actor)
  if (agent === null) {
    throw new PanelError('An agent signs a readiness checklist with its own key, and this request carried no agent key. The person signs at the person\'s own door. Nothing was signed.', 403)
  }
  return signAndRunWhenComplete(id, { kind: 'agent', id: agent.id }, actor, { mustBeASigner: true })
}

/** THE PERSON SIGNS, through the door only the person may use. A raise or a grant does not carry it. */
export async function signAsThePerson(id: string, actor: Actor): Promise<ThroughTheGate> {
  assertThePersonIsProved(actor, 'Signing a readiness checklist as the person', 'The person presses Sign on the checklist, in Mole Office.')
  return signAndRunWhenComplete(id, { kind: 'person', id: THE_PERSON }, actor, { mustBeASigner: true })
}

/** A SIGNER TAKES ITS SIGNATURE BACK while the checklist waits. */
export function withdrawASignature(id: string, actor: Actor): AReadinessChecklist {
  const signer = theCallerAsASigner(actor)
  if (signer === null) throw new PanelError('Only a signer takes back its own signature: the person, or an agent sending its own key. Nothing was written.', 403)
  stillWaiting(id)
  const written = sqlite
    .prepare('UPDATE readiness_signatures SET withdrawn_at = ? WHERE checklist_id = ? AND signer_kind = ? AND signer_id = ? AND withdrawn_at IS NULL')
    .run(now(), id, signer.kind, signer.id)
  if (written.changes !== 1) throw new PanelError(`There is no signature of yours on the readiness checklist ${id} to take back. Nothing was written.`, 409)
  tellThePages()
  return theReadinessChecklist(id)
}

/** THE PERSON CANCELS, ALWAYS; ITS RAISER MAY TOO. Nothing runs. */
export function cancelAChecklist(id: string, actor: Actor): AReadinessChecklist {
  const checklist = stillWaiting(id)
  const caller = theCallerAsASigner(actor)
  const isTheRaiser = caller !== null && caller.kind === checklist.raisedBy.kind && caller.id === checklist.raisedBy.id
  if (caller?.kind !== 'person' && !isTheRaiser) {
    throw new PanelError(`Only the person, or whoever raised it, may cancel the readiness checklist ${id}. Nothing was written.`, 403)
  }
  const by = caller as ASignerRef
  if (!closeAWaitingOne(id, 'cancelled', `${by.kind === 'person' ? 'The person' : (nameOf('agent', by.id) ?? by.id)} cancelled it. Nothing ran.`, by)) {
    throw new PanelError(`The readiness checklist ${id} was closed by somebody else first. Nothing more was written.`, 409)
  }
  return theReadinessChecklist(id)
}

// ============================================================================ the gate a door asks

/**
 * THE GATE A GATED DOOR ASKS BEFORE IT ACTS. It raises or signs as `raiseOrSign` does. When the operation ran, the door
 * returns what it did. When it still waits, the door is refused in words that name who has not signed, and the gate
 * held-for-readiness-signatures counts the hold. While that gate is off, the operation runs at once, and the reply says
 * it ran without a checklist or any signature (wave 13r round U).
 */
export async function throughTheReadinessGate(input: { operation: GatedOperationName; inputs: Record<string, unknown>; because: string | null; actor: Actor; workspaceId: string }): Promise<Record<string, unknown>> {
  const off = gatePosition('held-for-readiness-signatures') !== 'block'
  const gate = await raiseOrSign({ ...input, minutes: null, ...(off ? { withoutTheSignatures: true as const } : {}) })
  if (gate.ran) return gate.checklist === null ? gate.did.reply : { ...gate.did.reply, readinessChecklist: gate.checklist }
  gateMet('held-for-readiness-signatures', 'block')
  throw new PanelError(theRefusal(gate.checklist), 409, undefined, undefined, undefined, { code: 'readinessWaits', values: { checklist: gate.checklist.id } })
}

/** The refusal of a door whose checklist still waits, in words. */
export function theRefusal(checklist: AReadinessChecklist): string {
  const names = checklist.notSigned.map((one) => one.name ?? one.id)
  return (
    `This waits for signatures before it runs, because it affects ${checklist.level === 'everyone' ? 'every agent' : 'others'}. ` +
    `Not signed yet: ${inList(names)}. It runs by itself when everyone has signed, and nothing runs if they have not by ${checklist.endsAt}. ` +
    `The readiness checklist is ${checklist.id}.`
  )
}

export { READINESS_STATES }
