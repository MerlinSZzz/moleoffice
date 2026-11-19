// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE DSH CHECK'S ACP CLIENT: ONE MODEL TURN THROUGH DSH'S ACP DRIVER, WITH THE ROUTE AND THE EFFORT CHECKED FIRST.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS
 * ---------------------------------------------------------------------------------------
 *
 * The program a DSH check runs for its model call. As planned (message 1S-Comh3Shf-, point 3), the inspector
 * copies it, read-only, into the check's commands folder and runs it there (tools/the-inspector.mjs). It is run like
 * this:
 *
 *   env DSH_PERMISSION_MODE=danger-full-access DSH_HOME=/check/home/.dsh \
 *     node /inputs/commands/inspector-dsh-acp.mjs --provider <p> --model <m> [--effort <e>] [--resume <session id>]
 *
 * An optional final --exit-within-ms <whole number> shortens the input-end wait for the test suite only.
 * The inspector never passes it; absent, the wait remains 20,000 ms.
 *
 * The prompt is the whole of stdin. The client starts `dsh --profile acp` with two patches: one that names the route, and
 * then the patch list that turns dsh's own subagents and workflows off (THE_FEATURES_OFF_BESIDE_THE_CLIENT, below). It makes a
 * session or resumes one, checks that the session reports the route it was asked for, sets the effort if one was
 * named, sends the prompt, and closes the session. It writes exactly one line on stdout, in every case, and nothing
 * else: the envelope, {"type":"dsh-acp-result", sessionId, resumed, route, effortSet, effortReported, stopReason,
 * isError, error, result}. It exits 0 when isError is false and 1 when it is true. Everything else it has to say goes
 * on stderr, and each line dsh writes on its own stderr is passed on there with `dsh: ` in front.
 *
 * It imports node's own modules only, which is why the inspector copies it alone into the check's commands folder, with
 * the one patch list beside it. It reads no key itself: dsh gets the environment this client was given.
 *
 * ---------------------------------------------------------------------------------------
 * WHY ACP
 * ---------------------------------------------------------------------------------------
 *
 * ACP was chosen for the DSH check in message uVlfyTGEjhbq, and this shape was confirmed in message 1S-Comh3Shf-. An ACP
 * session reports its model route and its effort before any prompt is sent, so the check can refuse a wrong route
 * before a model is asked anything. A second dsh process can resume a session that a first one saved. The verdict
 * door's one correction can be asked in the same session. A one-shot headless call does none of these.
 *
 * The rules set for it, each kept here:
 *   - The route is set only by the acp row of the patch. The check is refused unless session/new, or session/resume,
 *     reports that route. The refusal names both routes in plain words.
 *   - The effort is set with session/set_config_option after session/new and after each session/resume. The check is
 *     refused unless dsh reports back the effort that was asked for.
 *   - An effort dsh refuses is refused for the check, with dsh's own words. No other effort is tried in its place.
 *   - With no effort named, none is set, and stderr says what effort dsh reported.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS CLIENT CANNOT TELL, AND DOES NOT CLAIM
 * ---------------------------------------------------------------------------------------
 *
 * THE STOP REASON CANNOT TELL A COMPLETED TURN FROM AN ABORTED OR A BLOCKED ONE. dsh 0.1.5-rc.2 answers end_turn for
 * all three (turnEndToStopReason in @deepseek-ai/dsh-acp). So end_turn is taken as success here, and it proves only
 * that the turn ended. What proves the turn did its work is the verdict door's parse of the result. Any other stop
 * reason is an error.
 *
 * NO RESUME AFTER A REAL TURN HAS BEEN SEEN. The probe that showed a second dsh process resuming a saved session
 * resumed one with no turns (the s6-acp-probe-findings.txt of wave 13n's supervisor). Resuming a session that holds turns
 * and tool calls needs a model, and has not been tried. The --resume path here is proved only against a stand-in.
 *
 * IT REPORTS NO TOKEN COUNT. dsh's usage_update says how much of the context window the whole session fills (`used`
 * of `size`). It is not the tokens this turn cost, so this client does not read it, and the envelope has no count.
 *
 * A STOP FROM OUTSIDE IS SENT ON TO DSH (review OcaFB-eOWjWp, point 5). The check view stops a check with a
 * SIGTERM to the client's process group. dsh runs in a group of its own, so that stop does not reach it, and dsh holds
 * the model's key in its environment. On a SIGTERM, a SIGINT or a SIGHUP, the client sends dsh's group a SIGTERM,
 * ends that group as the next paragraph says, writes the envelope saying it was stopped, and exits 1. A SIGKILL to the
 * client cannot be caught, and leaves dsh running.
 *
 * AFTER A SIGTERM TO DSH'S GROUP, THE CLIENT EXITS ONLY WHEN THAT GROUP HAS ENDED (point (a), forwarded in
 * PWOusbA-Z7eZ). After each SIGTERM it sends dsh's group, after a stop from outside and after the 20 seconds dsh is
 * given to exit, the client waits up to 10 seconds for every process of that group to be gone. If any is left, it sends
 * the group SIGKILL and waits up to 5 seconds more. Then it exits, and says which of these happened. So when the client
 * has exited, dsh has ended, or the client has said that it may still be running, and the check reads dsh's transcript
 * after dsh has written the last of it. When dsh exits by itself, the client looks at its group once (as in
 * Dxiry_2y6vuD). If a process dsh started is still in it, the client sends the group SIGKILL, waits up to 5 seconds
 * for it to be gone, and says so. A process that has exited counts until its parent has reaped it; the check view's
 * container runs docker's init, which reaps what dsh leaves behind. dsh starts its own tool processes through
 * @deepseek-ai/dsh-subprocess-local, which can put them in groups of their own: those are not in dsh's group, and this
 * wait does not see them. dsh's own SIGTERM handler shuts dsh down, and the 10 seconds are its time to do that.
 */
