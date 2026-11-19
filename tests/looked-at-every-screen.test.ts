// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TOOLS THAT LOOK AT EVERY SCREEN HAVE TO BE ABLE TO SEE NOTHING.
 *
 * This tests tools/legibility.mjs against a stand-in app served from this process — a rail with
 * plenty of words in it and a `main.page` whose content this file decides, page by page. Three
 * defects are planted in it, one per page, and the test asserts that the tool names each of them
 * and exits non-zero. A second run of the same stand-in app with the three defects removed walks
 * every page and asserts it exits zero, because a check that fails on everything says nothing
 * about anything. The faulty run visits only the three pages that carry a fault.
 *
 * WHY A STAND-IN APP AND NOT THE REAL ONE. The real one needs a database, an API and Vite, which is
 * a minute of setup for each case and is what `node tools/review.mjs` is for. What is under test
 * here is the JUDGEMENT — is this page empty, is this edge invisible, is this sentence too small —
 * and that judgement reads a rendered page and does not care who rendered it. The three defects are
 * planted in the exact shape the real ones took:
 *
 *   1. ONE PAGE'S CONTENT AREA DRAWS NOTHING while the rail still draws 30-odd words. This is the
 *      defect measured on 14 August 2026: the "Missing and unused" page was made to render nothing,
 *      tools/review.mjs photographed it and reported success, and tools/legibility.mjs exited 0
 *      because it counted text nodes over the whole document and the rail cleared its floor alone.
 *      If either floor is ever counted over `document.body` again, this test goes red.
 *   2. ONE CONTROL'S BORDER IS ALMOST THE COLOUR BEHIND IT and its fill is transparent, so nothing
 *      on the screen says where the control ends. The tool found this class of thing already; what
 *      it did not do was fail.
 *   3. ONE FULL SENTENCE IS SET AT 10px inside the content area. Same again: found, printed, and
 *      then exited 0 over.
 *
 * The stand-in app answers every address, so the page list still comes out of the real router and
 * the real KIND_FAMILIES — this test does not restate which pages exist.
 */

import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer, type Server } from 'node:http'
import { type AddressInfo } from 'node:net'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { READY_ATTRIBUTE } from '../tools/the-page-is-ready.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))

/** The address the router gives the "Missing and unused" page. Read below, never written down. */
const BLANK_ADDRESS = '#/missing'
/** The address whose control gets an invisible edge. */
const FAINT_ADDRESS = '#/records'
/** The address whose prose is set too small. */
const TINY_ADDRESS = '#/plan'

/**
 * A stand-in app. One document that answers every address and renders from the hash, so the page
 * list can still be the real one.
 *
 * `withDefects` false is the control: the same pages, the same rail, none of the three faults.
 */
function standInApp(withDefects: boolean): string {
  const faintBorder = withDefects ? '#f2f3f5' : '#767676'
  const proseSize = withDefects ? '10px' : '16px' // only ever applied to the one page below
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>stand-in</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; background: #ffffff; color: #16181c; font: 16px/1.5 system-ui, sans-serif; }
  .shell-side { float: left; width: 220px; padding: 12px; }
  .shell-side a { display: block; color: #16181c; padding: 4px 0; font-size: 14px; }
  main.page { margin-left: 240px; padding: 24px; min-height: 200px; }
  main.page p { font-size: 16px; }
  main.page p.tiny-prose { font-size: ${proseSize}; }
  .faint-control { border: 1px solid ${faintBorder}; background: transparent; color: #16181c;
                   font-size: 14px; padding: 6px 10px; }
</style></head>
<body>
<aside id="shell-side" class="shell-side">
  <a href="#/">Today and what needs you</a>
  <a href="#/records">Every record this project holds</a>
  <a href="#/modules">The modules and what carries them</a>
  <a href="#/pipeline">Pipelines and the shape of the work</a>
  <a href="#/sessions">Sessions, running and finished</a>
  <a href="#/missing">Missing and unused</a>
  <a href="#/plan">The plan for this week</a>
  <a href="#/plans">The plans written so far</a>
  <a href="#/decisions">Decisions waiting on a person</a>
  <a href="#/ui">The component sheet</a>
</aside>
<main class="page" id="main"></main>
<script>
  const BLANK = ${JSON.stringify(BLANK_ADDRESS)}
  const FAINT = ${JSON.stringify(FAINT_ADDRESS)}
  const TINY = ${JSON.stringify(TINY_ADDRESS)}
  const DEFECTS = ${JSON.stringify(withDefects)}
  const ordinary =
    '<h1>A page with something on it</h1>' +
    '<p>This paragraph is long enough to count as a full sentence by any measure the tool applies.</p>' +
    '<p>And here is a second one, so that the content area is never near any floor at all.</p>' +
    '<button class="faint-control">Open this record</button>'
  function render() {
    const main = document.querySelector('main.page')
    const at = location.hash === '' ? '#/' : location.hash
    if (DEFECTS && at === BLANK) { main.innerHTML = '' ; return }
    if (at === FAINT) {
      main.innerHTML =
        '<h1>Records</h1>' +
        '<p>Every record this project holds, listed here with the words that make it findable.</p>' +
        '<button class="faint-control">Open this record</button>'
      return
    }
    if (at === TINY) {
      main.innerHTML =
        '<h1>The plan</h1>' +
        '<p class="tiny-prose">This is a full sentence of prose with far more than eight words in it, and it is the ' +
        'kind of thing a reader has to get through rather than glance at.</p>'
      return
    }
    main.innerHTML = ordinary
  }
  // AND IT SAYS WHEN IT HAS FINISHED DRAWING, in the app's own way. The tools wait for the ready
  // attribute on the html element rather than for the network to go quiet, so a stand-in that
  // never wrote one would be photographed by nothing. The name comes from the tool's own module,
  // so this stand-in cannot drift from what the tool waits for.
  function ready() {
    document.documentElement.setAttribute(${JSON.stringify(READY_ATTRIBUTE)}, location.hash)
  }
  addEventListener('hashchange', () => { render(); ready() })
  render()
  ready()
</script>
</body></html>`
}

/** The smallest API the tool needs: one module to build a record address from, and no plans. */
function standInApi(): Server {
  return createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0]
    res.setHeader('content-type', 'application/json')
    if (path === '/api/records') {
      res.end(
        JSON.stringify({
          records: [{ id: 'test-module-1', kind: 'module', title: 'A module', incompleteCount: 0 }],
        }),
      )
      return
    }
    if (path === '/api/plans') {
      res.end(JSON.stringify({ plans: [] }))
      return
    }
    res.statusCode = 404
    res.end(JSON.stringify({ error: `the stand-in API does not serve ${path}` }))
  })
}

const listen = async (server: Server): Promise<number> => {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return (server.address() as AddressInfo).port
}

/** Run the tool against the stand-in app and give back everything it said and how it ended. */
async function runLegibility(webPort: number, apiPort: number, label: string, pages?: string[]) {
  const child = spawn(
    process.execPath,
    [
      'tools/legibility.mjs',
      '--label',
      label,
      '--web',
      `http://127.0.0.1:${webPort}`,
      '--api',
      `http://127.0.0.1:${apiPort}`,
      '--themes',
      'light',
      ...(pages === undefined ? [] : ['--pages', pages.join(',')]),
    ],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const out: string[] = []
  child.stdout.on('data', (c) => out.push(String(c)))
  child.stderr.on('data', (c) => out.push(String(c)))
  const [code] = (await once(child, 'exit')) as [number | null]
  return { code, said: out.join('') }
}

