// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE'S SIDE OF THE PROVIDER ROUTER: it issues a run's credential from the Casting row the run was started from,
 * admits a request the router carries, settles the router's receipt for it, and reads a run's receipts back. The
 * router itself, the bridge and the launcher's lines are in tools/provider-router*.mjs; the setting, the providers it
 * routes and the sentence for a row it does not carry are in src/config/provider-router.mjs. A request to a provider paid
 * by a subscription, OpenCode Go, is not priced and charges nothing against the run's cap.
 *
 * Every door refuses while MOLE_OFFICE_PROVIDER_ROUTER is off, so an office with the setting off answers nothing new.
 * The credential's models come from the row's native model and from nothing else: a legacy row, a changed row, a held
 * row, a row through another provider and a run not started from the row are each refused, and nothing is issued.
 */
import { randomBytes } from 'node:crypto'
import { request } from 'node:http'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import { THE_ROUTED_PROVIDERS, THE_ROUTER_CAP_SETTING, THE_ROUTER_SETTING, theMethodTheToolRequestUses, theProviderRouterIsOn, theRoutedProviderOf, theRouterControlSocket, theRouteCarrying, theRunCapOfTheRouter, whyTheRouterDoesNotCarry } from '../../../config/provider-router.mjs'
import { theSandboxesFolderNow } from '../../../config/sandbox-folder.mjs'
import { estimatedCostOf } from '@shared/price-table.ts'
import { THE_INSPECTOR } from '@shared/roles.ts'
import { sqlite } from '../../db/client.ts'
import { giveTheFill } from '../../db/part-tables.ts'
import { readACastingSelection } from '../casting.ts'
import { theRowsInForce } from '../the-rows-in-force.ts'
import { theKeyHolderIsTheRegisteredStarterOf } from '../claims.ts'
import { parse } from '../parse.ts'
import { readParticipant } from '../../db/read-participant.ts'
import { priceTableInForce } from '../price-table.ts'
import { type Actor } from '../records.ts'
import { PanelError } from '../panel-error.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { getRecord } from '../records/reading.ts'
import { theAgentARunServes } from '../the-agent-a-run-serves.ts'
import { createRunTokenStore, RunTokenError, type RunTokenPair } from './run-tokens.ts'

const issueBody = z.strictObject({
  run: z.string().min(1).max(256),
  // A legacy row has no selection revision to send, and is refused for having no native model; a native row needs one.
  casting: z.strictObject({ id: z.number().int().positive(), revision: z.string().min(1).max(256).optional() }),
})
/** A tool's own credential names one provider and one model, and nothing else. */
const toolTokenBody = z.strictObject({
  run: z.string().min(1).max(256),
  provider: z.string().min(1).max(80),
  model: z.string().min(1).max(256),
})
const admitBody = z.strictObject({ token: z.string().max(512), provider: z.string().min(1).max(80), model: z.string().min(1).max(256) })
/** One request a tool asks the office to carry to the router; the path and method are the router's to choose. */
const toolRequestBody = z.strictObject({
  provider: z.string().min(1).max(80),
  path: z.string().min(1).max(80),
  body: z.unknown().optional(),
})
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const settleBody = z.strictObject({
  id: z.string().regex(/^rr_[A-Za-z0-9_-]{24}$/),
  token: z.string().regex(/^rt_[A-Za-z0-9_-]{24}$/),
  slot: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/),
  status: z.number().int().min(100).max(599),
  model: z.string().min(1).max(256),
  usage: z.strictObject({ inputTokens: count, cachedInputTokens: count, outputTokens: count }).nullable(),
})
const receiptsQuery = z.strictObject({ run: z.string().min(1).max(256) })

/** The receipt a router settles for one request it carried. */
export type RouterReceiptInput = z.output<typeof settleBody>

/** One receipt as the office answers it. */
export interface RouterReceipt {
  id: string
  slot: string
  status: number
  model: string
  /** The kind of router credential that asked, so a spend traces to Casting or to the tool. */
  kind: string
  inputTokens: number | null
  cachedInputTokens: number | null
  outputTokens: number | null
  priceUsd: number | null
  priceSays: string | null
  at: number
}

interface ReceiptRow {
  id: string; run_id: string; token_id: string; model: string; slot: string; status: number
  input_tokens: number | null; cached_input_tokens: number | null; output_tokens: number | null
  price_usd: number | null; price_says: string | null; at: number
  /** Joined from the credential row, which is where the kind is kept. */
  kind?: string
}