import { spawn } from 'node:child_process'
import { chmodSync, constants, copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * The option this client takes its effort by. It is said here once: the inspector's dsh command and its check of that
 * command read it from this file, so the three cannot name different options.
 */
export const THE_DSH_ACP_EFFORT_OPTION = '--effort'

/**
 * THE PATCH LIST THAT TURNS DSH'S OWN SUBAGENTS AND WORKFLOWS OFF, by the name of its copy beside this client. The client
 * gives dsh that copy as its second --patch at every start, so the client names no file of a checkout. The inspector puts
 * the copy there with putTheFeaturesOffBesideTheClient. dsh 0.1.5-rc.2 refuses to start when it cannot read a --patch
 * file, so a client with no copy beside it starts no model.
 */
export const THE_FEATURES_OFF_BESIDE_THE_CLIENT = 'inspector-dsh-features-off.patch.json'

/**
 * The patch list copied beside the client, read-only, in the folder the client is copied into. The old copy is removed
 * first and the new one may not replace anything, so a copy left read-only by an earlier start, or a link put in its
 * place, is never written through.
 * @param {string} commands The folder the client is copied into.
 * @param {string} patch The patch list, which this copies and does not read otherwise.
 */
export function putTheFeaturesOffBesideTheClient(commands, patch) {
  const copy = join(commands, THE_FEATURES_OFF_BESIDE_THE_CLIENT)
  rmSync(copy, { force: true })
  copyFileSync(patch, copy, constants.COPYFILE_EXCL)
  chmodSync(copy, 0o444)
}

const A_SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
/** How long dsh may take to answer a request. session/prompt has no limit in this client. */
const AN_ANSWER_WITHIN_MS = 60_000
/** How long dsh may take to exit after its input ends, before its process group is sent SIGTERM. */
const AN_EXIT_WITHIN_MS = 20_000
/** How long dsh's process group may take to end after its SIGTERM, before it is sent SIGKILL (point (a)). */
const AN_END_AFTER_SIGTERM_WITHIN_MS = 10_000
/** How long the group may take to be gone after SIGKILL, before the client says dsh may still be running. */
const GONE_AFTER_SIGKILL_WITHIN_MS = 5_000
const PERMISSION_REFUSED =
  'dsh asked for permission although the check runs with full access; the check refused it and stopped.'

/** @param {unknown} error */
const wordsOf = (error) => (error instanceof Error ? error.message : String(error))

/** An error whose message is the sentence the envelope carries. */
class Failure extends Error {}

/** dsh answered a request with an error. Its code and its own words are kept. */
class Refusal extends Failure {
  /** @param {string} method @param {{ code?: unknown, message?: unknown }} error */
  constructor(method, error) {
    super(`dsh answered ${method} with error ${String(error.code)}: ${String(error.message)}`)
    this.code = error.code
    this.words = String(error.message)
  }
}

const envelope = {
  type: 'dsh-acp-result',
  /** @type {string | null} */ sessionId: null,
  resumed: false,
  /** @type {{ provider: string, model: string } | null} */ route: null,
  /** @type {string | null} */ effortSet: null,
  /** @type {string | null} */ effortReported: null,
  /** @type {string | null} */ stopReason: null,
  isError: false,
  /** @type {string | null} */ error: null,
  result: '',
}

let finished = false
/** Set while a stop from outside ends dsh's group. The stop writes the envelope then, and nothing else does. */
let stopping = false

/** Write the envelope, the one line on stdout, and exit by it. It is written once. @param {boolean} [byTheStop] */
function finish(byTheStop = false) {
  if (finished || (stopping && !byTheStop)) return
  finished = true
  process.stdout.write(JSON.stringify(envelope) + '\n', () => process.exit(envelope.isError ? 1 : 0))
}

/** @param {unknown} error */
function fail(error) {
  envelope.isError = true
  envelope.error = error instanceof Error ? error.message : String(error)
}

/**
 * Whether any process of the group is still there, one that has exited and is not yet reaped among them. Only ESRCH
 * says the group is empty: EPERM says a process the client may not signal is in it.
 * @param {number} group
 */
function theGroupIsThere(group) {
  try {
    process.kill(-group, 0)
    return true
  } catch (error) {
    return /** @type {NodeJS.ErrnoException} */ (error).code !== 'ESRCH'
  }
}

/** Wait up to `ms` for the group to be gone. @param {number} group @param {number} ms */
async function theGroupEndsWithin(group, ms) {
  const until = performance.now() + ms
  while (theGroupIsThere(group)) {
    if (performance.now() > until) return false
    await new Promise((done) => setTimeout(done, 50))
  }
  return true
}

/**
 * END DSH'S PROCESS GROUP, AND WAIT TILL IT HAS ENDED (the header): SIGTERM, up to 10 seconds for the group to be gone,
 * then SIGKILL and up to 5 seconds more. It answers how that went, and the error when a signal could not be sent.
 * @param {number} group
 * @returns {Promise<{ how: 'already-ended' | 'not-sent' | 'ended' | 'ended-before-sigkill' | 'killed' | 'not-killed' | 'still-there', error: string | null }>}
 */
async function endTheGroup(group) {
  try {
    process.kill(-group, 'SIGTERM')
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ESRCH') return { how: 'already-ended', error: null }
    return { how: 'not-sent', error: wordsOf(error) }
  }
  if (await theGroupEndsWithin(group, AN_END_AFTER_SIGTERM_WITHIN_MS)) return { how: 'ended', error: null }
  try {
    process.kill(-group, 'SIGKILL')
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ESRCH') return { how: 'ended-before-sigkill', error: null }
    return { how: 'not-killed', error: wordsOf(error) }
  }
  return { how: (await theGroupEndsWithin(group, GONE_AFTER_SIGKILL_WITHIN_MS)) ? 'killed' : 'still-there', error: null }
}

/**
 * WHAT DSH LEFT IN ITS GROUP WHEN IT EXITED BY ITSELF (the header): the group is looked at once, and if it is not empty
 * it is sent SIGKILL, with up to 5 seconds to be gone. It answers how that went, and the error when SIGKILL could not
 * be sent.
 * @param {number} group
 * @returns {Promise<{ how: 'empty' | 'killed' | 'not-killed' | 'still-there', error: string | null }>}
 */
async function endWhatDshLeft(group) {
  if (!theGroupIsThere(group)) return { how: 'empty', error: null }
  try {
    process.kill(-group, 'SIGKILL')
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ESRCH') return { how: 'empty', error: null }
    return { how: 'not-killed', error: wordsOf(error) }
  }
  return { how: (await theGroupEndsWithin(group, GONE_AFTER_SIGKILL_WITHIN_MS)) ? 'killed' : 'still-there', error: null }
}

/**
 * The words that say how dsh's group ended, after "dsh's process group N".
 * @param {Awaited<ReturnType<typeof endTheGroup>>} ended
 */
function howTheGroupEnded({ how, error }) {
  const after = AN_END_AFTER_SIGTERM_WITHIN_MS / 1000
  const reason = error === null ? '' : `: ${error}`
  return {
    'already-ended': 'had already ended',
    'not-sent': `could not be sent SIGTERM, so dsh may still be running${reason}`,
    'ended': 'was sent SIGTERM',
    'ended-before-sigkill': `was sent SIGTERM, and ended as its ${after} seconds were up, before SIGKILL was sent`,
    'killed': `was sent SIGTERM, and SIGKILL when it had not ended ${after} seconds later`,
    'not-killed': `was sent SIGTERM, was still there ${after} seconds later, and could not be sent SIGKILL, so dsh may still be running${reason}`,
    'still-there': `was sent SIGTERM, and SIGKILL when it had not ended ${after} seconds later, and was still there ${GONE_AFTER_SIGKILL_WITHIN_MS / 1000} seconds after that, so dsh may still be running`,
  }[how]
}

/**
 * The arguments, read in their one order: --provider P --model M, then --effort E, then --resume ID, then the optional test clock, and nothing else.
 * @param {string[]} args
 */
function readTheArguments(args) {
  let at = 0
  /** @param {string} flag @param {boolean} required */
  const valueOf = (flag, required) => {
    if (args[at] !== flag) {
      if (!required) return null
      const found = args[at] === undefined ? 'nothing' : JSON.stringify(args[at])
      throw new Failure(`The arguments begin --provider <provider> --model <model>, and ${found} was found where ${flag} belongs.`)
    }
    const value = args[at + 1]
    if (value === undefined || value === '' || value.startsWith('-')) {
      const given = value === undefined ? 'no value' : JSON.stringify(value)
      throw new Failure(`${flag} needs a value that is not empty and does not start with "-", and it was given ${given}.`)
    }
    at += 2
    return value
  }
  const provider = /** @type {string} */ (valueOf('--provider', true))
  const model = /** @type {string} */ (valueOf('--model', true))
  const effort = valueOf(THE_DSH_ACP_EFFORT_OPTION, false)
  const resume = valueOf('--resume', false)
  const exitWithin = valueOf('--exit-within-ms', false)
  if (exitWithin !== null && (!/^[0-9]+$/.test(exitWithin) || !Number.isSafeInteger(Number(exitWithin)) || Number(exitWithin) < 1)) {
    throw new Failure(`--exit-within-ms needs a whole number of at least 1; it was given ${JSON.stringify(exitWithin)}.`)
  }
  if (at < args.length) {
    throw new Failure(
      `${JSON.stringify(args[at])} is not an argument this client takes at that place. It takes --provider <provider> ` +
        `--model <model>, then ${THE_DSH_ACP_EFFORT_OPTION} <effort> and --resume <session id> if either is wanted, in that order.`,
    )
  }
  if (resume !== null && !A_SESSION_ID.test(resume)) {
    throw new Failure(`The session id ${JSON.stringify(resume)} is not a lowercase UUID, which is the form dsh gives its sessions.`)
  }
  return { provider, model, effort, resume, exitWithinMs: exitWithin === null ? AN_EXIT_WITHIN_MS : Number(exitWithin) }
}

async function readThePrompt() {
  let text = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) text += chunk
  if (text.trim() === '') throw new Failure('The prompt on stdin is empty or holds only white space.')
  return text
}

