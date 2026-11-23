// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A stable release is a transaction over code, SQLite, dependencies, pages and service groups. */
import { createHash } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { constants, accessSync, chmodSync, closeSync, copyFileSync, existsSync, fsyncSync, fstatSync, ftruncateSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync, writeSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { isDeepStrictEqual } from 'node:util'
import Database from 'better-sqlite3'
import { DATED_STABLE_TAG } from '../../src/config/stable-tag.mjs'
import { readTheBuildStamp } from '../../src/config/build-stamp.mjs'
import { PLUGINS_FOLDER, PLUGIN_MANIFEST_FILE, PLUGIN_BUILT_FOLDER, PLUGIN_ID } from '../../src/shared/plugin-change.ts'
import { apiAddressFrom, envFileValues, mergedEnvironment, readSetting, theStableCheckoutNamedIn } from '../../src/config/settings.mjs'
import { localStamp } from '../../src/shared/time.ts'
import { stableEmergencyStandingLine } from '../../src/shared/stable-emergency.ts'
import { requireReadOnlyGitConfig } from '../read-only-git-config.mjs'
import { artifactIdentity, backupSqliteInOneStep, copyArtifactTree, requireIndependentArtifactHardLinks, requireIndependentArtifactTargets, requireInstalledPackagesMatchTheLock, requireStorageTheUpgradeAccepts } from '../independent-storage.mjs'
import { announceUpgrade, beforeEmergencyRequest, beforeUpgradeRequest, completedOutcome, emergencyNoticeContract, finishUpgradeNotice, retryUpgradeNotice, triedAgainForAMinute, validateNoticeConfig } from './stable-upgrade-notices.mjs'
import { theDatabaseHolders, theExclusiveLockGuard, theFileHash } from '../database-holders.mjs'

import { aProcessByItsName, observeUpgradeTopology, servingUpgradeTopology, theClockTicksASecond, theOrdinaryTopologyUnder, theTicksBy, theUptimeInHundredths, upgradeServiceGroups, whyNotTheStartsOwn } from './stable-upgrade-processes.mjs'
import { currentProcessRecord } from './stable-bootstrap-processes.mjs'
import { descendantsOf } from './stable-bootstrap-support.mjs'
import { STABLE_SERVICE_SETTINGS as SERVICE_SETTINGS } from './stable-service-settings.mjs'
import { THE_MIGRATIONS_PATH, theReviewedList, theWayBackCheck } from './the-way-back.mjs'
import { theGateCountSpoolStep } from './stable-gate-count-spool-step.mjs'
import { THE_ELECTRON_PACKAGE, electronsBinaryIn } from './electrons-binary.mjs'
import { A_GIGABYTE, THE_ROOM_IS_READ_EVERY_MS, theBuildBytes, theReleaseFloor, theRoom, theRoomRefusal, watchTheRoom } from './stable-release-room.mjs'
import { THE_FOLDER_WORD, readClosedVerificationResult, validateClosedVerification } from './closed-upgrade-verification.mjs'
import { clearTheUpgradeMark, readTheUpgradeMark, theResumeCommand, theUpgradeMarkPath, writeTheUpgradeMark } from '../../src/config/the-upgrade-mark.mjs'
import { theLogSaysTheStartupIsDone } from '../../src/config/supervisor-startup-done.mjs'
const fail = (s) => { throw new Error(s) }
const inside = (parent, child) => child === parent || child.startsWith(parent + sep)
const gitEnvironment = () => ({ PATH: process.env.PATH, HOME: '/nonexistent', LANG: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_OPTIONAL_LOCKS: '0', GIT_NO_REPLACE_OBJECTS: '1', GIT_TERMINAL_PROMPT: '0' })
function git(root, args) {
  const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'gc.auto=0', '-c', 'maintenance.auto=false', '-C', root, ...args], { env: gitEnvironment(), encoding: 'utf8', timeout: 15_000, maxBuffer: 8 * 1024 * 1024 })
  if (result.error || result.status !== 0) fail(`Git ${args[0]} failed in ${root}: ${result.error?.message ?? result.stderr.trim()}`)
  return result.stdout.trim()
}
function canonical(path, kind) {
  if (typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path || realpathSync(path) !== path) fail(`${kind} must be an existing absolute canonical path: ${String(path)}`)
  return path
}
/**
 * THE STAGED RE-MINT MAP (upgrade-stable.criteria.md, items 28 and 31, (a)): named by its whole path, an existing ordinary
 * file outside the stable checkout, that this user owns and can read and nobody else can write. Read when the
 * configuration is read, and again at the last safe point before the stop.
 */
function theStagedMapIsReadable(map, stableCheckout) {
  if (typeof map !== 'string' || !isAbsolute(map) || resolve(map) !== map) fail(`The staged re-mint map must be named by its whole path, and ${JSON.stringify(map)} is not one.`)
  if (!existsSync(map)) fail(`The staged re-mint map ${map} does not exist.`)
  if (realpathSync(map) !== map) fail(`The staged re-mint map must be named by its whole path, and ${map} is reached through a link to ${realpathSync(map)}.`)
  if (inside(stableCheckout, map)) fail(`The staged re-mint map ${map} is inside the stable checkout ${stableCheckout}, which the upgrade moves and a rollback moves back. Stage it outside.`)
  const s = statSync(map)
  if (!s.isFile()) fail(`The staged re-mint map ${map} is not an ordinary file.`)
  if (s.uid !== process.getuid()) fail(`The staged re-mint map ${map} is owned by user id ${s.uid}, not by this user, user id ${process.getuid()}.`)
  if (s.mode & 0o022) fail(`The staged re-mint map ${map} has mode ${(s.mode & 0o7777).toString(8).padStart(4, '0')}, so its group or others can write it.`)
  try { accessSync(map, constants.R_OK) } catch { fail(`The staged re-mint map ${map} cannot be read by this user.`) }
}
/**
 * The staged map's bytes are still those the candidate was re-minted with (upgrade-stable.criteria.md, "A staged re-mint
 * map is applied by a second command"). Asked at the last safe point before the stop, and again before the live re-mint.
 */
function theStagedMapIsTheOneTried(map, sha256) {
  const now = theFileHash(map).sha256
  if (now !== sha256) fail(`The staged re-mint map ${map} changed after the candidate was re-minted with it: its sha256 was ${sha256} and is now ${now}.`)
}
function integer(value, min, max, name) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(`${name} must be an integer from ${min} to ${max}.`)
}
function syncDirectory(path) { const fd = openSync(path, 'r'); try { fsyncSync(fd) } finally { closeSync(fd) } }
function syncFile(path) { const fd = openSync(path, 'r'); try { fsyncSync(fd) } finally { closeSync(fd) } }

export { artifactIdentity } from '../independent-storage.mjs'

