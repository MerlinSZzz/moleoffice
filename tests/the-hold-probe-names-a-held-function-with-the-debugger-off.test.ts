// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HOLD PROBE NAMES THE FUNCTION THAT HELD THE THREAD WITHOUT TURNING THE MAIN THREAD'S DEBUGGER ON.
 * Wave 13y round 169.
 *
 * MEASURED FIRST, on 17 November 2026: tests/workspace-move.test.ts alone, with a measuring patch that was never
 * committed. Cases 2 to 30 took 119.0 s with the probe as it was (2.3 to 5.9 s a case), 15.8 s with the probe not
 * started, and 16.3 s with its worker connected to the main thread but the debugger never enabled. Enabling the
 * debugger makes V8 report every script already loaded, and every script compiled after, with its source map; every
 * case of that file builds a new server, so every case paid it again. While the debugger was on, a `debugger;`
 * statement also stopped the thread.
 *
 * WHAT THIS HOLDS: the probe's worker asks the inspector for no Debugger method, at its start or during a hold, and the
 * sample it takes during a 1.3 s hold still names the function that held the thread. A stand-in for node's Worker runs
 * the probe's own worker code, with a few lines before it that pass back each method the worker asks the inspector
 * for. They pass it on a channel of their own, so the probe's own handler never sees those messages.
 *
 * CONTROL: at 3eb980386 the first expectation fails, because the worker asks for Debugger.enable at its start.
 * MUTATION: the worker asks for Debugger.enable at its start again: red.
 */
import { afterAll, expect, it, vi } from 'vitest'
import { aProbeOfTheMainThread, theSampleDuring } from '../src/server/lib/a-probe-of-the-main-thread.ts'

const recorded = vi.hoisted(() => ({ channel: 'the hold probe recorder', asked: [] as string[], started: false, exited: false }))

vi.mock('node:worker_threads', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:worker_threads')>()
  // BEFORE THE PROBE'S CODE, each method its worker asks the inspector for is passed back; AFTER IT, that it has run.
  const before = `const theRecorder = new BroadcastChannel(${JSON.stringify(recorded.channel)}); { const { Session } = require('node:inspector'); const post = Session.prototype.post; Session.prototype.post = function (method, ...rest) { theRecorder.postMessage({ asked: method }); return post.call(this, method, ...rest) } }\n`
  const after = '\ntheRecorder.postMessage({ started: true })\n'
  class Worker extends real.Worker {
    constructor(code: string, options: ConstructorParameters<typeof real.Worker>[1]) {
      super(before + code + after, options)
      this.on('exit', () => { recorded.exited = true })
    }
  }
  return { ...real, Worker }
})

const recorder = new BroadcastChannel(recorded.channel)
recorder.onmessage = (event: unknown) => {
  const message = (event as { data: { asked?: unknown; started?: unknown } }).data
  if (typeof message.asked === 'string') recorded.asked.push(message.asked)
  if (message.started === true) recorded.started = true
}
afterAll(() => recorder.close())

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const debuggerMethods = () => recorded.asked.filter((method) => method.startsWith('Debugger.'))

function aFunctionThatHoldsTheThread(): void {
  const until = performance.now() + 1_300
  while (performance.now() < until) {
    // Held, so that the probe must read this thread from its own.
  }
}

// SIXTY SECONDS, SO THAT ONLY A HANG ENDS THE CASE: the machine's load has been 8 to 11, and a slow run is not a fault.
it('the probe names the function that held the thread, and asks the inspector for no Debugger method', async () => {
  const failures: string[] = []
  const probe = aProbeOfTheMainThread((line) => failures.push(line))
  try {
    while (!recorded.started) await wait(10)
    // A METHOD ASKED AT THE WORKER'S START has been passed back by now: its message came before the one saying so.
    expect(debuggerMethods(), 'the probe turned the main thread\'s debugger on at its start').toEqual([])
    const began = performance.now()
    aFunctionThatHoldsTheThread()
    const ended = performance.now()
    while (probe.samples.length === 0 && failures.length === 0) await wait(10)
    expect(debuggerMethods(), 'the probe turned the main thread\'s debugger on during the hold').toEqual([])
    expect(failures).toEqual([])
    expect(theSampleDuring(probe.samples, began, ended)?.frames).toContain(aFunctionThatHoldsTheThread.name)
  } finally {
    probe.stop()
  }
  // A STOPPED PROBE LEAVES NO WORKER, and with it no inspector session.
  while (!recorded.exited) await wait(10)
}, 60_000)
