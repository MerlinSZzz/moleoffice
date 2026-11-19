// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ON A MAC, ONLY THE INSTALLED WINDOW'S OWN HELPER COUNTS AS THE PERSON'S PROGRAM, AND EVERY OTHER SENDER IS REFUSED.
 *
 * Wave 13t round 22, piece 2. The Mac Codex's commit "Recognise the installed Mac window when naming the owner" gave
 * the macOS probe a `senderOfAConnection`: inside the installed app, a connection counts as one of this computer's own
 * programs only when both ends are loopback, lsof finds exactly one process holding that exact socket, it runs as this
 * server's user, its program file is the app's own helper, its parent's program file is the app's own main program,
 * and a second look finds the same. Every other answer is "a program Mole Office could not find", which is not the person
 * (src/server/lib/from-a-sandbox.ts), so the first-run name and the pairing press are refused to it.
 *
 * WHAT IS HELD HERE, with `process.platform` stood in as darwin, the real macOS process reader
 * (src/config/process-reader.mjs) over a `ps` and an `lsof` made of text in the formats tests/fixtures/macos/ documents,
 * and the question asked through `whoSentItFromThisComputer`, which is what the doors ask. Each refusal case makes every
 * fact match the window but one, so each refusal is held by its own case:
 *
 *   R1 the far end is another computer's address;    R2 the port is no port;
 *   R3 lsof exited 1 though it printed the socket;   R4 two processes hold the socket;
 *   R5 the holder runs as another user;              R6 the holder's program is not the app's helper;
 *   R7 the holder's parent is not the app's program; R8 the holder's parent changed between two reads;
 *   R9 the second look finds the socket gone;        R10 the office runs from a checkout or a loose bundle.
 *
 * THE MUTATIONS, each run after a control, in src/server/lib/darwin-probe.ts:
 *   M-R1  drop the loopback line (`every((one) => one === '127.0.0.1' || one === '::1')`) → R1 red.
 *   M-R2  drop the port line → R2 red.
 *   M-R3  `if (!did.ran || did.status !== 0) return null` → `if (!did.ran) return null` → R3 red.
 *   M-R4  `matches.length !== 1` → `matches.length < 1` → R4 red.
 *   M-R5  `uid !== process.getuid?.()` → `false` → R5 red.
 *   M-R6  drop the helper line → R6 red.
 *   M-R7  drop the parent's program from the parent line → R7 red.
 *   M-R8  drop the line that reads the parent again → R8 red.
 *   M-R9  the second look's `return null` → `void 0`, so it is asked and not heeded → R9 red.
 *   M-R10 the layout condition in the constructor → `install.from === 'bundle'` → R10 red.
 *
 * WHAT IT DOES NOT PROVE: that a real Mac's lsof and ps print these lines, that Electron's network helper is the
 * process holding the window's socket, or that no other program of the same user can be the helper. Those need the owner's Mac;
 * the round's report says what to try there.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

type WhatACommandDid = import('../src/server/lib/darwin-probe.ts').WhatACommandDid
type BorrowedByTheMac = import('../src/server/lib/darwin-probe.ts').BorrowedByTheMac
type OsProbe = import('../src/server/lib/resources.ts').OsProbe

const CONTENTS = '/Applications/Mole Office.app/Contents'
const INSTALLED = { from: 'bundle' as const, root: `${CONTENTS}/Resources/office` }
const HELPER = `${CONTENTS}/Frameworks/Mole Office Helper.app/Contents/MacOS/Mole Office Helper`
const MAIN = `${CONTENTS}/MacOS/Mole Office`
const PS = '-o pid=,ppid=,pgid=,stat=,lstart=,command='
const UID = process.getuid!()
/** The helper is 42, the window's main program 41, this server 4242; the window's socket is 60001, the server's 8787. */
const WINDOW = { address: '::ffff:127.0.0.1', port: 60001 }
const SERVER = { address: '127.0.0.1', port: 8787 }

type Answer = { ran: true; status: number; stdout: string; stderr: string } | { ran: false; reason: string }
const said = (stdout: string): Answer => ({ ran: true, status: 0, stdout, stderr: '' })
const NOTHING_MATCHED: Answer = { ran: true, status: 1, stdout: '', stderr: '' }

/** What lsof -F prints for one process holding one TCP socket. */
const holding = (pid: number, uid: number, name: string): string => `p${String(pid)}\nu${String(uid)}\nf23\ntIPv4\nn${name}\n`
/** What lsof -d txt -Fn prints for a process: its program file first, then the loader. */
const programFile = (pid: number, path: string): Answer => said(`p${String(pid)}\nftxt\nn${path}\nftxt\nn/usr/lib/dyld\n`)
/** What ps prints for one process, in the columns the macOS reader asks. */
const psRow = (pid: number, ppid: number, command: string): Answer =>
  said(` ${String(pid)} ${String(ppid)} ${String(ppid)} S    Wed Sep 30 09:14:07 2026     ${command}\n`)