function pluginNames(root, ref) {
  const files = git(root, ['ls-tree', '-r', '--name-only', ref, '--', PLUGINS_FOLDER]).split('\n')
  return files.filter((p) => { const pieces = p.split('/'); return pieces.length === 3 && pieces[0] === PLUGINS_FOLDER && pieces[2] === PLUGIN_MANIFEST_FILE }).map((p) => { const id = p.split('/')[1]; if (!PLUGIN_ID.test(id)) fail(`Invalid plugin folder ${id}.`); return id }).sort()
}
function artifacts(root, names) { return ['node_modules', 'dist', ...names.map((n) => `${PLUGINS_FOLDER}/${n}/${PLUGIN_BUILT_FOLDER}`)] }
function checkArtifacts(root, names) {
  const paths = artifacts(root, names)
  const identities = {}
  for (const path of paths) {
    const at = join(root, path)
    if (!existsSync(at) || !lstatSync(at).isDirectory() || readdirSync(at).length === 0) fail(`The required artifact directory is absent, linked or empty: ${at}`)
    if (git(root, ['ls-files', '--', path])) fail(`Git tracks the artifact directory ${path}; replacing it would overwrite source.`)
    identities[path] = artifactIdentity(at, root, paths.map((p) => join(root, p)))
  }
  requireIndependentArtifactTargets(root, paths)
  if (!existsSync(join(root, 'dist/web/index.html'))) fail(`The built web page is absent in ${root}.`)
  for (const name of names) {
    const manifest = JSON.parse(readFileSync(join(root, PLUGINS_FOLDER, name, PLUGIN_MANIFEST_FILE), 'utf8'))
    if (!Array.isArray(manifest.pages) || !manifest.pages.length) fail(`Plugin ${name} has no pages.`)
    for (const page of manifest.pages) {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(page.slug) || !existsSync(join(root, PLUGINS_FOLDER, name, PLUGIN_BUILT_FOLDER, `${page.slug}.html`))) fail(`Plugin ${name} is missing a built page.`)
    }
  }
  return identities
}
function cleanRepository(root) {
  if (git(root, ['rev-parse', '--show-toplevel']) !== root || git(root, ['rev-parse', '--is-bare-repository']) !== 'false') fail(`Not a repository root: ${root}`)
  requireReadOnlyGitConfig(root)
  if (git(root, ['status', '--porcelain=v1', '--untracked-files=all'])) fail(`The repository is dirty: ${root}`)
  for (const path of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply']) if (existsSync(join(git(root, ['rev-parse', '--absolute-git-dir']), path))) fail(`Git has unfinished work in ${root}.`)
}

/** Linux start ticks distinguish a recorded group from a reused pid. No environment values are reported. */
export function processIdentity(pid) {
  const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
  const rest = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
  return { pid, ppid: Number(rest[1]), pgid: Number(rest[2]), startTime: rest[19], state: rest[0] }
}
function members(pgid) {
  return readdirSync('/proc').filter((s) => /^\d+$/.test(s)).flatMap((s) => {
    try { const p = processIdentity(Number(s)); return p.pgid === pgid && !['Z', 'X'].includes(p.state) ? [p] : [] } catch (e) { if (e.code === 'ENOENT' || e.code === 'ESRCH') return []; throw e }
  })
}
function recordedGroup(group, config) {
  integer(group.pgid, 2, 2 ** 31 - 1, 'service group pgid')
  if (typeof group.startTime !== 'string' || !/^\d+$/.test(group.startTime)) fail('Every recorded group needs its Linux startTime ticks.')
  const p = processIdentity(group.pgid)
  if (p.pgid !== group.pgid || p.startTime !== group.startTime || p.pgid === processIdentity(process.pid).pgid || ['Z', 'X'].includes(p.state)) fail(`The recorded group identity does not match ${group.pgid}.`)
  if (group.cwd !== config.stableCheckout || group.database !== config.database || group.port !== config.servicePort || realpathSync(`/proc/${group.pgid}/cwd`) !== group.cwd) fail(`The recorded group's checkout, database or port disagrees with the configuration.`)
  const environment = processEnvironment(group.pgid)
  explicitDatabaseAndPort(environment, config)
  developmentCheckout(environment, config)
}
function processEnvironment(pid) {
  return Object.fromEntries(readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').filter(Boolean).map((s) => { const at = s.indexOf('='); return [s.slice(0, at), s.slice(at + 1)] }))
}
function explicitDatabaseAndPort(env, config) {
  const dbSetting = readSetting('MOLE_OFFICE_DB', env), portSetting = readSetting('MOLE_OFFICE_PORT', env)
  if (dbSetting.source !== 'the environment' || portSetting.source !== 'the environment' || dbSetting.value !== config.database || String(portSetting.value) !== String(config.servicePort)) fail('The recorded service process does not name the explicit database and port.')
}
function developmentCheckout(env, c) {
  const development = readSetting('MOLE_OFFICE_DEVELOPMENT_CHECKOUT', env)
  if (development.source !== 'the environment' || development.value !== c.developmentRepository) fail('The serving process must name the configured development checkout in MOLE_OFFICE_DEVELOPMENT_CHECKOUT.')
}
function serviceSettingsIdentity(c) {
  const stableFile = join(c.stableCheckout, '.env')
  try { lstatSync(stableFile); fail('The stable checkout must not have its own .env, including a link. Settings come from the development checkout.') }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  const path = join(c.developmentRepository, '.env')
  if (!existsSync(path)) fail('The development .env must pair this stable checkout with MOLE_OFFICE_STABLE_CHECKOUT.')
  if (!lstatSync(path).isFile() || realpathSync(path) !== path) fail('Development settings must be a local ordinary file.')
  accessSync(path, constants.R_OK)
  const paired = theStableCheckoutNamedIn(path)
  if (paired !== realpathSync(c.stableCheckout)) fail('The development .env must name this stable checkout in MOLE_OFFICE_STABLE_CHECKOUT.')
  return artifactIdentity(path)
}
function servingGroup(c) {
  const pids = ownedPort(c.servicePort, c.serviceGroups)
  const topology = servingUpgradeTopology(pids, c)
  const file = join(c.developmentRepository, '.env'), persisted = envFileValues(file)
  for (const pid of pids) {
    const raw = processEnvironment(pid), effective = mergedEnvironment(raw, file)
    explicitDatabaseAndPort(raw, c)
    developmentCheckout(raw, c)
    if (raw.HOME !== c.serviceHome) fail('The recorded ordinary service home differs from its serving process.')
    for (const key of SERVICE_SETTINGS) if (effective[key] !== (c.serviceSettings[key] ?? persisted[key])) fail(`The recorded service setting ${key} differs from its process or was not recorded.`)
    const controlled = [...SERVICE_SETTINGS, 'MOLE_OFFICE_DB', 'MOLE_OFFICE_PORT', 'MOLE_OFFICE_START_MODE', 'MOLE_OFFICE_DEVELOPMENT_CHECKOUT', 'MOLE_OFFICE_RESTART_REASON', 'MOLE_OFFICE_LISTEN_FD']
    if (raw.MOLE_OFFICE_LISTEN_FD !== undefined && raw.MOLE_OFFICE_LISTEN_FD !== '3') fail('The serving process has an unexpected supervisor listener descriptor.')
    for (const key of Object.keys(raw)) {
      if (controlled.includes(key)) continue
      if ((key.startsWith('MOLE_') || /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|^(OPENAI|ANTHROPIC|CLAUDE|CODEX|DEEPSEEK|KIMI)_/.test(key)) && raw[key] !== persisted[key]) fail('The serving process has an external setting or secret that cannot be restored from the recorded configuration.')
    }
  }
  return topology
}
/** Each process of an ordinary start must name the configured database, port and checkout in its environment. */
function checkTheStartsEnvironment(topology, c) {
  for (const record of topology.records) {
    const raw = processEnvironment(record.pid)
    explicitDatabaseAndPort(raw, c); developmentCheckout(raw, c)
  }
  return topology
}
function workerIdentity(runtime, primary, c) {
  return checkTheStartsEnvironment(observeUpgradeTopology(runtime, primary, c), c)
}
/** When a gate ended, read at its exit event. It never throws, because it runs inside that event. */
function theGatesEnd() {
  try { return { hundredths: theUptimeInHundredths() } } catch (error) { return { unread: String(error.message ?? error) } }
}
/** Whether the gate of `group` still runs as the recorded process: not ended, not a zombie and not a reused pid. */
function theGateRuns(group) {
  try { const gate = processIdentity(group.pgid); return !['Z', 'X'].includes(gate.state) && gate.startTime === group.startTime }
  catch (error) { if (['ENOENT', 'ESRCH'].includes(error.code)) return false; throw error }
}
/**
 * The live processes `alive` that an ordinary start left in its gate's group after the gate ended, each shown to be the
 * start's own by whyNotTheStartsOwn, or a failure that names each one that is not. The gate's end is the time of its
 * exit event, which comes when Node reaps it, so the end is never earlier than the gate really ended.
 */
function theStartsOwnInItsEndedGroup(group, alive, c) {
  if (group.endedAt?.hundredths === undefined) fail(`The time its gate ended could not be read from /proc/uptime (${group.endedAt?.unread ?? 'its exit was not seen'}), so no process's start time can be set beside it.`)
  const gate = { startTicks: Number(group.startTime), endTicks: theTicksBy(group.endedAt.hundredths) }
  const strangers = alive.map(row => whyNotTheStartsOwn(row.pid, gate, c)).filter(why => why !== null)
  if (strangers.length) fail(`Its gate has ended, and its group still holds ${strangers.join('; ')}.`)
  return alive
}
/**
 * The way back's one sentence when it cannot find or check the processes of an ordinary start. It names the start's
 * group, says why, and says that nothing was restored.
 */
function theWayBackCannotCheck(group, error) {
  const why = String(error?.message ?? error)
  return new Error(`The way back restored nothing, because it could not find and check the processes of the ordinary start in process group ${group.pgid}. ${/[.!?]$/.test(why) ? why : `${why}.`}`)
}
function listeners(port) {
  const r = spawnSync('ss', ['-H', '-ltnp', `sport = :${port}`], { encoding: 'utf8', timeout: 5_000, env: gitEnvironment() })
  if (r.error || r.status !== 0) fail(`Could not verify listeners on port ${port}.`)
  return r.stdout.trim()
}
function freePort(port) { if (listeners(port)) fail(`Port ${port} is still occupied.`) }
function ownedPort(port, groups) {
  const rows = listeners(port)
  const pids = [...rows.matchAll(/pid=(\d+)/g)].map((m) => Number(m[1]))
  if (!rows || !pids.length || pids.some((pid) => !groups.some((g) => processIdentity(pid).pgid === g.pgid))) fail(`Port ${port} is not served only by the recorded groups.`)
  return pids
}
/** `wayBack` is set only by the way back, whose failure here also says that it restored nothing. */
function onlyRecordedDatabaseHolders(c, groups, note = null, wayBack = false) {
  const check = theDatabaseHolders(c.database)
  if (note) note(check)
  const outside = check.holders.filter((p) => !groups.some((g) => g.pgid === p.pgid))
  const said = wayBack ? 'The way back restored nothing, because the database' : 'The database'
  if (outside.length) fail(`${said} has a holder outside the recorded service groups: ${outside.map((p) => `process ${p.pid} (${p.name})`).join(', ')}.`)
  if (check.unnamedLocks.length) fail(`${wayBack ? 'The way back restored nothing, because a lock' : 'A lock'} on the database names no process found under /proc: ${check.unnamedLocks.join('; ')}.`)
  return check
}
function checkDatabase(file) {
  if (!statSync(file).isFile() || statSync(file).size === 0) fail('The configured database is absent or empty.')
  const db = new Database(file, { readonly: true, fileMustExist: true })
  try {
    if (db.pragma('integrity_check', { simple: true }) !== 'ok' || !db.prepare("SELECT name FROM sqlite_master WHERE name='records'").get()) fail('The configured database is damaged or is not an office database.')
  } finally { db.close() }
}

/** A re-mint map is applied by a migration, and a release whose target changes no migration runs none. */
export const CASE_1_TAKES_NO_REMINT_MAP = 'A re-mint map is applied by a migration, and this target changes no file under the migrations folder, so the release runs no migration and cannot apply the map. Nothing was changed.'

/** Closed verification compares the target with a copy taken before the migration, and a release of case 1 takes none. */
export const CASE_1_TAKES_NO_CLOSED_VERIFICATION = 'Closed verification is refused for this target, because its records, reads and settings checks compare the target with a copy of the database taken before the migration, and a target that changes no file under the migrations folder is released with no copy.'

/**
 * THE RELEASE'S CASE (upgrade-stable.criteria.md, "A slimmer stable release", part 1), read from the files under the
 * migrations folder that differ between the version serving and the target. With none, the release is case 1 and copies
 * no data. With any file added, changed, deleted or renamed there, it is case 2 and migrates a copy of the database
 * first. Renames are not followed, so a renamed file is named by both of its names.
 */
export function theReleaseCase(repository, baseline, target) {
  const files = git(repository, ['diff', '--no-renames', '--name-only', '-z', baseline, target, '--', THE_MIGRATIONS_PATH]).split('\0').filter(Boolean).sort()
  if (!files.length) return { case: 1, because: `The target changes no file under ${THE_MIGRATIONS_PATH}, so this is a release of case 1: it copies no data and runs no migration.`, files }
  return { case: 2, because: `The target changes ${files.length === 1 ? '1 file' : `${files.length} files`} under ${THE_MIGRATIONS_PATH} (${files.join(', ')}), so this is a release of case 2: it migrates and checks a copy of the database before downtime, and keeps at most one copy at a time.`, files }
}

/**
 * Read-only filesystem/Git/process validation. It neither imports evidence nor contacts the office.
 * `wayBack` is set only by returnToThePreviousStable: the target is then the previous stable tag's commit,
 * and `wayBack.reviewed` is the reviewed list that may allow a migration doing more than add.
 */
export function validateUpgradeConfig(config, wayBack = null) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) fail('The configuration must be a JSON object.')
  const c = structuredClone(config)
  const only = (value, keys, label) => { if (!value || Object.keys(value).some((key) => !keys.includes(key))) fail(`${label} holds an unknown field.`) }
  only(c, ['developmentRepository', 'stableCheckout', 'database', 'targetCommit', 'evidence', 'emergency', 'previousBaselineTag', 'candidateTag', 'serviceGroups', 'notice', 'noticeApproval', 'noticeSendIds', 'releaseCheckPort', 'servicePort', 'health', 'recoveryRoot', 'serviceHome', 'serviceSettings', 'closedVerification', 'remintMap'], 'Configuration')
  if ('closedVerification' in c) validateClosedVerification(c.closedVerification)
  // An emergency release reads no receipt before it goes in (criteria: upgrade-stable.criteria.md, the emergency path).
  if ('emergency' in c && c.emergency !== true) fail('The emergency field must be true or absent.')
  const emergency = c.emergency === true
  if (emergency && 'evidence' in c) fail('An emergency release names no receipt. A fix that has a receipt goes in with mode urgent-fix.')
  validateNoticeConfig(c)
  if (!emergency) only(c.evidence, ['recordId', 'seq', 'contentHash'], 'Evidence reference')
  only(c.health, ['attempts', 'intervalMs', 'timeoutMs', 'stopTimeoutMs', 'commandTimeoutMs'], 'Health bounds')
  for (const group of c.serviceGroups ?? []) only(group, ['pgid', 'startTime', 'cwd', 'database', 'port'], 'Service group')
  only(c.serviceSettings, SERVICE_SETTINGS, 'Service settings')
  for (const [key, value] of Object.entries(c.serviceSettings)) {
    if (typeof value !== 'string') fail('Recorded service settings must be strings.')
    if (key === 'TZ') { try { new Intl.DateTimeFormat('en', { timeZone: value }).format() } catch { fail('The recorded TZ is not a supported time zone.') } }
    else readSetting(key, { [key]: value })
  }
  canonical(c.serviceHome, 'serviceHome')
  if (!statSync(c.serviceHome).isDirectory() || statSync(c.serviceHome).uid !== process.getuid()) fail('The service home must be an existing directory owned by this user.')
  for (const key of ['developmentRepository', 'stableCheckout', 'database', 'recoveryRoot']) canonical(c[key], key)
  if ('remintMap' in c) theStagedMapIsReadable(c.remintMap, c.stableCheckout)
  // The verifiers run in the stable checkout, and a rollback moves that checkout back to the old commit.
  const commands = c.closedVerification?.verifiers?.flatMap((entry, n) => [[`verifiers[${n}].command`, entry.command], ...(entry.prepare ? [[`verifiers[${n}].prepare`, entry.prepare]] : [])]) ?? [['command', c.closedVerification?.command ?? []]]
  for (const [label, words] of commands) for (const word of words) {
    const named = isAbsolute(word) ? [resolve(word), ...(existsSync(word) ? [realpathSync(word)] : [])] : existsSync(join(c.stableCheckout, word)) ? [join(c.stableCheckout, word)] : []
    if (named.some((path) => inside(c.stableCheckout, path))) fail(`The closed verification's ${label} names a path inside the stable checkout: ${word}. A rollback moves that checkout back to the old commit, so name the verifier in a checkout the upgrade does not move.`)
  }
  for (const [a, b] of [[c.developmentRepository, c.stableCheckout], [c.developmentRepository, c.recoveryRoot], [c.stableCheckout, c.recoveryRoot]]) if (inside(a, b) || inside(b, a)) fail('Repositories and recovery root must be separate directories.')
  for (const root of [c.developmentRepository, c.stableCheckout, c.recoveryRoot]) if (inside(root, c.serviceHome)) fail('The ordinary service home must be separate from source and recovery folders.')
  for (const root of [c.developmentRepository, c.stableCheckout, c.recoveryRoot]) if (inside(root, c.database)) fail('The database must be external to both checkouts and the recovery root.')
  for (const root of [c.developmentRepository, c.stableCheckout]) cleanRepository(root)
  const stableGit = requireStorageTheUpgradeAccepts(c.developmentRepository, c.stableCheckout, git)
  if (c.closedVerification && existsSync(join(stableGit, 'stable-upgrade.lock'))) fail(`Recovery or lock path already exists: ${join(stableGit, 'stable-upgrade.lock')}`)
  const origin = git(c.developmentRepository, ['remote', 'get-url', 'origin'])
  if (!origin || origin !== git(c.stableCheckout, ['remote', 'get-url', 'origin'])) fail('The development and stable origins disagree.')
  if (!/^[0-9a-f]{40}$/.test(c.targetCommit ?? '')) fail('targetCommit must name a full 40-character commit.')
  if (git(c.developmentRepository, ['rev-parse', `${c.targetCommit}^{commit}`]) !== c.targetCommit) fail('The target commit is absent.')
  git(c.developmentRepository, ['merge-base', '--is-ancestor', c.targetCommit, 'main'])
  if (![c.previousBaselineTag, c.candidateTag].every(tag => typeof tag === 'string' && DATED_STABLE_TAG.test(tag))) fail('Name dated baseline and candidate tags (stable-YYYY-MM-DD-name). Recovery refuses a checkout at no dated tag.')
  if (!wayBack && c.candidateTag.slice(7, 17) !== localStamp(new Date()).slice(0, 10)) fail('The candidate tag must name the current local day.')
  for (const tag of [c.previousBaselineTag, c.candidateTag]) git(c.stableCheckout, ['check-ref-format', `refs/tags/${tag}`])
  if (git(c.stableCheckout, ['branch', '--show-current']) !== 'stable') fail('The stable checkout must be on branch stable.')
  const baseline = git(c.stableCheckout, ['rev-parse', `refs/tags/${c.previousBaselineTag}^{commit}`])
  if (baseline === c.targetCommit) fail('The target is already installed; no upgrade is needed.')
  git(c.developmentRepository, ['merge-base', '--is-ancestor', ...(wayBack ? [c.targetCommit, baseline] : [baseline, c.targetCommit])])
  const releaseCase = theReleaseCase(c.developmentRepository, baseline, c.targetCommit)
  if (releaseCase.case === 1 && 'remintMap' in c) fail(CASE_1_TAKES_NO_REMINT_MAP)
  if (releaseCase.case === 1 && c.closedVerification) fail(CASE_1_TAKES_NO_CLOSED_VERIFICATION)
  if (git(c.stableCheckout, ['rev-parse', 'HEAD']) !== baseline) fail('Stable HEAD is not the previous baseline tag.')
  if (wayBack) {
    if (git(c.stableCheckout, ['rev-parse', `refs/tags/${c.candidateTag}^{commit}`]) !== c.targetCommit) fail('The previous stable tag does not name the previous commit.')
  } else if (git(c.stableCheckout, ['tag', '--list', c.candidateTag]) || git(c.developmentRepository, ['tag', '--list', c.candidateTag])) fail('The candidate tag already exists.')
  const wayBackCheck = wayBack ? theWayBackCheck((args) => git(c.stableCheckout, args), c.targetCommit, baseline, wayBack.reviewed) : null
  if (wayBackCheck?.refusal) fail(`${wayBackCheck.refusal} The way back runs the previous version on the database as it is, so it changed nothing.`)
  if (!emergency && (!c.evidence || typeof c.evidence.recordId !== 'string' || !c.evidence.recordId || c.evidence.seq !== 1 || typeof c.evidence.contentHash !== 'string' || !c.evidence.contentHash)) fail('Name the original evidence record, seq 1 and its contentHash.')
  if (typeof c.notice !== 'string' || !c.notice.trim()) fail('An upgrade notice is required.')
  for (const key of ['releaseCheckPort', 'servicePort']) integer(c[key], 1024, 65535, key)
  if (c.releaseCheckPort === c.servicePort) fail('The release-check scratch port must be different from the ordinary port.')
  // health.attempts may be left out. Each start then waits up to THE_START_LIMIT_MS.
  for (const [key, lo, hi] of [['attempts', 1, 120], ['intervalMs', 1, 5_000], ['timeoutMs', 1, 15_000], ['stopTimeoutMs', 1, 120_000], ['commandTimeoutMs', 1, 1_800_000]]) if (key !== 'attempts' || c.health?.attempts !== undefined) integer(c.health?.[key], lo, hi, `health.${key}`)
  const recovery = statSync(c.recoveryRoot)
  if (recovery.dev !== statSync(stableGit).dev) fail('The private recovery root and stable Git directory must share a filesystem for the durable journal link.')
  if (!recovery.isDirectory() || (recovery.mode & 0o777) !== 0o700 || recovery.uid !== process.getuid()) fail('The recovery root must be owned by this user and mode 0700.')
  accessSync(c.recoveryRoot, constants.R_OK | constants.W_OK | constants.X_OK)
  accessSync(c.stableCheckout, constants.W_OK)
  accessSync(dirname(c.database), constants.W_OK)
  const named = wayBack ? `${c.previousBaselineTag}.back-${wayBack.stamp}` : c.candidateTag
  const paths = { lock: join(stableGit, 'stable-upgrade.lock'), journal: join(c.recoveryRoot, `${named}.journal.jsonl`), noticeJournal: join(c.recoveryRoot, `${named}.notices.jsonl`), work: join(c.recoveryRoot, named) }
  Object.assign(paths, { candidate: join(paths.work, 'candidate'), saved: join(paths.work, 'baseline-artifacts'), privateDatabase: join(paths.work, 'restore.sqlite'), candidateDatabase: join(paths.work, 'candidate.sqlite'), restoringDatabase: c.database + '.stable-upgrade-restore', home: join(paths.work, 'home') })
  for (const p of [paths.lock, paths.journal, paths.noticeJournal, paths.work, paths.restoringDatabase]) if (existsSync(p)) fail(`Recovery or lock path already exists: ${p}`)
  for (const root of [c.developmentRepository, c.stableCheckout]) {
    for (const p of ['package.json', 'package-lock.json']) if (!existsSync(join(root, p))) fail(`Locked package inputs are absent: ${join(root, p)}`)
  }
  for (const ref of [baseline, c.targetCommit]) {
    const root = ref === baseline ? c.stableCheckout : c.developmentRepository
    if (git(root, ['ls-tree', '-r', '--name-only', ref, '--', '.env'])) fail('An environment file must not be tracked in the release source.')
    for (const p of ['package.json', 'package-lock.json']) git(root, ['cat-file', '-e', `${ref}:${p}`])
    for (const line of git(root, ['ls-tree', '-r', ref, '--', PLUGINS_FOLDER]).split('\n')) if (line.startsWith('120000') || line.startsWith('160000')) fail('Plugin sources must be ordinary tracked files, not links or submodules.')
  }
  const oldPlugins = pluginNames(c.stableCheckout, baseline)
  const newPlugins = pluginNames(c.developmentRepository, c.targetCommit)
  const savedIdentities = checkArtifacts(c.stableCheckout, oldPlugins)
  if (readTheBuildStamp(join(c.stableCheckout, 'dist/web')).commit !== baseline) fail('The baseline build stamp does not name the previous commit.')
  requireInstalledPackagesMatchTheLock(c.stableCheckout)
  const databaseStat = statSync(c.database)
  if (databaseStat.uid !== process.getuid() || (databaseStat.mode & 0o022) || databaseStat.nlink !== 1) fail('The database must be owned by this user, not writable by other users, and have one filesystem name.')
  // Do not open SQLite during dry validation: even readonly WAL opens can create companions.
  const header = Buffer.alloc(16), headerFd = openSync(c.database, 'r')
  try { readSync(headerFd, header, 0, 16, 0) } finally { closeSync(headerFd) }
  if (!header.equals(Buffer.from('SQLite format 3\0'))) fail('The database is not a SQLite file.')
  if (!Array.isArray(c.serviceGroups) || !c.serviceGroups.length) fail('At least one recorded service group is required.')
  if (new Set(c.serviceGroups.map((g) => g.pgid)).size !== c.serviceGroups.length) fail('A service group is recorded twice.')
  for (const g of c.serviceGroups) recordedGroup(g, c)
  const settingsIdentity = serviceSettingsIdentity(c)
  servingGroup(c)
  onlyRecordedDatabaseHolders(c, c.serviceGroups)
  freePort(c.releaseCheckPort)
  // The way back needs the clock's tick rate to judge an ended gate's group (theStartsOwnInItsEndedGroup). It is read
  // here, while the old version still serves, so a rate that cannot be read stops this with nothing changed. The way back
  // then uses the rate kept from this reading.
  theClockTicksASecond()
  const tree = git(c.developmentRepository, ['rev-parse', `${c.targetCommit}^{tree}`])
  // An emergency BEFORE names the switch's throw and the message, which only the release check reads.
  const beforeRequest = emergency ? null : beforeUpgradeRequest(c, baseline, tree)
  return { config: c, paths, baseline, origin, oldPlugins, newPlugins, savedIdentities, settingsIdentity, beforeRequest, tree, wayBack: wayBackCheck, releaseCase }
}

