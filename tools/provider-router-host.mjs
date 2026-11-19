// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LAUNCHER'S PART OF THE PROVIDER ROUTER, on the host. tools/sandbox.mjs calls these five, and only while
 * MOLE_OFFICE_PROVIDER_ROUTER is on: with it off, theRoutedKeysLeftOut answers the very selection it was given,
 * theStartWhenEveryGoSlotIsUsedUp answers null and the others are not called, so the env file, the mounts, the requests
 * and the run's runtime are what they were.
 *
 *   aRouterFolderFor                  the sandbox's router folder, of mode 0700, which up mounts read-only into the container
 *   theRoutedKeysLeftOut              every API key line left out of an env file, and an exec that names one refused
 *   theStartWhenEveryGoSlotIsUsedUp   before a run on Go is filed: whether every Go slot is used up, and if so the run's
 *                                     dsh row or why it has none, in one sentence
 *   theRunSaysWhyItIsOnDsh            that sentence written on the run that went to dsh
 *   theRouterIsDown                   the one sentence for a start the router must carry while it does not answer
 *   whyARoutedRunCannotStart          before a routed run is filed: each thing the router cannot do, then whether it answers
 *   whetherTheRouterIsDown            before an isolated exec or a check view the router must carry: whether it answers
 *   theRouterLinesForARun             a routed run's two lines: its token from the office, and where the router's socket is
 */
import { chmodSync, existsSync, lstatSync, mkdirSync } from 'node:fs'
import { request } from 'node:http'
import { join } from 'node:path'
import {
  THE_API_KEY_NAMES, THE_ROUTED_PROVIDERS, THE_ROUTER_FOLDER_INSIDE, THE_ROUTER_SETTING, THE_ROUTER_SOCKET_NAME, THE_ROUTER_VARIABLE,
  theProviderRouterIsOn, theRoutedProviderOf, theRouterControlSocket, whyTheRouterDoesNotCarry,
} from '../src/config/provider-router.mjs'

const ROUTER_FOLDER = 'provider-router'

/**
 * THE SANDBOX'S ROUTER FOLDER, made or set back to mode 0700. The router opens the sandbox's socket in it, and up mounts
 * it read-only into the container. A link in its place is refused.
 * @param {string} hostOnly the sandbox's host-only folder
 */
export function aRouterFolderFor(hostOnly) {
  const folder = join(hostOnly, ROUTER_FOLDER)
  let found = null
  try { found = lstatSync(folder) } catch { found = null }
  if (found !== null && !found.isDirectory()) {
    throw new Error(`${folder} is a link or a file, and the provider router's folder must be a folder of its own. Nothing was mounted.`)
  }
  mkdirSync(folder, { recursive: true, mode: 0o700 })
  chmodSync(folder, 0o700)
  return folder
}

/**
 * THE ENV FILE'S LINES WITH EVERY API KEY LEFT OUT, while the router is on: each of THE_API_KEY_NAMES, the routed
 * providers' keys and the name Codex reads an OpenAI key from. An exec that names one is refused, as the router holds
 * them. `keysLeftOut` names the keys that were left out, and `says` says so. With the router off, the very selection it
 * was given, and no refusal.
 * @template {{ lines: string[], says: string }} S
 * @param {S} selection
 * @param {readonly string[] | undefined} names the secrets an exec named, if it named any
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ selection: S & { keysLeftOut?: string[] }, refusal: string | null }}
 */
export function theRoutedKeysLeftOut(selection, names, env = process.env) {
  if (!theProviderRouterIsOn(env)) return { selection, refusal: null }
  const handed = (name) => selection.lines.some((line) => line.startsWith(`${name}=`))
  const kept = selection.lines.filter((line) => !THE_API_KEY_NAMES.some((name) => line.startsWith(`${name}=`)))
  const named = (names ?? []).filter((name) => THE_API_KEY_NAMES.includes(name))
  if (named.length > 0) {
    return {
      selection: { ...selection, lines: kept },
      refusal: `${named.join(' and ')} is held by the provider router while ${THE_ROUTER_SETTING} is on, so no exec is given it. Nothing was started.`,
    }
  }
  if (kept.length === selection.lines.length) return { selection, refusal: null }
  const keysLeftOut = THE_API_KEY_NAMES.filter(handed)
  return {
    selection: { ...selection, lines: kept, keysLeftOut, says: `${selection.says} ${keysLeftOut.join(' and ')} was left out, because the provider router holds every API key while ${THE_ROUTER_SETTING} is on.` },
    refusal: null,
  }
}

