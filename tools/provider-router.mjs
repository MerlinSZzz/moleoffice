#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROVIDER ROUTER, the host process that alone holds a provider's keys. A run inside a sandbox is given a run token,
 * never a key. Its bridge (tools/provider-router-bridge.mjs) carries each request to this router's socket for that
 * sandbox; the router asks the office whether the token may send it, swaps the token for a key slot of the provider,
 * carries the request, streams the answer back unchanged and settles one receipt with the office. The key slots file is
 * read again at each request, so a slot the person adds or removes on the Settings page counts from the next one.
 *
 * DEEPSEEK, paid by its tokens, always goes through its first slot. OPENCODE GO, paid by a subscription, is used in turn
 * (the person's decision of 16 October 2026): each run takes the next Go slot at its first request and keeps it. When Go
 * answers 429 naming GoUsageLimitError, the router reads that whole answer before it writes a byte back, marks the slot
 * used up until the reset the answer names (src/config/stopped-run-cause.mjs works it out), keeps a receipt for the
 * try, and sends the same request through the next slot that is not used up; the run stays on that slot. A used-up
 * slot is not tried again before its reset. When every Go slot is used up, the request is refused with 429, a
 * retry-after of the earliest reset, and one sentence that names every slot, the first to reset and its reset. A run
 * already going is not moved to dsh: the router cannot start another program for it. A run not yet started is: the
 * launcher asks the control socket's GET /slots first, and starts the run on dsh instead (tools/provider-router-host.mjs,
 * the rule of 16 October 2026). What is used up is kept in this process only, so a router started again
 * knows of no used-up slot until Go refuses one.
 *
 *   node tools/provider-router.mjs serve --sandboxes <dir> [--api <address>]   run the router
 *   node tools/provider-router.mjs unit --sandboxes <dir>                      print the user unit's text, naming the
 *                                                                              office mole-office-stable.service serves
 *
 * The router is used only while MOLE_OFFICE_PROVIDER_ROUTER is on: every office door it asks refuses while it is off.
 * Nothing here installs, enables or starts the unit; the person does that by hand when the key layer goes live.
 *
 * WHAT IT REFUSES, sending nothing upstream: a path other than POST /<provider>/chat/completions, a key slots file it
 * cannot read, a provider it holds no slot for, a body with no model, every token the office does not admit, in the
 * office's own sentence, and a Go request while every Go slot is used up. On the control socket, anything but POST /open,
 * POST /carry and GET /slots. POST /carry is the office's tool route: it carries one checked request for one of the
 * upstream paths in THE_TOOL_REQUEST_PATHS, after asking the office to admit its token and model. A key is named only by
 * its sha256 prefix, in the log and everywhere else, and GET /slots names none.
 */
