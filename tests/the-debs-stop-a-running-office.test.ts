// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * BOTH LINUX .debs STOP A RUNNING OFFICE BEFORE DPKG CHANGES A FILE (scripts/the-debs-stop.sh, made into each .deb's
 * preinst and prerm by scripts/the-debs-stop.mjs). The stop runs here as this user, without dpkg and without root,
 * against an installed folder this file makes in its own test folder. The folder's program is a copy of bash, its
 * server a script that waits, and its `mole-office stop` a script that writes down what it was given. Every process a
 * case starts leads a process group of its own, and the case ends those groups when it is done.
 *
 *   1. With nothing running from the folder, on a first install, an upgrade and a removal, the stop says nothing, asks
 *      nothing and is done at once. A folder that is not there is the same.
 *   2. With an office running, its own command is asked first, in its server's environment, from /. Then what still
 *      runs from the folder is stopped by its path, after SIGTERM with SIGKILL. A process that only names the folder in
 *      its arguments is left running. The stop says whose office was stopped and what the person does next.
 *   3. An office that answers its stop command with a failure, or does not answer in time, refuses the install in
 *      words, naming the user and the process, and nothing is stopped by its path. The answers the Windows installer
 *      goes on after let the install go on.
 *   4. A process from the folder that is there again after SIGKILL refuses the install, naming it.
 *   5. dpkg's other calls stop nothing. The office's postrm does nothing after a refused install, and removes the
 *      command's link on a removal, as electron-builder's own postrm does.
 *   6. The map's .deb carries the stop as its preinst and prerm, and a .deb without them, or with another stop, is named.
 *   7. The office's .deb is given the stop and the postrm, package-linux reads both .debs' scripts back, and the stop's
 *      facts come from the places that decide them.
 *  11. As root, which a stand-in `id` claims here, a process from the folder whose exe link the stop is refused is
 *      named in one line that says the install or removal goes on, and the stop exits 0. A process whose link is not
 *      there, an ended process nobody has waited for, is not named. As this user, the same processes are not named.
 *      The refused process runs a copy of bash that this user may run and may not read: the kernel then refuses its
 *      exe link to this user, as it refuses another user's link to root without CAP_SYS_PTRACE.
 *
 * The container check beside run-in-a-container.sh (tests/installed/upgrades-in-a-container.sh) runs only as root in a
 * container, so here it is read and run only as far as it goes before it asks to be root:
 *   8. It refuses in words when the newer build is not later than the older by dpkg's order, or when the two .debs of
 *      one build are at two versions, and makes nothing.
 *   9. The terminal check's names are the MOLE_OFFICE_ names theAgentsEnvironment gives an agent's terminal, and it
 *      judges a terminal's names by them.
 *  10. The sentences of the guide it quotes are in docs/beta/for-your-ai.md, and the new shell scripts read as bash.
 *  12. Its judging functions, run here without Docker, print UNJUDGED and never PASS for a judgement that needs the
 *      server's process number when that number was not read, and for "nothing runs from the folder" when a link was
 *      refused. A FAIL stays a FAIL, and a judgement made with the number is as it was. Its last line and its exit code
 *      count what could not be judged.
 *  13. A start's FAIL names the status and the health answer's words when the office answered 503, and says it did not
 *      answer only when nothing answered.
 *  14. After the update, the check presses Back up and update when the newer office waits for it, and presses nothing
 *      when the newer office does not wait.
 *  15. The press is sent as the office's own user. Its answer, the backup it names, the office serving afterwards and
 *      the plan reviews request are judged, and a press the office refused or an office that did not serve afterwards
 *      is a FAIL naming what it got.
 *  16. 3b says in a FAIL that it did not run, and why, when check 3 did not get as far as a running newer office.
 *  17. A start after the update whose own words say an office is already running and nothing was started becomes one
 *      FAIL line quoting that start, names no newer office, presses nothing, and asks the plan reviews request of the
 *      office that was still running.
 *  18. An older start's "already running" words earlier in the log do not count: a start whose own words say it
 *      started is the started path, whose note gives no cause and which presses nothing.
 *  19. A start after the update whose own words say an office is already running and nothing was started prints no
 *      note of a start, and the FAIL naming the office that was still running is its only line.
 *  20. A start after the update whose own words say it started prints its note of the start, word for word, before the
 *      note that nothing was pressed.
 *  21. A start without may-wait whose own words say an office is already running and nothing was started is one FAIL
 *      quoting it, and returns 1.
 *  22. A start whose own words say nothing was started says so before the health check answers: without may-wait the
 *      one FAIL and 1, and with may-wait 0 and the still-running FAIL, even when the health check never answers 100
 *      to 499.
 *
 * MUTATIONS, each red here and green again when put back:
 *   - the stop does not ask the office before it stops it by its path: red, case 2;
 *   - the stop finds processes by their command lines: red, case 2;
 *   - a refusal exits 0, so dpkg goes on: red, cases 3 and 4;
 *   - makeTheMapsDeb writes no stop: red, case 6;
 *   - the stop waits when nothing runs from the folder: red, case 1;
 *   - the stop runs the folder's command before it looks for a running office: red, case 1;
 *   - the postrm has no guard: red, case 5;
 *   - the container check compares versions as text: red, case 8.
 * And for cases 11 and 12:
 *   - the stop drops a refused link without a word: red, case 11;
 *   - the stop exits 1 when a link is refused: red, case 11;
 *   - the stop names a process whose link is not there: red, case 11;
 *   - the check passes "the server ended before dpkg changed a file" with no process number: red, case 12;
 *   - the check passes "nothing runs from the folder" when a link was refused: red, case 12;
 *   - the start says "did not answer" when the office answered 503: red, case 13;
 *   - the check does not press when the office waits: red, case 14;
 *   - the check presses when the office does not wait: red, case 14;
 *   - the check passes the office serving after a press that did not serve: red, case 15;
 *   - 3b says nothing when check 3 did not get there: red, case 16;
 *   - the check ignores the start's words, as before: red, case 17;
 *   - the check reads every start's words in the log, not only this start's: red, case 18;
 *   - the note gives the cause "because these two builds have the same migrations" again: red, cases 14 and 18;
 *   - the still-running path presses: red, case 17;
 *   - the still-running path notes the start again, as before: red, case 19;
 *   - a start without may-wait that started nothing is noted as started: red, case 21;
 *   - a start without may-wait that started nothing returns 0: red, case 21;
 *   - the started path prints no note of the start: red, case 20;
 *   - the start reads its own words only after the health check answers, as in the earlier change: red, case 22.
 */

import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

import {
  THE_AFTER_REMOVE,
  THE_END_WAIT_SECONDS,
  theAfterRemovesGuard,
  theInstalledFolder,
  theOfficesDebOptions,
  theStopFacts,
  theStopScript,
  whatTheDebsScriptsGetWrong,
  writeTheStop,
} from '../scripts/the-debs-stop.mjs'
import { THE_MAP, copyTheMap, makeTheMapsDeb } from '../scripts/the-office-map-part.mjs'
import { EXIT, STOP_WAIT_MS, THE_HOLDER_ENDS_WITHIN_MS } from '../src/config/the-service-command.mjs'
import { PLUGIN_BUILT_FOLDER, PLUGIN_MANIFEST_FILE } from '../src/shared/plugin-change.ts'
import { aTestDatabaseFolder } from './helpers.ts'
import { THE_NAMES_THE_TERMINAL_IS_MEANT_TO_HAVE, theFindingsAbout } from './installed/a-terminals-environment.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const ME = execFileSync('id', ['-nu'], { encoding: 'utf8' }).trim()

/** A stop with nothing to stop reads /proc once. Three seconds leaves room for a loaded machine. */
const AT_ONCE_MS = 3_000

/** Every process group a case started, ended after the case. */
const groups: number[] = []
afterEach(() => {
  for (const group of groups.splice(0)) {
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // The group had ended.
    }
  }
})

/** Whether a process runs: its program can be read. An ended process that nobody has waited for yet cannot be. */
const runs = (pid: number): boolean => {
  try {
    readlinkSync(`/proc/${String(pid)}/exe`)
    return true
  } catch {
    return false
  }
}

/** Start a process in a process group of its own, written down to be ended after the case. */
const start = (program: string, args: string[], env: Record<string, string> = {}): number => {
  const child: ChildProcess = spawn(program, args, { detached: true, stdio: 'ignore', env: { PATH: '/usr/bin:/bin', ...env } })
  if (child.pid === undefined) throw new Error(`${program} did not start`)
  groups.push(child.pid)
  child.unref()
  return child.pid
}

/** Wait until a file holds something, for at most five seconds. */
const theFileOnceWritten = async (path: string): Promise<string> => {
  const until = Date.now() + 5_000
  while (Date.now() < until) {
    if (existsSync(path) && readFileSync(path, 'utf8') !== '') return readFileSync(path, 'utf8')
    await new Promise((done) => setTimeout(done, 50))
  }
  throw new Error(`${path} was not written within five seconds`)
}