/**
 * Asks the router, on its control socket, to open the sandbox's socket. Answers its status, or null when it did not
 * answer, with the router's own words when it refused.
 */
function theRouterOpens(control, name) {
  return new Promise((done) => {
    const body = JSON.stringify({ sandbox: name })
    const asked = request({ socketPath: control, method: 'POST', path: '/open', headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) } }, (answer) => {
      const parts = []
      answer.on('data', (part) => parts.push(part))
      answer.on('end', () => {
        let said = null
        try { said = JSON.parse(Buffer.concat(parts).toString('utf8'))?.error?.message ?? null } catch { said = null }
        done({ status: answer.statusCode ?? 0, said: typeof said === 'string' ? said : null })
      })
      answer.on('error', () => done({ status: null, said: null }))
    })
    asked.on('error', () => done({ status: null, said: null }))
    asked.end(body)
  })
}

/** How long a start waits for the router to say which slots are used up, so that a router that never answers cannot hold it. */
const THE_LONGEST_WAIT_FOR_THE_SLOTS_MS = 5_000

/** What the router's control socket answers to GET /slots, or why it could not be asked, with a null status. */
function theSlotsTheRouterHolds(control) {
  return new Promise((done) => {
    const asked = request({ socketPath: control, method: 'GET', path: '/slots', timeout: THE_LONGEST_WAIT_FOR_THE_SLOTS_MS }, (answer) => {
      const parts = []
      answer.on('data', (part) => parts.push(part))
      answer.on('end', () => done({ status: answer.statusCode ?? 0, text: Buffer.concat(parts).toString('utf8') }))
      answer.on('error', (error) => done({ status: null, why: `its answer broke off (${error.message})` }))
    })
    asked.on('timeout', () => asked.destroy(Object.assign(new Error(`it did not answer within ${String(THE_LONGEST_WAIT_FOR_THE_SLOTS_MS / 1000)} seconds`), { code: 'TIMEOUT' })))
    asked.on('error', (error) => {
      const code = /** @type {{ code?: string }} */ (error).code
      done({ status: null, noRouter: code === 'ENOENT' || code === 'ECONNREFUSED', why: code === 'ENOENT' || code === 'ECONNREFUSED' ? 'no router listens there' : code === 'TIMEOUT' ? error.message : `it could not be reached (${error.message})` })
    })
    asked.end()
  })
}

/** The run-models door's answer for an agent's run on a program, with the model it names if it names one. */
function theRunModelsPath(agent, runtime, model) {
  const query = new URLSearchParams({ place: 'builder', runtime })
  if (typeof model === 'string' && model !== '') query.set('model', model)
  return `/api/office/run-models/for/${encodeURIComponent(agent)}?${query}`
}

/**
 * A START ON OPENCODE GO WHILE EVERY GO SLOT IS USED UP, asked before the run is filed. The rule of 16 October
 * 2026 that "when all are used up, the run falls back to dsh". The router is asked on its control socket, and the
 * office is asked for the dsh row in Casting that runs the same native model through DeepSeek.
 *
 * NULL, AND NOTHING CHANGES, while the router is off, for a run not on OpenCode, for one the router does not carry on Go,
 * and while a Go slot is free. Otherwise `says` is one sentence: every used-up slot, the first reset, and either that the
 * run starts on dsh, with `dsh` the runtime and model to file it with, or why it cannot. Then `dsh` is null, and the run
 * starts on Go and the router refuses its requests until the first reset, as before. When no router listens, `dsh` is
 * null too, and `says` says that the launcher's router check will stop the start and nothing will be started. When the
 * router answers but its answer cannot be read, `dsh` is null too, and `says` says the run starts on Go as it was asked.
 * If the fallback cannot be recorded, it refuses the start. A run already going is never asked about.
 * @param {{ sandboxes: string, agent: string, runtime: string | undefined, model: string | undefined, brief: string | undefined,
 *   ask: (path: string) => Promise<{ status: number | null, body?: any, why?: string }>, env?: Record<string, string | undefined> }} given
 * @returns {Promise<{ says: string, dsh: { runtime: 'dsh', model: string } | null } | { refusal: string } | null>}
 */