/** Refuses while the router is off, so an office with the setting off answers nothing new. The key slot doors ask it too. */
export function refuseWhileOff(): void {
  if (!theProviderRouterIsOn()) {
    throw new PanelError(`${THE_ROUTER_SETTING} is off, so the office has no provider router to answer for. Nothing was done.`, 409)
  }
}

/**
 * THE INSPECTOR'S ROW THAT STOPS THE ROUTER, or null. While the router is on, a check view gets no key the router holds,
 * so a Casting row in force for the inspector whose runs the router must carry would leave every check without one.
 * Every scope with inspector rows is read, and the scope for every project.
 */
export function theInspectorRowTheRouterMustCarry(): { id: number; program: string; nativeProvider: string; provider: (typeof THE_ROUTED_PROVIDERS)[keyof typeof THE_ROUTED_PROVIDERS] } | null {
  const projects = (sqlite.prepare('SELECT DISTINCT project FROM casting_rows WHERE role = ?').all(THE_INSPECTOR) as { project: string }[])
    .map((one) => (one.project === '' ? null : one.project))
  for (const project of [null, ...projects]) {
    for (const row of theRowsInForce(THE_INSPECTOR, project)) {
      const program = row.cells.program.value
      if (program !== null) {
        const route = theRouteCarrying(program, row.cells.model.value, row.native?.provider)
        if (route !== null) {
          const provider = THE_ROUTED_PROVIDERS[route.provider as keyof typeof THE_ROUTED_PROVIDERS]
          return { id: row.id, program, nativeProvider: route.nativeProvider, provider }
        }
      }
    }
  }
  return null
}

/** Refuses, naming the row, while the router is on and a Casting row in force for the inspector is one it must carry. */
export function refuseWhileTheRouterMustCarryTheInspector(): void {
  if (!theProviderRouterIsOn()) return
  const row = theInspectorRowTheRouterMustCarry()
  if (row === null) return
  const gives = row.provider.modelPrefix === null ? row.program : `${row.program} through ${row.nativeProvider}`
  throw new PanelError(
    `Casting ${String(row.id)} gives the inspector ${gives}, and while ${THE_ROUTER_SETTING} is on a check view gets no ${row.provider.named} key. ` +
      `Cast the inspector another program, or set ${THE_ROUTER_SETTING} to off.`,
    409,
  )
}

/** The run a router door names, in the caller's project, or a refusal that names it. */
function theRun(run: string, workspace: string) {
  const record = getRecord(run)
  if (record === null || record.kind !== 'session' || record.workspaceId !== workspace) {
    throw new PanelError(`There is no run ${run} in this project. Nothing was done.`, 404)
  }
  return record
}

/** Whether the caller is the person, the office's own key, or the agent key of whoever registered the run's agent. */
function mayAskForTheRun(actor: Actor, data: Record<string, unknown>): boolean {
  if (thePersonIsProved(actor) || actor.provedBy === 'the-office-key') return true
  if (actor.provedBy !== 'an-agent-key') return false
  // An agent's key sent with no name in the headers proves its holder as the actor itself, and carries no keyHolder.
  const holder = actor.keyHolder ?? actor.id
  const serving = theAgentARunServes(data)
  const registered = serving === null ? null : readParticipant({ kind: 'agent', id: serving.id })
  return registered !== null && 'startedBy' in registered && theKeyHolderIsTheRegisteredStarterOf(registered, holder)
}

/** The sentence for a price table that cannot count a model's spend in US dollars, or null when it can. */
function whyTheSpendCannotBeCounted(model: string): string | null {
  const reading = priceTableInForce()
  if (reading.state === 'none') return 'No price table is set, so the office cannot count this run\'s spend against its cap.'
  if (reading.table.currency.toUpperCase() !== 'USD') {
    return `The price table is in ${reading.table.currency}, and the run cap is in US dollars, so the office cannot count this run's spend against it.`
  }
  if (reading.table.prices[model] === undefined) return `The price table names no price for ${model}, so the office cannot count this run's spend against its cap.`
  return null
}

/**
 * ISSUE A RUN'S ROUTER CREDENTIAL from the Casting row it was started from. The same run and models again replaces
 * the credential it holds; other models are refused while it holds one. The token is in this answer once and is
 * stored only as a hash.
 */