import { randomBytes } from 'node:crypto'
import { chmodSync, lstatSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs'
import { createServer } from 'node:http'
import { createConnection } from 'node:net'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { KEY_HEADER } from '../src/config/key-header.mjs'
import {
  THE_ROUTED_PROVIDERS, THE_ROUTER_SOCKET_NAME, aSecretsMark, readTheGoPin, readTheKeySlots, theGoPinFile, theKeySlotsFile, theMethodTheToolRequestUses,
  theProviderRouterUnit, theRouterControlFolder, theRouterControlSocket,
} from '../src/config/provider-router.mjs'
import { theGoLimitIn } from '../src/config/stopped-run-cause.mjs'
import { ENV_FILE, keysPathFrom, loadEnvFileIntoProcess } from '../src/config/settings.mjs'
import { clockStamp } from '../src/shared/time.ts'
import { whereIsTheApiForACommand } from './where-is-the-api.mjs'
import { theGoSwitchLogFile, writeTheGoSwitch } from './key-router/go-state.mjs'

const SANDBOX_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u
const ROUTED_PATH = /^\/([a-z0-9-]+)(\/[^?]*)$/u
// A TOOL'S REQUEST MAY CARRY A VIDEO INLINE: the office carries a 40 MiB JSON body, and a 20 MiB MP4 is about 27 MiB as
// base64 before its prompt. A harness run's own request is far smaller, but it shares this reader.
const MOST_BODY_BYTES = 40 * 1024 * 1024

/** A folder of the router's own at mode 0700. A link or a file in its place is refused. */
function aFolderOfItsOwn(folder) {
  let found = null
  try { found = lstatSync(folder) } catch { found = null }
  if (found !== null && !found.isDirectory()) throw new Error(`${folder} is a link or a file, and the provider router's folder must be a folder of its own.`)
  mkdirSync(folder, { recursive: true, mode: 0o700 })
  chmodSync(folder, 0o700)
}

/** Whether something accepts a connection on the socket. */
function theSocketAnswers(socket) {
  return new Promise((done) => {
    const tried = createConnection(socket)
    tried.once('connect', () => { tried.end(); done(true) })
    tried.once('error', () => done(false))
  })
}

/** A socket file left by a router that is gone is removed. One that answers is another router's, and is refused. */
async function clearAStaleSocket(socket) {
  let found = null
  try { found = lstatSync(socket) } catch { found = null }
  if (found === null) return
  if (!found.isSocket()) throw new Error(`${socket} is not a socket, and the provider router does not remove it.`)
  if (await theSocketAnswers(socket)) throw new Error(`Another provider router already answers on ${socket}.`)
  unlinkSync(socket)
}

/** Listens on the socket and makes it mode 0600. */
async function listenOn(server, socket) {
  await new Promise((done, failed) => { server.once('error', failed); server.listen(socket, () => { server.off('error', failed); done(undefined) }) })
  chmodSync(socket, 0o600)
}

/** The whole body, or null past MOST_BODY_BYTES. */
function theBodyOf(req) {
  return new Promise((done, failed) => {
    const parts = []
    let size = 0
    req.on('data', (part) => {
      size += part.length
      if (size > MOST_BODY_BYTES) { done(null); req.resume(); return }
      parts.push(part)
    })
    req.on('end', () => { if (size <= MOST_BODY_BYTES) done(Buffer.concat(parts)) })
    req.on('error', failed)
  })
}

/** Answers a refusal in the provider's own error shape, in one sentence. */
function refuseTheRequest(res, status, code, message, type = 'mole_office_provider_router', headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers }).end(JSON.stringify({ error: { message, type, code } }))
}

/** "A", "A and B", "A, B and C". */
function aList(names) {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** The token counts from a JSON answer or the usage events in an SSE answer. */
function theUsageIn(text, provider) {
  const candidates = text.trimStart().startsWith('{') ? [text] : text.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim())
  let inputTokens = null
  let outputTokens = null
  let cachedInputTokens = null
  const count = (value) => (Number.isInteger(value) && value >= 0 ? value : null)
  for (const candidate of candidates) {
    let parsed = null
    try { parsed = JSON.parse(candidate) } catch { continue }
    const usage = parsed?.usage ?? parsed?.response?.usage ?? parsed?.message?.usage
    if (usage === null || typeof usage !== 'object') continue
    const ordinaryInput = count(usage.prompt_tokens ?? usage.input_tokens)
    // Anthropic reports cache reads and writes outside ordinary input. Writes use the ordinary input rate until a separate price exists.
    inputTokens = ordinaryInput === null ? inputTokens : ordinaryInput + (provider === 'anthropic' ? (count(usage.cache_read_input_tokens) ?? 0) + (count(usage.cache_creation_input_tokens) ?? 0) : 0)
    outputTokens = count(usage.completion_tokens ?? usage.output_tokens) ?? outputTokens
    cachedInputTokens = count(usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? usage.input_tokens_details?.cached_tokens ?? usage.cache_read_input_tokens) ?? cachedInputTokens
  }
  if (inputTokens === null || outputTokens === null) return null
  return { inputTokens, cachedInputTokens: cachedInputTokens ?? 0, outputTokens }
}

/**
 * THE ROUTER, not yet listening. start() opens its control socket; open(name) opens one sandbox's socket, and the
 * control socket's POST /open {"sandbox"} asks for the same; the control socket's GET /slots answers which slots are used
 * up (theSlotsHeld); close() closes all of them. `slots` is the slots, or a function the router asks for them at each
 * request; `now` is its clock, in milliseconds.
 * @param {{ sandboxes: string, slots: Slot[] | (() => Slot[]), office: { api: string, key: string },
 *   upstreams?: Record<string, string>, log?: (line: string) => void, now?: () => number, pinFile?: string | null, switchLog?: string | null }} given
 * @typedef {{ id: string, provider: string, label: string, key: string }} Slot
 */
