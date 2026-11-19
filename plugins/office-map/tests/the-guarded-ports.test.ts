// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, beforeEach, expect, it } from 'vitest'
// @ts-expect-error The port check is plain JS, shared with the JS test worlds and the browser fixture.
import { refuseALiveOfficePort } from './fixtures/the-guarded-ports.mjs'

// Each test sets a guard record of its own, with made-up ports, where tools/live-office-guard.mjs
// keeps the real one. The record the run installed is put back after every test.
const GUARD = Symbol.for('mole-office.live-office-guard')
const held = globalThis as unknown as Record<symbol, unknown>
const refuse = refuseALiveOfficePort as (port: unknown, message: string) => void
let before: { had: boolean; record: unknown }
beforeEach(() => { before = { had: GUARD in held, record: held[GUARD] } })
afterEach(() => { if (before.had) held[GUARD] = before.record; else delete held[GUARD] })

it('throws when no guard is installed, and says how to start a tool with one', () => {
  delete held[GUARD]
  expect(() => refuse(41234, 'Reserved port')).toThrow('No live office guard is installed in this process, so it cannot tell which ports belong to a live office.')
  expect(() => refuse(41234, 'Reserved port')).toThrow('`node --import tools/live-office-guard-preload.mjs <the tool>`, from the repository root')
})

it('refuses the port the guard holds and lets another through', () => {
  held[GUARD] = { ports: [{ port: 41234, said: 'The port 41234 is a made-up office port.' }] }
  expect(() => refuse(41234, 'Reserved port')).toThrow("Reserved port: port 41234 is a live office's port, so the live office guard refuses it. The port 41234 is a made-up office port.")
  expect(() => refuse(41235, 'Reserved port')).not.toThrow()
})

it('refuses every port when the guard holds a null, and the error carries its said', () => {
  const said = 'A made-up source named a port that could not be read.'
  held[GUARD] = { ports: [{ port: null, said }] }
  for (const port of [1, 41234, 41235, 65535]) {
    expect(() => refuse(port, 'Reserved test port')).toThrow(`Reserved test port: the live office guard could not read one of a live office's ports, so it refuses every port. ${said}`)
  }
})

it('reads the record when asked, so a second install of the guard replaces the list', () => {
  const record = { ports: [{ port: 41234, said: 'The first made-up list.' }] }
  held[GUARD] = record
  expect(() => refuse(41235, 'Reserved port')).not.toThrow()
  record.ports = [{ port: 41235, said: 'The second made-up list.' }]
  expect(() => refuse(41235, 'Reserved port')).toThrow('The second made-up list.')
  expect(() => refuse(41234, 'Reserved port')).not.toThrow()
})

it('throws on a record of the wrong shape, whichever port is asked about', () => {
  const wrong = [null, 'ports', {}, { ports: {} }, { ports: [] }, { ports: [null] }, { ports: [{ port: 41234 }] },
    { ports: [{ port: '41234', said: 'A port written as text.' }] }, { ports: [{ port: 41234.5, said: 'A port that is not whole.' }] }]
  for (const record of wrong) {
    held[GUARD] = record
    expect(() => refuse(41235, 'Reserved port')).toThrow("The live office guard's record in this process is not a list of ports, each { port, said }")
  }
})

it('refuses to check a port that is not a whole number', () => {
  held[GUARD] = { ports: [{ port: 41234, said: 'The port 41234 is a made-up office port.' }] }
  expect(() => refuse('41234', 'Reserved port')).toThrow('Reserved port: 41234 is not a whole number, so it cannot be checked against the live office guard.')
})
