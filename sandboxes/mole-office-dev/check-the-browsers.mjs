#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * START EACH BROWSER THE IMAGE CARRIES, AND NAME EACH ONE THAT DID NOT START.
 *
 * Chromium, WebKit and Firefox are installed in this image for the checkout's own Playwright. This
 * check loads that Playwright from the checkout it lives in, launches each browser headless, opens a
 * page at about:blank and closes it, and prints one line for each browser: its name and its version,
 * or the first line of the reason it did not start. It then prints the Playwright version it loaded
 * and the browsers folder it used, and a last line naming every browser that did not start.
 *
 * It exits 0 when all three started and 1 otherwise. It touches no network, no port and no office:
 * about:blank is local, and the only folder it reads is the browsers folder Playwright names.
 *
 * Run it from the repository's top folder:
 *
 *     node sandboxes/mole-office-dev/check-the-browsers.mjs
 */
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The browsers the image carries, in the order this check starts them. */
export const BROWSERS = ['chromium', 'webkit', 'firefox']

/** How long one browser gets to launch, open a page and close again. */
const STARTING_MILLISECONDS = 20_000

const CHECKOUT = fileURLToPath(new URL('../..', import.meta.url))
const REQUIRE = createRequire(join(CHECKOUT, 'package.json'))

let playwright
let playwrightVersion

/** Playwright, loaded from the checkout this file lives in rather than from wherever it is run. */
function thePlaywright() {
  playwright ??= REQUIRE('playwright')
  return playwright
}

function thePlaywrightVersion() {
  playwrightVersion ??= REQUIRE('playwright/package.json').version
  return playwrightVersion
}

/** The folder the browsers were taken from: the one Playwright is told, or its default. */
function theBrowsersFolder() {
  return process.env['PLAYWRIGHT_BROWSERS_PATH'] ?? join(homedir(), '.cache', 'ms-playwright')
}

/** The first line of an error, which is the part that names what went wrong. */
function theFirstLine(error) {
  const message = error instanceof Error ? error.message : String(error)
  return message.split(/\r?\n/).map((line) => line.trim()).find((line) => line !== '') ?? message
}

/**
 * Launch one browser headless, open a page at about:blank, close the page and the browser, and
 * answer its version. A launch that does not finish within the limit fails rather than waits.
 */
async function startOne(name) {
  let browser
  let timer
  const ranOutOfTime = new Promise((_, fail) => {
    timer = setTimeout(() => {
      void browser?.close().catch(() => {})
      fail(new Error(`${name} did not start within ${STARTING_MILLISECONDS / 1000} seconds`))
    }, STARTING_MILLISECONDS)
  })

  const starting = (async () => {
    browser = await thePlaywright()[name].launch({ headless: true, timeout: STARTING_MILLISECONDS })
    const page = await browser.newPage()
    await page.goto('about:blank', { timeout: STARTING_MILLISECONDS })
    await page.close()
    const version = browser.version()
    await browser.close()
    return version
  })()
  // A launch that loses the race still settles later; its rejection is not an unhandled one.
  starting.catch(() => {})

  try {
    return { name, started: true, version: await Promise.race([starting, ranOutOfTime]) }
  } catch (error) {
    void browser?.close().catch(() => {})
    return { name, started: false, reason: theFirstLine(error) }
  } finally {
    clearTimeout(timer)
  }
}

async function main() {
  const didNotStart = []
  for (const name of BROWSERS) {
    const result = await startOne(name)
    if (result.started) console.log(`${result.name}: ${result.version}`)
    else {
      console.log(`${result.name}: did not start: ${result.reason}`)
      didNotStart.push(result.name)
    }
  }
  console.log(`playwright: ${thePlaywrightVersion()}`)
  console.log(`browsers folder: ${theBrowsersFolder()}`)
  console.log(`not started: ${didNotStart.length === 0 ? 'none' : didNotStart.join(', ')}`)
  return didNotStart.length === 0 ? 0 : 1
}

/** Run only when this file is the program, so a test may import BROWSERS without starting browsers. */
function isTheProgram() {
  return process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
}

if (isTheProgram()) {
  void (async () => {
    let code = 0
    try {
      code = await main()
    } catch (error) {
      console.log(`the check could not run: ${theFirstLine(error)}`)
      console.log(`not started: ${BROWSERS.join(', ')}`)
      code = 1
    }
    await new Promise((done) => process.stdout.write('', done))
    process.exit(code)
  })()
}
