// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * LANDING A GIT ENTRY: the compare-and-swap on main, the backup, the migration and the fast-forward. Part of the
 * merge tool, tools/the-merger.mjs. landGit takes what it needs of the office from its caller, as the-merger.mjs
 * passes office-keeper.mjs's functions and arguments.mjs's two gate reads, so the module reaches no office module
 * itself.
 */

import './a-library-is-not-a-program.mjs'
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { PLUGIN_BUILT_FOLDER, PLUGIN_ID, PLUGIN_MANIFEST_FILE, PLUGINS_FOLDER } from '../../src/shared/plugin-change.ts'
import { MIGRATIONS_FOLDER, SCRIPT_TIMEOUT_MS, THE_OFFICE_CONFIGURATION, WORKDIR, chosen } from './arguments.mjs'
import { fail, log, readState, stamp, writeState } from './log-and-state.mjs'
import { changedBetween, cleanEnvironment, git, packageScripts, run, tryGit } from './git.mjs'
import { THE_DATABASE_QUESTION, THE_SETTINGS_MODULE, theDatabaseNamedIn, whatTheLandingDoesAboutTheOffice } from './the-stable-office.mjs'
import { whatTheRunSaid, whyARunGaveNoResult } from './red-files.mjs'
import { carryPastDocuments, theRecordCarriedForward, untilNoOtherLandingOf } from './documents.mjs'
import { pushLanded } from './push.mjs'
import { sayThePushesThatMovedMain } from './emergency-push.mjs'
import { isLandingCommitHash, landingMessage, landingProvenance, LANDED_KEEP_PREFIX, REPLAY_KEEP_PREFIX } from '../../src/shared/merge/landed-history.mjs'

// ============================================================================ landing (git)

// The rule, after a problem linked unchanged files:
// trade at most an hour of writes without a copy before a landing that changes no schema.
// A migration always backs up first so its schema change has a fresh copy just before main moves.
export const BACKUP_FLOOR_MINUTES = 60

/** What landGit says when its caller leaves out one of the twelve functions it needs. */
export const LAND_GIT_NEEDS_WHAT_ITS_CALLER_GIVES = "landGit needs ask, countAGateMet, runInSandbox, step, theOfficesRuntime, theSandbox, waitForHealth, conflictsAfterLanding, theLane and sleep from its caller, as the-merger.mjs passes office-keeper.mjs's, and wholeSuiteFixRoundIsOn and pluginPagesPosition, as it passes arguments.mjs's THE_LANDING_GATE_READS, so that land.mjs reaches no office module itself."

/**
 * The two commands a landing runs, read from the office's configuration each time a landing reads them, so a test can
 * hand the tool a made-up configuration. The backup is the one command in `land.before`; the migration is the one step
 * in `land.after`. A list that holds another count stops the landing before main moves, naming the list and its count.
 */
function theLandingCommands() {
  const { land } = THE_OFFICE_CONFIGURATION
  if (land.before.length !== 1) fail(aListHoldsAnotherCount('land.before', land.before.length))
  if (land.after.length !== 1) fail(aListHoldsAnotherCount('land.after', land.after.length))
  return { backup: land.before[0], migrate: land.after[0].run }
}

/** The sentence that stops a landing whose `land.before` or `land.after` holds another count. */
export function aListHoldsAnotherCount(list, count) {
  const thing = list === 'land.before' ? 'command' : 'step'
  return `The landing's ${list} must hold exactly one ${thing}, and it holds ${String(count)}.`
}

/** The sentence that stops a landing whose command is not an `npm run <script>` command. */
export function notAnNpmRunScript(which, words) {
  return `The ${which} command ${JSON.stringify(words.join(' '))} is not an npm run script, and the landing runs only npm run scripts.`
}

/**
 * The npm script a command runs. The landing runs only `npm run <script>` followed by any words; anything else stops it
 * before main moves. The script's name is what package.json is checked for.
 */
function theNpmRunScript(command, what) {
  const words = Array.isArray(command) ? command : []
  if (words[0] !== 'npm' || words[1] !== 'run' || typeof words[2] !== 'string' || words[2] === '') {
    fail(notAnNpmRunScript(what, words))
  }
  return words[2]
}

/**
 * Land one git entry, taking the twelve office functions and gate reads from the caller's second argument.
 * @param {any} entry
 * @param {{ replayOnly?: boolean, ask?: unknown, countAGateMet?: unknown, runInSandbox?: unknown, step?: unknown, theOfficesRuntime?: unknown, theSandbox?: unknown, waitForHealth?: unknown, conflictsAfterLanding?: unknown, theLane?: unknown, sleep?: unknown, wholeSuiteFixRoundIsOn?: unknown, pluginPagesPosition?: unknown }} [given]
 */
