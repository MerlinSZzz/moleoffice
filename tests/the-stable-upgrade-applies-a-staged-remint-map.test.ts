// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STAGED RE-MINT MAP (tools/stable/upgrade-stable.criteria.md, "A staged re-mint map and several closed verifiers
 * (items 28 and 31)", (a), and "A staged re-mint map is applied by a second command, on the candidate and on the live
 * store"). The upgrade's configuration may name a staged map by its whole path. The candidate copy, before anything
 * closes, and then the explicit database are each migrated with `npm run db:migrate` and re-minted with a second command,
 * `npm run db:migrate -- --remint <file>`; without the field the migrations are the commands they were. A map that is
 * missing, unreadable, a folder, not a whole path, inside the stable checkout, owned by another user or writable by its
 * group or others is refused in words before anything is stopped, and it is read again at the last safe point before the
 * stop. A map whose bytes change after the candidate was re-minted with it is refused there, or before the live re-mint.
 * A crash between the live migration and the live re-mint rolls back. The repositories, the database, the office, the
 * migration, its re-mint and the maps are all made up: no office, checkout or database of anybody's is read. The one file
 * of another user's is a system program, and only its owner is looked at.
 *
 * Mutations, one at a time after a control run, then restored:
 * - the re-mint runs whether or not a map is named: the case of no map is red;
 * - the explicit database is given the map in one command, as before: the publishing case and the crash case are red;
 * - the candidate's re-mint is left out: the publishing case and the case of a re-mint that fails on the candidate are red;
 * - the dry plan's line for the candidate does not name the re-mint: the plan case is red;
 * - the resume counts the migration as done without the re-mint: the crash case is red;
 * - the map's hash is not compared at the last safe point: the case of a map changed after the candidate's re-mint is red;
 * - the map's hash is not compared before the live re-mint: the case of a map changed after the last safe point is red;
 * - the map's check does not ask whether the file can be read: the refusals case is red;
 * - the map is not read again before the stop: the case of a map taken away is red;
 * - the map's check does not ask whether the map is inside the stable checkout: the refusals case is red;
 * - the map's check does not ask who owns the map: the refusals case is red;
 * - the map's check does not ask whether its group or others can write it: the refusals case is red.
 */
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import Database from 'better-sqlite3'
import { expect, it } from 'vitest'
import { NO_STAGED_MAP, resumeStableUpgrade, upgradeStable, validateUpgradeConfig } from '../tools/stable/stable-upgrade-transaction.mjs'
import { theUpgradeMarkPath } from '../src/config/the-upgrade-mark.mjs'
import { THE_BASELINES_MIGRATION, THE_TARGETS_MIGRATION, baselineIsBack, databaseModule, remember, root, snapshot, stableUpgradeFixture, write } from './stable-upgrade-fixture.ts'
import { closed, crashTheUpgradeAt, rows, type Fixture } from './a-closed-stable-upgrade.ts'

/** A made-up map, private to this user whatever the umask. The made-up migration never reads it; the case reads whether it was named. */
const MADE_UP_MAP = '{"synthetic":"a made-up staged re-mint map, never applied"}\n'
function aMadeUpMap(f: Fixture, name = 'staged-remint-map.json', folder = f.folder, mode = 0o600) {
  const map = join(folder, name)
  write(map, MADE_UP_MAP)
  chmodSync(map, mode)
  return map
}

/**
 * THE TARGET'S MADE-UP MIGRATION, WITH A MADE-UP RE-MINT that keeps the two rules of src/server/db/remint-migration.ts
 * this file needs. It writes down which database each run was given and its arguments, as the fixture's own migration
 * does. A plain run applies each migration file it has not applied, and the target's file does what the fixture's own
 * migration does. A run given `--remint <map>` applies nothing. It refuses while a migration is pending, because the
 * re-mint runs alone, and it refuses a map staged at other migrations than the store has applied. Either refusal writes
 * nothing and exits 1. Otherwise it writes the map's digest down once.
 */
