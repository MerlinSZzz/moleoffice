#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE THING THAT ACTUALLY RUNS AN AGENT. Mole Office queues the work; this picks it up and does it.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THE SERVER DOES NOT DO THIS ITSELF
 * ---------------------------------------------------------------------------------------------
 *
 * Two reasons.
 *
 * Nothing under `src/` may start a process, signal one, or read a kernel filesystem. Only the
 * resource ledger may, and only to look at what
 * is already running. So the Mole Office server cannot spawn an agent, and that is deliberate: a web
 * server that runs arbitrary commands is a different and much more dangerous product.
 *
 * The second reason is the remote case. A person may want a Codex on another laptop, over a VPN,
 * to be able to receive scoped project context and report findings back. If the server spawned the
 * agent, that would need a new mechanism. Because a run is a row a WORKER CLAIMS OVER HTTP, the
 * remote case is the same case: another worker, another machine, the same four requests. Runtime
 * neutrality is not an abstraction layer here — it is the absence of one.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT DOES, IN FOUR REQUESTS
 * ---------------------------------------------------------------------------------------------
 *
 *   GET  /api/agent/runs?state=queued       what is waiting
 *   POST /api/agent/runs/<id>/claim         "I have this one" — answers with the assembled context
 *   ...runs the agent...
 *   POST /api/agent/runs/<id>/result        the answer, or the failure
 *
 * Nothing else. It never touches the database and it never reads a table name.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT REFUSES TO DO
 * ---------------------------------------------------------------------------------------------
 *
 * **It will not quietly start a fresh agent when the person addressed an existing one.** If a run
 * says "resume the agent working on the tray clamp calibration" and that session's transcript is not
 * on this machine, the worker DECLINES the run and says why. Mole Office then shows it as waiting for a
 * worker that can serve it. Starting a new agent that has never heard of the work, and reporting
 * that as the answer, is the second engineering rule broken on the one path most likely to break it.
 *
 * **It will not write to Mole Office on the agent's behalf.** The agent it starts writes its own records,
 * with its own agent headers, through the ordinary API. So the change log names the agent, and the
 * one governance gate in the product — an agent gets 403 on a decision — applies to it with nothing
 * added here.
 *
 * **It will not invent a structured result.** The agent is asked to end with a JSON object. When
 * what comes back is not one, the worker posts the raw text as the answer and says it could not read
 * a structured result. It does not guess at a focus target or a list of writes.
 *
 * ---------------------------------------------------------------------------------------------
 * RUNNING IT
 * ---------------------------------------------------------------------------------------------
 *
 *   node tools/agent-worker.mjs                    poll for ever, against the API .env names
 *   node tools/agent-worker.mjs --once             take at most one run, then stop
 *   node tools/agent-worker.mjs --api http://…     somewhere else, including another machine
 *   node tools/agent-worker.mjs --model claude-sonnet-5     which model the runs use; without it, the office is asked per run
 *   node tools/agent-worker.mjs --dry              claim nothing; print what it would have taken
 *
 * It files a session record for itself and registers its own process in the resource ledger before
 * it does anything else, because an agent that is killed never reaches its own tidy-up. On a clean
 * exit it releases the registration and marks its session finished. Each run it serves gets a
 * session record of its own as well, which holds that run's usage receipt and says how it ended.
 * The run is told that record's id to send as x-mole-office-session on its own requests.
 */

import { spawn } from 'node:child_process'
import { aCommandsStartFromTheOffice } from './sandbox-common.mjs'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { whereIsTheApi } from './where-is-the-api.mjs'
import { settingValue } from '../src/config/settings.mjs'
import { THE_COMPACTION_VARIABLE, theCompactionWindowGiven, theConversationsWindow } from '../src/config/the-compaction-window.mjs'
// THE ONE CLAUDE READER, shared with the message worker's adapter. It is JavaScript because this
// tool is JavaScript and may run under a Node that cannot read TypeScript; a second copy of the
// parsing here would be two rules that drift. U3, the ninth invariant.
import { claudeUsage } from '../src/config/usage.mjs'
import { theModelsInAResult } from '../src/config/claude-code-served.mjs'
import { aServed } from '../src/config/runtime-served.mjs'
import { WORLD_HEADER, parseWorldHeader } from '../src/config/world-header.mjs'
import { KEY_HEADER } from '../src/config/key-header.mjs'
import { theOfficeKey } from '../src/config/office-key.mjs'
// Which world this tool lives in, on every request it makes. Criterion C4.
import { HOME_HEADER } from '../src/config/visit-headers.mjs'
import { localStamp } from '../src/shared/time.ts'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const at = args.indexOf('--' + name)
  return at === -1 ? fallback : args[at + 1]
}
const has = (name) => args.includes('--' + name)