function serviceEnvironment(c, paths, database, port, mode, root = null) {
  const paired = root === c.stableCheckout ? { MOLE_OFFICE_DEVELOPMENT_CHECKOUT: c.developmentRepository } : {}
  // No caller credentials, model settings, NODE_OPTIONS, Git settings or npm configuration survive.
  if (mode === 'ordinary') return { ...paired, PATH: process.env.PATH, LANG: 'C.UTF-8', HOME: c.serviceHome, ...c.serviceSettings, MOLE_OFFICE_DB: database, MOLE_OFFICE_PORT: String(port), MOLE_OFFICE_START_MODE: 'ordinary', NODE_ENV: 'production' }
  return { ...paired, PATH: process.env.PATH, LANG: 'C.UTF-8', ...(c.serviceSettings.TZ ? { TZ: c.serviceSettings.TZ } : {}), HOME: paths.home, TMPDIR: paths.home, XDG_CACHE_HOME: join(paths.home, 'cache'), XDG_CONFIG_HOME: join(paths.home, 'config'), npm_config_cache: join(paths.home, 'npm'), npm_config_userconfig: join(paths.home, 'npmrc'), npm_config_globalconfig: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', MOLE_OFFICE_DB: database, MOLE_OFFICE_PORT: String(port), ...(mode === 'release-check' || mode === LIVE_MODE ? { MOLE_OFFICE_START_MODE: mode } : {}), NODE_ENV: 'production' }
}
/**
 * What the closed verifier runs with, in its dry form and in a real run: the release-check settings without the pairing
 * with the development checkout. The pairing names the stable checkout's development data, and the verifier is named in
 * another checkout, whose settings refuse a pairing that does not name it.
 */
const theVerifiersEnvironment = (c, paths) => serviceEnvironment(c, paths, c.database, c.servicePort, 'release-check')
const THE_VERIFIER = 'tools/stable/verify-the-target.mjs'
/**
 * THE VERIFIER'S DRY FORM, run once before anything closes when the command names tools/stable/verify-the-target.mjs:
 * the command, then `--dry`, timeoutMs and the checks. Its one line, or null when the command names another verifier.
 * With a list of verifiers, the same for each entry with its own checks, in a list.
 */
function theVerifiersDryForm(c, paths) {
  const { command, verifiers, timeoutMs, checks } = c.closedVerification
  if (verifiers) return verifiers.map((entry, n) => theDryFormOf(c, paths, entry.command, timeoutMs, entry.checks, `verifier ${n + 1}'s`))
  return theDryFormOf(c, paths, command, timeoutMs, checks, "the verifier's")
}
function theDryFormOf(c, paths, command, timeoutMs, checks, whose) {
  if (!command.some((word) => word === THE_VERIFIER || word.endsWith(`/${THE_VERIFIER}`))) return null
  const [program, ...args] = command
  const ran = spawnSync(program, [...args, '--dry', String(timeoutMs), ...checks], { cwd: c.stableCheckout, env: theVerifiersEnvironment(c, paths), encoding: 'utf8', timeout: timeoutMs, maxBuffer: 1024 * 1024 })
  const how = ran.error ? `did not finish: ${ran.error.message}` : `exited ${ran.status ?? `on ${ran.signal}`}`
  if (ran.error || ran.status !== 0) fail(`Closed verification: ${whose} dry form ${how}, before anything closed. It said: ${`${ran.stdout ?? ''}${ran.stderr ?? ''}`.trim() || 'nothing'}`)
  return ran.stdout.trim()
}
/** What the dry plan says of a list of verifiers: the one budget, then each entry and what its dry form said. */
function theVerifiersPlan(c, verifierSays) {
  const { verifiers, timeoutMs } = c.closedVerification
  return [
    `Keep stable in read-only release-check mode on ${c.servicePort}, retaining the lock and private snapshot while the ${verifiers.length} configured verifiers run one after another, all within ${timeoutMs} ms. Ordinary admission waits for every check of every verifier and unchanged frozen state.`,
    ...verifiers.flatMap((entry, i) => {
      const how = [
        `in the ${entry.phases.length === 2 ? 'target and recovery phases' : `${entry.phases[0]} phase`}`,
        ...([...entry.command, ...(entry.prepare ?? [])].includes(THE_FOLDER_WORD) ? ['with a new empty folder for each run'] : []),
        ...(entry.prepare ? ['after its prepare command exits 0'] : []),
      ]
      return [
        `Verifier ${i + 1} answers ${entry.checks.join(', ')} ${how.join(', ')}.`,
        verifierSays[i] === null ? `Verifier ${i + 1}'s command does not name ${THE_VERIFIER}, so it is not run before anything closes, and its checks, its limit and its loading of better-sqlite3 were not checked.` : `Before anything closes, verifier ${i + 1}'s dry form said: ${verifierSays[i]}`,
      ]
    }),
  ]
}
async function readHealth(officeRequest, expected) {
  async function get(path) {
    const response = await officeRequest({ method: 'GET', path }, { api: apiAddressFrom({ MOLE_OFFICE_PORT: String(expected.port) }) })
    if (!response || response.status !== 200 || response.cut !== false || response.location !== null) fail(`Health on port ${expected.port} was refused, redirected or cut.`)
    const body = JSON.parse(response.body)
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail(`Health on port ${expected.port} did not return a JSON object.`)
    return body
  }
  const runtime = expected.mode === 'ordinary' ? await get('/api/runtime') : null
  if (runtime && runtime.repository?.head?.full === expected.commit && runtime.repository?.path === expected.repository && runtime.database?.path === expected.database && Number(new URL(runtime.addresses?.api).port) === expected.port) await expected.observeRuntime?.(runtime)
  const body = await get('/api/health')
  if (body.ok !== true) fail(`The service on ${expected.port} is unhealthy.`)
  if (expected.mode !== 'ordinary') {
    const identity = body.identity
    if (!identity || identity.commit !== expected.commit || identity.repository !== expected.repository || identity.database !== expected.database || identity.port !== expected.port || identity.mode !== expected.mode) fail(`Release-check identity does not match port ${expected.port}.`)
  } else {
    const world = body.world
    if (runtime.repository?.head?.full !== expected.commit || runtime.repository?.path !== expected.repository || runtime.database?.path !== expected.database || !runtime.addresses?.api || Number(new URL(runtime.addresses.api).port) !== expected.port || !world || world.repository !== expected.repository || world.database !== expected.database || world.port !== expected.port || typeof world.head !== 'string' || world.head.length < 7 || !expected.commit.startsWith(world.head)) fail(`Ordinary service identity does not match port ${expected.port}.`)
  }
  return body
}
/** How long a start may take to answer healthy, from the start of its process, when no health.attempts is named. */
export const THE_START_LIMIT_MS = 6 * 60_000
/** What the dry plan says of how long a start may take, and where that came from. */
function theStartLimitLine(c) {
  return c.health.attempts === undefined
    ? `Each start waits for a healthy answer for up to ${THE_START_LIMIT_MS / 60_000} minutes from the start of its process, reading every ${c.health.intervalMs} ms. That is the default limit, because the configuration names no health.attempts.`
    : `Each start reads its health at most ${c.health.attempts} times, ${c.health.intervalMs} ms apart, because the configuration names health.attempts as ${c.health.attempts}.`
}
/** With health.attempts, that many reads. Without, reads until THE_START_LIMIT_MS has passed since `startedAt`. */
async function waitHealth(c, officeRequest, expected, limit = null, startedAt = Date.now()) {
  const until = c.health.attempts === undefined ? startedAt + THE_START_LIMIT_MS : null
  let last
  for (let i = 0; ; i++) {
    if (limit && Date.now() >= limit.at) fail(`The health wait on port ${expected.port} was cut at ${limit.name}.`)
    try { return await readHealth(officeRequest, expected) } catch (e) { last = e }
    if (until === null ? i + 1 >= c.health.attempts : Date.now() + c.health.intervalMs >= until) break
    await delay(c.health.intervalMs)
  }
  if (until !== null) fail(`The service on port ${expected.port} gave no healthy answer within the start limit of ${THE_START_LIMIT_MS / 60_000} minutes. Its last answer: ${last?.message ?? last}`)
  throw last
}

/** The boot a process identity belongs to. A recorded process from another boot is gone, whatever runs under its pid now. */
function theBoot() { return readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim() }
function stillRunning({ pid, startTime, boot }, currentBoot) {
  if (boot !== currentBoot) return false
  try { const p = processIdentity(pid); return p.startTime === startTime && !['Z', 'X'].includes(p.state) }
  catch (error) { if (error.code === 'ENOENT' || error.code === 'ESRCH') return false; throw error }
}

/**
 * THE COUNT OF WORDS THE CHINESE PAGES SHOW IN ENGLISH (upgrade-stable.criteria.md, item 15 (d)): what
 * tools/stable/untranslated-words.mjs gives, run with the checkout's own loader in that checkout. The count goes to the
 * file named by the one argument, or to standard output for `-`. A counter that is missing or fails refuses.
 */
const COUNT_THE_UNTRANSLATED_WORDS = `
const { writeFileSync } = await import('node:fs');
const { translationStatus } = await import('./tools/stable/untranslated-words.mjs');
const text = JSON.stringify({ untranslatedCount: translationStatus().untranslatedCount }) + '\\n';
if (process.argv[1] === '-') process.stdout.write(text); else writeFileSync(process.argv[1], text, { flag: 'wx', mode: 0o600 });
`
function theUntranslatedCountIn(text, where) {
  let report
  try { report = JSON.parse(text) } catch { fail(`The untranslated-word counter in ${where} did not give its count.`) }
  if (!Number.isSafeInteger(report?.untranslatedCount) || report.untranslatedCount < 0) fail(`The untranslated-word counter in ${where} gave no whole-number count.`)
  return report.untranslatedCount
}
/** The dry run counts in the development checkout, which validation has found clean, and says which commit that is. */
function theDryCount(c) {
  const root = c.developmentRepository
  const counted = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', COUNT_THE_UNTRANSLATED_WORDS, '-'], { cwd: root, encoding: 'utf8', timeout: 120_000, maxBuffer: 1024 * 1024, env: { PATH: process.env.PATH, HOME: '/nonexistent', LANG: 'C.UTF-8' } })
  if (counted.error || counted.status !== 0) fail(`The untranslated-word counter failed in ${root}: ${counted.error?.message ?? counted.stderr.trim()}`)
  const commit = git(root, ['rev-parse', 'HEAD'])
  return { count: theUntranslatedCountIn(counted.stdout, root), checkout: root, commit, isTarget: commit === c.targetCommit }
}
const THE_WAY_BACK_SENDS_NO_COUNT = 'The way back sends no untranslated-word count.'
// Run in the candidate with its own loader: its notice contract parses the AFTER outcome the upgrade would send.
const ASK_THE_NOTICE_CONTRACT = `
const [schemaName, outcome] = process.argv.slice(1);
const contract = await import('./src/shared/stable-upgrade-notices.ts');
const value = JSON.parse(outcome);
const parsed = contract[schemaName].safeParse(value);
if (!parsed.success || parsed.data.untranslatedWords !== value.untranslatedWords) { process.stderr.write('The notice contract refused the count: ' + (parsed.error?.message ?? 'it dropped untranslatedWords') + '\\n'); process.exitCode = 1; }
`
/** The release check's mode for a version tried on the live database while another version serves it. */
const LIVE_MODE = 'release-check-live'
/** How a version's settings that refuse the live mode begin their refusal, the stable version serving today's as well. */
const THE_LIVE_MODE_REFUSED = `MOLE_OFFICE_START_MODE is "${LIVE_MODE}"`
/**
 * WHETHER THE CANDIDATE TAKES THE LIVE MODE (upgrade-stable.criteria.md, "A slimmer stable release", part 2): its own
 * settings are asked for it, in its checkout. The answer goes to the file named by the one argument: taken, or what the
 * settings threw. An import that fails ends the command, and the release stops before downtime.
 */
const ASK_FOR_THE_LIVE_MODE = `
const { writeFileSync } = await import('node:fs');
const { readSetting } = await import('./src/config/settings.mjs');
let answer;
try { readSetting('MOLE_OFFICE_START_MODE', { MOLE_OFFICE_START_MODE: ${JSON.stringify(LIVE_MODE)} }); answer = { takes: true } }
catch (error) { answer = { takes: false, refusal: String(error?.message ?? error) } }
writeFileSync(process.argv[1], JSON.stringify(answer) + '\\n', { flag: 'wx', mode: 0o600 });
`
function theLiveModeAnswerIn(text, where) {
  let answer
  try { answer = JSON.parse(text) } catch { fail(`The candidate's settings in ${where} gave no answer on ${LIVE_MODE}.`) }
  if (answer?.takes === true) return { takes: true }
  if (answer?.takes === false && typeof answer.refusal === 'string' && answer.refusal.startsWith(THE_LIVE_MODE_REFUSED)) return { takes: false, refusal: answer.refusal }
  fail(`The candidate's settings in ${where} were asked for ${LIVE_MODE} and did not answer with their refusal of it, so the release stops before downtime. They said: ${answer?.refusal ?? text.trim()}`)
}

/**
 * A RESUME'S CLAIM ON A CRASHED UPGRADE, beside its lock. A claim whose program still runs refuses a second resume. A claim
 * whose program ended is taken over. The returned function lets go of it.
 */
function claimTheResume(lock) {
  const claim = `${lock}.resume`, mine = { pid: process.pid, startTime: processIdentity(process.pid).startTime, boot: theBoot() }
  const ours = () => { try { return isDeepStrictEqual(JSON.parse(readFileSync(claim, 'utf8')), mine) } catch { return false } }
  const writing = `${claim}.${process.pid}`
  writeFileSync(writing, JSON.stringify(mine) + '\n', { mode: 0o600 })
  try {
    try { linkSync(writing, claim) } catch (error) {
      if (error.code !== 'EEXIST') throw error
      let held = null
      try { held = JSON.parse(readFileSync(claim, 'utf8')) } catch { /* A claim nobody can read is no running resume's. */ }
      if (held && stillRunning(held, mine.boot)) fail(`Another resume of this upgrade is running as process ${held.pid}, so this one did not start.`)
      renameSync(writing, claim)
    }
    if (!ours()) fail('Another resume of this upgrade took the claim at the same moment, so this one did not start.')
  } finally { rmSync(writing, { force: true }) }
  syncDirectory(dirname(claim))
  return () => { if (ours()) { rmSync(claim, { force: true }); syncDirectory(dirname(claim)) } }
}

/** The crashed upgrade's journal, read through its lock. Nothing in it is changed before every refusal has been checked. */
function readTheCrashedJournal(lock) {
  if (typeof lock !== 'string' || !isAbsolute(lock) || resolve(lock) !== lock || basename(lock) !== 'stable-upgrade.lock') fail('Name the upgrade lock by its absolute path: <stable Git folder>/stable-upgrade.lock.')
  let fd
  try { fd = openSync(lock, constants.O_RDWR | constants.O_APPEND | constants.O_NOFOLLOW) }
  catch (error) { fail(`There is no upgrade to resume at ${lock} (${error.code ?? error.message}).`) }
  let release = null
  try {
    const opened = fstatSync(fd)
    if (!opened.isFile() || opened.uid !== process.getuid() || (opened.mode & 0o077)) fail(`${lock} is not a private upgrade lock of this user.`)
    release = claimTheResume(lock)
    const bytes = readFileSync(fd)
    const end = bytes.lastIndexOf(0x0a) + 1
    const whole = bytes.subarray(0, end).toString('utf8')
    let events
    try { events = whole.split('\n').filter(Boolean).map((line) => JSON.parse(line)) } catch { fail(`A whole line of the journal ${lock} cannot be read, so the resume cannot tell where the upgrade stopped.`) }
    if (events.map((entry) => JSON.stringify(entry) + '\n').join('') !== whole) fail(`The journal ${lock} is not one an upgrade wrote.`)
    const first = events[0]
    if (first?.step !== 'lock' || first.phase !== 'attempt' || !first.config?.closedVerification) fail('Only a closed upgrade can be resumed, and this journal is not one.')
    const boot = theBoot()
    let controller = first.controller, ended = false
    for (const entry of events) {
      if (entry.step === 'resume' && entry.phase === 'attempt') { controller = entry.controller; ended = false }
      if (entry.step === 'recovery' && entry.phase === 'failed') ended = true
    }
    if (!ended && controller && stillRunning(controller, boot)) fail(`The program that wrote this journal, process ${controller.pid}, is still running, so the resume did not start.`)
    if (end < bytes.length) { ftruncateSync(fd, end); fsyncSync(fd) }
    return { fd, events, torn: bytes.length - end, first, boot, release }
  } catch (error) { release?.(); closeSync(fd); throw error }
}

/** What the journal says the crash left behind. */
function whatTheJournalSays(events) {
  const has = (step, phase) => events.some((e) => e.step === step && e.phase === phase)
  const last = (step, phase) => events.findLast((e) => e.step === step && e.phase === phase)
  const rollback = events.findLastIndex((e) => e.step === 'recovery' && e.phase === 'attempt')
  const opening = events.findLastIndex((e) => ['ordinary-start', 'recover-start'].includes(e.step) && e.phase === 'gate-attempt')
  // Each recorded group belongs to the boot of the program that recorded it.
  let boot = events[0].controller?.boot
  const groups = []
  for (const e of events) {
    if (e.step === 'resume' && e.phase === 'attempt') boot = e.controller.boot
    if (e.phase === 'group-recorded') groups.push({ step: e.step, pgid: e.pgid, startTime: e.startTime, cwd: e.cwd, port: e.port ?? null, ...(e.database ? { database: e.database } : {}), ...(e.parent ? { parent: e.parent } : {}), ...(e.log ? { log: e.log } : {}), boot })
  }
  const opened = opening > rollback ? events[opening] : null
  return {
    downtime: has('closed-time', 'started'), closed: last('closed-time', 'started') ?? null,
    codeTouched: has('stable-checkout', 'attempt'), tagTouched: has('candidate-tag', 'attempt'), artifactsTouched: has('install-artifacts', 'attempt'),
    savedReady: has('preserve-artifacts', 'done'), databaseTouched: has('closed-verification', 'attempted'), snapshot: last('database-snapshot', 'ready') ?? null,
    ordinaryStarted: has('ordinary-start', 'attempt'), noticeAttempted: has('notice-before', 'attempt'), before: last('notice-before', 'filed')?.original ?? null,
    beforeRequest: last('notice', 'recorded')?.request ?? null, counted: last('emergency-count', 'said')?.says ?? null,
    untranslatedWords: last('untranslated-words', 'counted')?.count ?? null,
    migrated: has('migrate', 'done') && (!events[0].config?.remintMap || has('remint', 'done')), databaseReplaced: has('recover-database', 'done'), rollbackBegan: rollback >= 0, failure: rollback >= 0 ? events[rollback].reason : null,
    opened, verified: opened ? events.slice(0, opening).findLast((e) => e.step === 'closed-verification' && ['verified', 'recovered'].includes(e.phase)) ?? null : null,
    groups,
  }
}

const GATE = `
const {spawn}=require('node:child_process');
let started=false;
const timer=setTimeout(()=>process.exit(125),15000);
process.on('message',m=>{if(m!=='start')return;started=true;clearTimeout(timer);process.removeAllListeners('message');
 const child=spawn(process.argv[1],JSON.parse(process.argv[2]),{stdio:'inherit',env:process.env});
 child.on('error',()=>process.exit(126));child.on('exit',(code,signal)=>process.exit(code??(signal?128:1)));});
process.on('disconnect',()=>{clearTimeout(timer);if(!started)process.exit(125)});
`

// Import from the candidate command's cwd. This module exports a builder; it has no CLI entry.
const BUILD_PAGE = `
const { buildThePage } = await import('./tools/build-the-page.mjs');
const built = await buildThePage({ say: line => process.stderr.write(line + '\\n') });
if (!built.ok) { process.stderr.write(built.output + '\\n'); process.exitCode = 1; }
`

function actionOf(step) {
  const actions = {
    lock: 'record the exclusive upgrade lock and recovery paths',
    'policy-lock': 'verify pinned release authorization under the exclusive lock',
    'policy-before': 'verify release authorization immediately before the BEFORE notice',
    'policy-stop': 'verify release authorization before stopping writers',
    'prepare-directories': 'prepare private recovery and build directories', notice: 'retain the notice request and pinned approval in the transaction journal',
    'notice-before': 'file and verify the approved announcement before downtime',
    'emergency-count': 'count the use of the emergency switch',
    'candidate-database': 'copy SQLite into the private candidate database', 'candidate-checkpoint': 'checkpoint the private candidate database into DELETE journal mode',
    clone: 'clone the development repository into independent candidate storage', 'candidate-checkout': 'check out the exact candidate commit detached',
    install: 'install the locked candidate dependencies with npm ci',
    'electron-binary': "fetch Electron's binary into the candidate's node_modules with the electron package's own install.js, which npm ci does not run",
    'candidate-live-mode': `ask the candidate's own settings whether they take ${LIVE_MODE}`,
    'candidate-typecheck': 'type-check the exact candidate', 'web-build': 'build and stamp the candidate web page',
    'candidate-migrate': 'migrate the private candidate database with the target on the scratch port',
    'candidate-remint': 'apply the staged re-mint map to the migrated private candidate database',
    'candidate-check': 'start the candidate in release-check mode', 'candidate-check-health': 'verify the candidate health and served identity',
    'candidate-stop': 'stop the recorded candidate group and verify its port is free', 'delete-candidate-database': 'delete the rehearsal copy of the database and its companion files', 'preserve-artifacts': 'retain and verify exact baseline dependencies and built pages',
    'private-backup': 'retain a private full SQLite recovery image',
    'stable-fetch': 'copy the candidate Git objects into stable', 'stable-checkout': 'move the stable branch to the exact target',
    'candidate-tag': 'create the dated local candidate tag', 'install-artifacts': 'install the verified candidate dependencies and built pages',
    migrate: 'migrate the explicit stable database', remint: 'apply the staged re-mint map to the migrated explicit stable database', 'stable-checkpoint': 'checkpoint the migrated stable database into DELETE journal mode',
    'stable-check': 'start stable in release-check mode on the ordinary port', 'stable-check-health': 'verify the migrated stable database and served identity',
    'stable-check-stop': 'stop the recorded stable check group and verify its port is free', 'ordinary-start': 'start the ordinary stable service',
    'ordinary-start-health': 'verify the ordinary stable service, record its detached worker and read that its supervisor finished its startup', 'recover-tag': 'remove this failed candidate tag',
    'recover-checkout': 'restore the baseline stable branch', 'recover-artifacts': 'restore exact baseline dependencies and built pages',
    'recover-database': 'restore the full private SQLite snapshot', 'recover-start': 'restart the previous ordinary service',
    'recover-start-health': 'verify the previous ordinary service and its detached worker, and read that its supervisor finished its startup',
    'final-journal': 'retain the named durable recovery journal', 'close-lock-descriptor': 'close the original descriptor while retaining the writable recovery journal',
    'release-lock': 'release the verified exclusive lock', 'recover-lock': 'reacquire the recorded exclusive lock before recovery',
    'close-final-descriptor': 'close the final journal descriptor while preserving the verified service result',
    'recover-snapshot': 'take the private SQLite snapshot the rollback restores, from the database no migration has touched',
    'untranslated-words': 'count the words the candidate shows in English on its Chinese pages',
    'notice-contract': "ask the candidate's notice contract to take an untranslated-word count above zero",
    resume: 'resume the upgrade from its journal', 'resume-check-target': 'check the stable checkout, the tag and the artifacts are the target',
    'resume-health': 'verify the ordinary service the crashed upgrade opened, and read that its supervisor finished its startup',
  }
  if (actions[step]) return actions[step]
  if (step.startsWith('plugin-build-')) return `build the ${step.slice(13)} plugin pages`
  if (step.startsWith('old-stop-')) return `stop recorded previous service group ${step.slice(9)}`
  if (['recover-stop-', 'recover-old-stop-', 'failed-restore-stop-', 'resume-stop-', 'resume-old-stop-'].some((start) => step.startsWith(start))) return `stop and verify recorded recovery group ${step.split('-').at(-1)}`
  return step.replaceAll('-', ' ')
}
/** A size in gigabytes with one decimal, as the room's refusal says it. */
const gigabytes = (bytes) => `${(bytes / A_GIGABYTE).toFixed(1)} GB`
/** What the dry plan says of the room. */
function theRoomLine(room, everyMs) {
  const copies = `${room.copies} database ${room.copies === 1 ? 'copy' : 'copies'}`
  const other = room.databaseFileSystem === null ? '' : ` The database's file system has ${gigabytes(room.databaseFileSystem.free)} free.`
  return `The work folder has ${gigabytes(room.free)} free. Case ${room.case}, with ${copies} and a build of ${gigabytes(room.build.total)}, leaves a lowest point of ${gigabytes(room.lowest)}, at or above the floor of ${gigabytes(room.floor.bytes)} set by ${room.floor.setting}.${other} From the lock to the first stop of the old version, the free space is read every ${everyMs / 1000} seconds, and a reading under the floor stops the release before downtime.`
}
/** The rehearsal copy's own file and the companion files SQLite may leave beside it. */
const REHEARSAL_COPY_FILES = ['', '-wal', '-shm', '-journal']
/** What a release of case 1 says where a release of case 2 names its restore point. */
export const NO_IMAGE_IN_CASE_1 = 'No restore image of the database was made, and none is needed, because this release runs no migration.'
/** What the dry plan says when the configuration names no staged re-mint map. */
export const NO_STAGED_MAP = 'No staged re-mint map is named, so the migration of the explicit database is given no --remint.'
function upgradePlan(c, paths, baseline, words, verifierSays, releaseCase) {
  const copies = releaseCase.case === 2
  const counted = `${words.count === 1 ? '1 word is' : `${words.count} words are`} not yet translated into Chinese in ${words.checkout} at ${words.commit}.`
  return [
    `${counted} ${words.isTarget ? 'That is the target commit.' : `That is not the target commit ${c.targetCommit}.`} The real run counts again in the candidate before the old office stops, and puts a count above zero in the AFTER notice. A target whose notice contract cannot take a count above zero is refused there.`,
    `Upgrade stable from ${baseline} to ${c.targetCommit}; development ${c.developmentRepository}, stable ${c.stableCheckout}.`,
    `Use database ${c.database}, ordinary port ${c.servicePort}, and private recovery paths under ${paths.work}.`,
    'Read the pinned release authorization and original baseline evidence, then repeat policy verification under the lock, before BEFORE and before stopping writers.',
    ...(c.emergency === true ? ['This is an emergency release: no test receipt is read. Each policy verification reads the emergency switch and the message to the owner, and the use of the switch is counted after BEFORE is filed.'] : []),
    'Clone the exact candidate, install locked dependencies, type-check it, and build its stamped web page and every plugin before downtime.',
    theStartLimitLine(c),
    ...(copies ? [
      c.remintMap
        ? `Migrate the private candidate database with the built target on port ${c.releaseCheckPort}, with npm run db:migrate and then npm run db:migrate -- --remint ${c.remintMap}, checkpoint it, check the isolated candidate, then stop its recorded group.`
        : `Migrate the private candidate database with the built target on port ${c.releaseCheckPort}, checkpoint it, check the isolated candidate, then stop its recorded group.`,
      `Delete that rehearsal copy, ${paths.candidateDatabase}, and its companion files before the BEFORE notice.`,
      'Verify the old service identity and file the secretary-approved BEFORE notice before downtime; retain its original message reference.',
      `Retain exact baseline artifacts, stop the recorded old groups, and take the one rollback copy, a full private SQLite snapshot at ${paths.privateDatabase}.`,
      c.remintMap
        ? `Move branch stable, create dated local tag ${c.candidateTag}, install candidate artifacts, and migrate the explicit database with npm run db:migrate and then npm run db:migrate -- --remint ${c.remintMap}.`
        : `Move branch stable, create dated local tag ${c.candidateTag}, install candidate artifacts, and migrate the explicit database.`,
      c.remintMap ? `The staged re-mint map ${c.remintMap} has sha256 ${theFileHash(c.remintMap).sha256}. The candidate is re-minted with it, and its hash is read again at the last safe point before the stop and before the live re-mint. A crash before the live re-mint is done rolls back from the snapshot.` : NO_STAGED_MAP,
    ] : [
      `Ask the candidate's own settings whether they take ${LIVE_MODE}. If they do, check the candidate in that mode on port ${c.releaseCheckPort}, on the live database while the old version serves, then stop its recorded group. If they do not, leave that check out.`,
      'Verify the old service identity and file the secretary-approved BEFORE notice before downtime; retain its original message reference.',
      'Retain exact baseline artifacts and stop the recorded old groups. No copy of the database is made.',
      `Move branch stable, create dated local tag ${c.candidateTag} and install candidate artifacts. No migration runs.`,
    ]),
    ...(c.closedVerification ? [
      ...(c.closedVerification.verifiers ? theVerifiersPlan(c, verifierSays) : [
        `Keep stable in read-only release-check mode on ${c.servicePort}, retaining the lock and private snapshot while the configured verifier runs within ${c.closedVerification.timeoutMs} ms. Ordinary admission waits for every configured check and unchanged frozen state.`,
        verifierSays === null ? `The verifier's command does not name ${THE_VERIFIER}, so it is not run before anything closes, and its checks, its limit and its loading of better-sqlite3 were not checked.` : `Before anything closes, the verifier's dry form said: ${verifierSays}`,
      ]),
      'A verifier never repairs. Refusal restores the exact private snapshot and verifies the previous generation while closed before ordinary admission resumes. Failed recovery stays closed. A crash leaves the lock and journal for inspection; another invocation refuses them.',
      `The office is closed from just before the first old group stops. If the target verifier has not passed ${c.closedVerification.abortDeadlineMs} ms after that, the upgrade rolls back from the snapshot. If the office is not open ${c.closedVerification.maxClosedMs} ms after that, the rollback stops and the office stays closed.`,
      `While it is closed, the mark ${theUpgradeMarkPath(c.database)} refuses every start of this database. After a crash, ${theResumeCommand(c.stableCheckout, paths.lock)} resumes the upgrade, or rolls it back if the target cannot be verified.`,
    ] : [copies
      ? `Check stable in release-check mode on ${c.servicePort} with writes excluded, stop that group, then publish and verify the ordinary service.`
      : `Publish and verify the ordinary service. Stable is checked first in release-check mode on ${c.servicePort}, with writes excluded, only when the candidate's settings refuse ${LIVE_MODE}.`]),
    ...(copies ? [
      'On failure, stop recorded candidate groups, restore baseline code, dependencies, pages and the database snapshot, then restart and verify the previous service.',
      'The snapshot point is recorded after all old writers stop. Database recovery discards any writes accepted after that point, including writes after ordinary publication.',
    ] : [
      'On failure, stop recorded candidate groups, restore baseline code, dependencies and pages, then restart and verify the previous service on the same database.',
      NO_IMAGE_IN_CASE_1,
    ]),
    'After final descriptor-close recovery settles, journal and send the actual AFTER outcome. A notice failure retains the service and can be retried separately with the same sendId.',
  ]
}
function wayBackPlan(c, paths, baseline, { checked, reviewed, unused }, releaseCase) {
  return [
    `Return stable from ${c.previousBaselineTag} (${baseline}) to the previous completed version ${c.candidateTag} (${c.targetCommit}); development ${c.developmentRepository}, stable ${c.stableCheckout}.`,
    `Use database ${c.database}, ordinary port ${c.servicePort}, the service settings read from the serving process, and private recovery paths under ${paths.work}.`,
    ...(checked.length || reviewed.length ? [
      ...(checked.length ? [`These migrations since the previous version only add: ${checked.join(', ')}.`] : []),
      ...reviewed.map((r) => `The migration ${r.migration} does more than add: ${r.changes.join('; ')}. The reviewed list allows it. ${r.reviewedBy} reviewed it at ${r.reviewedAt}: ${r.safeBecause}`),
      'No in-place step was added.',
    ] : ['No migration and no in-place step was added since the previous version.']),
    ...(unused.length ? [`The reviewed list also names ${unused.join(', ')}, which this way back does not need.`] : []),
    'No release authorization is read. The secretary-approved notice is the authority, as the notice door requires.',
    'Clone the previous version, install its locked dependencies, type-check it, and build its stamped web page and every plugin before downtime.',
    theStartLimitLine(c),
    releaseCase.case === 2
      ? `Check the previous version in release-check mode on a private, unmigrated copy of the database on port ${c.releaseCheckPort}, then stop its recorded group and delete that copy, ${paths.candidateDatabase}, and its companion files before the BEFORE notice.`
      : `Ask the previous version's own settings whether they take ${LIVE_MODE}. If they do, check it in that mode on port ${c.releaseCheckPort}, on the live database while the newer version serves, then stop its recorded group. If they do not, leave that check out. No copy of the database is made.`,
    'Verify the serving identity and file the secretary-approved BEFORE notice before downtime; retain its original message reference.',
    'Retain the newer artifacts and stop the recorded groups.',
    `Move branch stable to ${c.candidateTag} and install the previous artifacts. The database is neither migrated nor rolled back.`,
    releaseCase.case === 2
      ? `Check stable in release-check mode on ${c.servicePort} with writes excluded, stop that group, then start and verify the ordinary service.`
      : `Start and verify the ordinary service. Stable is checked first in release-check mode on ${c.servicePort}, with writes excluded, only when the previous version's settings refuse ${LIVE_MODE}.`,
    'On failure, stop the recorded groups, put back the newer code, dependencies and pages, then restart and verify the newer service. The database is never restored.',
    'After the result settles, journal and send the actual AFTER outcome. A notice failure retains the service and can be retried separately with the same sendId.',
    THE_WAY_BACK_SENDS_NO_COUNT,
  ]
}

/** All test seams are explicit in-process dependencies; the command line accepts none of them. */
export async function upgradeStable(input, options = {}) { return theTransaction(input, options, null) }

/** What the way back's configuration holds. The database, port, home, settings and versions come from the serving office. */
export const WAY_BACK_FIELDS = Object.freeze(['developmentRepository', 'stableCheckout', 'evidence', 'serviceGroups', 'notice', 'noticeApproval', 'noticeSendIds', 'releaseCheckPort', 'health', 'recoveryRoot', 'reviewedMigrations'])
export function checkTheWayBackConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('The configuration must be a JSON object.')
  const extra = Object.keys(input).filter((key) => !WAY_BACK_FIELDS.includes(key))
  if (extra.length) fail(`The way back reads the database, port, service settings and versions from the serving office, so its configuration may not name ${extra.join(', ')}.`)
  return theReviewedList(input.reviewedMigrations)
}

