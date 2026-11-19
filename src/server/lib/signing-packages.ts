// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SECRETARY BRINGS MANY OF THE PERSON'S OWN ACTS FOR ONE SIGNATURE.
 * Two decisions set this up in line round 54, piece 1. KNOWN_ACTS in
 * one-press.ts remains the one list: its checks, sentences and runs are reused here. A signature
 * claims the waiting package before any act runs, in one outer transaction. Every act runs in its own
 * nested transaction, a savepoint, so a failure takes back only its own writes. A signature may hold
 * an item for the named agent, through its one carry-out door for at most 24 hours. This opens no
 * other door and is no raise. Each change tells pages that Needs you changed.
 *
 * A secretary holding the person's grant signs, refuses or takes back a hold for them only where this office's list of
 * what the grant carries says so (`aRaiseCarriesIt` in records/own-words.ts). A signature then asks the door of every
 * item it runs, is never pressed on a package the same secretary brought, and holds no item for the named agent: that
 * item would be carried out on the person's signature. Each answer is written as the secretary's, never as the
 * person's.
 */
import { announce } from './events.ts'
import { sayInEnglish as t } from '@shared/i18n.ts'
import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import { db, sqlite } from '../db/client.ts'
import { signingPackages, signingPackageItems } from '../db/schema.ts'
import { WHAT_IS_KEPT_LABELS, type KeptSettingKey } from '@shared/what-is-kept.ts'
import { THE_PERSON } from '@shared/person.ts'
import { anOfficeId } from './ids.ts'
import { theOneAgentAStringNames } from './agent-references.ts'
import { KNOWN_ACTS, isAKnownAct, theCallerByItsRegistryId, type KnownActName } from './one-press.ts'
import { theCanonicalAgentId } from './registry-aliases/worker-runs.ts'
import {
  aRaiseCarriesIt,
  assertThePersonIsProved,
  theSecretaryOfThisOffice,
  writeDownAnActUnderTheRaise,
  type Actor,
  type WhatThePressTouches,
} from './records.ts'
import { now } from '@shared/now.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from './panel-error.ts'
import { theWorldsOwnAuthority } from './worldauthority.ts'
import { localStamp, parseLocalStamp } from '@shared/time.ts'
import { aRaisesEndHasCome } from '@shared/roles.ts'
import { theRunAWriteCameFrom } from '../db/the-run-a-write-came-from.ts'

export const SIGNING_PACKAGE_STATES = ['waiting', 'signed', 'refused', 'withdrawn'] as const
export const SIGNING_PACKAGE_ITEM_STATES = ['waiting', 'struck', 'done', 'could-not', 'not-run', 'held', 'not-used'] as const
export type SigningPackageState = (typeof SIGNING_PACKAGE_STATES)[number]
export type SigningPackageItemState = (typeof SIGNING_PACKAGE_ITEM_STATES)[number]
type CarriedOut = 'at-the-signature' | 'by-the-named-agent'
type HoldEndedHow = 'all-carried-out' | 'taken-back' | 'given-back' | 'the-time-ran-out'
type Hold = { endsAt: string; open: boolean; endedAt: string | null; endedHow: HoldEndedHow | null }