interface AnInstallation {
  base: string
  folder: string
  program: string
  server: string
  said: string
  /** What the fake `mole-office stop` answers: an exit code, or `hang`. */
  answer: (what: string) => void
  /** Every line the fake `mole-office stop` wrote, one for each time it was run. */
  asked: () => string[]
}

/**
 * AN INSTALLED FOLDER, opt/mole-office in a test folder of its own. Its program is a copy of bash, so whatever runs it
 * runs from the folder. Its server writes its process number and waits. Its `mole-office stop` writes a line with what
 * it was given and whether the window was still running, ends the server unless it answers a failure, and answers.
 */
const anInstallation = (): AnInstallation => {
  const base = aTestDatabaseFolder('debs-stop')
  const folder = join(base, 'opt', 'mole-office')
  const office = join(folder, 'resources', 'office')
  const said = join(base, 'said')
  mkdirSync(office, { recursive: true })
  mkdirSync(said)
  const program = join(folder, 'mole-office')
  copyFileSync('/usr/bin/bash', program)
  chmodSync(program, 0o755)
  const server = join(office, 'server.mjs')
  writeFileSync(server, [`echo $$ > '${said}/server.pid'`, "trap 'exit 0' TERM", 'while :; do sleep 0.1; done', ''].join('\n'))
  writeFileSync(
    join(office, 'mole-office.mjs'),
    [
      `said='${said}'`,
      'window=$(cat "$said/window.pid" 2>/dev/null)',
      'if [ -n "$window" ] && readlink "/proc/$window/exe" >/dev/null 2>&1; then state=running; else state=ended; fi',
      'echo "args=$* uid=$(id -u) mark=${THE_SERVERS_MARK:-} node=${ELECTRON_RUN_AS_NODE:-} cwd=$PWD window=$state" >>"$said/asked.log"',
      'answer=$(cat "$said/answer")',
      '[ "$answer" = hang ] && exec sleep 60',
      'case "$answer" in 0 | 3 | 4 | 12) kill "$(cat "$said/server.pid")" ;; esac',
      'exit "$answer"',
      '',
    ].join('\n'),
  )
  writeFileSync(join(said, 'answer'), '0')
  return {
    base,
    folder,
    program,
    server,
    said,
    answer: (what) => writeFileSync(join(said, 'answer'), what),
    asked: () => (existsSync(join(said, 'asked.log')) ? readFileSync(join(said, 'asked.log'), 'utf8').split('\n').filter(Boolean) : []),
  }
}

/** Start the installation's server, as the office's service runs it, with an environment of its own. */
const startTheServer = async (installation: AnInstallation): Promise<number> => {
  const pid = start(installation.program, [installation.server], { THE_SERVERS_MARK: 'the-servers-own', ELECTRON_RUN_AS_NODE: '1' })
  expect(Number(await theFileOnceWritten(join(installation.said, 'server.pid')))).toBe(pid)
  return pid
}

/** Start a window: a process from the folder that is not the server. With `deaf`, it does not end on SIGTERM. */
const startAWindow = (installation: AnInstallation, deaf = false): number => {
  const pid = start(installation.program, ['-c', `${deaf ? "trap '' TERM; " : ''}sleep 60; :`])
  writeFileSync(join(installation.said, 'window.pid'), String(pid))
  return pid
}

/** The stop, made for the installation with the facts given over theStopFacts's, in the test folder. */
const theStop = (installation: AnInstallation, facts: Record<string, string> = {}): string => {
  const path = join(installation.base, 'stop')
  writeFileSync(path, theStopScript({ ...theStopFacts(installation.folder), ...facts }))
  chmodSync(path, 0o755)
  return path
}

interface Ran {
  code: number | null
  out: string
  err: string
  ms: number
}

/** Run a script as dpkg would, with arguments, and wait for it while this process goes on taking its children's ends. */
const run = (script: string, args: string[], env: Record<string, string> = { PATH: '/usr/bin:/bin' }): Promise<Ran> =>
  new Promise((done, failed) => {
    const began = Date.now()
    const child = spawn(script, args, { stdio: ['ignore', 'pipe', 'pipe'], env })
    let out = ''
    let err = ''
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString('utf8')))
    child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString('utf8')))
    child.on('error', failed)
    child.on('close', (code) => done({ code, out, err, ms: Date.now() - began }))
  })

/** One of the check's one-line helpers, as the check holds it. */
const aLineOfTheCheck = (text: string, name: string): string => {
  const line = new RegExp(`^${name}\\(\\) \\{.*\\}$`, 'm').exec(text)?.[0]
  if (line === undefined) throw new Error(`the check has no one-line ${name}`)
  return line
}

/** One of the check's functions, as the check holds it. */
const aFunctionOfTheCheck = (text: string, name: string): string => {
  const from = text.indexOf(`\n${name}() {\n`)
  if (from < 0) throw new Error(`the check has no function ${name}`)
  return text.slice(from + 1, text.indexOf('\n}\n', from) + 3)
}