describe('tools/legibility.mjs fails on what it finds', () => {
  // The clean run visits every page the router declares. The faulty run needs only the three
  // pages with planted defects; one run finds all three and the assertions read what it said.
  let clean: { code: number | null; said: string }
  let faulty: { code: number | null; said: string }
  const servers: Server[] = []

  beforeAll(async () => {
    const api = standInApi()
    servers.push(api)
    const apiPort = await listen(api)
    const serve = async (body: string) => {
      const server = createServer((_req, res) => {
        res.setHeader('content-type', 'text/html; charset=utf-8')
        res.end(body)
      })
      servers.push(server)
      return listen(server)
    }
    const cleanPort = await serve(standInApp(false))
    const faultyPort = await serve(standInApp(true))
    clean = await runLegibility(cleanPort, apiPort, 'test-control')
    faulty = await runLegibility(faultyPort, apiPort, 'test-defects', ['queries', 'records', 'plan'])
  }, 300_000)

  afterAll(() => {
    for (const server of servers) {
      server.close()
      server.closeAllConnections?.()
    }
  })

  // THE CONTROL, AND IT COMES FIRST ON PURPOSE. A run that never started looks exactly like a run
  // that failed, so the same command over the same stand-in app with the three faults taken out has
  // to come back clean before any of the reds below mean anything.
  it('exits 0 over a stand-in app with none of the three faults in it', () => {
    expect(clean.said).toContain('TYPE at 1440px')
    expect(clean.said).toContain('EVERY DISTINCT EDGE BELOW 3:1 (0 of them)')
    expect(clean.said).not.toContain('DREW NOTHING')
    expect(clean.code).toBe(0)
  })

  it('names the page whose content area drew nothing, and fails', () => {
    expect(faulty.said).toContain('measuring 3 selected pages')
    // The rail is still drawn on that page, which is exactly why a floor counted over the whole
    // document missed this. If this ever passes with the words below missing, the floor has gone
    // back to counting the furniture.
    expect(faulty.said).toContain('DREW NOTHING in their content area')
    expect(faulty.said).toMatch(/queries\/light \(0 text nodes, 0 words\)/)
    expect(faulty.code).toBe(1)
  })

  it('names a control whose edge cannot be seen, and fails', () => {
    expect(faulty.said).toMatch(/EVERY DISTINCT EDGE BELOW 3:1 \([1-9]\d* of them\)/)
    expect(faulty.said).toContain('button.faint-control')
    expect(faulty.said).toContain('distinct bordered controls or indicators are below 3:1')
    expect(faulty.code).toBe(1)
  })

  it('names a page whose prose is set below the size floor, and fails', () => {
    expect(faulty.said).toContain('full sentences are set below 13px')
    expect(faulty.said).toContain('plan/light')
    expect(faulty.code).toBe(1)
  })
})
