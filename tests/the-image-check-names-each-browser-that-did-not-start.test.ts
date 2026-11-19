// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE IMAGE CHECK NAMES EACH BROWSER THAT DID NOT START.
 *
 * The image's own check starts Chromium, WebKit and Firefox in turn and says which started and which
 * did not. This file runs that check as a child process against browsers folders made up here: an
 * empty one, in which none can start, and one holding only Chromium's folders, in which only WebKit
 * and Firefox cannot.
 *
 * CHROMIUM'S FOLDER NAMES COME FROM browsers.json, the file Playwright's installer reads, so no
 * browser revision and no folder name is written here by hand. The real browsers folder is the one
 * PLAYWRIGHT_BROWSERS_PATH names; inside a sandbox that is /ms-playwright. If it holds no Chromium
 * this file fails and says so, rather than skipping the case.
 *
 * NO DOCKER, NO PORT, NO OFFICE. The check is a child process of this test, told which folder to read,
 * and it starts browsers only.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { BROWSERS } from '../sandboxes/mole-office-dev/check-the-browsers.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const THE_CHECK = join(ROOT, 'sandboxes', 'mole-office-dev', 'check-the-browsers.mjs')

interface BrowserEntry {
  name: string
  revision: string
  installByDefault?: boolean
  browserVersion?: string
}

/** The entries node_modules/playwright-core/browsers.json holds, read from the checkout's own copy. */
function browsersJson(): BrowserEntry[] {
  const require = createRequire(join(ROOT, 'package.json'))
  const file = join(dirname(require.resolve('playwright-core/package.json')), 'browsers.json')
  return (JSON.parse(readFileSync(file, 'utf8')) as { browsers: BrowserEntry[] }).browsers
}

/**
 * The folder of each Chromium the installer puts in the browsers folder. Playwright names a folder
 * `<name>-<revision>` with the name's dashes written as underscores, as its own registry does; the
 * entries come from browsers.json, so chromium-headless-shell comes with chromium.
 */
function chromiumFolders(): string[] {
  return browsersJson()
    .filter((one) => one.installByDefault === true && one.name.startsWith('chromium'))
    .map((one) => `${one.name.replaceAll('-', '_')}-${one.revision}`)
}

const made: string[] = []

/** A browsers folder of the test's own, with nothing in it until a case puts something there. */
function aBrowsersFolder(): string {
  const folder = mkdtempSync(join(tmpdir(), 'mole-office-image-check-'))
  made.push(folder)
  return folder
}

afterEach(() => {
  for (const folder of made.splice(0)) rmSync(folder, { recursive: true, force: true })
})

interface Ran {
  status: number | null
  output: string
}

/** Run the image's check with PLAYWRIGHT_BROWSERS_PATH pointed at `folder`, and collect both streams. */
function runTheCheck(folder: string): Ran {
  const child = spawnSync(process.execPath, [THE_CHECK], {
    cwd: ROOT,
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: folder },
    encoding: 'utf8',
    timeout: 90_000,
  })
  expect(child.error, `the check could not be run: ${String(child.error)}`).toBeUndefined()
  return { status: child.status, output: `${child.stdout ?? ''}${child.stderr ?? ''}` }
}

function theLastLine(output: string): string {
  return output.trimEnd().split(/\r?\n/).at(-1) ?? ''
}

/** Which of the check's browsers the line names, in the check's own order. */
function browsersNamedIn(line: string): string[] {
  return BROWSERS.filter((browser) => new RegExp(`(^|[^a-z0-9])${browser}([^a-z0-9]|$)`).test(line))
}

describe('the image check names each browser that did not start', () => {
  it('with no browser in the folder, exits 1 and names all three as not started', () => {
    const ran = runTheCheck(aBrowsersFolder())
    expect(ran.status, ran.output).toBe(1)
    expect(browsersNamedIn(theLastLine(ran.output)), ran.output).toEqual([...BROWSERS])
  })

  it('with only Chromium in the folder, starts Chromium and names only WebKit and Firefox as not started', () => {
    const real = process.env['PLAYWRIGHT_BROWSERS_PATH']
    expect(real, 'PLAYWRIGHT_BROWSERS_PATH names no real browsers folder to take Chromium from').toBeTruthy()

    const folder = aBrowsersFolder()
    const wanted = chromiumFolders()
    const linked = wanted.filter((name) => existsSync(join(real as string, name)))
    expect(
      linked.length,
      `the real browsers folder ${String(real)} holds no Chromium folder; looked for ${wanted.join(', ')}`,
    ).toBeGreaterThan(0)
    for (const name of linked) symlinkSync(join(real as string, name), join(folder, name), 'dir')

    const ran = runTheCheck(folder)
    expect(ran.status, ran.output).toBe(1)
    const notChromium = BROWSERS.filter((browser) => !browser.startsWith('chromium'))
    expect(browsersNamedIn(theLastLine(ran.output)), ran.output).toEqual(notChromium)

    const chromium = browsersJson().find((one) => one.name === 'chromium' && one.installByDefault === true)
    expect(chromium, 'browsers.json holds no Chromium entry').toBeDefined()
    expect(ran.output, 'Chromium did not print its version, so it did not start').toContain(chromium?.browserVersion)
  })
})