/** Exhaustive over the one list of acts: a new act requires both sentences before this compiles. */
export const WHAT_EACH_ACT_CHANGES_AND_HOW_IT_IS_UNDONE = {
  'change-a-setting': {
    changes: (inputs) => `The office sets "${WHAT_IS_KEPT_LABELS[inputs['setting'] as KeptSettingKey]}" to ${String(inputs['value'])}.`,
    undone: (inputs) => `The person sets "${WHAT_IS_KEPT_LABELS[inputs['setting'] as KeptSettingKey]}" back in What the office keeps on the Settings page and presses Keep.`,
  },
  'answer-an-ask-at-the-door': {
    changes: (inputs) => inputs['answer'] === 'grant'
      ? 'The office grants the requested card or admits the waiting registration and records the answer.'
      : 'The office refuses the ask at the door and records the answer.',
    undone: (inputs) => inputs['answer'] === 'grant'
      ? 'The office has no door that reopens an answered ask. To take back a card, the person chooses another card with "Give it a card" on the agent’s own page, opened from the Embassy. That press works only on the computer the office runs on. To take back an admitted agent, the person presses "Retire this agent" on the agent’s own page.'
      : 'The office has no door that reopens a refused ask at the door.',
  },
  'mark-a-rule-only-for-this-office': {
    changes: (inputs) => inputs['only'] === true
      ? 'The office marks the rule as only for this office, leaving it out of the default regulations copied to new offices.'
      : 'The office removes the rule’s only-for-this-office mark, including the rule in the default regulations copied to new offices.',
    undone: (inputs) => inputs['only'] === true
      ? 'The person presses "Give to new offices too" beside the rule on the Office regulations page.'
      : 'The person presses "Keep for this office only" beside the rule on the Office regulations page.',
  },
  // NOT IN A PACKAGE: only the person's own press agrees to it, and a package is carried out by an agent or signed
  // through a door the person's grant may carry. It is asked as a request for one press.
  'change-what-the-grant-carries': null,
} satisfies Record<KnownActName, { changes: (inputs: Record<string, unknown>) => string; undone: (inputs: Record<string, unknown>) => string } | null>

interface ExecutableAct {
  inputs: z.ZodType<Record<string, unknown>>
  shows: (inputs: Record<string, unknown>) => string
  showsAtEachRead?: (inputs: Record<string, unknown>) => string
  run: (inputs: Record<string, unknown>, person: Actor, workspaceId: string) => string
  door: string
}

export interface ASigningPackageItem {
  id: string
  position: number
  act: KnownActName
  inputs: Record<string, unknown>
  why: string
  shows: string
  changes: string
  undone: string
  state: SigningPackageItemState
  outcome: string | null
  doneAt: string | null
  carriedOut: CarriedOut
  carriedOutBy: { id: string; handle: string | null } | null
  carriedOutIn: string | null
}
export interface ASigningPackage {
  id: string
  workspaceId: string
  task: string
  forAgent: { id: string; handle: string | null }
  broughtBy: { id: string; handle: string | null }
  broughtAt: string
  state: SigningPackageState
  answeredAt: string | null
  answeredBy: { kind: string; id: string; handle: string | null } | null
  outcome: string | null
  hold: Hold | null
  items: ASigningPackageItem[]
}

function tellThePages(): void {
  announce({ name: 'list.changed', workspaceId: null, lists: ['needsYou'], about: null, groupId: null, because: t('signingPackages.listChanged') })
}

/** One answer at every read and press. Expiry is read from the clock and never rewrites a row. */
function theHoldOn(row: typeof signingPackages.$inferSelect, clock: string): Hold | null {
  if (row.holdEndsAt === null) return null
  if (row.holdEndedAt !== null) return { endsAt: row.holdEndsAt, open: false, endedAt: row.holdEndedAt, endedHow: row.holdEndedHow as HoldEndedHow }
  if (aRaisesEndHasCome(row.holdEndsAt, clock)) return { endsAt: row.holdEndsAt, open: false, endedAt: row.holdEndsAt, endedHow: 'the-time-ran-out' }
  return { endsAt: row.holdEndsAt, open: true, endedAt: null, endedHow: null }
}

function theHoldEndedInWords(hold: Hold): string {
  const why = hold.endedHow === 'the-time-ran-out' ? '24 hours had passed since the signature'
    : hold.endedHow === 'taken-back' ? 'the remaining hold was taken back, and the items it held say who took it back'
      : hold.endedHow === 'given-back' ? 'the named agent gave back the remaining hold'
        : 'every held item had been carried out or could not run'
  return `The hold ended at ${hold.endedAt} because ${why}.`
}

