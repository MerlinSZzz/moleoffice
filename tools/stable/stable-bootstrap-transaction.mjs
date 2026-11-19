// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** First handoff configuration and transaction. Importing it never opens a database. */
import { existsSync, lstatSync, realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { localStamp } from '../../src/shared/time.ts'
import { keysPathFrom, readSetting } from '../../src/config/settings.mjs'
import { theStableCheckoutFolder } from '../../src/config/sandbox-folder.mjs'
import { requireReadOnlyGitConfig } from '../read-only-git-config.mjs'
import { requireIndependentGitObjects, requireStorageTheUpgradeAccepts } from '../independent-storage.mjs'
import { bootstrapOrigin, verifyBootstrapStableSource, verifyBootstrapSettingsSource } from './stable-bootstrap-launcher.mjs'
import { BOOTSTRAP_SERVICE_SETTINGS, bootstrapFail as fail, bootstrapGit as git, canonicalExisting, containsPath, rehearsalPortRefusals } from './stable-bootstrap-support.mjs'

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
function strict(value, names, label) {
  if (!object(value) || Object.keys(value).some(name => !names.includes(name))) fail(`${label} contains an unknown field or is not an object.`)
}
function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(`${label} must be an integer from ${min} to ${max}.`)
}
function pin(value, original, label) {
  strict(value, ['id', 'seq', 'contentHash'], label)
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(value.id ?? '') || !/^[a-f0-9]{16}$/.test(value.contentHash ?? '') || !Number.isSafeInteger(value.seq) || value.seq < 1 || (original && value.seq !== 1)) fail(`${label} must pin its exact ${original ? 'original ' : ''}revision.`)
}
function identity(value, role, root) {
  strict(value, ['pid', 'ppid', 'pgid', 'startTime', 'groupLeader', 'cwd', 'argv'], `${role} identity`)
  for (const name of ['pid', 'ppid', 'pgid']) integer(value[name], 1, 2 ** 31 - 1, `${role} identity ${name}`)
  strict(value.groupLeader, ['pid', 'startTime'], `${role} group identity`)
  if (!/^\d+$/.test(value.startTime ?? '') || !/^\d+$/.test(value.groupLeader.startTime ?? '') || value.groupLeader.pid !== value.pgid || value.cwd !== root) fail(`${role} identity needs exact startTime, group birth and source cwd.`)
  if (!Array.isArray(value.argv) || !value.argv.length || value.argv.some(word => typeof word !== 'string' || word.includes('\0'))) fail(`${role} identity argv is invalid.`)
  if (role === 'supervisor' && (!value.argv.some(word => word === 'tools/serve-dev.mjs' || word === join(root, 'tools/serve-dev.mjs')) || !value.argv.includes('--built') || value.argv.some(word => word === '--prepared') && !value.argv.includes('--built'))) fail('The supervisor argv must name serve-dev --built.')
}
function freeze(value) { if (object(value) || Array.isArray(value)) { for (const child of Object.values(value)) freeze(child); Object.freeze(value) } return value }

/**
 * Settings identity, read-only Git and a read-only look at the listening ports only. In particular, never open SQLite or keys.json.
 * `env` is the environment of the command, where its caller may name the ports a rehearsal keeps clear.
 */