/** @param {unknown} options @param {string} id @returns {unknown} the option's currentValue, or undefined with no such option */
function currentValueOf(options, id) {
  const option = Array.isArray(options) ? options.find((one) => one !== null && typeof one === 'object' && one.id === id) : undefined
  return option === undefined ? undefined : option.currentValue
}

/** @param {unknown} value a `model` option's currentValue, which dsh writes as JSON.stringify([provider, model]) */
function shownAsARoute(value) {
  try {
    const route = JSON.parse(String(value))
    if (Array.isArray(route) && route.length === 2 && route.every((part) => typeof part === 'string')) return `${route[0]}/${route[1]}`
  } catch {
    // Not dsh's form of a route; it is shown as it came, below.
  }
  return JSON.stringify(value)
}

/** The check, from its arguments to its envelope. */
async function main() {
  let asked
  let prompt
  try {
    asked = readTheArguments(process.argv.slice(2))
    prompt = await readThePrompt()
  } catch (error) {
    fail(new Failure(`${error instanceof Error ? error.message : String(error)} dsh was not started.`))
    return finish()
  }
  const { provider, model, effort, resume, exitWithinMs: AN_EXIT_WITHIN_MS } = asked
  const theRoute = JSON.stringify([provider, model])
  const cwd = process.cwd()

  let folder
  let patchFile
  try {
    folder = mkdtempSync(join(tmpdir(), 'inspector-dsh-acp-'))
    patchFile = join(folder, 'acp-route.json')
    writeFileSync(patchFile, JSON.stringify([{ id: 'acp', config: { provider, model } }]) + '\n', { mode: 0o600 })
  } catch (error) {
    fail(new Failure(`The route patch could not be written: ${error instanceof Error ? error.message : String(error)}. dsh was not started.`))
    if (folder !== undefined) rmSync(folder, { recursive: true, force: true })
    return finish()
  }
  const removeTheFolder = () => rmSync(/** @type {string} */ (folder), { recursive: true, force: true })

  const featuresOff = fileURLToPath(new URL(`./${THE_FEATURES_OFF_BESIDE_THE_CLIENT}`, import.meta.url))
  const dsh = spawn('dsh', ['--profile', 'acp', '--patch', patchFile, '--patch', featuresOff], { cwd, env: process.env, stdio: ['pipe', 'pipe', 'pipe'], detached: true })
  // A STOP FROM OUTSIDE GOES ON TO DSH'S GROUP, which it would not reach, and the client exits when that group has
  // ended (the header). A second stop while it waits is said, and does not cut the wait short.
  for (const signal of /** @type {const} */ (['SIGTERM', 'SIGINT', 'SIGHUP'])) {
    process.on(signal, async () => {
      if (finished) return
      if (stopping) {
        process.stderr.write(`The client was sent ${signal} as well, while it waited for dsh's process group to end.\n`)
        return
      }
      stopping = true
      let said = 'and dsh had not started'
      if (dsh.pid !== undefined) {
        const ended = await endTheGroup(dsh.pid)
        const joined = ended.how === 'already-ended' || ended.how === 'not-sent' ? 'and' : 'so'
        said = `${joined} dsh's process group ${dsh.pid} ${howTheGroupEnded(ended)}`
      }
      fail(new Failure(`The client was stopped by ${signal}, ${said}.`))
      removeTheFolder()
      finish(true)
    })
  }
  try {
    await new Promise((started, failed) => {
      dsh.once('spawn', started)
      dsh.once('error', failed)
    })
  } catch (error) {
    fail(new Failure(`dsh could not be started: ${error instanceof Error ? error.message : String(error)}.`))
    removeTheFolder()
    return finish()
  }
  /** dsh's process group, recorded as it starts: dsh leads a group of its own. */
  const group = /** @type {number} */ (dsh.pid)
  dsh.on('error', (error) => process.stderr.write(`The client's handle on dsh reported: ${error.message}\n`))
  dsh.stdin.on('error', (error) => process.stderr.write(`dsh's input could not be written: ${error.message}\n`))

  /** @type {Map<unknown, { method: string, resolve: (result: any) => void, reject: (error: Error) => void, timer: NodeJS.Timeout | null }>} */
  const waiting = new Map()
  /** @type {Error | null} set when something dsh did ends the check; every request after it but session/close is refused */
  let stopped = null
  /** @type {string | null} how dsh exited, once its output has closed */
  let exitedWith = null
  let nextId = 0

  /** End every request still waiting, with this error. @param {Error} error */
  const rejectAll = (error) => {
    for (const [id, one] of waiting) {
      if (one.timer !== null) clearTimeout(one.timer)
      waiting.delete(id)
      one.reject(error)
    }
  }
  /** @param {Error} error */
  const stopTheCheck = (error) => {
    stopped ??= error
    rejectAll(error)
  }
  /** @param {object} frame */
  const send = (frame) => dsh.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...frame }) + '\n')

  /** Ask dsh, and wait for its answer: within `limit` milliseconds, or with no limit when it is null. @param {string} method @param {object} params @param {number | null} limit */
  const request = (method, params, limit) =>
    new Promise((resolve, reject) => {
      if (exitedWith !== null) return reject(new Failure(`dsh had already exited, ${exitedWith}, when ${method} was to be sent.`))
      if (stopped !== null && method !== 'session/close') return reject(stopped)
      const id = nextId++
      const timer =
        limit === null
          ? null
          : setTimeout(() => {
              waiting.delete(id)
              reject(new Failure(`dsh did not answer ${method} within ${limit / 1000} seconds.`))
            }, limit)
      waiting.set(id, { method, resolve, reject, timer })
      send({ id, method, params })
    })

  /** The session the prompt's updates are read for, and the text of each message, by message id, in order. */
  let theSession = /** @type {string | null} */ (null)
  /** @type {Map<unknown, string>} */
  const messages = new Map()

  /** @param {any} frame */
  const onAnswer = (frame) => {
    const one = waiting.get(frame.id)
    if (one === undefined) {
      process.stderr.write(`dsh answered request ${JSON.stringify(frame.id)}, which this client no longer waits for.\n`)
      return
    }
    waiting.delete(frame.id)
    if (one.timer !== null) clearTimeout(one.timer)
    if (frame.error !== undefined) one.reject(new Refusal(one.method, frame.error ?? {}))
    else one.resolve(frame.result)
  }
  /** @param {any} frame */
  const onNotification = (frame) => {
    if (frame.method !== 'session/update' || frame.params?.sessionId !== theSession) return
    const update = frame.params.update
    if (update?.sessionUpdate !== 'agent_message_chunk' || update.content?.type !== 'text') return
    const text = String(update.content.text ?? '')
    if (text === '') return
    messages.set(update.messageId, (messages.get(update.messageId) ?? '') + text)
  }
  /** @param {any} frame */
  const onRequest = (frame) => {
    if (frame.method === 'session/request_permission') {
      send({ id: frame.id, result: { outcome: { outcome: 'cancelled' } } })
      send({ method: 'session/cancel', params: { sessionId: theSession } })
      stopTheCheck(new Failure(PERMISSION_REFUSED))
      return
    }
    process.stderr.write(`dsh asked for ${String(frame.method)}, which this client does not offer; it was answered -32601.\n`)
    send({ id: frame.id, error: { code: -32601, message: `"Method not found": ${String(frame.method)}` } })
  }
  /** @param {string} line */
  const onLine = (line) => {
    if (line.trim() === '') return
    let frame
    try {
      frame = JSON.parse(line)
    } catch {
      stopTheCheck(new Failure(`dsh wrote a line on its output that is not JSON: ${JSON.stringify(line.slice(0, 200))}.`))
      return
    }
    if (frame === null || typeof frame !== 'object' || Array.isArray(frame)) {
      stopTheCheck(new Failure(`dsh wrote a line on its output that is not a JSON-RPC message: ${JSON.stringify(line.slice(0, 200))}.`))
    } else if (frame.method === undefined) onAnswer(frame)
    else if (frame.id === undefined) onNotification(frame)
    else onRequest(frame)
  }

  /** Call `each` with every whole line of a stream, and with what is left at its end. @param {NodeJS.ReadableStream} stream @param {(line: string) => void} each */
  const linesOf = (stream, each) => {
    let buffer = ''
    stream.setEncoding('utf8')
    stream.on('data', (chunk) => {
      buffer += chunk
      let at
      while ((at = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, at)
        buffer = buffer.slice(at + 1)
        each(line)
      }
    })
    stream.on('end', () => {
      if (buffer !== '') each(buffer)
      buffer = ''
    })
  }
  linesOf(dsh.stdout, onLine)
  linesOf(dsh.stderr, (line) => process.stderr.write(`dsh: ${line}\n`))

  /** @type {Promise<void>} */
  const closed = new Promise((done) =>
    dsh.once('close', (code, signal) => {
      exitedWith = signal === null ? `with exit code ${String(code)}` : `by the signal ${signal}`
      for (const [id, one] of waiting) {
        if (one.timer !== null) clearTimeout(one.timer)
        waiting.delete(id)
        one.reject(new Failure(`dsh exited before it answered ${one.method}, ${exitedWith}.`))
      }
      done()
    }),
  )

  /** @param {unknown} options the configOptions dsh answered @param {string} before words that lead the refusal */
  const checkTheRoute = (options, before) => {
    const reported = currentValueOf(options, 'model')
    if (reported === undefined) {
      throw new Failure(`${before}dsh's ACP session reported no model route, but this check asked for ${provider}/${model}. No prompt was sent.`)
    }
    if (reported !== theRoute) {
      throw new Failure(
        `${before}dsh's ACP session reports the model route ${shownAsARoute(reported)}, but this check asked for ${provider}/${model}. No prompt was sent.`,
      )
    }
  }
  /** @param {unknown} options */
  const readTheEffort = (options) => {
    const reported = currentValueOf(options, 'reasoning_effort')
    envelope.effortReported = reported === undefined ? null : String(reported)
    return envelope.effortReported
  }

  try {
    await request('initialize', { protocolVersion: 1, clientCapabilities: {} }, AN_ANSWER_WITHIN_MS)
    let options
    if (resume === null) {
      const made = await request('session/new', { cwd, mcpServers: [] }, AN_ANSWER_WITHIN_MS)
      if (typeof made?.sessionId !== 'string' || made.sessionId === '') throw new Failure('dsh answered session/new with no session id.')
      theSession = made.sessionId
      envelope.sessionId = made.sessionId
      options = made.configOptions
    } else {
      theSession = resume
      const resumed = await request('session/resume', { sessionId: resume, cwd, mcpServers: [] }, AN_ANSWER_WITHIN_MS)
      envelope.sessionId = resume
      envelope.resumed = true
      options = resumed?.configOptions
    }
    const reported = readTheEffort(options)
    checkTheRoute(options, '')
    envelope.route = { provider, model }

    if (effort !== null) {
      let set
      try {
        set = await request('session/set_config_option', { sessionId: theSession, configId: 'reasoning_effort', value: effort }, AN_ANSWER_WITHIN_MS)
      } catch (error) {
        if (!(error instanceof Refusal)) throw error
        throw new Failure(
          `dsh refused the effort ${effort}: it answered session/set_config_option with error ${String(error.code)}: ${error.words}. ` +
            'No other effort was tried, and no prompt was sent.',
        )
      }
      const back = readTheEffort(set?.configOptions)
      if (back !== effort) {
        const said = back === null ? 'reported no effort back' : `reports its effort as ${back}`
        throw new Failure(`dsh accepted the effort ${effort} but ${said}. No prompt was sent.`)
      }
      envelope.route = null
      checkTheRoute(set?.configOptions, 'After the effort was set, ')
      envelope.route = { provider, model }
      envelope.effortSet = effort
    } else if (reported === null) {
      process.stderr.write('No effort was named, so none was set; dsh reported no effort.\n')
    } else if (reported === '') {
      process.stderr.write("No effort was named, so none was set; dsh reported an empty effort, which is its word for the provider's own default.\n")
    } else {
      process.stderr.write(`No effort was named, so none was set; dsh reported ${reported} as its effort.\n`)
    }

    const turn = await request('session/prompt', { sessionId: theSession, prompt: [{ type: 'text', text: prompt }] }, null)
    envelope.stopReason = typeof turn?.stopReason === 'string' ? turn.stopReason : null
    if (envelope.stopReason !== 'end_turn') throw new Failure(`dsh ended the turn with ${String(turn?.stopReason)}.`)
  } catch (error) {
    fail(error)
  }
  envelope.result = [...messages.values()].at(-1) ?? ''

  if (envelope.sessionId !== null) {
    try {
      await request('session/close', { sessionId: envelope.sessionId }, AN_ANSWER_WITHIN_MS)
    } catch (error) {
      process.stderr.write(`The session was not closed: ${error instanceof Error ? error.message : String(error)}\n`)
    }
  }
  dsh.stdin.end()
  /** @type {NodeJS.Timeout | undefined} */
  let timer
  const inTime = await Promise.race([closed.then(() => true), new Promise((done) => { timer = setTimeout(() => done(false), AN_EXIT_WITHIN_MS) })])
  clearTimeout(timer)
  if (!inTime && exitedWith === null && dsh.exitCode === null && dsh.signalCode === null) {
    process.stderr.write(`dsh did not exit within ${AN_EXIT_WITHIN_MS / 1000} seconds of the end of its input, so its process group ${group} was sent SIGTERM.\n`)
    const ended = await endTheGroup(group)
    const after = AN_END_AFTER_SIGTERM_WITHIN_MS / 1000
    if (ended.how === 'killed') {
      process.stderr.write(`dsh's process group ${group} was still there ${after} seconds after the SIGTERM, so it was sent SIGKILL, and it is gone.\n`)
    } else if (ended.how === 'ended-before-sigkill') {
      process.stderr.write(`dsh's process group ${group} ended as its ${after} seconds after the SIGTERM were up, before SIGKILL was sent.\n`)
    } else if (ended.how !== 'ended' && ended.how !== 'already-ended') {
      // dsh may still be running with the model's key, so the check is an error, whatever the turn said.
      fail(new Failure(`dsh did not exit after its input ended, and its process group ${group} ${howTheGroupEnded(ended)}.`))
    }
  } else {
    if (!inTime) {
      process.stderr.write(`dsh exited, but its output was still open ${AN_EXIT_WITHIN_MS / 1000} seconds after the end of its input; the client stopped reading it.\n`)
    }
    // A stop from outside ends the group itself and writes the envelope, so the group is looked at only without one.
    const left = stopping ? { how: 'empty', error: null } : await endWhatDshLeft(group)
    if (left.how === 'killed') {
      process.stderr.write(`dsh exited, but its process group ${group} was not empty, so it was sent SIGKILL, and it is gone.\n`)
    } else if (left.how === 'not-killed') {
      // A process dsh started may still be running with the model's key, so the check is an error, whatever the turn said.
      fail(new Failure(`dsh exited, but its process group ${group} was not empty and could not be sent SIGKILL, so a process dsh started may still be running: ${left.error}.`))
    } else if (left.how === 'still-there') {
      fail(new Failure(`dsh exited, but its process group ${group} was not empty, and was still there ${GONE_AFTER_SIGKILL_WITHIN_MS / 1000} seconds after SIGKILL, so a process dsh started may still be running.`))
    }
  }
  removeTheFolder()
  finish()
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main()
