// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** An automatic code author uses an ordinary child session, report, seal and inspection. */
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, sep } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { A_KEY_SHOWN_AS, withoutKeys } from './office-request.mjs'
import { readReceiptEvidenceObject } from './stable/stable-upgrade-evidence.mjs'
import { SHIPPED_CHAPTER_NUMBERS } from '../src/shared/chapter-check.ts'
import { clockStamp } from '../src/shared/time.ts'

const fail = words => { throw new Error(withoutKeys(`Fix round author refused: ${words}`)) }
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value)
const read = (io, path, allowIgnoredMasks = false) => readReceiptEvidenceObject(io.officeRequest, path, allowIgnoredMasks)

/** GET restore resolves the supplied key, rather than trusting the configured role or handle. */
export async function requireFixRoundController(options, io) {
  const who = options.identity
  if (!id(who?.agent) || !id(who?.run) || !id(who?.workspace) || !id(options.sheriff?.agent)) fail('Name the secretary run identity and sheriff explicitly.')
  const restored = await read(io, '/api/restore', true)
  if (restored.agent?.retired !== false || restored.card?.readAs !== 'secretary' || ![restored.agent.id, restored.agent.handle].includes(who.agent)) fail('The supplied own identity does not hold the active secretary card.')
  const run = (await read(io, `/api/records/${who.run}`, true)).record
  if (run?.kind !== 'session' || run.workspaceId !== who.workspace || run.data.state !== 'running' || run.data.servingAgentId !== restored.agent.id || !id(run.data.extra?.runKeyId)) fail('The controller must be its own currently running secretary run with its own run key.')
  const sheriff = (await read(io, `/api/participants/agent/${options.sheriff.agent}`)).participant
  if (sheriff?.retired !== false || sheriff.startedBy?.kind !== 'agent' || sheriff.startedBy.id !== restored.agent.id) fail('The secretary must also be the sheriff\'s registered starter.')
  return { agent: restored.agent.id, run: who.run, sheriff, sandbox: run.data.sandbox }
}

/** Validate the explicit local inputs; the ordinary filing transaction vouches for the sandbox itself. */
function handInputs(options, controller) {
  const { controllerSandbox: sandbox, authorBrief: brief, prepared } = options
  if (!sandbox || !isAbsolute(sandbox.folder ?? '') || !id(sandbox.container)
    || controller.sandbox?.folder !== sandbox.folder || controller.sandbox?.container !== sandbox.container
    || realpathSync(sandbox.folder) !== sandbox.folder) fail('Name the controller sandbox exactly as its running Office session records it.')
  if (!brief || !isAbsolute(brief.path ?? '') || !/^[a-f0-9]{64}$/.test(brief.sha256 ?? '')
    || !existsSync(brief.path)) fail('Name the author brief and its exact SHA-256 digest.')
  const stat = lstatSync(brief.path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || realpathSync(brief.path) !== brief.path
    || !brief.path.startsWith(sandbox.folder + sep)) fail('The author brief must be an independent canonical file inside the controller sandbox.')
  const bytes = readFileSync(brief.path)
  if (bytes.length === 0 || createHash('sha256').update(bytes).digest('hex') !== brief.sha256) fail('The author brief bytes differ from the configured digest or are empty.')
  if (!isAbsolute(prepared?.clone ?? '') || realpathSync(prepared.clone) !== prepared.clone
    || !prepared.clone.startsWith(sandbox.folder + sep)) fail('The prepared author clone must be inside the controller sandbox.')
  return { request: { askedBy: controller.run, brief: brief.path, cutFrom: prepared.base },
    brief: { path: brief.path, sha256: brief.sha256, bytes: bytes.length, base64: bytes.toString('base64') } }
}

