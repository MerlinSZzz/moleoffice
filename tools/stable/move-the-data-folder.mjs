#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** One explicit target. The original owner act supplies every other scoped value. */
import { randomUUID } from 'node:crypto'
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, renameSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { isDeepStrictEqual as same } from 'node:util'
import { dataFolderMoveAuthorityResultSchema, dataFolderMoveAuthorityRequestSchema } from '../../src/shared/stable-bootstrap-notices.ts'
import { theRowIsAboutThisProcess } from '../../src/config/process-reader.mjs'
import { theProcessAt } from '../../src/config/session-process.mjs'
import { localStamp } from '../../src/shared/time.ts'
import { enWave13q as words } from '../../src/shared/words/en-wave-13q.ts'
import { createFsyncedJournal, currentProcessRecord, isTheGateOf, startGatedBootstrapGroup, stopBootstrapGroup } from './stable-bootstrap-processes.mjs'
import { BOOTSTRAP_SERVICE_SETTINGS, bootstrapGit, bootstrapProcessIdentity, descendantsOf, inspectNamedProcess, isRecordedDescendant, readListeners } from './stable-bootstrap-support.mjs'
import { checkMoveFacts, inside, moveFail, requireMoveTarget } from './data-folder-move-preflight.mjs'
import { canonicalFile, compareManifest, databaseHolderCheck, envDatabaseDefinitions, fileManifest, hashFile, inspectDataFolderFiles, savePrivate, syncDirectory } from './data-folder-move-files.mjs'
import { theExclusiveLockGuard } from '../database-holders.mjs'
import { theGateCountSpoolStep } from './stable-gate-count-spool-step.mjs'

async function objectReply(request, input) {
  const reply = await request(input)
  if (typeof reply?.status === 'number') {
    // The request helper hands back at most THE_LONGEST_REPLY characters. A longer answer is cut, which is not the office refusing.
    if (reply.cut === true) moveFail('moveOfficeAnswerCut', 'move.officeAnswerCut', { values: { path: input.path.split('?', 1)[0] }, facts: { path: input.path } })
    if (![200, 201].includes(reply.status)) {
      let body
      try { body = JSON.parse(reply.body) } catch { moveFail('moveActUnavailable', 'move.actUnavailable') }
      if (body.code === 'dataMoveActMissing' || body.error?.code === 'dataMoveActMissing') moveFail('moveActMissing', 'move.actMissing')
      const error = new Error(typeof body.error === 'string' ? body.error : body.message ?? JSON.stringify(body)); error.code = body.code ?? body.error?.code ?? 'moveActUnavailable'; throw error
    }
    if (reply.location !== null || reply.cut !== false || typeof reply.body !== 'string') moveFail('moveActUnavailable', 'move.actUnavailable')
    return JSON.parse(reply.body)
  }
  return reply
}
const authorityRead = request => '/api/office/bootstrap-stop-authority?request=' + encodeURIComponent(JSON.stringify(request))
/**
 * The act named on the command line, as its first revision holds it. A request that names the act is answered for
 * that act alone, so a folder that more than one act names still has one. The office checks the pin and the scope.
 */
async function namedActRequest(request, act, sendId) {
  if (typeof act !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(act)) moveFail('moveActNotADecision', 'move.actNotADecision', { values: { act: String(act) } })
  const first = await objectReply(request, { method: 'GET', path: `/api/records/${act}/revisions/1` })
  const named = dataFolderMoveAuthorityRequestSchema.safeParse({ scope: first?.content?.data?.extra?.stableBootstrapStop, decision: { id: act, seq: 1, contentHash: first?.contentHash }, sendId })
  if (first?.recordId !== act || first.seq !== 1 || first.content?.kind !== 'decision' || !named.success) moveFail('moveActNotADecision', 'move.actNotADecision', { values: { act } })
  return named.data
}
/** What the move starts, under its gate, after a move or a restore. */
const SERVICE_ARGS = ['tools/serve-dev.mjs', '--built']
function alive(record) { try { return !['Z', 'X'].includes(bootstrapProcessIdentity(record.pid).state) } catch (e) { if (['ENOENT', 'ESRCH'].includes(e.code)) return false; throw e } }