export function issueARunToken(raw: unknown, actor: Actor, workspace: string) {
  refuseWhileOff()
  refuseWhileTheRouterMustCarryTheInspector()
  const asked = parse(issueBody, raw, 'The credential asked for')
  const record = theRun(asked.run, workspace)
  const data = record.data as Record<string, unknown>
  if (!mayAskForTheRun(actor, data)) {
    throw new PanelError("Only the person, the office or the registered starter of the run's agent may ask for its router credential. Nothing was issued.", 403)
  }
  const cap = theRunCapOfTheRouter()
  if (cap === null) throw new PanelError(`${THE_ROUTER_CAP_SETTING} is not set, so no run may spend through the provider router. Nothing was issued.`, 409)
  const read = readACastingSelection(asked.casting.id, asked.casting.revision)
  const selection = read.selection
  if (selection === null) {
    throw new PanelError(`Casting ${String(asked.casting.id)} has no native model, so the provider router has no model to take from it. Give the row its native model in Casting. Nothing was issued.`, 409)
  }
  if (asked.casting.revision === undefined) {
    throw new PanelError(`The credential asked for names no revision of Casting ${String(asked.casting.id)}, so the office cannot tell the row was not changed after it was selected. Nothing was issued.`, 400)
  }
  const notCarried = whyTheRouterDoesNotCarry(selection)
  const provider = theRoutedProviderOf(selection)
  if (notCarried !== null || provider === null || selection.native.model === null) {
    throw new PanelError(`${notCarried ?? `Casting ${String(asked.casting.id)} names no native model.`} Nothing was issued.`, 409)
  }
  const launched = (data['extra'] as { launcherSelection?: { casting?: { id?: unknown } | null } } | undefined)?.launcherSelection
  const startedFromIt = data['runtime'] === selection.runtime && data['model'] === selection.model &&
    (launched === undefined || launched.casting?.id === asked.casting.id)
  if (!startedFromIt) {
    throw new PanelError(
      `This run was not started from Casting ${String(asked.casting.id)}: it runs ${String(data['runtime'])} with ${String(data['model'])}, ` +
        `and the row gives ${selection.runtime} with ${selection.model}. Nothing was issued.`,
      409,
    )
  }
  const pairs: RunTokenPair[] = [{ provider, model: selection.native.model }]
  const store = createRunTokenStore(sqlite)
  const held = store.current(record.id, 'casting')
  if (held !== null && JSON.stringify(held.pairs) !== JSON.stringify(pairs)) {
    throw new PanelError('This run already has a router credential for other models. Nothing was issued.', 409)
  }
  // A provider paid by a subscription spends nothing a price table counts, so it needs no price.
  const unpriced = THE_ROUTED_PROVIDERS[provider as keyof typeof THE_ROUTED_PROVIDERS].paidBy === 'subscription' ? null : whyTheSpendCannotBeCounted(selection.native.model)
  if (unpriced !== null) throw new PanelError(`${unpriced} Nothing was issued.`, 409)
  try {
    const issued = held === null ? store.mint(record.id, 'casting', pairs, cap) : store.replace(held.id)
    return { token: issued.token, id: issued.id, run: issued.runId, kind: issued.kind, expiresAt: issued.expiresAt, pairs, spendCap: issued.spendCap }
  } catch (error) {
    if (error instanceof RunTokenError) throw new PanelError(`${error.message} Nothing was issued.`, 409)
    throw error
  }
}

/**
 * ISSUE A TOOL'S OWN ROUTER CREDENTIAL for the provider and model the tool names, as one pair and nothing else. Only
 * the run's own key may ask; the person, the office and the run's registered starter are refused. A provider paid by
 * tokens needs a price in US dollars, because a cap counts what it spends. The same pair again replaces the run's tool
 * credential; any other pair is refused while it holds one, so a tool can never widen it. The row's kind is `tool`, and
 * its expiry is the run's Casting credential's expiry or shorter. The token is in this answer once and is stored only
 * as a hash. Nothing here writes a record.
 */