export async function landGit(entry, { replayOnly = false, ask, countAGateMet, runInSandbox, step, theOfficesRuntime, theSandbox, waitForHealth, conflictsAfterLanding, theLane, sleep, wholeSuiteFixRoundIsOn, pluginPagesPosition } = {}) {
  if (typeof ask !== 'function' || typeof countAGateMet !== 'function' || typeof runInSandbox !== 'function' || typeof step !== 'function' || typeof theOfficesRuntime !== 'function' || typeof theSandbox !== 'function' || typeof waitForHealth !== 'function' || typeof conflictsAfterLanding !== 'function' || typeof theLane !== 'function' || typeof sleep !== 'function' || typeof wholeSuiteFixRoundIsOn !== 'function' || typeof pluginPagesPosition !== 'function') throw new Error(LAND_GIT_NEEDS_WHAT_ITS_CALLER_GIVES)
  const { root } = entry.changeset
  const state = readState()
  const integrated = state.integrated
  if (!integrated) fail(`Nothing integrated is recorded for entry ${chosen.entry} under ${WORKDIR}; it has to be integrated again before it can land.`)
  let { M, Cfinal } = integrated
  const { clone } = integrated
  if (!replayOnly) {
    if (integrated.landingSource === undefined) fail(`Entry ${entry.id ?? chosen.entry} has no single-commit landing provenance; it was integrated by an older tool; integrate again and test before main moves.`)
    const repository = existsSync(clone) ? clone : root
    const parents = git(repository, ['rev-list', '--parents', '-n', '1', Cfinal]).split(/\s+/)
    if (parents.length !== 2 || parents[1] !== M) fail(`Entry ${entry.id} must land as a single commit on ${M}; integrate again and test before main moves.`)
    if (git(repository, ['log', '-1', '--format=%B', Cfinal]) !== landingMessage(integrated.landingSource.title, integrated.landingSource).trim()) fail(`Entry ${entry.id} has unreadable landing provenance in ${Cfinal}; integrate again and test before main moves.`)
  }
  if (integrated.landingSource !== undefined) keepTheLandingHistory(root, clone, entry, integrated.landingSource)
  let head = git(root, ['rev-parse', '--verify', 'HEAD^{commit}'])

  // STATE FIRST (R6): the landing step is on the server BEFORE main moves, because, when the office runs from the main
  // checkout, that checkout is the live server's own working directory and moving it restarts the server. The step is
  // taken from testing (A_STEP_IS_TAKEN_FROM), and the office checks that it names the main world the entry was
  // integrated on. What would make the move fail is looked at before, so an entry is not left landing
  // on a checkout that cannot take it.
  if (entry.state === 'testing') {
    // ONE MOVE OF MAIN AT A TIME: a documentation entry lands in a lane of its own, so this waits
    // while another entry of the repository is landing; the office refuses the step meanwhile anyway.
    await untilNoOtherLandingOf(root, { theLane, sleep, ask })
    head = git(root, ['rev-parse', '--verify', 'HEAD^{commit}'])
    // MAIN MOVED ONLY BY DOCUMENTATION: the entry is put on the new main again, with nothing to test again.
    if (head !== M && !((wholeSuiteFixRoundIsOn() && entry.machine?.tested?.wholeSuiteRed !== undefined || entry.machine?.tested?.houseRules?.class === 1 || entry.machine?.tested?.mergeClass?.class === 2 || entry.machine?.tested?.mergeClass?.class === 3) && entry.machine.tested.green === false)) {
      const carried = await carryPastDocuments(integrated, head, root, { theLane, step })
      if (carried !== null) {
        if (carried.entry.state !== 'testing') return carried.entry
        ;({ M, Cfinal } = carried)
      }
    }
    const migrationsCameAlong = changedBetween(clone, M, Cfinal).some((path) => path.startsWith(MIGRATIONS_FOLDER))
    if (head === M) {
      const dirty = git(root, ['status', '--porcelain', '--untracked-files=no'])
      if (dirty !== '') fail(`The main checkout ${root} has uncommitted changes, so nothing lands on it:\n${dirty}`)
      if (!existsSync(clone)) fail(`The clone ${clone} holding the final commit ${Cfinal} is gone; the entry has to be integrated again.`)
      if (!tryGit(root, ['cat-file', '-e', `${Cfinal}^{commit}`]).ok) git(root, ['fetch', '--quiet', '--no-tags', '--no-write-fetch-head', clone, Cfinal])
      if (!tryGit(root, ['merge-base', '--is-ancestor', M, Cfinal]).ok) fail(`${Cfinal} does not descend from ${M}, so it cannot fast-forward main.`)
    }
    writeState({ landing: { M, Cfinal, migrationsCameAlong, startedAt: stamp(), backedUp: null, pruned: null, moved: null, migrated: null } })
    entry = await step('landing', { mainAt: M }, { mainBefore: M, mainNow: head, final: Cfinal, migrationsCameAlong, workdir: WORKDIR })
    if (entry.state !== 'landing') {
      log(`the office did not put the entry into landing (it is ${entry.state}); nothing moves`)
      return entry
    }
  }

  const planned = readState().landing
  let plan =
    planned && planned.M === M && planned.Cfinal === Cfinal
      ? planned
      : writeState({ landing: { M, Cfinal, migrationsCameAlong: changedBetween(existsSync(clone) ? clone : root, M, Cfinal).some((path) => path.startsWith(MIGRATIONS_FOLDER)), startedAt: stamp(), backedUp: null, pruned: null, moved: null, migrated: null } }).landing
  head = git(root, ['rev-parse', '--verify', 'HEAD^{commit}'])
  if (head !== Cfinal) {
    // THE COMPARE-AND-SWAP. Main must be exactly where it was when the change was put on top of it.
    if (head !== M) {
      log(`main is at ${head}, not at ${M} as when this entry was integrated`)
      await sayThePushesThatMovedMain(root, M, head, { ask })
      return step('main-moved', { mainAt: head }, { expected: M, found: head, final: Cfinal })
    }
    const dirty = git(root, ['status', '--porcelain', '--untracked-files=no'])
    if (dirty !== '') fail(`The main checkout ${root} has uncommitted changes, so nothing lands on it:\n${dirty}`)
    if (!tryGit(root, ['cat-file', '-e', `${Cfinal}^{commit}`]).ok) {
      if (!existsSync(clone)) fail(`The clone ${clone} holding the final commit ${Cfinal} is gone; the entry has to be integrated again.`)
      git(root, ['fetch', '--quiet', '--no-tags', '--no-write-fetch-head', clone, Cfinal])
    }
    if (!tryGit(root, ['merge-base', '--is-ancestor', M, Cfinal]).ok) fail(`${Cfinal} does not descend from ${M}, so it cannot fast-forward main.`)
    plan = await decideAboutTheOffice(root, plan, theOfficesRuntime)
    if (plan.backedUp === null) {
      const commands = theLandingCommands()
      const backupScript = theNpmRunScript(commands.backup, 'backup')
      const scripts = packageScripts(root)
      if (typeof scripts[backupScript] === 'string') {
        const backup = await run('db-backup', 'npm', [...commands.backup.slice(1), ...(plan.migrationsCameAlong ? [] : ['--if-older-than', String(BACKUP_FLOOR_MINUTES)])], { cwd: root, env: cleanEnvironment(), timeoutMs: SCRIPT_TIMEOUT_MS, nice: false })
        if (backup.code !== 0) fail(`npm run ${backupScript} exited ${String(backup.code)} in ${root}; main was not moved:\n${backup.tail}`)
        // An unknown-option note: an older backup.ts can print help and exit 0.
        // Require its own JSON answer: a compact skip, or the report whose `to` names a taken copy.
        // The taken report is pretty-printed. Its outer braces start at column zero, unlike its fields.
        const answers = (readFileSync(backup.outFile, 'utf8').match(/^\{[^\n]*\}$|^\{\r?\n[\s\S]*?^\}/gm) ?? []).flatMap((answer) => {
          try { return [JSON.parse(answer)] } catch { return [] }
        })
        const skipped = answers.find((answer) => answer?.backupSkipped === true)
        const taken = answers.find((answer) => typeof answer?.to === 'string' && answer.to !== '')
        if (skipped === undefined && taken === undefined) {
          fail(`npm run ${backupScript} returned no JSON skip or backup-taken report (with to) in ${root}; main was not moved:\n${backup.tail}`)
        }
        if (skipped !== undefined && (plan.migrationsCameAlong || typeof skipped.backup !== 'string' || skipped.backup === '' || !Number.isFinite(skipped.ageMinutes) || skipped.ageMinutes >= BACKUP_FLOOR_MINUTES)) {
          fail(`npm run ${backupScript} reported an invalid skip in ${root}; main was not moved:\n${backup.tail}`)
        }
        // The report of a taken copy names the database it copied (`from`), which is the database a migration has to reach.
        const database = typeof taken?.from === 'string' && taken.from !== '' ? taken.from : undefined
        writeState({ landing: { ...plan, backedUp: { at: stamp(), log: backup.outFile, ...(database === undefined ? {} : { database }), ...(skipped === undefined ? {} : { skipped: true, backup: skipped.backup, ageMinutes: skipped.ageMinutes }) } } })
      } else {
        writeState({ landing: { ...plan, backedUp: { at: stamp(), says: `no ${backupScript} script in package.json, so there was nothing to back up` } } })
      }
    }
    // A LANDED PLUGIN GETS ITS PAGE (wave 13x round 17): built in the entry's sandbox before main
    // moves, so a sandbox that gives no result stops the tool with main where it was, and put in place after the move.
    if (readState().landing.pluginPages === undefined) {
      const pluginPages = await buildTheChangedPlugins(root, clone, M, Cfinal, { theSandbox, runInSandbox, countAGateMet, pluginPagesPosition })
      writeState({ landing: { ...readState().landing, pluginPages } })
    }
    await migrateBeforeTheMove(root, clone, Cfinal)
    const ff = tryGit(root, ['merge', '--ff-only', Cfinal])
    if (!ff.ok) fail(`git merge --ff-only ${Cfinal} failed in ${root}: ${ff.stderr || ff.stdout}`)
    writeState({ landing: { ...readState().landing, moved: { at: stamp(), from: M, to: Cfinal } } })
    log(`main moved from ${M} to ${Cfinal} by fast-forward`)
  } else {
    log(`main is already at the final commit ${Cfinal}; only what follows the move is left`)
    await decideAboutTheOffice(root, readState().landing, theOfficesRuntime)
  }

  // A MIGRATION STILL TO RUN AFTER THE MOVE: only when it could not run before it (no database was named by a backup), or
  // when a landing begun by an older tool moved main first. The server then restarts twice, and the log says so.
  const after = readState().landing
  if (after.migrationsCameAlong && after.migrated === null) {
    const commands = theLandingCommands()
    const migrateScript = theNpmRunScript(commands.migrate, 'migration')
    const scripts = packageScripts(root)
    if (typeof scripts[migrateScript] === 'string') {
      log(`migrating after main moved, in ${root}; a server watching it restarts on the move and again when the migration lands`)
      const migrate = await run('db-migrate', 'npm', commands.migrate.slice(1), { cwd: root, env: cleanEnvironment(), timeoutMs: SCRIPT_TIMEOUT_MS, nice: false })
      if (migrate.code !== 0) fail(`npm run ${migrateScript} exited ${String(migrate.code)} in ${root} after main moved to ${Cfinal}. The server will refuse to serve until the migration is run:\n${migrate.tail}`)
      writeState({ landing: { ...after, migrated: { at: stamp(), log: migrate.outFile } } })
    } else {
      writeState({ landing: { ...after, migrated: { at: stamp(), says: `migration files came along but package.json has no ${migrateScript} script; nothing was run` } } })
    }
  }
  // The rule: prune to the setting
  // after a backup this landing took. Main and any migration have already moved; a prune failure
  // cannot stop either. STATE FIRST (R6): persist an unknown result before the destructive command,
  // so a resumed landing reports an interrupted prune rather than running it twice.
  const beforePrune = readState().landing
  if (beforePrune.backedUp?.log !== undefined && !beforePrune.backedUp.skipped && beforePrune.pruned == null) {
    writeState({ landing: { ...beforePrune, pruned: { at: stamp(), failed: 'prune result was not recorded; it is unknown and the prune will not be run again' } } })
    try {
      if (typeof packageScripts(root)['db:prune-backups'] === 'string') {
        const prune = await run('db-prune-backups', 'npm', ['run', 'db:prune-backups', '--', '--json'], { cwd: root, env: cleanEnvironment(), timeoutMs: SCRIPT_TIMEOUT_MS, nice: false })
        const answers = readFileSync(prune.outFile, 'utf8').split(/\r?\n/).flatMap((line) => {
          try { return [JSON.parse(line)] } catch { return [] }
        })
        const answer = answers.find((one) => Array.isArray(one?.removed) && Array.isArray(one?.kept) && Array.isArray(one?.left)
          && one.removed.every((copy) => typeof copy?.name === 'string' && Number.isFinite(copy.ageMinutes) && Number.isFinite(copy.bytes) && Number.isFinite(copy.freedBytes))
          && one.kept.every((copy) => typeof copy?.name === 'string')
          && one.left.every((copy) => typeof copy?.name === 'string' && typeof copy?.reason === 'string'))
        const failed = prune.timedOut ? 'npm run db:prune-backups timed out'
          : prune.code !== 0 ? `npm run db:prune-backups exited ${String(prune.code)}: ${prune.tail}`
          : answer === undefined ? 'npm run db:prune-backups returned no JSON result line'
          : answer.refused ?? answer.failed
        writeState({ landing: { ...readState().landing, pruned: { at: stamp(), log: prune.outFile, ...(answer === undefined ? {} : { removed: answer.removed, kept: answer.kept, left: answer.left }), ...(failed === undefined ? {} : { failed }) } } })
      } else {
        writeState({ landing: { ...readState().landing, pruned: { at: stamp(), says: 'no db:prune-backups script in package.json, so no prune was run' } } })
      }
    } catch (err) {
      writeState({ landing: { ...readState().landing, pruned: { at: stamp(), failed: `npm run db:prune-backups failed: ${err instanceof Error ? err.message : String(err)}` } } })
    }
  }
  const pluginPages = thePagesPutInPlace(root, M, Cfinal)
  const health = await waitForHealth(root, Cfinal)
  const done = readState().landing
  const mainAfter = git(root, ['rev-parse', '--verify', 'HEAD^{commit}'])
  // A DOCUMENTATION LANDING CARRIES MAIN'S RECORD FORWARD: its files are documents no test reads, so what the suite reads
  // does not change (an addendum to the documentation rule).
  if (entry.machine?.documents !== undefined) theRecordCarriedForward(git(root, ['rev-parse', `${M}^{tree}`]), git(root, ['rev-parse', `${mainAfter}^{tree}`]))
  const backupSaid = done.backedUp === null ? 'no backup was taken by this run' : done.backedUp.skipped ? `backup skipped; relying on ${done.backedUp.backup}, ${done.backedUp.ageMinutes.toFixed(2)} minutes old` : done.backedUp.log !== undefined ? `backed up first (${done.backedUp.log})` : done.backedUp.says
  const pruneSaid = done.pruned == null ? '' : `; ${sayPrune(done.pruned)}`
  const pagesSaid = pluginPages.map((one) => `; ${one.says}`).join('')
  const migrateSaid = !done.migrationsCameAlong ? 'no migration came along' : done.migrated?.log !== undefined ? `migrated ${done.migrated.beforeTheMove === true ? 'before' : 'after'} main moved (${done.migrated.log})` : String(done.migrated?.says ?? 'not migrated')
  const earlyConflicts = await conflictsAfterLanding(root, mainAfter)
  // Keep the result for a resumed landing; the landed receipt sends a single secretary notice.
  let pushed = readState().landing.pushed
  if (pushed == null) {
    pushed = await pushLanded(root, Cfinal)
    writeState({landing: {...readState().landing, pushed}})
  }
  const landed = await step(
    'landed',
    { mainAfter, ...(earlyConflicts.length === 0 ? {} : { earlyConflicts }), ...(!pushed.ok ? {pushFailure: pushed.says} : {}), says: `Main moved from ${M.slice(0, 12)} to ${mainAfter.slice(0, 12)} by fast-forward; ${backupSaid}; ${migrateSaid}${pruneSaid}${pagesSaid}; ${health.says}. ${pushed.says}` },
    { mainBefore: M, mainAfter, final: Cfinal, backup: done.backedUp, pruned: done.pruned ?? null, migrationsCameAlong: done.migrationsCameAlong, migrated: done.migrated, health, pluginPages },
  )
  return landed
}