// Where the API is, answered in one place — tools/where-is-the-api.mjs, which reads .env because
// a shell that runs this rarely has one. A --api flag a person typed still wins.
const API = whereIsTheApi(flag('api', undefined))
// THE MODEL A PERSON TYPED, OR NONE. Without it, each run's model is asked of the office for the
// agent the run serves (criterion U2): `theModelForThisRun` below.
const MODEL_FLAG = flag('model', undefined) ?? null
const ONCE = has('once')
const DRY = has('dry')
const POLL_MS = Number(flag('every', '4000'))
/** A run that has not finished in this long is reported as failed rather than left claimed for ever. */
const RUN_LIMIT_MS = Number(flag('limit', String(20 * 60 * 1000)))
const WORKER = flag('name', 'claude-code@' + (process.env.HOSTNAME ?? 'this machine'))
/** The runtime word this worker serves. A run asking for anything else is left for somebody else. */
const RUNTIME = 'claude-code'

let sessionRecordId = null
let resourceId = null
let stopping = false
let serving = null
let activeChild = null
/** The world this tool calls home: the one the API it talks to answers from. Null until it knows. */
let home = null

/**
 * @param {Record<string, string>} [extra]
 * @returns {Record<string, string>}
 */
function headers(extra) {
  // THE OFFICE'S OWN KEY, on every request this worker makes. Criterion P83, point 5. Read per
  // request; with no key file the object is empty and every request is exactly what it was before.
  const office = theOfficeKey()
  return {
    'content-type': 'application/json',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': 'mole-office-agent-worker',
    ...(office.key === null ? {} : { [KEY_HEADER]: office.key }),
    ...(sessionRecordId === null ? {} : { 'x-mole-office-session': sessionRecordId }),
    // AND WHICH WORLD THIS TOOL LIVES IN. Criterion C4 of design/messages/ACCEPTANCE.md section 8.
    // It is the world the API it was pointed at answers from, read off the world header on a reply.
    // Null until it has read one, and a request with no home is a local, which is what this is.
    ...(home === null ? {} : { [HOME_HEADER]: home }),
    ...extra,
  }
}

async function ask(path, init) {
  const reply = await fetch(API + path, { ...init, headers: headers(init?.headers) })
  const said = parseWorldHeader(reply.headers.get(WORLD_HEADER))
  if (said.ok) home = said.world.database
  const text = await reply.text()
  let body = null
  try { body = text === '' ? null : JSON.parse(text) } catch { body = { unreadable: text.slice(0, 400) } }
  return { status: reply.status, ok: reply.ok, body }
}

function say(...what) {
  process.stdout.write(localStamp(new Date()) + '  ' + what.join(' ') + '\n') // local, chapter 4 rule 8 (acceptance finding 63)
}

/**
 * Whether a Claude Code session can really be picked up again on THIS machine.
 *
 * The adapter in the server already knows how to find a transcript, and it builds the resume command
 * from that file. This is the same question asked from outside the server, because a worker may be
 * on a different machine from the one that answered.
 */
function canResume(external) {
  if (typeof external !== 'string' || external === '') return false
  const projects = join(homedir(), '.claude', 'projects')
  if (!existsSync(projects)) return false
  // The transcript lives at ~/.claude/projects/<slug of the working directory>/<session id>.jsonl,
  // and the slug is not something this file should try to rebuild. Look for the file anywhere under
  // the projects directory instead: an id is a uuid, so a name collision is not a real worry.
  const stack = [projects]
  while (stack.length > 0) {
    const here = stack.pop()
    let entries = []
    try { entries = readdirSync(here, { withFileTypes: true }) } catch { continue }
    for (const one of entries) {
      if (one.isDirectory()) stack.push(join(here, one.name))
      else if (one.name === external + '.jsonl') return true
    }
  }
  return false
}

/**
 * The instructions the agent gets. Everything it may need is in here; it is not given this file.
 *
 * `runRecord` is the id of the session record this tool filed for the run, or null when it could not
 * be filed. The run is told to send it as x-mole-office-session, so a message the run writes for
 * itself at POST /api/records is known to be this run's and counted against the per-run limit
 * (problem 0WNMf6-hqt1x). Without a record there is nothing true to tell it, so the line is left out.
 */
