#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Settle the checks and reports nobody will complete, under a decision.
 *
 *   node tools/settle-owed-runs.mjs --agent <handle-or-id> [--agent <handle-or-id> ...]
 *   node tools/settle-owed-runs.mjs --run <id> [--run <id> ...] [--apply]
 *
 * Agent and run arguments may be mixed. Without --apply, only GET requests are sent.
 * MOLE_OFFICE_API, MOLE_OFFICE_WORKSPACE, MOLE_OFFICE_AGENT and MOLE_AGENT_KEY name
 * the office, project and caller. MOLE_OFFICE_SESSION, when present, attributes the acts.
 * The caller must be a secretary or the person, proved by its key. No database is opened.
 * Each apply attempt is kept as one JSON line in the named .logs/ file in this checkout.
 */

import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { anAgentsToolHeaders, theAgentKey } from './sandbox-common.mjs'
import { readSetting, settingValue, theEnvironmentsAddressIsForAnotherCopy, transientToolContext } from '../src/config/settings.mjs'
import { fileNameStamp } from '../src/shared/time.ts'

// The handles MOLE_OFFICE_SETTLE_PROTECTED_HANDLES names, from the environment or .env; none when it
// is not set or is empty. Their registry ids, including retired rows, are compared with the stored
// run identity. The person's runs are refused whatever this says.
const PROTECTED_HANDLES = String(settingValue('MOLE_OFFICE_SETTLE_PROTECTED_HANDLES') ?? '')
  .split(',')
  .map((handle) => handle.trim())
  .filter((handle) => handle !== '')
const HELP = `node tools/settle-owed-runs.mjs --agent <handle-or-id> | --run <id> [--apply]

Repeat or mix --agent and --run to select several agents or runs.
Without --apply this lists each owed run, its standing, why it is owed, and how it would settle.
With --apply it uses the same reading and settles one run at a time through the office's doors.
The first refusal or incomplete answer stops the batch. Each attempt is logged under .logs/.
The person's runs${PROTECTED_HANDLES.length === 0 ? '' : ` and those of ${PROTECTED_HANDLES.join(', ')}`} are protected, including when selected by run id.
MOLE_OFFICE_SETTLE_PROTECTED_HANDLES names the agents whose runs are protected, separated by commas.
Unreadable proofs are listed separately. Apply leaves those runs untouched and exits nonzero.

Required environment: MOLE_OFFICE_API, MOLE_OFFICE_WORKSPACE, MOLE_OFFICE_AGENT, MOLE_AGENT_KEY.
Optional environment: MOLE_OFFICE_SESSION. The key must prove a secretary or the person.`

const DECISION = 'madeUpglgfhp'

function argumentsOf(argv) {
  const targets = []
  let apply = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') return { help: true }
    if (arg === '--apply') { apply = true; continue }
    if (arg !== '--agent' && arg !== '--run') throw new Error(`Unknown argument "${arg}". Use --help.`)
    const value = argv[++i]
    if (!value || ['--agent', '--run', '--apply', '--help', '-h'].includes(value)) throw new Error(`${arg} needs a value. Use --help.`)
    targets.push({ kind: arg.slice(2), value })
  }
  if (targets.length === 0) throw new Error('Name at least one --agent or --run. Use --help.')
  return { targets, apply }
}