export function issueAToolToken(raw: unknown, actor: Actor, workspace: string) {
  refuseWhileOff()
  refuseWhileTheRouterMustCarryTheInspector()
  const asked = parse(toolTokenBody, raw, 'The tool credential asked for')
  const record = theRun(asked.run, workspace)
  // ONLY THE RUN'S OWN KEY, because the tool is the run's and no other caller needs its own credential.
  if (actor.ownKeyRun !== record.id) {
    throw new PanelError("A tool's router credential is minted only with the run's own key. Nothing was issued.", 403)
  }
  const cap = theRunCapOfTheRouter()
  if (cap === null) throw new PanelError(`${THE_ROUTER_CAP_SETTING} is not set, so no run may spend through the provider router. Nothing was issued.`, 409)
  if (!Object.hasOwn(THE_ROUTED_PROVIDERS, asked.provider)) {
    throw new PanelError(`The provider router does not route ${asked.provider}. It routes ${Object.keys(THE_ROUTED_PROVIDERS).join(', ')}. Nothing was issued.`, 400)
  }
  const provider = THE_ROUTED_PROVIDERS[asked.provider as keyof typeof THE_ROUTED_PROVIDERS]
  // A provider paid by a subscription spends nothing a price table counts, so it needs no price.
  const unpriced = provider.paidBy === 'subscription' ? null : whyTheSpendCannotBeCounted(asked.model)
  if (unpriced !== null) throw new PanelError(`${unpriced} Nothing was issued.`, 409)
  const pairs: RunTokenPair[] = [{ provider: asked.provider, model: asked.model }]
  const store = createRunTokenStore(sqlite)
  const held = store.current(record.id, 'tool')
  const holdsThesePairs = held !== null && held.pairs.length === 1 && held.pairs[0]!.provider === asked.provider && held.pairs[0]!.model === asked.model
  if (held !== null && !holdsThesePairs) {
    throw new PanelError('This run already has a router credential for other models. Nothing was issued.', 409)
  }
  try {
    const issued = held === null ? store.mint(record.id, 'tool', pairs, cap) : store.replace(held.id)
    return { token: issued.token, id: issued.id, run: issued.runId, kind: issued.kind, expiresAt: issued.expiresAt, pairs, spendCap: issued.spendCap }
  } catch (error) {
    if (error instanceof RunTokenError) throw new PanelError(`${error.message} Nothing was issued.`, 409)
    throw error
  }
}

/** Refuses a caller who is not the office's own key, as only the router holds it on the host. */
function refuseAllButTheOffice(actor: Actor, door: string): void {
  if (actor.provedBy !== 'the-office-key') throw new PanelError(`Only the office's own key may ${door}. Nothing was done.`, 403)
}

/**
 * ADMIT ONE REQUEST the router is about to carry. The answer says whether, and when not, the refusal's code and
 * sentence the router gives back to the run. Nothing is written.
 */
export function admitARequest(raw: unknown, actor: Actor) {
  refuseWhileOff()
  refuseAllButTheOffice(actor, 'ask the office to admit a router request')
  const asked = parse(admitBody, raw, 'The request to admit')
  try {
    const admitted = createRunTokenStore(sqlite).authorize(asked.token, { provider: asked.provider, model: asked.model }, 'casting')
    return { admitted: true as const, id: admitted.id, run: admitted.runId, kind: admitted.kind }
  } catch (error) {
    if (error instanceof RunTokenError) return { admitted: false as const, code: error.code, says: error.message, kind: error.kind }
    throw error
  }
}

/** One request the office will carry to the router, after its credential and its path have been checked. */
export interface CarriedToolRequest {
  token: string
  provider: string
  path: string
  method: 'GET' | 'POST'
  model: string
  body: unknown
  runId: string
}

/** A token refusal as the route answers it: invalid credentials are 401, every other refusal is 403. */
function theTokenRefusal(error: RunTokenError): PanelError {
  return new PanelError(`${error.message} Nothing was carried.`, error.code === 'invalid-token' ? 401 : 403)
}

/**
 * READ ONE TOOL REQUEST AND CHECK ITS CREDENTIAL. The path and the method come from the router's own table, never from
 * the caller; a path the provider does not carry is refused by name. A request that names its model in the body is
 * checked for that exact provider and model. A request that names none, as the model list and the key's own limit do,
 * is checked for a credential that allows only its provider, and takes that credential's one model. Every call reads
 * the credential again, so an ended, expired or over-cap token is refused on the next request, not only the first.
 */