function fromTheRow(row: typeof signingPackages.$inferSelect): ASigningPackage {
  const hold = theHoldOn(row, now())
  const items = db.select().from(signingPackageItems).where(eq(signingPackageItems.packageId, row.id)).orderBy(signingPackageItems.position).all().map((item): ASigningPackageItem => {
    const act = item.act as KnownActName
    const inputs = JSON.parse(item.inputs) as Record<string, unknown>
    const known: ExecutableAct = KNOWN_ACTS[act]
    return { id: item.id, position: item.position, act, inputs, why: item.why,
      shows: item.state === 'waiting' ? known.showsAtEachRead?.(inputs) ?? item.shows : item.shows,
      changes: item.changes, undone: item.undone, state: item.state === 'held' && hold?.open === false ? 'not-used' : item.state as SigningPackageItemState,
      outcome: item.state === 'held' && hold?.open === false ? `${theHoldEndedInWords(hold)} The named agent did not carry this item out.` : item.outcome, doneAt: item.doneAt,
      carriedOut: item.carriedOut as CarriedOut,
      carriedOutBy: item.carriedOutBy === null ? null : { id: item.carriedOutBy, handle: theOneAgentAStringNames(sqlite, item.carriedOutBy)?.handle ?? null },
      carriedOutIn: item.carriedOutIn }
  })
  return {
    id: row.id, workspaceId: row.workspaceId, task: row.task,
    forAgent: { id: row.forAgent, handle: theOneAgentAStringNames(sqlite, row.forAgent)?.handle ?? null },
    broughtBy: { id: row.broughtBy, handle: theOneAgentAStringNames(sqlite, row.broughtBy)?.handle ?? null },
    broughtAt: row.broughtAt, state: row.state as SigningPackageState, answeredAt: row.answeredAt,
    answeredBy: row.answeredByKind === null || row.answeredById === null ? null : {
      kind: row.answeredByKind, id: row.answeredById,
      handle: row.answeredByKind === 'agent' ? theOneAgentAStringNames(sqlite, row.answeredById)?.handle ?? null : null,
    },
    outcome: row.outcome, hold, items,
  }
}

/** A receipt by its own id, from whichever project the reader stands in. */
export function theSigningPackage(id: string): ASigningPackage {
  return fromTheRow(thePackageRow(id))
}
export function theNewestPackages(limit: number, state: SigningPackageState | null): ASigningPackage[] {
  const query = db.select().from(signingPackages)
  return (state === null ? query : query.where(eq(signingPackages.state, state))).orderBy(desc(signingPackages.broughtAt), desc(signingPackages.id)).limit(limit).all().map(fromTheRow)
}

/** As in one-press: the key proves the agent, never a name in a body or a header alone. */
function theAgentWhoseKeyThisIs(actor: Actor): { id: string; handle: string } | null {
  if (actor.provedBy !== 'an-agent-key' || actor.keyHolder === undefined) return null
  const agent = theOneAgentAStringNames(sqlite, actor.keyHolder)
  return agent === null || agent.retired ? null : agent
}
const bringBody = z.strictObject({ forAgent: z.string().trim().min(1), task: z.string().trim().min(1).max(500), items: z.array(z.unknown()).min(1).max(25) })
const itemBody = z.strictObject({ act: z.string(), inputs: z.unknown(), why: z.string().trim().min(1).max(2000), carriedOut: z.enum(['at-the-signature', 'by-the-named-agent']).default('at-the-signature') })