const THE_MIGRATIONS = dirname(THE_TARGETS_MIGRATION)
function aMigrationThatReMints(folder: string) {
  return `import{createRequire}from'node:module';import{appendFileSync,readFileSync,readdirSync}from'node:fs';import {versionOf} from ${JSON.stringify(join(root, 'src/server/lib/version.ts'))};
appendFileSync(${JSON.stringify(join(folder, 'migrate-arguments'))},JSON.stringify({database:process.env.MOLE_OFFICE_DB,args:process.argv.slice(2)})+'\\n');
const Database=createRequire(import.meta.url)(${JSON.stringify(databaseModule)}),db=new Database(process.env.MOLE_OFFICE_DB,{fileMustExist:true});
const applied=db.prepare("SELECT name FROM sqlite_master WHERE name='made_up_migrations'").get()?db.prepare('SELECT name FROM made_up_migrations ORDER BY name').pluck().all():[];
const pending=readdirSync(${JSON.stringify(THE_MIGRATIONS)}).filter((name)=>name.endsWith('.sql')&&!applied.includes(name)).sort();
const refuse=(why)=>{db.close();console.error(why+' Nothing was written.');process.exit(1)};
const at=process.argv.indexOf('--remint');
if(at<0)db.transaction(()=>{
  db.exec('CREATE TABLE IF NOT EXISTS made_up_migrations(name TEXT PRIMARY KEY)');
  for(const name of pending){
    db.prepare('INSERT INTO made_up_migrations VALUES (?)').run(name);
    if(name===${JSON.stringify(basename(THE_TARGETS_MIGRATION))}){db.exec("INSERT INTO records VALUES ('migration','candidate'); CREATE TABLE migrated(port INTEGER)");db.prepare('INSERT INTO migrated VALUES (?)').run(Number(process.env.MOLE_OFFICE_PORT))}
  }
})();
else{
  if(pending.length>0)refuse('The made-up re-mint runs alone, and this run would apply '+pending.length+' migration(s) first: '+pending.join(', ')+'.');
  const map=JSON.parse(readFileSync(process.argv[at+1],'utf8'));
  if(JSON.stringify(map.stagedAt)!==JSON.stringify(applied))refuse('The made-up map was staged at '+map.stagedAt.join(', ')+', and this store has applied '+applied.join(', ')+'.');
  db.exec('CREATE TABLE IF NOT EXISTS made_up_remints(digest TEXT PRIMARY KEY)');db.prepare('INSERT OR IGNORE INTO made_up_remints VALUES (?)').run(map.digest);
}
db.close();`
}
/** The migrations a store has applied once the release's own is applied, and before it is. */
const AFTER_THE_RELEASE = [basename(THE_BASELINES_MIGRATION), basename(THE_TARGETS_MIGRATION)]
const BEFORE_THE_RELEASE = [basename(THE_BASELINES_MIGRATION)]
/** A made-up staged map for the made-up re-mint: a digest, and the migrations it was staged at. It rewrites nothing. */
function aStagedMap(f: Fixture, stagedAt: string[], digest = 'made-up-digest-1') {
  const map = join(f.folder, 'staged-remint-map.json')
  write(map, `${JSON.stringify({ synthetic: 'a made-up staged re-mint map', digest, stagedAt })}\n`)
  chmodSync(map, 0o600)
  return map
}
const theHashOf = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex')
/** The digests the made-up re-mint wrote into the explicit database, or null when it never wrote there. */
function theRemints(f: Fixture) {
  const db = new Database(f.database, { readonly: true, fileMustExist: true })
  try {
    if (!db.prepare("SELECT name FROM sqlite_master WHERE name='made_up_remints'").get()) return null
    return db.prepare('SELECT digest FROM made_up_remints ORDER BY digest').pluck().all()
  } finally { db.close() }
}

/** What a refusal said, or null when there was none. */
function refusal(attempt: () => unknown) {
  try { attempt(); return null } catch (error) { return (error as Error).message }
}
const anAsyncRefusal = (attempt: Promise<unknown>) => attempt.then(() => null, (error: Error) => error.message)

/** The migrate and re-mint commands the upgrade journalled: the candidate's, before anything closes, and the stable ones. */
function theMigrateCommands(result: { paths: { journal: string } }) {
  return rows(result.paths.journal).filter((e) => ['candidate-migrate', 'candidate-remint', 'migrate', 'remint'].includes(e.step) && e.phase === 'attempt')
    .map(({ step, command, args }) => ({ step, command, args }))
}