function promptFor(run, hasKey, runRecord) {
  if (typeof run.actorId !== 'string' || run.actorId.trim() === '') throw new Error('The claimed run names no writer.')
  const lines = []
  lines.push('You have been asked something through Mole Office, the tracker this project runs on.')
  lines.push('')
  lines.push('Mole Office is at ' + API + '. Read GET /api first, then GET /api/kinds before you write anything.')
  lines.push('Send these headers on every request, reads included:')
  lines.push('  x-mole-office-workspace: ' + String(run.workspaceId))
  lines.push('  x-mole-office-actor-type: agent')
  lines.push('  x-mole-office-actor-id: ' + String(run.actorId))
  if (runRecord !== null) lines.push('  x-mole-office-session: ' + runRecord)
  if (hasKey) lines.push('  x-mole-office-key: read your own key from the file the MOLE_AGENT_KEY_FILE environment variable names. Never print it or write it into a record.')
  lines.push('')
  lines.push('RULES YOU MUST KEEP.')
  lines.push('- You are an agent. You will get 403 on writing a decision. That is correct and it is not a bug to work around. If what is asked of you needs a governance choice, file a PROPOSAL naming the fork and the options, and carry on with the rest.')
  lines.push('- Never retry a refused write with a human actor header. That would put a false name in a permanent change log.')
  lines.push('- Record what you actually observed. If you could not do something, say so rather than describing what would probably have happened.')
  lines.push('- Write in plain language. One idea per sentence. The person reading this is not in your session.')
  lines.push('')
  if (run.thread?.mode === 'review') {
    lines.push('THIS IS A REVIEW. The person looked at several places and wrote a comment at each one, then pressed Finish review. The comments arrive together and each one names what it was about. Answer each on its own terms; they are not one question.')
  } else {
    lines.push('This is one message about one thing.')
  }
  lines.push('')
  lines.push('WHAT WAS SAID, AND WHAT EACH COMMENT WAS ABOUT:')
  lines.push('')
  for (const [n, message] of (run.messages ?? []).entries()) {
    lines.push('--- ' + String(n + 1) + ' of ' + String((run.messages ?? []).length) + ' ---')
    lines.push('What they want: ' + String(message.intent ?? 'not said'))
    if (message.contextSaid !== undefined && message.contextSaid !== null) {
      lines.push('About: ' + String(message.contextSaid))
    }
    if (message.context !== undefined && message.context !== null) {
      lines.push('Exactly: ' + JSON.stringify(message.context))
    }
    lines.push('They wrote:')
    lines.push(String(message.body ?? '').split('\n').map((l) => '  ' + l).join('\n'))
    lines.push('')
  }
  if (typeof run.contextNote === 'string' && run.contextNote !== '') {
    lines.push('WHAT MOLE OFFICE ADDED ABOUT THAT CONTEXT:')
    lines.push(run.contextNote)
    lines.push('')
  }
  lines.push('WHEN YOU HAVE FINISHED, put your work into Mole Office — an updated record, a proposal, a report, a problem, whatever the work actually was. A useful answer left only in this terminal is lost the moment this process ends.')
  lines.push('')
  lines.push('Then make the LAST thing you print a single JSON object and nothing else, on one line:')
  lines.push('{"answer":"<a few sentences for the person>","wrote":[{"id":"<record id>","what":"<what you did to it>"}],"focus":{"record":"<a record id worth opening, or leave focus out>"}}')
  lines.push('If you wrote nothing, send an empty list. Do not invent an id.')
  lines.push('')
  // WHAT HAPPENS TO `answer` IS WORTH THE AGENT KNOWING. Since 19 August 2026 Mole Office puts it into
  // the conversation as a message from you, and the person can select part of it and write back
  // against those exact words. So it is read by a person in a thread rather than filed in a log,
  // and an answer with no words in it leaves that thread with no reply in it.
  lines.push('Your "answer" is shown to the person as your reply in this conversation, and they can point at part of it and write back. Write it for them to read. If you say nothing there, the conversation shows no reply from you.')
  return lines.join('\n')
}

/**
 * WHICH MODEL THIS RUN IS GIVEN, AND WHY. Criterion U2.
 *
 * A --model flag a person typed wins. Otherwise the office is asked, for the durable agent the run
 * serves, what a claude-code builder run of that agent gets: its own model, its role card's
 * row in the Casting table, or the office's .env. An older run that names no registered agent has no profile to read, so it takes MOLE_OFFICE_AGENT_MODEL from
 * the settings of the machine this worker runs on. When the office cannot
 * answer, or names no model, the run is not started, and the reason is posted as its result.
 */