/** All items are checked before any row is written; a refusal names the item's one-based position. */
export function bringAPackage(input: { body: unknown; actor: Actor; workspaceId: string }): ASigningPackage {
  const secretary = theAgentWhoseKeyThisIs(input.actor)
  if (secretary === null || !theSecretaryOfThisOffice(input.actor)) {
    throw new PanelError('Only a secretary proved by its own agent key brings a signing package. This request did not prove a secretary. Nothing was filed.', 403)
  }
  const parsed = bringBody.safeParse(input.body)
  if (!parsed.success) throw new PanelError(`The package is not right: ${parsed.error.issues.map(one => `${one.path.join('.') || 'package'}: ${one.message}`).join('; ')}. Nothing was filed.`, 400)
  const body = parsed.data
  const forAgent = theOneAgentAStringNames(sqlite, body.forAgent)
  if (forAgent === null || forAgent.retired) throw new PanelError(`"${body.forAgent}" does not name a live agent. Nothing was filed.`, 409)
  const seen = new Set<string>()
  const checked = body.items.map((raw, index) => {
    const position = index + 1
    try {
      const item = itemBody.safeParse(raw)
      if (!item.success) throw new PanelError(`The item is not right: ${item.error.issues.map(one => `${one.path.join('.') || 'item'}: ${one.message}`).join('; ')}.`, 400)
      if (!isAKnownAct(item.data.act)) throw new PanelError(`"${item.data.act}" is not one of the acts the office knows; a package may ask only for ${Object.keys(KNOWN_ACTS).map(name => `"${name}"`).join(' or ')}.`, 400)
      const sentences = WHAT_EACH_ACT_CHANGES_AND_HOW_IT_IS_UNDONE[item.data.act]
      if (sentences === null) throw new PanelError(`"${item.data.act}" is not an act a package may carry: only the person's own press agrees to it. Ask for it with a request for one press.`, 409)
      const act: ExecutableAct = KNOWN_ACTS[item.data.act]
      const inputs = act.inputs.safeParse(item.data.inputs)
      if (!inputs.success) throw new PanelError(`The inputs are not right: ${inputs.error.issues.map(one => `${one.path.join('.') || 'inputs'}: ${one.message}`).join('; ')}.`, 400)
      const shows = act.shows(inputs.data)
      // The act's schema puts the flat, fixed inputs in one order, independent of the body's key order.
      const duplicate = JSON.stringify([item.data.act, inputs.data])
      if (seen.has(duplicate)) throw new PanelError('The same act with the same inputs occurs twice.', 400)
      seen.add(duplicate)
      return { id: anOfficeId(), position, act: item.data.act, inputs: JSON.stringify(inputs.data), why: item.data.why,
        shows, changes: sentences.changes(inputs.data), undone: sentences.undone(inputs.data), state: 'waiting', carriedOut: item.data.carriedOut }
    } catch (err) {
      throw new PanelError(`Package item ${position}: ${err instanceof Error ? err.message : String(err)} Nothing was filed.`, err instanceof PanelError ? err.status : 400)
    }
  })
  const id = anOfficeId()
  sqlite.transaction(() => {
    db.insert(signingPackages).values({ id, workspaceId: input.workspaceId, broughtBy: secretary.id, forAgent: forAgent.id, task: body.task, state: 'waiting', broughtAt: now() }).run()
    db.insert(signingPackageItems).values(checked.map(item => ({ ...item, packageId: id }))).run()
  })()
  tellThePages()
  return theSigningPackage(id)
}

function stillWaiting(id: string): ASigningPackage {
  const held = theSigningPackage(id)
  if (held.state !== 'waiting') throw new PanelError(`The package ${id} has already been answered, so it cannot be answered again. Nothing was written.`, 409)
  return held
}
function refuseInATestWorld(): void {
  if (theWorldsOwnAuthority().inATestWorld) throw new PanelError('This Mole Office is a test world, and a signing package is answered only on the office itself. Nothing was written.', 409)
}
/** A conditional claim inside the outer transaction prevents a second signature from running any act. */
function answerTheWaitingPackage(id: string, state: Exclude<SigningPackageState, 'waiting'>, kind: 'person' | 'agent', by: string, outcome: string | null, answeredAt = now(), holdEndsAt: string | null = null): void {
  const written = db.update(signingPackages).set({ state, answeredAt, answeredByKind: kind, answeredById: by, outcome, holdEndsAt }).where(and(eq(signingPackages.id, id), eq(signingPackages.state, 'waiting'))).run()
  if (written.changes !== 1) throw new PanelError(`The package ${id} has already been answered, so it cannot be answered again. Nothing was written.`, 409)
}

/**
 * What a signature under the person's grant touches: the door of each item it would run, and who brought the package.
 * Read without refusing a missing package, so a caller with no grant still hears that the signature is the person's.
 */