/** What each run of the made-up migration was given: whether its database was the explicit one, and its arguments. */
function whatTheMigrationsWereGiven(f: Fixture) {
  return rows(join(f.folder, 'migrate-arguments')).map((r) => ({ explicitDatabase: r.database === f.database, args: r.args }))
}
/** Nothing closed and nothing of the live store or the office changed. */
async function theOfficeIsAsItWas(f: Fixture, result: { paths: { journal: string } }) {
  const steps = rows(result.paths.journal).map((e) => e.step)
  expect(steps.filter((s) => ['notice-before', 'closed-time', 'migrate', 'remint'].includes(s) || s.startsWith('old-stop'))).toEqual([])
  expect(snapshot(f).migrated).toBeUndefined()
  expect(theRemints(f)).toBeNull()
  expect(existsSync(theUpgradeMarkPath(f.database))).toBe(false)
  expect((await (await fetch(`http://127.0.0.1:${f.config.servicePort}/api/health`)).json()).world.head).toBe(f.baseline.slice(0, 7))
  expect((await fetch(`http://127.0.0.1:${f.config.servicePort}/api/fixture-write`, { method: 'POST' })).status).toBe(200)
}
/** A fixture whose target brings the made-up migration that re-mints. */
const aFixtureThatReMints = () => stableUpgradeFixture(false, false, false, false, false, false, 2, 'taken', 0, aMigrationThatReMints)
/** The fixture's own step watcher, and then `also`. */
const watching = (f: Fixture, also: (e: any) => void) => async (e: any) => { await f.options.onStep(e); also(e) }

it('runs the migration as before when no map is named, and the dry plan says that none is', async () => {
  const f = await stableUpgradeFixture()
  const dry = await upgradeStable(f.config, { ...f.options, dry: true })
  expect(dry.state, JSON.stringify(dry)).toBe('dry')
  expect(dry.plan).toContain(NO_STAGED_MAP)
  const result = remember(await upgradeStable(f.config, f.options))
  expect(result.state, JSON.stringify(result)).toBe('published')
  expect(theMigrateCommands(result)).toEqual([
    { step: 'candidate-migrate', command: 'npm', args: ['run', 'db:migrate'] },
    { step: 'migrate', command: 'npm', args: ['run', 'db:migrate'] },
  ])
  expect(whatTheMigrationsWereGiven(f)).toEqual([{ explicitDatabase: false, args: [] }, { explicitDatabase: true, args: [] }])
}, 120_000)

it('names in the dry plan the migration and then the re-mint, on the candidate\'s line and on the explicit database\'s, and the map\'s hash', async () => {
  const f = await stableUpgradeFixture()
  const map = aMadeUpMap(f)
  const sha256 = theHashOf(map)
  const config = { ...closed(f), remintMap: map }
  expect(validateUpgradeConfig(config).config.remintMap).toBe(map)
  const dry = await upgradeStable(config, { ...f.options, dry: true })
  expect(dry.state, JSON.stringify(dry)).toBe('dry')
  // The candidate's line and then the explicit database's each name the plain migration before the re-mint.
  const remint = `npm run db:migrate -- --remint ${map}`
  const naming = dry.plan.filter((line: string) => line.includes(remint))
  expect(naming).toHaveLength(2)
  for (const line of naming) expect(line.indexOf('npm run db:migrate')).toBeLessThan(line.indexOf(remint))
  expect(naming[0]).toContain(String(config.releaseCheckPort))
  expect(naming[1]).toContain(config.candidateTag)
  expect(dry.plan.filter((line: string) => line.includes(sha256))).not.toEqual([])
  expect(dry.plan).not.toContain(NO_STAGED_MAP)
  expect(readFileSync(map, 'utf8')).toBe(MADE_UP_MAP)
}, 120_000)

it('migrates and then re-mints with the map, on the candidate before anything closes and on the explicit database, in a release that adds a migration', async () => {
  const f = await aFixtureThatReMints()
  const map = aStagedMap(f, AFTER_THE_RELEASE)
  const sha256 = theHashOf(map)
  const config = { ...closed(f), remintMap: map }
  const result = remember(await upgradeStable(config, f.options))
  expect(result.state, JSON.stringify(result)).toBe('published')
  expect(theMigrateCommands(result)).toEqual([
    { step: 'candidate-migrate', command: 'npm', args: ['run', 'db:migrate'] },
    { step: 'candidate-remint', command: 'npm', args: ['run', 'db:migrate', '--', '--remint', map] },
    { step: 'migrate', command: 'npm', args: ['run', 'db:migrate'] },
    { step: 'remint', command: 'npm', args: ['run', 'db:migrate', '--', '--remint', map] },
  ])
  expect(rows(result.paths.journal).find((e) => e.step === 'candidate-remint' && e.phase === 'attempt').sha256).toBe(sha256)
  expect(whatTheMigrationsWereGiven(f)).toEqual([
    { explicitDatabase: false, args: [] }, { explicitDatabase: false, args: ['--remint', map] },
    { explicitDatabase: true, args: [] }, { explicitDatabase: true, args: ['--remint', map] },
  ])
  expect(theRemints(f)).toEqual(['made-up-digest-1'])
  expect(snapshot(f).migrated).toBeDefined()
  expect(theHashOf(map)).toBe(sha256)
}, 120_000)

