// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WINDOW PROGRAM PRINTS ONE PAGE AS A PDF, AND ENDS.
 *
 * The office's door POST /api/report-pdf (src/server/api/report-pdf.ts) writes a report's page into a
 * folder of its own. It then starts the app's own window program with the print switch, the page and the
 * PDF to write. src/desktop/main.mjs reads the switch first and hands the run to `printAPage`, which:
 *
 *   - keeps Electron's own files in a folder beside the page, so a print run writes nothing into the
 *     window's folder;
 *   - opens one hidden window that runs no script, in a session of its own that is kept in memory only;
 *   - lets no request leave except for the page itself and data: addresses, follows no link and opens no
 *     other window;
 *   - prints the page on A4 with its backgrounds, or on the page size its stylesheet asks for, writes the
 *     PDF and ends with 0.
 *
 * Anything that goes wrong ends the run with 1 and one line on stderr that begins "Mole Office could not
 * print the page:". The door gives that line back as the reason. A print run makes no tray, starts no
 * office, takes no lock and opens no other window.
 *
 * Electron is imported once the app is ready, so this module also loads where Electron is not running.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** The switch that asks the window program to print a page. The page and the PDF to write follow it. */
export const PRINT_A_PAGE_SWITCH = '--print-a-page'

/** The folder beside the page that holds Electron's own files for the print run. */
export const THE_PRINT_PROFILE_FOLDER = 'profile'

/** The print window's session. Its name has no "persist:", so Electron keeps it in memory and writes none of it. */
const THE_PRINT_SESSION = 'mole-office-print'

/** The words every failed print run's line begins with. */
const COULD_NOT_PRINT = 'Mole Office could not print the page:'

/**
 * THE PRINT A COMMAND LINE ASKS FOR: the page and the PDF named by the two arguments after the switch, or
 * null when the switch is not there. A switch that is not followed by two absolute paths is refused.
 * @param {readonly string[]} argv
 * @returns {{ html: string, pdf: string } | null}
 */
export function thePrintAsked(argv) {
  const at = argv.indexOf(PRINT_A_PAGE_SWITCH)
  if (at === -1) return null
  const html = argv[at + 1]
  const pdf = argv[at + 2]
  if (html === undefined || pdf === undefined || !isAbsolute(html) || !isAbsolute(pdf)) {
    throw new Error(`${COULD_NOT_PRINT} ${PRINT_A_PAGE_SWITCH} must be followed by the absolute paths of the page and of the PDF to write.`)
  }
  return { html, pdf }
}

/**
 * PRINT THE PAGE, WRITE THE PDF, AND END. main.mjs calls this before the app is ready, in place of
 * everything a window does.
 * @param {import('electron').App} app
 * @param {{ html: string, pdf: string }} asked
 */
export function printAPage(app, asked) {
  let ended = false
  /** Ends the run with 1, once, and says why on stderr in one line. @param {unknown} reason */
  const fail = (reason) => {
    if (ended) return
    ended = true
    const said = reason instanceof Error ? reason.message : String(reason)
    process.stderr.write(`${COULD_NOT_PRINT} ${said.replace(/\s+/gu, ' ').trim()}\n`)
    app.exit(1)
  }

  try {
    // Electron's own folder must be set before the app is ready, and must exist.
    const profile = join(dirname(asked.html), THE_PRINT_PROFILE_FOLDER)
    mkdirSync(profile, { recursive: true })
    app.setPath('userData', profile)
    // On a Mac a print run shows no icon in the Dock.
    app.dock?.hide()
  } catch (error) {
    fail(error)
    return
  }

  app
    .whenReady()
    .then(async () => {
      const { BrowserWindow, session } = await import('electron')
      const page = pathToFileURL(asked.html).href
      const kept = session.fromPartition(THE_PRINT_SESSION)
      // Only the page itself and data: addresses load. Every other request is cancelled before it leaves.
      kept.webRequest.onBeforeRequest((details, answer) => {
        answer({ cancel: !(details.url === page || details.url.startsWith('data:')) })
      })
      const window = new BrowserWindow({
        show: false,
        webPreferences: { javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false, session: kept },
      })
      const contents = window.webContents
      contents.on('will-navigate', (event) => event.preventDefault())
      contents.setWindowOpenHandler(() => ({ action: 'deny' }))
      // A part of the page that fails to load, such as a refused request, leaves the page to print. Only the
      // page itself failing ends the run.
      contents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
        if (isMainFrame) fail(`the page did not load: ${description} (${String(code)}).`)
      })
      contents.on('render-process-gone', (_event, details) => fail(`the page's process ended: ${details.reason}.`))
      contents.on('did-finish-load', () => {
        contents
          .printToPDF({ printBackground: true, preferCSSPageSize: true, pageSize: 'A4' })
          .then((pdf) => {
            if (ended) return
            writeFileSync(asked.pdf, pdf)
            ended = true
            app.exit(0)
          })
          .catch(fail)
      })
      await contents.loadURL(page)
    })
    .catch(fail)
}
