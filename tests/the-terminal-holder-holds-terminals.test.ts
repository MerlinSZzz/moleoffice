// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TERMINAL HOLDER HOLDS TERMINALS, BY ITSELF, WITH NO SERVER. Wave 13u, round 1.
 *
 * The holder is src/holder/index.mjs. Its socket, its log and its limits are in
 * src/config/the-terminal-holder.mjs. Each case starts a real holder process for a database path in a
 * folder of its own, with XDG_CONFIG_HOME and HOME in that folder, so its socket is never the live
 * office's. The test talks to it the way the server does: askTheHolder for one request, and a
 * connection of its own for a watch (tests/terminal-holder-stand.ts).
 *
 *   1. A terminal opens, is typed into, is watched, is resized, ends with its exit code, and is closed.
 *   2. A viewer that joins while output pours out gets every piece once: its screen and the output after
 *      it, replayed, give the same lines as a screen taken after the output stopped.
 *   3. The holder's folder is this user's only (0700) and so is its socket (0600).
 *   4. Nothing a terminal shows reaches the disk. The log says a terminal opened, and holds no output.
 *   5. A second holder for the same database stops at once and says why. A holder killed outright
 *      leaves its socket file, and the next holder removes it and answers.
 *   6. SIGTERM ends the holder, the terminal's process and the socket file.
 *   7. The past a viewer is given is bounded: THE_SCROLLBACK_LINES above the screen, and no more.
 *   8. Closing a terminal that still runs, with a viewer connected: the viewer is told closed, the
 *      process ends, and the holder goes on answering.
 *   9. SIGTERM with a viewer still connected: the holder ends within a few seconds and the viewer's
 *      connection is closed. Before commit 060620216 a connected viewer kept the holder from exiting.
 *  12. A socket file removed while the holder runs: within a few seconds it listens at the same path again (0600),
 *      keeps its terminal running and a watcher connected before, says so in its log, and still stops on SIGTERM
 *      with no socket file left (round 11).
 *  13. A socket folder another user owns is refused in words at the first listen, and nothing is started (round 12).
 *  14. The same at the listen again after the socket file is gone: the holder says whose the folder is, does not
 *      listen there, and keeps its terminal (round 12).
 *      Both put a link to / (root's folder) where the socket folder goes, since a test cannot give a folder to another
 *      user. MUTATIONS: remove the owner check from listen (13) or from checkTheSocket (14): red.
 *
 * CASE 6, OLD (wave 13s round 113, problem kWg60ccdd3IS): the case sent SIGTERM as soon as the shell had a child. In a
 * whole-suite run the sleep then outlived the holder, "(sleep) in state S with parent 1". The shell runs the sleep in a
 * process group of its own, and only the shell passes the holder's SIGHUP on to it. A child the shell has forked but not
 * yet let go is a copy of the shell, and a SIGTERM sent then can leave the sleep running. Measured on a copy of the case
 * that stops the shell the moment it has forked, as a loaded machine can: the sleep outlived the holder in 15 of 40
 * runs. Stopped the moment its child is named sleep instead: in none of 40.
 * NEW: the case sends SIGTERM once the shell's only child is named sleep, which it is from its exec on.
 * WHY: a case whose signal lands in the shell's start of a command passes or fails by how busy the machine is.
 * MUTATION (round 113, after a control run, then restored): the holder starts the terminal's command with SIGHUP ignored:
 * case 6 goes red with the whole-suite run's words, the sleep "in state S with parent 1". Case 6 stays green when stop()
 * sends no SIGHUP at all. Measured: the holder's exit closes the terminal, Linux then hangs up the shell, and the shell
 * passes that on, so this case cannot tell whether the holder's own SIGHUP was sent.
 *
 * WHY BY ITSELF. The holder is the piece that must keep running while everything else restarts, and
 * it is kept small so that it rarely has to be replaced. Each promise above is the holder's own, so it
 * is shown on the holder alone; the server's doors are shown in the other three files.
 *
 * MUTATIONS (each after a control run; the commit message that added this file has the runs):
 *   - src/holder/index.mjs watch: send the answer a turn later, as before commit 6aedd105f: case 2 goes
 *     red with "Error: undefined", because an output event reaches a new viewer before its answer.
 *   - src/holder/index.mjs listen(): drop `chmodSync(socketPath, 0o600)`: case 3 goes red.
 *   - src/holder/index.mjs stop(): drop the loop that destroys every connection: case 9 goes red.
 *   - src/holder/index.mjs close: send no SIGHUP: case 8 goes red.
 *   - src/holder/index.mjs listen(): never start checkTheSocket (round 11): case 12 goes red, nobody answers.
 *   Case 8 stays green when only the close part of commit 060620216 is undone (no `closed` mark, the
 *   screen disposed at once). Measured: a headless screen that has been disposed still takes writes and
 *   still calls their callbacks, and the watchers are already cleared, so nothing a test can see changes.
 */

import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createConnection } from 'node:net'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, symlinkSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { askTheHolder, THE_LONGEST_SOCKET_PATH_BYTES, THE_SCROLLBACK_LINES } from '../src/config/the-terminal-holder.mjs'
import {
  aPlace,
  groups,
  holder,
  isAlive,
  openThroughTheHolder,
  replay,
  sleep,
  startAHolder,
  stopEverything,
  THE_HOLDER,
  theScreenNow,
  until,
  untilTheScreenShows,
  watch,
  type HeldTerminal,
} from './terminal-holder-stand.ts'

