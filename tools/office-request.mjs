// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE OFFICE'S OWN REQUEST, SHARED BY dsh AND CODEX: office_request. Problem jgTM-z-63Vls, 28 September 2026.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * dsh's subprocess guard (@deepseek-ai/dsh-subprocess, SENSITIVE_ENV_PATTERN /KEY|PASSWORD|SECRET|TOKEN/i) leaves every
 * variable whose name matches out of the commands a dsh agent runs. So MOLE_AGENT_KEY never reached a DeepSeek worker's
 * curl, every write it tried to the office was refused for want of a key, and the workers went looking for a key in
 * files. The guard is deliberate, it keeps the harness's own secrets out of what the model runs, and it stays.
 *
 * This tool runs INSIDE THE dsh PROCESS, which holds the run's key, and asks the office for the model. So the key never
 * reaches a command, a file or the model's context. It is one general tool rather than a set of narrow ones (as in
 * message KIfELcvSJ12h): the office already refuses by card what a worker may not do, and a narrow set would only be a
 * second list of what is allowed.
 *
 * ---------------------------------------------------------------------------------------
 * ITS FOUR RULES (message KIfELcvSJ12h), each proved in
 * tests/a-dsh-worker-asks-the-office-through-its-own-tool.test.ts
 * ---------------------------------------------------------------------------------------
 *
 *   1. NO REDIRECT IS FOLLOWED. A 3xx answer goes back to the model as it came, so the key never goes where an answer
 *      points.
 *   2. THE PATH IS READ AS THE OFFICE WILL READ IT BEFORE IT IS CHECKED. It must start with /api/, and it may hold no
 *      dot segment, no encoded dot, slash or backslash, no doubled slash, no backslash and no scheme. The request goes
 *      only to the office's own address, host and port, which the model cannot name.
 *   3. NO KEY REACHES THE MODEL. Every run of exactly 64 hex characters in a reply's body, its Location, or an error
 *      line is replaced before the model sees it, since an agent's registration answers a key, and so does a run filed
 *      with a key file. The whole body is replaced BEFORE a long one is cut, so a key that straddles the cut is replaced
 *      too. Whole keeps the other body text unchanged; fields projects only this masked answer. What dsh logs of a
 *      tool's result is this same text.
 *   4. THE TOOL SAYS WHO IT IS. Every request carries the run's own identity from the tool process's environment, built
 *      in the one place every agent's tool builds it (officeHeaders in tools/sandbox-common.mjs). The model sends no
 *      headers at all, so nothing in its body or path can set or override them.
 *
 * ---------------------------------------------------------------------------------------
 * HOW dsh LOADS IT
 * ---------------------------------------------------------------------------------------
 *
 * tools/dsh-hooks/install-profile.mjs writes a small plugin into the office profile, office-tool.mjs, that takes dsh's
 * own defineTool from the profile's packages and hands it to officeToolPlugin in dsh-hooks/office-tool.mjs. This file imports nothing of dsh's,
 * so it runs the same way under its test with a stand-in defineTool.
 */

// IcgsA-OGvbzL: messages hX_qDiISkTCp, xu5mbrN9ucmN and t_YPyiwf07YJ agree to Codex's MCP adapter.
// Step 2 takes the key out of the shell of a Codex worker that starts nothing, once step 1 is proven on a real worker.

import { officeHeaders } from './sandbox-common.mjs'
import { whereIsTheApi } from './where-is-the-api.mjs'
import { theEnvironmentsAddressIsForAnotherCopy } from '../src/config/settings.mjs'
import { aRunSaysItIsFinished, FINISHED_STATES, THE_LONGEST_FINISH_WAIT_MS } from '../src/config/finished.mjs'
import { projectOfficeAnswer, refuseOfficeProjection, validateOfficeFields } from './office-answer-fields.mjs'
import { WHEN_TO_SEND_A_LEAD } from '../src/shared/when-to-send-a-lead.mjs'
import { A_KEY_SHOWN_AS, withoutKeys } from '../src/shared/a-key-in-words.mjs'

