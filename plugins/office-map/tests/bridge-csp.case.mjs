// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A new Node process for each CI invocation; no module-cache reset substitutes for it. */
import assert from 'node:assert/strict'

const NativeFunction = globalThis.Function
const { z } = await import('zod')
const { util } = await import('zod/v4/core')
const previous = { ...z.config() }
let reader
try {
  z.config({ jitless: false })
  const { OfficeReader } = await import('../src/bridge.ts')
  const importJitless = z.config().jitless
  const descriptor = Object.getOwnPropertyDescriptor(util.allowsEval, 'value')
  assert.equal(importJitless, false, 'BRIDGE_IMPORT_MUST_REMAIN_LAZY')
  assert.equal(typeof descriptor?.get, 'function', 'FRESH_UNCACHED_ZOD_PROBE_REQUIRED')
  const probeEvents = []
  const blocked = (kind, args) => {
    probeEvents.push({ kind, args: args.map(String), stack: new Error('Real Function probe').stack })
    throw new EvalError('Generated strict policy forbids Function')
  }
  globalThis.Function = new Proxy(NativeFunction, {
    construct: (_target, args) => blocked('construct', args),
    apply: (_target, _receiver, args) => blocked('call', args),
  })
  const sent = [], context = { interface: 'office-read/1', kind: 'context', plugin: 'office-map', page: 'main', language: 'en', theme: 'light', reducedMotion: false, project: 'generated-project' }
  reader = new OfficeReader(message => sent.push(message), () => {}, () => 100)
  reader.start()
  assert.deepEqual(sent, [{ interface: 'office-read/1', ask: 'ready' }])
  reader.receive({ ...context, project: 42 })
  assert.equal(reader.snapshot().context, null, 'MALFORMED_FIRST_CONTEXT_MUST_BE_REFUSED')
  assert.equal(sent.filter(row => row.ask === 'read').length, 0)
  reader.receive(context)
  assert.deepEqual(reader.snapshot().context, context, 'VALID_CONTEXT_MUST_BE_ACCEPTED')
  const reads = sent.filter(row => row.ask === 'read')
  assert.deepEqual(reads.map(row => row.view).sort(), ['asleep', 'online', 'projects', 'roster'])
  const before = JSON.stringify({ context: reader.snapshot().context, sent })
  reader.receive({ ...context, language: 'not-a-language', project: 'generated-other-project' })
  assert.equal(JSON.stringify({ context: reader.snapshot().context, sent }), before, 'LATER_INVALID_CONTEXT_MUST_NOT_CHANGE_STATE')
  const receipt = { pid: process.pid, importJitless, uncachedBeforeFirstUse: true, validationComplete: true, probes: probeEvents.length, probeEvents, reads: reads.map(row => row.view).sort() }
  process.stdout.write('BRIDGE_CSP_RECEIPT ' + JSON.stringify(receipt) + '\n')
  assert.equal(probeEvents.length, 0, 'BRIDGE_FIRST_USE_FUNCTION_PROBE')
} finally {
  globalThis.Function = NativeFunction
  reader?.dispose()
  const current = z.config()
  for (const key of Object.keys(current)) if (!Object.hasOwn(previous, key)) delete current[key]
  z.config(previous)
}