afterAll(stopEverything, 60_000)

/** The terminals the holder lists now. */
async function theList(socket: string): Promise<HeldTerminal[]> {
  const answer = await askTheHolder(socket, { op: 'list' })
  return answer['terminals'] as HeldTerminal[]
}

/** The processes a process started, from /proc. */
function theChildrenOf(pid: number): number[] {
  try {
    const tasks = readdirSync(`/proc/${String(pid)}/task`)
    return tasks.flatMap((task) =>
      readFileSync(`/proc/${String(pid)}/task/${task}/children`, 'utf8').trim().split(/\s+/).filter((s) => s !== '').map(Number),
    )
  } catch {
    return []
  }
}

/** A process's name from /proc/<pid>/stat, or null when it has gone. A shell's child keeps the shell's name until its exec. */
function theNameOf(pid: number): string | null {
  let stat: string
  try {
    stat = readFileSync(`/proc/${String(pid)}/stat`, 'utf8')
  } catch (error) {
    if (['ENOENT', 'ESRCH'].includes(String((error as NodeJS.ErrnoException).code))) return null
    throw error
  }
  return stat.slice(stat.indexOf('(') + 1, stat.lastIndexOf(')'))
}

/**
 * Each of these processes that is still there, with its name, its state and its parent from /proc/<pid>/stat. A
 * process that has ended is still there until its parent collects it, as state Z, so a failure that only said a
 * process was left could not tell an end nobody collected from a process still running (wave 13y round 58).
 */
function whatIsLeftOf(pids: number[]): string {
  const left = pids.flatMap((pid) => {
    let stat: string
    try {
      stat = readFileSync(`/proc/${String(pid)}/stat`, 'utf8')
    } catch (error) {
      if (['ENOENT', 'ESRCH'].includes(String((error as NodeJS.ErrnoException).code))) return []
      throw error
    }
    const [state, parent] = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
    const name = stat.slice(stat.indexOf('(') + 1, stat.lastIndexOf(')'))
    return [`${String(pid)} (${name}) in state ${String(state)} with parent ${String(parent)}`]
  })
  return left.length === 0 ? 'none was left when this was read' : left.join('; ')
}

/** Every regular file under a folder. */
function everyFileUnder(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...everyFileUnder(path))
    else if (entry.isFile()) out.push(path)
  }
  return out
}

