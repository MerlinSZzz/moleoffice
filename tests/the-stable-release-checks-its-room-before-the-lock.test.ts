// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RELEASE CHECKS ITS ROOM BEFORE THE LOCK AND WATCHES IT UNTIL DOWNTIME (tools/stable/upgrade-stable.criteria.md, "A
 * slimmer stable release", part 4). Before the lock, and in a dry run, the release works out the lowest free space it
 * will leave: the free space of the work folder's file system, less one database copy in case 2 and none in case 1,
 * less the build. The dry result carries that room, and the plan names the floor's setting. A floor above it refuses
 * the release before the lock, with nothing changed. From the lock until the old office stops, the release reads the
 * free space again; a reading under the floor stops the release before downtime, with the old version serving, and the
 * lowest reading is journalled. The watch is stopped on every way out.
 *
 * The free space is a stand-in given through the release's `freeSpace` seam, and the floor through its `env` seam, so
 * no case depends on this machine's own disk. The repositories, the database and the office are made up.
 *
 * Mutations, one at a time after a control run, then restored:
 * - the refusal before the lock is skipped: the second case is red;
 * - a reading under the floor never stops the release: the fourth case is red;
 * - the watch is kept running past the first old-stop: the fifth case is red.
 */
import { statSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { expect, it } from 'vitest'
import { upgradeStable } from '../tools/stable/stable-upgrade-transaction.mjs'
import { A_GIGABYTE, theReleaseFloor, theRoom, theRoomRefusal } from '../tools/stable/stable-release-room.mjs'
import { THE_RELEASE_FLOOR_SETTING } from '../src/config/stable-release-floor.mjs'
import { baselineIsBack, nothingChanged, remember, snapshot, stableUpgradeFixture, track } from './stable-upgrade-fixture.ts'
import { rows, type Fixture } from './a-closed-stable-upgrade.ts'

/** The floor this office would use with no setting: the room module's own default. */
const THE_DEFAULT_FLOOR = theReleaseFloor({})

/** Plenty of room: twice the default floor, so the made-up build and database leave far more than the floor. */
const PLENTY = 2 * THE_DEFAULT_FLOOR.bytes

/** How often the release reads the room in these cases: often enough that a run of about a minute reads it many times. */
const EVERY_MS = 50

/**
 * A stand-in for the free space: `bytes()` at the real file system's device, and a count of the readings, so a case can
 * see that no reading is taken after the release has ended.
 */
function aFreeSpace(bytes: () => number) {
  const read = { count: 0 }
  return { read, freeSpace: (path: string) => { read.count += 1; return { bytes: bytes(), device: statSync(path).dev } } }
}

/** The release's own options with the room's seams. */
const withTheRoom = (f: Fixture, freeSpace: (path: string) => { bytes: number, device: number }, env: Record<string, string> = {}) =>
  ({ ...f.options, env, freeSpace, roomEveryMs: EVERY_MS })

/** No reading is taken after the release has ended: the watch was stopped. */
async function theWatchStopped(read: { count: number }) {
  const ended = read.count
  await sleep(EVERY_MS * 10)
  expect(read.count, 'no reading of the room after the release ended').toBe(ended)
}

/** What a refusal said, or null when there was none. */
const anAsyncRefusal = (attempt: Promise<unknown>) => attempt.then(() => null, (error: Error) => error.message)

// Each case builds one made-up office (about 20 seconds here); the first and fourth also run a release (about a
// minute). The limits leave room for a slower machine.
it('carries the room in a dry run, names the floor in the plan, and journals the lowest reading of a release', async () => {
  const f = await stableUpgradeFixture()
  const { read, freeSpace } = aFreeSpace(() => PLENTY)
  const dry = await upgradeStable(f.config, { ...withTheRoom(f, freeSpace), dry: true })
  expect(dry.state, JSON.stringify(dry)).toBe('dry')
  const room = dry.room
  expect(room).toMatchObject({ case: 2, free: PLENTY, copies: 1, floor: THE_DEFAULT_FLOOR, databaseFileSystem: null, enough: true })
  expect(room.databaseBytes).toBeGreaterThan(0)
  expect(room.build.git, 'the development repository\'s Git folder is counted').toBeGreaterThan(0)
  expect(room.build.artifacts, 'the stable checkout\'s artifacts are counted').toBeGreaterThan(0)
  expect(room.build.total).toBe(2 * room.build.artifacts + room.build.git)
  expect(room.lowest).toBe(PLENTY - room.databaseBytes - room.build.total)
  expect(room).toEqual(theRoom({ releaseCase: 2, workFolder: f.config.recoveryRoot, database: f.database, build: room.build, floor: THE_DEFAULT_FLOOR, freeSpace }))
  expect(dry.plan.some((line: string) => line.includes(THE_DEFAULT_FLOOR.setting)), 'the plan names the floor\'s setting').toBe(true)
  const result = remember(await upgradeStable(f.config, withTheRoom(f, freeSpace)))
  expect(result.state, JSON.stringify(result)).toBe('published')
  const lowest = rows(result.paths.journal).filter((e) => e.step === 'room' && e.phase === 'lowest')
  expect(lowest.length, 'the lowest reading is journalled').toBeGreaterThan(0)
  for (const line of lowest) expect(line).toMatchObject({ bytes: PLENTY, path: expect.any(String), at: expect.any(String) })
  await theWatchStopped(read)
}, 240_000)

it('refuses a floor above the room before the lock, in a dry run and a real one, with nothing changed', async () => {
  const f = await stableUpgradeFixture()
  const { freeSpace } = aFreeSpace(() => PLENTY)
  const build = (await upgradeStable(f.config, { ...withTheRoom(f, freeSpace), dry: true })).room.build
  const env = { [THE_RELEASE_FLOOR_SETTING]: String(Math.floor(PLENTY / A_GIGABYTE) + 1) }
  const refused = theRoomRefusal(theRoom({ releaseCase: 2, workFolder: f.config.recoveryRoot, database: f.database, build, floor: theReleaseFloor(env), freeSpace }))
  expect(refused).toEqual(expect.any(String))
  const before = snapshot(f)
  expect(await anAsyncRefusal(upgradeStable(f.config, { ...withTheRoom(f, freeSpace, env), dry: true }))).toBe(refused)
  await nothingChanged(f, before)
  expect(await anAsyncRefusal(upgradeStable(f.config, withTheRoom(f, freeSpace, env)))).toBe(refused)
  await nothingChanged(f, before)
}, 120_000)

it('counts no database copy in the room of a release that changes no migration', async () => {
  const f = await stableUpgradeFixture(false, false, false, false, false, false, 1)
  const { freeSpace } = aFreeSpace(() => PLENTY)
  const dry = await upgradeStable(f.config, { ...withTheRoom(f, freeSpace), dry: true })
  expect(dry.state, JSON.stringify(dry)).toBe('dry')
  expect(dry.room).toMatchObject({ case: 1, copies: 0, enough: true })
  expect(dry.room.lowest).toBe(PLENTY - dry.room.build.total)
}, 120_000)

it('stops before downtime when a reading falls under the floor, with the old version serving and the lowest reading journalled', async () => {
  const f = await stableUpgradeFixture()
  // Under the floor once the candidate's install begins: after the lock, and well before the old office stops.
  let under = false
  const { read, freeSpace } = aFreeSpace(() => under ? THE_DEFAULT_FLOOR.bytes - 1 : PLENTY)
  const result = remember(await upgradeStable(f.config, { ...withTheRoom(f, freeSpace), onStep: (event: any) => { track(event); if (event.step === 'install' && event.phase === 'before') under = true } }))
  expect(under, 'the install step ran').toBe(true)
  expect(result.state, JSON.stringify(result)).toBe('unchanged')
  expect(result.failure).toContain(THE_DEFAULT_FLOOR.setting)
  const journal = rows(result.paths.journal)
  expect(journal.some((e) => e.step.startsWith('old-stop-')), 'no old office was stopped').toBe(false)
  expect(journal.find((e) => e.step === 'room' && e.phase === 'lowest')).toMatchObject({ bytes: THE_DEFAULT_FLOOR.bytes - 1 })
  await baselineIsBack(f)
  await theWatchStopped(read)
}, 240_000)

// One made-up office and one release: about a minute here. The limit leaves room for a slower machine.
it('reads the room no more once the first old office begins to stop, so a low reading at downtime stops nothing', async () => {
  const f = await stableUpgradeFixture()
  // Under the floor once the first old-stop step begins: the readings taken by then are counted.
  let atTheStop: number | null = null
  const { read, freeSpace } = aFreeSpace(() => atTheStop === null ? PLENTY : THE_DEFAULT_FLOOR.bytes - 1)
  const onStep = (event: any) => { track(event); if (atTheStop === null && event.step.startsWith('old-stop-') && event.phase === 'before') atTheStop = read.count }
  const result = remember(await upgradeStable(f.config, { ...withTheRoom(f, freeSpace), onStep }))
  expect(atTheStop, 'an old-stop step began').not.toBeNull()
  expect(result.state, JSON.stringify(result)).toBe('published')
  expect(read.count, 'no reading of the room after the first old-stop began').toBe(atTheStop)
  const roomLines = rows(result.paths.journal).filter((e) => e.step === 'room')
  expect(roomLines.length, 'the lowest reading is journalled').toBeGreaterThan(0)
  for (const line of roomLines) expect(line.bytes, 'no room line is under the floor').toBeGreaterThanOrEqual(THE_DEFAULT_FLOOR.bytes)
}, 240_000)