export function theToolRequest(raw: unknown, token: string): CarriedToolRequest {
  refuseWhileOff()
  const asked = parse(toolRequestBody, raw, 'The request to carry')
  const method = theMethodTheToolRequestUses(asked.provider, asked.path)
  if (method === null) {
    const paths = Object.keys(THE_ROUTED_PROVIDERS).includes(asked.provider)
      ? 'That provider carries only the paths in the router\'s tool-request table.'
      : `The provider router does not route ${asked.provider}.`
    throw new PanelError(`The provider router does not carry ${asked.provider} ${asked.path}. ${paths} Nothing was carried.`, 400)
  }
  const store = createRunTokenStore(sqlite)
  if (method === 'GET') {
    try {
      const authorized = store.authorizeForProvider(token, asked.provider, 'tool')
      return { token, provider: asked.provider, path: asked.path, method, model: authorized.model, body: asked.body, runId: authorized.runId }
    } catch (error) {
      if (error instanceof RunTokenError) throw theTokenRefusal(error)
      throw error
    }
  }
  const body = asked.body
  const namedModel = body !== null && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>)['model'] : undefined
  if (typeof namedModel !== 'string' || namedModel === '') {
    throw new PanelError(`A ${method} request the office carries must name its model in its body. Nothing was carried.`, 400)
  }
  const model = namedModel
  try {
    const authorized = store.authorize(token, { provider: asked.provider, model }, 'tool')
    return { token, provider: asked.provider, path: asked.path, method, model, body, runId: authorized.runId }
  } catch (error) {
    if (error instanceof RunTokenError) throw theTokenRefusal(error)
    throw error
  }
}

/** How long the office waits for the router to answer one carried request, and how large its answer may be. */
const THE_LONGEST_TOOL_REQUEST_MS = 10 * 60 * 1000
const MOST_TOOL_REQUEST_ANSWER_BYTES = 64 * 1024 * 1024

/**
 * CARRY ONE CHECKED REQUEST TO THE ROUTER'S CONTROL SOCKET, and answer its status, content type and bytes. The control
 * socket is the router's own host-only socket; the office holds no provider key and never reaches the provider itself.
 * A router that is not there is refused in words, and the request's credential is already checked before this is called.
 */
export function carryTheToolRequest(asked: CarriedToolRequest): Promise<{ status: number; contentType: string; body: Buffer }> {
  const socket = theRouterControlSocket(theSandboxesFolderNow())
  const payload = JSON.stringify({
    token: asked.token, provider: asked.provider, path: asked.path, method: asked.method, model: asked.model, body: asked.body ?? null,
  })
  return new Promise((done, failed) => {
    const askedAtTheRouter = request({
      socketPath: socket, method: 'POST', path: '/carry',
      headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(payload)) },
      timeout: THE_LONGEST_TOOL_REQUEST_MS,
    }, (answer) => {
      const parts: Buffer[] = []
      let size = 0
      answer.on('data', (part: Buffer) => {
        size += part.length
        if (size > MOST_TOOL_REQUEST_ANSWER_BYTES) {
          answer.destroy(new Error('the provider router answered with more than the office carries'))
          return
        }
        parts.push(part)
      })
      answer.on('end', () => done({
        status: answer.statusCode ?? 502,
        contentType: String(answer.headers['content-type'] ?? 'application/json'),
        body: Buffer.concat(parts),
      }))
      answer.on('error', (error) => failed(new PanelError(`The provider router's answer broke off: ${error.message}. Nothing was carried.`, 502)))
    })
    askedAtTheRouter.on('timeout', () => askedAtTheRouter.destroy(Object.assign(new Error(`the router did not answer within ${String(THE_LONGEST_TOOL_REQUEST_MS / 1000)} seconds`), { code: 'TIMEOUT' })))
    askedAtTheRouter.on('error', (error) => failed(new PanelError(`The provider router did not answer on ${socket}: ${error.message}. Nothing was carried.`, 503)))
    askedAtTheRouter.end(payload)
  })
}

/**
 * The price of one receipt in US dollars, or why it has none. The provider's input count includes its cached reads. A
 * request to a provider paid by a subscription has no price: it costs nothing more than the subscription.
 */