/** Durable, create-only refs precede main's move. A retry keeps each tested replay under its own hash. */
function keepTheLandingHistory(root, clone, entry, source) {
  const p = landingProvenance(source)
  if (p.entry !== entry.id || p.run !== entry.run || p.seal !== entry.seal?.id || p.hash !== entry.seal?.hash || p.tip !== entry.changeset.commit) {
    fail(`The retained landing provenance of entry ${entry.id} is not the entry that was tested; nothing lands.`)
  }
  for (const [ref, tip] of [[`${LANDED_KEEP_PREFIX}${p.entry}`, p.tip], [`${REPLAY_KEEP_PREFIX}${p.entry}/${p.replayed}`, p.replayed]]) {
    if (!isLandingCommitHash(tip)) fail(`The retained tip for ${ref} is unreadable; nothing lands.`)
    if (!tryGit(root, ['cat-file', '-e', `${tip}^{commit}`]).ok) {
      if (!existsSync(clone)) fail(`The clone ${clone} holding retained tip ${tip} is gone; nothing lands.`)
      git(root, ['fetch', '--quiet', '--no-tags', '--no-write-fetch-head', clone, tip])
    }
    const held = git(root, ['for-each-ref', '--format=%(objectname)', ref])
    if (held === tip) continue
    if (held !== '') fail(`The keep ref ${ref} holds ${held}, not ${tip}; nothing lands.`)
    const kept = tryGit(root, ['update-ref', ref, tip, '0'.repeat(tip.length)])
    if (!kept.ok && git(root, ['for-each-ref', '--format=%(objectname)', ref]) !== tip) fail(`The keep ref ${ref} could not be created for ${tip}: ${kept.stderr || kept.stdout}. Nothing lands.`)
  }
}