it('stops before anything closes when the re-mint fails on the candidate, with the live store untouched', async () => {
  const f = await aFixtureThatReMints()
  // Staged before the release's migration, so the candidate's re-mint refuses it once that migration is applied.
  const map = aStagedMap(f, BEFORE_THE_RELEASE)
  const result = remember(await upgradeStable({ ...closed(f), remintMap: map }, f.options))
  expect(result.state, JSON.stringify(result)).toBe('unchanged')
  expect(result.failure).toContain('candidate-remint')
  expect(whatTheMigrationsWereGiven(f)).toEqual([{ explicitDatabase: false, args: [] }, { explicitDatabase: false, args: ['--remint', map] }])
  await theOfficeIsAsItWas(f, result)
}, 120_000)

it('rolls back from the snapshot when it resumes after a crash between the live migration and the live re-mint', async () => {
  const f = await aFixtureThatReMints()
  const map = aStagedMap(f, AFTER_THE_RELEASE)
  const crash = await crashTheUpgradeAt(f, { ...closed(f), remintMap: map }, { run: 'publishing', step: 'migrate', phase: 'done', nth: 1 })
  expect(crash.reached, crash.said).toBe(true)
  expect(crash.signal, crash.said).toBe('SIGKILL')
  const resumed = remember(await resumeStableUpgrade(join(f.stable, '.git/stable-upgrade.lock'), f.options))
  expect(resumed.state, JSON.stringify(resumed)).toBe('restored')
  // The explicit database was migrated once and never re-minted, before the crash or after it.
  expect(whatTheMigrationsWereGiven(f).filter((r) => r.explicitDatabase)).toEqual([{ explicitDatabase: true, args: [] }])
  expect(rows(resumed.paths.journal).filter((e) => e.step === 'recover-database' && e.phase === 'done')).toHaveLength(1)
  expect(theRemints(f)).toBeNull()
  await baselineIsBack(f)
}, 120_000)

it('refuses at the last safe point a map whose file changed after the candidate was re-minted with it, with nothing closed', async () => {
  const f = await aFixtureThatReMints()
  const map = aStagedMap(f, AFTER_THE_RELEASE)
  const tried = theHashOf(map)
  const result = remember(await upgradeStable({ ...closed(f), remintMap: map }, { ...f.options, onStep: watching(f, (e) => {
    if (e.step === 'candidate-remint' && e.phase === 'after') aStagedMap(f, AFTER_THE_RELEASE, 'made-up-digest-2')
  }) }))
  expect(result.state, JSON.stringify(result)).toBe('unchanged')
  for (const named of [map, tried, theHashOf(map)]) expect(result.failure).toContain(named)
  expect(whatTheMigrationsWereGiven(f)).toEqual([{ explicitDatabase: false, args: [] }, { explicitDatabase: false, args: ['--remint', map] }])
  await theOfficeIsAsItWas(f, result)
}, 120_000)

it('refuses before the live re-mint a map whose file changed after the last safe point, and rolls back', async () => {
  const f = await aFixtureThatReMints()
  const map = aStagedMap(f, AFTER_THE_RELEASE)
  const tried = theHashOf(map)
  const result = remember(await upgradeStable({ ...closed(f), remintMap: map }, { ...f.options, onStep: watching(f, (e) => {
    if (e.step === 'install-artifacts' && e.phase === 'after') aStagedMap(f, AFTER_THE_RELEASE, 'made-up-digest-2')
  }) }))
  expect(result.state, JSON.stringify(result)).toBe('restored')
  for (const named of [map, tried, theHashOf(map)]) expect(result.failure).toContain(named)
  expect(rows(result.paths.journal).filter((e) => e.step === 'remint')).toEqual([])
  expect(whatTheMigrationsWereGiven(f).filter((r) => r.explicitDatabase)).toEqual([{ explicitDatabase: true, args: [] }])
  expect(theRemints(f)).toBeNull()
  await baselineIsBack(f)
}, 120_000)