function loadJournal(path, configuration) {
  if (!isAbsolute(path ?? '') || !existsSync(dirname(path)) || realpathSync(dirname(path)) !== dirname(path)) fail('Name an external canonical author journal with an existing parent directory.')
  if (!existsSync(path)) return { version: 1, configuration, actions: {} }
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || realpathSync(path) !== path) fail('The author journal is not an independent regular file.')
  const state = JSON.parse(readFileSync(path, 'utf8'))
  if (state.version !== 1 || !isDeepStrictEqual(state.configuration, configuration)) fail('The author journal correlation differs; retain it for supervised recovery.')
  return state
}
function save(path, state) {
  const next = `${path}.${randomUUID()}.new`
  writeFileSync(next, JSON.stringify(state, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  renameSync(next, path)
}

async function send(io, request) {
  const reply = await io.officeRequest(request)
  if (!reply || reply.location !== null || reply.cut !== false || reply.status < 200 || reply.status >= 300) fail(`${request.method} ${request.path} was not accepted (${reply?.status ?? 'no answer'}): ${reply?.body?.slice(0, 1500) ?? 'no response'}; reconcile the retained journal before retrying.`)
  let body
  try { body = JSON.parse(reply.body) } catch { fail('An Office mutation returned unreadable JSON.') }
  // The child receives a key on filing; this controller neither uses nor retains that key.
  const { runKey: ignoredKey, ...kept } = body
  void ignoredKey
  if (JSON.stringify(kept).includes(A_KEY_SHOWN_AS)) fail('An Office mutation has masked correlation facts.')
  return kept
}

/** A lost response is reconciled from original creation facts, never blindly posted again. */
async function recordAction({ io, journal, state, name, kind, title, data, hand = {}, controller }) {
  const request = { method: 'POST', path: '/api/records', body: { kind, title, data, ...hand } }
  const action = state.actions[name]
  if (action?.request && !isDeepStrictEqual(action.request, request)) fail('The retained original filing request correlation differs.')
  const matches = original => original.op === 'create' && original.content?.kind === kind && original.content.title === title
    && isDeepStrictEqual(original.content.data, data) && original.who?.actorType === 'agent'
    && [controller.agent, state.configuration.identity.agent].includes(original.who.actorId)
    && original.who.sessionId === controller.run && original.provedBy === 'an-agent-key'
  if (action?.id) {
    if (!matches(await read(io, `/api/records/${action.id}/revisions/1`))) fail('The original author filing no longer matches its retained request and controller.')
    return action.id
  }
  if (action && action.state !== 'not-sent') {
    const page = await read(io, `/api/records?kind=${kind}&q=${encodeURIComponent(title)}&limit=25&offset=0`)
    if (!Array.isArray(page.records) || page.records.length > 25 || page.records.length === 25) fail('The child filing reconciliation is incomplete; retain the journal.')
    const candidates = []
    for (const record of page.records) {
      const original = await read(io, `/api/records/${record.id}/revisions/1`)
      if (matches(original)) candidates.push(record.id)
    }
    if (candidates.length !== 1) fail(`The ${name} filing is ambiguous after interruption or lost response; ${candidates.length} originals match. No duplicate was filed. Journal: ${journal}`)
    state.actions[name] = { ...action, state: 'recorded', id: candidates[0] }; save(journal, state)
    return candidates[0]
  }
  state.actions[name] = { state: 'planned', request }
  save(journal, state)
  let reply
  try { reply = await send(io, state.actions[name].request) }
  catch (error) {
    if (error.code === 'MAIN_SUITE_PERSON_STOP' && error.notSent === true) { state.actions[name].state = 'not-sent'; save(journal, state) }
    throw error
  }
  if (!id(reply.record?.id) || reply.record.kind !== kind) fail('The child filing has no exact record identity.')
  state.actions[name] = { ...state.actions[name], state: 'recorded', id: reply.record.id }; save(journal, state)
  return reply.record.id
}

/** One bounded poll. Pending inspection remains pending, and never means submitted or returned. */
export async function fixRoundAuthorTick(options, supplied = {}) {
  const io = { officeRequest: request => import('./main-suite-fix-round.mjs').then(({ fixRoundProgramRequest }) => fixRoundProgramRequest(request, { env: options.env ?? process.env })), clock: () => new Date(), ...supplied }
  const controller = await requireFixRoundController(options, io)
  const { author, prepared, journal } = options
  if (!id(author?.handle) || typeof author.name !== 'string' || !Array.isArray(author.workArea) || author.workArea.length === 0 || !id(options.problem)) fail('Name the registered tool author, real work area and authoritative problem.')
  const hand = handInputs(options, controller)
  const configuration = { identity: options.identity, controllerSandbox: options.controllerSandbox, authorBrief: options.authorBrief, author, prepared, problem: options.problem, receipt: options.receipt }
  const state = loadJournal(journal, configuration)
  if (state.brief && !isDeepStrictEqual(state.brief, hand.brief)) fail('The retained author brief correlation differs; keep its original bytes for recovery.')
  state.brief = hand.brief
  const rules = readFileSync(new URL('../src/config/rules/CODE.md', import.meta.url))
  // Every shipped chapter, read from the shipped file, so a card that names a role chapter finds it in the report.
  if (!SHIPPED_CHAPTER_NUMBERS.every(chapter => rules.toString('utf8').includes(`## Chapter ${chapter} — `))) fail('The code author could not read every current rule chapter.')
  const rulesDigest = createHash('sha256').update(rules).digest('base64')
  if (state.rulesDigest && state.rulesDigest !== rulesDigest) fail('The author rules changed after its retained plan; reconcile the report rather than replacing its source claim.')
  state.rulesDigest = rulesDigest; save(journal, state)
  state.day ??= clockStamp(io.clock).stamp.slice(0, 10)
  if (prepared.clone === '/' || !isAbsolute(prepared.clone) || realpathSync(prepared.clone) !== prepared.clone) fail('Name the actual isolated revert clone.')
  const problem = (await read(io, `/api/records/${options.problem}`)).record
  if (problem?.kind !== 'problem' || problem.deletedAt !== null) fail('The authoritative problem is unavailable.')
  // The registration door is already idempotent by exact handle; verify the stored starter and area.
  const lookup = await io.officeRequest({ method: 'GET', path: `/api/participants/agent/${author.handle}` })
  if (lookup.status === 404) {
    if (state.actions.registration && state.actions.registration.state !== 'not-sent') fail('The author registration is unresolved; retain the journal instead of registering twice.')
    state.actions.registration = { state: 'planned' }; save(journal, state)
    try { await send(io, { method: 'POST', path: '/api/agents/started', body: { ...author, role: 'worker', noKey: true } }) }
    catch (error) {
      if (error.code === 'MAIN_SUITE_PERSON_STOP' && error.notSent === true) { state.actions.registration.state = 'not-sent'; save(journal, state) }
      throw error
    }
  } else if (lookup.status !== 200 || lookup.cut !== false || lookup.location !== null) fail('The author registration could not be read.')
  const registered = (await read(io, `/api/participants/agent/${author.handle}`)).participant
  if (registered?.retired !== false || registered.startedBy?.kind !== 'agent' || registered.startedBy.id !== controller.agent || registered.runtime !== null || !isDeepStrictEqual(registered.workArea, author.workArea)) fail('The code author is not this secretary\'s registered no-model child with the configured work area.')
  state.actions.registration = { state: 'recorded', id: registered.id }; save(journal, state)
  const token = `fixround${options.receipt.recordId.replace(/[^A-Za-z0-9]/g, '')}${options.receipt.contentHash}`
  const run = await recordAction({ io, journal, state, name: 'session', kind: 'session', hand: hand.request, controller, title: `${token} automatic take-out`, data: {
    state: 'running', runtime: 'mole-office', servingAgent: author.handle, servingAgentId: registered.id,
    workingDirectory: prepared.clone, cutFrom: prepared.base, tip: prepared.commit, parentAttachment: options.identity.run,
    doing: 'Automatic verified revert preparation; no model run.', submission: { kind: 'git' },
    extra: { mainSuiteFixAuthor: { problem: options.problem, receipt: options.receipt, controller: options.identity.run } },
  } })
  // The Office measured this hand ask in the filing transaction. Re-read it even after a lost reply.
  const askingRun = (await read(io, `/api/records/${controller.run}`, true)).record
  const childFacts = (await read(io, `/api/records/${run}`, true)).record
  const entry = askingRun?.data.workerRuns?.[registered.id]
  const expectedBrief = { path: hand.brief.path, sha256: hand.brief.sha256, bytes: hand.brief.bytes }
  if (entry?.state !== 'started' || entry.byHand !== true
    || !isDeepStrictEqual(entry.askedBy, { who: { kind: 'agent', id: controller.agent }, session: controller.run })
    || !isDeepStrictEqual(entry.brief, expectedBrief)
    || !isDeepStrictEqual(entry.sandbox, { ...options.controllerSandbox, instance: basename(options.controllerSandbox.folder) })
    || !isDeepStrictEqual(entry.cut, { commit: prepared.base, named: prepared.base })
    || entry.started?.run !== run || !id(entry.started?.runKeyId) || entry.started.runKeyId !== childFacts?.data.extra?.runKeyId) fail('The Office hand-start correlation no longer matches the retained author filing.')
  const report = await recordAction({ io, journal, state, name: 'report', kind: 'report', controller, title: `${token} take-out evidence`, data: {
    for: author.handle, date: state.day, chaptersRead: [...SHIPPED_CHAPTER_NUMBERS], source: `Automatic code author; controller ${options.identity.run}; no model was started. Read every CODE.md chapter; SHA-256 base64 ${rulesDigest}.`,
    blocks: [{ id: 'prepared', type: 'text', heading: 'Verified revert prepared', text: `Prepared ${prepared.commit} over ${prepared.base} in ${prepared.clone}. Targets: ${prepared.takesOut.join(', ')}. This report claims preparation only; inspection, submission and landing remain separate observed acts. A revert may add or delete test files; the test-audit table is left for the merge queue, which regenerates it.` }],
  } })
  if (state.actions.forms?.state !== 'recorded') {
    const original = await read(io, `/api/records/${report}/revisions/1`)
    state.actions.forms = { state: 'planned' }; save(journal, state)
    await send(io, { method: 'POST', path: `/api/records/${report}/short-forms`, body: { madeFrom: { seq: 1, contentHash: original.contentHash }, forms: {
      label: 'Prepared causal revert',
    } } })
    state.actions.forms = { state: 'recorded' }; save(journal, state)
  }
  const reportRead = await read(io, `/api/records/${report}`)
  if (!reportRead.links?.some(one => one.type === 'about' && one.isBacklink === false && one.other?.id === run)) {
    state.actions.link = { state: 'planned' }; save(journal, state)
    await send(io, { method: 'POST', path: '/api/links', body: { fromId: report, toId: run, type: 'about' } })
  }
  let child = (await read(io, `/api/records/${run}`, true)).record
  if (child.data.state === 'running') {
    state.actions.seal = { state: 'planned' }; save(journal, state)
    const sealed = await send(io, { method: 'PATCH', path: `/api/records/${run}`, body: { dataPatch: { state: 'finished', tip: prepared.commit } } })
    child = sealed.record
  }
  if (child.data.state !== 'finished' || !id(child.data.sealedTip) || child.data.tip !== prepared.commit) fail('The child is not sealed at the prepared revert; inspect the retained session and journal.')
  state.actions.seal = { state: 'recorded', id: child.data.sealedTip }; save(journal, state)
  const check = await read(io, `/api/checks/${run}`, true)
  const release = check.stands?.released
  if (check.run !== run || check.submission?.id !== child.data.sealedTip || check.submission?.seal?.git?.commit !== prepared.commit) fail('The ordinary check does not read the child\'s actual seal.')
  if (check.stands?.refused) return { status: 'check-refused', run, report, seal: child.data.sealedTip, journal }
  const released = release?.read?.sealId === child.data.sealedTip && release.read.tip === prepared.commit
  return { status: released ? 'checked' : 'pending-check', run, report, seal: child.data.sealedTip, journal }
}