function whatASignatureTouches(id: string, struck: string[], actor: Actor): WhatThePressTouches {
  const row = db.select().from(signingPackages).where(eq(signingPackages.id, id)).get()
  if (row === undefined) return {}
  const items = db.select({ id: signingPackageItems.id, act: signingPackageItems.act }).from(signingPackageItems).where(eq(signingPackageItems.packageId, id)).all()
  const doors = items.filter(item => !struck.includes(item.id)).map(item => (KNOWN_ACTS[item.act as KnownActName] as ExecutableAct).door)
  return { also: doors, filedBy: row.broughtBy }
}

/** Who answered: the person, or the secretary the person's grant carried here, by its registry id. */
function whoAnswered(byThePerson: boolean, actor: Actor): { kind: 'person' | 'agent'; id: string } {
  return byThePerson ? { kind: 'person', id: THE_PERSON } : { kind: 'agent', id: theCallerByItsRegistryId(actor) }
}

export function signAPackage(id: string, struck: string[], actor: Actor): ASigningPackage {
  const byThePerson = thePersonIsProved(actor)
  if (!byThePerson && !aRaiseCarriesIt(actor, whatASignatureTouches(id, struck, actor))) assertThePersonIsProved(actor, 'Signing a package')
  refuseInATestWorld()
  const who = whoAnswered(byThePerson, actor)
  const workspaceId = sqlite.transaction(() => {
    const held = stillWaiting(id)
    const strike = new Set(struck)
    for (const itemId of strike) {
      if (!held.items.some(item => item.id === itemId)) throw new PanelError(`Item ${itemId} is not in this package. Nothing was written.`, 400)
    }
    if (strike.size === held.items.length) throw new PanelError('Every item is struck; refuse the package instead. Nothing was written.', 400)
    const signedAt = now()
    const holdsAnItem = held.items.some(item => !strike.has(item.id) && item.carriedOut === 'by-the-named-agent')
    // A HELD ITEM IS CARRIED OUT ON THE PERSON'S SIGNATURE (`signedItem` in carryOutAHeldItem), so the grant never signs one.
    if (holdsAnItem && !byThePerson) {
      throw new PanelError(
        `An item in the package ${id} waits for its named agent to carry it out, and that agent would act on the person's own signature, which the grant does not give. Nothing was written, and the package still waits. Strike the item, or ask the person to sign.`,
        403,
      )
    }
    const holdEndsAt = holdsAnItem ? localStamp(new Date(parseLocalStamp(signedAt)! + 24 * 60 * 60 * 1000)) : null
    answerTheWaitingPackage(id, 'signed', who.kind, who.id, null, signedAt, holdEndsAt)
    const struckWords = byThePerson ? 'The person struck this item before signing.' : `The secretary "${actor.id}" struck this item before signing for the person, under their grant.`
    for (const item of held.items) {
      if (strike.has(item.id)) {
        db.update(signingPackageItems).set({ state: 'struck', outcome: struckWords }).where(eq(signingPackageItems.id, item.id)).run()
      }
    }
    for (const item of held.items) {
      if (strike.has(item.id)) continue
      if (item.carriedOut === 'by-the-named-agent') {
        db.update(signingPackageItems).set({ state: 'held', outcome: null, doneAt: null }).where(eq(signingPackageItems.id, item.id)).run()
        continue
      }
      try {
        sqlite.transaction(() => {
          const act: ExecutableAct = KNOWN_ACTS[item.act]
          const shows = act.showsAtEachRead?.(item.inputs) ?? item.shows
          const outcome = act.run(item.inputs, actor, held.workspaceId)
          db.update(signingPackageItems).set({ state: 'done', shows, outcome, doneAt: now() }).where(eq(signingPackageItems.id, item.id)).run()
        })()
      } catch (err) {
        db.update(signingPackageItems).set({ state: 'could-not', outcome: `The act could not run: ${err instanceof Error ? err.message : String(err)}`, doneAt: null }).where(eq(signingPackageItems.id, item.id)).run()
      }
    }
    return held.workspaceId
  })()
  writeDownAnActUnderTheRaise(actor, { setting: 'signing-packages', field: `signed the package ${id}`, before: 'waiting', after: 'signed', workspaceId })
  tellThePages()
  return theSigningPackage(id)
}
export function refuseAPackage(id: string, actor: Actor): ASigningPackage {
  const byThePerson = thePersonIsProved(actor)
  if (!byThePerson && !aRaiseCarriesIt(actor)) assertThePersonIsProved(actor, 'Refusing a package')
  refuseInATestWorld()
  const who = whoAnswered(byThePerson, actor)
  const workspaceId = sqlite.transaction(() => {
    const held = stillWaiting(id)
    const outcome = byThePerson ? 'The person refused the package. Nothing ran.' : `The secretary "${actor.id}" refused the package for the person, under their grant. Nothing ran.`
    answerTheWaitingPackage(id, 'refused', who.kind, who.id, outcome)
    db.update(signingPackageItems).set({ state: 'not-run', outcome }).where(eq(signingPackageItems.packageId, id)).run()
    return held.workspaceId
  })()
  writeDownAnActUnderTheRaise(actor, { setting: 'signing-packages', field: `refused the package ${id}`, before: 'waiting', after: 'refused', workspaceId })
  tellThePages()
  return theSigningPackage(id)
}
/** A package brought before the re-mint holds its secretary's old id, so the secretary is compared by canonical id. */
export function withdrawAPackage(id: string, actor: Actor): ASigningPackage {
  const secretary = theAgentWhoseKeyThisIs(actor)
  const held = theSigningPackage(id)
  if (secretary === null || secretary.id !== theCanonicalAgentId(sqlite, held.broughtBy.id) || !theSecretaryOfThisOffice(actor)) {
    throw new PanelError('Only the secretary that brought this package withdraws it, proved by its own agent key. Nothing was written.', 403)
  }
  sqlite.transaction(() => {
    stillWaiting(id)
    const outcome = 'The secretary withdrew the package. Nothing ran.'
    answerTheWaitingPackage(id, 'withdrawn', 'agent', secretary.id, outcome)
    db.update(signingPackageItems).set({ state: 'not-run', outcome }).where(eq(signingPackageItems.packageId, id)).run()
  })()
  tellThePages()
  return theSigningPackage(id)
}

