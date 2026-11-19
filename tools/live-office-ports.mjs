// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHICH PORTS ARE A LIVE OFFICE'S, FOR tools/live-office-guard.mjs. Problem E1SWGJK7wG68.
 *
 * Two ports, each read from its own source, and each with a sentence naming the source:
 *
 *   1. The port this checkout's office reads: MOLE_OFFICE_PORT through src/config/settings.mjs, the
 *      way the office reads it. That is the environment first, then the checkout's .env (or its main
 *      checkout's), then the built-in default declared there. A checkout with no .env gets the
 *      built-in default, and every sandbox's clone is such a checkout (measured in a sandbox: its
 *      clone read the built-in default, while the office the sandbox wrote to was on another port).
 *   2. In a sandbox, the port of the office the sandbox writes to: the "api" that tools/sandbox.mjs up
 *      recorded in the instance.json of the folder SANDBOX_DIR names, read with readInstance from
 *      tools/sandbox-common.mjs. With no SANDBOX_DIR, or no instance.json there, only the first
 *      applies, and the runner's line says so. tests/a-test-sees-no-agents-environment.ts does not
 *      remove SANDBOX_DIR, and in any case this is read in the runner's own process, before any setup
 *      file runs.
 *
 * These are two facts, not two sources for one: the office this checkout would serve, and the
 * office this sandbox was made against.
 *
 * THEY ARE READ IN THE RUNNER'S PROCESS, ONCE, when vitest loads vitest.config.ts, and handed to every
 * process after it (tools/live-office-guard.mjs says how). A test that later sets MOLE_OFFICE_PORT or
 * SANDBOX_DIR for an office or a sandbox of its own changes nothing the guard refuses. A runner started
 * inside a test, such as vitest run by a test of the runner, reads both sources again from its own
 * environment and guards those ports as well as the ones it was handed.
 */

import { join } from 'node:path'
import { findEnvFile, mergedEnvironment, portFrom, readSettingHere } from '../src/config/settings.mjs'
import { INSTANCE_FILE, readInstance } from './sandbox-common.mjs'
import { installTheGuard, PORTS_VARIABLE, THE_IMPORT, THE_PRELOAD, theHandedDownPorts } from './live-office-guard.mjs'

/** @typedef {import('./live-office-guard.mjs').AGuardedPort} AGuardedPort */

/**
 * SOURCE 1. The port the office of THIS CHECKOUT reads.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {AGuardedPort}
 */