it('refuses a map that is missing, unreadable, a folder, not a whole path, inside the stable checkout, not this user\'s or writable by others, in words, before anything is stopped', async () => {
  const f = await stableUpgradeFixture()
  const unreadable = aMadeUpMap(f, 'unreadable-map.json', f.folder, 0o000)
  const folder = join(f.folder, 'a-folder-not-a-map')
  mkdirSync(folder)
  const missing = join(f.folder, 'no-such-map.json')
  // Git's own folder, so the checkout stays clean and only the map's place is wrong.
  const inTheCheckout = aMadeUpMap(f, 'staged-remint-map.json', join(f.stable, '.git'))
  const groupWritable = aMadeUpMap(f, 'group-writable-map.json', f.folder, 0o664)
  const othersWritable = aMadeUpMap(f, 'others-writable-map.json', f.folder, 0o646)
  // A file this user does not own, that it can read. Only its owner is looked at.
  const notOurs = realpathSync('/usr/bin/env')
  const owner = statSync(notOurs).uid
  expect(owner, 'the system program is owned by another user').not.toBe(process.getuid!())
  // Each refusal names the map and what is wrong with it.
  const faults: Array<[string, unknown, string[]]> = [
    ['a missing map', missing, ['re-mint map', missing, 'does not exist']],
    ['an unreadable map', unreadable, ['re-mint map', unreadable, 'cannot be read']],
    ['a folder', folder, ['re-mint map', folder, 'not an ordinary file']],
    ['a path that is not whole', 'staged-remint-map.json', ['re-mint map', '"staged-remint-map.json"', 'whole path']],
    ['a path that is not canonical', `${f.folder}/./staged-remint-map.json`, ['re-mint map', `${f.folder}/./staged-remint-map.json`, 'whole path']],
    ['no path', null, ['re-mint map', 'null', 'whole path']],
    ['a map inside the stable checkout', inTheCheckout, ['re-mint map', inTheCheckout, 'inside the stable checkout']],
    ['a map its group can write', groupWritable, ['re-mint map', groupWritable, 'mode 0664', 'group or others']],
    ['a map others can write', othersWritable, ['re-mint map', othersWritable, 'mode 0646', 'group or others']],
    ['a map of another user', notOurs, ['re-mint map', notOurs, `user id ${owner}`, `user id ${process.getuid!()}`]],
  ]
  aMadeUpMap(f)
  for (const [name, map, words] of faults) {
    for (const said of [
      refusal(() => validateUpgradeConfig({ ...f.config, remintMap: map })),
      await anAsyncRefusal(upgradeStable({ ...f.config, remintMap: map }, { ...f.options, dry: true })),
      await anAsyncRefusal(upgradeStable({ ...closed(f), remintMap: map }, f.options)),
    ]) for (const word of words) expect(said, name).toContain(word)
  }
  expect(existsSync(join(f.stable, '.git/stable-upgrade.lock'))).toBe(false)
  expect(existsSync(theUpgradeMarkPath(f.database))).toBe(false)
  expect(readdirSync(f.config.recoveryRoot)).toEqual([])
  expect(f.requests).toEqual([])
  expect(existsSync(join(f.folder, 'migrate-arguments'))).toBe(false)
  expect((await (await fetch(`http://127.0.0.1:${f.config.servicePort}/api/health`)).json()).world.head).toBe(f.baseline.slice(0, 7))
  expect((await fetch(`http://127.0.0.1:${f.config.servicePort}/api/fixture-write`, { method: 'POST' })).status).toBe(200)
}, 120_000)

it('reads the map again at the last safe point before the stop, and leaves the office unchanged when it is gone', async () => {
  const f = await aFixtureThatReMints()
  const map = aStagedMap(f, AFTER_THE_RELEASE)
  // The map goes away while the candidate is prepared, after the configuration was read twice.
  const result = remember(await upgradeStable({ ...closed(f), remintMap: map }, { ...f.options, onStep: async (e: any) => {
    if (e.step === 'preserve-artifacts' && e.phase === 'after') rmSync(map)
  } }))
  expect(result.state, JSON.stringify(result)).toBe('unchanged')
  expect(result.failure).toContain(map)
  expect(result.failure).toContain('does not exist')
  const steps = rows(result.paths.journal).map((e) => e.step)
  expect(steps).toContain('preserve-artifacts')
  expect(whatTheMigrationsWereGiven(f)).toEqual([{ explicitDatabase: false, args: [] }, { explicitDatabase: false, args: ['--remint', map] }])
  await theOfficeIsAsItWas(f, result)
}, 120_000)
