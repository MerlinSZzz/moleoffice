// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MOLE-OFFICE-DEV SANDBOX IS KEPT RUNNING BY A COMMAND THAT WORK INSIDE IT CANNOT END, AND THAT SAYS WHY IT ENDED.
 *
 * On 15 October 2026 a line sandbox container ended with exit 0, and a run stayed "running" in it for six hours. The
 * container was kept running by the devcontainer CLI's own command, a shell that exits 0 on SIGTERM, under docker's
 * init, all as uid 1000. Any process of uid 1000 inside could end the container that way without a word. That this is
 * what happened is likely, not proven.
 *
 * The template now asks for no docker init and keeps the image's own command, sandboxes/mole-office-dev/keep-alive,
 * which becomes the container's first process (pid 1 inside it). This file proves two things:
 *   1. the template says so: devcontainer.json says "init": false and "overrideCommand": false and runs as uid 1000,
 *      and the image's one CMD is the keep-alive, copied into the dev stage, with no ENTRYPOINT anywhere;
 *   2. the keep-alive, run here as an ordinary process, refuses every signal it handles that came from a process it can
 *      see, including one whose sender pid was forged as 0, writes each refusal with the sender's pid, uid and code, and
 *      goes on running. The kernel refuses to let a process forge the code a real kill carries. Only SIGKILL to its own
 *      pid ends it here, which pid 1 inside a container does not get from inside.
 * That it obeys docker stop's SIGTERM, which comes from outside the container with pid 0, needs a real container.
 * tools/keep-alive-proof.mjs shows that on the host, and shows the container surviving `kill -TERM -1` from inside.
 *
 * WHAT GOES RED. Control run first. Say "init": true in devcontainer.json and case 1 goes red. Make the keep-alive obey a
 * signal whatever its sender (drop the pid and code test in on_signal) and case 2 goes red at the first SIGTERM. Drop
 * only the code test and case 2 goes red at the forged pid 0.
 *
 * The forged signal is sent with rt_sigqueueinfo through perl's `syscall`, whose number is the kernel's for this
 * architecture. On an architecture this file does not know, case 2 fails and says so.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const TEMPLATE = join(import.meta.dirname, '..', 'sandboxes', 'mole-office-dev')
const KEEP_ALIVE = join(TEMPLATE, 'keep-alive')
const IN_THE_IMAGE = '/usr/local/lib/mole-office/keep-alive'
const HANDLED = ['TERM', 'INT', 'HUP', 'QUIT', 'USR1', 'USR2'] as const

/** The kernel's number for rt_sigqueueinfo on this architecture. */
function rtSigqueueinfo(): number {
  if (process.arch === 'x64') return 129
  if (process.arch === 'arm64') return 138
  throw new Error(`this test knows rt_sigqueueinfo's number on x64 and arm64 only, and this is ${process.arch}`)
}

/**
 * SENDS SIGTERM TO `pid` WITH A SENDER OF ITS OWN CHOOSING: pid 0, this process's uid, and `code`. A negative code is
 * what sigqueue sends (SI_QUEUE is -1). Code 0 is what a real kill carries (SI_USER), and the kernel refuses it from a
 * process to another. Says "sent", or "refused <errno>".
 */
function forgeATerm(pid: number, code: number): string {
  const script =
    'my ($nr, $pid, $code) = @ARGV; ' +
    'my $info = pack("iiiiiI", 15, 0, $code, 0, 0, $<) . ("\\0" x 104); ' +
    'my $r = syscall($nr + 0, $pid + 0, 15, $info); ' +
    'print $r == -1 ? "refused " . ($! + 0) : "sent";'
  const ran = spawnSync('/usr/bin/perl', ['-e', script, String(rtSigqueueinfo()), String(pid), String(code)], { encoding: 'utf8' })
  if (ran.status !== 0) throw new Error(`perl could not forge the signal: exit ${String(ran.status)}, ${ran.stderr}`)
  return ran.stdout
}

let running: ChildProcess | null = null

afterEach(() => {
  // ONLY ITS OWN PID, and only with SIGKILL, which is the one signal it does not handle.
  if (running !== null && running.exitCode === null && running.signalCode === null && running.pid !== undefined) running.kill('SIGKILL')
  running = null
})