describe('both Linux .debs stop a running office before dpkg changes a file', () => {
  it('1. with nothing running from the folder, says nothing, asks nothing and is done at once, and so with no folder', async () => {
    const installation = anInstallation()
    const stop = theStop(installation)
    for (const args of [['install'], ['install', '0.1.0~beta.7'], ['upgrade', '0.1.0~beta.8'], ['remove'], ['failed-upgrade', '0.1.0~beta.9']]) {
      const ran = await run(stop, args)
      expect({ args, code: ran.code, out: ran.out, err: ran.err }, 'the stop said something or refused with nothing running').toEqual({ args, code: 0, out: '', err: '' })
      expect(ran.ms, `the stop took ${String(ran.ms)} ms with nothing running`).toBeLessThan(AT_ONCE_MS)
    }
    expect(installation.asked(), 'the stop ran the office command with nothing running').toEqual([])

    const nowhere = theStop(installation, { THE_FOLDER: join(installation.base, 'not-there') })
    expect(await run(nowhere, ['install'])).toMatchObject({ code: 0, out: '', err: '' })
  }, 60_000)

  it('2. asks each office first, in its own environment, then stops what still runs from the folder by its path, and leaves a process that only names the folder', async () => {
    const installation = anInstallation()
    const server = await startTheServer(installation)
    const window = startAWindow(installation, true)
    const namesTheFolder = start('/usr/bin/bash', ['-c', 'sleep 60; :', installation.folder, installation.server])
    const namesTheServer = start(process.execPath, ['-e', 'setInterval(() => {}, 1000)', installation.server])
    const ran = await run(theStop(installation, { THE_END_WAIT_SECONDS: '2' }), ['upgrade', '0.1.0~beta.8'])

    expect(ran.err, 'the stop said something on its error output').toBe('')
    expect(ran.code).toBe(0)
    expect(installation.asked(), "the office was not asked once, by its own command, in its server's environment, from /, before its window was stopped").toEqual([
      `args=stop uid=${String(process.getuid?.())} mark=the-servers-own node=1 cwd=/ window=running`,
    ])
    expect(ran.out.split('\n').filter(Boolean)).toEqual([
      `Mole Office: asking ${ME}'s office (process ${String(server)}) to stop.`,
      `Mole Office: stopped for ${ME} before this version of Mole Office is installed (2 processes from ${installation.folder}). Terminals Mole Office held have ended. It is not started again: open Mole Office from the app menu when this has finished.`,
    ])
    expect({ server: runs(server), window: runs(window) }, 'a process from the folder still runs').toEqual({ server: false, window: false })
    expect({ namesTheFolder: runs(namesTheFolder), namesTheServer: runs(namesTheServer) }, 'a process that only names the folder in its arguments was stopped').toEqual({
      namesTheFolder: true,
      namesTheServer: true,
    })

    // A removal says what stays, and opens nothing.
    const again = anInstallation()
    await startTheServer(again)
    startAWindow(again)
    const removed = await run(theStop(again, { THE_END_WAIT_SECONDS: '2' }), ['remove'])
    expect(removed.code).toBe(0)
    expect(removed.out.split('\n').filter(Boolean).at(-1)).toBe(
      `Mole Office: stopped for ${ME} before Mole Office is removed (2 processes from ${again.folder}). Terminals Mole Office held have ended. Its data folder stays where it was.`,
    )

    // A window with no office running is not asked about, and is stopped by its path.
    const alone = anInstallation()
    const lone = startAWindow(alone)
    const closed = await run(theStop(alone, { THE_END_WAIT_SECONDS: '2' }), ['upgrade', '0.1.0~beta.8'])
    expect(closed.code).toBe(0)
    expect(alone.asked()).toEqual([])
    expect(closed.out.split('\n').filter(Boolean)[0]).toBe(`Mole Office: ${ME} has Mole Office open with no office running, so nothing is asked, and its window is closed below.`)
    expect(runs(lone)).toBe(false)
  }, 60_000)

  it('3. refuses in words when an office does not stop when asked, and stops nothing by its path; the answers the Windows installer goes on after go on', async () => {
    const installation = anInstallation()
    const server = await startTheServer(installation)
    const window = startAWindow(installation)
    installation.answer(String(EXIT.FAILED))
    const refused = await run(theStop(installation, { THE_END_WAIT_SECONDS: '1' }), ['upgrade', '0.1.0~beta.8'])
    expect(refused.code, 'a stop that failed let the install go on').toBe(1)
    expect(refused.err.split('\n').filter(Boolean)).toEqual([
      `Mole Office: ${ME}'s Mole Office is running (process ${String(server)}: ${installation.program} ${installation.server}) and did not stop when asked (it answered 1).`,
      `Mole Office: nothing was changed. ${ME} can shut it down with Shut down Mole Office, in the menu of its icon in the notification area. Then run this again.`,
    ])
    expect({ server: runs(server), window: runs(window) }, 'a refused stop still stopped a process by its path').toEqual({ server: true, window: true })

    installation.answer('hang')
    const late = await run(theStop(installation, { THE_ASK_WAIT_SECONDS: '2', THE_END_WAIT_SECONDS: '1' }), ['remove'])
    expect(late.code, 'a stop command that did not answer let the removal go on').toBe(1)
    expect(late.err.split('\n').filter(Boolean)[0]).toBe(
      `Mole Office: ${ME}'s Mole Office is running (process ${String(server)}: ${installation.program} ${installation.server}) and did not stop when asked (it did not answer within 2 seconds).`,
    )
    expect(late.ms, 'the stop did not give up on the command after its wait').toBeLessThan(10_000)

    for (const answer of [EXIT.NOT_RUNNING]) {
      const one = anInstallation()
      const itsServer = await startTheServer(one)
      const itsWindow = startAWindow(one)
      one.answer(String(answer))
      const went = await run(theStop(one, { THE_END_WAIT_SECONDS: '1' }), ['upgrade', '0.1.0~beta.8'])
      expect({ answer, code: went.code, err: went.err }, 'an answer the Windows installer goes on after refused the install').toEqual({ answer, code: 0, err: '' })
      expect({ server: runs(itsServer), window: runs(itsWindow) }).toEqual({ server: false, window: false })
    }
  }, 90_000)

  it('4. refuses, naming it, when a process from the folder is there again after SIGKILL', async () => {
    const installation = anInstallation()
    // A loop outside the folder that starts a process from the folder again each time one ends.
    const loop = start('/usr/bin/bash', ['-c', 'while :; do "$1" -c "sleep 60; :"; done', 'again', installation.program])
    const ran = await run(theStop(installation, { THE_END_WAIT_SECONDS: '1' }), ['upgrade', '0.1.0~beta.8'])
    expect(ran.code, 'a process left running from the folder let the install go on').toBe(1)
    const [first, second] = ran.err.split('\n').filter(Boolean)
    expect(first).toMatch(new RegExp(`^Mole Office: something still runs from ${installation.folder} after it was stopped: ${ME}'s process \\d+ \\(${installation.program} -c sleep 60; :\\)\\.$`))
    expect(second).toBe('Mole Office: nothing was changed. Close Mole Office, or ask the person it runs for to shut it down, then run this again.')
    expect(runs(loop), 'the loop, which only names the folder, was stopped').toBe(true)
  }, 60_000)

  it("5. stops nothing on dpkg's other calls; the office's postrm does nothing after a refusal and removes the command's link on a removal", async () => {
    const installation = anInstallation()
    const server = await startTheServer(installation)
    const window = startAWindow(installation)
    const stop = theStop(installation, { THE_END_WAIT_SECONDS: '1' })
    for (const args of [['abort-upgrade', '0.1.0~beta.9'], ['abort-install'], ['configure', '0.1.0~beta.8'], []]) {
      expect({ args, ...(await run(stop, args)) }).toMatchObject({ args, code: 0, out: '', err: '' })
    }
    expect(installation.asked()).toEqual([])
    expect({ server: runs(server), window: runs(window) }).toEqual({ server: true, window: true })

    // The postrm as electron-builder makes it: each macro written, and a name it does not know refused.
    const macros: Record<string, string> = { executable: 'mole-office-a-test', sanitizedProductName: 'mole-office-a-test' }
    const postrm = join(installation.base, 'postrm')
    writeFileSync(
      postrm,
      readFileSync(THE_AFTER_REMOVE, 'utf8').replace(/\$\{([a-zA-Z]+)\}/g, (_, name: string) => {
        if (!(name in macros)) throw new Error(`Macro ${name} is not defined`)
        return String(macros[name])
      }),
    )
    chmodSync(postrm, 0o755)
    const standIns = join(installation.base, 'stand-ins')
    mkdirSync(standIns)
    writeFileSync(join(standIns, 'update-alternatives'), `#!/bin/sh\necho "$*" >>'${join(installation.said, 'alternatives.log')}'\n`)
    chmodSync(join(standIns, 'update-alternatives'), 0o755)
    const alternatives = (): string => (existsSync(join(installation.said, 'alternatives.log')) ? readFileSync(join(installation.said, 'alternatives.log'), 'utf8') : '')
    const env = { PATH: `${standIns}:/usr/bin:/bin` }
    for (const args of [['abort-upgrade', '0.1.0~beta.9'], ['abort-install']]) {
      expect({ args, ...(await run(postrm, args, env)) }).toMatchObject({ args, code: 0, out: '', err: '' })
    }
    expect(alternatives(), "the postrm changed the older version's command after a refused install").toBe('')
    expect(await run(postrm, ['remove'], env)).toMatchObject({ code: 0 })
    expect(alternatives()).toBe('--remove mole-office-a-test /opt/mole-office-a-test/mole-office-a-test\n')
  }, 60_000)

  it("6. puts the stop in the map's .deb as its preinst and prerm, and names a .deb without it", () => {
    const map = join(aTestDatabaseFolder('debs-stop-map'), THE_MAP)
    mkdirSync(join(map, PLUGIN_BUILT_FOLDER), { recursive: true })
    writeFileSync(join(map, PLUGIN_MANIFEST_FILE), `${JSON.stringify({ id: THE_MAP, note: 'An invented manifest for a test.' })}\n`)
    writeFileSync(join(map, PLUGIN_BUILT_FOLDER, 'main.html'), '<p>An invented page.</p>\n')
    const staged = copyTheMap({ from: map, to: join(aTestDatabaseFolder('debs-stop-staged'), THE_MAP) })
    const out = aTestDatabaseFolder('debs-stop-out')
    const deb = makeTheMapsDeb({ staged, version: '9.9.9-test.1', arch: 'x64', office: ['opt', 'mole-office', 'resources', 'office'], work: aTestDatabaseFolder('debs-stop-work'), out })
    expect(whatTheDebsScriptsGetWrong({ deb, folder: '/opt/mole-office' }), "the map's .deb does not carry the stop").toEqual([])
    expect(execFileSync('dpkg-deb', ['--info', deb, 'preinst'], { encoding: 'utf8' })).toBe(theStopScript(theStopFacts('/opt/mole-office')))
    const modes = execFileSync('tar', ['-tvf', '-'], { input: execFileSync('dpkg-deb', ['--ctrl-tarfile', deb]), encoding: 'utf8' })
    expect(modes.split('\n').filter((line) => / \.\/pre(inst|rm)$/.test(line)).map((line) => line.slice(0, 10))).toEqual(['-rwxr-xr-x', '-rwxr-xr-x'])

    expect(whatTheDebsScriptsGetWrong({ deb, folder: '/opt/another' })).toEqual([
      `${deb}'s preinst is not the stop for /opt/another that scripts/the-debs-stop.mjs writes.`,
      `${deb}'s prerm is not the stop for /opt/another that scripts/the-debs-stop.mjs writes.`,
    ])
    expect(whatTheDebsScriptsGetWrong({ deb, folder: '/opt/mole-office', postrm: true })).toEqual([`${deb} has no postrm.`])

    // A .deb made by hand with no scripts.
    const root = join(aTestDatabaseFolder('debs-stop-by-hand'), 'root')
    mkdirSync(join(root, 'DEBIAN'), { recursive: true })
    writeFileSync(join(root, 'DEBIAN', 'control'), ['Package: mole-office-map', 'Version: 9.9.9~test.1', 'Architecture: amd64', 'Maintainer: An invented maintainer', 'Description: An invented package for a test', ''].join('\n'))
    for (const made of [root, join(root, 'DEBIAN')]) chmodSync(made, 0o755)
    const byHand = join(root, '..', 'by-hand.deb')
    execFileSync('dpkg-deb', ['--build', '--root-owner-group', root, byHand], { stdio: 'pipe' })
    expect(whatTheDebsScriptsGetWrong({ deb: byHand, folder: '/opt/mole-office' })).toEqual([
      `${byHand} has no preinst, so it does not stop a running office before dpkg changes a file.`,
      `${byHand} has no prerm, so it does not stop a running office before dpkg changes a file.`,
    ])
  }, 60_000)

  it("7. gives the office's .deb the stop and the postrm, reads both .debs back in package-linux, and takes the stop's facts from where they are decided", () => {
    const into = join(aTestDatabaseFolder('debs-stop-options'), 'deb-scripts')
    const options = theOfficesDebOptions({ folder: '/opt/mole-office', into })
    expect(options).toEqual({ fpm: ['--before-install', join(into, 'preinst'), '--before-remove', join(into, 'prerm')], afterRemove: THE_AFTER_REMOVE })
    for (const name of ['preinst', 'prerm']) expect(readFileSync(join(into, name), 'utf8')).toBe(theStopScript(theStopFacts('/opt/mole-office')))
    expect(writeTheStop({ folder: '/opt/mole-office', into })).toEqual({ preinst: join(into, 'preinst'), prerm: join(into, 'prerm') })

    const linux = readFileSync(join(REPO, 'scripts', 'package-linux.mjs'), 'utf8')
    for (const line of [
      'const THE_INSTALLED_FOLDER = `/opt/${PACKAGE_NAME}`',
      "deb: { depends: DEB_DEPENDS, recommends: DEB_RECOMMENDS, ...theOfficesDebOptions({ folder: THE_INSTALLED_FOLDER, into: join(work, 'deb-scripts') }) },",
      'whatTheDebsScriptsGetWrong({ deb: join(out, deb), folder: THE_INSTALLED_FOLDER, postrm: true })',
      'whatTheDebsScriptsGetWrong({ deb: mapsDeb, folder: THE_INSTALLED_FOLDER })',
      'if (stopsWrong.length > 0) refuseTheMap(',
    ]) {
      expect(linux, `package-linux.mjs has no ${line}`).toContain(line)
    }
    // The postrm's template is electron-builder's own, of the electron-builder package-linux runs.
    const runs = /const ELECTRON_BUILDER = '(electron-builder@[^']+)'/.exec(linux)?.[1]
    expect(readFileSync(THE_AFTER_REMOVE, 'utf8'), "the postrm's template names another electron-builder than package-linux runs").toContain(`${String(runs)}'s own after-remove.tpl`)
    expect(theAfterRemovesGuard().split('\n').slice(-4)).toEqual(['case "$1" in', '  abort-install | abort-upgrade) exit 0 ;;', 'esac', ''])

    const facts = theStopFacts('/opt/mole-office')
    expect(facts).toEqual({
      THE_FOLDER: '/opt/mole-office',
      THE_COMMAND: 'resources/office/mole-office.mjs',
      THE_SERVER: 'resources/office/server.mjs',
      THE_ANSWERS_THAT_GO_ON: `${String(EXIT.OK)} ${String(EXIT.NOT_RUNNING)} ${String(EXIT.STALE)} ${String(EXIT.HOLDER_NOT_STOPPED)}`,
      THE_ASK_WAIT_SECONDS: facts['THE_ASK_WAIT_SECONDS'],
      THE_END_WAIT_SECONDS: String(THE_END_WAIT_SECONDS),
    })
    expect(Number(facts['THE_ASK_WAIT_SECONDS']) * 1000, 'the stop gives the stop command less time than its own waits').toBeGreaterThan(STOP_WAIT_MS + THE_HOLDER_ENDS_WITHIN_MS)
    expect(() => theStopScript({ ...facts, THE_FOLDER: "/opt/it's" })).toThrow('The stop\'s fact THE_FOLDER holds "/opt/it\'s", which the stop would not read as it is.')
    expect(() => theStopScript({ ...facts, THE_FOLDER: '/opt/mole-*' })).toThrow('The stop\'s fact THE_FOLDER holds "/opt/mole-*", which the stop would not read as it is.')
    expect(theInstalledFolder(['opt', 'mole-office', 'resources', 'office'])).toBe('/opt/mole-office')
    expect(() => theInstalledFolder(['opt', 'mole-office', 'office'])).toThrow('The office is at /opt/mole-office/office in the .deb, which does not end in resources/office, so the folder the stop reads is not known.')
  })

  it('11. as root, names in one line each process whose link it is refused, and goes on; names no process whose link is not there, and nothing as this user', async () => {
    expect(process.getuid?.(), 'this case does not run as root').not.toBe(0)
    const installation = anInstallation()
    // A copy of bash in the folder that this user may run and may not read.
    const runOnly = join(installation.folder, 'run-only')
    copyFileSync('/usr/bin/bash', runOnly)
    chmodSync(runOnly, 0o111)
    const refused = start(runOnly, ['-c', 'sleep 60; :'])
    // A process from the folder that has ended, under a parent that never waits for it.
    const zombieFile = join(installation.said, 'zombie.pid')
    start(installation.program, ['-c', '"$0" -c "sleep 0.3; exit 0" & echo $! >"$1"; exec sleep 60', installation.program, zombieFile])
    const zombie = Number(await theFileOnceWritten(zombieFile))
    /** Why reading a process's exe link failed, or `read`. */
    const theLink = (pid: number): string => {
      try {
        readlinkSync(`/proc/${String(pid)}/exe`)
        return 'read'
      } catch (error) {
        return String((error as NodeJS.ErrnoException).code)
      }
    }
    const ended = (): boolean => existsSync(`/proc/${String(zombie)}/status`) && /^State:\s+Z/m.test(readFileSync(`/proc/${String(zombie)}/status`, 'utf8'))
    const until = Date.now() + 5_000
    while (!(theLink(refused) === 'EACCES' && ended()) && Date.now() < until) await new Promise((done) => setTimeout(done, 50))
    expect(
      { refused: theLink(refused), zombie: ended() ? theLink(zombie) : 'not an ended process' },
      `this machine did not refuse this user the exe link of a program it may not read (fs.suid_dumpable is ${readFileSync('/proc/sys/fs/suid_dumpable', 'utf8').trim()}, and 1 lets it read it), or did not keep the ended process`,
    ).toEqual({ refused: 'EACCES', zombie: 'ENOENT' })

    // A stand-in id says this user is root, as root without CAP_SYS_PTRACE is: it believes it sees every process.
    const standIns = join(installation.base, 'stand-ins')
    mkdirSync(standIns)
    writeFileSync(join(standIns, 'id'), '#!/bin/sh\nif [ "$*" = -u ]; then echo 0; exit 0; fi\nexec /usr/bin/id "$@"\n')
    chmodSync(join(standIns, 'id'), 0o755)
    const stop = theStop(installation, { THE_END_WAIT_SECONDS: '1' })
    /** The lines a run said that name one process. */
    const naming = (said: string, pid: number): string[] => said.split('\n').filter((line) => new RegExp(`\\bprocess ${String(pid)}\\b`).test(line))
    for (const [args, going] of [
      [['upgrade', '0.1.0~beta.8'], 'the install'],
      [['remove'], 'the removal'],
    ] as const) {
      const ran = await run(stop, [...args], { PATH: `${standIns}:/usr/bin:/bin` })
      expect({ args, code: ran.code, err: ran.err }, 'a refused link changed what the stop answers').toEqual({ args, code: 0, err: '' })
      expect(naming(ran.out, refused), 'the stop did not name, in one line, the process whose link it was refused').toEqual([
        `Mole Office: could not look at process ${String(refused)}, which runs as ${ME}, because the system refused to show which program it runs. It was not stopped, even if it is Mole Office, and ${going} goes on.`,
      ])
      expect(naming(ran.out, zombie), 'the stop named a process whose link is not there').toEqual([])
      // Another user's process is refused to this user too, and is named the same way. Nothing else is said.
      expect(ran.out.split('\n').filter((line) => line !== '' && !line.startsWith('Mole Office: could not look at process '))).toEqual([])
    }
    expect(installation.asked()).toEqual([])
    expect(await run(stop, ['upgrade', '0.1.0~beta.8']), 'the stop, as this user, named a process').toMatchObject({ code: 0, out: '', err: '' })
    expect(existsSync(`/proc/${String(refused)}`), 'the stop stopped the process it could not look at').toBe(true)
  }, 60_000)
})