/**
 * AFTER THE SWITCH, A LANDING CHANGES MAIN ONLY (wave 13q round 11; the cases are in the-stable-office.mjs). Decided
 * once, before the backup, and kept in the landing's state, so a landing taken up again does what its first run decided.
 * When the office runs from another folder on the database the main checkout names, the backup and the migration are
 * written as not run, with the reason: the steps that follow skip what is written, and the landed step says why. No
 * backup was taken, so no prune runs.
 */
async function decideAboutTheOffice(root, plan, theOfficesRuntime) {
  if (plan.office !== undefined) return plan
  const office = await whatTheLandingDoesAboutTheOffice({ root, runtime: await theOfficesRuntime(), askTheRootsDatabase: () => theDatabaseRootNames(root) })
  if (office.cannotTell !== undefined) fail(`${office.cannotTell}. Main is at ${git(root, ['rev-parse', 'HEAD'])}; this run backed up nothing and migrated nothing.`)
  log(office.says)
  if (!office.mainOnly) return writeState({ landing: { ...plan, office } }).landing
  const at = stamp()
  return writeState({ landing: { ...plan, office, backedUp: plan.backedUp ?? { at, says: office.noBackup }, migrated: plan.migrationsCameAlong && plan.migrated === null ? { at, says: office.noMigration } : plan.migrated } }).landing
}