function thePriceOf(input: RouterReceiptInput, provider: string | undefined): { usd: number; says: null } | { usd: null; says: string } {
  const routed = provider !== undefined && Object.hasOwn(THE_ROUTED_PROVIDERS, provider) ? THE_ROUTED_PROVIDERS[provider as keyof typeof THE_ROUTED_PROVIDERS] : null
  if (routed?.paidBy === 'subscription') return { usd: null, says: `This request was paid by the ${routed.named} subscription of slot ${input.slot}, so it is not priced.` }
  if (input.usage === null) return { usd: null, says: "The provider's answer carried no token counts, so this request is not priced." }
  const cost = estimatedCostOf({ ...input.usage, inputIncludesCached: true, model: input.model }, priceTableInForce())
  if (cost.state === 'no-table') return { usd: null, says: 'No price table was set when this request was settled, so it is not priced.' }
  if (cost.state === 'not-priced') return { usd: null, says: `The price table names no price for ${input.model}, so this request is not priced.` }
  if (cost.state === 'not-enough-numbers') return { usd: null, says: cost.because }
  if (cost.currency.toUpperCase() !== 'USD') return { usd: null, says: `The price table is in ${cost.currency}, not US dollars, so this request is not priced.` }
  return { usd: cost.total, says: null }
}

function aReceipt(row: ReceiptRow): RouterReceipt {
  return {
    id: row.id, slot: row.slot, status: row.status, model: row.model, kind: row.kind ?? 'unknown',
    inputTokens: row.input_tokens, cachedInputTokens: row.cached_input_tokens, outputTokens: row.output_tokens,
    priceUsd: row.price_usd, priceSays: row.price_says, at: row.at,
  }
}