export async function settleOwedRuns(argv) {
  const chosen = argumentsOf(argv)
  if (chosen.help) { console.log(HELP); return }
  function required(name) {
    const read = readSetting(name, process.env)
    if (read.source !== 'the environment' || !read.value?.trim()) throw new Error(`${name} is required. Nothing was requested.`)
    return read.value
  }
  const api = required('MOLE_OFFICE_API').replace(/\/$/, '')
  // THE ADDRESS IS FOR THE SANDBOX'S OWN CHECKOUTS (problem JQ3yaANBi1JC).
  const refused = theEnvironmentsAddressIsForAnotherCopy(process.env)
  if (refused !== null) throw new Error(refused)
  const workspace = required('MOLE_OFFICE_WORKSPACE')
  const agent = required('MOLE_OFFICE_AGENT')
  const key = theAgentKey()
  if (!key?.trim()) throw new Error('MOLE_AGENT_KEY is required. Nothing was requested.')
  const session = transientToolContext().session
  const headers = {
    'content-type': 'application/json',
    'x-mole-office-workspace': workspace,
    ...anAgentsToolHeaders({ self: agent, key }),
    'x-mole-office-purpose': 'module-work',
    'x-mole-office-trace': 'settle-owed-runs',
    ...(session ? { 'x-mole-office-session': session } : {}),
  }
  async function ask(path, inWorkspace = workspace, body) {
    const method = body === undefined ? 'GET' : 'POST'
    const response = await fetch(api + path, {
      method, headers: { ...headers, 'x-mole-office-workspace': inWorkspace },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(120_000),
    })
    const text = await response.text()
    let answer
    try { answer = JSON.parse(text) } catch { answer = { error: `${method} ${path} answered without a JSON answer.`, body: text } }
    return { status: response.status, answer }
  }
  async function read(path, inWorkspace = workspace) {
    const heard = await ask(path, inWorkspace)
    if (heard.status !== 200) throw new Error(`GET ${path} refused with HTTP ${heard.status}: ${heard.answer.error ?? JSON.stringify(heard.answer)}`)
    return heard.answer
  }
  const participantPages = []
  const participantPaths = new Set()
  let participantNext = '/api/participants'
  while (participantNext !== null) {
    const n = participantPages.length + 1
    if (participantPaths.has(participantNext)) throw new Error(`The participant roster read stopped at page ${String(n)}: the office named a page that was already read. No rows were used.`)
    if (participantPages.length >= 200) throw new Error(`The participant roster read stopped at page ${String(n)}: it reads at most ${String(200)} pages. No rows were used.`)
    participantPaths.add(participantNext)
    const heard = await ask(participantNext)
    const participantAnswer = { ok: heard.status === 200, body: heard.status === 200 ? heard.answer : null }
    if (!participantAnswer.ok || participantAnswer.body === null) throw new Error(`The participant roster read stopped at page ${String(n)}: the office refused that page. No rows were used.`)
    participantPages.push(participantAnswer.body)
    participantNext = participantAnswer.body.next ?? null
  }
  const registry = { agents: participantPages.flatMap(page => page.agents ?? []) }
  const protectedIds = new Set(registry.agents.filter((agent) => PROTECTED_HANDLES.includes(agent.handle)).map((agent) => agent.id))
  function refuseProtected(agent, run) {
    if (agent === null || agent === undefined) throw new Error(`Run ${run} has no resolved agent. It was not settled.`)
    if (agent.kind === 'person' || protectedIds.has(agent.id)) {
      throw new Error(`${run ? `Run ${run}` : `Agent ${agent.handle}`} belongs to ${agent.handle ?? agent.id}, whose runs this tool protects. It was not settled.`)
    }
  }
  const runs = new Map()
  for (const target of chosen.targets) {
    if (target.kind === 'run') runs.set(`${workspace}/${target.value}`, { run: target.value, workspaceId: workspace })
    else {
      const listed = await read(`/api/checks/owed?agent=${encodeURIComponent(target.value)}`)
      refuseProtected(listed.agent, null)
      for (const run of listed.runs) runs.set(`${run.workspaceId}/${run.run}`, run)
    }
  }
  // Read all selections before applying any of them, so a protected run later in the list
  // refuses the request before the first act. The apply path reads each run again before its act.
  const readings = []
  for (const run of runs.values()) {
    const reading = await read(`/api/checks/${encodeURIComponent(run.run)}/how-it-would-settle`, run.workspaceId)
    if (reading.agent !== null || reading.settlement?.way !== 'could not be read') refuseProtected(reading.agent, reading.run)
    readings.push(reading)
  }
  const counts = { owed: 0, superseded: 0, 'closed unchecked': 0, 'could not be read': 0, settled: 0 }
  const unreadable = []
  let log
  if (chosen.apply) {
    mkdirSync(resolve('.logs'), { recursive: true })
    log = resolve('.logs', `settle-owed-runs-${fileNameStamp(new Date())}-${randomUUID()}.jsonl`)
    writeFileSync(log, '', { flag: 'wx', mode: 0o600 })
    console.log(`Log: ${log}`)
  }
  function record(reading, status, answer, skipped = false) {
    appendFileSync(log, JSON.stringify({ run: reading.run, agent: reading.agent, way: reading.settlement.way, status, answer, ...(skipped ? { skipped: true } : {}) }) + '\n')
  }
  for (const firstReading of readings) {
    const reading = chosen.apply
      ? await read(`/api/checks/${encodeURIComponent(firstReading.run)}/how-it-would-settle`, firstReading.workspaceId)
      : firstReading
    if (reading.agent !== null || reading.settlement?.way !== 'could not be read') refuseProtected(reading.agent, reading.run)
    if (reading.owed === null) { console.log(`${reading.run} (${reading.agent.handle}): nothing is owed.`); continue }
    counts.owed++
    counts[reading.settlement.way]++
    if (reading.settlement.way === 'could not be read') {
      unreadable.push(reading)
      if (chosen.apply) record(reading, 200, reading.settlement, true)
      continue
    }
    const { settlement } = reading
    const because = settlement.way === 'closed unchecked'
      ? `${settlement.because} Decision ${DECISION} authorizes keeping these runs as an archive without completing their outstanding checks or reports.`
      : settlement.because
    console.log(`${reading.run} (${reading.agent.handle}, ${reading.agent.id}): ${reading.owed.standing}; ${reading.owed.waitingFor || 'No waiting reason was recorded.'}`)
    console.log(settlement.way === 'superseded'
      ? `  superseded by ${settlement.by}; proof: ${settlement.proof.how}${settlement.statement ? `; statement: ${settlement.statement}` : ''}`
      : `  closed unchecked: ${because}`)
    if (chosen.apply) {
      const door = settlement.way === 'superseded' ? 'superseded' : 'closed-unchecked'
      const body = settlement.way === 'superseded'
        ? { by: settlement.by, because, ...(settlement.statement ? { statement: settlement.statement } : {}) }
        : { because, decision: DECISION }
      let heard
      try { heard = await ask(`/api/checks/${encodeURIComponent(reading.run)}/${door}`, reading.workspaceId, body) }
      catch (error) {
        record(reading, null, { error: error.message })
        throw new Error(`Run ${reading.run} answered no complete response: ${error.message}. The batch stopped; read the run before retrying. Log: ${log}`)
      }
      record(reading, heard.status, heard.answer)
      if (heard.status !== 201 || heard.answer?.stands?.standing !== settlement.way) {
        throw new Error(`Run ${reading.run} was not confirmed ${settlement.way}: HTTP ${heard.status}; ${heard.answer?.error ?? JSON.stringify(heard.answer)}. The batch stopped. Log: ${log}`)
      }
      counts.settled++
    }
  }
  if (unreadable.length > 0) {
    console.log('Could not be read; these runs will remain unsettled:')
    for (const reading of unreadable) {
      console.log(`${reading.run} (${reading.agent?.handle ?? 'agent not placed'}, ${reading.agent?.id ?? 'no agent id'}): ${reading.owed.standing}; ${reading.owed.waitingFor}`)
      for (const candidate of reading.settlement.candidates) console.log(`  ${candidate.by ?? 'sealed repository'}: ${candidate.because}`)
    }
  }
  console.log(`Count: ${counts.owed} owed; ${counts.superseded} superseded; ${counts['closed unchecked']} closed unchecked; ${counts['could not be read']} could not be read; ${counts.settled} settled.`)
  if (chosen.apply && unreadable.length > 0) throw new Error(`${unreadable.length} runs could not be read and remain unsettled. Log: ${log}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  settleOwedRuns(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1 })
}