/**
 * The way back: the stable office returns from the version it serves to the version before the newest
 * completed upgrade, on the same database and port with the same settings. The database is never rolled back.
 */
export async function returnToThePreviousStable(input, options = {}) {
  const reviewed = checkTheWayBackConfig(input)
  if (typeof options.officeRequest !== 'function') fail('The canonical officeRequest adapter is required; no unauthenticated fallback exists.')
  const stable = canonical(input.stableCheckout, 'stableCheckout')
  const groups = Array.isArray(input.serviceGroups) ? input.serviceGroups : []
  if (!groups.length) fail('At least one recorded service group is required.')
  // validateUpgradeConfig checks each recorded group, and every process on the port, against its own environment.
  const { database, port: servicePort } = groups[0]
  if (groups.some((group) => group?.database !== database || group?.port !== servicePort)) fail('The recorded service groups name different databases or ports.')
  integer(servicePort, 1024, 65535, 'servicePort')
  const raw = processEnvironment(ownedPort(servicePort, groups)[0])
  const serviceSettings = Object.fromEntries(SERVICE_SETTINGS.filter((key) => raw[key] !== undefined).map((key) => [key, raw[key]]))
  let latest, emergency
  // These reads of the live office come before downtime, so one that gets no answer is tried again for about a minute.
  const live = triedAgainForAMinute(options.officeRequest, { say: (line) => options.say?.(line) })
  try {
    const { theEmergencyThatInstalled, theNewestCompletedUpgrade } = await import('./stable-release-policy.mjs')
    latest = await theNewestCompletedUpgrade(live, { repository: stable, database, port: servicePort })
    if (latest) emergency = await theEmergencyThatInstalled(live, latest.announcement.baselineTag, latest.announcement.fromCommit)
  } catch (error) { fail(`The upgrade history could not be read: ${error.message}`) }
  if (!latest) fail('The office records no completed upgrade of this stable checkout, so there is no previous version to return to.')
  const { candidateTag, baselineTag, fromCommit, toCommit } = latest.announcement
  const evidenceAt = emergency ? theFollowUpThatStandsFor(baselineTag, emergency.emergency.followUp, input) : fromCommit
  if (git(stable, ['rev-parse', 'HEAD']) !== toCommit) fail(`Stable does not serve ${candidateTag}, which the newest completed upgrade installed.`)
  if (fromCommit === toCommit || git(stable, ['merge-base', fromCommit, toCommit]) !== fromCommit) fail(`The newest completed change, from ${baselineTag} to ${candidateTag}, did not move forward, so it was a way back already. This command goes back one version only.`)
  // The upgrade's own validation knows no reviewed list; the list rides with the way back instead.
  const given = structuredClone(input)
  delete given.reviewedMigrations
  const filled = { ...given, database, servicePort, serviceHome: raw.HOME, serviceSettings, targetCommit: fromCommit, candidateTag: baselineTag, previousBaselineTag: candidateTag }
  return theTransaction(filled, options, { stamp: localStamp(new Date()).replace(/\D/g, '').slice(0, 14), reviewed: structuredClone(reviewed), evidenceAt })
}

