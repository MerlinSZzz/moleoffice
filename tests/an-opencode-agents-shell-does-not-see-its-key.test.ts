// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COMMAND AN OPENCODE AGENT RUNS DOES NOT SEE THE PROVIDER KEYS, WHILE OPENCODE STILL REACHES ITS MODEL WITH ITS KEY
 * (REQUIREMENTS.md, 13q round 57; mkofsn195wGD, widened to the five provider keys by MMYiBgR1p7gr and
 * vRE7nNlTQsrB, and to OPENCODE_CONFIG_CONTENT, which holds the run's token under the router bridge, by
 * EuJ4HiWuImkt). tools/sandbox-start.mjs names tools/opencode-shell-without-provider-keys-plugin.mjs for every OpenCode
 * command (tests/the-launcher-passes-the-owners-effort.test.ts proves that); this test proves what the real OpenCode then
 * gives a command its bash tool runs.
 *
 * THE REAL OPENCODE, WITHOUT --pure, AS A WORKER'S COMMAND RUNS IT. A check runs OpenCode with --pure, which loads no plugin,
 * so a check's commands are not covered (the plugin's own comment says so). The stand-in model asks for one bash call; the
 * command writes, for each name, the sha256 of the value it sees, or of the word "absent" when the name is not set. Every key
 * is made up, nothing is printed, and the stand-in keeps only the sha256 of the key OpenCode sent it. The real OpenCode and
 * the stand-in are tests/real-opencode-stand-in.ts's: an environment built from nothing, and https sent to a closed port.
 *
 * THE CONTROL CASE runs the same command without the plugin and sees every key and the config content, so the first case
 * cannot pass because the command saw nothing at all.
 *
 * MUTATIONS, each planted after a control run and then restored:
 *   M1  the hook's body emptied: the first case is red, the command sees every key.
 *   M2  the hook named 'shell.environment': the first case is red.
 *   M3  each key set to '' instead of undefined: the first case is red, the command sees an empty key and not "absent".
 *   M4  OPENROUTER_API_KEY left out of the plugin's list: the first case and the list case are red.
 *   M5  OPENCODE_CONFIG_CONTENT left out of the plugin's list: the first case and the list case are red.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { aClosedPort, aReadyConfigFolder, aStandInModel, runOpenCode, theRealOpenCode } from './real-opencode-stand-in.ts'

const PLUGIN = new URL('../tools/opencode-shell-without-provider-keys-plugin.mjs', import.meta.url)
/** A worker's model on OpenCode Go, which OpenCode reaches with OPENCODE_API_KEY. */
const MODEL = 'opencode-go/deepseek-v4.1-flash'
/** Every key the template gives OpenCode, each made up. */
const KEYS: Record<string, string> = {
  DEEPSEEK_API_KEY: 'made-up-deepseek-key-not-a-real-one',
  OPENAI_API_KEY: 'made-up-openai-key-not-a-real-one',
  ANTHROPIC_API_KEY: 'made-up-anthropic-key-not-a-real-one',
  OPENCODE_API_KEY: 'made-up-opencode-key-not-a-real-one',
  OPENROUTER_API_KEY: 'made-up-openrouter-key-not-a-real-one',
}
/** Every name the command reads: the keys, and the config content, which holds a key under the router bridge. */
const NAMES = [...Object.keys(KEYS), 'OPENCODE_CONFIG_CONTENT']
/** How long OpenCode may take before it is stopped. A case takes about 2 seconds. */
const LIMIT_MS = 60_000

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')

let folder: string | null = null
let server: Server | null = null
afterEach(() => {
  server?.close(); server = null
  if (folder !== null) rmSync(folder, { recursive: true, force: true })
  folder = null
})

