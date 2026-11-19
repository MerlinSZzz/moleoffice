// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** First-handoff orchestration. SQLite is loaded only inside real mutation steps. */
import { createHash } from 'node:crypto'
import { constants, existsSync, chmodSync, copyFileSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { localStamp } from '../../src/shared/time.ts'
import { versionOf } from '../../src/server/lib/version.ts'
import { carriesTheTestMark, THE_TEST_MARK } from '../../src/config/the-test-mark.mjs'
import { keysPathFrom } from '../../src/config/settings.mjs'
import { requireReadOnlyGitConfig } from '../read-only-git-config.mjs'
import { verifyBootstrapLauncher, verifyBootstrapStableSource, verifyBootstrapSettingsSource } from './stable-bootstrap-launcher.mjs'
import { BOOTSTRAP_LAYOUT_WORDS as words } from './stable-bootstrap-words.mjs'
import { bootstrapEvidencePin, bootstrapFail as fail, bootstrapGit as git, bootstrapProcessIdentity, readListeners, verifyLocalTopology, noDatabaseHolders, inspectNamedProcess } from './stable-bootstrap-support.mjs'
import { inspectArtifacts, copyAndVerifyArtifacts, verifyRetainedArtifacts, copyAndVerifySqlite, checkpointBootstrapDatabase, bootstrapFileHash, syncBootstrapDirectory, syncBootstrapFile } from './stable-bootstrap-storage.mjs'
import { createFsyncedJournal, startGatedBootstrapGroup, awaitBootstrapCommand, stopBootstrapGroup, observeBootstrapTopology, discoverBootstrapTopology } from './stable-bootstrap-processes.mjs'
import { theExclusiveLockGuard } from '../database-holders.mjs'
import { theFilesBuiltFrom } from '../../src/config/import-graph.mjs'
import { THE_PROGRAMS_RESTARTED_WITH_THE_SERVER } from '../files-that-restart-the-server.mjs'

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const digest = bytes => createHash('sha256').update(bytes).digest('base64')
const stable = value => Array.isArray(value) ? value.map(stable) : object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
function configurationHash(c) { const { stopAuthority, prepared, ...same } = c; return digest(JSON.stringify(stable(same))) }
function metadata(path) { const stat = lstatSync(path); return { dev: stat.dev, ino: stat.ino, mode: stat.mode & 0o777, uid: stat.uid, size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs } }
const fromOf = c => ({ commit: c.targetCommit, repository: c.developmentRepository, database: c.database, port: c.servicePort })
const toOf = c => ({ ...fromOf(c), repository: c.stableCheckout })
const apiOf = port => `http://127.0.0.1:${port}`

/** These are the same actions preparation journals and the small Git tests run. */
export function cloneBootstrapStableCheckout(c) {
  const origin = git(c.developmentRepository, ['remote', 'get-url', 'origin'])
  git(c.developmentRepository, ['clone', '--no-local', '--no-hardlinks', '--no-tags', '--', c.developmentRepository, c.stableCheckout])
  requireReadOnlyGitConfig(c.stableCheckout)
  git(c.stableCheckout, ['checkout', '-b', 'stable', c.targetCommit])
  git(c.stableCheckout, ['remote', 'set-url', 'origin', origin])
  requireReadOnlyGitConfig(c.stableCheckout)
}

export function createBootstrapDatedTag(c) {
  if (c.candidateTag.slice(7, 17) !== localStamp(new Date()).slice(0, 10)) fail('The local day changed; retain this preparation and use a newly approved dated candidate.')
  for (const root of [c.developmentRepository, c.stableCheckout]) {
    requireReadOnlyGitConfig(root)
    if (git(root, ['tag', '--list', c.candidateTag])) fail('The candidate tag already exists.')
  }
  return git(c.stableCheckout, ['tag', c.candidateTag, c.targetCommit])
}

async function requestObject(officeRequest, path, port, status = 200) {
  const reply = await officeRequest({ method: 'GET', path }, { api: apiOf(port) })
  if (!reply || reply.status !== status || reply.cut !== false || reply.location !== null) fail(`The configured service did not return a complete ${status} response for ${path}.`)
  const body = JSON.parse(reply.body)
  if (!object(body)) fail('The service response is not a JSON object.')
  return body
}

/**
 * Whether a server that started at `head` runs the code of `commit`. The world header keeps the head a server started at
 * (src/server/lib/world.ts), and serve-dev restarts the server only when a file that restarts it changes, so a later
 * commit that changes only tools leaves the older head in place. It does when `head` is an ancestor of `commit` and no
 * file that restarts the API or its worker changed between them, nor package.json or package-lock.json. A walk that
 * could not read or resolve a file cannot say which files those are, so it answers no.
 */
function runsTheCodeOf(repository, head, commit) {
  if (!/^[0-9a-f]{7,40}$/.test(head)) return false
  const older = git(repository, ['rev-parse', '--verify', '--end-of-options', `${head}^{commit}`])
  if (git(repository, ['merge-base', older, commit]) !== older) return false
  const walks = THE_PROGRAMS_RESTARTED_WITH_THE_SERVER.map(entry => theFilesBuiltFrom(entry, repository))
  if (walks.some(walk => walk.unresolved.length || walk.couldNotRead.length)) return false
  const code = new Set([...walks.flatMap(walk => walk.files), 'package.json', 'package-lock.json'])
  return !git(repository, ['diff', '--name-only', '--no-renames', '-z', older, commit]).split('\0').some(path => code.has(path))
}

export async function verifyBootstrapServing(officeRequest, expected) {
  const runtime = await requestObject(officeRequest, '/api/runtime', expected.port)
  const health = await requestObject(officeRequest, '/api/health', expected.port)
  if (health.ok !== true || runtime.repository?.head?.full !== expected.commit || runtime.repository?.path !== expected.repository || runtime.database?.path !== expected.database || Number(new URL(runtime.addresses?.api).port) !== expected.port || health.world?.repository !== expected.repository || health.world?.database !== expected.database || health.world?.port !== expected.port || typeof health.world?.head !== 'string' || !expected.commit.startsWith(health.world.head) && !runsTheCodeOf(expected.repository, health.world.head, expected.commit)) fail('The ordinary service commit, checkout, database or port differs from the expected identity.')
  return { runtime, health }
}

async function waitVerified(c, action) {
  let failure
  for (let n = 0; n < c.health.attempts; n++) {
    try { return await action() } catch (error) { failure = error }
    if (n + 1 < c.health.attempts) await delay(c.health.intervalMs)
  }
  throw failure
}

function environment(c, paths, database, port, mode, useDevelopmentSettings = false) {
  const ordinary = mode === 'ordinary', home = ordinary ? c.serviceHome : join(paths.work, 'home')
  return {
    PATH: process.env.PATH, LANG: 'C.UTF-8', HOME: home,
    // A test-started server knows the suite started it; a caller without the mark passes none.
    ...(carriesTheTestMark() ? { [THE_TEST_MARK]: process.env[THE_TEST_MARK] } : {}),
    ...(ordinary ? c.serviceSettings : { ...(c.serviceSettings.TZ ? { TZ: c.serviceSettings.TZ } : {}),
      TMPDIR: home, XDG_CACHE_HOME: join(home, 'cache'), XDG_CONFIG_HOME: join(home, 'config'),
      npm_config_cache: join(home, 'npm'), npm_config_userconfig: join(home, 'npmrc'), npm_config_globalconfig: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0',
      MOLE_OFFICE_WORKSPACE: c.serviceSettings.MOLE_OFFICE_WORKSPACE ?? 'default', MOLE_OFFICE_MESSAGE_WORKER: 'off',
      MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES: 'none', MOLE_OFFICE_API: apiOf(port), MOLE_OFFICE_WEB: apiOf(port), MOLE_OFFICE_WEB_PORT: String(port) }),
    ...(useDevelopmentSettings ? { MOLE_OFFICE_DEVELOPMENT_CHECKOUT: c.developmentRepository } : {}),
    MOLE_OFFICE_DB: database, MOLE_OFFICE_PORT: String(port), MOLE_OFFICE_START_MODE: mode, NODE_ENV: 'production',
  }
}

export async function readPreparedBootstrapState(c, paths) {
  verifyBootstrapStableSource(c)
  const file = c.prepared.path, info = metadata(file)
  if (info.mode !== 0o600 || info.uid !== process.getuid() || lstatSync(file).nlink !== 1 || info.size > 1024 * 1024) fail('The prepared state is not one private ordinary file.')
  const bytes = readFileSync(file)
  if (digest(bytes) !== c.prepared.sha256Base64) fail('The private prepared-state digest differs from its pinned original event.')
  const state = JSON.parse(bytes)
  if (state.version !== 1 || state.state !== 'PREPARED' || state.configurationHash !== configurationHash(c) || state.candidateTag !== c.candidateTag || state.commit !== c.targetCommit || state.tree !== c.targetTree || !isDeepStrictEqual(state.from, fromOf(c)) || !isDeepStrictEqual(state.to, toOf(c)) || !isDeepStrictEqual(state.paths, paths) || !isDeepStrictEqual(state.originalTopology, c.topology)) fail('The retained preparation does not match this exact configured handoff.')
  if (!Object.hasOwn(state, 'settingsFileCheck')) fail(words.settingsFileCheckMissing)
  if (!isDeepStrictEqual(metadata(keysPathFrom({ MOLE_OFFICE_DB: c.database })), state.keysIdentity)) fail('The existing key-file identity changed after preparation.')
  const database = metadata(c.database)
  if (['dev', 'ino', 'mode', 'uid'].some(name => database[name] !== state.databaseIdentity[name])) fail('The existing database file was replaced or its ownership/mode changed after preparation.')
  // PREPARED remains immutable. A completed pairing records the new identity
  // in this private journal, including the hash of the exact bytes now in use.
  const rows = readFileSync(paths.journal, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
  const pairing = rows.findLast(row => row.step === 'pair-development-with-stable' && row.phase === 'observed')
  if (pairing && (pairing.file !== join(c.developmentRepository, '.env') || pairing.backup !== pairing.file + '.before-' + c.candidateTag || pairing.before?.sha256 !== state.settingsIdentity.sha256 || pairing.after?.sha256 !== pairing.identity?.sha256 || pairing.before.withoutTheLine !== pairing.after.withoutTheLine || pairing.before.mode !== pairing.after.mode || pairing.before.uid !== pairing.after.uid || pairing.before.gid !== pairing.after.gid)) fail(words.pairingJournalInvalid)
  const settings = verifyBootstrapSettingsSource(c, { prepared: true, paired: !!pairing })
  if (!isDeepStrictEqual(settings.fileCheck, state.settingsFileCheck)) fail(words.settingsChanged)
  if (pairing && (!isDeepStrictEqual(settings.resolution, pairing.settingsResolution) || !isDeepStrictEqual(settings.moduleResolution, pairing.settingsModuleResolution))) fail(words.settingsProofChanged)
  if (!isDeepStrictEqual(settings.identity, pairing?.identity ?? state.settingsIdentity)) fail(words.settingsChanged)
  await verifyRetainedArtifacts(c.stableCheckout, state.artifacts)
  await verifyRetainedArtifacts(join(paths.work, 'original-artifacts'), state.originalArtifacts)
  await verifyRetainedArtifacts(c.developmentRepository, state.originalArtifacts)
  return state
}

const BUILD = "const {buildThePage}=await import('./tools/build-the-page.mjs');const result=await buildThePage({say:s=>process.stderr.write(s+'\\n')});if(!result.ok){process.stderr.write(result.output+'\\n');process.exitCode=1;}"

export async function runStableBootstrap(valid, options) {
  const { config: c, paths } = valid, { officeRequest, phase, dry = false } = options
  verifyBootstrapLauncher(c)
  const initialSettings = verifyBootstrapSettingsSource(c, { prepared: phase === 'handoff' })
  const notices = await import('./stable-bootstrap-notices.mjs')
  const evidence = await import('./stable-upgrade-evidence.mjs')
  const verifyEvidence = () => c.evidence.kind === 'owner-decision'
    ? notices.verifyBootstrapEvidenceDecision(c, { officeRequest, api: apiOf(c.servicePort) })
    : evidence.verifyUpgradeEvidence({ repository: c.developmentRepository, commit: c.targetCommit, evidence: c.evidence }, { officeRequest })
  verifyLocalTopology(c)
  await verifyEvidence()
  const prepared = phase === 'handoff' ? await readPreparedBootstrapState(c, paths) : null
  const scope = notices.bootstrapStopScope(c, fromOf(c), c.targetTree)
  const authorityRequest = prepared ? { scope, authority: { prepared: c.prepared.event, decision: c.stopAuthority.decision, stateSha256Base64: c.prepared.sha256Base64 }, sendId: c.noticeSendIds.before } : null
  if (authorityRequest) await notices.verifyBootstrapStopAuthority(authorityRequest, { officeRequest, api: apiOf(c.servicePort) })
  if (dry) return {
    state: 'dry', phase, mode: c.mode, target: c.targetCommit, paths, liveBlocked: valid.liveBlocked,
    says: "Bounded inspection commands (git, ss) may run. Git inspection uses a bounded isolated environment with hooks and fsmonitor disabled; the existing read-only guard refuses configured clean/process filters, lazy fetching and submodules before status. These authenticated reads update the caller key's last-use time and API usage counters. Ordinary runtime and health were not checked. No file, lock, record, fetch, service start or stop was performed.",
    plan: [c.evidence.kind === 'owner-decision' ? 'Verify the original owner decision that stands for the whole-suite receipt, and the exact local configuration.' : 'Verify the original receipt and exact local configuration.', words.preparationPlan, 'After the scoped original owner warrant, atomically reserve BEFORE, stop the recorded old topology, take sanitized and private full backups, check the real database with writes excluded, then publish and verify serve-dev --built --prepared.', 'A failed handoff restores and verifies the original development topology and exact database image; delivery failure after publication keeps the service.'],
  }
  if (phase === 'handoff' && valid.liveBlocked) fail(valid.liveBlocked)
  const old = await verifyBootstrapServing(officeRequest, fromOf(c))
  if (old.runtime.process?.pid !== c.topology.server.pid || old.runtime.supervisor?.pid !== c.topology.supervisor.pid || old.runtime.worker?.started !== (c.topology.worker !== null) || (c.topology.worker && old.runtime.worker.pid !== c.topology.worker.pid)) fail('The ordinary runtime disagrees with the recorded original topology.')
  verifyLocalTopology(c)
  const journal = createFsyncedJournal(paths, options, phase === 'handoff')
  const owned = [], ordinary = [], knownChecks = []
  let before = null, downtimeAt = null, snapshot = null, databaseTouched = false, pairing = null, lastGuard = null
  let originalArtifacts = prepared?.originalArtifacts ?? null
  const work = paths.work, privateDatabase = join(work, 'rollback.sqlite'), candidateDatabase = join(work, 'check.sqlite')
  const backup = join(work, 'sanitized.sqlite'), saved = join(work, 'original-artifacts')
  function verifyOriginalSource() {
    requireReadOnlyGitConfig(c.developmentRepository)
    if (git(c.developmentRepository, ['rev-parse', 'HEAD']) !== c.targetCommit || git(c.developmentRepository, ['symbolic-ref', '--quiet', 'HEAD']) !== 'refs/heads/main' || git(c.developmentRepository, ['status', '--porcelain=v1', '--untracked-files=all'])) fail('The original development source advanced or became dirty; recovery will not overwrite main work.')
  }
  async function originalStillServing() {
    if (databaseTouched || !originalArtifacts) return false
    try {
      verifyOriginalSource()
      const read = await verifyBootstrapServing(officeRequest, fromOf(c))
      if (read.runtime.process?.pid !== c.topology.server.pid || read.runtime.supervisor?.pid !== c.topology.supervisor.pid || read.runtime.worker?.started !== (c.topology.worker !== null) || c.topology.worker && read.runtime.worker.pid !== c.topology.worker.pid) fail('The exact original runtime topology changed.')
      verifyLocalTopology(c)
      await verifyRetainedArtifacts(c.developmentRepository, originalArtifacts)
      journal.append('original-still-serving', 'verified', { topology: c.topology })
      return true
    } catch (error) {
      journal.append('original-still-serving', 'not-verified', { reason: String(error.message) })
      return false
    }
  }
  async function group(name, root, command, args, env) {
    return startGatedBootstrapGroup({ name, cwd: root, command, args, env, log: join(work, `${name}.log`), journal, onStep: options.onStep, owned })
  }
  async function command(name, root, program, args, env) {
    const started = await group(name, root, program, args, env)
    await journal.step(`${name}-exit`, () => awaitBootstrapCommand(started, c.health.commandTimeoutMs))
    return started
  }
  async function stop(group, name) {
    await stopBootstrapGroup(group.gate, { journal, name, stopTimeoutMs: c.health.stopTimeoutMs })
    await group.ended
    if (group.child.connected) group.child.disconnect()
  }
  async function releaseCheck(name, database, port, useDevelopmentSettings = false) {
    const started = await group(name, c.stableCheckout, process.execPath, ['--import', 'tsx', 'src/server/index.ts', `--stop-with-pid=${process.pid}`], environment(c, paths, database, port, 'release-check', useDevelopmentSettings))
    knownChecks.push(started)
    await journal.step(`${name}-verify`, () => waitVerified(c, async () => {
      for (const path of ['/api/health', '/api/runtime']) {
        const body = await requestObject(officeRequest, path, port)
        const expected = { commit: c.targetCommit, repository: c.stableCheckout, database, port, mode: 'release-check' }
        if (body.ok !== true || Object.keys(expected).some(key => body.identity?.[key] !== expected[key])) fail('The write-excluded check identity differs or schema is not current.')
      }
      const refused = await requestObject(officeRequest, '/api/records?limit=1', port, 503)
      if (refused.code !== 'RELEASE_CHECK_ONLY') fail('The check did not exclude ordinary Office routes.')
      const listeners = readListeners([port])
      if (listeners.length !== 1 || listeners[0].address !== '127.0.0.1' || listeners[0].pids.some(pid => bootstrapProcessIdentity(pid).pgid !== started.gate.pgid)) fail('The release check has an unrecorded or non-loopback listener.')
    }))
    await stop(started, `${name}-stop`)
    if (readListeners([port]).length) fail('The release-check port did not become free.')
  }
  async function startOrdinary(name, root) {
    const started = await group(name, root, process.execPath, ['tools/serve-dev.mjs', '--built', '--prepared'], environment(c, paths, c.database, c.servicePort, 'ordinary', root === c.stableCheckout))
    const entry = { group: started, topology: null, root }
    ordinary.push(entry)
    const expected = { ...fromOf(c), repository: root }
    await journal.step(`${name}-verify`, () => waitVerified(c, async () => {
      const read = await verifyBootstrapServing(officeRequest, expected)
      if (read.runtime.worker?.started !== (c.topology.worker !== null)) fail('The new ordinary worker presence differs from the recorded original topology.')
      entry.topology = observeBootstrapTopology(read.runtime, started.gate, root, journal)
      verifyLocalTopology({ ...c, developmentRepository: root, topology: entry.topology })
      return read
    }))
    return entry
  }
  async function stopOrdinary(entry, name) {
    if (!entry.topology && entry.group.exit === null) {
      // Health failure does not justify a process-name search outside our chain.
      entry.topology = discoverBootstrapTopology(entry.group.gate, entry.root, journal)
    }
    if (entry.topology) {
      for (const identity of Object.values(entry.topology).filter(Boolean)) inspectNamedProcess(identity)
      journal.append(name, 'topology-before-stop', { topology: entry.topology })
    }
    await stop(entry.group, name)
    if (entry.topology) for (const identity of [entry.topology.server, entry.topology.worker].filter(Boolean)) {
      try { const process = bootstrapProcessIdentity(identity.pid); if (!['Z', 'X'].includes(process.state)) fail('A recorded detached child remains after its supervisor stopped; cleanup is uncertain.') }
      catch (error) { if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error }
    }
  }
  // A group left running is not held by this controller, so the command can return.
  function release(group) { group.child.unref(); group.child.channel?.unref() }
  function recordSetAside(check, where) {
    journal.append('database-holder-check', 'set-aside', { where, setAside: check.setAside, otherUsersUnreadable: check.otherUsersUnreadable })
  }
  async function guardDatabase(where) {
    const guard = await theExclusiveLockGuard(c.database)
    lastGuard = guard
    journal.append('exclusive-lock-guard', guard.taken ? 'taken' : 'refused', { where, ...guard })
    if (!guard.taken) fail(guard.says)
    return guard
  }
  async function settled(state, detail) {
    journal.append('result', 'verified', { state, ...detail, paths })
    await journal.close()
    return { state, phase, mode: c.mode, target: c.targetCommit, paths, ...detail, guard: lastGuard }
  }
  async function prepare() {
    originalArtifacts = await inspectArtifacts(c.developmentRepository, c.targetCommit)
    await journal.step('prepare-private-directories', () => {
      mkdirSync(work, { mode: 0o700 }); mkdirSync(join(work, 'home'), { mode: 0o700 }); mkdirSync(saved, { mode: 0o700 }); syncBootstrapDirectory(c.recoveryRoot)
    })
    await journal.step('clone-independent-stable-checkout', () => cloneBootstrapStableCheckout(c), { developmentRepository: c.developmentRepository, stableCheckout: c.stableCheckout, targetCommit: c.targetCommit })
    await journal.step('copy-private-check-database', () => copyAndVerifySqlite(c.database, candidateDatabase))
    const env = environment(c, paths, candidateDatabase, c.releaseCheckPort, 'release-check')
    await command('install-locked-dependencies', c.stableCheckout, 'npm', ['ci', '--include=dev', '--no-audit', '--no-fund'], env)
    await command('typecheck-candidate', c.stableCheckout, 'npm', ['run', 'typecheck'], env)
    await command('build-web', c.stableCheckout, process.execPath, ['--input-type=module', '--eval', BUILD], env)
    for (const name of originalArtifacts.plugins) await command(`build-plugin-${name}`, c.stableCheckout, process.execPath, ['tools/build-a-plugin.mjs', name, '--json'], env)
    const artifacts = await inspectArtifacts(c.stableCheckout, c.targetCommit)
    await releaseCheck('private-write-excluded-check', candidateDatabase, c.releaseCheckPort)
    await journal.step('retain-original-artifacts', () => copyAndVerifyArtifacts(c.developmentRepository, saved, originalArtifacts))
    await verifyRetainedArtifacts(c.developmentRepository, originalArtifacts)
    verifyOriginalSource()
    await verifyBootstrapServing(officeRequest, fromOf(c)); verifyLocalTopology(c)
    await journal.step('create-dated-tag', () => createBootstrapDatedTag(c))
    verifyBootstrapStableSource(c)
    const settings = verifyBootstrapSettingsSource(c, { prepared: true })
    if (!isDeepStrictEqual(settings.identity, initialSettings.identity)) fail('The main settings file changed during preparation.')
    const state = { version: 1, state: 'PREPARED', preparedAt: localStamp(new Date()), candidateTag: c.candidateTag, commit: c.targetCommit, tree: c.targetTree, configurationHash: configurationHash(c), from: fromOf(c), to: toOf(c), paths, artifacts, originalArtifacts, databaseIdentity: metadata(c.database), keysIdentity: metadata(keysPathFrom({ MOLE_OFFICE_DB: c.database })), originalTopology: c.topology, settingsFileCheck: settings.fileCheck, settingsIdentity: settings.identity }
    const stateFile = join(work, 'prepared-state.json'), bytes = JSON.stringify(state, null, 2) + '\n', sha256Base64 = digest(bytes)
    await journal.step('write-private-prepared-state', () => { writeFileSync(stateFile, bytes, { flag: 'wx', mode: 0o600 }); syncBootstrapFile(stateFile); syncBootstrapDirectory(work) })
    const shared = await import('../../src/shared/stable-bootstrap-notices.ts')
    const record = { kind: 'note', title: shared.STABLE_BOOTSTRAP_PREPARED_TITLE, data: { date: localStamp(new Date()).slice(0, 10), body: shared.STABLE_BOOTSTRAP_PREPARED_BODY, extra: { stableBootstrapPrepared: shared.stableBootstrapPreparedSchema.parse({ version: 1, scope, evidence: bootstrapEvidencePin(c), stateSha256Base64: sha256Base64 }) } } }
    const event = await journal.step('file-original-prepared-note', async () => {
      const reply = await officeRequest({ method: 'POST', path: '/api/records', body: record }, { api: apiOf(c.servicePort) })
      if (reply.status !== 201 || reply.cut !== false || reply.location !== null) fail('The original PREPARED note is unconfirmed; retain state for supervised inspection.')
      const filed = JSON.parse(reply.body).record
      if (!filed?.id || filed.kind !== 'note' || filed.origin !== 'authored' || filed.deletedAt !== null) fail('The PREPARED note lacks original authored provenance.')
      const original = await requestObject(officeRequest, `/api/records/${filed.id}/revisions/1`, c.servicePort)
      if (original.seq !== 1 || original.op !== 'create' || original.recordId !== filed.id || original.provedBy !== 'an-agent-key' || original.who?.sessionId !== officeRequest.identity?.session || original.who?.actorType !== 'agent' || !isDeepStrictEqual(original.content, { kind: record.kind, title: record.title, summary: null, data: record.data, deletedAt: null }) || versionOf(original.content) !== original.contentHash) fail('The PREPARED note original creation differs from the observed preparation.')
      return { id: filed.id, seq: 1, contentHash: original.contentHash }
    })
    journal.append('prepared-event', 'observed', { event, sha256Base64, path: stateFile })
    return settled('PREPARED', { prepared: { path: stateFile, sha256Base64, event }, liveBlocked: valid.liveBlocked, says: 'Preparation is recorded. The original development service has not been stopped.' })
  }
  async function handoff() {
    await verifyEvidence()
    await notices.verifyBootstrapStopAuthority(authorityRequest, { officeRequest, api: apiOf(c.servicePort) })
    const announcement = notices.beforeBootstrapRequest(c, fromOf(c), c.targetTree)
    before = await journal.step('notice-before', () => notices.announceBootstrap({ path: paths.noticeJournal, api: apiOf(c.servicePort), request: announcement, serving: toOf(c), afterSendId: c.noticeSendIds.after, timeoutMs: c.health.timeoutMs }, { officeRequest }))
    // The shared helper must accept only this exact original reservation here.
    await notices.verifyBootstrapStopAuthority(authorityRequest, { officeRequest, api: apiOf(c.servicePort), expectedBefore: before })
    await verifyEvidence(); await readPreparedBootstrapState(c, paths); verifyLocalTopology(c)
    verifyOriginalSource()
    for (const identity of Object.values(c.topology).filter(Boolean)) inspectNamedProcess(identity)
    journal.append('old-topology', 'recorded-before-stop', { topology: c.topology })
    downtimeAt = performance.now()
    await stopBootstrapGroup(c.topology.supervisor, { journal, name: 'stop-original-supervisor', stopTimeoutMs: c.health.stopTimeoutMs, supervisor: c.topology.supervisor, allowSupervisor: true })
    for (const identity of [c.topology.server, c.topology.worker].filter(Boolean)) {
      try { const process = bootstrapProcessIdentity(identity.pid); if (!['Z', 'X'].includes(process.state)) fail('A recorded old descendant survived its supervisor; no guessed stop is authorized.') }
      catch (error) { if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error }
    }
    if (readListeners(c.listeners.map(row => row.port)).length) fail('An original API/redirect listener remains after the recorded stop.')
    recordSetAside(noDatabaseHolders(c.database), 'after-stop')
    await guardDatabase('after-stop')
    await journal.step('verified-sanitized-backup', async () => {
      const { takeTheBackup } = await import('../../src/server/lib/backup.ts')
      const result = await takeTheBackup(c.database, backup, false)
      if (!result.taken) fail(result.said)
      syncBootstrapFile(backup); syncBootstrapDirectory(work)
    })
    snapshot = await journal.step('private-exact-rollback-image', () => copyAndVerifySqlite(c.database, privateDatabase))
    journal.append('snapshot-boundary', 'recorded', { snapshot, says: 'Restoration discards writes accepted after this private snapshot.' })
    databaseTouched = true
    await journal.step('checkpoint-real-database', () => checkpointBootstrapDatabase(c.database))
    await journal.step('pair-development-with-stable', async () => {
      // Every storage operation has finished, and the original is stopped.
      recordSetAside(noDatabaseHolders(c.database), 'pairing')
      await guardDatabase('pairing')
      await readPreparedBootstrapState(c, paths)
      const file = join(c.developmentRepository, '.env'), backup = file + '.before-' + c.candidateTag
      try { lstatSync(backup); fail(words.pairingBackupExists) } catch (error) { if (error.code !== 'ENOENT') throw error }
      pairing = { file, backup, before: { sha256: initialSettings.identity.sha256 } }
      journal.append('pair-development-with-stable', 'intent', pairing)
      const { setTheLine } = await import('../../src/config/env-file-line.mjs')
      const changed = await setTheLine(file, 'MOLE_OFFICE_STABLE_CHECKOUT', c.stableCheckout, c.candidateTag)
      pairing = { file, ...changed }
      const settings = verifyBootstrapSettingsSource(c, { prepared: true, paired: true })
      journal.append('pair-development-with-stable', 'observed', { ...pairing, identity: settings.identity, settingsResolution: settings.resolution, settingsModuleResolution: settings.moduleResolution })
      if (changed.backup !== backup || changed.before.sha256 !== initialSettings.identity.sha256 || changed.before.withoutTheLine !== changed.after.withoutTheLine || changed.before.mode !== initialSettings.identity.mode || changed.before.uid !== initialSettings.identity.uid || changed.before.gid !== initialSettings.identity.gid || changed.before.mode !== changed.after.mode || changed.before.uid !== changed.after.uid || changed.before.gid !== changed.after.gid || settings.identity.sha256 !== changed.after.sha256) fail(words.pairingChangedOthers)
      await readPreparedBootstrapState(c, paths)
    })
    await releaseCheck('real-write-excluded-check', c.database, c.servicePort, true)
    await readPreparedBootstrapState(c, paths)
    const service = await startOrdinary('publish-stable', c.stableCheckout)
    await readPreparedBootstrapState(c, paths)
    await verifyRetainedArtifacts(c.stableCheckout, prepared.artifacts)
    const elapsed = performance.now() - downtimeAt
    journal.append('published', 'verified', { topology: service.topology, stopToServingMs: elapsed })
    release(service.group)
    return settled('published', { service: service.topology, stopToServingMs: elapsed, snapshot, says: 'The stable checkout is serving the same code commit. Recovery can discard writes accepted after the recorded snapshot.' })
  }
  async function recover(failure) {
    try {
      journal.prepareRecovery()
      journal.append('recovery', 'attempt', { reason: String(failure.message), paths })
      for (const entry of [...ordinary].reverse()) await stopOrdinary(entry, 'stop-failed-ordinary-start')
      for (const check of [...knownChecks].reverse()) if (check.exit === null) await stop(check, 'stop-failed-check')
      for (const started of [...owned].reverse()) if (started.exit === null && !ordinary.some(entry => entry.group === started)) {
        if (['publish-stable', 'recover-development'].includes(started.name)) await stopOrdinary({ group: started, topology: null, root: started.gate.cwd }, 'stop-failed-unreturned-ordinary-start')
        else await stop(started, 'stop-failed-command')
      }
      if (pairing) await journal.step('restore-development-settings', async () => {
        const { putTheBackupBack } = await import('../../src/config/env-file-line.mjs')
        if (existsSync(pairing.backup)) await putTheBackupBack(pairing.file, pairing.backup, pairing.before.sha256)
        else if (createHash('sha256').update(readFileSync(pairing.file)).digest('hex') !== pairing.before.sha256) fail(words.pairingBackupAbsent)
        const settings = verifyBootstrapSettingsSource(c, { prepared: true, expectRefusal: true })
        if (settings.identity.sha256 !== initialSettings.identity.sha256 || settings.identity.mode !== initialSettings.identity.mode || settings.identity.uid !== initialSettings.identity.uid || settings.identity.gid !== initialSettings.identity.gid) fail(words.settingsChanged)
        journal.append('restore-development-settings', 'observed', { file: pairing.file, backup: pairing.backup, identity: settings.identity, settingsRefusal: settings.refusal })
      })
      if (await originalStillServing()) {
        return await settled('unchanged', { failure: String(failure.message), says: 'The original development service is verified; retained preparation requires inspection.' })
      }
      if (downtimeAt === null) fail('The original topology is not intact and no original stop was attempted; supervised recovery is required.')
      recordSetAside(noDatabaseHolders(c.database), 'recovery')
      await guardDatabase('recovery')
      if (readListeners(c.listeners.map(row => row.port)).length) fail('A listener remains; original recovery cannot safely start.')
      verifyOriginalSource()
      await verifyRetainedArtifacts(c.developmentRepository, originalArtifacts)
      if (databaseTouched) await journal.step('restore-private-exact-database', async () => {
        if (!snapshot || await bootstrapFileHash(privateDatabase) !== snapshot.sha256) fail('The retained private exact rollback image changed.')
        const restoring = c.database + '.bootstrap-restoring'
        for (const suffix of ['-wal', '-shm', '-journal']) rmSync(c.database + suffix, { force: true })
        copyFileSync(privateDatabase, restoring, constants.COPYFILE_EXCL); chmodSync(restoring, 0o600); syncBootstrapFile(restoring)
        renameSync(restoring, c.database); syncBootstrapDirectory(dirname(c.database))
        if (await bootstrapFileHash(c.database) !== snapshot.sha256) fail('The restored SQLite bytes differ from the private image.')
      })
      journal.append('recovery-argv', 'difference', { previous: c.topology.supervisor.argv, recovery: [process.execPath, 'tools/serve-dev.mjs', '--built', '--prepared'], says: 'Recovery adds --prepared to the previous --built invocation so restored artifacts are not rebuilt.' })
      const recovered = await startOrdinary('recover-development', c.developmentRepository)
      release(recovered.group)
      return await settled('restored', { failure: String(failure.message), service: recovered.topology, snapshot, stopToRecoveredMs: performance.now() - downtimeAt, says: 'The original development topology is verified. Its supervisor now uses --built --prepared; writes after the snapshot were discarded if the database was restored.' })
    } catch (restoreFailure) {
      try { journal.append('recovery', 'failed', { reason: String(restoreFailure.message), paths, snapshot, settings: pairing }) } catch { /* Keep the original private lock/journal paths. */ }
      const remaining = owned.filter(group => group.exit === null)
      for (const group of remaining) release(group)
      return { state: 'NOT RESTORED', phase, mode: c.mode, target: c.targetCommit, paths, failure: String(failure.message), restoreFailure: String(restoreFailure.message), snapshot, guard: lastGuard, settings: pairing ? { ...pairing, backupExists: existsSync(pairing.backup), rollbackImage: privateDatabase } : null, remainingGroups: remaining.map(group => group.gate), says: 'NOT RESTORED. Retain all private paths for supervised recovery; no unknown process was signalled.' }
    }
  }
  let result
  try { result = phase === 'prepare' ? await prepare() : await handoff() }
  catch (failure) { result = await recover(failure) }
  if (!before) return result
  return notices.finishBootstrapNotice({ path: paths.noticeJournal, before, result, evidence: bootstrapEvidencePin(c), serving: toOf(c), sendId: c.noticeSendIds.after }, { officeRequest, verifyService: expected => verifyBootstrapServing(officeRequest, expected) })
}