async function theModelForThisRun(work) {
  if (MODEL_FLAG !== null) return { model: MODEL_FLAG, says: 'the --model flag says so' }
  const serves = await theAgentThisRunServes(work)
  if (serves.why !== null) return { model: null, says: serves.why }
  const agentId = serves.agentId
  if (agentId === null) {
    // THE OFFICE SHIPS NO DEFAULT MODEL, as FLO-05 of a decision says, so this is
    // null when nobody set it, and the caller then refuses the run.
    const model = settingValue('MOLE_OFFICE_AGENT_MODEL')
    return {
      model,
      says: model === null
        ? 'this run serves no registered agent, and MOLE_OFFICE_AGENT_MODEL in this machine\'s settings names no model'
        : 'this run serves no registered agent, so MOLE_OFFICE_AGENT_MODEL in this machine\'s settings decides',
    }
  }
  const asked = await ask('/api/office/run-models/for/' + encodeURIComponent(agentId) + '?place=builder&runtime=' + RUNTIME)
  if (!asked.ok) {
    return { model: null, says: 'the office did not say which model agent ' + agentId + ' gets (HTTP ' + String(asked.status) + '): ' + JSON.stringify(asked.body).slice(0, 300) }
  }
  if (typeof asked.body?.model !== 'string' || asked.body.model === '') {
    return { model: null, says: 'the office names no model for agent ' + agentId + ': ' + String(asked.body?.says ?? '') }
  }
  return { model: asked.body.model, says: String(asked.body.says ?? '') }
}

/**
 * THE DURABLE AGENT A RUN SERVES, as the id of the agent's own record, or null when it serves none;
 * `why` says why it could not be read, and is null when it could.
 *
 * Dispatch stores it on the request. Older requests are read from the conversation: each of the run's own
 * messages names its recipient there, and a message addressed to a durable agent stores the id of
 * that agent's record, an exact id rather than a name. The office's door reads that id to its agent.
 * Two different agents on one run's messages is a broken assumption, and is said rather than chosen.
 */
async function theAgentThisRunServes(work) {
  if (typeof work.agentId === 'string' && work.agentId !== '') return { agentId: work.agentId, why: null }
  const threadId = work.thread?.id
  if (typeof threadId !== 'string' || threadId === '') return { agentId: null, why: 'the run names no conversation to read its agent from' }
  const read = await ask('/api/agent/threads/' + encodeURIComponent(threadId), { headers: { 'x-mole-office-workspace': String(work.workspaceId) } })
  if (!read.ok) return { agentId: null, why: 'the conversation ' + threadId + ' could not be read (HTTP ' + String(read.status) + ')' }
  const mine = new Set((work.messages ?? []).map((one) => one?.id))
  const named = new Set(
    (read.body?.messages ?? [])
      .filter((one) => mine.has(one?.id) && one?.recipient?.kind === 'agent')
      .map((one) => one.recipient.agentId)
      .filter((id) => typeof id === 'string' && id !== ''),
  )
  if (named.size > 1) return { agentId: null, why: 'the run\'s messages are addressed to ' + String(named.size) + ' different agents' }
  return { agentId: named.size === 1 ? [...named][0] : null, why: null }
}