export function validateBootstrapConfig(input, { phase = 'prepare', env = process.env } = {}) {
  if (!['prepare', 'handoff'].includes(phase)) fail('The bootstrap phase must be prepare or handoff.')
  strict(input, ['version', 'mode', 'developmentRepository', 'stableCheckout', 'database', 'targetCommit', 'targetTree', 'candidateTag', 'evidence', 'recoveryRoot', 'serviceHome', 'serviceSettings', 'topology', 'listeners', 'servicePort', 'releaseCheckPort', 'notices', 'noticeSendIds', 'stopAuthority', 'health', 'prepared'], 'Configuration')
  const c = structuredClone(input)
  if (c.version !== 1 || !['rehearsal', 'live'].includes(c.mode)) fail('Configuration version/mode is unsupported.')
  canonicalExisting(c.database, 'database')
  const keys = keysPathFrom({ MOLE_OFFICE_DB: c.database })
  canonicalExisting(keys, `The key file beside the database, ${keys},`)
  if (c.mode === 'rehearsal') {
    const data = canonicalExisting(dirname(c.database), 'rehearsal data directory', true)
    if (data.uid !== process.getuid() || (data.mode & 0o777) !== 0o700) fail('The rehearsal data directory must be private, owned by this user and mode 0700.')
  }
  for (const name of ['developmentRepository', 'recoveryRoot', 'serviceHome']) canonicalExisting(c[name], name, true)
  if (typeof c.stableCheckout !== 'string' || !isAbsolute(c.stableCheckout) || resolve(c.stableCheckout) !== c.stableCheckout || realpathSync(dirname(c.stableCheckout)) !== dirname(c.stableCheckout)) fail('stableCheckout must name a canonical absolute destination with an existing canonical parent.')
  if (phase === 'prepare' && existsSync(c.stableCheckout)) fail('The stable destination already exists; consume its exact prepared state instead of preparing again.')
  if (phase === 'handoff') canonicalExisting(c.stableCheckout, 'prepared stableCheckout', true)
  const roots = [c.developmentRepository, c.stableCheckout, c.recoveryRoot]
  for (let a = 0; a < roots.length; a++) for (let b = a + 1; b < roots.length; b++) if (containsPath(roots[a], roots[b]) || containsPath(roots[b], roots[a])) fail('Source, stable and recovery storage must be separate without overlap.')
  if (containsPath(c.recoveryRoot, c.database) || containsPath(c.recoveryRoot, c.serviceHome)) fail('Recovery storage must be separate from service data and home.')
  if (c.mode === 'rehearsal' && [c.developmentRepository, c.stableCheckout].some(root => containsPath(root, c.database) || containsPath(root, c.serviceHome))) fail('Rehearsal data and home must be external to both checkouts.')
  // The stable office starts with HOME set to serviceHome, and its sandbox launcher refuses this one folder.
  const theOneFolder = theStableCheckoutFolder(c.serviceHome)
  if (c.stableCheckout !== theOneFolder) fail(`stableCheckout must be ${theOneFolder}, the stable checkout's one folder under serviceHome, which the sandbox launcher refuses to mount; this configuration names ${c.stableCheckout}.`)
  const privateRoot = statSync(c.recoveryRoot)
  if ((privateRoot.mode & 0o777) !== 0o700 || privateRoot.uid !== process.getuid()) fail('recoveryRoot must be private, owned by this user and mode 0700.')
  for (const file of [c.database, keys]) {
    const stat = lstatSync(file)
    if (stat.uid !== process.getuid() || (stat.mode & 0o022) || stat.nlink !== 1) fail(`The existing database and its key file ${keys} must have one name, owned by this user and not writable by others.`)
  }
  strict(c.serviceSettings, BOOTSTRAP_SERVICE_SETTINGS, 'Service setting allowlist')
  for (const [name, value] of Object.entries(c.serviceSettings)) {
    if (typeof value !== 'string') fail('Named service settings must be strings.')
    if (name === 'TZ') { try { new Intl.DateTimeFormat('en', { timeZone: value }).format() } catch { fail('The named TZ is invalid.') } }
    else readSetting(name, { [name]: value })
  }
  strict(c.topology, ['supervisor', 'server', 'worker'], 'Topology')
  for (const role of ['supervisor', 'server']) identity(c.topology[role], role, c.developmentRepository)
  if (c.topology.worker !== null) identity(c.topology.worker, 'worker', c.developmentRepository)
  const pids = Object.values(c.topology).filter(Boolean).map(value => value.pid)
  if (new Set(pids).size !== pids.length) fail('Recorded topology identities must have distinct pids.')
  for (const name of ['servicePort', 'releaseCheckPort']) integer(c[name], 1024, 65535, name)
  if (!Array.isArray(c.listeners) || c.listeners.length < 2) fail('Record the exact API and redirect listeners.')
  for (const row of c.listeners) {
    strict(row, ['address', 'port', 'role'], 'Listener')
    integer(row.port, 1024, 65535, 'Listener port')
    if (typeof row.address !== 'string' || !['api', 'redirect'].includes(row.role) || (row.role === 'api' && row.port !== c.servicePort)) fail('The listener address, role or servicePort differs.')
    if (c.mode === 'rehearsal' && row.address !== '127.0.0.1') fail('Rehearsal listeners must be loopback only.')
  }
  if (!c.listeners.some(row => row.role === 'redirect') || !c.listeners.some(row => row.role === 'api') || c.listeners.some(row => row.port === c.releaseCheckPort) || new Set(c.listeners.map(row => `${row.address}:${row.port}`)).size !== c.listeners.length) fail('API, redirect and scratch ports must be distinct and listeners unique.')
  if (c.listeners.some(row => row.role === 'redirect' && row.port === c.servicePort)) fail('Redirect and API ports must differ.')
  if (c.mode === 'rehearsal') {
    // A listener port may be held by the throwaway office's own recorded processes; the scratch port by nothing.
    const refusals = [...new Set(c.listeners.map(row => row.port))].flatMap(port => rehearsalPortRefusals(port, { ownPids: pids, env }))
      .concat(rehearsalPortRefusals(c.releaseCheckPort, { env }))
    if (refusals.length) fail(`A rehearsal keeps clear of ports that are busy or named: ${refusals.join('; ')}.`)
  }
  if (c.mode === 'rehearsal') {
    for (const name of ['MOLE_OFFICE_API', 'MOLE_OFFICE_WEB', 'MOLE_OFFICE_WEB_PORT', 'MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES']) if (c.serviceSettings[name] === undefined) fail('A rehearsal requires every explicit local launch address override.')
    const redirectPorts = new Set(c.listeners.filter(row => row.role === 'redirect').map(row => row.port))
    const overrideError = () => fail('A rehearsal address setting must match its own loopback listener and port.')
    for (const name of ['MOLE_OFFICE_API', 'MOLE_OFFICE_WEB']) {
      if (c.serviceSettings[name] === undefined) continue
      let url
      try { url = new URL(c.serviceSettings[name]) } catch { overrideError() }
      if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.search || url.hash || (name === 'MOLE_OFFICE_API' ? Number(url.port) !== c.servicePort : !redirectPorts.has(Number(url.port)))) overrideError()
    }
    if (c.serviceSettings.MOLE_OFFICE_WEB_PORT !== undefined && !redirectPorts.has(Number(c.serviceSettings.MOLE_OFFICE_WEB_PORT))) overrideError()
    if (c.serviceSettings.MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES !== undefined && c.serviceSettings.MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES !== 'none') overrideError()
  }
  strict(c.health, ['attempts', 'intervalMs', 'timeoutMs', 'stopTimeoutMs', 'commandTimeoutMs'], 'Health bounds')
  for (const [name, lo, hi] of [['attempts', 1, 120], ['intervalMs', 1, 5000], ['timeoutMs', 1, 15000], ['stopTimeoutMs', 1, 120000], ['commandTimeoutMs', 1, 1800000]]) integer(c.health[name], lo, hi, `health.${name}`)
  // The evidence is the whole-suite receipt, or for a first handoff the owner decision that stands for it.
  if (object(c.evidence) && c.evidence.kind === 'owner-decision') {
    strict(c.evidence, ['kind', 'decision'], 'Evidence')
    pin(c.evidence.decision, true, 'Evidence decision')
  } else {
    strict(c.evidence, ['recordId', 'seq', 'contentHash'], 'Evidence')
    pin({ id: c.evidence.recordId, seq: c.evidence.seq, contentHash: c.evidence.contentHash }, true, 'Evidence')
  }
  strict(c.notices, ['before', 'after'], 'Notices')
  for (const stage of ['before', 'after']) {
    strict(c.notices[stage], ['text', 'approval'], 'Notice')
    if (typeof c.notices[stage].text !== 'string' || !c.notices[stage].text.trim() || c.notices[stage].text.length > 4000) fail('Each first-handoff notice needs explicit text.')
    pin(c.notices[stage].approval, false, 'Notice approval')
  }
  strict(c.noticeSendIds, ['before', 'after'], 'Notice send IDs')
  if (['before', 'after'].some(stage => !/^[A-Za-z0-9_-]{1,120}$/.test(c.noticeSendIds[stage] ?? '')) || c.noticeSendIds.before === c.noticeSendIds.after) fail('Notice send IDs must be distinct and immutable.')
  if (phase === 'prepare') {
    if (c.stopAuthority !== null || c.prepared !== undefined) fail('Preparation requires deferred null stop authority and no claimed prepared state.')
  } else {
    strict(c.stopAuthority, ['kind', 'decision'], 'Stop authority')
    if (c.stopAuthority.kind !== 'owner-decision') fail('Handoff needs the original scoped owner decision in either local mode.')
    pin(c.stopAuthority.decision, true, 'Owner stop decision')
    strict(c.prepared, ['path', 'sha256Base64', 'event'], 'Prepared reference')
    canonicalExisting(c.prepared.path, 'prepared state')
    if (!/^[A-Za-z0-9+/]{43}=$/.test(c.prepared.sha256Base64 ?? '')) fail('The prepared state requires its exact base64 SHA-256 digest.')
    pin(c.prepared.event, true, 'Prepared event')
  }
  const root = c.developmentRepository
  requireReadOnlyGitConfig(root)
  bootstrapOrigin(root)
  if (git(root, ['rev-parse', '--show-toplevel']) !== root || !lstatSync(join(root, '.git')).isDirectory()) fail('Development must be an independent repository root.')
  const common = git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  if (common !== join(root, '.git') || existsSync(join(common, 'objects/info/alternates'))) fail('Development Git storage must be independent without alternates.')
  requireIndependentGitObjects(common)
  if (git(root, ['status', '--porcelain=v1', '--untracked-files=all'])) fail('Development source must be clean, not dirty.')
  if (git(root, ['symbolic-ref', '--quiet', 'HEAD']) !== 'refs/heads/main') fail('The development checkout must be on branch refs/heads/main.')
  for (const name of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply']) if (existsSync(join(common, name))) fail('Development has an unfinished Git operation.')
  if (!/^[a-f0-9]{40}$/.test(c.targetCommit ?? '') || git(root, ['rev-parse', 'HEAD']) !== c.targetCommit || git(root, ['rev-parse', `${c.targetCommit}^{commit}`]) !== c.targetCommit) fail('Source HEAD must equal the exact target commit.')
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(c.targetTree ?? '') || git(root, ['rev-parse', `${c.targetCommit}^{tree}`]) !== c.targetTree) fail('Source tree must equal the exact target tree.')
  git(root, ['merge-base', '--is-ancestor', c.targetCommit, 'refs/heads/main'])
  if (phase === 'prepare' && git(root, ['branch', '--list', 'stable'])) fail('Branch stable already exists.')
  if (!/^stable-\d{4}-\d{2}-\d{2}-[A-Za-z0-9][A-Za-z0-9._-]*$/.test(c.candidateTag ?? '') || (phase === 'prepare' && c.candidateTag.slice(7, 17) !== localStamp(new Date()).slice(0, 10))) fail('candidateTag must be a dated tag, created on its current local preparation day.')
  if (phase === 'prepare' && git(root, ['tag', '--list', c.candidateTag])) fail('The candidate tag already exists.')
  let liveBlocked = null
  if (c.mode === 'live' && phase === 'handoff') {
    try { requireStorageTheUpgradeAccepts(c.developmentRepository, c.stableCheckout, git) }
    catch (error) { liveBlocked = `Live handoff is refused because the ordinary upgrade would refuse this stable checkout: "${error.message}"` }
  }
  // The exact live storage refusal already blocks handoff. Verify the source
  // only when that refusal has not made its storage check redundant.
  if (phase === 'handoff' && !liveBlocked) verifyBootstrapStableSource(c)
  for (const file of ['package.json', 'package-lock.json']) git(root, ['cat-file', '-e', `${c.targetCommit}:${file}`])
  if (git(root, ['ls-tree', '-r', '--name-only', c.targetCommit, '--', '.env'])) fail('The source must not track a settings file.')
  const paths = { lock: join(c.recoveryRoot, 'stable-bootstrap.lock'), journal: join(c.recoveryRoot, `${c.candidateTag}.journal.jsonl`), noticeJournal: join(c.recoveryRoot, `${c.candidateTag}.notices.jsonl`), work: join(c.recoveryRoot, c.candidateTag) }
  if (phase === 'prepare') { for (const path of Object.values(paths)) if (existsSync(path)) fail('A retained transaction path or exclusive lock already exists; supervised recovery is required.') }
  else {
    if (existsSync(paths.lock) || existsSync(paths.noticeJournal)) fail('A handoff lock or prior attempt remains; only supervised recovery or delivery retry is allowed.')
    canonicalExisting(paths.journal, 'preparation journal'); canonicalExisting(paths.work, 'prepared work directory', true)
    if (c.prepared.path !== join(paths.work, 'prepared-state.json')) fail('The prepared state file is not the exact retained transaction path.')
  }
  verifyBootstrapSettingsSource(c, { prepared: phase === 'handoff' })
  return freeze({ config: c, paths, commonGitDirectory: common, liveBlocked })
}

/** The retained state reader is separate from absent-destination preparation checks. */
export async function validatePreparedBootstrapConfig(input) {
  const valid = validateBootstrapConfig(input, { phase: 'handoff' })
  const { readPreparedBootstrapState } = await import('./stable-bootstrap-execution.mjs')
  return { ...valid, prepared: await readPreparedBootstrapState(valid.config, valid.paths) }
}

export async function bootstrapStable(input, options = {}) {
  const phase = options.phase ?? 'prepare'
  const valid = validateBootstrapConfig(input, { phase, env: options.env })
  if (typeof options.officeRequest !== 'function') fail('The canonical Office request adapter is required.')
  const { runStableBootstrap } = await import('./stable-bootstrap-execution.mjs')
  return runStableBootstrap(valid, { ...options, phase })
}

/** An existing delivery journal cannot resume a transaction or start recovery. */
export async function retryStableBootstrapNotice(path, { officeRequest }) {
  const { retryBootstrapNotice } = await import('./stable-bootstrap-notices.mjs')
  const { verifyBootstrapServing } = await import('./stable-bootstrap-execution.mjs')
  return retryBootstrapNotice(path, { officeRequest, verifyService: expected => verifyBootstrapServing(officeRequest, expected) })
}