/** Run the real OpenCode with every key, with or without the plugin, and read what its bash command saw of each name. */
async function whatTheCommandSees(withThePlugin: boolean): Promise<{ seen: Record<string, string>; sentKeys: (string | null)[]; content: string }> {
  const opencode = theRealOpenCode()
  folder = mkdtempSync(join(tmpdir(), 'opencode-shell-keys-'))
  const home = join(folder, 'home'), work = join(folder, 'work'), tmp = join(folder, 'tmp')
  for (const made of [home, work, tmp]) mkdirSync(made, { recursive: true })
  aReadyConfigFolder(join(home, '.config', 'opencode'), opencode.version)
  const seenFile = join(folder, 'seen.txt')
  const command = `for name in ${NAMES.join(' ')}; do eval "value=\\\${$name-absent}"; ` +
    `printf '%s %s\\n' "$name" "$(printf '%s' "$value" | sha256sum | cut -d' ' -f1)"; done > '${seenFile}'`
  const model = await aStandInModel({ runsOneCommand: command })
  server = model.server
  const proxy = `http://127.0.0.1:${await aClosedPort()}`
  const content = JSON.stringify({ plugin: withThePlugin ? [PLUGIN.href] : [] })
  const config = join(home, 'stand-in-model.json')
  writeFileSync(config, JSON.stringify({ provider: { 'opencode-go': { options: { baseURL: model.base } } } }))
  const env = {
    PATH: process.env['PATH'] ?? '/usr/bin:/bin', HOME: home, TMPDIR: tmp,
    XDG_CONFIG_HOME: join(home, '.config'), XDG_DATA_HOME: join(home, '.local/share'), XDG_CACHE_HOME: join(home, '.cache'),
    OPENCODE_DISABLE_MODELS_FETCH: '1', OPENCODE_DISABLE_AUTOUPDATE: '1',
    HTTPS_PROXY: proxy, https_proxy: proxy, OPENCODE_CONFIG: config,
    OPENCODE_PERMISSION: JSON.stringify({ bash: 'allow' }),
    ...KEYS,
    OPENCODE_CONFIG_CONTENT: content,
  }

  const ran = await runOpenCode(opencode.bin, env, work, MODEL, 'max', LIMIT_MS, { pure: false, prompt: 'Run the command.' })

  expect(ran.code, `OpenCode ${opencode.version} ended with ${ran.code}: ${ran.err.slice(-2000)}`).toBe(0)
  expect(existsSync(seenFile), `the bash command never ran; the stand-in was asked ${JSON.stringify(model.asked)}`).toBe(true)
  const seen = Object.fromEntries(readFileSync(seenFile, 'utf8').trim().split('\n').map((line) => line.split(' ') as [string, string]))
  return { seen, sentKeys: model.keys, content }
}

it('a command an OpenCode agent runs sees none of the five provider keys and no config content, while OpenCode still sends its own key to the model', async () => {
  const { seen, sentKeys } = await whatTheCommandSees(true)

  expect(seen).toEqual(Object.fromEntries(NAMES.map((name) => [name, sha256('absent')])))
  expect(sentKeys.length).toBeGreaterThan(1)
  for (const sent of sentKeys) expect(sent).toBe(sha256(KEYS['OPENCODE_API_KEY']!))
}, LIMIT_MS + 30_000)

it('without the plugin, the same command sees every key and the config content, so the case above reads a command that can see them', async () => {
  const { seen, content } = await whatTheCommandSees(false)

  expect(seen).toEqual({ ...Object.fromEntries(Object.entries(KEYS).map(([name, key]) => [name, sha256(key)])), OPENCODE_CONFIG_CONTENT: sha256(content) })
}, LIMIT_MS + 30_000)

it("the plugin takes out every key the template gives OpenCode and the config content, and leaves MOLE_AGENT_KEY, which an agent's commands write with", async () => {
  const template = JSON.parse(readFileSync(new URL('../sandboxes/mole-office-dev/sandbox.json', import.meta.url), 'utf8')) as
    { secrets: { names: { name: string; readBy: string[] }[] } }
  const readByOpenCode = template.secrets.names.filter((secret) => secret.readBy.includes('opencode')).map((secret) => secret.name)
  const plugin = await import(PLUGIN.href) as Record<string, () => Promise<Record<string, (input: unknown, output: { env: Record<string, unknown> }) => Promise<void>>>>
  const made = Object.values(plugin)
  expect(made.length).toBe(1)
  const hooks = await made[0]!()
  const output = { env: {} as Record<string, unknown> }

  await hooks['shell.env']!({ cwd: '/', sessionID: 'a-session', callID: 'a-call' }, output)

  expect(Object.keys(output.env).sort()).toEqual([...readByOpenCode, 'OPENCODE_CONFIG_CONTENT'].sort())
  expect(Object.keys(output.env).sort()).toEqual([...NAMES].sort())
  for (const value of Object.values(output.env)) expect(value).toBeUndefined()
  expect(Object.keys(output.env)).not.toContain('MOLE_AGENT_KEY')
})