/**
 * THE WAY BACK TO AN EMERGENCY RELEASE. That version had no receipt of its own, so the way back waits for its follow-up
 * receipt to be filed and green, names it as its evidence, and says so in its notice. The receipt is read at its own
 * later commit, which contains the version. The commit is returned.
 */
function theFollowUpThatStandsFor(tag, followUp, input) {
  if (followUp.state === 'not-owed') fail(`The office says the emergency release ${tag} owes no follow-up receipt, and a completed release always owes one, so the way back cannot tell whether that version passed its tests.`)
  if (followUp.state !== 'filed' || !followUp.green) {
    const state = followUp.state === 'filed' ? 'failed' : followUp.state === 'unknown' ? 'could not be checked' : 'is missing'
    fail(`The previous version ${tag} went in as an emergency release, and its follow-up receipt ${state}. The way back to it waits for a green follow-up receipt.${followUp.state === 'unknown' ? ` The office said: ${followUp.because}` : ''}`)
  }
  const standing = stableEmergencyStandingLine(tag, followUp.receipt.id, followUp.commit)
  if (typeof input.notice !== 'string' || !input.notice.includes(standing)) fail(`The way back to the emergency release ${tag} needs this line in its notice: "${standing}"`)
  const { id, seq, contentHash } = followUp.receipt
  if (!isDeepStrictEqual(input.evidence, { recordId: id, seq, contentHash })) fail(`The way back to the emergency release ${tag} names its follow-up receipt ${id}, seq 1, contentHash ${contentHash} as its evidence.`)
  return followUp.commit
}

