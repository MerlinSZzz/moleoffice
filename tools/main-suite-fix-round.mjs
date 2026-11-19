#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Dormant, bounded repair-controller polls. One continuing secretary run owns its claim and key.
 * A new timer run cannot steal an old claim. No activation, model launch, main move or local suite. */
import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { THE_METHODS, theRunsIdentity, whereTheRequestGoes, withoutKeys } from './office-request.mjs'
import { officeHeaders, theAgentKey } from './sandbox-common.mjs'
import { readOriginalReceipt, readReceiptEvidenceObject, verifyOriginalReceiptEvidence } from './stable/stable-upgrade-evidence.mjs'
import { readFixRoundRed, findFixRoundCauses, prepareFixRoundRevert } from './main-suite-fix-round-evidence.mjs'
import { fixRoundAuthorTick, requireFixRoundController } from './main-suite-fix-round-author.mjs'
import { clockStamp } from '../src/shared/time.ts'
import { entryEndRecipients } from '../src/shared/entry-end-recipients.ts'
import { originalGreenFollowsRepair } from '../src/shared/main-suite-fix-chronology.ts'
import { FixRoundPersonStop, readFixRoundPersonStop } from './main-suite-fix-round-person.mjs'
import { recordFixRoundAuthorityRefusal } from './main-suite-fix-round-refusal.mjs'
import { readAFullList } from './a-full-list-read.mjs'