/** The tool's name, as the model calls it. */
export const OFFICE_REQUEST = 'office_request'

/** The methods it sends. */
export const THE_METHODS = Object.freeze(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])

/** The methods that write: a refusal of one of them carries A_REFUSED_WRITE. */
const THE_WRITES = Object.freeze(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * THE ONE PATH FOR A REFUSED WRITE (problem fO_gBrFz9Ax9; scope 1vBcuEtghSIh and hquhMXN0XZpJ). A worker writes
 * to the office only through this tool. A write the office refused, or this tool refused, ends the step with the refusal
 * named unless it is fixed and sent again here; it is never sent by a helper of the worker's own (problem HSSM8CMh4IWE).
 * Every refusal of a write carries these words, so a model reads them where it reads the refusal.
 */
export const A_REFUSED_WRITE =
  'This write was refused. Fix it and send it again through office_request, or end the step and name the refusal; never send it another way.'

/**
 * WHETHER A REQUEST WRITES, from its method in any case: a model may send 'patch'.
 * @param {unknown} method
 */
export const aWrite = (method) => THE_WRITES.includes(String(method ?? '').toUpperCase())

/** WHAT A KEY IN A REPLY IS REPLACED BY, AND THE REPLACING (rule 3). They are in src/shared/a-key-in-words.mjs. */
export { A_KEY_SHOWN_AS, withoutKeys }

/** The most of a reply's body handed to the model, in characters, counted after its keys are replaced; the rest is said to be cut. */
export const THE_LONGEST_REPLY = 60_000

/** How long one request may take. */
export const THE_LONGEST_WAIT_MS = 60_000

/**
 * HOW LONG A WRITE THAT MAY SEAL A RUN MAY TAKE. It is declared in src/config/finished.mjs so that the launcher's finish
 * and this tool wait the same five minutes: src/config cannot import tools/, so the constant lives there and this tool
 * re-exports it under this name, keeping every reader and its test as they were. The reason for the five minutes is
 * written where it is declared.
 */
export { THE_LONGEST_FINISH_WAIT_MS }

/**
 * WHETHER ONE BODY OF A REQUEST SAYS THE RUN FINISHED, as the office reads it: aRunSaysItIsFinished, declared once in
 * src/config/finished.mjs (refusal 4sdgL7K5N_X9). A body that is absent, or is not a JSON object, says nothing.
 * @param {unknown} body
 * @returns {boolean}
 */
function thisBodySaysTheRunFinished(body) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return false
  return aRunSaysItIsFinished(/** @type {Record<string, unknown>} */ (body))
}

/**
 * WHETHER A REQUEST MAY MAKE THE OFFICE SEAL A RUN, from the request alone: the record door seals when a write leaves
 * a session saying its work is finished (whetherThisWriteFinishesTheRun in src/server/lib/records/served-doors.ts),
 * on a PATCH of a record or on a POST that files one, through dataPatch or a whole data replacement. The finish test is
 * aRunSaysItIsFinished: the state "finished" first, then a close the run wrote itself. The write may be this run's
 * own finish, another run's finish by its authorized starter, or a run filed already finished.
 *
 * A PATCH IS READ ON BOTH BODIES, AS THE RECORD DOOR READS IT. whetherThisWriteFinishesTheRun checks dataPatch and
 * then data, and either one saying finished is enough, so this reads both too.
 *
 * TWO CONSERVATIVE CLASSIFICATIONS, NOT CLAIMS THAT A SEAL HAPPENS. A finished state that also carries a went-stale
 * close is finish-shaped under aRunSaysItIsFinished, but runSubmitsWork refuses to seal any data whose close is
 * went-stale. A PATCH carrying both data and dataPatch is refused by the HTTP door's schema before the write path
 * runs (src/server/api/records.ts), and patchRecord's own guard refuses it after its finish check. Neither shape is
 * established as a write that seals, and this function does not claim one does. It takes the longer wait rather than
 * miss a possible expensive request; that extra wait matters only if the response stalls, and a normal refusal or
 * answer returns as usual.
 *
 * THE TOOL CANNOT SEE THE STORED ROW, so a finish-shaped write the office in the end does not seal (a run already
 * released, a records-only submission at a level that seals nothing, a went-stale close) still gets the longer wait.
 * That costs time only when the office does not answer; it never changes what is sent, and a timeout does not say
 * whether the write was stored.
 * @param {{ method: string, path: unknown, body?: unknown }} request
 * @returns {boolean}
 */