function runClaude(prompt, resumeId, model, runKey, startValues) {
  return new Promise((settled) => {
    // THE PROMPT GOES ON THE CHILD'S STDIN, NOT IN ITS ARGUMENTS. Problem 3skPvjYAjw_4: the kernel
    // refuses one argument over 128 KiB, and spawn then throws E2BIG out of this function, which
    // killed the whole worker with nothing posted for the run. `claude -p` with no prompt argument
    // reads the prompt from stdin, which is what tools/the-inspector.mjs does too.
    const argv = ['-p', '--output-format', 'json', '--model', model]
    if (typeof resumeId === 'string' && resumeId !== '') argv.push('--resume', resumeId)
    // THE RUN'S OWN KEY, AS A FILE AND NEVER AS ITS VALUE, AND NO OTHER. The child's tools read a key from the file
    // MOLE_AGENT_KEY_FILE names (for-agents/agent-key.mjs), so the key is in no environment. A key or a key file the
    // worker's own environment holds is the worker's starter's, and neither reaches the child. The file is made new,
    // mode 0600, alone in a folder of mode 0700 made for this run, and the folder goes when the child ends.
    const env = { ...process.env }
    delete env.MOLE_AGENT_KEY
    delete env.MOLE_AGENT_KEY_FILE
    let keyFolder = null
    const done = (outcome) => {
      if (keyFolder !== null) rmSync(keyFolder, { recursive: true, force: true })
      settled(outcome)
    }
    if (runKey !== null) {
      try {
        keyFolder = mkdtempSync(join(tmpdir(), 'mole-office-run-key-'))
        env.MOLE_AGENT_KEY_FILE = join(keyFolder, 'run.key')
        writeFileSync(env.MOLE_AGENT_KEY_FILE, runKey + '\n', { mode: 0o600, flag: 'wx' })
      } catch (e) {
        done({ ok: false, why: 'The run\'s key could not be put in a file of its own, so claude was not started: ' + (e instanceof Error ? e.message : String(e)) })
        return
      }
    }
    let child
    try {
      const given = startValues
      say(`model ${model}; ${given.start.words}`)
      child = spawn(given.command[0], given.command.slice(1), { cwd: process.cwd(), env: { ...env, ...given.env }, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (e) {
      // A spawn that throws (E2BIG, for one) is this run failing to start, and the run says so.
      // The worker goes on to the next run.
      done({ ok: false, why: 'The claude command could not be started: ' + (e instanceof Error ? e.message : String(e)) })
      return
    }
    // A child that exits before reading all of its prompt closes the pipe under us. That is said
    // when the child's exit is read below, so the exit code, the more telling fact, comes first.
    let promptTrouble = null
    child.stdin.on('error', (e) => { promptTrouble = e.message })
    child.stdin.end(prompt)
    activeChild = child
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      try { child.kill('SIGTERM') } catch { /* already gone */ }
    }, RUN_LIMIT_MS)
    child.stdout.on('data', (d) => { out += String(d) })
    child.stderr.on('data', (d) => { err += String(d) })
    child.on('error', (e) => { clearTimeout(timer); done({ ok: false, why: 'The claude command could not be started: ' + e.message }) })
    child.on('close', (code) => {
      activeChild = null
      clearTimeout(timer)
      const unread = promptTrouble === null ? '' : ' The prompt could not be written to it: ' + promptTrouble + '.'
      if (code !== 0) {
        done({ ok: false, why: 'claude exited ' + String(code) + '. ' + (err.trim().slice(0, 800) || 'It printed nothing on the error channel.') + unread })
        return
      }
      if (promptTrouble !== null) {
        done({ ok: false, why: 'claude exited 0, but it did not read its whole prompt.' + unread })
        return
      }
      let envelope = null
      try { envelope = JSON.parse(out) } catch {
        done({ ok: false, why: 'claude answered something that is not JSON. First 400 characters: ' + out.slice(0, 400) })
        return
      }
      done({ ok: true, envelope })
    })
  })
}

/**
 * Read the agent's final JSON object, or say honestly that there was not one.
 *
 * IT DOES NOT LOOK FOR THE LAST OPENING BRACE. That was the first thing this did and it is wrong:
 * an object with a nested object in it has its last `{` somewhere in the middle, so the parse fails
 * and a perfectly good answer is reported as unstructured. Measured on 18 August 2026 on the first
 * real run this worker ever did.
 *
 * So: find the last closing brace, then try every opening brace before it, nearest first, and take
 * the first slice that parses. Agents write a sentence before the object often enough that
 * demanding nothing but JSON would be a rule this worker breaks on its own runs.
 */
function resultFrom(envelope) {
  const said = typeof envelope.result === 'string' ? envelope.result : ''
  const end = said.lastIndexOf('}')
  if (end !== -1) {
    // Walk the opening braces backwards, nearest to the end first. `lastIndexOf` clamps a negative
    // start index to 0 rather than answering -1, so a brace at position 0 would be found for ever;
    // that is what the explicit stop is for.
    const starts = []
    for (let at = said.lastIndexOf('{', end); at !== -1; at = said.lastIndexOf('{', at - 1)) {
      starts.push(at)
      if (at === 0) break
    }
    for (const at of starts) {
      let parsed = null
      try { parsed = JSON.parse(said.slice(at, end + 1)) } catch { continue }
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) continue
      if (typeof parsed.answer !== 'string') continue
      return {
        answer: parsed.answer,
        wrote: Array.isArray(parsed.wrote) ? parsed.wrote : [],
        focus: typeof parsed.focus === 'object' && parsed.focus !== null ? parsed.focus : null,
        structured: true,
        // What the agent said around the object is kept, because it sometimes says why it did
        // nothing, and throwing that away would lose the honest half of an answer.
        alsoSaid: (said.slice(0, at) + said.slice(end + 1)).trim() || undefined,
      }
    }
  }
  return {
    answer: said,
    wrote: [],
    focus: null,
    structured: false,
    note: 'The agent did not end with a JSON object, so nothing here says which records it wrote or what to open. Its own words are above, whole.',
  }
}