export async function theStartWhenEveryGoSlotIsUsedUp({ sandboxes, agent, runtime, model, brief, ask, env = process.env }) {
  if (!theProviderRouterIsOn(env) || runtime !== 'opencode') return null
  const asked = await ask(theRunModelsPath(agent, runtime, model))
  const go = asked.status === 200 ? asked.body?.selection : undefined
  if (go?.native == null || go.casting == null || theRoutedProviderOf(go) !== 'opencode-go') return null
  const control = theRouterControlSocket(sandboxes)
  const unasked = (why, noRouter = false) => ({
    says: noRouter
      ? `The provider router on ${control} could not be asked which ${THE_ROUTED_PROVIDERS['opencode-go'].named} slots are used up, because ${why}, so the launcher's router check will stop this start and nothing will be started on ${THE_ROUTED_PROVIDERS['opencode-go'].named} or on dsh.`
      : `The provider router on ${control} could not be asked which ${THE_ROUTED_PROVIDERS['opencode-go'].named} slots are used up, because ${why}, so this run starts on ${THE_ROUTED_PROVIDERS['opencode-go'].named} as it was asked.`,
    dsh: null,
  })
  const read = await theSlotsTheRouterHolds(control)
  if (read.status === null) return unasked(read.why, read.noRouter === true)
  let held = null
  try { held = read.status === 200 ? JSON.parse(read.text)?.providers : null } catch { held = null }
  const slots = held?.['opencode-go']
  if (slots == null || typeof slots.everyUsedUp !== 'boolean' || (slots.everyUsedUp && typeof slots.says !== 'string') || !Array.isArray(held.deepseek?.slots)) {
    return unasked(`its answer could not be read (it answered ${String(read.status)})`)
  }
  if (!slots.everyUsedUp) return null
  const says = slots.says
  const stays = (why) => ({ says: `${says}, and this run cannot go to dsh, because ${why}, so it starts on ${THE_ROUTED_PROVIDERS['opencode-go'].named} and its requests are refused until the first reset.`, dsh: null })
  if (typeof brief !== 'string' || brief === '') return stays('a dsh run starts from a brief and this start names none')
  if (held.deepseek.slots.length === 0) return stays(`the provider router holds no ${THE_ROUTED_PROVIDERS.deepseek.named} key slot`)
  const nativeModel = go.native.model
  const theRow = await ask(theRunModelsPath(agent, 'dsh', `${THE_ROUTED_PROVIDERS.deepseek.nativeProvider}/${nativeModel}`))
  const dsh = theRow.status === 200 ? theRow.body?.selection : undefined
  if (theRow.status !== 200) {
    const said = theRow.status === null ? String(theRow.why) : String(theRow.body?.error ?? `it answered ${String(theRow.status)}`).replace(/\.\s*$/u, '')
    return stays(`the office did not give the dsh row that runs ${nativeModel} (${said})`)
  }
  if (dsh?.casting == null || dsh.native?.model !== nativeModel || theRoutedProviderOf(dsh) !== 'deepseek' || typeof dsh.model !== 'string') {
    return stays(`no dsh row in force in Casting runs ${nativeModel} through ${THE_ROUTED_PROVIDERS.deepseek.named}`)
  }
  // The router holds the keys and their current limit state, so it writes the fallback line without the launcher reading keys.
  const logged = await new Promise((done) => {
    const body = JSON.stringify({ agent })
    const call = request({ socketPath: control, method: 'POST', path: '/go-fallback', timeout: THE_LONGEST_WAIT_FOR_THE_SLOTS_MS, headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) } }, (answer) => {
      const parts = []
      answer.on('data', (part) => parts.push(part))
      answer.on('end', () => {
        let result = null
        try { result = JSON.parse(Buffer.concat(parts).toString('utf8')) } catch { result = null }
        if (answer.statusCode === 200 && typeof result?.id === 'string') done(result.id)
        else done(null)
      })
      answer.on('error', () => done(null))
    })
    call.on('timeout', () => call.destroy(new Error('The provider router did not record the fallback in time.')))
    call.on('error', () => done(null))
    call.end(body)
  })
  if (logged === null) return { refusal: 'The provider router could not record the Go fallback. Nothing was started.' }
  return { says: `${says}, so this run starts on dsh with ${dsh.model} in place of ${THE_ROUTED_PROVIDERS['opencode-go'].named} with ${go.model}, recorded as ${logged} in the Go switch log.`, dsh: { runtime: 'dsh', model: dsh.model } }
}