const settingModule = '../src/config/whole-suite-red.mjs'
const contractModule = '../src/shared/main-suite-fix.ts'
const fail = words => { throw new Error(withoutKeys(`Fix round refused: ${words}`)) }
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value)
const inside = (parent, child) => { const rel = relative(parent, child); return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`)) }

/** Program-only raw envelope. The model adapter is unchanged; callers never print this envelope. */
export async function fixRoundProgramRequest(request, { env = process.env, fetchImpl = fetch } = {}) {
  return rawProgramRequest(request, { env, fetchImpl }, true)
}
async function rawProgramRequest(request, { env = process.env, fetchImpl = fetch } = {}, withSession) {
  try {
    const who = theRunsIdentity(env), actual = theRunsIdentity(process.env)
    if (!who.agent || !who.session || !who.workspace || !isDeepStrictEqual(who, actual) || theAgentKey() === null) fail('The process must carry its own explicit run identity and key; another environment cannot substitute an identity.')
    const method = String(request.method).toUpperCase()
    if (!THE_METHODS.includes(method)) fail('The program request method is not supported.')
    const where = whereTheRequestGoes(who.api, request.path)
    if (!where.ok) fail(where.says)
    const headers = officeHeaders({ workspace: who.workspace, agent: who.agent, session: who.session, key: undefined })
    if (!withSession) delete headers['x-mole-office-session']
    const reply = await fetchImpl(where.url, { method, headers,
      ...(request.body === undefined || method === 'GET' || method === 'DELETE' ? {} : { body: JSON.stringify(request.body) }), redirect: 'manual', signal: AbortSignal.timeout(15_000) })
    const body = await reply.text()
    if (body.length > 8 * 1024 * 1024) fail('The program reply is too large to verify; nothing was truncated.')
    return { status: reply.status, location: reply.headers.get('location'), body, cut: false, added: null }
  } catch (error) { throw new Error(withoutKeys(error instanceof Error ? error.message : String(error))) }
}
function git(repository, args, mayFail = false) {
  const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'gc.auto=0', '-C', repository, ...args], {
    encoding: 'utf8', timeout: 15_000, maxBuffer: 8 * 1024 * 1024,
    env: { PATH: process.env.PATH, HOME: '/nonexistent', LANG: 'C.UTF-8', GIT_OPTIONAL_LOCKS: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_NO_REPLACE_OBJECTS: '1' },
  })
  if (mayFail && !result.error) return result.status === 0
  if (result.error || result.status !== 0) fail(`Git could not read ${args[0]} in the configured development repository.`)
  return result.stdout.trim()
}
function regular(path, directory = false) {
  const stat = lstatSync(path)
  if (realpathSync(path) !== path || stat.isSymbolicLink() || !(directory ? stat.isDirectory() : stat.isFile()) || (!directory && stat.nlink !== 1)) fail('A configured path is not canonical independent regular storage.')
}
function save(path, value) {
  const next = `${path}.${randomUUID()}.new`
  writeFileSync(next, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); renameSync(next, path)
}
const read = (io, path) => readReceiptEvidenceObject(io.officeRequest, path)
/** A MESSAGE THE OFFICE STORED AND ANSWERED 409, read as JSON, or null for every other answer. A send to a registered
 * agent nothing holds is stored, routed and answered 409, and the answer carries the stored message with its id and the
 * list of where it was routed. An answer without both is a refusal, as a 409 that stored nothing is. */
function aMessageStoredOnA409(request, reply) {
  if (reply?.status !== 409 || reply.location !== null || reply.cut !== false
    || request.method !== 'POST' || request.path !== '/api/records' || request.body?.kind !== 'message') return null
  let answer
  try { answer = JSON.parse(reply.body) } catch { return null }
  return typeof answer?.record?.id === 'string' && Array.isArray(answer.routed) ? answer : null
}
async function send(io, request) {
  if (io.signal?.aborted) throw new Error('Fix round interrupted before the planned Office mutation.')
  const reply = await io.officeRequest(request)
  const stored = aMessageStoredOnA409(request, reply)
  if (stored) return stored
  if (!reply || reply.location !== null || reply.cut !== false || reply.status < 200 || reply.status >= 300) {
    const words = withoutKeys(`${request.method} ${request.path} was not accepted (${reply?.status ?? 'no answer'}): ${reply?.body ?? 'no response'}`)
    const error = new Error(`Fix round refused: ${words}`)
    if (reply?.status === 403 && reply.location === null && reply.cut === false
      && ((request.method === 'POST' && request.path === '/api/records' && request.body?.kind === 'problem' && request.body.data?.mainSuiteFix)
        || (request.method === 'PATCH' && /^\/api\/records\/[^/]+$/.test(request.path) && request.body?.dataPatch?.mainSuiteFix))) {
      error.code = 'FIX_ROUND_CONTROLLER_REFUSED'
      error.missingProof = words
    }
    if (reply?.status === 409 && reply.location === null && reply.cut === false && request.method === 'POST' && request.path === '/api/records'
      && request.body?.kind === 'problem' && request.body.data?.mainSuiteFix) {
      error.code = 'FIX_ROUND_PROBLEM_REFUSED'
      error.refusal = words
    }
    throw error
  }
  try { return JSON.parse(reply.body) } catch { fail('An Office mutation returned unreadable JSON; reconcile its retained plan.') }
}
async function records(io, kind, words = '') {
  const rows = [], seen = new Set()
  for (let offset = 0; ; offset += 25) {
    const path = `/api/records?kind=${kind}&limit=25&offset=${offset}${words ? `&q=${encodeURIComponent(words)}` : ''}&shape=full`
    const reply = await readAFullList((one) => io.officeRequest({ method: 'GET', path: one }), path)
    if (!reply || reply.status !== 200 || reply.cut !== false || reply.location !== null) fail(`GET ${path} has an unsuccessful, cut or malformed transport envelope.`)
    let page
    try { page = JSON.parse(reply.body) } catch { fail(`GET ${path} answered unreadable JSON.`) }
    if (!Array.isArray(page.records) || page.records.length > 25) fail('An Office record page is unbounded or unidentified.')
    // EVERY ROW READ HERE IS READ WHOLE. A narrow answer has no `incompleteCount`, so it is refused by name.
    if (page.records.some((one) => typeof one?.incompleteCount !== 'number')) fail('An Office record page was cut to the narrow rows; the whole receipts and entries were not read.')
    for (const row of page.records) { if (seen.has(row.id)) fail('A record page repeated; retry the read before taking any action.'); seen.add(row.id); rows.push(row) }
    if (page.records.length < 25) return rows
  }
}
async function originalReceipts(io, repository) {
  const originals = []
  for (const record of await records(io, 'whole_suite_receipt')) {
    const original = await readOriginalReceipt(record.id, { officeRequest: io.officeRequest })
    if (original.original.content.data.repository === repository) originals.push(original)
  }
  return originals
}
async function causesFor(options, io, originals) {
  const candidates = originals.filter(one => one.original.content.data.commit !== options.commit && one.original.content.data.buildExitCode === 0 && one.original.content.data.suiteExitCode === 0
    && git(options.repository, ['merge-base', '--is-ancestor', one.original.content.data.commit, options.commit], true))
  let baseline
  for (const candidate of candidates) {
    const commit = candidate.original.content.data.commit
    if (!baseline || git(options.repository, ['merge-base', '--is-ancestor', baseline.commit, commit], true)) baseline = { repository: options.repository, commit, evidence: candidate.evidence }
  }
  if (!baseline) return { cause: [], unknown: 'No verified last original green baseline is available.' }
  const order = git(options.repository, ['rev-list', '--reverse', '--first-parent', `${baseline.commit}..${options.commit}`]).split('\n')
  const entries = (await records(io, 'merge_entry')).map(one => ({ id: one.id, ...one.data, machine: { tested: one.data.tested } })).filter(one => one.state === 'merged' && one.changeset?.root === options.repository && order.includes(one.integrated?.mainAfter))
    .sort((a, b) => order.indexOf(a.integrated.mainAfter) - order.indexOf(b.integrated.mainAfter))
  try { return await findFixRoundCauses({ ...options, baseline, entries }, { officeRequest: io.officeRequest }) }
  catch (error) { return { cause: [], unknown: withoutKeys(`The original baseline or landed attribution cannot be verified: ${error.message}`) } }
}
async function findProblem(io, pin) {
  const matches = []
  for (const record of await records(io, 'problem')) {
    const original = await read(io, `/api/records/${record.id}/revisions/1`)
    if (isDeepStrictEqual(original.content?.data?.mainSuiteFix?.receipt, pin)) matches.push(record.id)
  }
  if (matches.length > 1) fail('Several original problems claim this receipt; supervised reconciliation is required.')
  return matches[0] ?? null
}
async function checked(io, run) {
  const read = await readReceiptEvidenceObject(io.officeRequest, `/api/checks/${run}`)
  const seal = read.submission, release = read.stands?.released
  if (read.run !== run || !id(seal?.id)) return null
  if (read.stands.refused) return { refused: true, seal }
  return release?.read?.sealId === seal.id && release.read.tip === seal.seal?.git?.commit ? { seal } : null
}

/** Every call completes or refuses one bounded poll; the caller owns the continuing run lifetime. */
export async function mainSuiteFixRoundTick(options = {}, supplied = {}) {
  const { wholeSuiteFixRoundIsOn } = await import(settingModule)
  if (!wholeSuiteFixRoundIsOn(options.env ?? process.env)) return { status: 'dormant', says: 'The whole-suite fix round is off.' }
  const io = { officeRequest: request => fixRoundProgramRequest(request, { env: options.env ?? process.env }), clock: Date.now, signal: options.signal, ...supplied }
  if (io.signal?.aborted) return { status: 'interrupted', says: 'The controller was interrupted; pending work remains pending.' }
  const contract = await import(contractModule)
  const controller = await requireFixRoundController(options, io)
  if (!isAbsolute(options.repository ?? '') || !isAbsolute(options.workdir ?? '') || inside(options.repository, options.workdir) || inside(options.workdir, options.repository)) fail('Name a canonical development repository and separate external controller work directory.')
  regular(options.repository, true)
  if (!existsSync(options.workdir)) { regular(dirname(options.workdir), true); mkdirSync(options.workdir, { mode: 0o700 }) }
  regular(options.workdir, true)
  const correlation = { repository: options.repository, commit: options.commit, tree: options.tree, evidence: options.evidence, timeZone: options.timeZone, identity: options.identity,
    controllerSandbox: options.controllerSandbox, authorBrief: options.authorBrief, sheriff: options.sheriff, briefTemplate: options.briefTemplate, briefPath: options.briefPath, author: options.author, authorIdentity: options.authorIdentity, repositoryId: options.repositoryId, coordinator: options.coordinator }
  if (!id(options.coordinator)) fail('Name the secretary that receives the notices in the field coordinator, as its exact registered agent ID; no other field is read for it.')
  if (!id(options.evidence?.recordId) || !id(options.repositoryId)) fail('Name an original receipt pin and normal queue repository.')
  const journal = join(options.workdir, `receipt-${options.evidence.recordId}.json`), lock = join(options.workdir, 'controller.lock')
  let state = { version: 1, correlation, actions: {} }
  if (existsSync(journal)) { regular(journal); state = JSON.parse(readFileSync(journal, 'utf8')); if (state.version !== 1 || !isDeepStrictEqual(state.correlation, correlation)) fail('The retained journal correlation or controller run differs; no claim was stolen.') }
  let fd
  try { fd = openSync(lock, 'wx', 0o600) } catch (error) { if (error.code === 'EEXIST') fail(`A controller lock remains at ${lock}; do not remove it until its recorded process is proved gone. Recovery is supervised.`); throw error }
  writeFileSync(fd, JSON.stringify({ pid: process.pid, controller: options.identity, journal }) + '\n'); closeSync(fd)
  const keep = () => save(journal, state)
  let problem, held, ns, verifiedSource
  let recordingPersonStop = false
  const transport = io.officeRequest
  const beforeExternalAction = async () => {
    if (!problem || recordingPersonStop) return
    const act = await readFixRoundPersonStop(problem, { officeRequest: transport })
    if (act) throw new FixRoundPersonStop(act)
  }
  io.officeRequest = async request => {
    // Releasing a held seat remains required when an in-flight attempt stops.
    if (request.method !== 'GET' && !/^\/api\/slots\/[^/]+\/release$/.test(request.path)) {
      try { await beforeExternalAction() }
      catch (error) {
        if (error.code === 'MAIN_SUITE_PERSON_STOP') {
          error.notSent = true
          const action = request.path.endsWith('/next-round') ? state.actions.dispatch
            : request.path === '/api/merge-queue' ? state.actions[request.body?.fixRound?.kind]
            : request.body?.data?.sendId ? state.actions.notices?.[request.body.data.sendId] : null
          if (action?.state === 'planned') { action.state = 'not-sent'; action.stoppedBy = error.act; keep() }
        }
        throw error
      }
    }
    return transport(request)
  }
  const refresh = async () => {
    held = await read(io, `/api/records/${problem}`)
    ns = contract.mainSuiteFixSchema.parse(held.record?.data?.mainSuiteFix)
    const original = await read(io, `/api/records/${problem}/revisions/1`)
    if (!isDeepStrictEqual(contract.mainSuiteFixPinned(ns), contract.mainSuiteFixPinned(contract.mainSuiteFixSchema.parse(original.content?.data?.mainSuiteFix)))
      || ns.claim.agent !== controller.agent || ns.claim.run !== controller.run) fail('The original problem correlation or controller claim drifted.')
    if (!isDeepStrictEqual({ receipt: ns.receipt, repository: ns.repository, commit: ns.commit, tree: ns.tree, timeZone: ns.timeZone }, verifiedSource)) fail('The cached problem differs from the configured verified original receipt or source.')
  }
  const patch = async delta => {
    await refresh()
    state.actions.problemUpdate = { planned: delta }; keep()
    await send(io, { method: 'PATCH', path: `/api/records/${problem}`, body: { ifVersion: held.version, dataPatch: { mainSuiteFix: delta } } })
    await refresh()
  }
  const result = (status, says) => ({ status, problem, journal, ...(says ? { says: withoutKeys(says) } : {}) })
  const notice = async (phase, recipients, words) => {
    await refresh()
    const to = [...new Set(recipients)].sort()
    if (!to.length || to.some(one => !id(one))) fail('A phase notice needs exact canonical recipients.')
    const sendId = `fixround-${options.evidence.recordId}-${phase}-notice`
    let plan = (ns.notices ?? []).find(one => one.sendId === sendId)
    if (plan && (plan.phase !== phase || !isDeepStrictEqual(plan.to, to))) fail('The original phase notice recipient array or phase differs; no replacement was sent.')
    const verifyMessage = async message => {
      const original = await read(io, `/api/records/${message}/revisions/1`), data = original.content?.data
      if (original.op !== 'create' || original.content?.kind !== 'message' || data?.sendId !== sendId || data.sentBy?.kind !== 'agent' || data.sentBy.id !== controller.agent
        || original.who?.sessionId !== controller.run || data.aboutRun !== controller.run
        || !isDeepStrictEqual(data.to?.map(one => one.kind === 'agent' ? one.id : null).sort(), to) || typeof data.body !== 'string'
        || !data.body.endsWith(`\n${sendId}`) || !data.body.includes(problem)) fail('The actual original phase message differs from its retained recipient array, sender or phase words.')
      const retained = state.actions.notices?.[sendId]
      if (retained?.body && retained.body !== data.body) fail('The actual original phase message differs from its retained planned words.')
      state.actions.notices ??= {}
      state.actions.notices[sendId] = { ...retained, state: 'observed', to, body: data.body, message }; keep()
      return original
    }
    if (plan?.message) { await verifyMessage(plan.message); return }
    if (!plan) { plan = { sendId, to, phase }; await patch({ notices: [...(ns.notices ?? []), plan] }) }
    const page = await read(io, `/api/messages?sender=${encodeURIComponent(`agent:${controller.agent}`)}&words=${encodeURIComponent(sendId)}&limit=25&offset=0&full=1`)
    const matches = (page.messages ?? []).filter(one => one.sendId === sendId && one.sentBy?.id === controller.agent)
    if (matches.length > 1 || page.messages?.length === 25) fail('Notice reconciliation is ambiguous or incomplete.')
    let message = matches[0]?.id
    if (!message) {
      state.actions.notices ??= {}
      if (state.actions.notices[sendId] && state.actions.notices[sendId].state !== 'not-sent') fail('A notice response was lost and no accepted message is yet visible; no duplicate was sent.')
      const body = state.actions.notices[sendId]?.body ?? `${words}\n${sendId}`
      state.actions.notices[sendId] = { state: 'planned', to, body }; keep()
      const filed = await send(io, { method: 'POST', path: '/api/records', body: { kind: 'message', title: 'Main suite repair', data: { to: to.map(id => ({ kind: 'agent', id })), aboutRun: options.identity.run, sendId, body } } })
      message = filed.record?.id
      if (!id(message)) fail('The accepted notice has no exact message ID.')
      // A ROUTED NOTICE WAITS FOR ITS ADDRESSEES, so the office's lines saying where it went stay beside its state.
      if (Array.isArray(filed.routed)) { state.actions.notices[sendId].routed = filed.routed.map(one => one?.line); keep() }
    }
    const original = await verifyMessage(message)
    await send(io, { method: 'POST', path: `/api/records/${message}/short-forms`, body: { madeFrom: { seq: 1, contentHash: original.contentHash }, forms: { label: 'Concentrated repair notice' } } })
    await refresh(); await patch({ notices: ns.notices.map(one => one.sendId === sendId ? { ...one, message } : one) })
  }
  const tell = async (phase, words) => notice(phase, [controller.sheriff.id, options.coordinator], words)
  const returnedNotice = async takeout => {
    const recipients = [controller.sheriff.id, options.coordinator], lines = []
    try {
      const known = new Map()
      const fact = async stored => {
        if (!id(stored)) fail('A causal recipient has no explicit canonical stored identity.')
        if (!known.has(stored)) {
          const participant = (await read(io, `/api/participants/agent/${stored}`)).participant
          if (participant?.id !== stored || typeof participant.retired !== 'boolean') fail('A stored causal identity is unavailable, ambiguous or a legacy handle; no line was guessed.')
          known.set(stored, participant)
        }
        return known.get(stored)
      }
      for (const causal of ns.cause) {
        const entry = (await read(io, `/api/records/${causal.entry}`)).record, run = (await read(io, `/api/records/${entry.data.run}`)).record
        const author = await fact(run.data.servingAgentId)
        if (!['agent', 'person'].includes(entry.data.submittedBy?.kind)) fail('The actual original submitter is unavailable.')
        for (const who of [author.startedBy, entry.data.submittedBy]) if (who?.kind === 'agent') await fact(who.id)
        const to = entryEndRecipients({ agent: author, submittedBy: entry.data.submittedBy }, stored => {
          if (!known.has(stored)) fail('A stored causal recipient has not been read exactly.')
          return known.get(stored).id
        })
        if (!to.length) fail('The actual causal entry has no resolved agent recipient.')
        recipients.push(...to.map(one => one.id)); lines.push(`entry ${causal.entry} returns to ${to.map(one => one.id).join(', ')}`)
      }
    } catch (error) {
      await patch({ pending: { phase: 'entry-notice-source', says: withoutKeys(`The take-out landed but causal notice source remains unresolved: ${error.message}`) } })
      return false
    }
    await notice('outcome', recipients, `Problem ${problem}: take-out ${takeout} actually landed. ${lines.join('; ')}. Each named line receives this same actual message. The owner-facing system-line interface remains deferred.`)
    return true
  }
  const entryFor = async (run, kind) => {
    const matches = (await records(io, 'merge_entry')).filter(one => one.data.run === run && one.data.fixRound?.problem === problem && one.data.fixRound.kind === kind)
    if (matches.length > 1) fail('Several queue entries match one controller submission; inspect the problem.')
    return matches[0] ? { id: matches[0].id, ...matches[0].data } : null
  }
  const submit = async (run, kind, takesOut) => {
    const observeTakeout = async entry => {
      if (kind !== 'takeout') return
      const plan = state.actions[kind], original = await read(io, `/api/records/${entry.id}/revisions/1`), data = original.content?.data
      const expected = { run, changeset: { adapter: 'git', repository: options.repositoryId }, fixRound: { problem, kind, reason: plan?.reason }, takesOut }
      if (!plan?.reason || !isDeepStrictEqual(plan.submission, expected) || original.op !== 'create' || original.content?.kind !== 'merge_entry'
        || data?.run !== run || !isDeepStrictEqual(data.fixRound, expected.fixRound) || !isDeepStrictEqual(data.takesOut, takesOut)
        || data.submittedBy?.kind !== 'agent' || data.submittedBy.id !== controller.agent || data.changeset?.adapter !== 'git' || data.changeset.root !== options.repository) {
        fail('The original accepted take-out differs from its retained reason or correlation; no resubmission or retitling was attempted.')
      }
    }
    let entry = await entryFor(run, kind)
    if (entry) { if (entry.submittedBy?.kind !== 'agent' || entry.submittedBy.id !== controller.agent) fail('The correlated entry belongs to another submitter; no ownership was borrowed.'); await observeTakeout(entry); return entry }
    if ((await records(io, 'merge_entry')).some(one => one.data.run === run)) fail('This run already has an unrelated submission; sheriff self-submission is outside this controller contract.')
    if (state.actions[kind]?.state === 'planned') fail('The submission response is unresolved and no matching entry is visible; no duplicate was submitted.')
    const reason = kind === 'takeout' ? ns.verification?.state === 'unavailable' ? 'verification unavailable' : ns.verification?.state === 'complete' ? 'repair not green' : 'hour expired' : undefined
    const submission = { run, changeset: { adapter: 'git', repository: options.repositoryId }, fixRound: { problem, kind, ...(reason ? { reason } : {}) }, ...(takesOut ? { takesOut } : {}) }
    state.actions[kind] = { state: 'planned', run, ...(reason ? { reason } : {}), submission }; keep()
    const made = await send(io, { method: 'POST', path: '/api/merge-queue', body: submission })
    entry = made.entry
    if (!id(entry?.id)) fail('The ordinary queue did not identify its accepted entry.')
    state.actions[kind] = { ...state.actions[kind], state: 'accepted', entry: entry.id }; keep()
    await observeTakeout(entry)
    return entry
  }
  const prepareTakeout = async () => {
    if (ns.cause.length === 0 || ns.deadlineMs === null) return null
    if (!state.prepared) {
      const clone = join(options.workdir, 'takeout-clone'), main = git(options.repository, ['rev-parse', 'refs/heads/main'])
      if (state.actions.revert || existsSync(clone)) { await patch({ pending: { phase: 'revert-recovery', says: 'A prepared or partial clone needs supervised reconciliation; no second revert was guessed.' } }); return null }
      state.actions.revert = { state: 'planned', clone, main, cause: ns.cause }; keep()
      try { await beforeExternalAction(); state.prepared = prepareFixRoundRevert({ repository: options.repository, clone, main, cause: ns.cause, author: options.authorIdentity }); keep() }
      catch (error) { if (error.code === 'MAIN_SUITE_PERSON_STOP') throw error; await patch({ pending: { phase: 'revert-failed', says: withoutKeys(error.message) } }); return null }
    }
    await patch({ takeout: { ...(ns.takeout ?? {}), clone: state.prepared.clone, base: state.prepared.base, commit: state.prepared.commit } })
    const authored = await fixRoundAuthorTick({ identity: options.identity, controllerSandbox: options.controllerSandbox, authorBrief: options.authorBrief, sheriff: options.sheriff, env: options.env, author: options.author, prepared: state.prepared,
      problem, receipt: options.evidence, journal: join(options.workdir, 'takeout-author.json') }, { officeRequest: io.officeRequest, clock: () => new Date(io.clock()) })
    await patch({ takeout: { ...(ns.takeout ?? {}), run: authored.run } })
    return authored
  }
  const authorityRefusal = async missingProof => {
    if (state.actions.problem) state.actions.problem.state = 'refused'
    if (state.actions.problemUpdate) state.actions.problemUpdate.state = 'refused'
    const diagnostic = await recordFixRoundAuthorityRefusal({ claimedRun: options.identity.run, agent: controller.agent, coordinator: options.coordinator,
      journal, state, keep, missingProof }, { officeRequest: request => rawProgramRequest(request, { env: options.env ?? process.env }, false) })
    return { status: 'authority-refused', journal, says: withoutKeys(missingProof), diagnostic }
  }
  try {
    if (state.authorityRefusal) return await authorityRefusal(state.authorityRefusal.missingProof)
    const red = await readFixRoundRed(options, { officeRequest: io.officeRequest })
    verifiedSource = { receipt: { recordId: options.evidence.recordId, seq: 1, contentHash: red.original.contentHash }, repository: red.receipt.repository,
      commit: red.receipt.commit, tree: red.receipt.tree, timeZone: options.timeZone }
    problem = state.problem ?? await findProblem(io, options.evidence)
    if (!problem) {
      if (state.actions.problem?.state === 'refused') fail(state.actions.problem.says)
      if (state.actions.problem) fail('The original problem filing is unresolved; no duplicate was filed. Inspect the retained journal.')
      const originals = await originalReceipts(io, options.repository), attribution = await causesFor(options, io, originals)
      const deadline = contract.mainSuiteFixDeadline(red.receipt.endedAt, options.timeZone)
      const initial = { receipt: options.evidence, repository: options.repository, commit: options.commit, tree: options.tree,
        failedTests: red.receipt.failedTests, failedFiles: red.receipt.failedFiles, cause: attribution.cause,
        ...(attribution.cause.length ? {} : { causeUnknown: attribution.unknown }), originalEndedAt: red.receipt.endedAt, timeZone: options.timeZone,
        endedAtMs: deadline.endedAtMs, deadlineMs: deadline.deadlineMs, fixRound: { run: null, startedAt: null, deadline: deadline.deadline }, claim: { agent: controller.agent, run: controller.run } }
      contract.mainSuiteFixSchema.parse(initial)
      state.actions.problem = { state: 'planned', receipt: options.evidence }; keep()
      const created = await send(io, { method: 'POST', path: '/api/records', body: { kind: 'problem', title: `Original main suite red ${options.evidence.recordId}`, data: {
        symptom: 'The original complete whole suite on development main failed.', mainSuiteFix: initial,
      } } })
      problem = created.record?.id
      if (!id(problem)) fail('The Office did not identify the authoritative problem.')
    }
    state.problem = problem; keep(); await refresh()
    // A guarded no-op still checks the server's authenticated own-run proof on every poll.
    await patch({ claim: ns.claim })
    if (ns.pending?.phase === 'person-stopped') await patch({ pending: null })
    if (ns.outcome) {
      if (ns.outcome.fixed) await tell('outcome', `Problem ${problem}: verified fixed on ${ns.outcome.fixed}.`)
      else {
        const landed = (await read(io, `/api/records/${ns.outcome.returned}`)).record
        if (landed?.kind !== 'merge_entry' || landed.data.state !== 'merged') fail('The recorded returned entry is not actually landed.')
        if (!await returnedNotice(ns.outcome.returned)) return result('supervised', 'The causal notice source remains unresolved.')
      }
      return result(ns.outcome.fixed ? 'fixed' : 'returned')
    }
    await tell('start', `Problem ${problem}: original receipt ${options.evidence.recordId}; failed files ${ns.failedFiles.join(', ')}; ${ns.cause.length ? `causal entries ${ns.cause.map(one => one.entry).join(', ')}` : ns.causeUnknown}; original deadline ${ns.fixRound.deadline ?? 'unknown; supervised action required'}.`)
    if (!ns.dispatch) {
      regular(options.briefTemplate.path)
      const template = readFileSync(options.briefTemplate.path)
      if (digest(template) !== options.briefTemplate.sha256) fail('The configured brief template hash differs.')
      if (!isAbsolute(options.briefPath) || !inside(options.sheriff.sandbox, options.briefPath)) fail('Name an explicit brief path inside the sheriff sandbox.')
      regular(dirname(options.briefPath), true)
      const bytes = Buffer.from(`${template.toString('utf8')}\nProblem: ${problem}\nOriginal receipt: ${JSON.stringify(options.evidence)}\nRepository: ${options.repository}\nMain commit: ${options.commit}\nMain tree: ${options.tree}\nCause: ${JSON.stringify(ns.cause)}\nUnknown cause: ${ns.causeUnknown ?? 'none'}\nOriginal deadline: ${ns.fixRound.deadline ?? 'unknown'}\nController run: ${controller.run}\nWork only in an isolated development checkout. Retain criterion-only old/new/reason commits before any assertion change. Seal and await the ordinary check; the controller submits your repair.\n`)
      const planned = { state: 'planned', path: options.briefPath, bytesBase64: bytes.toString('base64'), sha256: digest(bytes) }
      if (state.actions.brief && !isDeepStrictEqual(state.actions.brief, planned)) fail('The retained final brief plan differs; no replacement was written.')
      if (existsSync(options.briefPath)) {
        regular(options.briefPath)
        if (!state.actions.brief || !readFileSync(options.briefPath).equals(bytes)) fail('An existing brief has no matching retained plan; no replacement was written.')
      } else {
        state.actions.brief = planned; keep()
        await beforeExternalAction()
        writeFileSync(options.briefPath, bytes, { flag: 'wx', mode: 0o600 })
      }
      await patch({ dispatch: { previousRun: options.sheriff.previousRun, sheriff: controller.sheriff.id, brief: { path: options.briefPath, sha256: digest(bytes) }, state: 'planned' } })
    }
    regular(ns.dispatch.brief.path)
    if (digest(readFileSync(ns.dispatch.brief.path)) !== ns.dispatch.brief.sha256 || ns.dispatch.previousRun !== options.sheriff.previousRun || ns.dispatch.sheriff !== controller.sheriff.id) fail('The retained dispatch correlation differs from the configured problem and brief.')
    let previous = (await read(io, `/api/records/${ns.dispatch.previousRun}`)).record
    let next = previous.data.nextRound
    if (!next) {
      if (state.actions.dispatch && state.actions.dispatch.state !== 'not-sent') fail('The next-round response is unresolved and no accepted ask is visible; no blind retry was made.')
      state.actions.dispatch = { state: 'planned', problem, receipt: options.evidence, ...ns.dispatch }; keep()
      const asked = await send(io, { method: 'POST', path: `/api/agents/${options.sheriff.agent}/next-round`, body: { brief: ns.dispatch.brief.path, sandbox: options.sheriff.sandbox } })
      if (asked.run !== ns.dispatch.previousRun) fail('The next-round acknowledgment names another previous run.')
      next = asked.nextRound
    }
    if (next.brief?.path !== ns.dispatch.brief.path || next.brief.sha256 !== ns.dispatch.brief.sha256 || next.askedBy?.who?.id !== controller.agent || next.sandbox?.folder !== options.sheriff.sandbox) fail('The accepted next-round correlation differs; a wanted ask was not replaced.')
    if (next.state === 'failed') { await patch({ pending: { phase: 'dispatch-failed', says: next.failed?.says ?? 'The next-round launcher failed; no actual repair run is recorded.' } }); return result('supervised', 'The concentrated repair did not start.') }
    if (next.state === 'started') {
      const actual = (await read(io, `/api/records/${next.started?.run}`)).record
      if (actual?.kind !== 'session' || actual.data.servingAgentId !== controller.sheriff.id || !id(next.started?.run) || !next.started.at) fail('The next-round start does not identify an actual sheriff run.')
      await patch({ dispatch: { ...ns.dispatch, state: 'started' }, fixRound: { ...ns.fixRound, run: actual.id, startedAt: next.started.at }, repair: ns.repair ?? { run: actual.id } })
    } else await patch({ dispatch: { ...ns.dispatch, state: 'asked' } })
    const authored = await prepareTakeout()
    const expired = ns.deadlineMs !== null && io.clock() >= ns.deadlineMs
    let repair = ns.repair?.entry ? { id: ns.repair.entry, ...(await read(io, `/api/records/${ns.repair.entry}`)).record.data } : ns.repair ? await entryFor(ns.repair.run, 'repair') : null
    if (!repair && ns.repair && !expired) {
      const release = await checked(io, ns.repair.run)
      if (release?.refused) { await patch({ pending: { phase: 'repair-check-refused', says: 'The ordinary check refused the repair; no submission was made.' } }) }
      else if (release) { repair = await submit(ns.repair.run, 'repair'); await patch({ repair: { ...ns.repair, entry: repair.id } }) }
    }
    if (repair && !ns.repair.entry) await patch({ repair: { ...ns.repair, entry: repair.id } })
    let verificationFailed = false
    if (repair?.state === 'merged') {
      const verified = await verifyLandedRepair({ options, io, patch, refresh, getNamespace: () => ns, result, repair, tell, beforeExternalAction })
      if (!verified.takeoutRequired) return verified
      verificationFailed = true
    }
    if (ns.deadlineMs === null) return result('supervised', 'The original end time is ambiguous; no automatic take-out.')
    if (!expired && !verificationFailed) return result(ns.fixRound.run ? 'repair-waiting' : 'dispatch-waiting')
    if (ns.deadlineMs === null || ns.cause.length === 0) return result('supervised', ns.causeUnknown ? `Unknown cause: ${ns.causeUnknown}` : 'The original end time is ambiguous; no automatic take-out.')
    // The exact already-testing expiry rule is implemented only after the accepted clarification.
    if (repair && ['testing', 'landing'].includes(repair.state)) {
      await patch({ pending: { phase: `repair-${repair.state}`, says: 'The repair already holds its testing or landing path. Reconcile its actual finish; the original deadline was not reset.' } })
      return result('repair-testing', 'The repair already holds its testing or landing path; the deadline was not reset.')
    }
    if (repair && ['submitted', 'pinned', 'judged', 'integrating', 'reinspecting'].includes(repair.state)) {
      state.actions.withdraw = { state: 'planned', entry: repair.id }; keep()
      const answer = await io.officeRequest({ method: 'POST', path: `/api/merge-queue/${repair.id}/withdraw`, body: { because: 'The original fix-round deadline elapsed while this repair was still waiting.', waitingOnly: true } })
      const observed = (await read(io, `/api/records/${repair.id}`)).record
      if (answer.status === 409 && ['testing', 'landing'].includes(observed.data.state)) return result('repair-testing', 'The actual queue advanced before the atomic waiting-only withdrawal.')
      if (observed.data.state !== 'withdrawn') fail(`The repair withdrawal did not establish withdrawn state (${answer.status}): ${answer.body}; no take-out was submitted.`)
    }
    if (!authored || authored.status !== 'checked') return result('takeout-pending-check', 'The prepared take-out still needs its ordinary check; no queue entry is claimed.')
    const takeout = await submit(authored.run, 'takeout', ns.cause.map(one => one.entry))
    await patch({ takeout: { ...ns.takeout, entry: takeout.id } })
    if (takeout.state !== 'merged') return result(takeout.state === 'bounced' ? 'takeout-failed' : 'takeout-waiting', 'Only an actually merged take-out can be recorded returned.')
    if (!await returnedNotice(takeout.id)) return result('supervised', 'The take-out landed; causal notices remain pending.')
    await patch({ outcome: { returned: takeout.id }, pending: null })
    return result('returned')
  } catch (error) {
    if (error.code === 'FIX_ROUND_CONTROLLER_REFUSED') {
      return await authorityRefusal(error.missingProof)
    }
    if (error.code === 'FIX_ROUND_PROBLEM_REFUSED') {
      state.actions.problem = { ...state.actions.problem, state: 'refused', says: error.refusal }; keep()
    }
    if (error.code === 'MAIN_SUITE_PERSON_STOP') {
      recordingPersonStop = true
      try {
        await patch({ pending: { phase: 'person-stopped', says: error.message } })
        await notice('person-stopped', [options.coordinator], `Automation stopped. ${error.message} No repair or take-out action follows this observed resolution.`)
        state.personStopped = error.act; keep()
        return result('person-stopped', error.message)
      } catch (stopError) {
        if (stopError.code === 'FIX_ROUND_CONTROLLER_REFUSED') return await authorityRefusal(stopError.missingProof)
        throw stopError
      } finally { recordingPersonStop = false }
    }
    state.lastFailure = { at: clockStamp(() => new Date(io.clock())).stamp, says: withoutKeys(error.message ?? String(error)) }; keep()
    throw new Error(withoutKeys(error.message ?? String(error)))
  } finally { unlinkSync(lock) }
}

async function verifyLandedRepair({ options, io, patch, refresh, getNamespace, result, repair, tell, beforeExternalAction }) {
  const repairCommit = repair.integrated?.mainAfter
  if (!repairCommit || !git(options.repository, ['merge-base', '--is-ancestor', repairCommit, 'refs/heads/main'], true)) fail('The repair has no actual landed main ancestry.')
  if (!getNamespace().verification) {
    await patch({ verification: { repairCommit, targetCommit: git(options.repository, ['rev-parse', 'refs/heads/main']), state: 'planned', attempt: join(options.workdir, `verification-${repairCommit}.json`) } })
  }
  let verification = getNamespace().verification
  if (verification.repairCommit !== repairCommit) fail('The verification belongs to another landed repair.')
  if (!['complete', 'unavailable'].includes(verification.state)) {
    try {
      const { runRepairSuiteOnce } = await import('./periodic-main-suite.mjs')
      await runRepairSuiteOnce({ ...(options.producer ?? {}), repository: options.repository, workdir: options.producer?.workdir ?? join(options.workdir, 'producer'),
        env: options.env, identity: options.identity, problem: result('verification-pending').problem, repairCommit, targetCommit: verification.targetCommit, attempt: verification.attempt },
        { officeRequest: io.officeRequest, clock: io.clock, beforeExternalAction, ...(io.runCloud ? { runCloud: io.runCloud } : {}) })
      await refresh()
    } catch (error) {
      if (error.code === 'MAIN_SUITE_PERSON_STOP') throw error
      await refresh()
      if (getNamespace().verification.state === 'planned') await patch({ verification: { ...getNamespace().verification, state: 'attempted' } })
      await patch({ verification: { ...getNamespace().verification, state: 'unavailable', says: withoutKeys(`Original verification could not run or be reconciled: ${error.message}`) } })
    }
    verification = getNamespace().verification
  }
  if (verification.state === 'complete') {
    const verified = await verifyOriginalReceiptEvidence({ repository: options.repository, commit: verification.targetCommit, evidence: verification.receipt }, { officeRequest: io.officeRequest })
    if (verified.outcome !== verification.outcome) fail('The observed original verification differs from its stored result.')
    git(options.repository, ['merge-base', '--is-ancestor', repairCommit, verified.receipt.commit])
    if (verified.green) {
      if (!originalGreenFollowsRepair({ endedAt: verified.receipt.endedAt, landedAt: repair.integrated?.at, originalEndedAtMs: getNamespace().endedAtMs, timeZone: options.timeZone })) {
        await patch({ pending: { phase: 'verification-invalid', says: `The retained complete original green receipt ${verification.receipt.recordId} is not later than the actual repair and original red. Its pin and original outcome remain unchanged; supervised reconciliation is required.` } })
        return result('supervised', 'The retained original green cannot establish this repair; its original provenance is preserved.')
      }
      await patch({ fixedReceipt: verification.receipt, outcome: { fixed: verified.receipt.commit }, pending: null })
      await tell('outcome', `Problem ${result('fixed').problem}: repair entry ${repair.id} landed and original green receipt ${verification.receipt.recordId} verifies main ${verified.receipt.commit}.`)
      return result('fixed')
    }
    await patch({ pending: { phase: 'verification-not-green', says: `Original verification receipt ${verification.receipt.recordId} is ${verified.outcome}; its checked take-out is required.` } })
    return { takeoutRequired: true }
  }
  if (verification.state === 'unavailable') {
    await patch({ pending: { phase: 'verification-unavailable', says: verification.says } })
    return { takeoutRequired: true }
  }
  return result('verification-pending', 'The landed repair still awaits its reserved original verification; no result is inferred from queue green.')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const path = process.argv[2]
    const options = path ? JSON.parse(readFileSync(path, 'utf8')) : {}
    const result = await mainSuiteFixRoundTick(options)
    // Never print raw namespaces, headers or internal hexadecimal digests.
    process.stdout.write(withoutKeys(JSON.stringify(result)) + '\n')
  } catch (error) { process.stderr.write(withoutKeys(error.message ?? String(error)) + '\n'); process.exitCode = 1 }
}
