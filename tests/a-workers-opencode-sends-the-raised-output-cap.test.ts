// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WORKER'S OPENCODE ASKS ITS MODEL FOR UP TO 64,000 OUTPUT TOKENS IN A STEP, AS A CHECK'S DOES (the secretary's ask of 19 October
 * 2026, after the check side landed as merge entry nVpjcB3k0n8R). OpenCode 1.18.31 asks for the smaller of the model's
 * output limit and 32,000 unless OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX says otherwise; in the three days to 19 October 2 of
 * 104 OpenCode worker runs ended a step on "length". tests/the-launcher-passes-the-owners-effort.test.ts proves the
 * launcher gives every OpenCode command the variable at 64000; this test proves what the real OpenCode then sends.
 *
 * THE FIRST CASE runs the real OpenCode with the variable at 64000, as the launcher gives it, and with --pure, as a check
 * runs it, so no external plugin is loaded. A worker's command has no --pure (theOpenCodeCommand in tools/sandbox.mjs),
 * but without it OpenCode 1.18.31 first installs its plugin package from the network into its config folder, which a
 * worker's home already holds and a test with no network cannot do (measured on 19 October 2026: it waits after reading its
 * config until it is stopped). The real OpenCode and the stand-in model are tests/real-opencode-stand-in.ts's, the same a
 * check's test uses: no real model, no real key, an environment built from nothing, and https sent to a closed port.
 *
 * THE SECOND CASE is why the plugins a worker loads cannot change the cap: OpenCode hands a step's options, the cap among
 * them, to the plugins' chat.params hook before it asks the model, and no plugin the launcher names
 * (tools/opencode-go-limit-plugin.mjs, tools/guard/opencode-plugin.mjs and, since 13q round 57,
 * tools/opencode-shell-without-provider-keys-plugin.mjs) has one.
 *
 * MUTATIONS, each planted after a control run and then restored:
 *   M1  the variable left out of the worker's environment: the recorded cap is 32,000, red.
 *   M2  the variable renamed, as a later OpenCode might rename it: the recorded cap is 32,000, red.
 *   M3  a chat.params hook added to tools/opencode-go-limit-plugin.mjs: the second case is red.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { aClosedPort, aStandInModel, runOpenCode, theRealOpenCode } from './real-opencode-stand-in.ts'

/** A worker's model on OpenCode Go and its effort, as the launcher starts it (Casting), by one of the owner's
 * decisions. */
const MODEL = 'opencode-go/deepseek-v4.1-flash'
const EFFORT = 'max'
/** What the launcher gives every OpenCode command. */
const CAP = { OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX: '64000' }
/** How long OpenCode may take before it is stopped. A check's case takes about 1.5 seconds. */
const LIMIT_MS = 60_000

let folder: string | null = null
let server: Server | null = null
afterEach(() => {
  server?.close(); server = null
  if (folder !== null) rmSync(folder, { recursive: true, force: true })
  folder = null
})

it("sends a worker's model a cap of 64,000 output tokens on each step", async () => {
  const opencode = theRealOpenCode()
  folder = mkdtempSync(join(tmpdir(), 'opencode-worker-output-cap-'))
  const home = join(folder, 'home'), work = join(folder, 'work'), tmp = join(folder, 'tmp')
  for (const made of [home, work, tmp]) mkdirSync(made, { recursive: true })
  const model = await aStandInModel()
  server = model.server
  const proxy = `http://127.0.0.1:${await aClosedPort()}`
  const config = join(home, 'stand-in-model.json')
  writeFileSync(config, JSON.stringify({ provider: { 'opencode-go': { options: { baseURL: model.base } } } }))
  const env = {
    PATH: process.env['PATH'] ?? '/usr/bin:/bin', HOME: home, TMPDIR: tmp,
    XDG_CONFIG_HOME: join(home, '.config'), XDG_DATA_HOME: join(home, '.local/share'), XDG_CACHE_HOME: join(home, '.cache'),
    OPENCODE_DISABLE_MODELS_FETCH: '1', OPENCODE_DISABLE_AUTOUPDATE: '1',
    OPENCODE_API_KEY: 'made-up-opencode-key-not-a-real-one', HTTPS_PROXY: proxy, https_proxy: proxy,
    OPENCODE_CONFIG: config,
    ...CAP,
  }

  const ran = await runOpenCode(opencode.bin, env, work, MODEL, EFFORT, LIMIT_MS)

  expect(ran.code, `OpenCode ${opencode.version} ended with ${ran.code}: ${ran.err.slice(-2000)}`).toBe(0)
  const steps = model.asked.filter((one) => one.tools > 0)
  expect(steps.length, `what the stand-in recorded: ${JSON.stringify(model.asked)}`).toBeGreaterThan(0)
  for (const step of steps) expect(step, `OpenCode ${opencode.version} sent ${JSON.stringify(step)}`).toEqual({ model: 'deepseek-v4.1-flash', effort: EFFORT, maxTokens: 64_000, tools: step.tools })
}, LIMIT_MS + 30_000)

it('the plugins the launcher names for an OpenCode run hold no chat.params hook, the one through which a plugin could change the cap', async () => {
  for (const file of ['../tools/opencode-go-limit-plugin.mjs', '../tools/guard/opencode-plugin.mjs', '../tools/opencode-shell-without-provider-keys-plugin.mjs']) {
    const plugin = await import(file) as Record<string, (context: unknown) => Promise<Record<string, unknown>>>
    const exported = Object.values(plugin).filter(value => typeof value === 'function')
    expect(exported.length, file).toBeGreaterThan(0)
    for (const make of exported) expect(Object.keys(await make({})), file).not.toContain('chat.params')
  }
})
