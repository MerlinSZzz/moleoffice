// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { Worker } from 'node:worker_threads'

/**
 * The worker reads the main thread's stack only when the main thread stops updating its heartbeat. It asks the
 * inspector to run STACK on the main thread, which runs it between two statements of the code that holds the thread.
 * The worker never turns the main thread's debugger on: that makes V8 report every script already loaded and every
 * script compiled after, with its source map, and in the tests that cost each new server two to five seconds of its main
 * thread. With the debugger off, a debugger statement does not stop the thread either.
 */
const WORKER = `
const { parentPort, workerData } = require('node:worker_threads')
const inspector = require('node:inspector')
const heartbeat = new BigInt64Array(workerData)
const session = new inspector.Session()
// THE NAMES OF THE FUNCTIONS ON THE STACK of the thread it runs on. It puts back the stack limit and formatter it changed.
const STACK = '(() => { const prepare = Error.prepareStackTrace; const limit = Error.stackTraceLimit; try { Error.stackTraceLimit = 64; Error.prepareStackTrace = (_, frames) => frames.map((frame) => frame.getFunctionName()); const holder = {}; Error.captureStackTrace(holder); return holder.stack } finally { Error.prepareStackTrace = prepare; Error.stackTraceLimit = limit } })()'
let requested = -1n
let pending = false
session.connectToMainThread()
setInterval(() => {
  const beat = Atomics.load(heartbeat, 0)
  if (!pending && beat !== requested && performance.now() - Number(beat) >= 450) {
    requested = beat
    pending = true
    session.post('Runtime.evaluate', { expression: STACK, returnByValue: true, silent: true }, (failure, answer) => {
      pending = false
      const at = performance.now()
      const beatAtPause = Number(Atomics.load(heartbeat, 0))
      if (failure || answer.exceptionDetails) {
        parentPort.postMessage({ error: 'Runtime.evaluate: ' + String(failure ?? answer.exceptionDetails.text) })
        return
      }
      const frames = answer.result.value.filter(Boolean).slice(0, 12)
      parentPort.postMessage({ at, frames, requestedBeat: Number(requested), beatAtPause })
    })
  }
}, 25)
`

interface Sample { at: number; requestedBeat: number; beatAtPause: number; frames: string[] }
interface Probe { stop: () => void; samples: Sample[] }
let active: { probe: Probe; users: number } | null = null

/** A stack read late may show other work; use only a sample whose answer came before the heartbeat moved. */
export function theSampleDuring(samples: readonly Sample[], began: number, ended: number): Sample | undefined {
  for (let i = samples.length - 1; i >= 0; i -= 1) {
    const one = samples[i]
    if (one !== undefined && one.at >= began && one.at <= ended && one.requestedBeat === one.beatAtPause && one.frames.length > 0) return one
  }
  return undefined
}

/** Share one inspector connection among watches; stopping the last watch stops the worker. */
export function aProbeOfTheMainThread(log: (line: string) => void): Probe {
  if (active !== null) {
    active.users += 1
    return aUseOf(active)
  }
  const heartbeat = new BigInt64Array(new SharedArrayBuffer(BigInt64Array.BYTES_PER_ELEMENT))
  const beat = () => Atomics.store(heartbeat, 0, BigInt(Math.floor(performance.now())))
  beat()
  const timer = setInterval(beat, 20)
  timer.unref()
  let failed = false
  const fail = (reason: string) => {
    if (failed) return
    failed = true
    log(`The server hold probe failed: ${reason}`)
  }
  let thread: Worker
  try {
    thread = new Worker(WORKER, { eval: true, workerData: heartbeat.buffer, execArgv: [] })
  } catch (error) {
    clearInterval(timer)
    fail(`worker start: ${String(error)}`)
    const entry = { probe: { samples: [], stop: () => undefined }, users: 1 }
    active = entry
    return aUseOf(entry)
  }
  thread.unref()
  const samples: Sample[] = []
  thread.on('message', (sample: Sample | { error: string }) => {
    if ('error' in sample) { fail(sample.error); return }
    if (typeof sample.at !== 'number' || !Array.isArray(sample.frames)) return
    samples.push(sample)
    if (samples.length > 100) samples.shift()
  })
  // A failed probe must not stop the server; the hold line keeps its existing unknown-function wording.
  thread.on('error', (error) => fail(`worker: ${error instanceof Error ? error.message : String(error)}`))
  let stopping = false
  thread.on('exit', (code) => { if (!stopping) fail(`worker exited with code ${String(code)}`) })
  const entry = { probe: { samples, stop: () => { stopping = true; clearInterval(timer); void thread.terminate() } }, users: 1 }
  active = entry
  return aUseOf(entry)
}

function aUseOf(entry: { probe: Probe; users: number }): Probe {
  let stopped = false
  return {
    samples: entry.probe.samples,
    stop: () => {
      if (stopped) return
      stopped = true
      entry.users -= 1
      if (entry.users === 0) {
        entry.probe.stop()
        if (active === entry) active = null
      }
    },
  }
}