async function theTransaction(input, options, wayBack, resumed = null) {
  // A resume reads its configuration and its state from the crashed upgrade's journal, and reads nothing new.
  const was = resumed?.was ?? null
  const valid = resumed ? resumed.valid : validateUpgradeConfig(input, wayBack)
  const { config: c, paths, baseline, oldPlugins, newPlugins, savedIdentities, tree, releaseCase } = valid
  const officeRequest = options.officeRequest
  if (typeof officeRequest !== 'function') fail('The canonical officeRequest adapter is required; no unauthenticated fallback exists.')
  // The room, before the lock and before any read of the office. A resume works out none: its release had the room.
  const room = resumed ? null : theRoom({ releaseCase: releaseCase.case, workFolder: c.recoveryRoot, database: c.database, floor: theReleaseFloor(options.env ?? process.env), freeSpace: options.freeSpace,
    build: theBuildBytes({ checkout: c.stableCheckout, artifactPaths: artifacts(c.stableCheckout, oldPlugins), gitFolder: git(c.developmentRepository, ['rev-parse', '--path-format=absolute', '--git-common-dir']) }) })
  const roomEveryMs = options.roomEveryMs ?? THE_ROOM_IS_READ_EVERY_MS
  if (room && !room.enough) fail(theRoomRefusal(room))
  // BEFORE DOWNTIME, A CALL TO THE LIVE OFFICE THAT GETS NO ANSWER IS TRIED AGAIN FOR ABOUT A MINUTE (upgrade-stable.criteria.md,
  // "A slimmer stable release", part 6). `live` carries the reads of the office and of the ordinary service's port, the
  // BEFORE notice and the emergency count, which it sends once. From the first stop of the old version on, every call
  // goes through officeRequest and is sent once, and the candidate's scratch port is never read through `live`. A try
  // again is said, and once the lock is open it is journalled as well.
  let theJournalIsOpen = false
  const live = triedAgainForAMinute(officeRequest, { say: (line) => theJournalIsOpen ? journal('live-office', 'tried-again', { says: line }) : options.say?.(line) })
  // A resume does not run the verifier's dry form again: the upgrade it resumes ran it before anything closed.
  const verifierSays = !resumed && c.closedVerification ? theVerifiersDryForm(c, paths) : null
  const emergency = c.emergency === true
  // An emergency release reads no receipt. Its switch and message are read by the release policy below, at every check.
  if (!emergency && !resumed) {
    const verifyEvidence = options.verifyEvidence ?? (await import('./stable-upgrade-evidence.mjs')).verifyUpgradeEvidence
    await verifyEvidence({ repository: c.developmentRepository, commit: wayBack?.evidenceAt ?? c.targetCommit, evidence: c.evidence, noticeApproval: c.noticeApproval }, { officeRequest: live })
  }
  // Forward authorization is mandatory; no caller can replace or omit this reader.
  // The way back to the previous version reads none: its authority is the secretary-approved notice the door requires.
  const { countTheEmergencyUse, verifyStableReleasePolicy } = await import('./stable-release-policy.mjs')
  const policyInput = { config: c, baseline, tree }
  const policyOptions = { officeRequest: live, ...(options.now ? { now: options.now } : {}) }
  // A resume does not check the release policy again: the upgrade it resumes was authorized when it began.
  let policy = wayBack || resumed ? null : await verifyStableReleasePolicy(policyInput, policyOptions)
  const beforeRequest = resumed ? was.beforeRequest : valid.beforeRequest ?? beforeEmergencyRequest(c, baseline, tree, policy?.emergency)
  const contract = emergency ? { contract: emergencyNoticeContract } : {}
  const drySays = "These reads update the caller key's last-use time and the API usage counters."
  if (options.dry) {
    const words = wayBack ? null : theDryCount(c)
    return {
      state: 'dry', target: c.targetCommit, baseline, paths, policy, releaseCase, room, says: drySays,
      ...(wayBack ? { migrationsChecked: valid.wayBack.checked, migrationsReviewed: valid.wayBack.reviewed, untranslatedWordsSays: THE_WAY_BACK_SENDS_NO_COUNT } : { untranslatedWords: words }),
      plan: ['Ordinary runtime and health were not checked. The real upgrade checks them before changing anything.', releaseCase.because, theRoomLine(room, roomEveryMs), ...(wayBack ? wayBackPlan(c, paths, baseline, valid.wayBack, releaseCase) : upgradePlan(c, paths, baseline, words, verifierSays, releaseCase))],
    }
  }
  // In a resume, the gate and the terminal holders are the ones the closure recorded. A holder that ended by itself is not required.
  let originalTopology = resumed ? { gate: { pgid: was.closed?.gate ?? null }, holders: (was.closed?.holders ?? []).filter((h) => stillRunning({ pid: h.pid, startTime: h.startTime, boot: was.closed.controller.boot }, resumed.boot)) } : undefined
  const oldRuntime = (runtime) => {
    const observed = servingGroup(c)
    originalTopology = observed
    const topology = workerIdentity(runtime, { pgid: observed.gate.pgid, startTime: observed.gate.startTime }, c)
    if (topology.server.pid !== observed.server.pid || topology.supervisor.pid !== observed.supervisor.pid || topology.worker?.pid !== observed.worker?.pid) fail('The runtime and serving process topology disagree.')
  }
  if (!resumed) {
    await readHealth(live, { observeRuntime: oldRuntime, commit: baseline, repository: c.stableCheckout, database: c.database, port: c.servicePort, mode: 'ordinary' })
    // Repeat local validation after the external read so changed local state cannot silently pass.
    validateUpgradeConfig(c, wayBack)
  }
  // A resume stops only the old groups that are still the same processes the upgrade recorded.
  const oldGroups = () => [...c.serviceGroups].filter((g) => !resumed || stillRunning({ pid: g.pgid, startTime: g.startTime, boot: resumed.firstBoot }, resumed.boot))
    .sort((a, b) => Number(b.pgid === originalTopology.gate.pgid) - Number(a.pgid === originalTopology.gate.pgid))
  let fd = resumed ? resumed.fd : openSync(paths.lock, 'wx', 0o600)
  const journalIdentity = fstatSync(fd)
  const events = resumed ? [...resumed.events] : []
  // The groups the crashed upgrade started that still run: the same process on the same boot.
  const spawned = resumed ? was.groups.filter((g) => stillRunning({ pid: g.pgid, startTime: g.startTime, boot: g.boot }, resumed.boot)).map(({ boot, step, ...group }) => group) : []
  let sequence = resumed ? resumed.events.at(-1).sequence : 0
  theJournalIsOpen = true
  let downtime = was?.downtime ?? false
  // From the lock to the first stop of the old version, the free space is read every roomEveryMs. The first reading
  // under the floor is kept, and the next step stops the release, before downtime.
  let roomWatch = null
  let roomUnder = null
  let codeTouched = was?.codeTouched ?? false
  let databaseTouched = was?.databaseTouched ?? false
  // A new file renamed over the database has a new creation time, so the office has a new world.
  let databaseReplaced = was?.databaseReplaced ?? false
  let artifactsTouched = was?.artifactsTouched ?? false
  let tagTouched = was?.tagTouched ?? false
  let privateReady = Boolean(was?.snapshot)
  let privateDigest = was?.snapshot?.sha256 ?? null
  let verification = null
  let verifiedFrozen = null
  let savedReady = was?.savedReady ?? false
  let snapshotPoint = was?.snapshot?.snapshotPoint ?? null
  let ordinaryStarted = was?.ordinaryStarted ?? false
  let before = was?.before ?? null
  let counted = was?.counted ?? null
  let noticeAttempted = was?.noticeAttempted ?? false
  let lastGuard = null
  let untranslatedWords = was?.untranslatedWords ?? null
  // The sha256 of the staged map the candidate was re-minted with; null until it is.
  let remintMapHash = null
  // Case 1 only: whether the candidate's settings take the live mode, and so whether its trial start runs before downtime.
  let takesTheLiveMode = null
  // The closed time (upgrade-stable.criteria.md, item 15 (a)): when the office closed, and which of the two limits holds.
  let closedSince = null
  let targetPassed = false
  let rollingBack = false
  const noticeApi = apiAddressFrom({ MOLE_OFFICE_PORT: String(c.servicePort) })
  const serving = { commit: c.targetCommit, repository: c.stableCheckout, database: c.database, port: c.servicePort }
  function remainingRecordedGroups() {
    const recorded = new Map([...c.serviceGroups, ...spawned].map((group) => [`${group.pgid}/${group.startTime}`, group]))
    return [...recorded.values()].flatMap(({ pgid, startTime, cwd, port, database }) => {
      const identity = { pgid, startTime, cwd, port, ...(database ? { database } : {}) }
      try {
        const liveMembers = members(pgid)
        return liveMembers.length ? [{ ...identity, liveMembers }] : []
      } catch (error) { return [{ ...identity, liveMembers: null, inspectionFailure: String(error.message ?? error) }] }
    })
  }
  const databaseLoss = () => releaseCase.case === 1 ? NO_IMAGE_IN_CASE_1 : snapshotPoint === null ? 'No database restore snapshot was completed, and no database restore was attempted.' : `Database restore point: ${snapshotPoint}. Any writes accepted after that point are discarded when the database is restored.`
  function journal(step, phase, detail = {}) {
    const says = step === 'recovery' ? (phase === 'failed' ? `Recovery failed: NOT RESTORED. ${detail.restoreFailure}` : `The upgrade failed: ${detail.reason}. Attempting recovery from the recorded paths.`) : phase === 'attempt' ? `Attempting to ${actionOf(step)}.` : phase === 'done' ? `Completed: ${actionOf(step)}.` : phase === 'group-recorded' ? `Recorded process group ${detail.pgid} for ${actionOf(step)}.` : phase === 'gate-attempt' ? `Opening the recorded startup gate for process group ${detail.pgid}.` : `${actionOf(step)}: ${phase}.`
    const entry = { sequence: ++sequence, at: localStamp(new Date()), step, phase, says, ...detail }
    writeSync(fd, JSON.stringify(entry) + '\n'); fsyncSync(fd)
    events.push(entry)
    options.say?.(entry.says)
    options.onJournal?.(entry)
    return entry
  }
  /** Before the target verifier passes, the abort deadline holds. After it, and in a rollback, the maximum closed time. */
  function theLimitInForce() {
    if (closedSince === null) return null
    const { abortDeadlineMs, maxClosedMs } = c.closedVerification
    return targetPassed || rollingBack ? { name: `the maximum closed time of ${maxClosedMs} ms`, at: closedSince + maxClosedMs } : { name: `the abort deadline of ${abortDeadlineMs} ms`, at: closedSince + abortDeadlineMs }
  }
  function theController() {
    return { pid: process.pid, startTime: processIdentity(process.pid).startTime, boot: theBoot() }
  }
  /** The office closes here: the clock starts, then the mark that refuses every start is written. */
  function closeTheOffice(countsFrom) {
    closedSince = Date.now()
    const { abortDeadlineMs, maxClosedMs } = c.closedVerification
    journal('closed-time', 'started', { abortDeadlineMs, maxClosedMs, countsFrom, controller: theController(), gate: originalTopology.gate.pgid, holders: originalTopology.holders,
      says: `The office is closed from ${countsFrom}. The abort deadline is ${abortDeadlineMs} ms and the maximum closed time ${maxClosedMs} ms.` })
    // A resume keeps the time this upgrade first closed the office in the mark the refusal sentence reads.
    const kept = readTheUpgradeMark(c.database)
    const closedAt = kept?.mark?.lock === paths.lock ? kept.mark.closedAt : localStamp(new Date(closedSince))
    const mark = writeTheUpgradeMark(c.database, { from: baseline, to: c.targetCommit, tag: c.candidateTag, closedAt, lock: paths.lock, resume: theResumeCommand(c.stableCheckout, paths.lock) })
    journal('upgrade-mark', 'written', { mark, says: `Wrote the upgrade mark ${mark}. Every start of this database is refused until this upgrade opens a verified generation.` })
  }
  async function step(name, action, detail = {}, stopping = false, doneDetail = () => ({})) {
    theRoomHeld()
    // Stopping a process is how the office gets back to a safe state, so the closed time never stops it.
    const limit = stopping ? null : theLimitInForce()
    if (limit && Date.now() >= limit.at) fail(`The office was closed past ${limit.name}, so the step ${name} did not start.`)
    const entry = journal(name, 'attempt', { paths, ...detail })
    await options.onStep?.({ ...entry, phase: 'before' })
    const answer = await action()
    journal(name, 'done', doneDetail())
    await options.onStep?.({ ...entry, phase: 'after' })
    return answer
  }
  function theRoomHeld() {
    if (roomWatch === null || roomUnder === null) return
    const { path, bytes, error } = roomUnder
    fail(bytes === null
      ? `The free space at ${path} could not be read (${String(error?.message ?? error)}), and an unknown free space is not enough, so the release stopped before downtime.`
      : `The free space at ${path} fell to ${gigabytes(bytes)}, under the floor of ${gigabytes(room.floor.bytes)} set by ${room.floor.setting}, so the release stopped before downtime.`)
  }
  /** The watch ends at the first stop of the old version, or at a failure before it. Its lowest reading is journalled. */
  function stopWatchingTheRoom() {
    if (roomWatch === null) return
    const lowest = roomWatch.stop()
    roomWatch = null
    if (lowest) journal('room', 'lowest', { path: lowest.path, bytes: lowest.bytes, readAt: localStamp(lowest.at),
      says: `The lowest free space read from the lock was ${gigabytes(lowest.bytes)} at ${lowest.path}, at ${localStamp(lowest.at)}.` })
  }
  function recordSetAside(check, where) {
    journal('database-holder-check', 'set-aside', { where, setAside: check.setAside, otherUsersUnreadable: check.otherUsersUnreadable })
  }
  async function guardDatabase(where) {
    const guard = await theExclusiveLockGuard(c.database)
    lastGuard = guard
    journal('exclusive-lock-guard', guard.taken ? 'taken' : 'refused', { where, ...guard })
    if (!guard.taken) fail(guard.says)
    return guard
  }
  async function startGroup(name, cwd, command, args, environment, port = null, mode = null, commandTimeoutMs = c.health.commandTimeoutMs, detail = {}) {
    return step(name, async () => {
      // A resume writes beside the crashed upgrade's logs and never over them.
      const log = join(paths.work, resumed ? `${name}.after-${sequence}.log` : `${name}.log`)
      const out = openSync(log, 'ax', 0o600)
      let child
      try { child = spawn(process.execPath, ['-e', GATE, command, JSON.stringify(args)], { cwd, env: environment, detached: true, stdio: ['ignore', out, out, 'ipc'] }) } finally { closeSync(out) }
      let exit, endedAt = null
      // The gate's end is read here, at its exit event, for the way back's check of what is left in its group.
      const ended = new Promise((resolve) => { child.once('error', (e) => { exit = { error: e }; resolve(exit) }); child.once('exit', (code, signal) => { endedAt = theGatesEnd(); exit = { code, signal }; resolve(exit) }) })
      if (!child.pid) { await ended; fail(`${name} could not start: ${exit?.error?.message}`) }
      const group = { pgid: child.pid, startTime: processIdentity(child.pid).startTime, cwd, port, child, ended, log, gateOpened: false, get exit() { return exit }, get endedAt() { return endedAt } }
      if (mode === 'ordinary') group.ordinary = { commit: git(cwd, ['rev-parse', 'HEAD']), repository: cwd, database: readSetting('MOLE_OFFICE_DB', environment).value, port, mode, workerKnown: false, detachedGroups: [] }
      spawned.push(group)
      journal(name, 'group-recorded', { pgid: group.pgid, startTime: group.startTime, cwd, port, log })
      await options.onStep?.({ step: name, phase: 'gated', pgid: group.pgid, log })
      if (mode === 'ordinary' && c.closedVerification) {
        requireVerifiedGeneration()
        const mark = theUpgradeMarkPath(c.database)
        clearTheUpgradeMark(c.database)
        journal('upgrade-mark', 'cleared', { mark, says: `Cleared the upgrade mark ${mark}. The verified generation opens next.` })
        closedSince = null
      }
      journal(name, 'gate-attempt', { pgid: group.pgid })
      group.gateOpened = true
      group.startedAt = Date.now()
      await new Promise((resolve, reject) => child.send('start', (error) => error ? reject(error) : resolve()))
      if (mode === null) await waitForCommand(name, group, commandTimeoutMs)
      return group
    }, { cwd, command, args, port, ...detail })
  }
  async function stopGroup(group, name, checkPort = true) {
    await step(name, async () => {
      if (group.child && group.exit && members(group.pgid).length === 0) { if (checkPort && group.port) freePort(group.port); return }
      const alive = members(group.pgid)
      // An ordinary start's gate can end and leave the start's own processes in its group, such as serve-dev's
      // stand-in. The way back stops them by the group's id once each is shown to be the start's own. Anything else
      // stops the way back.
      const leftByItsStart = Boolean(group.child && group.exit && alive.length && rollingBack && group.ordinary)
      if (leftByItsStart) { try { theStartsOwnInItsEndedGroup(group, alive, c) } catch (error) { throw theWayBackCannotCheck(group, error) } }
      else if (group.child && group.exit && alive.length) fail(`The completed group ${group.pgid} has live members or its id was reused; refusing to signal it.`)
      if (alive.length) {
        // The leader of a group whose start's own processes are left is the gate, which has ended.
        const leader = leftByItsStart ? null : processIdentity(group.pgid)
        if (leader && (leader.pgid !== group.pgid || leader.startTime !== group.startTime)) fail(`Refusing to signal reused or unknown group ${group.pgid}.`)
        process.kill(-group.pgid, 'SIGTERM')
        const deadline = Date.now() + c.health.stopTimeoutMs
        while (members(group.pgid).length && Date.now() < deadline) await delay(20)
        if (members(group.pgid).length) fail(`Recorded group ${group.pgid} did not end after SIGTERM.`)
      }
      if (group.child) { await group.ended; if (group.child.connected) group.child.disconnect() }
      if (checkPort && group.port !== null && group.port !== undefined) freePort(group.port)
    }, { pgid: group.pgid, startTime: group.startTime, port: group.port }, true)
  }
  async function command(name, cwd, program, args, environment, timeoutMs = c.health.commandTimeoutMs, detail = {}) {
    return startGroup(name, cwd, program, args, environment, null, null, timeoutMs, detail)
  }
  async function waitForCommand(name, group, timeoutMs) {
    let timer
    const limit = theLimitInForce(), cut = limit !== null && limit.at - Date.now() < timeoutMs
    try {
      const result = await Promise.race([group.ended, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(cut ? `${name} was cut at ${limit.name}.` : `${name} exceeded its command bound.`)), cut ? Math.max(0, limit.at - Date.now()) : timeoutMs) })])
      if (result.error || result.code !== 0) fail(`${name} failed (${result.code ?? result.error?.message ?? result.signal}); see ${group.log}.`)
      if (members(group.pgid).length) fail(`${name} left processes in its recorded group.`)
    } finally { clearTimeout(timer) }
  }
  async function sqliteCopy(source, target) {
    const targetFd = openSync(target, 'wx', 0o600); closeSync(targetFd)
    await backupSqliteInOneStep(source, target)
    chmodSync(target, 0o600); checkDatabase(target); syncFile(target); syncDirectory(dirname(target))
  }
  function checkpoint(file) {
    const db = new Database(file, { fileMustExist: true })
    try {
      const results = db.pragma('wal_checkpoint(TRUNCATE)')
      if (results.some((r) => r.busy)) fail('The database still has a writer; checkpoint refused.')
      if (db.pragma('journal_mode = DELETE', { simple: true }) !== 'delete') fail('The database could not enter DELETE journal mode.')
    } finally { db.close() }
    syncFile(file); syncDirectory(dirname(file))
  }
  function syncTree(at) {
    const s = lstatSync(at)
    if (s.isSymbolicLink()) return
    if (s.isDirectory()) { for (const child of readdirSync(at)) syncTree(join(at, child)); syncDirectory(at) }
    else syncFile(at)
  }
  function copyArtifact(sourceRoot, destinationRoot, path, sourceArtifacts) {
    const to = join(destinationRoot, path)
    mkdirSync(dirname(to), { recursive: true, mode: 0o700 })
    copyArtifactTree(join(sourceRoot, path), to)
    if (artifactIdentity(to, destinationRoot) !== artifactIdentity(join(sourceRoot, path), sourceRoot, sourceArtifacts.map((p) => join(sourceRoot, p)))) fail(`The artifact copy differs: ${path}`)
    syncTree(to); syncDirectory(dirname(to))
  }
  async function recordWorker(group, runtime) {
    await recordTheStartsGroups(group, workerIdentity(runtime, group, c))
  }
  /** Records the detached groups of an ordinary start, its server's and its worker's, from its checked topology. */
  async function recordTheStartsGroups(group, topology) {
    for (const record of [topology.server, topology.worker].filter(Boolean)) {
      if (!group.ordinary.detachedGroups.some(g => g.pgid === record.pgid)) {
        const detachedGroup = { pgid: record.pgid, startTime: record.startTime, cwd: record.cwd, database: c.database, port: null }
        const stepName = record.pid === topology.server.pid ? 'ordinary-server' : 'ordinary-worker'
        journal(stepName, 'group-recorded', { ...detachedGroup, parent: group.pgid, process: record })
        group.ordinary.detachedGroups.push(detachedGroup); spawned.push(detachedGroup)
        await options.onStep?.({ step: stepName, phase: 'recorded', ...detachedGroup })
      }
    }
    journal('ordinary-topology', 'observed', { topology })
    group.ordinary.topology = topology
    group.ordinary.serviceGroups = upgradeServiceGroups(topology, c)
    group.ordinary.workerKnown = true
  }
  /**
   * The way back reads no health. A start that never answers would never be recorded by it. Instead the way back finds
   * what each opened ordinary start left running from /proc, under the start's gate, and records the groups it must
   * stop. A start whose processes it cannot find or check stops the way back before anything is restored.
   */
  async function recordWorkersBeforeStopping() {
    for (const group of [...spawned].filter(g => g.ordinary && g.gateOpened && !g.ordinary.workerKnown)) {
      try { await recordTheStartUnder(group) } catch (error) { throw theWayBackCannotCheck(group, error) }
    }
  }
  async function recordTheStartUnder(group) {
    if (!theGateRuns(group)) {
      if (!group.exit) await group.ended
      const alive = members(group.pgid)
      if (alive.length === 0) {
        journal('ordinary-topology', 'gate-ended', { pgid: group.pgid, says: `The ordinary start's gate, process group ${group.pgid}, has ended with nothing left in its group, so the way back records nothing more for it.` })
        return
      }
      const own = theStartsOwnInItsEndedGroup(group, alive, c)
      journal('ordinary-topology', 'gate-ended-with-members', { pgid: group.pgid, members: own.map(row => row.pid), says: `The ordinary start's gate, process group ${group.pgid}, has ended. Its group still holds ${own.map(row => aProcessByItsName(row.pid)).join(', ')}. Each is the start's own, so the way back stops the group by its id.` })
      return
    }
    if (descendantsOf({ pid: group.pgid, startTime: group.startTime }).every(row => row.pgid === group.pgid)) {
      journal('ordinary-topology', 'gate-group-only', { pgid: group.pgid, says: `Every live process under the ordinary start's gate is in the gate's own process group ${group.pgid}, so the way back records nothing more and stops that group.` })
      return
    }
    const gate = currentProcessRecord(group.pgid)
    if (gate.pgid !== group.pgid || gate.startTime !== group.startTime) fail(`Its gate, process ${group.pgid}, ended while its processes were being found.`)
    await recordTheStartsGroups(group, checkTheStartsEnvironment(theOrdinaryTopologyUnder(gate, c, null), c))
  }
  /**
   * A start's health step. Its done line says, in `seconds` and in its sentence, how long the start took to answer.
   * An ordinary start's step also waits for its supervisor to say its startup is done, and its sentence says when.
   */
  async function startHealth(name, startedAt, expected, limit = null, since = 'its process began', ordinary = null) {
    let answeredAt, doneAt
    await step(`${name}-health`, async () => {
      await waitHealth(c, officeRequest, expected, limit, startedAt); answeredAt = Date.now()
      if (ordinary) { await waitForTheStartup(name, ordinary, startedAt); doneAt = Date.now() }
    }, {}, false, () => {
      const seconds = Math.round((answeredAt - startedAt) / 100) / 10
      const startup = ordinary ? ` Its supervisor said its startup was done ${Math.round((doneAt - startedAt) / 100) / 10} seconds after ${since}.` : ''
      return { seconds, says: `Completed: ${actionOf(`${name}-health`)}. The start ${name} answered healthy ${seconds} seconds after ${since}.${startup}` }
    })
  }
  /**
   * AN ORDINARY START IS UP ONLY ONCE ITS SUPERVISOR SAYS SO. serve-dev's startup can still end after its server answers,
   * and a supervisor whose startup ends stops that server. So the line it prints once its own row in the ledger is
   * confirmed is read from the start's own log, and a group that ends first fails the start. The wait has the bound of
   * the health wait: as many reads of the log as health.attempts names, or, with none named, until the start limit has
   * passed since the start began. An ordinary start has opened the office, which ends the closed time (startGroup), so
   * no closed-time limit holds over this wait. A resume reads the log the crashed upgrade journalled, and a journal
   * without one, or a log that is gone, fails the start with that.
   */
  async function waitForTheStartup(name, group, startedAt) {
    const { pid } = group.ordinary.topology.supervisor
    if (!group.log) fail(`The journal names no log for the start ${name}, process group ${group.pgid}, so whether its supervisor finished its startup cannot be read.`)
    const theLog = () => {
      try { return readFileSync(group.log, 'utf8') } catch (error) {
        if (error.code === 'ENOENT') fail(`The log ${group.log} of the start ${name}, process group ${group.pgid}, is not there, so whether its supervisor finished its startup cannot be read.`)
        throw error
      }
    }
    const until = c.health.attempts === undefined ? startedAt + THE_START_LIMIT_MS : null
    for (let i = 0; ; i++) {
      if (theLogSaysTheStartupIsDone(theLog(), pid, group.ordinary.port)) return
      if (members(group.pgid).length === 0) fail(`The start ${name} ended before its supervisor said its startup was done; see ${group.log}.`)
      if (until === null ? i + 1 >= c.health.attempts : Date.now() + c.health.intervalMs >= until) break
      await delay(c.health.intervalMs)
    }
    fail(until === null
      ? `The supervisor of the start ${name} did not say its startup was done within ${c.health.attempts} reads of its log, ${c.health.intervalMs} ms apart; see ${group.log}.`
      : `The supervisor of the start ${name} did not say its startup was done within the start limit of ${THE_START_LIMIT_MS / 60_000} minutes; see ${group.log}.`)
  }
  async function serve(name, root, database, port, mode, commit) {
    if (root === c.stableCheckout && serviceSettingsIdentity(c) !== valid.settingsIdentity) fail('Development settings changed during the transaction.')
    const ordinary = mode === 'ordinary'
    if (ordinary && c.closedVerification) {
      if (verification?.phase !== (commit === c.targetCommit ? 'target' : 'recovery')) fail('Closed verification has not authorized this ordinary generation.')
      requireClosedHolders()
    }
    const args = ordinary ? ['tools/serve-dev.mjs', '--built', '--prepared'] : ['--import', 'tsx', 'src/server/index.ts', `--stop-with-pid=${process.pid}`]
    const group = await startGroup(name, root, process.execPath, args, serviceEnvironment(c, paths, database, port, mode, root), port, mode)
    await startHealth(name, group.startedAt, { commit, repository: root, database, port, mode, ...(ordinary ? { observeRuntime: runtime => recordWorker(group, runtime) } : {}) }, theLimitInForce(), undefined, ordinary ? group : null)
    ownedPort(port, ordinary ? [group, ...group.ordinary.detachedGroups] : [group])
    return group
  }
  function requireClosedHolders() {
    return originalTopology.holders.map(holder => {
      const current = processIdentity(holder.pid)
      if (current.startTime !== holder.startTime || current.pgid !== holder.pgid || ['Z', 'X'].includes(current.state)
        || realpathSync(`/proc/${holder.pid}/cwd`) !== c.stableCheckout
        || !isDeepStrictEqual(readFileSync(`/proc/${holder.pid}/cmdline`, 'utf8').split('\0').filter(Boolean), holder.argv)) fail('Closed verification lost the original terminal holder identity.')
      return { pid: holder.pid, startTime: current.startTime, pgid: current.pgid }
    })
  }
  function requirePrivateSnapshot() {
    const snapshot = privateReady ? lstatSync(paths.privateDatabase) : null
    if (snapshot && (!snapshot.isFile() || snapshot.nlink !== 1 || snapshot.uid !== process.getuid() || (snapshot.mode & 0o777) !== 0o600)) fail('The private snapshot is no longer an independent private file.')
    if (!privateReady || privateDigest === null || theFileHash(paths.privateDatabase).sha256 !== privateDigest) fail('The private snapshot no longer matches its frozen recovery digest.')
  }
  function frozenVerificationState(commit, plugins) {
    requirePrivateSnapshot()
    if (!ownsLock()) fail('Closed verification lost the existing upgrade lock.')
    const namedJournal = lstatSync(paths.journal)
    if (!namedJournal.isFile() || namedJournal.dev !== journalIdentity.dev || namedJournal.ino !== journalIdentity.ino
      || readFileSync(paths.journal, 'utf8') !== events.map(entry => JSON.stringify(entry) + '\n').join('')) fail('Closed verification found a changed transaction journal.')
    cleanRepository(c.stableCheckout)
    if (git(c.stableCheckout, ['rev-parse', 'HEAD']) !== commit || git(c.stableCheckout, ['branch', '--show-current']) !== 'stable') fail('Closed verification found a changed stable generation.')
    if (serviceSettingsIdentity(c) !== valid.settingsIdentity) fail('Closed verification found changed development settings.')
    const retained = Object.fromEntries(artifacts(c.stableCheckout, oldPlugins).map(path => [path, artifactIdentity(join(paths.saved, path), paths.saved)]))
    if (!isDeepStrictEqual(retained, savedIdentities)) fail('Closed verification found changed baseline recovery artifacts.')
    const file = path => {
      try {
        const stat = lstatSync(path)
        if (!stat.isFile() || stat.nlink !== 1) fail('Closed verification requires independent ordinary frozen files.')
        return { ...theFileHash(path), mode: stat.mode, uid: stat.uid, gid: stat.gid, dev: stat.dev, ino: stat.ino, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs }
      } catch (error) { if (error.code === 'ENOENT' && path !== c.database) return null; throw error }
    }
    return { commit, references: git(c.stableCheckout, ['for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads/stable', 'refs/tags']), database: ['', '-wal', '-shm', '-journal'].map(suffix => file(c.database + suffix)),
      snapshot: file(paths.privateDatabase), artifacts: checkArtifacts(c.stableCheckout, plugins), retained,
      settings: valid.settingsIdentity, holders: requireClosedHolders() }
  }
  function requireVerifiedGeneration() {
    if (!verifiedFrozen || verification?.phase !== verifiedFrozen.phase) fail('Closed verification has no frozen generation for ordinary publication.')
    const current = frozenVerificationState(verifiedFrozen.commit, verifiedFrozen.plugins)
    const expected = structuredClone(verifiedFrozen.state)
    // Closing the last read-only SQLite connection can remove an empty WAL and its shared memory.
    // It cannot change the database or remove a WAL containing committed data.
    if (expected.database[1]?.size === 0) for (const index of [1, 2]) {
      if (current.database[index] === null) expected.database[index] = null
    }
    if (!isDeepStrictEqual(current, expected)) fail('The verified frozen generation changed before ordinary publication.')
  }
  async function verifyClosedGeneration(phase, commit, plugins) {
    await step(`verify-${phase}`, async () => {
      verification = null; verifiedFrozen = null
      const frozen = frozenVerificationState(commit, plugins)
      if (phase === 'recovery' && theFileHash(c.database).sha256 !== privateDigest) fail('Closed recovery database differs from the private snapshot.')
      const stateSha256 = createHash('sha256').update(JSON.stringify(frozen)).digest('hex')
      // A unique, private, durable directory prevents an earlier success result from being accepted.
      const directory = join(paths.work, `verification-${phase}-${sequence}`)
      mkdirSync(directory, { mode: 0o700 }); syncDirectory(paths.work)
      if (c.closedVerification.verifiers) verification = await theVerifiersPass(phase, commit, plugins, frozen, stateSha256, directory)
      else {
        const requestPath = join(directory, 'request.json'), resultPath = join(directory, 'result.json')
        const request = { version: 1, phase, commit, repository: c.stableCheckout, database: c.database, snapshot: paths.privateDatabase, servicePort: c.servicePort, checks: c.closedVerification.checks, stateSha256 }
        writeFileSync(requestPath, JSON.stringify(request) + '\n', { flag: 'wx', mode: 0o400 }); syncFile(requestPath); syncDirectory(directory)
        const requestIdentity = artifactIdentity(requestPath)
        journal(`verifier-${phase}`, 'requested', { phaseToVerify: phase, request: requestPath, result: resultPath, stateSha256, checks: request.checks })
        const [program, ...args] = c.closedVerification.command
        await command(`verifier-${phase}`, c.stableCheckout, program, [...args, requestPath, resultPath], theVerifiersEnvironment(c, paths), c.closedVerification.timeoutMs)
        readClosedVerificationResult(resultPath, request)
        if (artifactIdentity(requestPath) !== requestIdentity || !isDeepStrictEqual(frozenVerificationState(commit, plugins), frozen)) fail('Closed verifier changed the frozen state or its request; verification never repairs.')
        syncFile(resultPath); syncDirectory(directory)
        journal('closed-verification', phase === 'target' ? 'verified' : 'recovered', { commit, stateSha256, checks: request.checks, request: requestPath, result: resultPath })
        verification = { phase, commit, stateSha256, checks: request.checks, request: requestPath, result: resultPath }
      }
      verifiedFrozen = { phase, commit, plugins, state: frozen }
      if (phase === 'target') targetPassed = true
    })
  }
  /**
   * SEVERAL VERIFIERS IN ONE PHASE (upgrade-stable.criteria.md, items 28 and 31, (b)). The entries that name the phase
   * run one after another, each on a new request cut to its own checks, within one budget. An entry's prepare runs just
   * before it, and the two share the entry's new folder. The first failure fails the phase. What passed is returned.
   */
  async function theVerifiersPass(phase, commit, plugins, frozen, stateSha256, directory) {
    const { verifiers, timeoutMs, checks: configured } = c.closedVerification
    const cut = (names) => configured.filter((name) => names.includes(name))
    const running = verifiers.map((entry, i) => ({ ...entry, n: i + 1 })).filter((entry) => entry.phases.includes(phase))
    const passed = []
    let deadline = null
    const left = (name) => {
      deadline ??= Date.now() + timeoutMs
      const ms = deadline - Date.now()
      if (ms <= 0) fail(`${name} was not started: the ${timeoutMs} ms of the closed verification were spent.`)
      return ms
    }
    for (const entry of running) {
      const own = join(directory, String(entry.n))
      mkdirSync(own, { mode: 0o700 }); syncDirectory(directory)
      const requestPath = join(own, 'request.json'), resultPath = join(own, 'result.json')
      const request = { version: 1, phase, commit, repository: c.stableCheckout, database: c.database, snapshot: paths.privateDatabase, servicePort: c.servicePort, checks: cut(entry.checks), stateSha256 }
      writeFileSync(requestPath, JSON.stringify(request) + '\n', { flag: 'wx', mode: 0o400 }); syncFile(requestPath)
      const folder = [...entry.command, ...(entry.prepare ?? [])].includes(THE_FOLDER_WORD) ? join(own, 'folder') : null
      if (folder) { mkdirSync(folder, { mode: 0o700 }); chmodSync(folder, 0o700) }
      syncDirectory(own)
      const requestIdentity = artifactIdentity(requestPath)
      const filled = (words) => words.map((word) => word === THE_FOLDER_WORD ? folder : word)
      journal(`verifier-${phase}-${entry.n}`, 'requested', { phaseToVerify: phase, request: requestPath, result: resultPath, stateSha256, checks: request.checks, ...(folder ? { folder } : {}) })
      if (entry.prepare) {
        const [program, ...args] = filled(entry.prepare)
        await command(`prepare-${phase}-${entry.n}`, c.stableCheckout, program, args, theVerifiersEnvironment(c, paths), left(`prepare-${phase}-${entry.n}`))
      }
      const [program, ...args] = filled(entry.command)
      await command(`verifier-${phase}-${entry.n}`, c.stableCheckout, program, [...args, requestPath, resultPath], theVerifiersEnvironment(c, paths), left(`verifier-${phase}-${entry.n}`))
      readClosedVerificationResult(resultPath, request)
      if (artifactIdentity(requestPath) !== requestIdentity || !isDeepStrictEqual(frozenVerificationState(commit, plugins), frozen)) fail('Closed verifier changed the frozen state or its request; verification never repairs.')
      syncFile(resultPath); syncDirectory(own)
      passed.push({ checks: request.checks, request: requestPath, result: resultPath, ...(folder ? { folder } : {}) })
    }
    const checks = cut(passed.flatMap((entry) => entry.checks))
    journal('closed-verification', phase === 'target' ? 'verified' : 'recovered', { commit, stateSha256, checks, verifiers: passed })
    return { phase, commit, stateSha256, checks, verifiers: passed }
  }
  function ownsLock() {
    if (!existsSync(paths.lock)) return false
    const locked = lstatSync(paths.lock), opened = fstatSync(fd)
    return locked.isFile() && locked.ino === opened.ino && locked.dev === opened.dev
  }
  async function recoverLock() {
    if (ownsLock()) return
    if (existsSync(paths.lock)) fail('Another transaction owns the lock; this recovery cannot stop or overwrite its service.')
    await step('recover-lock', () => { linkSync(paths.journal, paths.lock); syncDirectory(dirname(paths.lock)) })
    if (!ownsLock()) fail('The recovery lock is not the recorded journal identity.')
  }
  async function finish(state, detail) {
    journal('finish', 'attempt', { state, paths, ...detail, databaseLoss: databaseLoss() })
    await step('final-journal', () => {
      if (existsSync(paths.journal)) {
        const saved = lstatSync(paths.journal), opened = fstatSync(fd)
        if (!saved.isFile() || saved.ino !== opened.ino || saved.dev !== opened.dev) fail('The final journal belongs to another file.')
      } else linkSync(paths.lock, paths.journal)
      syncFile(paths.journal); syncDirectory(c.recoveryRoot)
    })
    await step('close-lock-descriptor', () => {
      const previous = fd
      fd = openSync(paths.journal, 'a')
      closeSync(previous)
    })
    await step('release-lock', () => {
      if (!ownsLock()) fail('The exclusive lock identity changed before release.')
      unlinkSync(paths.lock); syncDirectory(dirname(paths.lock))
    })
    return { state, paths, baseline, target: c.targetCommit, ...detail, ...(verification ? { closedVerification: verification } : {}), databaseLoss: databaseLoss(), guard: lastGuard }
  }
  async function checkPolicy(checkpoint) {
    // After BEFORE is filed, the release's own BEFORE is in the history. It neither spends the throw nor owes anything yet.
    policy = await verifyStableReleasePolicy(policyInput, { ...policyOptions, ...(emergency && before ? { ownBefore: before } : {}) })
    if (emergency && !isDeepStrictEqual(policy.emergency, beforeRequest.announcement.emergency)) {
      fail("The emergency switch's throw or the emergency message the release check reads changed during the release. Start the release again so that it reads them afresh.")
    }
    journal('policy', 'checked', { checkpoint, policy })
  }
  async function runLocked() { try {
    journal('lock', 'attempt', { paths, config: c, baseline, savedIdentities, settingsIdentity: valid.settingsIdentity, controller: theController(), ...(wayBack ? { wayBack: valid.wayBack } : {}) })
    journal('release-case', 'decided', { ...releaseCase, says: releaseCase.because })
    roomWatch = watchTheRoom({ paths: [c.recoveryRoot, c.database], floor: room.floor, everyMs: roomEveryMs, freeSpace: options.freeSpace, onUnder: (reading) => { roomUnder = reading } })
    syncDirectory(dirname(paths.lock))
    if (!wayBack) {
      // The first check follows the receipt's read. An emergency release reads none, so its first check is named by where it ran.
      journal('policy', 'checked', { checkpoint: emergency ? 'before-lock' : 'receipt', policy })
      await step('policy-lock', () => checkPolicy('locked'))
    }
    await step('prepare-directories', () => { mkdirSync(paths.work, { mode: 0o700 }); mkdirSync(paths.home, { mode: 0o700 }); mkdirSync(paths.saved, { mode: 0o700 }); syncDirectory(c.recoveryRoot) })
    if (c.closedVerification) await step('closed-journal', () => { linkSync(paths.lock, paths.journal); syncDirectory(c.recoveryRoot) })
    await step('notice', () => journal('notice', 'recorded', { request: beforeRequest, says: 'The notice request and pinned approval are retained locally. Announcement follows candidate checks and precedes downtime.' }))
    // Case 1 makes no rehearsal copy. Its build commands are still given the copy's path, which no file holds, so no
    // build command is given the live database.
    if (releaseCase.case === 2) await step('candidate-database', () => sqliteCopy(c.database, paths.candidateDatabase))
    const prepareEnv = serviceEnvironment(c, paths, paths.candidateDatabase, c.releaseCheckPort, 'release-check')
    await command('clone', paths.work, 'git', ['clone', '--no-local', '--no-hardlinks', '--no-checkout', '--', c.developmentRepository, paths.candidate], prepareEnv)
    await step('candidate-checkout', () => git(paths.candidate, ['checkout', '--detach', c.targetCommit]))
    if (git(paths.candidate, ['rev-parse', 'HEAD']) !== c.targetCommit) fail('The candidate did not check out the exact target.')
    await command('install', paths.candidate, 'npm', ['ci', '--include=dev', '--no-audit', '--no-fund'], prepareEnv)
    await command('electron-binary', paths.candidate, process.execPath, [`${THE_ELECTRON_PACKAGE}/install.js`], prepareEnv)
    const electron = electronsBinaryIn(paths.candidate, fail)
    journal('electron-binary', 'checked', { ...electron, says: `Electron's binary ${electron.binary} is in the candidate, ${electron.bytes} bytes.` })
    if (releaseCase.case === 1) {
      const answerFile = join(paths.work, 'live-mode.json')
      await command('candidate-live-mode', paths.candidate, process.execPath, ['--input-type=module', '--eval', ASK_FOR_THE_LIVE_MODE, answerFile], prepareEnv)
      const answer = theLiveModeAnswerIn(readFileSync(answerFile, 'utf8'), paths.candidate)
      takesTheLiveMode = answer.takes
      journal('candidate-live-mode', 'answered', { ...answer, says: answer.takes
        ? `The candidate's settings take ${LIVE_MODE}, so its trial start runs on the live database while the old version serves.`
        : `The candidate's settings refuse ${LIVE_MODE}, so its trial start is left out, and stable is checked on the closed database at downtime instead.` })
    }
    await command('candidate-typecheck', paths.candidate, 'npm', ['run', 'typecheck'], prepareEnv)
    await command('web-build', paths.candidate, process.execPath, ['--input-type=module', '--eval', BUILD_PAGE], prepareEnv)
    for (const name of newPlugins) await command(`plugin-build-${name}`, paths.candidate, process.execPath, ['tools/build-a-plugin.mjs', name, '--json'], prepareEnv)
    const candidateIdentities = checkArtifacts(paths.candidate, newPlugins)
    if (readTheBuildStamp(join(paths.candidate, 'dist/web')).commit !== c.targetCommit) fail('The candidate web build stamp does not name the target commit.')
    cleanRepository(paths.candidate)
    // The words the candidate shows in English on its Chinese pages. A count above zero goes in the AFTER notice. The
    // candidate's own notice contract must take a count above zero, or the upgrade stops here, before the old office
    // stops. It is asked at a count of zero too, with a count of 1, because the version must be able to take one.
    if (!wayBack) {
      const countFile = join(paths.work, 'untranslated-words.json')
      await command('untranslated-words', paths.candidate, process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', COUNT_THE_UNTRANSLATED_WORDS, countFile], prepareEnv)
      untranslatedWords = theUntranslatedCountIn(readFileSync(countFile, 'utf8'), paths.candidate)
      journal('untranslated-words', 'counted', { count: untranslatedWords, says: `The candidate shows ${untranslatedWords} ${untranslatedWords === 1 ? 'word' : 'words'} in English on its Chinese pages.` })
      await command('notice-contract', paths.candidate, process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', ASK_THE_NOTICE_CONTRACT,
        emergency ? 'stableEmergencyOutcomeSchema' : 'stableUpgradeOutcomeSchema', JSON.stringify(completedOutcome(emergency, Math.max(untranslatedWords, 1), beforeRequest.announcement.evidence, serving))], prepareEnv)
    }
    // The way back checks the previous version on the database exactly as the newer version left it.
    if (releaseCase.case === 2) {
      if (!wayBack) await command('candidate-migrate', paths.candidate, 'npm', ['run', 'db:migrate'], prepareEnv)
      if (!wayBack && c.remintMap) {
        theStagedMapIsReadable(c.remintMap, c.stableCheckout)
        remintMapHash = theFileHash(c.remintMap).sha256
        await command('candidate-remint', paths.candidate, 'npm', ['run', 'db:migrate', '--', '--remint', c.remintMap], prepareEnv, undefined, { sha256: remintMapHash })
      }
      await step('candidate-checkpoint', () => checkpoint(paths.candidateDatabase))
      const candidate = await serve('candidate-check', paths.candidate, paths.candidateDatabase, c.releaseCheckPort, 'release-check', c.targetCommit)
      await stopGroup(candidate, 'candidate-stop')
      // The rehearsal copy has done its work. It is deleted before the BEFORE notice, so the rollback copy is the only one.
      await step('delete-candidate-database', () => {
        const deleted = REHEARSAL_COPY_FILES.map((ending) => paths.candidateDatabase + ending).filter((file) => existsSync(file))
        for (const file of deleted) rmSync(file, { force: true })
        syncDirectory(paths.work)
        journal('delete-candidate-database', 'deleted', { files: deleted, says: `Deleted the rehearsal copy of the database: ${deleted.join(', ')}.` })
      })
    } else if (takesTheLiveMode) {
      const candidate = await serve('candidate-check', paths.candidate, c.database, c.releaseCheckPort, LIVE_MODE, c.targetCommit)
      await stopGroup(candidate, 'candidate-stop')
    } else journal('candidate-check', 'left-out', { says: `The candidate's trial start is left out, because its settings refuse ${LIVE_MODE} and it cannot be tried while the old version serves. Stable is checked on the closed database at downtime instead.` })
    await step('preserve-artifacts', () => {
      if (JSON.stringify(checkArtifacts(c.stableCheckout, oldPlugins)) !== JSON.stringify(savedIdentities)) fail('Baseline artifacts changed during preparation.')
      for (const path of artifacts(c.stableCheckout, oldPlugins)) copyArtifact(c.stableCheckout, paths.saved, path, artifacts(c.stableCheckout, oldPlugins))
      savedReady = true
    })
    // Recheck the old identity at the last safe point before downtime.
    cleanRepository(c.stableCheckout)
    if (git(c.stableCheckout, ['rev-parse', 'HEAD']) !== baseline || git(c.stableCheckout, ['branch', '--show-current']) !== 'stable') fail('Stable moved during preparation.')
    if (serviceSettingsIdentity(c) !== valid.settingsIdentity) fail('Development settings changed during preparation.')
    if (c.remintMap) theStagedMapIsReadable(c.remintMap, c.stableCheckout)
    if (remintMapHash !== null) theStagedMapIsTheOneTried(c.remintMap, remintMapHash)
    await readHealth(live, { observeRuntime: oldRuntime, commit: baseline, repository: c.stableCheckout, database: c.database, port: c.servicePort, mode: 'ordinary' })
    for (const group of c.serviceGroups) recordedGroup(group, c)
    onlyRecordedDatabaseHolders(c, c.serviceGroups, check => recordSetAside(check, 'before-stop'))
    if (!wayBack) await step('policy-before', () => checkPolicy('before-notice'))
    await step('notice-before', async () => {
      noticeAttempted = true
      before = await announceUpgrade({ path: paths.noticeJournal, api: noticeApi, request: beforeRequest, serving, afterSendId: c.noticeSendIds.after, timeoutMs: c.health.timeoutMs }, { officeRequest: live, ...contract })
      journal('notice-before', 'filed', { original: before })
    }, { request: beforeRequest, api: noticeApi })
    // One count of the switch's use, once BEFORE is filed. A count the office did not take is said, and the release goes on.
    if (emergency) await step('emergency-count', async () => { counted = await countTheEmergencyUse(live); journal('emergency-count', 'said', { says: counted }) })
    if (!wayBack) await step('policy-stop', () => checkPolicy('before-stop'))
    theRoomHeld()
    stopWatchingTheRoom()
    downtime = true
    if (c.closedVerification) closeTheOffice('now')
    for (const group of oldGroups()) await stopGroup(group, `old-stop-${group.pgid}`, false)
    freePort(c.servicePort)
    onlyRecordedDatabaseHolders(c, [], check => recordSetAside(check, 'after-stop'))
    await guardDatabase('after-stop')
    // The way back never restores the database, so it keeps no private image to restore from. The image is put into
    // DELETE mode before its hash is taken, so the old version's release check can open it as it was written.
    if (!wayBack && releaseCase.case === 2) await step('private-backup', async () => { await sqliteCopy(c.database, paths.privateDatabase); checkpoint(paths.privateDatabase); privateDigest = theFileHash(paths.privateDatabase).sha256; privateReady = true; snapshotPoint = localStamp(new Date()); journal('database-snapshot', 'ready', { snapshotPoint, path: paths.privateDatabase, sha256: privateDigest }) })
    if (!wayBack) await step('stable-fetch', () => git(c.stableCheckout, ['fetch', '--no-tags', '--no-write-fetch-head', paths.candidate, c.targetCommit]))
    await step('stable-checkout', () => { codeTouched = true; git(c.stableCheckout, ['checkout', '-B', 'stable', c.targetCommit]) })
    if (!wayBack) await step('candidate-tag', () => { if (c.candidateTag.slice(7, 17) !== localStamp(new Date()).slice(0, 10)) fail('The local day changed during preparation; name a fresh dated candidate tag.'); tagTouched = true; git(c.stableCheckout, ['tag', c.candidateTag, c.targetCommit]) })
    await step('install-artifacts', () => {
      for (const path of artifacts(c.stableCheckout, oldPlugins)) if (artifactIdentity(join(paths.saved, path), paths.saved) !== savedIdentities[path]) fail('The retained baseline artifacts changed before installation.')
      artifactsTouched = true
      for (const path of artifacts(c.stableCheckout, [...new Set([...oldPlugins, ...newPlugins])])) rmSync(join(c.stableCheckout, path), { recursive: true, force: true })
      for (const path of artifacts(paths.candidate, newPlugins)) copyArtifact(paths.candidate, c.stableCheckout, path, artifacts(paths.candidate, newPlugins))
      if (JSON.stringify(checkArtifacts(c.stableCheckout, newPlugins)) !== JSON.stringify(candidateIdentities)) fail('Installed candidate artifacts differ from their build.')
    })
    if (!wayBack && releaseCase.case === 2) {
      if (c.closedVerification) journal('closed-verification', 'attempted', { commit: c.targetCommit, snapshotPoint, snapshot: paths.privateDatabase, holders: requireClosedHolders() })
      databaseTouched = true
      await command('migrate', c.stableCheckout, 'npm', ['run', 'db:migrate'], serviceEnvironment(c, paths, c.database, c.servicePort, 'release-check', c.stableCheckout))
      // The re-mint runs alone, so it is its own command, after the migration. A resume counts the migration done only once it is.
      if (c.remintMap) {
        theStagedMapIsReadable(c.remintMap, c.stableCheckout)
        theStagedMapIsTheOneTried(c.remintMap, remintMapHash)
        await command('remint', c.stableCheckout, 'npm', ['run', 'db:migrate', '--', '--remint', c.remintMap], serviceEnvironment(c, paths, c.database, c.servicePort, 'release-check', c.stableCheckout))
      }
    }
    if (c.closedVerification) journal('closed-verification', 'committed-awaiting-verification', { commit: c.targetCommit, snapshotPoint })
    return await checkAndPublishTheTarget()
  } catch (failure) { return recover(failure) } }
  /** The migrated target, checked and verified while closed, then published. A resume after the migration goes on from here. */
  async function checkAndPublishTheTarget() {
    // Case 1 checks stable here only when the candidate could not be tried on the live database before downtime.
    if (releaseCase.case === 2 || c.closedVerification || takesTheLiveMode !== true) {
      await step('stable-checkpoint', () => checkpoint(c.database))
      const stable = await serve('stable-check', c.stableCheckout, c.database, c.servicePort, 'release-check', c.targetCommit)
      if (c.closedVerification) await verifyClosedGeneration('target', c.targetCommit, newPlugins)
      await stopGroup(stable, 'stable-check-stop')
    }
    ordinaryStarted = true
    const published = await serve('ordinary-start', c.stableCheckout, c.database, c.servicePort, 'ordinary', c.targetCommit)
    journal('published', 'verified', { pgid: published.pgid, startTime: published.startTime, snapshotPoint })
    // The recorded group remains available for the next transaction after this caller exits.
    published.child.unref(); published.child.channel?.unref()
    return await finish('published', { service: { pgid: published.pgid, startTime: published.startTime, detachedGroups: published.ordinary.detachedGroups, serviceGroups: published.ordinary.serviceGroups }, snapshotPoint })
  }
  /**
   * THE RESUME, after the upgrade program ended without finishing (upgrade-stable.criteria.md, item 15 (b)). Nothing opens
   * here without a verifier pass on the generation that opens: one made in this resume, or one made before the crash
   * when the crashed upgrade had already opened the ordinary start gate.
   */
  async function resumeLocked() { try {
    journal('resume', 'attempt', { controller: theController(), droppedTornBytes: resumed.torn,
      says: resumed.torn ? `Resuming the upgrade from its journal. The crash left ${resumed.torn} bytes of a last line half written, and they were dropped.` : 'Resuming the upgrade from its journal.' })
    if (was.opened && readTheUpgradeMark(c.database) === null) return await finishTheOpenedGeneration()
    if (!downtime) return await recover(new Error('The upgrade stopped before it closed the office, so the old version went on serving.'))
    // The clock counts from the resume. How long the office stood closed before it is not counted against the resume.
    closeTheOffice('this resume')
    if (!was.migrated || was.rollbackBegan) return await recover(new Error(was.failure ?? 'The upgrade stopped before its migration finished, so it is rolled back.'))
    for (const group of [...spawned]) await stopGroup(group, `resume-stop-${group.pgid}`, false)
    for (const group of oldGroups()) await stopGroup(group, `resume-old-stop-${group.pgid}`, false)
    freePort(c.servicePort)
    onlyRecordedDatabaseHolders(c, [], check => recordSetAside(check, 'resume'))
    await guardDatabase('resume')
    await step('resume-check-target', () => {
      cleanRepository(c.stableCheckout)
      if (git(c.stableCheckout, ['rev-parse', 'HEAD']) !== c.targetCommit || git(c.stableCheckout, ['branch', '--show-current']) !== 'stable') fail('The stable checkout is not on the target commit, so the resume cannot verify it.')
      if (git(c.stableCheckout, ['rev-parse', '--verify', '--quiet', `refs/tags/${c.candidateTag}^{commit}`]) !== c.targetCommit) fail(`The tag ${c.candidateTag} does not name the target commit.`)
      if (JSON.stringify(checkArtifacts(c.stableCheckout, newPlugins)) !== JSON.stringify(checkArtifacts(paths.candidate, newPlugins))) fail('The installed artifacts are not the candidate build.')
    })
    return await checkAndPublishTheTarget()
  } catch (failure) { return recover(failure) } }
  /** The crashed upgrade had opened the ordinary start gate on a verified generation. Finish it if that office answers. */
  async function finishTheOpenedGeneration() {
    const target = was.opened.step === 'ordinary-start'
    const recorded = was.groups.find((g) => g.pgid === was.opened.pgid && g.step === was.opened.step)
    const group = recorded && spawned.find((g) => g.pgid === recorded.pgid && g.startTime === recorded.startTime)
    if (!group) fail(`The ordinary start the crashed upgrade opened, process group ${was.opened.pgid}, no longer runs.`)
    group.ordinary = { commit: target ? c.targetCommit : baseline, repository: c.stableCheckout, database: c.database, port: c.servicePort, mode: 'ordinary', workerKnown: false,
      detachedGroups: was.groups.filter((g) => g.parent === group.pgid).map(({ pgid, startTime, cwd, port, database }) => ({ pgid, startTime, cwd, database, port })) }
    // The crashed upgrade started this process, and its journal keeps that time only to the second, so the resume counts
    // from when it began to wait.
    await startHealth('resume', Date.now(), { ...group.ordinary, observeRuntime: runtime => recordWorker(group, runtime) }, null, 'this resume began to wait for it', group)
    const answering = [group, ...group.ordinary.detachedGroups]
    ownedPort(c.servicePort, answering)
    for (const other of spawned.filter((g) => !answering.some((a) => a.pgid === g.pgid))) await stopGroup(other, `resume-stop-${other.pgid}`, false)
    const passed = was.verified
    if (!passed) fail('The journal records an ordinary start with no verifier pass before it.')
    verification = { phase: passed.phase === 'verified' ? 'target' : 'recovery', commit: passed.commit, stateSha256: passed.stateSha256, checks: passed.checks, ...(passed.verifiers ? { verifiers: passed.verifiers } : { request: passed.request, result: passed.result }) }
    if (target && !events.some((e) => e.step === 'published' && e.phase === 'verified')) journal('published', 'verified', { pgid: group.pgid, startTime: group.startTime, snapshotPoint })
    const service = { pgid: group.pgid, startTime: group.startTime, detachedGroups: group.ordinary.detachedGroups, serviceGroups: group.ordinary.serviceGroups }
    return await finish(target ? 'published' : 'restored', { service, snapshotPoint, ...(target ? {} : { failure: was.failure }) })
  }
  async function recover(failure) {
    // The way back stays immediate even when forward authorization is absent or expired.
    try {
      stopWatchingTheRoom()
      rollingBack = true
      await recoverLock()
      journal('recovery', 'attempt', { reason: String(failure.message ?? failure), paths, downtime, databaseTouched, ordinaryStarted, snapshotPoint })
      // A failure after a verified generation opened closes the office again, and the clock counts from this closure.
      if (c.closedVerification && downtime && readTheUpgradeMark(c.database) === null) closeTheOffice('this rollback')
      await recordWorkersBeforeStopping()
      for (const group of [...spawned].sort((a, b) => Number(Boolean(b.ordinary)) - Number(Boolean(a.ordinary)))) await stopGroup(group, `recover-stop-${group.pgid}`, false)
      if (downtime) {
        for (const group of oldGroups()) await stopGroup(group, `recover-old-stop-${group.pgid}`, false)
        freePort(c.servicePort)
        onlyRecordedDatabaseHolders(c, [], check => recordSetAside(check, 'recovery'), true)
        await guardDatabase('recovery')
        if (tagTouched && git(c.stableCheckout, ['tag', '--list', c.candidateTag])) await step('recover-tag', () => git(c.stableCheckout, ['tag', '-d', c.candidateTag]))
        if (codeTouched) await step('recover-checkout', () => git(c.stableCheckout, ['checkout', '-B', 'stable', baseline]))
        if (artifactsTouched) await step('recover-artifacts', () => {
          if (!savedReady) fail('The baseline artifact snapshot is not verified.')
          for (const path of artifacts(c.stableCheckout, [...new Set([...oldPlugins, ...newPlugins])])) rmSync(join(c.stableCheckout, path), { recursive: true, force: true })
          for (const path of artifacts(c.stableCheckout, oldPlugins)) copyArtifact(paths.saved, c.stableCheckout, path, artifacts(c.stableCheckout, oldPlugins))
          if (JSON.stringify(checkArtifacts(c.stableCheckout, oldPlugins)) !== JSON.stringify(savedIdentities)) fail('Restored artifacts do not match the baseline.')
        })
        // A closed rollback always restores the snapshot. One that began before the snapshot takes it first, from a database no migration touched.
        if (c.closedVerification && !privateReady) await step('recover-snapshot', async () => {
          if (databaseTouched) fail('The migration began before the private snapshot was verified, so there is no snapshot to restore.')
          rmSync(paths.privateDatabase, { force: true })
          await sqliteCopy(c.database, paths.privateDatabase); checkpoint(paths.privateDatabase); privateDigest = theFileHash(paths.privateDatabase).sha256; privateReady = true; snapshotPoint = localStamp(new Date())
          journal('database-snapshot', 'ready', { snapshotPoint, path: paths.privateDatabase, sha256: privateDigest })
        })
        if (databaseTouched || c.closedVerification) await step('recover-database', () => {
          if (!privateReady) fail('The full private database image is not verified.')
          if (c.closedVerification) requirePrivateSnapshot()
          for (const suffix of ['-wal', '-shm', '-journal']) rmSync(c.database + suffix, { force: true })
          const restoring = paths.restoringDatabase
          // A crash during an earlier restore can leave this file half written.
          rmSync(restoring, { force: true })
          copyFileSync(paths.privateDatabase, restoring, constants.COPYFILE_EXCL); chmodSync(restoring, 0o600); syncFile(restoring)
          renameSync(restoring, c.database); databaseReplaced = true; syncDirectory(dirname(c.database)); checkDatabase(c.database)
          if (theFileHash(c.database).sha256 !== theFileHash(paths.privateDatabase).sha256) fail('The restored database differs from the private snapshot.')
        })
        if (c.closedVerification) {
          const previous = await serve('recover-check', c.stableCheckout, c.database, c.servicePort, 'release-check', baseline)
          await verifyClosedGeneration('recovery', baseline, oldPlugins)
          await stopGroup(previous, 'recover-check-stop')
        }
        const restored = await serve('recover-start', c.stableCheckout, c.database, c.servicePort, 'ordinary', baseline)
        restored.child.unref(); restored.child.channel?.unref()
        return await finish('restored', { failure: String(failure.message ?? failure), service: { pgid: restored.pgid, startTime: restored.startTime, detachedGroups: restored.ordinary.detachedGroups, serviceGroups: restored.ordinary.serviceGroups }, snapshotPoint })
      }
      await readHealth(officeRequest, { commit: baseline, repository: c.stableCheckout, database: c.database, port: c.servicePort, mode: 'ordinary' })
      return await finish('unchanged', { failure: String(failure.message ?? failure) })
    } catch (restoreFailure) {
      const cleanupFailures = []
      for (const group of ownsLock() ? [...spawned].sort((a, b) => Number(Boolean(b.ordinary)) - Number(Boolean(a.ordinary))) : []) {
        try { await stopGroup(group, `failed-restore-stop-${group.pgid}`, false) } catch (error) { cleanupFailures.push(String(error.message ?? error)) }
      }
      const remainingGroups = remainingRecordedGroups()
      // The mark stays. The office stays closed until the command it names opens a verified generation.
      const resume = c.closedVerification && readTheUpgradeMark(c.database) !== null ? { resume: theResumeCommand(c.stableCheckout, paths.lock) } : {}
      const result = { cleanupFailures, remainingGroups, state: 'NOT RESTORED', failure: String(failure.message ?? failure), restoreFailure: String(restoreFailure.message ?? restoreFailure), paths, snapshotPoint, databaseLoss: databaseLoss(), ...resume }
      try { journal('recovery', 'failed', result) } catch { /* The original lock still names the recovery paths. */ }
      return result
    }
  }
  async function closeTransaction() {
    let result
    try { result = await (resumed ? resumeLocked() : runLocked()) } finally { stopWatchingTheRoom() }
    // Never retry an ambiguous old descriptor number. Reopen only the durable
    // journal's verified inode, then the normal recovery must reacquire exclusivity.
    // A second close failure is reported instead of entering an unbounded retry.
    for (let attempt = 0; attempt < 2; attempt++) {
      let closeAttempted = false
      try {
        const entry = journal('close-final-descriptor', 'attempt', { paths, verifiedState: result.state, service: result.service, recovery: 'Reopen the named journal, verify its original device/inode, and reacquire this lock before one recovery attempt.' })
        await options.onStep?.({ ...entry, phase: 'before' })
        closeAttempted = true
        const closeDescriptor = options.closeFinalDescriptor ?? closeSync
        closeDescriptor(fd)
        await options.onStep?.({ ...entry, phase: 'after' })
        return result
      } catch (error) {
        const cleanupFailures = [...(result.cleanupFailures ?? []), `Final journal close failed: ${String(error.message ?? error)}`]
        if (!closeAttempted) {
          try { closeSync(fd) } catch (closeError) { cleanupFailures.push(`Final journal cleanup close failed: ${String(closeError.message ?? closeError)}`) }
        }
        if (['restored', 'unchanged'].includes(result.state)) {
          try {
            await readHealth(officeRequest, { commit: baseline, repository: c.stableCheckout, database: c.database, port: c.servicePort, mode: 'ordinary' })
            return { ...result, finalizationError: String(error.message ?? error), cleanupFailures }
          } catch (verificationError) { cleanupFailures.push(`Baseline verification after final close failed: ${String(verificationError.message ?? verificationError)}`) }
        }
        if (attempt === 0 && result.state === 'published') {
          try {
            const reopened = openSync(paths.journal, constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW)
            const identity = fstatSync(reopened)
            if (!identity.isFile() || identity.dev !== journalIdentity.dev || identity.ino !== journalIdentity.ino) {
              closeSync(reopened)
              fail('The named recovery journal is not the original inode; no service was changed.')
            }
            fd = reopened
            const verifiedState = result.state
            result = { ...await recover(error), verifiedState, finalizationError: String(error.message ?? error) }
            continue
          } catch (reopenError) { cleanupFailures.push(`Final journal recovery failed: ${String(reopenError.message ?? reopenError)}`) }
        }
        const remainingGroups = remainingRecordedGroups()
        return { ...result, state: 'NOT RESTORED', verifiedState: result.state, finalizationError: String(error.message ?? error), cleanupFailures, remainingGroups }
      }
    }
  }
  const result = { ...await closeTransaction(), releaseCase, ...(counted === null ? {} : { emergencyCount: counted }), ...(untranslatedWords === null ? {} : { untranslatedWords }),
    ...(wayBack ? { untranslatedWordsSays: THE_WAY_BACK_SENDS_NO_COUNT } : {}),
    ...(databaseReplaced ? { gateCountSpool: theGateCountSpoolStep({ database: c.database, home: c.serviceHome, change: 'restored' }) } : {}) }
  if (!before) return { ...result, notices: { state: noticeAttempted ? 'unconfirmed' : 'not-attempted', journal: noticeAttempted ? paths.noticeJournal : null, says: noticeAttempted ? 'The announcement was not verified; no AFTER notice was attempted.' : 'No upgrade announcement was attempted.' } }
  return finishUpgradeNotice({ path: paths.noticeJournal, before, result, evidence: beforeRequest.announcement.evidence, serving, sendId: c.noticeSendIds.after }, {
    officeRequest, ...contract, verifyService: (expected) => readHealth(officeRequest, { ...expected, mode: 'ordinary' }),
  })
}