function thePackageRow(id: string): typeof signingPackages.$inferSelect {
  const row = db.select().from(signingPackages).where(eq(signingPackages.id, id)).get()
  if (row === undefined) throw new PanelError(`There is no signing package with the id ${id}. Nothing was written.`, 404)
  return row
}

/** A package brought before the re-mint holds its named agent's old id, so the agent is compared by canonical id. */
function requireTheNamedAgent(row: typeof signingPackages.$inferSelect, actor: Actor): { id: string; handle: string } {
  const named = theAgentWhoseKeyThisIs(actor)
  if (named === null || named.id !== theCanonicalAgentId(sqlite, row.forAgent)) throw new PanelError('Only the agent the package names carries out a held item or gives back its hold, proved by its own key or its run’s key. Nothing was written.', 403)
  return named
}

function requireAnOpenHold(row: typeof signingPackages.$inferSelect): Hold {
  const hold = theHoldOn(row, now())
  if (hold === null) throw new PanelError(`The package ${row.id} holds no item for its named agent. Nothing was run or written.`, 409)
  if (!hold.open) throw new PanelError(`${theHoldEndedInWords(hold)} Nothing was run or written.`, 409)
  return hold
}

/** The one conditional claim, followed by one act under this item's signature in a savepoint. */
export function carryOutAHeldItem(id: string, itemId: string, actor: Actor): ASigningPackage {
  refuseInATestWorld()
  sqlite.transaction(() => {
    const row = thePackageRow(id)
    const named = requireTheNamedAgent(row, actor)
    const item = db.select().from(signingPackageItems).where(and(eq(signingPackageItems.id, itemId), eq(signingPackageItems.packageId, id))).get()
    if (item === undefined) throw new PanelError(`Item ${itemId} is not in this package. Nothing was run or written.`, 409)
    if (row.state !== 'signed') throw new PanelError(`The package ${id} has not been signed. Its state is "${row.state === 'waiting' ? "waiting for the person's signature" : t(('signingPackages.state.' + row.state) as `signingPackages.state.${SigningPackageState}`)}". Nothing was run or written.`, 409)
    if (item.state !== 'held') throw new PanelError(`This item cannot be carried out as a held item. Item ${itemId} is "${t(('signingPackages.item.' + item.state) as `signingPackages.item.${SigningPackageItemState}`)}". Nothing was run or written.`, 409)
    requireAnOpenHold(row)
    const claimed = db.update(signingPackageItems).set({ state: 'could-not' }).where(and(eq(signingPackageItems.id, itemId), eq(signingPackageItems.state, 'held'))).run()
    if (claimed.changes !== 1) throw new PanelError(`Item ${itemId} is no longer held. A second press carries out nothing. Nothing was run or written.`, 409)
    const signed: Actor = { ...actor, signedItem: { package: id, item: itemId } }
    const carriedOutIn = theRunAWriteCameFrom(actor.sessionId)?.run ?? null
    try {
      sqlite.transaction(() => {
        const act: ExecutableAct = KNOWN_ACTS[item.act as KnownActName]
        const inputs = JSON.parse(item.inputs) as Record<string, unknown>
        const shows = act.showsAtEachRead?.(inputs) ?? item.shows
        const outcome = act.run(inputs, signed, row.workspaceId)
        db.update(signingPackageItems).set({ state: 'done', shows, outcome, doneAt: now(), carriedOutBy: named.id, carriedOutIn }).where(eq(signingPackageItems.id, itemId)).run()
      })()
    } catch (err) {
      db.update(signingPackageItems).set({ state: 'could-not', outcome: `The act could not run: ${err instanceof Error ? err.message : String(err)}`, doneAt: null, carriedOutBy: named.id, carriedOutIn }).where(eq(signingPackageItems.id, itemId)).run()
    }
    const remaining = db.select({ id: signingPackageItems.id }).from(signingPackageItems).where(and(eq(signingPackageItems.packageId, id), eq(signingPackageItems.state, 'held'))).get()
    if (remaining === undefined) db.update(signingPackages).set({ holdEndedAt: now(), holdEndedHow: 'all-carried-out' }).where(eq(signingPackages.id, id)).run()
  })()
  tellThePages()
  return theSigningPackage(id)
}