describe('the container check of the .debs across an update', () => {
  const CHECK = join(REPO, 'tests', 'installed', 'upgrades-in-a-container.sh')

  it('8. refuses in words, before it asks to be root, when the newer build is not later by dpkg\'s order or one build is at two versions', async () => {
    // As root the check would go on to install the .debs made here.
    expect(process.getuid?.(), 'this case does not run as root').not.toBe(0)
    const base = aTestDatabaseFolder('debs-stop-versions')
    /** A pair of builds, each an office .deb and a map .deb made by hand, in a folder of its own. */
    const builds = (name: string, older: [string, string], newer: [string, string]): string => {
      const pair = join(base, name)
      for (const [which, [office, map]] of [['older', older], ['newer', newer]] as const) {
        for (const [pkg, version] of [['mole-office', office], ['mole-office-map', map]] as const) {
          const root = join(pair, 'roots', which, pkg)
          mkdirSync(join(root, 'DEBIAN'), { recursive: true })
          writeFileSync(join(root, 'DEBIAN', 'control'), [`Package: ${pkg}`, `Version: ${version}`, 'Architecture: all', 'Maintainer: An invented maintainer', 'Description: An invented package for a test', ''].join('\n'))
          for (const made of [root, join(root, 'DEBIAN')]) chmodSync(made, 0o755)
          mkdirSync(join(pair, which), { recursive: true })
          execFileSync('dpkg-deb', ['--build', '--root-owner-group', root, join(pair, which, `${pkg}-${version}.deb`)], { stdio: 'pipe' })
        }
      }
      return pair
    }
    const theCheck = async (pair: string): Promise<Ran> => run('/usr/bin/bash', [CHECK, '--in', pair, '--out', join(pair, 'out')])

    const same = await theCheck(builds('same', ['0.1.0~beta.9', '0.1.0~beta.9'], ['0.1.0~beta.9', '0.1.0~beta.9']))
    expect(same).toMatchObject({ code: 2, out: 'REFUSED: the older and the newer .debs are both version 0.1.0~beta.9, so nothing here is an update. Give the newer folder a build at a later version. Nothing was done.\n' })
    // As text, beta.9 comes after beta.10. By dpkg's order it comes before.
    const wrong = await theCheck(builds('wrong', ['0.1.0~beta.10', '0.1.0~beta.10'], ['0.1.0~beta.9', '0.1.0~beta.9']))
    expect(wrong).toMatchObject({ code: 2, out: "REFUSED: the newer .debs are version 0.1.0~beta.9, which dpkg puts before the older .debs' 0.1.0~beta.10. Swap the two folders, or give a later build. Nothing was done.\n" })
    const mixed = await theCheck(builds('mixed', ['0.1.0~beta.8', '0.1.0~beta.8'], ['0.1.0~beta.9', '0.1.0~beta.8']))
    expect(mixed).toMatchObject({ code: 2, out: "REFUSED: the newer map's .deb is version 0.1.0~beta.8, and the newer office's .deb is 0.1.0~beta.9. The two .debs of one build must be at one version. Nothing was done.\n" })
    const later = await theCheck(builds('later', ['0.1.0~beta.9', '0.1.0~beta.9'], ['0.1.0~beta.10', '0.1.0~beta.10']))
    expect(later).toMatchObject({
      code: 2,
      out: [
        'The older build is 0.1.0~beta.9: mole-office-0.1.0~beta.9.deb and mole-office-map-0.1.0~beta.9.deb.',
        'The newer build is 0.1.0~beta.10: mole-office-0.1.0~beta.10.deb and mole-office-map-0.1.0~beta.10.deb.',
        'REFUSED: this runs as root in a container made for it, because it installs and removes .debs. Nothing was done.',
        '',
      ].join('\n'),
    })
    for (const name of ['same', 'wrong', 'mixed', 'later']) expect(existsSync(join(base, name, 'out')), `the ${name} check made its out folder`).toBe(false)
  }, 60_000)

  it("9. the terminal check's names are the MOLE_OFFICE_ names the office gives an agent's terminal, and it judges a terminal's names by them", () => {
    const source = readFileSync(join(REPO, 'src', 'server', 'lib', 'terminal-agents.ts'), 'utf8')
    const from = source.indexOf('function theAgentsEnvironment(')
    expect(from, 'src/server/lib/terminal-agents.ts has no theAgentsEnvironment').toBeGreaterThan(-1)
    const given = [...source.slice(from, source.indexOf('\n}\n', from)).matchAll(/\b(MOLE_OFFICE_[A-Z_]+):/g)].map((match) => match[1])
    expect(given).toEqual([...THE_NAMES_THE_TERMINAL_IS_MEANT_TO_HAVE])

    const meant = [...THE_NAMES_THE_TERMINAL_IS_MEANT_TO_HAVE]
    expect(theFindingsAbout(['HOME', 'PATH', 'TERM', ...meant]).map((one) => one.passed)).toEqual([true, true, true])
    expect(theFindingsAbout(['HOME', 'ELECTRON_RUN_AS_NODE', ...meant])[0]).toEqual({
      finding: "the terminal's program starts without ELECTRON_RUN_AS_NODE",
      passed: false,
      saw: 'ELECTRON_RUN_AS_NODE is in its environment',
    })
    expect(theFindingsAbout([...meant, 'MOLE_OFFICE_PORT', 'MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES'])[1]).toEqual({
      finding: "the terminal's program has no MOLE_OFFICE_ variable it was not meant to have",
      passed: false,
      saw: 'it also has MOLE_OFFICE_PORT, MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES',
    })
    expect(theFindingsAbout(['HOME', 'MOLE_OFFICE_API'])[2]).toEqual({
      finding: "the terminal's program has each MOLE_OFFICE_ variable it is meant to have",
      passed: false,
      saw: 'MOLE_OFFICE_WORKSPACE, MOLE_OFFICE_AGENT, MOLE_OFFICE_SESSION are not there',
    })
  })

  it('10. quotes sentences the guide holds, and the new shell scripts read as bash', () => {
    const quoted = [...readFileSync(CHECK, 'utf8').matchAll(/^THE_GUIDE_[A-Z_]+="(.*)"$/gm)].map((match) => String(match[1]).replaceAll('\\`', '`'))
    expect(quoted).toHaveLength(6)
    const guide = readFileSync(join(REPO, 'docs', 'beta', 'for-your-ai.md'), 'utf8').replace(/\s+/g, ' ')
    for (const sentence of quoted) expect(guide, `the guide does not say: ${sentence}`).toContain(sentence)
    for (const script of [CHECK, join(REPO, 'scripts', 'the-debs-stop.sh'), THE_AFTER_REMOVE]) execFileSync('bash', ['-n', script], { stdio: 'pipe' })
  })

  it("12. its judgements that need the server's process number say UNJUDGED, never PASS, when it was not read, and its end counts them", () => {
    const text = readFileSync(CHECK, 'utf8')
    /** One of the check's one-line helpers, or one of its functions, as the check holds it. */
    const theLine = (name: string): string => {
      const line = new RegExp(`^${name}\\(\\) \\{.*\\}$`, 'm').exec(text)?.[0]
      if (line === undefined) throw new Error(`the check has no one-line ${name}`)
      return line
    }
    const theFunction = (name: string): string => {
      const from = text.indexOf(`\n${name}() {\n`)
      if (from < 0) throw new Error(`the check has no function ${name}`)
      return text.slice(from + 1, text.indexOf('\n}\n', from) + 3)
    }
    const base = aTestDatabaseFolder('debs-check-judging')
    const judging = [
      'set -u',
      'FOLDER=/opt/mole-office',
      'OFFICE=$FOLDER/resources/office',
      'failed=0',
      'unjudged=0',
      ...['say', 'pass', 'fail', 'note', 'unjudged'].map(theLine),
      ...['note_the_start', 'judge_the_watch', 'judge_what_runs', 'the_end'].map(theFunction),
    ].join('\n')
    /** Run lines after the check's judging, with a watch's record written first, and say what they printed and how they ended. */
    const judged = (lines: string, record: string[] = []): { out: string[]; code: number | null } => {
      const path = join(base, 'record')
      writeFileSync(path, record.map((line) => `${line}\n`).join(''))
      const ran = spawnSync('/usr/bin/bash', ['-c', `${judging}\nrecord='${path}'\n${lines}`], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin' } })
      expect(ran.stderr, 'the check wrote to stderr').toBe('')
      return { out: ran.stdout.split('\n').filter(Boolean), code: ran.status }
    }
    const never = (lines: string[]): void => expect(lines.filter((line) => line.startsWith('PASS ')), 'a judgement made without the process number passed').toEqual([])

    // With no process number the watch records that, and nothing of the server's end or of its answers.
    const unread = judged('judge_the_watch 3 "$record"; echo "failed=$failed unjudged=$unjudged"', ['server-unread', 'folder-changed 1.5', 'asked-as-the-chunk-went 404'])
    never(unread.out)
    expect(unread.out).toEqual([
      "UNJUDGED 3: could not judge whether the office's server ended before dpkg first changed a file in /opt/mole-office at 1.5, because the server's process number could not be read",
      "UNJUDGED 3: could not judge whether anything answered 500 while the office's server ran, because its process number could not be read, so the watch could not tell when it ran. The plan reviews request made as the older chunk went: 404",
      'failed=0 unjudged=2',
    ])
    // A 500 is a FAIL with or without the number.
    expect(judged('judge_the_watch 3 "$record"; echo "failed=$failed unjudged=$unjudged"', ['server-unread', 'folder-changed 1.5', 'asked-as-the-chunk-went 500']).out).toEqual([
      "UNJUDGED 3: could not judge whether the office's server ended before dpkg first changed a file in /opt/mole-office at 1.5, because the server's process number could not be read",
      'FAIL 3: the office answered 500:       1 asked-as-the-chunk-went 500',
      'failed=1 unjudged=1',
    ])
    // With the number, the judgements are as they were.
    expect(judged('judge_the_watch 3 "$record"; echo "failed=$failed unjudged=$unjudged"', ['answered 200', 'server-ended 1.2', 'folder-changed 1.5']).out).toEqual([
      "PASS 3: the office's server ended at 1.2, before dpkg first changed a file in /opt/mole-office at 1.5",
      'PASS 3: nothing answered 500. While the server ran it answered: 200 (1 times). The plan reviews request made as the older chunk went: not made, because the chunk did not change while the watch ran',
      'failed=0 unjudged=0',
    ])
    expect(judged('judge_the_watch 3 "$record"', ['server-ended 1.7', 'folder-changed 1.5']).out[0]).toBe(
      "FAIL 3: dpkg first changed a file in /opt/mole-office at 1.5, before the office's server ended at 1.7",
    )

    // What runs from the folder: a refused link leaves "nothing" unjudged; something running is a FAIL either way.
    const runs = judged(
      [
        "judge_what_runs 3 'after the update' ', so the office is left stopped' nothing '41 42'",
        "judge_what_runs 3 'after the update' ', so the office is left stopped' nothing ''",
        "judge_what_runs 3b 'after the removal' '' 'process 7 (x) as debuser' '41'",
        'echo "failed=$failed unjudged=$unjudged"',
      ].join('\n'),
    )
    expect(runs.out).toEqual([
      'UNJUDGED 3: could not judge whether anything runs from /opt/mole-office after the update, because the programs of processes 41 42 could not be read',
      'PASS 3: after the update nothing runs from /opt/mole-office, so the office is left stopped',
      'FAIL 3b: after the removal this runs from /opt/mole-office: process 7 (x) as debuser',
      'failed=1 unjudged=1',
    ])

    // The note of the start says the number, or says it was not read and why.
    expect(judged(["note_the_start 3 '686 ' ''", "note_the_start 3 '' '41 42'", "note_the_start 3 '' ''"].join('\n')).out).toEqual([
      "NOTE 3: the office's service started for debuser, as process 686",
      "NOTE 3: the office's service started for debuser, and its server's process number could not be read: the programs of processes 41 42 could not be read, so which of them runs the server cannot be told",
      "NOTE 3: the office's service started for debuser, and its server's process number could not be read: no process from /opt/mole-office has /opt/mole-office/resources/office/server.mjs among its arguments",
    ])

    // The last line and the exit code count what could not be judged.
    expect(judged('unjudged 3: x; unjudged 3: y; the_end')).toEqual({
      out: ['UNJUDGED 3: x', 'UNJUDGED 3: y', '== Done: no finding failed, and 2 could not be judged, so this run does not show that every finding passes'],
      code: 3,
    })
    expect(judged('unjudged 3: x; fail 3: y; the_end')).toEqual({ out: ['UNJUDGED 3: x', 'FAIL 3: y', '== Done: a finding failed, and 1 could not be judged'], code: 1 })
    expect(judged('fail 3: y; the_end')).toEqual({ out: ['FAIL 3: y', '== Done: a finding failed'], code: 1 })
    expect(judged('pass 3: y; the_end')).toEqual({ out: ['PASS 3: y', '== Done: every finding passed'], code: 0 })
  })

  it("13. a start's FAIL names the status and words a health check gave, and says it did not answer only when nothing answered", () => {
    const text = readFileSync(CHECK, 'utf8')
    const base = aTestDatabaseFolder('debs-check-start')
    const health = join(base, 'health')
    const started = (answer: string, mayWait = false): { out: string[]; code: number | null } => {
      writeFileSync(health, answer)
      const lines = [
        'set -u',
        `OUT='${base}'`,
        'FOLDER=/opt/mole-office',
        'OFFICE=$FOLDER/resources/office',
        'failed=0',
        'unjudged=0',
        ...['say', 'pass', 'fail', 'note', 'unjudged'].map((name) => aLineOfTheCheck(text, name)),
        ...['the_answer_line', 'the_body_of', 'the_answer_says_the_update_waits'].map((name) => aLineOfTheCheck(text, name)),
        aFunctionOfTheCheck(text, 'the_start_that_started_nothing'),
        'the_health_answer() { cat "$THE_HEALTH"; }',
        'as_the_user() { return 0; }',
        'the_server() { :; }',
        'the_unread() { :; }',
        'note_the_start() { note "$1: started"; }',
        'sleep() { :; }',
        aFunctionOfTheCheck(text, 'start_the_office'),
        `start_the_office 3${mayWait ? ' may-wait' : ''}`,
        'echo "code=$?"',
      ]
      const ran = spawnSync('/usr/bin/bash', ['-c', lines.join('\n')], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', THE_HEALTH: health } })
      expect(ran.stderr, 'the check wrote to stderr').toBe('')
      const out = ran.stdout.split('\n').filter(Boolean)
      const code = out.find((line) => line.startsWith('code='))
      return { out: out.filter((line) => !line.startsWith('code=')), code: code === undefined ? null : Number(code.slice(5)) }
    }

    const answered = started(
      '503\n{"ok":false,"wrong":["Mole Office is waiting for its owner to back up and update the database /home/debuser/.config/mole-office/data/mole-office.db. Nothing has been written to it."],"updateWaiting":true}',
    )
    expect(answered.code).toBe(1)
    const failed = answered.out.filter((line) => line.startsWith('FAIL '))
    expect(failed).toHaveLength(1)
    expect(failed[0]).toContain('answered 503')
    expect(failed[0]).toContain('Mole Office is waiting for its owner to back up and update the database')
    expect(failed[0]).not.toContain('did not answer')

    const nothing = started('no answer')
    expect(nothing.code).toBe(1)
    expect(nothing.out.filter((line) => line.startsWith('FAIL '))).toEqual([
      "FAIL 3: the office's service started for debuser and did not answer within 30 seconds; see office-starts.log",
    ])

    const waiting = started('503\n{"ok":false,"wrong":["Mole Office is waiting for its owner to back up and update the database."],"updateWaiting":true}', true)
    expect({ code: waiting.code, failed: waiting.out.filter((line) => line.startsWith('FAIL ')) }).toEqual({ code: 2, failed: [] })

    const served = started('200\n{"ok":true,"wrong":[]}')
    expect({ code: served.code, failed: served.out.filter((line) => line.startsWith('FAIL ')) }).toEqual({ code: 0, failed: [] })
  }, 60_000)

  it('14. the check presses Back up and update when the newer office waits, and presses nothing when it does not wait', () => {
    const text = readFileSync(CHECK, 'utf8')
    const base = aTestDatabaseFolder('debs-check-press-branch')
    const calls = join(base, 'calls')
    const after = (started: number): { out: string[]; calls: string } => {
      writeFileSync(calls, '')
      const lines = [
        'set -u',
        'failed=0',
        'unjudged=0',
        ...['say', 'pass', 'fail', 'note'].map((name) => aLineOfTheCheck(text, name)),
        `THE_CALLS='${calls}'`,
        "THE_START_WORDS='Starting Mole Office for the database /home/debuser/.config/mole-office/data/mole-office.db on port 18787: process 2733, in process group 2733.'",
        'press_the_update() { echo press >>"$THE_CALLS"; }',
        'the_plan_reviews_answer() { echo "plan $1" >>"$THE_CALLS"; }',
        aFunctionOfTheCheck(text, 'the_start_that_started_nothing'),
        aFunctionOfTheCheck(text, 'after_the_newer_start'),
        `after_the_newer_start ${String(started)}`,
      ]
      const ran = spawnSync('/usr/bin/bash', ['-c', lines.join('\n')], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin' } })
      expect(ran.stderr, 'the check wrote to stderr').toBe('')
      return { out: ran.stdout.split('\n').filter(Boolean), calls: readFileSync(calls, 'utf8') }
    }

    expect(after(2)).toEqual({ out: [], calls: 'press\n' })
    expect(after(0)).toEqual({
      out: ['NOTE 3: the newer office does not wait for its owner to back up and update the database; nothing was pressed'],
      calls: 'plan 3: the newer office, started as the person would,\n',
    })
  })

  it("15. the press is sent as the office's own user, and a refusal or an office that does not serve afterwards is a FAIL naming what it got", () => {
    const text = readFileSync(CHECK, 'utf8')
    const base = aTestDatabaseFolder('debs-check-press')
    const backup = join(base, 'backups', 'mole-office-2026-11-18-07-00-00-before-the-update.db')
    mkdirSync(join(base, 'backups'))
    writeFileSync(backup, 'a backup')
    const path = (name: string): string => join(base, name)
    const pressed = (answers: { press: string; reading: string; health: string; plan: string }): { out: string[]; asked: string; user: string } => {
      writeFileSync(path('press'), answers.press)
      writeFileSync(path('reading'), answers.reading)
      writeFileSync(path('health'), answers.health)
      writeFileSync(path('plan'), answers.plan)
      writeFileSync(path('asked'), '')
      writeFileSync(path('user'), '')
      const lines = [
        'set -u',
        'failed=0',
        'unjudged=0',
        ...['say', 'pass', 'fail', 'note'].map((name) => aLineOfTheCheck(text, name)),
        ...['the_answer_line', 'the_body_of', 'the_answer_says_the_update_waits', 'the_update_state_in', 'the_backup_named_in'].map((name) => aLineOfTheCheck(text, name)),
        'THE_PRESS_WAITS=5',
        'THE_SERVE_TRIES=3',
        'PLAN_ASK=/api/plans/a-plan-nobody-made/reviews',
        `UHOME='${base}'`,
        'PORT=1',
        'the_answer_from() { printf "%s %s\\n" "$1" "$2" >>"$THE_ASKED"; case "$1 $2" in "POST /api/office/the-update") cat "$THE_PRESS" ;; "GET /api/office/the-update") cat "$THE_READING" ;; *) echo "no answer" ;; esac; }',
        'as_debuser() { printf "%s\\n" "$*" >>"$THE_USER"; "$@"; }',
        'the_health_answer() { cat "$THE_HEALTH"; }',
        'ask() { head -n 1 "$THE_PLAN"; }',
        'sleep() { :; }',
        ...['the_plan_reviews_answer', 'judge_the_backup_named_in', 'wait_for_the_office_to_serve', 'press_the_update', 'ask_as_the_user'].map((name) => aFunctionOfTheCheck(text, name)),
        'press_the_update',
      ]
      const ran = spawnSync('/usr/bin/bash', ['-c', lines.join('\n')], {
        encoding: 'utf8',
        env: {
          PATH: '/usr/bin:/bin',
          THE_PRESS: path('press'),
          THE_READING: path('reading'),
          THE_HEALTH: path('health'),
          THE_PLAN: path('plan'),
          THE_ASKED: path('asked'),
          THE_USER: path('user'),
        },
      })
      expect(ran.stderr, 'the check wrote to stderr').toBe('')
      return { out: ran.stdout.split('\n').filter(Boolean), asked: readFileSync(path('asked'), 'utf8'), user: readFileSync(path('user'), 'utf8') }
    }
    const done = JSON.stringify({
      offer: { file: '/home/debuser/.config/mole-office/data/mole-office.db', backups: join(base, 'backups'), holds: 'one agent', wouldWrite: ['a table'], measuredOn: 'a copy' },
      update: { state: 'done', backup, holdsNow: 'one agent' },
      mayPress: true,
    })
    const waiting = '503\n{"ok":false,"wrong":["Mole Office is waiting for its owner to back up and update the database."],"updateWaiting":true}'

    const accepted = pressed({ press: `200\n${done}`, reading: `200\n${done}`, health: '200\n{"ok":true,"wrong":[]}', plan: '200' })
    expect(accepted.out).toEqual([
      'NOTE 3: the newer office is waiting for its owner to back up and update the database. The check presses Back up and update as the page does, as debuser, whose press the office accepts.',
      'PASS 3: the press answered 200, and the update is done',
      `PASS 3: the press's answer names the backup at ${backup}, and that file is there`,
      'PASS 3: the office serves after the press, and its health check answered 200',
      'PASS 3: the newer office, after the press, answers the plan reviews request with 200',
    ])
    expect(accepted.asked).toBe('POST /api/office/the-update\nGET /api/office/the-update\n')
    expect(accepted.user, 'the press did not go through the office user command').toContain('POST /api/office/the-update')

    const refused = pressed({
      press: '403\n{"error":"Only the owner may back up and update the database.","code":"updateOnlyTheOwner"}',
      reading: '403\n{"error":"Only the owner may back up and update the database.","code":"updateOnlyTheOwner"}',
      health: waiting,
      plan: '503',
    })
    const refusedFails = refused.out.filter((line) => line.startsWith('FAIL '))
    expect(refusedFails).toHaveLength(3)
    expect(refusedFails[0]).toBe('FAIL 3: the press answered 403, and the update is not done: {"error":"Only the owner may back up and update the database.","code":"updateOnlyTheOwner"}')
    expect(refusedFails[1]).toContain('FAIL 3: the office did not serve within 30 seconds after the press; its last health answer was 503')
    expect(refusedFails[2]).toBe('FAIL 3: the newer office, after the press, answers the plan reviews request with 503')
    expect(refused.out.filter((line) => line.startsWith('PASS ')), 'a refused press passed').toEqual([])

    const noServe = pressed({ press: `200\n${done}`, reading: `200\n${done}`, health: waiting, plan: '503' })
    expect(noServe.out).toContain('PASS 3: the press answered 200, and the update is done')
    expect(noServe.out.filter((line) => line.startsWith('FAIL '))).toEqual([
      `FAIL 3: the office did not serve within 30 seconds after the press; its last health answer was 503: {"ok":false,"wrong":["Mole Office is waiting for its owner to back up and update the database."],"updateWaiting":true}`,
      'FAIL 3: the newer office, after the press, answers the plan reviews request with 503',
    ])
  }, 60_000)

  it('16. 3b says in a FAIL that it did not run, and why, when check 3 did not get there', () => {
    const text = readFileSync(CHECK, 'utf8')
    const base = aTestDatabaseFolder('debs-check-3b')
    const calls = join(base, 'calls')
    writeFileSync(calls, '')
    const lines = [
      'set -u',
      'failed=0',
      'unjudged=0',
      ...['say', 'pass', 'fail', 'note', 'unjudged'].map((name) => aLineOfTheCheck(text, name)),
      `THE_CALLS='${calls}'`,
      'under_the_watch() { echo "removal $*" >>"$THE_CALLS"; }',
      aFunctionOfTheCheck(text, 'check_3b'),
      "check_3b 'the older office did not start for debuser'",
      'echo "failed=$failed"',
    ]
    const ran = spawnSync('/usr/bin/bash', ['-c', lines.join('\n')], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin' } })
    expect(ran.stderr, 'the check wrote to stderr').toBe('')
    expect(ran.stdout.split('\n').filter(Boolean)).toEqual([
      '== 3b. A removal under a running office',
      'FAIL 3b: did not run, because the older office did not start for debuser',
      'failed=1',
    ])
    expect(readFileSync(calls, 'utf8'), '3b ran the removal when it said it did not').toBe('')
  })

  /**
   * Run check 3's start and what follows it, with a stand-in for the office's start command and its health check. The
   * start's own words are a file the stand-in writes to the start log; the log may already hold an earlier start.
   */
  const theStartAndWhatFollows = (name: string, earlierLog: string[], startWords: string[]): { out: string[]; calls: string } => {
    const text = readFileSync(CHECK, 'utf8')
    const base = aTestDatabaseFolder(name)
    const calls = join(base, 'calls')
    const log = join(base, 'office-starts.log')
    const words = join(base, 'start-words')
    const health = join(base, 'health')
    writeFileSync(calls, '')
    writeFileSync(log, earlierLog.map((line) => `${line}\n`).join(''))
    writeFileSync(words, startWords.map((line) => `${line}\n`).join(''))
    writeFileSync(health, '200\n{"ok":true,"wrong":[]}')
    const lines = [
      'set -u',
      `OUT='${base}'`,
      'FOLDER=/opt/mole-office',
      'OFFICE=$FOLDER/resources/office',
      'failed=0',
      'unjudged=0',
      ...['say', 'pass', 'fail', 'note', 'unjudged'].map((line) => aLineOfTheCheck(text, line)),
      ...['the_answer_line', 'the_body_of', 'the_answer_says_the_update_waits'].map((line) => aLineOfTheCheck(text, line)),
      `THE_START_WORDS_FILE='${words}'`,
      `THE_HEALTH_FILE='${health}'`,
      `THE_CALLS='${calls}'`,
      'as_the_user() { cat "$THE_START_WORDS_FILE"; }',
      'the_health_answer() { cat "$THE_HEALTH_FILE"; }',
      'the_server() { :; }',
      'the_unread() { :; }',
      'note_the_start() { :; }',
      'sleep() { :; }',
      'press_the_update() { echo press >>"$THE_CALLS"; }',
      'the_plan_reviews_answer() { echo "plan $1" >>"$THE_CALLS"; }',
      aFunctionOfTheCheck(text, 'the_start_that_started_nothing'),
      aFunctionOfTheCheck(text, 'start_the_office'),
      aFunctionOfTheCheck(text, 'after_the_newer_start'),
      'start_the_office 3 may-wait',
      'started=$?',
      'after_the_newer_start "$started"',
    ]
    const ran = spawnSync('/usr/bin/bash', ['-c', lines.join('\n')], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin' } })
    expect(ran.stderr, 'the check wrote to stderr').toBe('')
    return { out: ran.stdout.split('\n').filter(Boolean), calls: readFileSync(calls, 'utf8') }
  }

  it('17. a start after the update that started nothing is one FAIL quoting the office that was still running, and the plan reviews are asked of that office', () => {
    const words = [
      'Mole Office is already running: process 723 serves the database /home/debuser/.config/mole-office/data/mole-office.db on http://127.0.0.1:18787, since 2026-11-18T09:36:17.380Z.',
      'Nothing was started.',
    ]
    const ran = theStartAndWhatFollows('debs-check-start-still-running', [], words)
    expect(ran.out).toEqual([
      `FAIL 3: the start after the update started nothing, because an office that ran before the update was still running: ${words[0]}`,
    ])
    expect(ran.out.join('\n'), 'a line called the office the newer office').not.toContain('the newer office')
    expect(ran.calls, 'the still-running path pressed or asked the plan reviews of another office').toBe('plan 3: the office that was still running\n')
  })

  it("18. an older start's already-running words in the log do not count, so this start's own words are the started path", () => {
    const olderWords = [
      'Mole Office is already running: process 193 serves the database /home/debuser/.config/mole-office/data/mole-office.db on http://127.0.0.1:18787, since 2026-11-18T09:30:00.000Z.',
      'Nothing was started.',
    ]
    const startedWords = [
      'The terminal holder is process 2733, in process group 2733. It keeps running when the server restarts, and the stop command ends it.',
      'Starting Mole Office for the database /home/debuser/.config/mole-office/data/mole-office.db on port 18787: process 2733, in process group 2733.',
    ]
    const ran = theStartAndWhatFollows('debs-check-start-older-words', olderWords, startedWords)
    expect(ran.out).toEqual(['NOTE 3: the newer office does not wait for its owner to back up and update the database; nothing was pressed'])
    expect(ran.out.join('\n'), 'the note gives a cause the check did not see').not.toContain('because')
    expect(ran.calls).toBe('plan 3: the newer office, started as the person would,\n')
  })

  /**
   * Run a start with the check's own note of a start, and what follows it when the start may wait, with stand-ins for
   * the office's start command, its health check, and the processes a note reads. The start's own words are a file the
   * stand-in writes to the start log.
   */
  const theStartWithTheChecksNote = (
    name: string,
    what: string,
    startWords: string[],
    mayWait: boolean,
    server: string,
    unread: string,
    healthAnswer = '200\n{"ok":true,"wrong":[]}',
    tries = 60,
  ): { out: string[]; code: number | null; calls: string } => {
    const text = readFileSync(CHECK, 'utf8')
    const base = aTestDatabaseFolder(name)
    const calls = join(base, 'calls')
    const log = join(base, 'office-starts.log')
    const words = join(base, 'start-words')
    const health = join(base, 'health')
    writeFileSync(calls, '')
    writeFileSync(log, '')
    writeFileSync(words, startWords.map((line) => `${line}\n`).join(''))
    writeFileSync(health, healthAnswer)
    const lines = [
      'set -u',
      `OUT='${base}'`,
      'FOLDER=/opt/mole-office',
      'OFFICE=$FOLDER/resources/office',
      'failed=0',
      'unjudged=0',
      ...['say', 'pass', 'fail', 'note', 'unjudged'].map((line) => aLineOfTheCheck(text, line)),
      ...['the_answer_line', 'the_body_of', 'the_answer_says_the_update_waits'].map((line) => aLineOfTheCheck(text, line)),
      `THE_START_WORDS_FILE='${words}'`,
      `THE_HEALTH_FILE='${health}'`,
      `THE_CALLS='${calls}'`,
      `THE_SERVER='${server}'`,
      `THE_UNREAD='${unread}'`,
      `THE_START_TRIES='${String(tries)}'`,
      'as_the_user() { cat "$THE_START_WORDS_FILE"; }',
      'the_health_answer() { cat "$THE_HEALTH_FILE"; }',
      'the_server() { printf "%s" "$THE_SERVER"; }',
      'the_unread() { printf "%s" "$THE_UNREAD"; }',
      'sleep() { :; }',
      'press_the_update() { echo press >>"$THE_CALLS"; }',
      'the_plan_reviews_answer() { echo "plan $1" >>"$THE_CALLS"; }',
      ...['the_start_that_started_nothing', 'note_the_start', 'start_the_office', 'after_the_newer_start'].map((name) => aFunctionOfTheCheck(text, name)),
      `start_the_office ${what}${mayWait ? ' may-wait' : ''}`,
      'started=$?',
      'echo "code=$started"',
      ...(mayWait ? ['after_the_newer_start "$started"'] : []),
    ]
    const ran = spawnSync('/usr/bin/bash', ['-c', lines.join('\n')], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin' } })
    expect(ran.stderr, 'the check wrote to stderr').toBe('')
    const out = ran.stdout.split('\n').filter(Boolean)
    const code = out.find((line) => line.startsWith('code='))
    return {
      out: out.filter((line) => !line.startsWith('code=')),
      code: code === undefined ? null : Number(code.slice(5)),
      calls: readFileSync(calls, 'utf8'),
    }
  }

  it('19. a start after the update that started nothing notes no start, and its only line is the FAIL naming the office that was still running', () => {
    const words = [
      'Mole Office is already running: process 727 serves the database /home/debuser/.config/mole-office/data/mole-office.db on http://127.0.0.1:18787, since 2026-11-18T10:22:05.760Z.',
      'Nothing was started.',
    ]
    const ran = theStartWithTheChecksNote('debs-check-start-note-still-running', '3', words, true, '', '716 727 745')
    expect(ran.code, 'a start that started nothing did not return the started path').toBe(0)
    expect(ran.out).toEqual([`FAIL 3: the start after the update started nothing, because an office that ran before the update was still running: ${words[0]}`])
    expect(ran.out.join('\n'), "a line said the office's service started").not.toContain('started for debuser')
    expect(ran.calls, 'the still-running path pressed or asked the plan reviews of another office').toBe('plan 3: the office that was still running\n')
  })

  it("20. a start after the update that started notes its start, word for word, before the note that nothing was pressed", () => {
    const words = [
      'The terminal holder is process 2733, in process group 2733. It keeps running when the server restarts, and the stop command ends it.',
      'Starting Mole Office for the database /home/debuser/.config/mole-office/data/mole-office.db on port 18787: process 2733, in process group 2733.',
    ]
    const ran = theStartWithTheChecksNote('debs-check-start-note-started', '3', words, true, '686 ', '')
    expect(ran.code).toBe(0)
    expect(ran.out).toEqual([
      "NOTE 3: the office's service started for debuser, as process 686",
      'NOTE 3: the newer office does not wait for its owner to back up and update the database; nothing was pressed',
    ])
    expect(ran.calls).toBe('plan 3: the newer office, started as the person would,\n')
  })

  it('21. a start without may-wait that started nothing notes no start, is one FAIL quoting it, and returns 1', () => {
    const words = [
      'Mole Office is already running: process 727 serves the database /home/debuser/.config/mole-office/data/mole-office.db on http://127.0.0.1:18787, since 2026-11-18T10:22:05.760Z.',
      'Nothing was started.',
    ]
    const ran = theStartWithTheChecksNote('debs-check-start-note-not-may-wait', '1', words, false, '', '716 727 745')
    expect(ran.code, 'a start that started nothing went on as though it had started').toBe(1)
    expect(ran.out).toEqual([`FAIL 1: the office's service did not start for debuser, because an office was already running and nothing was started: ${words[0]}`])
    expect(ran.out.join('\n'), "a line said the office's service started").not.toContain('started for debuser')
    expect(ran.calls).toBe('')
  })

  it('22. a start that started nothing says so before the health check, whatever the health check answers', () => {
    const words = [
      'Mole Office is already running: process 727 serves the database /home/debuser/.config/mole-office/data/mole-office.db on http://127.0.0.1:18787, since 2026-11-18T10:22:05.760Z.',
      'Nothing was started.',
    ]
    const neverServes = '503\n{"ok":false,"wrong":["Mole Office is not ready."]}'
    const plain = theStartWithTheChecksNote('debs-check-start-nothing-before-health', '1', words, false, '', '716 727 745', neverServes, 2)
    expect(plain.code, 'a start that started nothing waited for a health check it cannot get').toBe(1)
    expect(plain.out).toEqual([`FAIL 1: the office's service did not start for debuser, because an office was already running and nothing was started: ${words[0]}`])
    expect(plain.out.join('\n'), "a timed-out health check said the office's service started").not.toContain('started for debuser')

    const waiting = theStartWithTheChecksNote('debs-check-start-nothing-before-health-may-wait', '3', words, true, '', '716 727 745', neverServes, 2)
    expect(waiting.code, 'a may-wait start that started nothing did not return the started path').toBe(0)
    expect(waiting.out).toEqual([`FAIL 3: the start after the update started nothing, because an office that ran before the update was still running: ${words[0]}`])
    expect(waiting.out.join('\n'), "a may-wait health check said the office's service started").not.toContain('started for debuser')
    expect(waiting.calls, 'a start that started nothing pressed the update').toBe('plan 3: the office that was still running\n')
  })
})