export function createProviderRouter({ sandboxes, slots, office, upstreams = {}, log = (line) => process.stderr.write(`${line}\n`), now = Date.now, pinFile = null, switchLog = null }) {
  /** @type {Map<string, import('node:http').Server>} */
  const opened = new Map()
  let control = null
  const theSlots = typeof slots === 'function' ? slots : () => slots
  /** The position in the provider's slots of the next run's turn, by provider. */
  const turns = new Map()
  /** The slot each run is on, by provider and run. */
  const onSlot = new Map()
  /** Each used-up key, to when it resets and where that came from. */
  const usedUp = new Map()
  /** Whether a slot is used up at this moment. */
  const isUsedUp = (one, at) => (usedUp.get(one.key)?.resetsAtMs ?? 0) > at

  /**
   * THE SLOT A SUBSCRIPTION RUN'S REQUEST GOES THROUGH, or null when every slot is used up. A run's first request takes
   * the next turn, and so does a run whose slot was removed. A run whose slot is used up moves to the next slot after it
   * that is not, and the turn stays where it was.
   */
  function theSlotForARun(provider, run, all) {
    const at = now()
    const free = (one) => !isUsedUp(one, at)
    const held = all.findIndex((one) => one.id === onSlot.get(`${provider} ${run}`))
    if (held !== -1 && free(all[held])) return all[held]
    let from = held === -1 ? (turns.get(provider) ?? 0) % all.length : held + 1
    if (provider === 'opencode-go' && held === -1) {
      const pin = readTheGoPin(pinFile)
      const pinned = pin === null ? -1 : all.findIndex((one) => one.id === pin.slot)
      if (pinned !== -1) from = pinned
    }
    for (let step = 0; step < all.length; step++) {
      const place = (from + step) % all.length
      if (!free(all[place])) continue
      if (held === -1) turns.set(provider, (place + 1) % all.length)
      onSlot.set(`${provider} ${run}`, all[place].id)
      return all[place]
    }
    return null
  }

  /** The used-up slot among these that resets first, with its reset. */
  function theFirstToReset(all) {
    return all.map((slot) => ({ slot, ...usedUp.get(slot.key) })).reduce((first, one) => (one.resetsAtMs < first.resetsAtMs ? one : first))
  }

  /**
   * WHEN EVERY ONE OF THESE SLOTS IS USED UP, the slot that resets first and the sentence that says so: the refused
   * request ends it, and the control socket's GET /slots gives it to the launcher as it is. Null while a slot is free.
   */
  function everySlotIsUsedUp(named, all) {
    const at = now()
    if (all.length === 0 || !all.every((one) => isUsedUp(one, at))) return null
    const first = theFirstToReset(all)
    // LOCAL TIME WITH ITS OFFSET, chapter 4 rule 8: the sentence is read inside a sandbox, whose clock may be in another zone.
    const resetsAt = clockStamp(() => new Date(first.resetsAtMs)).instant
    return {
      first, resetsAt,
      says: `Every ${named} key slot (${aList(all.map((one) => one.label))}) has reached its usage limit, and the first to reset is ${first.slot.label} at ${resetsAt}, ${first.resetFrom}`,
    }
  }

  /** What the control socket's GET /slots answers: each provider's slots, which are used up and until when, and no key. */
  function theSlotsHeld() {
    const all = theSlots()
    const at = now()
    const providers = {}
    for (const [provider, { named }] of Object.entries(THE_ROUTED_PROVIDERS)) {
      const its = all.filter((one) => one.provider === provider)
      const every = everySlotIsUsedUp(named, its)
      providers[provider] = {
        slots: its.map((one) => {
          const until = isUsedUp(one, at) ? usedUp.get(one.key) : null
          return { id: one.id, label: one.label, usedUpUntil: until === null ? null : clockStamp(() => new Date(until.resetsAtMs)).instant, resetFrom: until?.resetFrom ?? null }
        }),
        everyUsedUp: every !== null,
        says: every?.says ?? null,
      }
    }
    return { providers }
  }

  async function askTheOffice(path, body) {
    try {
      const reply = await fetch(`${office.api}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', [KEY_HEADER]: office.key }, body: JSON.stringify(body) })
      let answer = null
      try { answer = await reply.json() } catch { answer = null }
      return { status: reply.status, answer }
    } catch {
      return { status: null, answer: null }
    }
  }

  async function carry(req, res) {
    const routed = ROUTED_PATH.exec((req.url ?? '').split('?')[0])
    if (req.method !== 'POST' || routed === null || !Object.hasOwn(THE_ROUTED_PROVIDERS, routed[1]) || !THE_ROUTED_PROVIDERS[routed[1]].paths.includes(routed[2])) {
      req.resume()
      refuseTheRequest(res, 404, 'not-routed', 'The provider router does not carry that provider and path.')
      return
    }
    const provider = routed[1]
    const { paidBy, named } = THE_ROUTED_PROVIDERS[provider]
    let all = null
    try { all = theSlots().filter((one) => one.provider === provider) } catch (error) {
      req.resume()
      refuseTheRequest(res, 503, 'slots-unreadable', error instanceof Error ? error.message : 'The provider router could not read its key slots.')
      return
    }
    if (all.length === 0) {
      req.resume()
      refuseTheRequest(res, 503, 'no-slot', `The provider router holds no key slot for ${provider}.`)
      return
    }
    const raw = await theBodyOf(req)
    let body = null
    try { body = raw === null ? null : JSON.parse(raw.toString('utf8')) } catch { body = null }
    if (body === null || typeof body !== 'object' || typeof body.model !== 'string' || body.model === '') {
      refuseTheRequest(res, 400, 'no-model', 'The provider router carries only a JSON request that names its model.')
      return
    }
    const bearer = /^Bearer\s+(\S+)$/u.exec(req.headers.authorization ?? '')
    const admission = await askTheOffice('/api/provider-router/admissions', { token: bearer?.[1] ?? (typeof req.headers['x-api-key'] === 'string' ? req.headers['x-api-key'] : ''), provider, model: body.model })
    if (admission.status !== 200 || admission.answer === null) {
      log(`refused ${provider} ${body.model}: the office answered ${String(admission.status)} when asked to admit it`)
      refuseTheRequest(res, 502, 'office-unreachable', 'The provider router could not ask the office whether to carry this request.')
      return
    }
    if (admission.answer.admitted !== true) {
      const code = String(admission.answer.code)
      log(`refused ${provider} ${body.model}: ${code}`)
      refuseTheRequest(res, code === 'invalid-token' ? 401 : 403, code, String(admission.answer.says))
      return
    }
    if (body.stream === true && routed[2] === '/chat/completions') body.stream_options = { ...(body.stream_options ?? {}), include_usage: true }
    const settle = (slot, status, usage) => askTheOffice('/api/provider-router/receipts', {
      id: `rr_${randomBytes(18).toString('base64url')}`, token: admission.answer.id, slot: slot.id, status, model: body.model, usage,
    })
    const said = (settled) => `receipt ${settled.status === 201 ? 'settled' : `not settled (the office answered ${String(settled.status)})`}`
    let refusedSlot = null
    for (;;) {
      const run = String(admission.answer.run)
      const held = provider === 'opencode-go' ? all.find((one) => one.id === onSlot.get(`${provider} ${run}`)) : null
      const slot = paidBy === 'subscription' ? theSlotForARun(provider, run, all) : all[0]
      if (slot === null) {
        const every = everySlotIsUsedUp(named, all)
        // A slot that reset since it was asked for is taken on the next turn.
        if (every === null) continue
        const { first, resetsAt } = every
        const message = `${every.says}, so this request is refused, and a run already going is not moved to dsh.`
        log(`refused ${provider} ${body.model}: every slot is used up, and ${first.slot.id} resets first, at ${resetsAt}`)
        // GO'S OWN ERROR TYPE, so OpenCode reads the refusal as Go's usage limit and waits for its retry-after.
        refuseTheRequest(res, 429, 'every-go-slot-used-up', message, 'GoUsageLimitError', { 'retry-after': String(Math.max(1, Math.ceil((first.resetsAtMs - now()) / 1000))) })
        return
      }
      const from = refusedSlot ?? (held && held.id !== slot.id && isUsedUp(held, now()) ? held : null)
      if (from !== null && from.id !== slot.id) {
        try { writeTheGoSwitch(switchLog, { at: new Date(now()).toISOString(), event: 'hand-off', run, from, to: slot }) }
        catch (error) {
          onSlot.set(`${provider} ${run}`, from.id)
          throw error
        }
      }
      refusedSlot = null
      const headers = { ...req.headers }
      // Preserve vendor-specific headers while keeping office credentials and cookies inside the office.
      for (const name of Object.keys(headers)) if (name.startsWith('x-mole-office-') || ['authorization', 'x-api-key', 'cookie', 'cookie2', 'host', 'content-length', 'transfer-encoding', 'connection', 'keep-alive', 'proxy-authorization', 'upgrade'].includes(name)) delete headers[name]
      const keyHeader = THE_ROUTED_PROVIDERS[provider].keyHeader
      headers[keyHeader] = keyHeader === 'authorization' ? `Bearer ${slot.key}` : slot.key
      let answer = null
      try {
        answer = await fetch(`${upstreams[provider] ?? THE_ROUTED_PROVIDERS[provider].upstream}${routed[2]}`, { method: 'POST', headers, body: JSON.stringify(body) })
      } catch {
        answer = null
      }
      if (answer === null) {
        log(`failed ${provider} ${body.model} through ${slot.id} ${aSecretsMark(slot.key)}: the provider could not be reached`)
        refuseTheRequest(res, 502, 'provider-unreachable', 'The provider router could not reach the provider.')
        return
      }
      const retryAfter = answer.headers.get('retry-after')
      const passed = { 'content-type': answer.headers.get('content-type') ?? 'application/json', ...(retryAfter === null ? {} : { 'retry-after': retryAfter }) }
      if (paidBy === 'subscription' && answer.status === 429) {
        // THE WHOLE REFUSAL IS READ BEFORE A BYTE GOES BACK, so a request moved to the next slot reaches the run as one answer.
        const text = await answer.text()
        const limit = theGoLimitIn(text, retryAfter, now())
        if (limit !== null) {
          usedUp.set(slot.key, limit)
          refusedSlot = slot
          const settled = await settle(slot, answer.status, null)
          log(`used up ${provider} ${slot.id} ${aSecretsMark(slot.key)} until ${clockStamp(() => new Date(limit.resetsAtMs)).instant}, ${limit.resetFrom}: ${said(settled)}`)
          continue
        }
        res.writeHead(answer.status, passed)
        const settled = await settle(slot, answer.status, null)
        log(`carried ${provider} ${body.model} through ${slot.id} ${aSecretsMark(slot.key)}: ${String(answer.status)}, ${said(settled)}`)
        res.end(text)
        return
      }
      res.writeHead(answer.status, passed)
      const parts = []
      if (answer.body !== null) {
        for await (const part of answer.body) {
          parts.push(Buffer.from(part))
          res.write(part)
        }
      }
      // The receipt is settled before the answer ends, so a run that asks for its receipts next finds this one.
      const settled = await settle(slot, answer.status, theUsageIn(Buffer.concat(parts).toString('utf8'), provider))
      log(`carried ${provider} ${body.model} through ${slot.id} ${aSecretsMark(slot.key)}: ${String(answer.status)}, ${said(settled)}`)
      res.end()
      return
    }
  }

  function handleACarry(req, res) {
    carry(req, res).catch(() => {
      if (res.headersSent) res.destroy()
      else refuseTheRequest(res, 500, 'router-failed', 'The provider router failed while carrying this request.')
    })
  }

  /**
   * CARRY ONE TOOL'S REQUEST, asked on the control socket by the office. The path and method come from the router's own
   * table; the token is checked with the office for this provider and model before anything upstream is sent. The office
   * has already checked the token too, but this is the router's own check, so a control socket reachable by another host
   * program cannot spend a token the office would refuse.
   */
  async function carryForATool(asked, res) {
    const provider = asked?.provider
    const path = asked?.path
    const method = typeof provider === 'string' && typeof path === 'string' ? theMethodTheToolRequestUses(provider, path) : null
    if (method === null || !Object.hasOwn(THE_ROUTED_PROVIDERS, provider)) {
      refuseTheRequest(res, 404, 'not-routed', 'The provider router does not carry that provider and path for a tool.')
      return
    }
    const model = typeof asked.model === 'string' ? asked.model : ''
    if (model === '') {
      refuseTheRequest(res, 400, 'no-model', 'The provider router carries only a tool request that names its model.')
      return
    }
    let all = null
    try { all = theSlots().filter((one) => one.provider === provider) } catch (error) {
      refuseTheRequest(res, 503, 'slots-unreadable', error instanceof Error ? error.message : 'The provider router could not read its key slots.')
      return
    }
    if (all.length === 0) {
      refuseTheRequest(res, 503, 'no-slot', `The provider router holds no key slot for ${provider}.`)
      return
    }
    const admission = await askTheOffice('/api/provider-router/admissions', { token: typeof asked.token === 'string' ? asked.token : '', provider, model })
    if (admission.status !== 200 || admission.answer === null) {
      log(`refused ${provider} ${model}: the office answered ${String(admission.status)} when asked to admit it`)
      refuseTheRequest(res, 502, 'office-unreachable', 'The provider router could not ask the office whether to carry this request.')
      return
    }
    if (admission.answer.admitted !== true) {
      const code = String(admission.answer.code)
      log(`refused ${provider} ${model}: ${code}`)
      refuseTheRequest(res, code === 'invalid-token' ? 401 : 403, code, String(admission.answer.says))
      return
    }
    const slot = all[0]
    const headers = { authorization: `Bearer ${slot.key}` }
    if (method === 'POST') headers['content-type'] = 'application/json'
    let answer = null
    try {
      answer = await fetch(`${upstreams[provider] ?? THE_ROUTED_PROVIDERS[provider].upstream}${path}`, {
        method,
        headers,
        ...(method === 'POST' ? { body: JSON.stringify(asked.body ?? null) } : {}),
      })
    } catch {
      answer = null
    }
    if (answer === null) {
      log(`failed ${provider} ${model} through ${slot.id} ${aSecretsMark(slot.key)}: the provider could not be reached`)
      refuseTheRequest(res, 502, 'provider-unreachable', 'The provider router could not reach the provider.')
      return
    }
    const parts = []
    if (answer.body !== null) {
      for await (const part of answer.body) parts.push(Buffer.from(part))
    }
    const settled = await askTheOffice('/api/provider-router/receipts', {
      id: `rr_${randomBytes(18).toString('base64url')}`, token: admission.answer.id, slot: slot.id, status: answer.status, model,
      usage: theUsageIn(Buffer.concat(parts).toString('utf8'), provider),
    })
    log(`carried ${provider} ${model} through ${slot.id} ${aSecretsMark(slot.key)}: ${String(answer.status)}, receipt ${settled.status === 201 ? 'settled' : `not settled (the office answered ${String(settled.status)})`}`)
    const retryAfter = answer.headers.get('retry-after')
    res.writeHead(answer.status, {
      'content-type': answer.headers.get('content-type') ?? 'application/json',
      ...(retryAfter === null ? {} : { 'retry-after': retryAfter }),
    })
    res.end(Buffer.concat(parts))
  }

  async function open(name) {
    if (typeof name !== 'string' || !SANDBOX_NAME.test(name) || name === '.' || name === '..') {
      throw new Error(`${JSON.stringify(name)} is not a sandbox name, so the provider router opens no socket for it.`)
    }
    const folder = join(sandboxes, '.run', name, 'provider-router')
    let found = null
    try { found = lstatSync(folder) } catch { found = null }
    if (found === null || !found.isDirectory()) throw new Error(`Sandbox ${name} has no provider router folder: start the sandbox again while the router is on.`)
    chmodSync(folder, 0o700)
    const socket = join(folder, THE_ROUTER_SOCKET_NAME)
    if (opened.has(name)) {
      if (await theSocketAnswers(socket)) return socket
      await new Promise((done) => opened.get(name).close(() => done(undefined)))
      opened.delete(name)
    }
    await clearAStaleSocket(socket)
    const server = createServer(handleACarry)
    await listenOn(server, socket)
    opened.set(name, server)
    log(`opened ${socket}`)
    return socket
  }

  async function start() {
    aFolderOfItsOwn(theRouterControlFolder(sandboxes))
    const socket = theRouterControlSocket(sandboxes)
    await clearAStaleSocket(socket)
    control = createServer((req, res) => {
      if (req.method === 'GET' && req.url === '/slots') {
        req.resume()
        let held = null
        try { held = theSlotsHeld() } catch (error) {
          refuseTheRequest(res, 503, 'slots-unreadable', error instanceof Error ? error.message : 'The provider router could not read its key slots.')
          return
        }
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(held))
        return
      }
      if (req.method === 'POST' && req.url === '/go-fallback') {
        theBodyOf(req).then((raw) => {
          const asked = raw === null ? null : JSON.parse(raw.toString('utf8'))
          const all = theSlots().filter((slot) => slot.provider === 'opencode-go')
          if (typeof asked?.agent !== 'string' || asked.agent === '' || everySlotIsUsedUp('Go', all) === null) {
            refuseTheRequest(res, 409, 'no-fallback', 'The router cannot record that fallback.')
            return
          }
          const id = writeTheGoSwitch(switchLog, { at: new Date(now()).toISOString(), event: 'dsh', agent: asked.agent, slots: all })
          res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id }))
        }).catch(() => refuseTheRequest(res, 500, 'router-failed', 'The provider router could not record the fallback.'))
        return
      }
      if (req.method === 'POST' && req.url === '/carry') {
        theBodyOf(req).then(async (raw) => {
          let asked = null
          try { asked = raw === null ? null : JSON.parse(raw.toString('utf8')) } catch { asked = null }
          if (asked === null || typeof asked !== 'object') {
            refuseTheRequest(res, 400, 'not-a-request', 'The control socket takes one JSON request to carry.')
            return
          }
          await carryForATool(asked, res)
        }).catch((error) => refuseTheRequest(res, 500, 'router-failed', error instanceof Error ? error.message : String(error)))
        return
      }
      if (req.method !== 'POST' || req.url !== '/open') { req.resume(); refuseTheRequest(res, 404, 'not-routed', 'The control socket answers only POST /open, POST /carry and GET /slots.'); return }
      theBodyOf(req).then(async (raw) => {
        let asked = null
        try { asked = raw === null ? null : JSON.parse(raw.toString('utf8')) } catch { asked = null }
        await open(asked?.sandbox)
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ opened: asked.sandbox }))
      }).catch((error) => refuseTheRequest(res, 409, 'not-opened', error instanceof Error ? error.message : String(error)))
    })
    await listenOn(control, socket)
    for (const slot of theSlots()) log(`holds slot ${slot.id} for ${slot.provider}, key ${aSecretsMark(slot.key)}`)
    log(`listening on ${socket}`)
  }

  async function close() {
    const servers = [...opened.values(), ...(control === null ? [] : [control])]
    opened.clear()
    control = null
    await Promise.all(servers.map((server) => new Promise((done) => { server.closeAllConnections(); server.close(() => done(undefined)) })))
  }

  return { start, open, close }
}

/** The value after a flag, or undefined. */
function theFlag(args, name) {
  const at = args.indexOf(name)
  return at === -1 ? undefined : args[at + 1]
}

async function main(args) {
  const command = args[0]
  const sandboxes = theFlag(args, '--sandboxes')
  if ((command !== 'serve' && command !== 'unit') || sandboxes === undefined) {
    process.stderr.write('Use: node tools/provider-router.mjs serve --sandboxes <dir> [--api <address>], or unit --sandboxes <dir>.\n')
    return 2
  }
  if (command === 'unit') {
    // The office the unit names is read from the stable unit and checked with that office, by the module install.mjs
    // uses, so the printed unit is the one install writes. Imported here, so serve loads none of it.
    const { theOfficeTheRouterServes } = await import('./key-router/the-office-the-router-serves.mjs')
    const served = await theOfficeTheRouterServes()
    if (served.office === null) {
      process.stderr.write(`No unit was printed: ${served.says}.\n`)
      return 1
    }
    process.stdout.write(theProviderRouterUnit({ node: process.execPath, router: fileURLToPath(import.meta.url), sandboxes: resolve(sandboxes), office: served.office }))
    return 0
  }
  loadEnvFileIntoProcess(ENV_FILE)
  const api = whereIsTheApiForACommand(theFlag(args, '--api'))
  const keys = keysPathFrom(process.env)
  let officeKey = null
  try { officeKey = JSON.parse(readFileSync(keys, 'utf8')).office } catch { officeKey = null }
  if (typeof officeKey !== 'string' || officeKey === '') {
    process.stderr.write(`The office's key file ${keys} holds no office key, so the provider router cannot ask the office anything.\n`)
    return 2
  }
  const file = theKeySlotsFile(homedir())
  const router = createProviderRouter({ sandboxes: resolve(sandboxes), slots: () => readTheKeySlots(file), office: { api, key: officeKey }, pinFile: theGoPinFile(file), switchLog: theGoSwitchLogFile(file) })
  await router.start()
  const stop = () => { router.close().then(() => process.exit(0), () => process.exit(1)) }
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
  return null
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { if (code !== null) process.exit(code) }, (error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  })
}