function namedHolders(holders) { return holders.map(holder => `process ${holder.pid} (${holder.name})`).join(', ') }
function holderCheck(database) {
  try { return databaseHolderCheck(database) } catch (error) {
    if (error.code === 'locksUnreadable') moveFail('moveLocksUnreadable', 'move.locksUnreadable', { facts: { reason: error.message } })
    throw error
  }
}
function refuseHolders(check, allowed = null) {
  const holders = allowed ? check.holders.filter(holder => !allowed.has(holder.pid)) : check.holders
  if (holders.length) moveFail('moveForeignHolder', 'move.foreignHolder', { facts: { processes: namedHolders(holders) } })
  if (check.unnamedLocks.length) moveFail('moveUnnamedLock', 'move.unnamedLock', { values: { locks: check.unnamedLocks.join('; ') }, facts: { locks: check.unnamedLocks } })
}
function setAsideRecord(check) { return { setAside: check.setAside, otherUsersUnreadable: check.otherUsersUnreadable, unnamedLocks: check.unnamedLocks } }

export async function recordedTopology(request, runtime, checkout) {
  const supervisor = currentProcessRecord(runtime.supervisor?.pid), server = currentProcessRecord(runtime.process?.pid)
  if (supervisor.cwd !== checkout || !supervisor.argv.includes('--built') || !supervisor.argv.some(x => x === 'tools/serve-dev.mjs' || x === join(checkout, 'tools/serve-dev.mjs')) || server.cwd !== checkout || server.pid !== supervisor.pid && !isRecordedDescendant(server.pid, supervisor)) moveFail('moveProcessRefused', 'move.processRefused')
  // Only the supervisor's group, never the whole ledger. A long-used office's whole ledger is longer than the request
  // helper hands back, so a whole read comes back cut, and the office checks every live row against the machine to
  // answer it. The group comes from /proc, not from the office.
  const ledger = await objectReply(request, { method: 'GET', path: `/api/resources?pgid=${supervisor.pgid}` })
  const roots = (ledger.resources ?? []).filter(r => r.type === 'process' && r.pgid === supervisor.pgid && !r.releasedAt).flatMap(r => {
    try {
      const pid = Number(r.key), record = currentProcessRecord(pid), at = theProcessAt(pid)
      // The row holds the office's local stamp, so the live start is written the way processById writes it.
      const birthMatches = at.here && at.startedAt !== null && theRowIsAboutThisProcess(r.osStartedAt ?? null, { startedAt: localStamp(new Date(at.startedAt)) }).same === true
      return birthMatches && (pid === supervisor.pid || isRecordedDescendant(supervisor.pid, record)) ? [record] : []
    } catch (error) { if (['ENOENT', 'ESRCH'].includes(error.code)) return []; throw error }
  })
  // An office the move started runs under the move's gate, which leads the group, so the group holds the gate's row
  // and the supervisor's own. That shape is accepted when the gate is the move's and started this supervisor exactly.
  const gate = roots.length === 2 && roots.some(r => r.pid === supervisor.pid) ? roots.find(r => r.pid !== supervisor.pid) ?? null : null
  const underTheGate = gate !== null && gate.cwd === checkout && isTheGateOf(gate, supervisor) && same(supervisor.argv.slice(1), SERVICE_ARGS)
  if (roots.length !== 1 && !underTheGate) moveFail('moveProcessRefused', 'move.processRefused')
  const worker = runtime.worker?.started ? currentProcessRecord(runtime.worker.pid) : null
  if (worker && (worker.cwd !== checkout || !isRecordedDescendant(worker.pid, supervisor))) moveFail('moveProcessRefused', 'move.processRefused')
  const records = [underTheGate ? gate : roots[0], supervisor, server, worker].filter(Boolean)
  for (const record of records) inspectNamedProcess(record)
  const groups = [...new Map(records.map(r => [r.pgid, r])).values()]
  const allowed = new Set(records.map(r => r.pid))
  return { records, groups, allowed, supervisor }
}