async function serve(run) {
  const wants = run.runtime ?? RUNTIME
  if (wants !== RUNTIME) { say('leaving', run.id, '— it asks for', wants, 'and this worker is', RUNTIME); return false }

  const resumeId = run.resume?.externalId ?? null
  if (resumeId !== null && !canResume(resumeId)) {
    say('declining', run.id, '— it is addressed to a session whose transcript is not on this machine')
    await ask('/api/agent/runs/' + run.id + '/result', {
      method: 'POST',
      body: JSON.stringify({
        error: 'This worker cannot pick that agent up again. Its session transcript is not on this machine, so resuming it here would start a new agent that has never seen the work. Nothing was run. Send this to a new agent instead, or run a worker on the machine that agent was on.',
        declined: true,
      }),
    })
    return true
  }

  if (DRY) { say('would take', run.id, JSON.stringify(run).length, 'bytes of context'); return true }

  if (stopping) return false
  // The session owns the registered process, so the office can check a claim after this worker dies.
  const claimed = await ask('/api/agent/runs/' + run.id + '/claim', { method: 'POST', body: JSON.stringify({ worker: sessionRecordId ?? WORKER }) })
  if (!claimed.ok) { say('could not claim', run.id, '—', claimed.status, JSON.stringify(claimed.body).slice(0, 200)); return false }
  const work = claimed.body?.run ?? claimed.body
  say('running', run.id, resumeId === null ? '(a new agent)' : '(picking up ' + resumeId + ')')

  const chosen = await theModelForThisRun(work)
  if (stopping) {
    await ask('/api/agent/runs/' + run.id + '/result', { method: 'POST', body: JSON.stringify({ error: 'The dispatch worker was stopped before this run answered.' }) })
    return true
  }
  if (chosen.model === null) {
    const why = 'Nothing was run, because ' + chosen.says + '. Start this worker with --model <name>, or cast its role on the Casting page.'
    say('not starting', run.id, '—', why)
    await ask('/api/agent/runs/' + run.id + '/result', { method: 'POST', body: JSON.stringify({ error: why, tookMs: 0 }) })
    return true
  }
  say('model for', run.id, '—', chosen.model + ',', chosen.says)

  let startValues
  try {
    const who = await theAgentThisRunServes(work)
    const argv = ['claude', '-p', '--output-format', 'json', '--model', chosen.model]
    if (typeof resumeId === 'string' && resumeId !== '') argv.push('--resume', resumeId)
    // WHEN THE CLAUDE CODE RUN COMPACTS: MOLE_OFFICE_CLAUDE_COMPACTS_AT_ON_THE_HOST, read at every start, as the message
    // worker reads it (src/config/the-compaction-window.mjs). In a sandbox it keeps the sandbox's window. A value Claude
    // Code does not take is refused here, and the run says why. Until wave 13q round 64 this worker gave no window.
    const window = theConversationsWindow(process.env)
    const asks = await aCommandsStartFromTheOffice(argv, { api: API, agent: who.agentId, runtime: RUNTIME,
      model: chosen.model, workspace: String(work.workspaceId), headers: headers(),
      env: window === null ? process.env : { ...process.env, [THE_COMPACTION_VARIABLE]: window.tokens },
      ...(window === null ? {} : { envFrom: { [THE_COMPACTION_VARIABLE]: window.from } }) })
    startValues = window === null ? asks : theCompactionWindowGiven(asks, window)
  }
  catch (error) {
    const why = error instanceof Error ? error.message : String(error)
    say('not starting', run.id, '—', why)
    await ask('/api/agent/runs/' + run.id + '/result', { method: 'POST', body: JSON.stringify({ error: why, tookMs: 0 }) })
    return true
  }

  const runRecord = await fileThisRunsRecord(run.id, chosen.model, startValues.start.effort)
  const started = Date.now()
  const runKey = typeof claimed.body?.runKey === 'string' ? claimed.body.runKey : null
  const ran = await runClaude(promptFor(work, runKey !== null, runRecord), resumeId, chosen.model, runKey, startValues)
  const tookMs = Date.now() - started

  if (stopping) {
    const why = 'The dispatch worker was stopped before this run answered.'
    await endThisRunsRecord(runRecord, { state: 'crashed', doing: why })
    await ask('/api/agent/runs/' + run.id + '/result', { method: 'POST', body: JSON.stringify({ error: why, tookMs }) })
    return true
  }
  if (!ran.ok) {
    say('failed', run.id, '—', ran.why)
    await endThisRunsRecord(runRecord, { state: 'crashed', doing: 'failed: ' + ran.why })
    await ask('/api/agent/runs/' + run.id + '/result', { method: 'POST', body: JSON.stringify({ error: ran.why, tookMs }) })
    return true
  }

  const read = resultFrom(ran.envelope)

  // WHAT THE MODEL SPENT IS KEPT, ON THIS RUN'S OWN SESSION RECORD.
  //
  // The envelope in hand is the same one the message worker's Claude adapter reads, so it is read
  // here through the one shared rule rather than worked out a second time. It is written before the
  // result is posted because the tokens were spent whether or not the answer reaches Mole Office.
  // An envelope that gave no count produces a receipt whose `says` names what was missing; nothing
  // is estimated and no zero is invented.
  //
  // IT IS THE RUN'S RECORD AND NOT THIS WORKER'S. Problem f8-ejfdHdNBJ: a worker serving several
  // runs wrote every receipt on its own one record, so each run's receipt replaced the last.
  const usageReceipt = claudeUsage(JSON.stringify(ran.envelope))
  // WHAT MODEL ANSWERED, from the same envelope and never from the model chosen above: HB1 of
  // design/honour-board/ACCEPTANCE.md. An envelope naming none gives "not reported".
  const served = aServed(theModelsInAResult(JSON.stringify(ran.envelope)) ?? [])
  await endThisRunsRecord(runRecord, { state: 'finished', doing: 'answered agent run ' + run.id, usageReceipt, served })

  const posted = await ask('/api/agent/runs/' + run.id + '/result', {
    method: 'POST',
    body: JSON.stringify({
      result: {
        answer: read.answer,
        wrote: read.wrote,
        focus: read.focus,
        structured: read.structured,
        note: read.note,
        alsoSaid: read.alsoSaid,
        runtime: { tool: 'claude-code', model: chosen.model, sessionId: ran.envelope.session_id ?? null, costUsd: ran.envelope.total_cost_usd ?? null, turns: ran.envelope.num_turns ?? null },
      },
      tookMs,
    }),
  })
  say(posted.ok ? 'done' : 'ran but could not post the result', run.id, String(Math.round(tookMs / 1000)) + 's')
  return true
}