/**
 * The text machine for the window, as it is when every fact matches. A case changes one answer. An answer that is a
 * list is given in order, one per call, for a fact that changes between two reads.
 */
function theWindow(peer = WINDOW, ours = SERVER): Record<string, Answer | Answer[]> {
  const bare = (one: string) => (one.startsWith('::ffff:') ? one.slice(7) : one)
  const connection = `${bare(peer.address)}:${String(peer.port)}->${bare(ours.address)}:${String(ours.port)}`
  const port = String(peer.port)
  return {
    // THE SERVER'S OWN END of the same connection is listed too, as lsof lists every holder of the port; its name is the
    // other way round, so only the window's end matches.
    [`lsof -nP -a -iTCP:${port} -sTCP:ESTABLISHED -Fpuftn`]: said(holding(42, UID, connection) + holding(4242, UID, `${bare(ours.address)}:${String(ours.port)}->${bare(peer.address)}:${port}`)),
    [`lsof -nP -a -p 42 -iTCP:${port} -sTCP:ESTABLISHED -Fpuftn`]: said(holding(42, UID, connection)),
    'lsof -a -p 42 -d txt -Fn': programFile(42, HELPER),
    'lsof -a -p 41 -d txt -Fn': programFile(41, MAIN),
    [`ps ${PS} -p 42`]: psRow(42, 41, `${HELPER} --type=utility --utility-sub-type=network.mojom.NetworkService`),
  }
}

let t: TestDb
let res: typeof import('../src/server/lib/resources.ts')
let mac: typeof import('../src/server/lib/darwin-probe.ts')
let reading: typeof import('../src/config/process-reader.mjs')
let sandbox: typeof import('../src/server/lib/from-a-sandbox.ts')
let before: OsProbe

beforeAll(async () => {
  // Imported after freshDb, because importing lib/resources.ts opens the database it points at.
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  mac = await import('../src/server/lib/darwin-probe.ts')
  reading = await import('../src/config/process-reader.mjs')
  sandbox = await import('../src/server/lib/from-a-sandbox.ts')
  before = res.osProbe()
}, 120_000)

afterEach(() => {
  // Put the probe stand-in back, so the next case starts where this one found the office.
  res.useOsProbe(before)
})

afterAll(() => {
  t.close()
})

/** Run `fn` with process.platform reading darwin, and put the real one back. */
function onDarwin<T>(fn: () => T): T {
  const real = Object.getOwnPropertyDescriptor(process, 'platform')
  if (real === undefined) throw new Error('process.platform has no descriptor to put back')
  Object.defineProperty(process, 'platform', { value: 'darwin' })
  try {
    return fn()
  } finally {
    Object.defineProperty(process, 'platform', real)
  }
}

/**
 * Ask, on darwin, who sent a request on the connection from `peer` to `ours`, with the probe built over `answers` for the
 * install given. Answers the probe's own answer and the doors' verdict.
 */
function ask(answers: Record<string, Answer | Answer[]>, peer = WINDOW, ours = SERVER, install: { from: 'bundle' | 'checkout'; root: string } = INSTALLED) {
  // EACH ASKING HAS A MACHINE OF ITS OWN, so the answers given in order (R8) start again for the second.
  const aProbe = () => {
    const given = new Map(Object.entries(answers).map(([key, one]) => [key, Array.isArray(one) ? [...one] : one]))
    const answer = (name: string, args: readonly string[]): WhatACommandDid => {
      const key = `${name} ${args.join(' ')}`
      const found = given.get(key)
      if (found === undefined) throw new Error(`the test machine was asked something it has no answer for: ${key}`)
      const one = Array.isArray(found) ? found.shift() : found
      if (one === undefined) throw new Error(`the test machine was asked ${key} more often than it has answers`)
      return { command: name, ...one }
    }
    const reader = reading.darwinProcessReader({ ps: (args) => answer('ps', args), lsof: (args) => answer('lsof', args) })
    return new mac.DarwinProbe({} as BorrowedByTheMac, reader, install)
  }
  return onDarwin(() => {
    res.useOsProbe(aProbe())
    // A new socket each time, so no answer kept on an earlier one is read.
    const socket = { remoteAddress: peer.address, remotePort: peer.port, localAddress: ours.address, localPort: ours.port }
    const verdict = sandbox.whoSentItFromThisComputer({ socket } as never)
    const probe = aProbe()
    let sender: unknown = 'the probe has no question'
    if (probe.senderOfAConnection !== undefined) {
      try {
        sender = probe.senderOfAConnection(peer, ours)
      } catch (why) {
        sender = `the probe threw: ${String(why)}`
      }
    }
    return { sender, verdict }
  })
}

const NOT_FOUND = 'a program Mole Office could not find'

describe('the installed window on a Mac', () => {
  it('counts as one of this computer\'s own programs when every fact matches (the control for every case below)', () => {
    const { sender, verdict } = ask(theWindow())
    expect(sender).toEqual({ uid: UID, pid: 42, inAnotherContainer: false })
    expect(verdict).toBe(sandbox.THEIR_OWN_PROGRAM)
  })
})