/**
 * The database file the main checkout's own settings name, as its server and its `npm run db:backup` would read them: its
 * settings module, run in it with the environment the backup gets. Null when it has no settings module. A module that
 * gives no answer stops the landing before main moves. An emergency push asks it too (emergency-push.mjs).
 */
export async function theDatabaseRootNames(root) {
  if (!existsSync(join(root, THE_SETTINGS_MODULE))) return null
  const asked = await run('root-database', process.execPath, THE_DATABASE_QUESTION, { cwd: root, env: cleanEnvironment(), timeoutMs: SCRIPT_TIMEOUT_MS, nice: false })
  const named = asked.code === 0 ? theDatabaseNamedIn(readFileSync(asked.outFile, 'utf8')) : null
  if (named === null) fail(`${root}'s own ${THE_SETTINGS_MODULE} did not say which database it names (exit ${String(asked.code)}), so the landing cannot tell whether the office runs on it. Main is at ${git(root, ['rev-parse', 'HEAD'])}; this run backed up nothing and migrated nothing:\n${asked.tail}`)
  return named
}

/** The command that builds a plugin's pages, from the root of a checkout. It is the build the plugin's check runs. */
const THE_PLUGIN_BUILD = 'tools/build-a-plugin.mjs'

/** Where a page built in the sandbox waits in the main checkout until main has moved. Git keeps no dist/ folder. */
const THE_LANDING_STAGING_FOLDER = 'dist/plugin-pages-landing'