/** Read-only local preflight. The first write is a reservation after this returns. `options.act` names the act. */
export async function inspectDataFolderMove(target, options) {
  requireMoveTarget(target)
  const request = options.officeRequest
  const named = options.act === undefined ? null : await namedActRequest(request, options.act, options.sendId ?? 'data-folder-move-' + randomUUID())
  const authority = dataFolderMoveAuthorityResultSchema.parse(await objectReply(request, { method: 'GET', path: authorityRead(named ?? { action: 'stop-to-move-the-data-folder', targetFolder: target }) }))
  if (authority.narrowedByPermission != null || request.identity?.session && request.identity.session !== authority.caller.run) moveFail('moveActUnavailable', 'move.actUnavailable')
  if (named && (!same(authority.scope, named.scope) || !same(authority.decision, named.decision))) moveFail('moveActUnavailable', 'move.actUnavailable')
  if (authority.state !== 'available') moveFail('moveActUnavailable', 'move.actUnavailable')
  const { scope } = authority
  const runtime = await objectReply(request, { method: 'GET', path: '/api/runtime' })
  const checkout = realpathSync(runtime.repository.path), database = realpathSync(runtime.database.path)
  const source = dirname(database), targetParent = realpathSync(dirname(target))
  if (source !== join(checkout, 'data')) moveFail('moveDataNotInServingCheckout', 'move.dataNotInServingCheckout', { values: { checkout, source }, facts: { checkout, source } })
  if (targetParent !== dirname(target) || realpathSync(source) !== source || !canonicalFile(join(checkout, '.env'))) moveFail('moveScopeDiffers', 'move.scopeDiffers')
  const topology = await recordedTopology(request, runtime, checkout)
  const listeners = readListeners([scope.port])
  if (!listeners.length || listeners.some(r => r.pids.some(pid => !topology.allowed.has(pid)))) moveFail('moveProcessRefused', 'move.processRefused')
  const environment = inspectNamedProcess(topology.supervisor, ['HOME', 'MOLE_OFFICE_DB', 'MOLE_OFFICE_PORT', ...BOOTSTRAP_SERVICE_SETTINGS]).variables
  const checkouts = bootstrapGit(checkout, ['worktree', 'list', '--porcelain']).split('\n').filter(x => x.startsWith('worktree ')).map(x => x.slice(9))
  const backupExists = existsSync(scope.backup.path) && canonicalFile(scope.backup.path)
  const observed = { ...scope, database, checkout, port: Number(new URL(runtime.addresses.api).port), targetFolder: join(targetParent, basename(target)), targetMode: '700', backup: { path: backupExists ? realpathSync(scope.backup.path) : scope.backup.path, sha256: scope.backup.sha256 } }
  const check = holderCheck(database)
  const facts = { scope, observed, state: authority.state, backupExists, backupSha256: backupExists ? hashFile(scope.backup.path) : null,
    targetEmpty: !existsSync(target) || lstatSync(target).isDirectory() && realpathSync(target) === target && !readdirSync(target).length,
    parentDevice: lstatSync(targetParent).dev, sourceDevice: lstatSync(source).dev,
    home: environment.HOME ?? options.home ?? process.env.HOME, sandboxRoots: [options.sandboxRoot ?? process.env.SANDBOX_DIR].filter(Boolean), checkouts,
    foreignHolders: check.holders.filter(holder => !topology.allowed.has(holder.pid)), setAside: check.setAside, otherUsersUnreadable: check.otherUsersUnreadable, unnamedLocks: check.unnamedLocks, envDefinitions: envDatabaseDefinitions(join(checkout, '.env')) }
  checkMoveFacts(target, facts)
  const recoveryParent = realpathSync(options.recoveryParent ?? targetParent)
  if (checkouts.some(root => inside(root, recoveryParent)) || /(?:^|\/)sandboxes(?:\/|$)/.test(recoveryParent)) moveFail('moveTargetForbidden', 'move.targetForbidden')
  // The link and type rules the hash after the stop applies, applied here first by lstat, so a folder the move cannot
  // carry whole is refused while the office still runs. The hash after the stop walks the folder again.
  const files = inspectDataFolderFiles(source, database)
  return { authority, scope, topology, environment, source, recoveryParent, sourceMode: lstatSync(source).mode & 0o777, holderCheck: check, facts, files }
}