/** Keeps one receipt and charges its price to the run, once. The same receipt again changes nothing. */
function keepAReceipt(db: Database.Database, input: RouterReceiptInput): { receipt: RouterReceipt; kept: boolean } {
  return db.transaction(() => {
    const credential = db.prepare('SELECT run_id, allowed_pairs, kind FROM run_tokens WHERE id = ?').get(input.token) as
      { run_id: string; allowed_pairs: string; kind: string } | undefined
    if (credential === undefined) throw new PanelError(`No router credential has the id ${input.token}. Nothing was settled.`, 404)
    const usage = input.usage
    const wanted = [credential.run_id, input.token, input.model, input.slot, input.status, usage?.inputTokens ?? null, usage?.cachedInputTokens ?? null, usage?.outputTokens ?? null]
    const receiptById = (id: string) => db.prepare(
      'SELECT r.*, t.kind FROM router_receipts r LEFT JOIN run_tokens t ON t.id = r.token_id WHERE r.id = ?',
    ).get(id) as ReceiptRow | undefined
    const before = receiptById(input.id)
    if (before !== undefined) {
      const kept = [before.run_id, before.token_id, before.model, before.slot, before.status, before.input_tokens, before.cached_input_tokens, before.output_tokens]
      if (JSON.stringify(kept) !== JSON.stringify(wanted)) throw new PanelError(`Receipt ${input.id} was settled already, with other numbers. Nothing was changed.`, 409)
      return { receipt: aReceipt(before), kept: false }
    }
    const price = thePriceOf(input, (JSON.parse(credential.allowed_pairs) as RunTokenPair[]).find((one) => one.model === input.model)?.provider)
    db.prepare('INSERT INTO router_receipts (id, run_id, token_id, model, slot, status, input_tokens, cached_input_tokens, output_tokens, price_usd, price_says, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(input.id, ...wanted, price.usd, price.says, Date.now())
    if (price.usd !== null && price.usd > 0) createRunTokenStore(db).charge(input.token, price.usd)
    return { receipt: aReceipt(receiptById(input.id)!), kept: true }
  }).immediate()
}

/** SETTLE THE ROUTER'S RECEIPT for one request it carried. */
export function settleAReceipt(raw: unknown, actor: Actor) {
  refuseWhileOff()
  refuseAllButTheOffice(actor, 'settle a router receipt')
  return keepAReceipt(sqlite, parse(settleBody, raw, 'The receipt'))
}

/** A RUN'S RECEIPTS, what each slot carried for it, and what it has spent against its cap. */
export function theReceiptsOfARun(raw: unknown, actor: Actor, workspace: string) {
  refuseWhileOff()
  const record = theRun(parse(receiptsQuery, raw, 'The receipts asked for').run, workspace)
  if (!mayAskForTheRun(actor, record.data as Record<string, unknown>)) {
    throw new PanelError("Only the person, the office or the registered starter of the run's agent may read its router receipts.", 403)
  }
  const receipts = (sqlite.prepare(
    'SELECT r.*, t.kind FROM router_receipts r LEFT JOIN run_tokens t ON t.id = r.token_id WHERE r.run_id = ? ORDER BY r.at, r.rowid',
  ).all(record.id) as ReceiptRow[]).map(aReceipt)
  const slots = new Map<string, { slot: string; requests: number; usd: number; unpriced: number }>()
  for (const one of receipts) {
    const slot = slots.get(one.slot) ?? { slot: one.slot, requests: 0, usd: 0, unpriced: 0 }
    slot.requests += 1
    if (one.priceUsd === null) slot.unpriced += 1
    else slot.usd += one.priceUsd
    slots.set(one.slot, slot)
  }
  const spent = (sqlite.prepare('SELECT max(spent) AS spent FROM run_tokens WHERE run_id = ?').get(record.id) as { spent: number | null }).spent ?? 0
  const store = createRunTokenStore(sqlite)
  const casting = store.current(record.id, 'casting')
  const tool = store.current(record.id, 'tool')
  return {
    run: record.id, spent, spendCap: casting?.spendCap ?? tool?.spendCap ?? null, receipts, slots: [...slots.values()],
    kinds: { casting: casting?.id ?? null, tool: tool?.id ?? null },
  }
}

/** Only the synthetic restore corpus calls this: one unpriced receipt, through the writer, for a live run. */
export async function fillRouterReceiptProof(): Promise<string> {
  const { sqlite: db } = await import('../../db/client.ts')
  const live = db.prepare("SELECT id FROM records WHERE kind = 'session' AND deleted_at IS NULL AND json_extract(data, '$.state') IN ('running', 'idle') ORDER BY id LIMIT 1").get() as { id: string } | undefined
  if (live === undefined) throw new Error('The synthetic restore corpus has no live run to keep a router receipt for.')
  const store = createRunTokenStore(db)
  const held = store.current(live.id, 'casting') ?? store.mint(live.id, 'casting', [{ provider: Object.keys(THE_ROUTED_PROVIDERS)[0]!, model: 'synthetic-restore-model' }], 1)
  keepAReceipt(db, { id: `rr_${randomBytes(18).toString('base64url')}`, token: held.id, slot: 'synthetic-slot', status: 200, model: 'synthetic-restore-model', usage: null })
  return 'router_receipts: one unpriced receipt for a live run, kept through its writer'
}
// The schema part of router_receipts names this file for its fill, so the database folder imports nothing above itself.
giveTheFill('src/server/lib/keyrouter/provider-router.ts', fillRouterReceiptProof)

/** Totals from the same settled receipts, grouped once by slot and once by run. */
export function theUsageTotals(slots: { id: string; label: string; provider: string; mark: string }[]) {
  refuseWhileOff()
  type Totals = { requests: number; inputTokens: number; cachedInputTokens: number; outputTokens: number; withoutUsage: number; withoutCachedUsage: number; usd: number; unpriced: number }
  const empty = (): Totals => ({ requests: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, withoutUsage: 0, withoutCachedUsage: 0, usd: 0, unpriced: 0 })
  const bySlot = new Map<string, Totals>()
  const byRun = new Map<string, Totals>()
  const rows = sqlite.prepare('SELECT slot, run_id, input_tokens, cached_input_tokens, output_tokens, price_usd FROM router_receipts ORDER BY rowid').all() as {
    slot: string; run_id: string; input_tokens: number | null; cached_input_tokens: number | null; output_tokens: number | null; price_usd: number | null
  }[]
  function add(total: Totals, row: typeof rows[number]): void {
    total.requests += 1
    total.inputTokens += row.input_tokens ?? 0
    total.cachedInputTokens += row.cached_input_tokens ?? 0
    total.outputTokens += row.output_tokens ?? 0
    if (row.input_tokens === null || row.output_tokens === null) total.withoutUsage += 1
    if (row.input_tokens !== null && row.cached_input_tokens === null) total.withoutCachedUsage += 1
    if (row.price_usd === null) total.unpriced += 1
    else total.usd += row.price_usd
  }
  for (const row of rows) {
    const slot = bySlot.get(row.slot) ?? empty()
    const run = byRun.get(row.run_id) ?? empty()
    add(slot, row); add(run, row)
    bySlot.set(row.slot, slot); byRun.set(row.run_id, run)
  }
  const named = new Map(slots.map(({ id, label, provider, mark }) => [id, { id, label, provider, mark }]))
  return {
    slots: [...new Set([...named.keys(), ...bySlot.keys()])].map((id) => ({ ...(named.get(id) ?? { id }), ...(bySlot.get(id) ?? empty()) })),
    runs: [...byRun].map(([run, total]) => ({ run, ...total })),
  }
}
