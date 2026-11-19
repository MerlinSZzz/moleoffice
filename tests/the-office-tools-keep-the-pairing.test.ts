// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE MERGE TOOL STARTS DOES NOT INHERIT THE PAIRING, AND ONLY THIS CHECKOUT'S OWN KEY-READING TOOLS ARE HANDED IT.
 *
 * Wave 13q, the first problem after the switch. The stable office's worker runs from the stable checkout with
 * MOLE_OFFICE_DEVELOPMENT_CHECKOUT, and starts the merge tool, the check tool and the sandbox launcher from that checkout.
 * `envFor` dropped the pairing with every other MOLE_OFFICE_ setting. So the merge tool read the stable checkout's own
 * settings, found no key file beside the database they name, sent no key, and the office refused its first write three
 * times. The sandbox launcher read the declared placeholder commit address for the same reason, and handed it to the
 * round it started.
 *
 * The merge tool takes the pairing out of its own environment once its settings have read it. Its suites, its git and
 * the landing's database question in the development checkout run other code, and that checkout's settings refuse to
 * load when they are named as their own pairing. Only this checkout's tools that read the office's key get it back.
 *
 * `envFor` now hands the pairing on by this process's own pairing (src/config/the-office-tool-environment.mjs), and a
 * test process is not paired. So what `envFor` hands each runtime, in each checkout, is proved in a paired process by
 * tests/every-office-tool-reads-the-paired-office.test.ts, and is no longer proved here.
 *
 * What the case guards:
 *   - the merge tool keeps the pairing in its own environment, so what it starts
 *     inherits it, or `withThePairing` stops handing it back                        → the case is red.
 */
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { copyBootstrapSettings } from './stable-bootstrap-clone-fixture.ts'

const SOURCE = fileURLToPath(new URL('..', import.meta.url))
/** A made-up office key, in the shape the office makes. Built here so no key-shaped text is in the file. */
const A_KEY = 'c0ffee00'.repeat(8)

let root: string
let dev: string
let stable: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'office-tools-pairing-'))
  dev = join(root, 'development')
  stable = join(root, 'stable')
  mkdirSync(join(root, 'data'))
  const git = spawnSync('git', ['init', '--quiet', dev], { encoding: 'utf8' })
  expect(git.status, git.stderr).toBe(0)
  // The development .env names a database outside both checkouts, and its key file is beside it, as the live layout is.
  writeFileSync(join(dev, '.env'), `MOLE_OFFICE_DB=${join(root, 'data', 'office.db')}\nMOLE_OFFICE_STABLE_CHECKOUT=${stable}\n`)
  writeFileSync(join(root, 'data', 'keys.json'), JSON.stringify({ office: A_KEY }), { mode: 0o600 })
  mkdirSync(join(stable, 'src'), { recursive: true })
  mkdirSync(join(stable, 'tools', 'merge-tool'), { recursive: true })
  cpSync(join(SOURCE, 'src/config'), join(stable, 'src/config'), { recursive: true })
  // The settings loader imports modules outside src/config too; its whole import closure is copied, not a list by hand.
  copyBootstrapSettings(stable)
  // arguments.mjs's copied closure imports zod, so the stable copy borrows this checkout's installed packages.
  symlinkSync(join(SOURCE, 'node_modules'), join(stable, 'node_modules'))
  cpSync(join(SOURCE, 'package.json'), join(stable, 'package.json'))
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

/** What a merge-tool-like process started from the stable copy finds, and what its children inherit. */
function fromTheStableCopy(pairing: string | null) {
  const env = { ...process.env }
  for (const name of Object.keys(env)) if (name.startsWith('MOLE_')) delete env[name]
  if (pairing !== null) env['MOLE_OFFICE_DEVELOPMENT_CHECKOUT'] = pairing
  const at = (path: string) => JSON.stringify(pathToFileURL(join(stable, path)).href)
  const code = [
    `process.argv = [process.argv[0], ${at('tools/merge-tool/arguments.mjs')}, '--entry', 'probe-entry', '--session', 'probe-session', '--workdir', ${JSON.stringify(join(root, 'probe-merge-work'))}]`,
    `const { withThePairing } = await import(${at('tools/merge-tool/arguments.mjs')})`,
    `const { theOfficeKey } = await import(${at('src/config/office-key.mjs')})`,
    `const { spawnSync } = await import('node:child_process')`,
    `const says = ['-e', "process.stdout.write(process.env.MOLE_OFFICE_DEVELOPMENT_CHECKOUT ?? 'none')"]`,
    `const inherited = spawnSync(process.execPath, says, { encoding: 'utf8' }).stdout`,
    `const handed = spawnSync(process.execPath, says, { env: withThePairing(process.env), encoding: 'utf8' }).stdout`,
    `console.log(JSON.stringify({ found: theOfficeKey().key === ${JSON.stringify(A_KEY)}, inherited, handed }))`,
  ].join('\n')
  const ran = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: stable, env, encoding: 'utf8', timeout: 15_000 })
  expect(ran.status, ran.stdout + ran.stderr).toBe(0)
  return JSON.parse(ran.stdout.trim().split('\n').pop() ?? '') as { found: boolean; inherited: string; handed: string }
}

describe('a merge tool started from the stable checkout', () => {
  it('finds the office key through the pairing, and only this checkout’s own key-reading tools inherit it', () => {
    // THE MODULE AND ITS LOCAL IMPORTS, as the settings loader's are copied above, so a module it comes to import is copied too.
    copyBootstrapSettings(stable, ['tools/merge-tool/arguments.mjs'])
    // The control: without the pairing the stable copy reads its own settings and finds no key, as on the live office.
    expect(fromTheStableCopy(null)).toEqual({ found: false, inherited: 'none', handed: 'none' })
    expect(fromTheStableCopy(dev)).toEqual({ found: true, inherited: 'none', handed: realpathSync(dev) })
  })
})