/**
 * The plugins changed between M and Cfinal, by id, in order. A path counts when its first part is `plugins` and its
 * second is a plugin id. The path may have parts after the id, or none: git keeps a plugin folder that is a link as the
 * path plugins/<id> with nothing after the id (wave 13x round 21).
 */
function thePluginsChangedBetween(root, M, Cfinal) {
  return [...new Set(changedBetween(root, M, Cfinal).flatMap((path) => {
    const [folder, id, ...rest] = path.split('/')
    return folder === PLUGINS_FOLDER && id !== undefined && PLUGIN_ID.test(id) ? [id] : []
  }))].sort()
}

/**
 * THE PAGES OF THE PLUGINS A LANDING CHANGES, BUILT IN THE ENTRY'S SANDBOX BEFORE MAIN MOVES (wave 13x round 17).
 * Git keeps no dist/ folder, so before this a plugin that landed had no page until somebody ran its
 * check in the main checkout. Every landing that changes a file of a plugin builds that plugin, whichever lane tested it.
 *
 * WHY IN THE SANDBOX. Building reads the plugin's files with Vite, which also loads a PostCSS configuration it finds
 * in the plugin's folder and reads any file an import names, wherever it is. A git entry's code is never run on the host
 * (acceptance finding 17), and the inspector does not read a plugin-only change that leaves its manifest alone (the
 * rule). So the build runs where the plugin's check ran, in the integrated clone at Cfinal, with
 * that tree's own tools/build-a-plugin.mjs, and only plain files and folders are copied out of it. A link stops the copy.
 *
 * A build that fails leaves plugins/<id>/dist as it was and does not stop the landing: the landed step says so. A
 * build that gave no result, or no answer, is the plugin-pages-built-before-landing gate's. At block it stops the tool
 * before main moves, as a backup that failed does. At remind the page is not built, the landing goes on, and the landed
 * step says which page and why; the gate is counted once for the landing.
 *
 * @returns {Promise<{ id: string, built: boolean, staged: string | null, log: string | null, says: string }[]>}
 */