export function theCheckoutsOfficePort(env = process.env) {
  try {
    const reading = readSettingHere('MOLE_OFFICE_PORT', env)
    const port = portFrom(mergedEnvironment(env), 'MOLE_OFFICE_PORT')
    if (reading.source === 'the environment') return { port, said: `The port ${port} is MOLE_OFFICE_PORT in the test runner's environment.` }
    if (reading.source === '.env') return { port, said: `The port ${port} is MOLE_OFFICE_PORT in ${findEnvFile().path}.` }
    return {
      port,
      said:
        `No setting names this checkout's office port (checked the test runner's environment and ${findEnvFile().checked.join(' and ')}), ` +
        `so the port ${port} is the office's built-in default, declared with the MOLE_OFFICE_PORT setting in src/config/settings.mjs.`,
    }
  } catch (error) {
    return { port: null, said: `This checkout's office port could not be read: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/**
 * SOURCE 2. In a sandbox, the port of the office the sandbox writes to. Outside a sandbox the answer
 * is `{ outside }`, the sentence that says so. An instance.json that is there but cannot be read, or
 * names no http address, is a sandbox that cannot say which office it serves: the answer is a port of
 * null.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {AGuardedPort | { outside: string }}
 */
export function theSandboxsOfficePort(env = process.env) {
  const folder = env['SANDBOX_DIR']
  if (folder === undefined || folder === '') return { outside: 'SANDBOX_DIR is not set, so this is not a sandbox.' }
  const file = join(folder, INSTANCE_FILE)
  let instance
  try {
    instance = readInstance(folder)
  } catch (error) {
    return { port: null, said: `This sandbox cannot say which office it writes to: ${error instanceof Error ? error.message : String(error)}` }
  }
  if (instance === null) return { outside: `SANDBOX_DIR names ${folder}, which holds no ${INSTANCE_FILE}, so this is not taken for a sandbox.` }
  const api = instance?.api
  let url = null
  try {
    url = typeof api === 'string' ? new URL(api) : null
  } catch {
    url = null
  }
  if (url === null || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    return { port: null, said: `This sandbox cannot say which office it writes to: ${file} has no "api" that is an http address (it has ${JSON.stringify(api)}).` }
  }
  const port = url.port !== '' ? Number(url.port) : url.protocol === 'https:' ? 443 : 80
  return { port, said: `The port ${port} is the port of ${api}, the office this sandbox writes to, as ${file} says.` }
}

/**
 * Both sources, read now from `env`: the ports, and the sentence about the sandbox when there is none.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ ports: AGuardedPort[], outside: string | null }}
 */
export function theLiveOfficesPorts(env = process.env) {
  const sandbox = theSandboxsOfficePort(env)
  const checkout = theCheckoutsOfficePort(env)
  return 'outside' in sandbox ? { ports: [checkout], outside: sandbox.outside } : { ports: [checkout, sandbox], outside: null }
}

/**
 * THE PORT NUMBERS A TEST KEEPS OFF, for a test that checks the port it was given is no live office's.
 *
 * They are the ports the guard refuses, chosen the way tools/live-office-guard-preload.mjs chooses them:
 * the ports handed down in PORTS_VARIABLE, which the runner read before any test changed anything, and
 * with none handed down, both sources read now. So a test that names a port of its own in
 * MOLE_OFFICE_PORT, for an office it starts, does not make that port one it keeps off. A port that cannot
 * be read is not left out: the call throws, with the sentence that says why.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {number[]}
 */
export function thePortsATestKeepsOff(env = process.env) {
  const every = theHandedDownPorts(env) ?? theLiveOfficesPorts(env).ports
  const numbers = new Set()
  for (const one of every) {
    if (one.port === null) throw new Error(`The ports a test keeps off cannot be told: ${one.said}`)
    numbers.add(one.port)
  }
  return /** @type {number[]} */ ([...numbers])
}

/**
 * Called by vitest.config.ts when vitest loads it. It reads both sources, adds the ports this runner
 * was handed if it was started inside a guarded process, installs the guard in the runner's own
 * process, and puts the guard and the ports into NODE_OPTIONS and PORTS_VARIABLE so every node
 * process started after this is guarded too. It returns the one line the runner prints, saying which
 * ports are guarded and where each came from.
 *
 * A PORT THAT CANNOT BE READ STOPS THE RUN HERE, with the sentence, before any test starts: a sandbox
 * that cannot say which office it writes to, or a MOLE_OFFICE_PORT that is not a port.
 *
 * @returns {string}
 */
export function guardEveryTestProcess() {
  const read = theLiveOfficesPorts()
  const broken = read.ports.find((one) => one.port === null)
  if (broken !== undefined) throw new Error(`No test runs: ${broken.said}`)
  const handed = theHandedDownPorts() ?? []
  const ports = [...read.ports]
  for (const one of handed) if (!ports.some((mine) => mine.port === one.port && mine.said === one.said)) ports.push(one)
  installTheGuard(ports)
  process.env[PORTS_VARIABLE] = JSON.stringify(ports)
  const imports = process.env.NODE_OPTIONS ?? ''
  if (!imports.includes(THE_PRELOAD)) process.env.NODE_OPTIONS = imports === '' ? THE_IMPORT : `${imports} ${THE_IMPORT}`
  const numbers = [...new Set(ports.map((one) => one.port))].join(' and ')
  return (
    `Every test process refuses connections to port ${numbers} on this machine's own addresses. ` +
    `${ports.map((one) => one.said).join(' ')}${read.outside === null ? '' : ` ${read.outside}`}`
  )
}