describe('the terminal holder', () => {
  it('1: opens a terminal, is typed into, shows it to a watcher, resizes it, tells its end, and closes it', async () => {
    const place = aPlace('ho-1')
    await startAHolder(place)
    const t = await openThroughTheHolder(place)
    expect(t.state).toBe('running')
    expect(isAlive(t.pid)).toBe(true)

    // TYPED, AND SHOWN ON A WATCH'S SCREEN. The sum is worked out by the shell, so "hi-42" is output
    // and never the echo of what was typed.
    await holder(place, { op: 'write', terminal: t.id, data: 'echo hi-$((6*7))\r' })
    const screen = await untilTheScreenShows(place, t.id, 'hi-42')
    expect(screen.some((line) => line === 'hi-42'), screen.join('\n')).toBe(true)

    // LATER OUTPUT COMES AS OUTPUT EVENTS on a watch that stays open.
    const watcher = await watch(place, t.id)
    await holder(place, { op: 'write', terminal: t.id, data: 'echo later-$((2+3))\r' })
    await until(() => watcher.output(), (out) => out.includes('later-5'))
    expect(watcher.output()).toContain('later-5')
    expect(watcher.events.every((e) => e.event === 'output')).toBe(true)

    // RESIZED: the terminal's own size, as the program in it reads it.
    const resized = await holder(place, { op: 'resize', terminal: t.id, cols: 100, rows: 30 })
    expect((resized['terminal'] as HeldTerminal).cols).toBe(100)
    await holder(place, { op: 'write', terminal: t.id, data: 'stty size\r' })
    await until(() => watcher.output(), (out) => out.includes('30 100'))
    expect(watcher.output()).toContain('30 100')

    // ITS END, with its exit code, to the watcher and on the list.
    await holder(place, { op: 'write', terminal: t.id, data: 'exit 3\r' })
    await until(() => watcher.events, (events) => events.some((e) => e.event === 'ended'))
    const ended = watcher.events.find((e) => e.event === 'ended')
    expect(ended?.exit?.code).toBe(3)
    const listed = (await theList(place.socket)).find((one) => one.id === t.id)
    expect(listed?.state).toBe('ended')
    expect(listed?.exit?.code).toBe(3)
    // Nothing can be typed into an ended terminal.
    const typedLate = await askTheHolder(place.socket, { op: 'write', terminal: t.id, data: 'x' })
    expect(typedLate.ok).toBe(false)

    // CLOSED: gone from the list.
    const closed = await holder(place, { op: 'close', terminal: t.id })
    expect(closed['wasRunning']).toBe(false)
    expect((await theList(place.socket)).map((one) => one.id)).not.toContain(t.id)
    watcher.close()
  }, 60_000)

  it('2: a viewer that joins while output pours out loses no piece and gets none twice', async () => {
    const place = aPlace('ho-2')
    await startAHolder(place)
    const cols = 80
    const rows = 24
    const t = await openThroughTheHolder(place, { cols, rows })
    const first = await watch(place, t.id)
    // THE LOOP PAUSES FOR 20 MS EVERY 50 LINES, so it runs for over a second and a viewer can join in
    // the middle of it, both inside a burst of output and between two bursts.
    await holder(place, {
      op: 'write',
      terminal: t.id,
      data: 'for i in $(seq 1 3000); do echo line-$i; (( i % 50 )) || sleep 0.02; done; echo loop-$((1+1))-done\r',
    })

    // A NEW VIEWER JOINS EVERY 25 MS UNTIL THE LOOP HAS ENDED, so each joins between two different
    // pieces of output.
    const joiners = []
    while (!first.output().includes('loop-2-done') && joiners.length < 80) {
      joiners.push(await watch(place, t.id))
      await sleep(25)
    }
    await until(() => first.output(), (out) => out.includes('loop-2-done'), 30_000)
    for (const joiner of joiners) await until(() => joiner.output() + joiner.screen, (out) => out.includes('loop-2-done'), 10_000)
    // The prompt after the loop has been drawn on every screen before the last screen is taken.
    await sleep(500)

    const last = await watch(place, t.id)
    const theTruth = await replay([last.screen], cols, rows)
    const lines = theTruth.filter((line) => /^line-\d+$/.test(line))
    expect(lines.length).toBe(3000)

    // EVERY JOINER'S SCREEN AND THE OUTPUT AFTER IT GIVE EXACTLY THE LAST SCREEN. Several of them joined
    // in the middle of the loop: their screens hold some numbered lines and not the last one.
    let inTheMiddle = 0
    for (const joiner of joiners) {
      const atJoin = await replay([joiner.screen], cols, rows)
      if (atJoin.some((line) => /^line-\d+$/.test(line)) && !atJoin.includes('line-3000')) inTheMiddle += 1
      const seen = await replay([joiner.screen, joiner.output()], cols, rows)
      expect(seen).toEqual(theTruth)
    }
    expect(inTheMiddle, `only ${String(inTheMiddle)} of ${String(joiners.length)} viewers joined in the middle of the loop`).toBeGreaterThanOrEqual(5)
    // And the first viewer, which watched from before the loop, saw it all too.
    const fromTheStart = await replay([first.screen, first.output()], cols, rows)
    expect(fromTheStart).toEqual(theTruth)
    for (const one of [first, last, ...joiners]) one.close()
    await holder(place, { op: 'close', terminal: t.id })
  }, 90_000)

  it("3: the holder's folder is this user's only (0700), and so is its socket (0600)", async () => {
    const place = aPlace('ho-3')
    await startAHolder(place)
    const folder = join(place.config, 'mole-office', 'terminals')
    expect(place.socket.startsWith(folder)).toBe(true)
    expect(statSync(folder).mode & 0o777).toBe(0o700)
    const socket = statSync(place.socket)
    expect(socket.isSocket()).toBe(true)
    expect(socket.mode & 0o777).toBe(0o600)
  }, 30_000)

  it('4: nothing a terminal shows reaches the disk, and the log says only that it opened', async () => {
    const place = aPlace('ho-4')
    await startAHolder(place, { toTheLog: true })
    const t = await openThroughTheHolder(place)
    const secret = `SECRET-${randomBytes(12).toString('hex')}`
    const watcher = await watch(place, t.id)
    await holder(place, { op: 'write', terminal: t.id, data: `echo ${secret}\r` })
    await until(() => watcher.output(), (out) => out.split(secret).length >= 3, 10_000)
    // Typed, and shown: the echo of the typing and the output both carry it.
    expect(watcher.output().split(secret).length).toBeGreaterThanOrEqual(3)
    // Give a holder that wrote it anywhere the time to have done so.
    await sleep(500)

    const files = place.everyFolder.flatMap((folder) => everyFileUnder(folder))
    expect(files).toContain(place.log)
    for (const file of files) {
      expect(readFileSync(file).includes(secret), `${file} holds what the terminal showed`).toBe(false)
    }
    const log = readFileSync(place.log, 'utf8')
    expect(log).toContain(`terminal ${t.id} opened`)
    watcher.close()
    await holder(place, { op: 'close', terminal: t.id })
  }, 30_000)

  it('5: a second holder for the same database stops and says why; a killed holder leaves a socket the next one removes', async () => {
    const place = aPlace('ho-5')
    const firstHolder = await startAHolder(place)
    const second = await startAHolder(place, { waitForIt: false })
    const ended = await Promise.race([second.exited, sleep(10_000).then(() => null)])
    expect(ended, 'the second holder did not stop').not.toBeNull()
    expect(ended?.code).toBe(0)
    expect(second.output()).toContain('another terminal holder already answers')
    const hello = await askTheHolder(place.socket, { op: 'hello' })
    expect(hello['pid']).toBe(firstHolder.pid)

    // KILLED OUTRIGHT: nothing removes its socket file.
    process.kill(-firstHolder.pid, 'SIGKILL')
    await Promise.race([firstHolder.exited, sleep(5_000)])
    expect(isAlive(firstHolder.pid)).toBe(false)
    expect(existsSync(place.socket)).toBe(true)
    await expect(askTheHolder(place.socket, { op: 'hello' })).rejects.toMatchObject({ code: 'refused' })

    // THE NEXT HOLDER REMOVES IT, listens, and answers.
    const third = await startAHolder(place)
    const again = await askTheHolder(place.socket, { op: 'hello' })
    expect(again['pid']).toBe(third.pid)
  }, 60_000)

  it("6: SIGTERM ends the holder, the terminal's process and the socket file", async () => {
    const place = aPlace('ho-6')
    const started = await startAHolder(place)
    const t = await openThroughTheHolder(place)
    await holder(place, { op: 'write', terminal: t.id, data: 'sleep 300\r' })
    // THE SLEEP HAS STARTED, and not only been forked: the child is named sleep from its exec on. Before that it is a
    // copy of the shell that the shell has not yet let go, and the SIGTERM sent then can leave the sleep running.
    const sleeper = await until(
      () => theChildrenOf(t.pid),
      (children) => children.length > 0 && children.every((pid) => theNameOf(pid) === 'sleep'),
      10_000,
    )
    expect(sleeper.map(theNameOf), 'the shell had not started the sleep within 10 seconds').toEqual(['sleep'])
    // The sleep may lead a group of its own (the shell's job control), so its group is recorded too.
    for (const pid of sleeper) groups.add(pid)

    process.kill(-started.pid, 'SIGTERM')
    const ended = await Promise.race([started.exited, sleep(10_000).then(() => null)])
    expect(ended, 'the holder did not end within 10 seconds of SIGTERM').not.toBeNull()
    expect(ended?.code).toBe(0)
    const gone = await until(() => isAlive(t.pid) || sleeper.some(isAlive), (alive) => !alive, 5_000)
    expect(gone, `the terminal's processes outlived the holder: ${whatIsLeftOf([t.pid, ...sleeper])}`).toBe(false)
    expect(existsSync(place.socket)).toBe(false)
  }, 60_000)

  it('7: a viewer is given THE_SCROLLBACK_LINES of the past above the screen, and no more', async () => {
    const place = aPlace('ho-7')
    await startAHolder(place)
    const cols = 80
    const rows = 10
    const t = await openThroughTheHolder(place, { cols, rows })
    const watcher = await watch(place, t.id)
    await holder(place, { op: 'write', terminal: t.id, data: 'seq -f "line-%g" 1 7000; echo many-$((3+4))-done\r' })
    await until(() => watcher.output(), (out) => out.includes('many-7-done'), 30_000)
    await sleep(300)
    const lines = await theScreenNow(place, t.id)
    expect(lines.length).toBeLessThanOrEqual(THE_SCROLLBACK_LINES + rows)
    expect(lines).toContain('line-7000')
    // At least 7000 - (THE_SCROLLBACK_LINES + rows) of the earliest lines are gone.
    const dropped = 7000 - (THE_SCROLLBACK_LINES + rows)
    for (let i = 1; i <= dropped; i += 1) expect(lines.includes(`line-${String(i)}`), `line-${String(i)} is still kept`).toBe(false)
    watcher.close()
    await holder(place, { op: 'close', terminal: t.id })
  }, 60_000)

  it('8: closing a running terminal with a viewer connected tells the viewer, ends the process, and the holder goes on', async () => {
    const place = aPlace('ho-8')
    const started = await startAHolder(place)
    const t = await openThroughTheHolder(place)
    const watcher = await watch(place, t.id)
    // OUTPUT KEEPS COMING while the terminal is closed, so the close lands among pieces of output.
    await holder(place, { op: 'write', terminal: t.id, data: 'while :; do echo busy-$((1+1)); done\r' })
    await until(() => watcher.output(), (out) => out.includes('busy-2'), 10_000)

    const closed = await holder(place, { op: 'close', terminal: t.id })
    expect(closed['wasRunning']).toBe(true)
    await until(() => watcher.events, (events) => events.some((e) => e.event === 'closed'), 5_000)
    expect(watcher.events.some((e) => e.event === 'closed')).toBe(true)
    expect(await until(() => isAlive(t.pid), (alive) => !alive, 5_000), 'the closed terminal still runs').toBe(false)
    // The holder outlived the close and its process's end.
    await sleep(500)
    expect(isAlive(started.pid)).toBe(true)
    const hello = await askTheHolder(place.socket, { op: 'hello' })
    expect(hello['pid']).toBe(started.pid)
    expect((await theList(place.socket)).map((one) => one.id)).not.toContain(t.id)
    watcher.close()
  }, 30_000)

  it("9: SIGTERM with a viewer still connected ends the holder within a few seconds and closes the viewer's connection", async () => {
    const place = aPlace('ho-9')
    const started = await startAHolder(place)
    const t = await openThroughTheHolder(place)
    const watcher = await watch(place, t.id)
    process.kill(-started.pid, 'SIGTERM')
    const ended = await Promise.race([started.exited, sleep(8_000).then(() => null)])
    expect(ended, 'the holder did not end within 8 seconds of SIGTERM while a viewer was connected').not.toBeNull()
    expect(ended?.code).toBe(0)
    expect(await until(() => watcher.gone(), (gone) => gone, 3_000)).toBe(true)
    expect(await until(() => isAlive(t.pid), (alive) => !alive, 5_000)).toBe(false)
    expect(existsSync(place.socket)).toBe(false)
  }, 30_000)

  it('10: refuses a socket path longer than a Unix socket allows, in words, and starts nothing', () => {
    // THE KERNEL WOULD CUT SUCH A PATH SHORT WITHOUT A WORD, and the holder would listen where nobody looks.
    const place = aPlace('ho-10')
    const config = join(place.dir, 'x'.repeat(120))
    mkdirSync(config)
    const ran = spawnSync(process.execPath, [THE_HOLDER, '--database', place.database], {
      env: { PATH: process.env['PATH'] ?? '', XDG_CONFIG_HOME: config, HOME: place.home },
      encoding: 'utf8',
      timeout: 15_000,
    })
    expect(ran.status).toBe(1)
    expect(ran.stdout).toContain(`may be at most ${String(THE_LONGEST_SOCKET_PATH_BYTES)}. Nothing was started.`)
    expect(existsSync(join(config, 'mole-office'))).toBe(false)
  }, 30_000)

  it('11: answers a line that is JSON but not an object with a refusal, and keeps every terminal', async () => {
    // JSON.parse reads null, a number and a list too. Reading a field of one of them used to throw outside
    // every catch, which ended the holder and every terminal in it.
    const place = aPlace('ho-11')
    const started = await startAHolder(place)
    const t = await openThroughTheHolder(place)
    const answers = await new Promise<string[]>((done, fail) => {
      const socket = createConnection(place.socket)
      let got = ''
      socket.setEncoding('utf8')
      socket.on('data', (chunk: string) => {
        got += chunk
        const lines = got.split('\n').filter((line) => line !== '')
        if (lines.length >= 3) {
          socket.destroy()
          done(lines)
        }
      })
      socket.once('error', fail)
      socket.once('connect', () => socket.write('null\n42\n["op","hello"]\n'))
    })
    for (const line of answers) {
      expect(JSON.parse(line)).toEqual({ id: null, ok: false, error: 'A request must be one JSON object on one line.' })
    }
    await sleep(300)
    expect(isAlive(started.pid)).toBe(true)
    expect((await askTheHolder(place.socket, { op: 'hello' }))['pid']).toBe(started.pid)
    expect(isAlive(t.pid)).toBe(true)
  }, 30_000)

  it('12: a socket file removed while the holder runs is made again: it listens at the same path, keeps its terminals and says so in its log', async () => {
    const place = aPlace('ho-12')
    const started = await startAHolder(place, { toTheLog: true })
    const t = await openThroughTheHolder(place)
    const watcher = await watch(place, t.id)
    unlinkSync(place.socket)
    await expect(askTheHolder(place.socket, { op: 'hello' })).rejects.toBeTruthy()
    const hello = await until(() => askTheHolder(place.socket, { op: 'hello' }, 1_000).catch(() => null), (answer) => answer !== null, 10_000)
    expect(hello?.['pid'], 'no holder answered at the same path within 10 seconds').toBe(started.pid)
    expect(statSync(place.socket).mode & 0o777).toBe(0o600)
    const listed = (await holder(place, { op: 'list' }))['terminals'] as { id: string; state: string }[]
    expect(listed.map((one) => [one.id, one.state])).toEqual([[t.id, 'running']])
    expect(isAlive(t.pid)).toBe(true)
    expect(readFileSync(place.log, 'utf8')).toContain(`the socket file ${place.socket} was gone, so the holder listens there again; it still holds its 1 terminals`)
    // A WATCHER CONNECTED BEFORE goes on being given the terminal's output.
    await holder(place, { op: 'write', terminal: t.id, data: 'echo AGAIN-$((6*7))\r' })
    await until(() => watcher.output(), (out) => out.includes('AGAIN-42'), 10_000)
    expect(watcher.output()).toContain('AGAIN-42')
    watcher.close()
    // AND IT STILL STOPS AS BEFORE: SIGTERM ends it and removes its socket file.
    process.kill(-started.pid, 'SIGTERM')
    const ended = await Promise.race([started.exited, sleep(10_000).then(() => null)])
    expect(ended?.code).toBe(0)
    expect(existsSync(place.socket)).toBe(false)
  }, 60_000)
  /** The words the holder refuses a folder with: whose it is, and that it is not this user's. */
  const notThisUsers = (folder: string): string =>
    `The folder ${folder}, where the holder's socket goes, belongs to user 0, not to this user (${String(process.getuid!())}), so the holder does not listen there.`

  it("13: refuses a socket folder another user owns, in words, at the first listen, and starts nothing", () => {
    expect(process.getuid!(), 'run as root, every folder is this user\'s and the case proves nothing').not.toBe(0)
    const place = aPlace('ho-13')
    const folder = dirname(place.socket)
    mkdirSync(dirname(folder), { recursive: true })
    symlinkSync('/', folder)
    const ran = spawnSync(process.execPath, [THE_HOLDER, '--database', place.database], {
      env: { PATH: process.env['PATH'] ?? '', ...place.env },
      encoding: 'utf8',
      timeout: 15_000,
    })
    expect(ran.status, ran.stdout + ran.stderr).toBe(1)
    expect(ran.stdout).toContain(`${notThisUsers(folder)} Nothing was started.`)
  }, 30_000)

  it('14: refuses a socket folder another user owns when it listens again, says so, and keeps its terminal', async () => {
    expect(process.getuid!(), 'run as root, every folder is this user\'s and the case proves nothing').not.toBe(0)
    const place = aPlace('ho-14')
    const started = await startAHolder(place)
    const t = await openThroughTheHolder(place)
    const folder = dirname(place.socket)
    // THE FOLDER IS MOVED AWAY, socket and all, and root's folder is put at its path.
    renameSync(folder, `${folder}-moved`)
    symlinkSync('/', folder)
    const said = await until(() => started.output(), (out) => out.includes(notThisUsers(folder)), 10_000)
    expect(said).toContain(`the socket file ${place.socket} was gone, and listening there again failed: ${notThisUsers(folder)}`)
    expect(existsSync(join('/', place.socket.slice(folder.length + 1)))).toBe(false)
    expect(isAlive(t.pid)).toBe(true)
    // SAID ONCE, though the check runs every two seconds.
    await sleep(4_500)
    expect(started.output().split(notThisUsers(folder)).length - 1).toBe(1)
    process.kill(-started.pid, 'SIGTERM')
    const ended = await Promise.race([started.exited, sleep(10_000).then(() => null)])
    expect(ended?.code).toBe(0)
  }, 60_000)
})