async function buildTheChangedPlugins(root, clone, M, Cfinal, { theSandbox, runInSandbox, countAGateMet, pluginPagesPosition }) {
  const ids = thePluginsChangedBetween(root, M, Cfinal)
  if (ids.length === 0) return []
  const notBuilt = (id, why, log = null) => ({ id, built: false, staged: null, log, says: `the page of the plugin ${id} was NOT built, so ${PLUGINS_FOLDER}/${id}/${PLUGIN_BUILT_FOLDER} keeps what it held: ${why}` })
  const noClone = !existsSync(clone) ? `the clone ${clone} is gone` : git(clone, ['rev-parse', '--verify', 'HEAD^{commit}']) !== Cfinal ? `the clone ${clone} is not at the final commit ${Cfinal}` : null
  if (noClone !== null) return ids.map((id) => notBuilt(id, noClone))
  const sandbox = await theSandbox(root)
  const inside = relative(resolve(sandbox.folder), resolve(clone))
  if (inside === '' || inside.startsWith('..')) return ids.map((id) => notBuilt(id, `the clone ${clone} is not inside the entry's sandbox folder ${sandbox.folder}`))
  const pages = []
  let letThrough = false
  for (const id of ids) {
    const folder = `${PLUGINS_FOLDER}/${id}`
    // A FOLDER GIT KEEPS AS A LINK IS NO PLUGIN THE OFFICE READS (wave 13x round 21): the office lists a link to
    // another place and a link to nothing as refused, and a link to a file is not on its list at all. Asked FIRST,
    // because the check below would look for a plugin.json under the link and find nothing.
    if (git(root, ['ls-tree', Cfinal, '--', folder]).startsWith('120000 ')) {
      pages.push({ id, built: false, staged: null, log: null, says: `the page of the plugin ${id} was NOT built: git keeps ${folder} at ${Cfinal.slice(0, 12)} as a link, and the office reads no plugin whose folder is a link` })
      continue
    }
    if (!tryGit(root, ['cat-file', '-e', `${Cfinal}:${folder}/${PLUGIN_MANIFEST_FILE}`]).ok) {
      pages.push({ id, built: false, staged: null, log: null, says: `the plugin ${id} has no ${folder}/${PLUGIN_MANIFEST_FILE} after the landing, so it has no page to build` })
      continue
    }
    // A dist/ that git keeps is where the build would go; the build and the move would delete a file main tracks. A
    // link (mode 120000) is said apart, since the office serves no file of a plugin whose dist/ is a link.
    if (tryGit(root, ['cat-file', '-e', `${Cfinal}:${folder}/${PLUGIN_BUILT_FOLDER}`]).ok) {
      const aLink = git(root, ['ls-tree', Cfinal, '--', `${folder}/${PLUGIN_BUILT_FOLDER}`]).startsWith('120000 ')
      const where = aLink ? ' as a link, and the office serves no file of a plugin whose dist is a link' : ', and that is where the built page goes'
      pages.push(notBuilt(id, `git keeps ${folder}/${PLUGIN_BUILT_FOLDER} at ${Cfinal.slice(0, 12)}${where}`))
      continue
    }
    if (!existsSync(join(clone, THE_PLUGIN_BUILD))) {
      pages.push(notBuilt(id, `the final commit has no ${THE_PLUGIN_BUILD}`))
      continue
    }
    const command = `node ${THE_PLUGIN_BUILD} ${id}`
    const ran = await runInSandbox(sandbox, `plugin-page-${id}`, 'node', [THE_PLUGIN_BUILD, id, '--json'], { cwd: clone, timeoutMs: SCRIPT_TIMEOUT_MS })
    const why = whyARunGaveNoResult(ran)
    const answer = why === null ? theBuildsAnswer(ran, id) : null
    const refused = why !== null ? `${command} gave no result in sandbox ${sandbox.name}: ${why}; ${whatTheRunSaid(ran)} (log ${ran.outFile})`
      : (ran.code !== 0 && ran.code !== 1) || answer === null || answer.built !== (ran.code === 0)
        ? `${command} could not say whether it built the page: ${whatTheRunSaid(ran)}, ${answer === null ? 'and it printed no line of its answer' : `and its answer says built is ${String(answer.built)}`} (log ${ran.outFile}). Exit 0 is built and exit 1 is not`
        : null
    if (refused !== null) {
      if (pluginPagesPosition() === 'block') {
        await countAGateMet('plugin-pages-built-before-landing', 'block')
        fail(`${refused}. Main was not moved.`)
      }
      pages.push(notBuilt(id, `${refused}. The gate plugin-pages-built-before-landing is at remind, so the landing went on without this page`, ran.outFile))
      letThrough = true
      continue
    }
    if (!answer.built) {
      pages.push(notBuilt(id, `${answer.says} (log ${ran.outFile})`, ran.outFile))
      continue
    }
    const staged = join(root, THE_LANDING_STAGING_FOLDER, id)
    const linked = plainFilesCopied(join(clone, folder, PLUGIN_BUILT_FOLDER), staged)
    if (linked !== null) {
      pages.push(notBuilt(id, `the build in the sandbox left ${linked}, which is not a plain file or folder, so nothing was copied out of it (log ${ran.outFile})`, ran.outFile))
      continue
    }
    pages.push({ id, built: true, staged, log: ran.outFile, says: `the page of the plugin ${id} was built in the entry's sandbox and put in ${folder}/${PLUGIN_BUILT_FOLDER} (log ${ran.outFile})` })
  }
  if (letThrough) await countAGateMet('plugin-pages-built-before-landing', 'remind')
  return pages
}

/** The last line of a build's output that is its answer for `id`, or null when there is none. */
function theBuildsAnswer(ran, id) {
  const text = existsSync(ran.outFile) ? readFileSync(ran.outFile, 'utf8') : ''
  for (const line of text.split('\n').reverse()) {
    if (!line.startsWith('{')) continue
    try {
      const value = JSON.parse(line)
      if (value?.plugin === id && typeof value.built === 'boolean' && typeof value.says === 'string') return value
    } catch {
      // Output that only starts like JSON. The answer is looked for further up.
    }
  }
  return null
}