/**
 * THE SENTENCE ON THE RUN THAT WENT TO DSH, at `extra.startedOnDshInPlaceOfGo`, kept with every other key of `extra`.
 * Answers null when it is written, or the office's words when it is not.
 * @param {string} run
 * @param {string} says
 * @param {(path: string, options?: { method: string, body: unknown }) => Promise<{ status: number | null, body?: any, why?: string }>} ask
 * @returns {Promise<string | null>}
 */
export async function theRunSaysWhyItIsOnDsh(run, says, ask) {
  const path = `/api/records/${encodeURIComponent(run)}`
  const read = await ask(path)
  if (read.status !== 200) return read.status === null ? String(read.why) : String(read.body?.error ?? `the office answered ${String(read.status)}`)
  const extra = (read.body?.record ?? read.body)?.data?.extra
  const written = await ask(path, { method: 'PATCH', body: { dataPatch: { extra: { ...(extra !== null && typeof extra === 'object' ? extra : {}), startedOnDshInPlaceOfGo: says } } } })
  if (written.status === 200) return null
  return written.status === null ? String(written.why) : String(written.body?.error ?? `the office answered ${String(written.status)}`)
}

/**
 * THE ONE SENTENCE FOR A START THE ROUTER MUST CARRY WHILE IT DOES NOT ANSWER on its control socket: an ordinary run, an
 * isolated exec or a check view. Every such refusal is these words.
 * @param {string} sandboxes
 */
export function theRouterIsDown(sandboxes) {
  return `The provider router does not answer on its control socket ${theRouterControlSocket(sandboxes)}, so nothing was started.`
}

/**
 * THE ONE SENTENCE FOR A CODEX RUN WITH NO LOGIN while the router is on: an ordinary run, an isolated exec or a check
 * view. The router carries no Codex route, and theRoutedKeysLeftOut hands no run Codex's keys, so such a run would start
 * with no key and fail at the vendor. `where` says which login is not there, and begins the sentence. It is one sentence,
 * since the launcher shows the first sentence of a refusal and keeps the rest in its details file.
 * @param {string} where
 */
export function aCodexRunHasNoKeyThroughTheRouter(where) {
  return `${where}, and the provider router does not carry Codex on an API key yet, so nothing was started: sign Codex in with its login, or set ${THE_ROUTER_SETTING} off.`
}

/**
 * WHETHER THE ROUTER IS DOWN, asked with GET /slots on its control socket, which changes nothing: theRouterIsDown's
 * sentence when nothing answers there, within the slots' wait, and null when anything answers, whatever its status.
 * @param {string} sandboxes
 * @returns {Promise<string | null>}
 */
export async function whetherTheRouterIsDown(sandboxes) {
  return (await theSlotsTheRouterHolds(theRouterControlSocket(sandboxes))).status === null ? theRouterIsDown(sandboxes) : null
}

/**
 * Each thing the router cannot do for a run, read from its selection, its helper and its sandbox's folder alone, in one
 * sentence, or null when there is none. The run's id and the router's answer are asked after.
 */
function whyTheRunCannotBeRouted({ sandboxes, name, runtime, selection, helperSource }) {
  const program = typeof selection?.runtime === 'string' ? selection.runtime : runtime
  const thisRun = typeof program === 'string' ? `this ${program} run` : 'this run'
  if (selection == null || selection.native == null || typeof selection.native.model !== 'string') {
    const theRow = typeof program === 'string' ? `the ${program} row` : 'its row'
    return `The provider router takes a run's models only from its Casting row's native model, and ${thisRun} has no Casting row with one. Give ${theRow} in Casting its native model, or set ${THE_ROUTER_SETTING} to off. Nothing was started.`
  }
  if (selection.casting == null) {
    return `The provider router takes a run's models only from its Casting row, and ${thisRun} was not started from a Casting row. Start it from its row, or set ${THE_ROUTER_SETTING} to off. Nothing was started.`
  }
  if (theRoutedProviderOf(selection) === null) return `${whyTheRouterDoesNotCarry(selection)} Nothing was started.`
  if (!helperSource.includes(THE_ROUTER_VARIABLE)) {
    return "This sandbox's helper is older than the provider router and cannot open its bridge. Refresh the sandbox's launcher, then start the run again. Nothing was started."
  }
  if (!existsSync(join(sandboxes, '.run', name, ROUTER_FOLDER))) {
    return `Sandbox ${name} was started while ${THE_ROUTER_SETTING} was off, so it has no provider router folder. Stop it and start the sandbox again. Nothing was started.`
  }
  return null
}