/**
 * THE SESSION RECORD OF ONE RUN THIS WORKER SERVES, or null when it could not be filed.
 *
 * Problem f8-ejfdHdNBJ. The message worker files a record per run (startOne in src/worker/index.ts);
 * this tool filed only its own, so a receipt had nowhere to go but there. The record is filed in the
 * same project as the worker's own, names the agent run it is for in `extra.agentRun`, and names
 * the worker as the run that started it. It does not say `startedByMoleOffice`: the office did not
 * start this process, and the run already has the key its claim answered.
 */
async function fileThisRunsRecord(runId, model, effort) {
  const filed = await ask('/api/records', {
    method: 'POST',
    headers: { 'x-mole-office-workspace': 'panelx' },
    body: JSON.stringify({
      kind: 'session',
      title: 'Agent run ' + runId + ', served by the Mole Office agent worker',
      data: {
        state: 'running',
        runtime: RUNTIME,
        model,
        // The session API accepts a level or absence, while start.json uses null for no effort.
        ...(effort === null ? {} : { effort }),
        doing: 'serving agent run ' + runId,
        workingDirectory: process.cwd(),
        ...(sessionRecordId === null ? {} : { parentAttachment: sessionRecordId }),
        extra: { agentRun: runId },
      },
    }),
  })
  const id = filed.body?.record?.id ?? null
  if (id === null) say('WARNING: could not file a session record for run', runId, 'so its usage receipt has nowhere to go:', JSON.stringify(filed.body).slice(0, 300))
  return id
}

/** Write how one run ended on its own record. A record that was never filed is said, not guessed at. */
async function endThisRunsRecord(runRecord, dataPatch) {
  if (runRecord === null) return
  const kept = await ask('/api/records/' + runRecord, {
    method: 'PATCH',
    headers: { 'x-mole-office-workspace': 'panelx' },
    body: JSON.stringify({ dataPatch }),
  })
  if (!kept.ok) say('the run\'s own record', runRecord, 'was not updated:', kept.status, JSON.stringify(kept.body).slice(0, 200))
}