/**
 * COPY THE FOLDER `from` TO `to`, plain files and folders only, and answer null; or answer the first thing that is
 * neither, and leave nothing at `to`. A link built in the sandbox could name a file of this machine's.
 */
function plainFilesCopied(from, to) {
  rmSync(to, { recursive: true, force: true })
  if (!existsSync(from) || !lstatSync(from).isDirectory()) return from
  const copy = (at, into) => {
    mkdirSync(into, { recursive: true })
    for (const name of readdirSync(at).sort()) {
      const path = join(at, name)
      const kind = lstatSync(path)
      const stopped = kind.isDirectory() ? copy(path, join(into, name)) : kind.isFile() ? (copyFileSync(path, join(into, name)), null) : path
      if (stopped !== null) return stopped
    }
    return null
  }
  const stopped = copy(from, to)
  if (stopped !== null) rmSync(to, { recursive: true, force: true })
  return stopped
}

/**
 * PUT EACH PAGE BUILT BEFORE THE MOVE IN PLACE, now that main has moved: the page's folder replaces plugins/<id>/dist.
 * A resumed landing finds a page already moved and says the same. A landing whose state has no plugin pages was begun by
 * a tool that did not build them, and says which plugins were left unbuilt.
 */
function thePagesPutInPlace(root, M, Cfinal) {
  const pages = readState().landing.pluginPages
  if (pages === undefined) return thePluginsChangedBetween(root, M, Cfinal).map((id) => ({ id, built: false, staged: null, log: null, says: `the page of the plugin ${id} was NOT built: this landing was begun by a merge tool that did not build plugin pages` }))
  for (const page of pages) {
    if (page.staged === null || !existsSync(page.staged)) continue
    const built = join(root, PLUGINS_FOLDER, page.id, PLUGIN_BUILT_FOLDER)
    rmSync(built, { recursive: true, force: true })
    renameSync(page.staged, built)
  }
  return pages
}

/**
 * A MIGRATION RUNS BEFORE MAIN MOVES (chapter 1, rule 2: back up and migrate before merging a migration onto a live
 * checkout). When the office runs from the main checkout, main is the live server's working directory. Moved first, the
 * server restarts on the move, refuses to serve a database behind its code, and restarts again when the migration lands:
 * two restarts and a gap between them (wave 13v round 15; the server that started at 21:09:22 on 9 October said
 * "the migration landed, starting again").
 * Run first, from the clone at the final commit, whose `drizzle/` is what will land, on the database the backup just
 * copied, the move restarts the server once, onto a database that is already current.
 *
 * It runs only where it can say which database it reaches: a backup this landing took named it. Otherwise it leaves the
 * migration to after the move, as before, and says so.
 */
async function migrateBeforeTheMove(root, clone, Cfinal) {
  const plan = readState().landing
  if (!plan.migrationsCameAlong || plan.migrated !== null) return
  const commands = theLandingCommands()
  const migrateScript = theNpmRunScript(commands.migrate, 'migration')
  const database = plan.backedUp?.database
  const why =
    typeof database !== 'string' ? 'no backup taken by this landing named the database'
    : !existsSync(clone) ? `the clone ${clone} is gone`
    : git(clone, ['rev-parse', '--verify', 'HEAD^{commit}']) !== Cfinal ? `the clone ${clone} is not at the final commit ${Cfinal}`
    : typeof packageScripts(clone)[migrateScript] !== 'string' ? `the final commit has no ${migrateScript} script`
    : null
  if (why !== null) {
    log(`the migration cannot run before main moves: ${why}; it runs after the move`)
    return
  }
  log(`migrating ${database} from ${clone} at ${Cfinal} before main moves`)
  const migrate = await run('db-migrate', 'npm', commands.migrate.slice(1), { cwd: clone, env: cleanEnvironment({ MOLE_OFFICE_DB: database }), timeoutMs: SCRIPT_TIMEOUT_MS, nice: false })
  if (migrate.code !== 0) fail(`npm run ${migrateScript} exited ${String(migrate.code)} in ${clone} on ${database}; main was not moved. The backup this landing took is in ${String(plan.backedUp.log)}:\n${migrate.tail}`)
  writeState({ landing: { ...readState().landing, migrated: { at: stamp(), log: migrate.outFile, beforeTheMove: true, from: clone, database } } })
}

/** Round ages only in the sentence; freed bytes come from the JSON. */
function sayPrune(pruned) {
  const said = []
  for (const copy of pruned.removed ?? []) said.push(`removed ${copy.name}, ${copy.ageMinutes.toFixed(1)} minutes old, ${copy.bytes} bytes in size, ${copy.freedBytes} bytes freed`)
  for (const copy of pruned.left ?? []) said.push(`left ${copy.name}: ${copy.reason}`)
  if (pruned.failed !== undefined) said.push(`prune failed: ${pruned.failed}`)
  if (said.length === 0) said.push(pruned.says ?? 'prune removed no copies and left no uncertain copies')
  return said.join('; ')
}