describe('every other sender is refused, one fact at a time', () => {
  it('R1: a far end on another computer, everything else matching', () => {
    // Both addresses are invented, and built from their numbers because the address scan refuses one written out.
    const elsewhere = { address: [100, 101, 7, 31].join('.'), port: 60001 }
    const ours = { address: [100, 101, 7, 2].join('.'), port: 8787 }
    const { sender, verdict } = ask(theWindow(elsewhere, ours), elsewhere, ours)
    expect(sender).toBeNull()
    expect(verdict).toBe(NOT_FOUND)
  })

  it('R2: a port that is no port, everything else matching', () => {
    const noPort = { address: '127.0.0.1', port: 70000 }
    const { sender, verdict } = ask(theWindow(noPort), noPort)
    expect(sender).toBeNull()
    expect(verdict).toBe(NOT_FOUND)
  })

  it('R3: lsof exits 1, though it printed the socket', () => {
    const answers = theWindow()
    const key = `lsof -nP -a -iTCP:60001 -sTCP:ESTABLISHED -Fpuftn`
    answers[key] = { ...(answers[key] as Answer & { ran: true }), status: 1, stderr: 'lsof: WARNING: can\'t stat() a file system' }
    const { sender, verdict } = ask(answers)
    expect(sender).toBeNull()
    expect(verdict).toBe(NOT_FOUND)
  })

  it('R4: two processes hold the same socket', () => {
    const answers = theWindow()
    const key = `lsof -nP -a -iTCP:60001 -sTCP:ESTABLISHED -Fpuftn`
    answers[key] = said(holding(42, UID, '127.0.0.1:60001->127.0.0.1:8787') + holding(43, UID, '127.0.0.1:60001->127.0.0.1:8787'))
    const { sender, verdict } = ask(answers)
    expect(sender).toBeNull()
    expect(verdict).toBe(NOT_FOUND)
  })

  it('R5: the holder runs as another user, and as no user lsof names', () => {
    for (const uidLine of [`u${String(UID + 1)}\n`, '']) {
      const answers = theWindow()
      for (const key of [`lsof -nP -a -iTCP:60001 -sTCP:ESTABLISHED -Fpuftn`, `lsof -nP -a -p 42 -iTCP:60001 -sTCP:ESTABLISHED -Fpuftn`]) {
        const was = answers[key] as Answer & { ran: true }
        answers[key] = said(was.stdout.replace(`p42\nu${String(UID)}\n`, `p42\n${uidLine}`))
      }
      const { sender, verdict } = ask(answers)
      expect(sender, uidLine).toBeNull()
      expect(verdict, uidLine).toBe(NOT_FOUND)
    }
  })

  it('R6: the holder is another program, or the helper of another copy of the app', () => {
    for (const path of ['/Applications/Docker.app/Contents/MacOS/com.docker.backend', `/srv/someone/Downloads/Mole Office.app/Contents/Frameworks/Mole Office Helper.app/Contents/MacOS/Mole Office Helper`]) {
      const { sender, verdict } = ask({ ...theWindow(), 'lsof -a -p 42 -d txt -Fn': programFile(42, path) })
      expect(sender, path).toBeNull()
      expect(verdict, path).toBe(NOT_FOUND)
    }
  })

  it("R7: the holder's parent is another program", () => {
    const { sender, verdict } = ask({ ...theWindow(), 'lsof -a -p 41 -d txt -Fn': programFile(41, '/bin/zsh') })
    expect(sender).toBeNull()
    expect(verdict).toBe(NOT_FOUND)
  })

  it("R8: the holder's parent changes between the two reads", () => {
    const helperRow = theWindow()[`ps ${PS} -p 42`] as Answer
    const { sender, verdict } = ask({ ...theWindow(), [`ps ${PS} -p 42`]: [helperRow, psRow(42, 1, HELPER), psRow(42, 1, HELPER)] })
    expect(sender).toBeNull()
    expect(verdict).toBe(NOT_FOUND)
  })

  it('R9: the second look finds the socket gone', () => {
    const { sender, verdict } = ask({ ...theWindow(), 'lsof -nP -a -p 42 -iTCP:60001 -sTCP:ESTABLISHED -Fpuftn': NOTHING_MATCHED })
    expect(sender).toBeNull()
    expect(verdict).toBe(NOT_FOUND)
  })

  it('R10: the office runs from a checkout, or from a bundle that is not inside an app', () => {
    for (const install of [{ from: 'checkout' as const, root: INSTALLED.root }, { from: 'bundle' as const, root: '/srv/someone/office' }]) {
      const { sender, verdict } = ask(theWindow(), WINDOW, SERVER, install)
      expect(sender, install.root).toBe('the probe has no question')
      expect(verdict, install.root).toBe(NOT_FOUND)
    }
  })
})