export async function moveTheDataFolder(target, options = {}) {
  const sendId = 'data-folder-move-' + randomUUID(), prepared = await inspectDataFolderMove(target, { ...options, sendId })
  const { scope, topology, source, recoveryParent, sourceMode } = prepared
  const newDatabase = join(target, basename(scope.database)), envFile = join(scope.checkout, '.env')
  // The sole .env writer is loaded before any stop, so a missing dependency refuses safely.
  const { setTheLine, putTheBackupBack } = await import('../../src/config/env-file-line.mjs')
  const recovery = mkdtempSync(join(recoveryParent, '.data-folder-move-')); chmodSync(recovery, 0o700)
  const journal = createFsyncedJournal({ lock: join(recovery, 'lock'), journal: join(recovery, 'journal.jsonl') }, options)
  const owned = [], started = []
  const envLabel = 'data-folder-move-' + sendId, plannedBackup = `${envFile}.before-${envLabel}`
  let stopAttempted = false, reservationHeld = false, renamed = false, manifest = null, env = null, reservation = null, envBefore = hashFile(envFile), lastGuard = null
  const envBeforeHex = hashFile(envFile, 'hex')
  const serviceEnv = { PATH: process.env.PATH, LANG: 'C.UTF-8', ...prepared.environment, MOLE_OFFICE_PORT: String(scope.port) }
  // The database comes from the .env written during the stop, including on recovery.
  delete serviceEnv.MOLE_OFFICE_DB
  async function finish(outcome) {
    const result = dataFolderMoveAuthorityResultSchema.parse(await objectReply(options.officeRequest, { method: 'POST', path: '/api/office/bootstrap-stop-authority',
      body: { scope, decision: prepared.authority.decision, sendId, reservation: reservation.reservation, outcome } }))
    if (result.state !== 'consumed' || !same(result.scope, scope) || !same(result.decision, prepared.authority.decision) || !same(result.reservation, reservation.reservation) || !same(result.caller, result.initiator)) moveFail('moveActUnavailable', 'move.actUnavailable')
    journal.append('consume-owner-act', 'done', { outcome, result })
  }
  async function stopRecords(records, prefix) {
    for (let n = 0; n < records.length; n++) {
      const record = records[n]
      if (alive(record)) await stopBootstrapGroup(record, { journal, name: prefix + '-' + n, stopTimeoutMs: options.stopTimeoutMs ?? 10000 })
    }
    refuseHolders(holderCheck(renamed ? newDatabase : scope.database))
  }
  async function start(name) {
    const group = await startGatedBootstrapGroup({ name, cwd: scope.checkout, command: process.execPath,
      args: SERVICE_ARGS, env: serviceEnv, log: join(recovery, name + '.log'), journal, onStep: options.onStep, owned })
    started.push(group); options.onProcess?.(group.gate)
    await Promise.race([group.started, group.ended.then(() => { moveFail('moveProcessRefused', 'move.processRefused') })])
    return group
  }
  function ownedRecords(group) {
    if (!alive(group.gate)) return []
    const records = [group.gate, ...descendantsOf(group.gate).map(row => currentProcessRecord(row.pid))]
    for (const record of records) { inspectNamedProcess(record); options.onProcess?.(record) }
    journal.append('started-topology', 'recorded', { records })
    return [...new Map(records.map(record => [record.pgid, record])).values()]
  }
  async function registerStarted() {
    const records = started.flatMap(ownedRecords), unregistered = []
    let refused = false
    for (const process of records) {
      const entry = journal.append('register-running-group', 'attempt', { process })
      if (refused) { unregistered.push({ process, journalEntry: entry.sequence, reason: words['move.resourceUnregistered'] }); continue }
      try {
        const at = theProcessAt(process.pgid)
        if (!at.here || at.startedAt === null) moveFail('moveProcessRefused', 'move.processRefused')
        const reply = await objectReply(options.officeRequest, { method: 'POST', path: '/api/resources', body: {
          sessionRecordId: reservation.caller.run, type: 'process', key: String(process.pgid), osStartedAt: at.startedAt,
          detail: words['move.resourceDetail'] + ' ' + join(recovery, 'journal.jsonl'),
        } })
        if (!reply?.resource?.id) moveFail('moveProcessRefused', 'move.processRefused')
        journal.append('register-running-group', 'done', { process, resource: reply.resource.id })
      } catch (error) {
        refused = true
        unregistered.push({ process, journalEntry: entry.sequence, reason: String(error.message) })
        journal.append('register-running-group', 'refused', { process, reason: String(error.message) })
      }
    }
    return { registered: !unregistered.length, unregistered, exitCode: unregistered.length ? 1 : 0 }
  }
  async function stopOwned(group) {
    const records = ownedRecords(group)
    for (let n = 0; n < records.length; n++) if (alive(records[n])) await stopBootstrapGroup(records[n], { journal, name: 'stop-started-group-' + n, stopTimeoutMs: options.stopTimeoutMs ?? 10000 })
  }
  async function health(database) {
    const end = Date.now() + (options.healthTimeoutMs ?? 30000)
    while (Date.now() < end) {
      try {
        const response = await fetch(`http://127.0.0.1:${scope.port}/api/health`, { signal: AbortSignal.timeout(1500) })
        const body = await response.json()
        if (response.ok && body.ok === true && body.world?.database === database && body.world?.repository === scope.checkout && body.world?.port === scope.port) return body
      } catch (error) { if (!(error instanceof Error)) throw error }
      await delay(50)
    }
    moveFail('moveHealthRefused', 'move.healthRefused')
  }
  try {
    savePrivate(join(recovery, 'prepared.json'), { ...prepared, topology: { records: topology.records, groups: topology.groups }, environment: undefined, target, envBefore })
    const reservationRequest = dataFolderMoveAuthorityRequestSchema.parse({ scope, decision: prepared.authority.decision, sendId })
    reservation = dataFolderMoveAuthorityResultSchema.parse(await objectReply(options.officeRequest, { method: 'POST', path: '/api/office/bootstrap-stop-authority', body: reservationRequest }))
    if (reservation.state !== 'reserved' || !same(reservation.scope, scope) || !same(reservation.decision, prepared.authority.decision) || !same(reservation.caller, reservation.initiator) || !reservation.reservation) moveFail('moveActUnavailable', 'move.actUnavailable')
    reservationHeld = true
    journal.append('reserve-owner-act', 'done', { reservation })
    await options.beforeStop?.({ scope, decision: prepared.authority.decision, reservation: reservation.reservation, recovery, sendId })
    // Repeat every pre-stop mutable local observation after the reservation round trip.
    for (const record of topology.records) inspectNamedProcess(record)
    if (hashFile(scope.backup.path) !== scope.backup.sha256) moveFail('moveBackupHashDiffers', 'move.backupHashDiffers')
    if (existsSync(target) && (!lstatSync(target).isDirectory() || readdirSync(target).length)) moveFail('moveTargetNotEmpty', 'move.targetNotEmpty')
    if (hashFile(envFile) !== envBefore) moveFail('moveEnvDiffers', 'move.envDiffers')
    const beforeStopCheck = holderCheck(scope.database)
    journal.append('database-holder-check', 'set-aside', { where: 'before-stop', ...setAsideRecord(beforeStopCheck) })
    refuseHolders(beforeStopCheck, topology.allowed)
    stopAttempted = true
    await stopRecords(topology.groups, 'stop-original')
    await journal.step('check-no-holders', async () => {
      const check = holderCheck(scope.database)
      journal.append('database-holder-check', 'set-aside', { where: 'after-stop', ...setAsideRecord(check) })
      refuseHolders(check)
      const guard = await theExclusiveLockGuard(scope.database)
      lastGuard = guard
      journal.append('exclusive-lock-guard', guard.taken ? 'taken' : 'refused', { where: 'after-stop', ...guard })
      if (!guard.taken) moveFail('moveLockNotTaken', 'move.lockNotTaken', { values: { code: guard.code }, facts: { code: guard.code, before: guard.before } })
    })
    await journal.step('hash-stopped-files', () => { manifest = fileManifest(source, scope.database); savePrivate(join(recovery, 'hashes.json'), manifest) })
    await journal.step('rename-data', () => { renameSync(source, target); renamed = true; chmodSync(target, 0o700); syncDirectory(dirname(source)); syncDirectory(dirname(target)) })
    await journal.step('compare-moved-files', () => compareManifest(target, manifest, newDatabase))
    await journal.step('empty-checkout-data', () => { mkdirSync(source, { mode: sourceMode }); syncDirectory(scope.checkout) })
    await journal.step('write-env', () => {
      journal.append('env-backup', 'planned', { backup: plannedBackup, expectedSha256: envBeforeHex })
      env = setTheLine(envFile, 'MOLE_OFFICE_DB', newDatabase, envLabel)
      const retainedBackup = join(recovery, 'original.env')
      renameSync(env.backup, retainedBackup); env.backup = retainedBackup; chmodSync(retainedBackup, 0o600)
      syncDirectory(scope.checkout); syncDirectory(recovery)
      savePrivate(join(recovery, 'env-backup.json'), env)
      if (env.before.withoutTheLine !== env.after.withoutTheLine) moveFail('moveEnvDiffers', 'move.envDiffers')
    })
    await start('start-target')
    await journal.step('health-target', () => health(newDatabase))
    for (const group of started) ownedRecords(group)
    await journal.step('compare-started-keys', () => compareManifest(target, manifest, newDatabase, true))
    await finish('moved')
    const registration = await registerStarted()
    journal.append('move', 'done', { source, target, database: newDatabase })
    await journal.close()
    for (const group of started) { group.child.disconnect(); group.child.unref() }
    // The new path is a new world, so the office counts nothing from the gate-count spool until the person hands it over.
    const gateCountSpool = theGateCountSpoolStep({ database: newDatabase, home: prepared.facts.home, change: 'moved' })
    return { state: 'moved', recovery, database: newDatabase, env, guard: lastGuard, ...registration, gateCountSpool }
  } catch (failure) {
    journal.prepareRecovery()
    journal.append('failure', 'recorded', { reason: String(failure.message), source, target, envFile })
    if (!stopAttempted) {
      if (reservationHeld) {
        try { await finish('refused') } catch (ending) {
          journal.append('consume-owner-act', 'failed', { outcome: 'refused', reason: String(ending.message) })
          failure.endingFailed = String(ending.message)
        }
      }
      failure.moveStopped = false; await journal.close(); throw failure
    }
    try {
      // A start can fail after its group was recorded but before it returned.
      for (const group of [...owned].reverse()) {
        await stopOwned(group)
        if (group.child.connected) group.child.disconnect()
      }
      if (renamed) await journal.step('restore-data-folder', async () => {
        const check = holderCheck(newDatabase)
        journal.append('database-holder-check', 'set-aside', { where: 'rollback', ...setAsideRecord(check) })
        refuseHolders(check)
        const guard = await theExclusiveLockGuard(newDatabase)
        lastGuard = guard
        journal.append('exclusive-lock-guard', guard.taken ? 'taken' : 'refused', { where: 'rollback', ...guard })
        if (!guard.taken) moveFail('moveLockNotTaken', 'move.lockNotTaken', { values: { code: guard.code }, facts: { code: guard.code, before: guard.before } })
        if (existsSync(source) && readdirSync(source).length) moveFail('moveSourceNotEmpty', 'move.sourceNotEmpty', { facts: { source } })
        renameSync(target, source); renamed = false; chmodSync(source, sourceMode); syncDirectory(dirname(target)); syncDirectory(scope.checkout)
      })
      if (env || hashFile(envFile) !== envBefore) await journal.step('restore-env', () => { putTheBackupBack(envFile, env?.backup ?? plannedBackup, envBeforeHex); if (hashFile(envFile) !== envBefore) moveFail('moveEnvDiffers', 'move.envDiffers') })
      if (manifest) await journal.step('compare-restored-files', () => compareManifest(source, manifest, scope.database, started.length > 0))
      await stopRecords(topology.groups, 'finish-original-stop')
      await start('start-original')
      await journal.step('health-original', () => health(scope.database))
      for (const group of started) ownedRecords(group)
      if (manifest) await journal.step('compare-restored-keys', () => compareManifest(source, manifest, scope.database, true))
      await finish('restored')
      const registration = await registerStarted()
      journal.append('rollback', 'done', { source, target, database: scope.database })
      await journal.close()
      for (const group of started) { if (group.child.connected) group.child.disconnect(); group.child.unref() }
      return { state: 'restored', failure: String(failure.message), recovery, database: scope.database, guard: lastGuard, ...registration, exitCode: 1 }
    } catch (rollback) {
      journal.append('rollback', 'failed', { reason: String(rollback.message), source, target, databaseAt: renamed ? newDatabase : scope.database, envFile, envBackup: env?.backup ?? null })
      for (const group of [...owned].reverse()) {
        try { await stopOwned(group) } catch (error) { journal.append('stop-after-rollback-failure', 'failed', { process: group.gate, reason: String(error.message) }) }
      }
      // Recovery stops here. All folders, backups and evidence remain where the journal names them.
      await journal.close()
      for (const group of owned) { if (group.child.connected) group.child.disconnect(); group.child.unref() }
      return { state: 'not-restored', failure: String(failure.message), rollback: String(rollback.message), recovery,
        source, target, databaseAt: renamed ? newDatabase : scope.database, envFile, envBackup: env?.backup ?? null, guard: lastGuard }
    }
  }
}