/**
 * BEFORE A RUN THE ROUTER MUST CARRY IS FILED: each thing theRouterLinesForARun would refuse from the selection, the
 * helper and the sandbox's folder, then whether the router answers. Answers the sentence that refuses the start, or null.
 * Nothing is asked of the office and nothing is opened.
 * @param {{ sandboxes: string, name: string, runtime: string | undefined, selection: any, helperSource: string }} given
 * @returns {Promise<string | null>}
 */
export async function whyARoutedRunCannotStart(given) {
  return whyTheRunCannotBeRouted(given) ?? await whetherTheRouterIsDown(given.sandboxes)
}

/**
 * A ROUTED RUN'S TWO LINES WHILE THE ROUTER IS ON, for a run on any route of THE_ROUTED_PROVIDERS: its token from the
 * office under the provider key's name, and the provider, the runtime and where the router's socket is inside the
 * container. The provider and the runtime come from the one selection, so the line names the route the host chose. Each
 * thing the router cannot do is refused before the office is asked for a token.
 * @param {string[]} lines the env file's lines, added to
 * @param {{ sandboxes: string, name: string, run: string | undefined, runtime?: string, selection: any, helperSource: string,
 *   ask: (path: string, options: { method: string, body: unknown }) => Promise<{ status: number | null, body?: any, why?: string }>,
 *   refuse: (sentence: string, code?: number) => never }} given
 */
export async function theRouterLinesForARun(lines, { sandboxes, name, run, runtime, selection, helperSource, ask, refuse }) {
  const why = whyTheRunCannotBeRouted({ sandboxes, name, runtime, selection, helperSource })
  if (why !== null) return refuse(why, 2)
  const provider = /** @type {string} */ (theRoutedProviderOf(selection))
  const program = typeof selection.runtime === 'string' ? selection.runtime : runtime
  if (typeof run !== 'string' || run === '') return refuse(`The provider router gives a credential only to a filed run, and ${typeof program === 'string' ? `this ${program} run` : 'this run'} has none. Nothing was started.`, 2)
  // Asked first with the slots' wait, because the open has none: a start on a run filed before it, which no early check
  // asked, is refused within the wait by a socket nothing answers on, and is not held.
  const down = await whetherTheRouterIsDown(sandboxes)
  if (down !== null) return refuse(down, 2)
  const opened = await theRouterOpens(theRouterControlSocket(sandboxes), name)
  if (opened.status === null) return refuse(theRouterIsDown(sandboxes), 2)
  if (opened.status !== 200) return refuse(`The provider router did not open the socket of sandbox ${name}${opened.said === null ? ` (it answered ${String(opened.status)})` : `: ${opened.said.replace(/\.\s*$/u, '')}`}. Nothing was started.`, 2)
  const answer = await ask('/api/provider-router/run-tokens', { method: 'POST', body: { run, casting: { id: selection.casting.id, revision: selection.casting.revision } } })
  if (answer.status !== 201) {
    const said = answer.status === null ? `The office did not answer when asked for this run's router credential (${String(answer.why)}).` : String(answer.body?.error ?? `The office answered ${String(answer.status)} when asked for this run's router credential.`)
    return refuse(`${said} Nothing was started.`.replace(/(Nothing was (issued|started)\.) Nothing was started\.$/u, '$1'), 2)
  }
  const token = answer.body?.token
  if (typeof token !== 'string' || !/^mrt_[A-Za-z0-9_-]{43}$/u.test(token)) return refuse("The office's answer held no router credential. Nothing was started.", 2)
  lines.push(`${THE_ROUTED_PROVIDERS[provider].keyName}=${token}`, `${THE_ROUTER_VARIABLE}=${JSON.stringify({ provider, runtime: selection.runtime, socket: `${THE_ROUTER_FOLDER_INSIDE}/${THE_ROUTER_SOCKET_NAME}` })}`)
}