/** The configuration and the facts a resume needs, from the crashed upgrade's first journal entry. */
function theJournalledUpgrade(first) {
  const { config: c, paths, baseline, savedIdentities, settingsIdentity } = first
  if (typeof settingsIdentity !== 'string' || !first.controller) fail('This journal was written before an upgrade could be resumed, so it cannot be resumed. Its lock and journal are left as they are.')
  return { config: c, paths, baseline, savedIdentities, settingsIdentity, oldPlugins: pluginNames(c.stableCheckout, baseline), newPlugins: pluginNames(c.developmentRepository, c.targetCommit), tree: null,
    releaseCase: theReleaseCase(c.developmentRepository, baseline, c.targetCommit) }
}

/**
 * RESUME A CLOSED UPGRADE THAT DID NOT FINISH, from its lock (upgrade-stable.criteria.md, item 15 (b)). The command the
 * upgrade mark names runs this. It ends "published", "restored", "unchanged" or NOT RESTORED, as an upgrade does.
 */
export async function resumeStableUpgrade(lock, options = {}) {
  // A resume does not run the upgrade's checks, so it reads the clock's tick rate here, for the way back
  // (theStartsOwnInItsEndedGroup). It reads it first: readTheCrashedJournal takes a claim beside the lock and cuts a torn
  // last line off the journal, so a rate that cannot be read stops the resume with everything as the crash left it.
  theClockTicksASecond()
  const crashed = readTheCrashedJournal(lock)
  let resumed
  try {
    const was = whatTheJournalSays(crashed.events)
    resumed = { ...crashed, firstBoot: crashed.first.controller?.boot, was, valid: theJournalledUpgrade(crashed.first) }
  } catch (error) { crashed.release(); closeSync(crashed.fd); throw error }
  try { return { ...await theTransaction(null, options, null, resumed), resumed: true } } finally { crashed.release() }
}

/** Delivery only: an old configuration cannot restart or roll back the transaction. */
export function retryStableUpgradeNotice(path, { officeRequest }) {
  return retryUpgradeNotice(path, { officeRequest, verifyService: (expected) => readHealth(officeRequest, { ...expected, mode: 'ordinary' }) })
}