export function takeBackAHold(id: string, actor: Actor): ASigningPackage {
  const byThePerson = thePersonIsProved(actor)
  if (!byThePerson && !aRaiseCarriesIt(actor)) assertThePersonIsProved(actor, 'Taking back a signing package’s hold')
  refuseInATestWorld()
  const workspaceId = sqlite.transaction(() => {
    const row = thePackageRow(id)
    requireAnOpenHold(row)
    endTheRemainingHold(row, 'taken-back', byThePerson
      ? 'The person took back the hold before this item was carried out.'
      : `The secretary "${actor.id}" took back the hold for the person, under their grant, before this item was carried out.`)
    return row.workspaceId
  })()
  writeDownAnActUnderTheRaise(actor, { setting: 'signing-packages', field: `took back the hold of the package ${id}`, before: 'open', after: 'taken-back', workspaceId })
  tellThePages()
  return theSigningPackage(id)
}

export function giveBackAHold(id: string, actor: Actor): ASigningPackage {
  refuseInATestWorld()
  sqlite.transaction(() => {
    const row = thePackageRow(id)
    requireTheNamedAgent(row, actor)
    requireAnOpenHold(row)
    endTheRemainingHold(row, 'given-back', 'The named agent gave back the hold before this item was carried out.')
  })()
  tellThePages()
  return theSigningPackage(id)
}

function endTheRemainingHold(row: typeof signingPackages.$inferSelect, how: 'taken-back' | 'given-back', outcome: string): void {
  const at = now()
  db.update(signingPackageItems).set({ state: 'not-used', outcome: `${outcome} The hold ended at ${at}.` }).where(and(eq(signingPackageItems.packageId, row.id), eq(signingPackageItems.state, 'held'))).run()
  db.update(signingPackages).set({ holdEndedAt: at, holdEndedHow: how }).where(eq(signingPackages.id, row.id)).run()
}