/** The public command requires planned-stop delivery around the separately tested transaction. */
export async function runDataFolderMove(target, options = {}) {
  const { withDataFolderMoveNotice } = await import('./data-folder-move-notices.mjs')
  return withDataFolderMoveNotice(target, { ...options, execute: options.execute ?? moveTheDataFolder })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    // The target alone, or the target and the act that authorizes the move: `<target> --act <decision id>`.
    const [target, flag, act, ...rest] = process.argv.slice(2)
    if (rest.length || flag !== undefined && (flag !== '--act' || act === undefined)) moveFail('moveUsage', 'move.usage')
    const { askTheOffice, theRunsIdentity } = await import('../office-request.mjs')
    const officeRequest = input => askTheOffice(input, { env: process.env, fetchImpl: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15000) }) })
    const { agent, session, workspace } = theRunsIdentity(process.env)
    officeRequest.identity = { agent, session, project: workspace }
    const result = await runDataFolderMove(target, { officeRequest, ...(act === undefined ? {} : { act }) })
    process.stdout.write(JSON.stringify(result) + '\n'); process.exitCode = result.exitCode ?? (result.state === 'moved' ? 0 : 1)
    if (result.gateCountSpool) process.stderr.write(result.gateCountSpool.says + '\n')
  } catch (error) { process.stderr.write(String(error.message) + '\n'); process.exitCode = 1 }
}
