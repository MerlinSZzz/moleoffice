// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHECK'S OPENCODE ASKS ITS MODEL FOR UP TO 64,000 OUTPUT TOKENS IN A STEP (the secretary's brief of 19 October 2026, 10:18;
 * run Pgwi2GgFdbt8). OpenCode 1.18.31 asks for the smaller of the model's output limit and 32,000, unless the variable
 * OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX says otherwise (read in XfxmiZBXj_r8). That day two checks on DeepSeek
 * flash at effort max stopped with reason "length" at 32,000 tokens. OPENCODE_CHECK_ENV in tools/inspector-sandbox.mjs
 * now sets the variable to 64,000.
 *
 * THIS TEST READS THE CAP FROM WHAT OPENCODE SENDS, not from the environment. It runs the real OpenCode, the one the
 * mole-office-dev template installs with npm install -g, with the check's environment, model and effort, and a stand-in
 * model endpoint on 127.0.0.1 records each request OpenCode makes. The variable is marked experimental: if a later
 * OpenCode renames it or stops reading it, the recorded cap falls back to 32,000 and this test goes red.
 *
 * NO REAL MODEL AND NO REAL KEY. The stand-in is started first, and the only address OpenCode is given for opencode-go is
 * the stand-in's: provider.opencode-go.options.baseURL, which OpenCode 1.18.31 uses in place of the address in its model
 * list. The key is made up, and the environment is built from nothing, so no key of the caller's is passed on. OpenCode
 * reads its model list from the copy it carries (OPENCODE_DISABLE_MODELS_FETCH). HTTPS_PROXY names a closed port on
 * 127.0.0.1, so an https request OpenCode makes all the same fails on this machine: measured in this run, OpenCode 1.18.31
 * sends its https requests through HTTPS_PROXY, and it asks registry.npmjs.org when it starts. The test runner's guard of
 * the live office does not reach OpenCode, which is not node; OpenCode is given no office address.
 *
 * THE CHECK'S ENVIRONMENT names the check's private home as /check/home, inside its container. Each path under it is
 * moved into this test's own folder, and every other entry is passed as the check has it. The stand-in's address is
 * written into the file OPENCODE_CONFIG names, the file a check's home holds its OpenCode settings in.
 *
 * The real OpenCode and the stand-in model are tests/real-opencode-stand-in.ts's, which a worker's test shares.
 *
 * MUTATIONS, each planted after a control run and then restored:
 *   M1  OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX taken out of OPENCODE_CHECK_ENV: the recorded cap is 32,000, red.
 *   M2  the variable renamed in OPENCODE_CHECK_ENV, as a later OpenCode might rename it: the recorded cap is 32,000, red.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { OPENCODE_CHECK_ENV } from '../tools/inspector-sandbox.mjs'
import { aClosedPort, aStandInModel, runOpenCode, theRealOpenCode } from './real-opencode-stand-in.ts'

/** The check's model and effort: Casting row 11, at effort max. */
const MODEL = 'opencode-go/deepseek-v4.1-flash'
const EFFORT = 'max'
/** Where a check's environment puts its private home, inside the check's container. */
const CHECK_HOME = '/check/home/'
/** How long OpenCode may take before it is stopped. The whole case took about 1.5 seconds in the runs of 19 October 2026. */
const LIMIT_MS = 60_000

let folder: string | null = null
let server: Server | null = null
afterEach(() => {
  server?.close(); server = null
  if (folder !== null) rmSync(folder, { recursive: true, force: true })
  folder = null
})

it("sends the check's model a cap of 64,000 output tokens on each step, at the check's effort", async () => {
  const opencode = theRealOpenCode()
  folder = mkdtempSync(join(tmpdir(), 'opencode-output-cap-'))
  const home = join(folder, 'home'), work = join(folder, 'work'), tmp = join(folder, 'tmp')
  for (const made of [home, work, tmp]) mkdirSync(made, { recursive: true })
  const check = Object.fromEntries(Object.entries(OPENCODE_CHECK_ENV).map(([key, value]) =>
    [key, value.startsWith(CHECK_HOME) ? join(home, value.slice(CHECK_HOME.length)) : value]))
  const model = await aStandInModel()
  server = model.server
  const proxy = `http://127.0.0.1:${await aClosedPort()}`
  mkdirSync(dirname(check['OPENCODE_CONFIG']!), { recursive: true })
  writeFileSync(check['OPENCODE_CONFIG']!, JSON.stringify({ provider: { 'opencode-go': { options: { baseURL: model.base } } } }))
  const env = {
    PATH: process.env['PATH'] ?? '/usr/bin:/bin', HOME: home, TMPDIR: tmp,
    XDG_CONFIG_HOME: join(home, '.config'), XDG_DATA_HOME: join(home, '.local/share'), XDG_CACHE_HOME: join(home, '.cache'),
    OPENCODE_DISABLE_MODELS_FETCH: '1', OPENCODE_DISABLE_AUTOUPDATE: '1',
    OPENCODE_API_KEY: 'made-up-opencode-key-not-a-real-one', HTTPS_PROXY: proxy, https_proxy: proxy,
    ...check,
  }

  const ran = await runOpenCode(opencode.bin, env, work, MODEL, EFFORT, LIMIT_MS)

  expect(ran.code, `OpenCode ${opencode.version} ended with ${ran.code}: ${ran.err.slice(-2000)}`).toBe(0)
  const steps = model.asked.filter((one) => one.tools > 0)
  expect(steps.length, `what the stand-in recorded: ${JSON.stringify(model.asked)}`).toBeGreaterThan(0)
  for (const step of steps) expect(step, `OpenCode ${opencode.version} sent ${JSON.stringify(step)}`).toEqual({ model: 'deepseek-v4.1-flash', effort: EFFORT, maxTokens: 64_000, tools: step.tools })
}, LIMIT_MS + 30_000)