async function announceMyself() {
  const filed = await ask('/api/records', {
    method: 'POST',
    headers: { 'x-mole-office-workspace': 'panelx' },
    body: JSON.stringify({
      kind: 'session',
      // A TITLE PEOPLE READ IN THE OFFICE, so local wall-clock time; it said UTC until 24 September 2026 (acceptance finding 63).
      title: 'Mole Office agent worker, started ' + localStamp(new Date()).slice(0, 16),
      summary: 'The process that picks up queued agent runs from Mole Office and runs them with the Claude Code command. It writes nothing itself; the agents it starts write their own records.',
      data: { state: 'running', runtime: 'mole-office-agent-worker', doing: 'waiting for a run to be queued', workspace: process.cwd(), extra: { discovered: { pid: process.pid } } },
    }),
  })
  sessionRecordId = filed.body?.record?.id ?? null
  if (sessionRecordId === null) { say('WARNING: could not file a session record, so this worker is on no list.', JSON.stringify(filed.body).slice(0, 300)); return }

  const held = await ask('/api/resources', {
    method: 'POST',
    headers: { 'x-mole-office-workspace': 'panelx' },
    body: JSON.stringify({
      sessionRecordId,
      type: 'process',
      key: String(process.pid),
      detail: 'the Mole Office agent worker, polling ' + API + ' every ' + String(POLL_MS / 1000) + ' seconds',
      adopting: 'the worker registers itself under the session it filed after it started',
    }),
  })
  resourceId = held.body?.resource?.id ?? held.body?.id ?? null
  say('worker', WORKER, 'is session', sessionRecordId, resourceId === null ? '(UNREGISTERED — nothing knows this process is here)' : 'and resource ' + resourceId)
}

async function standDown(why) {
  if (stopping) return
  stopping = true
  say('stopping —', why)
  if (activeChild !== null) activeChild.kill('SIGTERM')
  if (serving !== null) await serving
  if (sessionRecordId !== null) {
    await ask('/api/records/' + sessionRecordId, {
      method: 'PATCH',
      headers: { 'x-mole-office-workspace': 'panelx' },
      body: JSON.stringify({ dataPatch: { state: 'finished', doing: 'stopped: ' + why } }),
    }).catch(() => {})
  }
  if (resourceId !== null) {
    // The ledger refuses to release a resource whose session has not ended, so the patch above has
    // to come first. It also asks for the confirm phrase it just showed; ask for it and send it back.
    const seen = await ask('/api/resources/' + resourceId + '/release', { method: 'POST', headers: { 'x-mole-office-workspace': 'panelx' }, body: JSON.stringify({}) }).catch(() => null)
    const phrase = seen?.body?.expect ?? seen?.body?.confirm ?? null
    if (typeof phrase === 'string') {
      await ask('/api/resources/' + resourceId + '/release', { method: 'POST', headers: { 'x-mole-office-workspace': 'panelx' }, body: JSON.stringify({ expect: phrase }) }).catch(() => {})
    }
  }
  process.exit(0)
}

if (has('help') || args.includes('-h')) {
  process.stdout.write([
    'node tools/agent-worker.mjs                 poll for ever, against ' + API,
    'node tools/agent-worker.mjs --once          take at most one run, then stop',
    'node tools/agent-worker.mjs --api <url>     somewhere else, including another machine',
    'node tools/agent-worker.mjs --model <name>  which model the runs use (now: ' + (MODEL_FLAG ?? 'asked of the office for each run') + ')',
    'node tools/agent-worker.mjs --dry           claim nothing; print what it would have taken',
    'node tools/agent-worker.mjs --every <ms>    how often to look (now: ' + String(POLL_MS) + ')',
    '',
    'It files a session record for itself and registers its own process before it does anything,',
    'because a process that is killed never reaches its own tidy-up.',
  ].join('\n') + '\n')
  process.exit(0)
}

// Each of the three stops the child and waits for it, so the run's key folder goes before the worker does.
process.on('SIGINT', () => { void standDown('interrupted') })
process.on('SIGTERM', () => { void standDown('asked to stop') })
process.on('SIGHUP', () => { void standDown('its terminal was closed') })

await announceMyself()
say('watching', API, 'for queued runs. Nothing here starts an agent until Mole Office has one waiting.')

for (;;) {
  const waiting = await ask('/api/agent/runs?state=queued').catch(() => ({ ok: false, status: 0, body: null }))
  if (!waiting.ok) {
    say('cannot read the queue —', String(waiting.status), 'Is Mole Office running at ' + API + '?')
  } else {
    const runs = waiting.body?.runs ?? []
    for (const run of runs) {
      serving = serve(run)
      const took = await serving
      serving = null
      if (took && ONCE) { await standDown('asked to take one run only'); }
    }
  }
  await new Promise((ok) => setTimeout(ok, POLL_MS))
}