/** Starts the keep-alive as a child of this test and collects what it writes. */
function startTheKeepAlive(): { child: ChildProcess; pid: number; said: () => string; waitFor: (line: string) => Promise<void> } {
  const child = spawn(KEEP_ALIVE, [], { stdio: ['ignore', 'pipe', 'pipe'] })
  running = child
  let out = ''
  child.stdout?.on('data', (chunk: Buffer) => (out += chunk.toString('utf8')))
  child.stderr?.on('data', (chunk: Buffer) => (out += chunk.toString('utf8')))
  if (child.pid === undefined) throw new Error('the keep-alive did not start')
  const waitFor = async (line: string): Promise<void> => {
    const deadline = Date.now() + 10_000
    while (!out.includes(line)) {
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(`the keep-alive ended (${String(child.exitCode ?? child.signalCode)}) before it said "${line}". It said:\n${out}`)
      if (Date.now() > deadline) throw new Error(`the keep-alive did not say "${line}" within 10 s. It said:\n${out}`)
      await new Promise((ok) => setTimeout(ok, 20))
    }
  }
  return { child, pid: child.pid, said: () => out, waitFor }
}

function stillRunning(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null
}

describe('the mole-office-dev template', () => {
  it('asks for no docker init, keeps the image\'s command, and runs it as uid 1000', () => {
    const config = JSON.parse(readFileSync(join(TEMPLATE, 'devcontainer.json'), 'utf8')) as Record<string, unknown>
    expect(config['init']).toBe(false)
    expect(config['overrideCommand']).toBe(false)
    expect(config['containerUser']).toBe('1000:1000')
  })

  it('makes the keep-alive the image\'s one command, copied into the dev stage, with no entrypoint anywhere', () => {
    const dockerfile = readFileSync(join(TEMPLATE, 'Dockerfile'), 'utf8')
    const lines = dockerfile.split('\n')
    const stages = dockerfile.split(/^(?=FROM )/m).filter((one) => one.startsWith('FROM '))
    const dev = stages.find((one) => /^FROM \S+ AS mole-office-dev$/m.test(one.split('\n')[0] ?? ''))
    expect(dev, 'the stage named mole-office-dev').toBeDefined()
    expect(dev?.split('\n')).toEqual(expect.arrayContaining([`COPY keep-alive ${IN_THE_IMAGE}`, `CMD ["${IN_THE_IMAGE}"]`]))
    expect(lines.filter((line) => /^CMD\b/.test(line))).toEqual([`CMD ["${IN_THE_IMAGE}"]`])
    expect(lines.filter((line) => /^ENTRYPOINT\b/.test(line))).toEqual([])
    expect(statSync(KEEP_ALIVE).mode & 0o111, 'the keep-alive is executable').not.toBe(0)
    expect(readFileSync(KEEP_ALIVE, 'utf8').split('\n')[0]).toBe('#!/usr/bin/perl')
  })
})

describe('the keep-alive', () => {
  it('refuses every signal it handles from a process it can see, writes each refusal, and goes on running', async () => {
    const uid = process.getuid?.()
    if (uid === undefined) throw new Error('this test needs a uid to compare, and this platform has none')
    const { child, pid, said, waitFor } = startTheKeepAlive()
    await waitFor(`keep-alive: started as pid ${String(pid)}, uid ${String(uid)}`)
    await waitFor("keep-alive: is not the container's first process, so a SIGKILL from inside can end it")

    for (const name of HANDLED) {
      process.kill(pid, `SIG${name}`)
      await waitFor(`keep-alive: refused SIG${name} from pid ${String(process.pid)} (uid ${String(uid)}, code 0), sent from inside the container; it goes on running`)
      expect(stillRunning(child), `still running after SIG${name}`).toBe(true)
    }

    // A SENDER OF PID 0 IS WHAT A SIGNAL FROM OUTSIDE THE CONTAINER CARRIES. Forged from here it carries SI_QUEUE.
    expect(forgeATerm(pid, -1)).toBe('sent')
    await waitFor(`keep-alive: refused SIGTERM from pid 0 (uid ${String(uid)}, code -1), sent from inside the container; it goes on running`)
    expect(stillRunning(child)).toBe(true)
    // AND THE KERNEL WILL NOT LET IT CARRY SI_USER: EPERM, 1.
    expect(forgeATerm(pid, 0)).toBe('refused 1')

    expect(said()).not.toContain('so the container ends now')
    expect(stillRunning(child)).toBe(true)

    const ended = new Promise<NodeJS.Signals | null>((ok) => child.once('exit', (_code, signal) => ok(signal)))
    child.kill('SIGKILL')
    expect(await ended).toBe('SIGKILL')
  })
})