export function aWriteThatMaySealARun(request) {
  const method = String(request.method ?? '').toUpperCase()
  if (method !== 'PATCH' && method !== 'POST') return false
  if (typeof request.path !== 'string') return false
  const path = request.path.split(/[?#]/, 1)[0]
  if (method === 'PATCH' ? !/^\/api\/records\/[^/]+$/u.test(path ?? '') : path !== '/api/records') return false
  const body = request.body
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return false
  const held = /** @type {Record<string, unknown>} */ (body)
  if (method === 'POST') return held['kind'] === 'session' && thisBodySaysTheRunFinished(held['data'])
  return thisBodySaysTheRunFinished(held['dataPatch']) || thisBodySaysTheRunFinished(held['data'])
}

/**
 * THE LONGEST WAIT FOR ONE REQUEST, from what the request is and from a caller that names its own. A write that may
 * seal a run gets the finish wait; every other request gets the ordinary one. A caller that caps every request sets
 * both waits, and a caller that raises only the finish sets finishWaitMs alone. A wait that is not a whole number of
 * milliseconds above 0 is refused before anything is sent.
 *
 * `env` is kept in the signature because callers pass the run's environment, as they do to askTheOffice; the seal
 * shape is read from the request alone, so no stored row is read here.
 * @param {{ method: string, path: unknown, body?: unknown }} request
 * @param {Record<string, string | undefined>} [_env]
 * @param {{ waitMs?: number, finishWaitMs?: number }} [given]
 * @returns {number}
 */
export function theLongestWaitFor(request, _env, { waitMs = THE_LONGEST_WAIT_MS, finishWaitMs = THE_LONGEST_FINISH_WAIT_MS } = {}) {
  const theWait = aWriteThatMaySealARun(request) ? finishWaitMs : waitMs
  if (!Number.isSafeInteger(theWait) || theWait <= 0) {
    throw new Error(`The wait was refused, and nothing was sent: it must be a whole number of milliseconds above 0, and it is ${JSON.stringify(theWait)}.`)
  }
  return theWait
}

/**
 * WHERE A REQUEST GOES, OR WHY IT DOES NOT (rule 2). The path is read the way the office will read it before it is
 * checked, and the answer is always on the office's own host and port.
 * @param {string} api the office's address, as whereIsTheApi answers it
 * @param {unknown} path what the model asked for
 * @returns {{ ok: true, url: string } | { ok: false, says: string }}
 */
export function whereTheRequestGoes(api, path) {
  /** @param {string} why */
  const refused = (why) => ({ ok: /** @type {const} */ (false), says: `The path was refused, and nothing was sent: ${why}` })
  if (typeof path !== 'string' || path === '') return refused('it must be a path on the office, starting with /api/.')
  if (!path.startsWith('/api/')) return refused('it must start with /api/, on the office itself; a full address or another host is never asked.')
  if (/[\\\s]/.test(path) || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.includes('://')) {
    return refused('it may hold no scheme, no backslash and no space.')
  }
  const [pathPart] = path.split(/[?#]/, 1)
  if (/%(2e|2f|5c)/i.test(pathPart ?? '')) return refused('it may hold no encoded dot, slash or backslash.')
  if ((pathPart ?? '').includes('//')) return refused('it may hold no doubled slash.')
  if ((pathPart ?? '').split('/').some((segment) => segment === '.' || segment === '..')) return refused('it may hold no dot segment.')
  let office
  let url
  try {
    office = new URL(api)
    url = new URL(path, office)
  } catch {
    return refused('it could not be read as a path on the office.')
  }
  // AND READ BACK THE WAY fetch WILL SEND IT: the same host, the same port, the same path.
  if (url.origin !== office.origin) return refused('it would leave the office.')
  if (url.pathname !== pathPart) return refused('it would be sent as another path than the one asked for.')
  return { ok: true, url: url.href }
}

/**
 * THE RUN'S OWN IDENTITY, from the tool process's environment (rule 4): who, which session, which project, and the
 * office. The key itself is read by officeHeaders, through for-agents/agent-key.mjs, and nowhere else.
 * @param {NodeJS.ProcessEnv} env
 */
export function theRunsIdentity(env = process.env) {
  // THE ADDRESS IS FOR THE SANDBOX'S OWN CHECKOUTS (problem JQ3yaANBi1JC): this tool passes the environment's address on
  // as its own, so it asks the same question whereIsTheApi asks before taking it.
  const refused = theEnvironmentsAddressIsForAnotherCopy(env)
  if (refused !== null) throw new Error(refused)
  return {
    api: whereIsTheApi(env['MOLE_OFFICE_API']),
    agent: env['MOLE_OFFICE_AGENT'] ?? '',
    session: env['MOLE_OFFICE_SESSION'] ?? '',
    workspace: env['MOLE_OFFICE_WORKSPACE'] ?? '',
  }
}

/**
 * @typedef {{ method: string, path: string, body?: unknown, fields?: import('./office-answer-fields.mjs').OfficeFields }} ARequest
 * @typedef {import('./office-answer-fields.mjs').OfficeAnswer} AnAnswer
 */

/** How long the run's record may take to read before its seal goes without a receipt (tools/the-seal-receipt.mjs, condition 4). */
export const THE_LONGEST_SEAL_READ_MS = 2_000

/**
 * WHETHER THIS REQUEST IS THE RUN'S OWN SEAL WITH NO RECEIPT OF ITS OWN (condition 1). The run is the one the tool's
 * environment names; nothing in the body or path chooses it.
 * @param {{ method: string, path: unknown, body?: unknown }} request
 * @param {Record<string, string | undefined>} env
 * @returns {boolean}
 */
export function aSealOfThisRun(request, env) {
  return aWriteThatMaySealThisRun(request, env) && !Object.hasOwn(/** @type {any} */ (request.body).dataPatch, 'usageReceipt')
}

/**
 * WHETHER THIS REQUEST IS THE RUN'S OWN WRITE TO FINISHED, which the office may answer with its seal or with its
 * reminder before the seal. The run is the one the tool's environment names, as for aSealOfThisRun. The finish words
 * are read from FINISHED_STATES, declared once in src/config/finished.mjs, so a word added there is taken here too.
 * @param {{ method: string, path: unknown, body?: unknown }} request
 * @param {Record<string, string | undefined>} env
 * @returns {boolean}
 */
export function aWriteThatMaySealThisRun(request, env) {
  const session = env['MOLE_OFFICE_SESSION']
  if (typeof session !== 'string' || session === '') return false
  if (String(request.method).toUpperCase() !== 'PATCH' || typeof request.path !== 'string') return false
  if (request.path.split(/[?#]/, 1)[0] !== `/api/records/${encodeURIComponent(session)}`) return false
  const body = request.body
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return false
  const dataPatch = /** @type {Record<string, unknown>} */ (body)['dataPatch']
  if (typeof dataPatch !== 'object' || dataPatch === null || Array.isArray(dataPatch)) return false
  return /** @type {readonly string[]} */ (FINISHED_STATES).includes(String(/** @type {Record<string, unknown>} */ (dataPatch)['state'] ?? ''))
}

/**
 * THE SEAL'S BODY WITH THE RUN'S OWN USAGE RECEIPT ADDED, and a sentence saying what was added, or the body as it came
 * and why nothing was, under a decision and the agreements in messages jRM57hUWbIBn and
 * ZbUh96UhT6YQ. The receipt
 * is read by tools/the-seal-receipt.mjs for every runtime, and says in words why it holds no numbers when there is no
 * reader of the runtime's log. It is written over the stored one whole (theReceiptWrittenOver in src/config/usage.mjs),
 * so no stale words or numbers of an earlier write stay beside it. Nothing here stops the seal: every failure sends it
 * as it came.
 * @param {string} url the run's own record, as whereTheRequestGoes answered it
 * @param {Record<string, string>} headers
 * @param {Record<string, any>} body
 * @param {NodeJS.ProcessEnv} env
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<{ body: unknown, added: string }>}
 */
async function withTheRunsOwnReceipt(url, headers, body, env, fetchImpl) {
  /** @param {string} why */
  const without = (why) => ({ body, added: `No usage receipt went with the seal: ${why}` })
  let record
  try {
    const read = await fetchImpl(url.split(/[?#]/, 1)[0] ?? url, { method: 'GET', headers, redirect: 'manual', signal: AbortSignal.timeout(THE_LONGEST_SEAL_READ_MS) })
    if (read.status !== 200) return without(`reading the run's own record was answered ${String(read.status)}.`)
    const said = await read.json()
    record = said?.record ?? said
  } catch {
    return without(`the run's own record could not be read within ${String(THE_LONGEST_SEAL_READ_MS)} ms.`)
  }
  try {
    const { theSealsReceipt } = await import('./the-seal-receipt.mjs')
    const { aReceiptHoldsNumbers, theReceiptWrittenOver } = await import('../src/config/usage.mjs')
    const read = theSealsReceipt({ record, env })
    // ONE WRITER (answer k0eknvS08jLE, 2): the seal's receipt replaces the stored one whole, unless it has no
    // numbers and the stored one has some, which then stays with these words added.
    const stored = record?.data?.usageReceipt
    const kept = !aReceiptHoldsNumbers(read.receipt) && aReceiptHoldsNumbers(stored)
    return {
      body: { ...body, dataPatch: { ...body['dataPatch'], usageReceipt: theReceiptWrittenOver(stored, read.receipt) } },
      added: kept ? `${read.added} The run's record already held numbers, so they were kept, and only these words were added to its receipt.` : read.added,
    }
  } catch (error) {
    return without(`reading the run's own log failed (${error instanceof Error ? error.name : 'no reason given'}).`)
  }
}


/**
 * Validate the request before a transport hook may acknowledge or read mail.
 * The HTTP sender uses this same guard, so local refusals keep one meaning.
 * @param {ARequest} request
 * @param {{ env?: NodeJS.ProcessEnv, longestReply?: number }} [options]
 */
export function prepareOfficeRequest(request, { env = process.env, longestReply = THE_LONGEST_REPLY } = {}) {
  const method = String(request.method ?? '').toUpperCase()
  if (!Number.isSafeInteger(longestReply) || longestReply < THE_LONGEST_REPLY) {
    throw new Error(`The longest reply was refused, and nothing was sent: it must be a whole number of characters, at least ${String(THE_LONGEST_REPLY)}.`)
  }
  if (!THE_METHODS.includes(method)) throw new Error(`The method was refused, and nothing was sent: it must be one of ${THE_METHODS.join(', ')}.`)
  /** @param {string} says */
  const refused = (says) => new Error(aWrite(method) ? `${says} ${A_REFUSED_WRITE}` : says)
  const fields = validateRequestFields(request.fields, method)
  let who
  try {
    who = theRunsIdentity(env)
  } catch (error) {
    throw refused(error instanceof Error ? error.message : String(error))
  }
  if (who.agent === '' || who.session === '' || who.workspace === '') {
    throw refused(
      'This run does not say who it is: MOLE_OFFICE_AGENT, MOLE_OFFICE_SESSION and MOLE_OFFICE_WORKSPACE are set by ' +
        'the runner, and one is missing. Nothing was sent.',
    )
  }
  const where = whereTheRequestGoes(who.api, request.path)
  if (!where.ok) throw refused(where.says)
  const sendsABody = request.body !== undefined && method !== 'GET' && method !== 'DELETE'
  if (sendsABody && typeof request.body === 'string') {
    throw refused(
      'The body was refused, and nothing was sent: it reached office_request as a string, as its caller sent it, ' +
        'and this tool never turns a body into a string. Send the body as a JSON object, not as JSON text in quotes.',
    )
  }
  return { method, who, where, sendsABody, fields }
}

/**
 * THE ONE SENTENCE A WRITE IS ANSWERED WITH WHEN THE OFFICE DID NOT ANSWER IT, with what stopped the wait. It is here
 * once, and tests/a-finish-waits-past-the-ordinary-limit.test.ts reads it from here (refusal 4sdgL7K5N_X9).
 * @param {string} why
 */
export const aWriteThatDidNotAnswer = (why) =>
  `The office did not answer (${why}), so this write may or may not be stored. Read it back through office_request before you send it again; never send it another way.`

/**
 * ONE REQUEST TO THE OFFICE, as the run. Answers the status, the Location when there is one, and the body as text,
 * with every key replaced, then optional local fields projection. Absent fields keeps the legacy whole body.
 * Throws an Error with every key replaced when the request is refused here or nothing
 * answered; a write that did not answer says it may or may not be stored and is read back, never sent again by this
 * tool.
 * `longestReply` is how much of the answer is handed back before it is cut. It is THE_LONGEST_REPLY unless a caller
 * that must read one longer answer whole raises it, and nothing lowers it. office_request never passes it.
 * `signal` is the caller's own cancellation, joined to the tool's own wait. `waitMs` and `finishWaitMs` are the
 * caller's own waits, read as theLongestWaitFor reads them; office_request names neither, so the tool's own two apply.
 * @param {ARequest} request
 * `trace` is the caller's own trace, kept as it is given; with none, officeHeaders names the run and the purpose.
 * @param {{ fetchImpl?: typeof fetch, env?: NodeJS.ProcessEnv, longestReply?: number, trace?: string, signal?: AbortSignal, waitMs?: number, finishWaitMs?: number }} [options]
 * @returns {Promise<AnAnswer>}
 */
export async function askTheOffice(request, { fetchImpl = fetch, env = process.env, longestReply = THE_LONGEST_REPLY, trace, signal, waitMs, finishWaitMs } = {}) {
  if (signal !== undefined && !(signal instanceof AbortSignal)) {
    throw new Error('The signal was refused, and nothing was sent: it must be an AbortSignal.')
  }
  const theWait = theLongestWaitFor(request, env, { waitMs, finishWaitMs })
  const { method, who, where, sendsABody, fields } = prepareOfficeRequest(request, { env, longestReply })
  // The shared guard rejects string bodies. Parsing one here would change the caller's
  // request, so the object supplied by the caller is preserved.
  // RULE 4: the run's own headers, and none of the model's. `key` is left undefined, so officeHeaders reads
  // the key itself, through theAgentKey, the one place a tool reads it.
  const headers = officeHeaders({ workspace: who.workspace, agent: who.agent, session: who.session, key: undefined, trace })
  // THE RUN'S OWN SEAL CARRIES ITS OWN USAGE RECEIPT, since nothing is written after it.
  const sealed = aSealOfThisRun({ method, path: request.path, body: request.body }, env)
    ? await withTheRunsOwnReceipt(where.url, headers, /** @type {Record<string, any>} */ (request.body), env, fetchImpl)
    : { body: request.body, added: null }
  let reply
  try {
    // A WRITE THAT MAY SEAL A RUN GETS THE FINISH WAIT (theLongestWaitFor), and every other request the ordinary one.
    // A CALLER'S OWN SIGNAL IS JOINED TO THAT WAIT, so a caller can stop it; a caller that names none gets the tool's
    // wait alone. The wait starts here, after the receipt, so it is the office's own time that is bounded.
    const withinTheWait = AbortSignal.timeout(theWait)
    reply = await fetchImpl(where.url, {
      method,
      headers,
      ...(sendsABody ? { body: JSON.stringify(sealed.body) } : {}),
      // RULE 1: a redirect is handed back, never followed.
      redirect: 'manual',
      signal: signal === undefined ? withinTheWait : AbortSignal.any([withinTheWait, signal]),
    })
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err)
    // A WRITE THAT DID NOT ANSWER MAY STILL BE STORED (eILVKeOHc0ts, 17 October 2026): the office can take the
    // write and the answer be lost, so a write says so and names the one way to read it back — through this tool. A
    // read says only that nothing answered. The tool never sends the request again itself.
    throw new Error(
      withoutKeys(
        aWrite(method) ? aWriteThatDidNotAnswer(why) : `The office did not answer (${why}).`,
      ),
    )
  }
  // RULE 3, IN THIS ORDER: the keys are replaced over the whole reply, and only then is it cut. Cut first, a key that
  // straddled the cut was left as a shorter run of hex, which the pattern does not match, and most of it reached the
  // model (the inspector's refusal of run AOBa-MRkNg5_, 28 September 2026).
  let shown
  try { shown = withoutKeys(await reply.text()) } catch (error) {
    const why = withoutKeys(error instanceof Error ? error.message : String(error))
    if (fields !== 'whole') return refuseOfficeProjection({
      status: reply.status,
      location: reply.headers?.get('location') == null ? null : withoutKeys(reply.headers.get('location')),
      body: '', cut: false,
      added: sealed.added === null ? null : withoutKeys(whyTheSealIsNotShownStored(reply.status, '') ?? sealed.added),
    }, `the source body could not be read (${why})`, { write: aWrite(method) })
    throw new Error(`The office answered ${String(reply.status)}, but its body could not be read (${why}).` + (aWrite(method)
      ? ' This write was already sent and may be stored. Read it back through office_request before sending it again; never send it another way.' : ''))
  }
  return answerWithFields({
    status: reply.status,
    location: reply.headers.get('location') === null ? null : withoutKeys(reply.headers.get('location')),
    body: shown,
    cut: false,
    added: sealed.added === null ? null : withoutKeys(whyTheSealIsNotShownStored(reply.status, shown) ?? sealed.added),
  }, fields, method, longestReply)
}

/** Validate locally before any network or file-upload preparation.
 * @param {unknown} fields @param {unknown} method
 * @returns {import('./office-answer-fields.mjs').OfficeFields}
 */
export function validateRequestFields(fields, method) {
  try { return validateOfficeFields(fields) } catch (error) {
    throw new Error(withoutKeys(`${error instanceof Error ? error.message : String(error)} Nothing was sent.` + (aWrite(method) ? ` ${A_REFUSED_WRITE}` : '')))
  }
}

/** Project the complete masked body, mask the projection and its notices, then apply the existing display cutoff.
 * @param {AnAnswer} answer @param {unknown} fields @param {unknown} method @param {number} [longestReply]
 * @returns {AnAnswer}
 */
export function answerWithFields(answer, fields, method, longestReply = THE_LONGEST_REPLY) {
  const projected = projectOfficeAnswer(answer, fields, { write: aWrite(method) })
  // RULE 3 AGAIN: a projection writes the body out anew, and an escaped key in the reply comes out as a key. The new
  // text is masked whole before it is cut, as the reply was.
  const body = withoutKeys(projected.body)
  const cut = projected.cut || body.length > longestReply
  return { ...projected, body: cut ? body.slice(0, longestReply) : body, cut, added: projected.added == null ? projected.added : withoutKeys(projected.added) }
}

/**
 * WHY THE OFFICE'S ANSWER DOES NOT SHOW A SEAL STORED, or null when it shows it stored (problem IjCVX5KFlViv). The
 * receipt's sentence is written before the seal is sent, so it may stand only beside an answer that shows the write
 * stored. The records door answers a stored PATCH with a number in newSeq, and its reminder before the seal, or a write
 * that changed nothing, with newSeq null (src/server/api/records.ts). Run 6OyZeab-BaTJ's first finish write was answered
 * with the reminder, and the tool still said its receipt went with the seal.
 * @param {number} status
 * @param {string} shown the whole answer, its keys replaced
 * @returns {string | null}
 */
function whyTheSealIsNotShownStored(status, shown) {
  /** @param {string} why */
  const notStored = (why) =>
    `The office's answer does not show this write stored (${why}), so no usage receipt went with a seal. The receipt is read again when the write is sent again.`
  if (status < 200 || status > 299) return notStored(`it answered ${String(status)}`)
  let newSeq
  try {
    newSeq = JSON.parse(shown)?.newSeq
  } catch {
    return notStored('its answer is not JSON')
  }
  if (typeof newSeq === 'number') return null
  return notStored(newSeq === null ? 'its answer has newSeq null' : 'its answer has no newSeq')
}


/**
 * The description and parameters shared by the dsh and MCP adapters.
 * dsh filters the key out of shell commands; Codex step 1 still keeps it there.
 */
export const officeRequestDefinition = {
  description:
    "Ask Mole Office, as this run, for anything its API answers: method, a path under /api/, and a JSON body when " +
    "the door takes one. Use it instead of curl for every request to the office; it carries this run's identity and " +
    'key, which you never need to send yourself. The status and Location stay (a redirect is not followed), with ' +
    'every key replaced. By default, full records show their stored short forms; operational answers stay unchanged. ' +
    'Use fields to select body paths, short for stored record forms, or whole for the complete body. Fields are applied locally. ' +
    WHEN_TO_SEND_A_LEAD,
  parameters: {
    method: { type: 'string', required: true, enum: [...THE_METHODS], description: 'The HTTP method.' },
    path: { type: 'string', required: true, description: 'The path on the office, starting with /api/, with its query if any.' },
    body: { type: 'object', additionalProperties: true, description: 'The JSON body, for POST, PUT and PATCH.' },
    fields: {
      oneOf: [{ type: 'array', items: { type: 'string' } }, { type: 'string', enum: ['short', 'whole'] }],
      description: 'Local answer body selection: nonempty dotted object paths, short for stored record forms (default), or whole for the original body. Arrays traverse every member; missing or unsafe paths are refused. Never sent to the office.',
    },
  },
}

/** The same text goes to either model and into either tool's logs. A write the office refused carries A_REFUSED_WRITE. */
export const renderOfficeAnswer = (/** @type {unknown} */ args, /** @type {AnAnswer} */ value) => [
  {
    type: 'text',
    text:
      `${String(value.status)}${value.location === null ? '' : ` Location: ${value.location}`}\n${value.body}` +
      (value.cut ? `\n(The rest of the reply, past ${String(THE_LONGEST_REPLY)} characters, is not shown.)` : '') +
      (value.added === null || value.added === undefined ? '' : `\n(${value.added})`) +
      (value.status >= 400 && aWrite(/** @type {{ method?: unknown } | undefined} */ (args)?.method) ? `\n(${A_REFUSED_WRITE})` : ''),
  },
]
