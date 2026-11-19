// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERSON WHO IS IN THE WRONG PLACE HAS NOT BROKEN ANYTHING, AND THE SCREEN MAY NOT SAY THEY HAVE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PINS, AND WHY IT IS ONE FILE AND NOT THIRTY-THREE ASSERTIONS
 * ---------------------------------------------------------------------------------------
 *
 * The language audit of 19 August 2026 walked four states a person reaches by being wrong and found
 * four different treatments of them:
 *
 *   a stopped server        **Failed.** HTTP 502 from /api/changes?limit=40  `Retry`
 *   a record in another     **✕ Failed.** a paragraph naming two workspace ids, telling the reader
 *   project                 in words to switch, and a `Retry` that cannot ever succeed
 *   a record that is not    **Failed.** No record with id NOPEnothere99  `Retry`
 *   there
 *   a page that is not      Not found. There is no page at "/recordz".  Today · All records
 *   there
 *
 * The fourth is the right one. Three of the four are not failures of anything: a mistyped link did
 * not break the product, and neither did opening a record that lives in another project. Drawing
 * **Failed.** at those readers says the product broke when they made a typo, and offering `Retry`
 * offers a button whose only possible outcome is the identical answer.
 *
 * SO THE CLASSIFICATION IS MADE ONCE AND THE DRAWING IS DECIDED ONCE. `readFault` in src/web/api.ts
 * turns a status and a reply body into one of five words; `ErrorNote` in src/web/components/ui.tsx
 * turns that word into a drawing. Nothing else in the browser classifies a failure and no page
 * writes an alarm panel of its own, which is what stops the next page written from adding a fifth
 * treatment. These tests hold that arrangement rather than the thirty-three strings it fixed.
 *
 * THE ROUTE IS THE PART THAT MUST NOT COME BACK. It used to be built into the message itself —
 * `HTTP ${status} from ${path}` — so every one of the forty-odd places that draws an error was free
 * to print it. It is on the fault now, beside the status and the server's own detail, and
 * `docs/UX-CONTRACT.md` puts all three in Inspect.
 *
 * The runner has no DOM, so the classifier is called directly and the components are rendered to
 * static markup with react-dom/server.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

type API = typeof import('../src/web/api.ts')
type UI = typeof import('../src/web/components/ui.tsx')
type MODE = typeof import('../src/web/lib/mode.ts')
let api: API
let ui: UI
let mode: MODE

beforeAll(async () => {
  // api.ts reads window.localStorage the moment it is imported: it restores the actor and the
  // project from it. Same stand-in the other component tests install, for the same reason.
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  }
  api = await import('../src/web/api.ts')
  ui = await import('../src/web/components/ui.tsx')
  mode = await import('../src/web/lib/mode.ts')
})

/** The markup with the hoisted style blocks removed, so a class name in the CSS is not evidence. */
function body(el: React.ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

/** Render in the mode named. Restored in the finally: the mode is module-level state. */
function inMode(el: React.ReactElement, which: 'normal' | 'inspect'): string {
  mode.setMode(which)
  try {
    return body(el)
  } finally {
    mode.setMode('normal')
  }
}

// ============================================================================ the classifier

describe('a failed request is classified once, from the status and the body', () => {
  // WHAT A PROXY ACTUALLY SENDS, which is why these bodies changed on 19 August. A gateway returns
  // HTML or plain text; it does not know Mole Office's error envelope and cannot produce `{error: "…"}`.
  // These cases used to feed a proxy's words INSIDE that envelope, which is a reply nothing can
  // send — and the rule they proved therefore had to be "the status alone decides", which is false:
  // `src/server/lib/resources.ts` throws a 502 saying which container was not stopped and a 503
  // saying containers cannot be reached, both in Mole Office's own words, both things a person must see.
  //
  // So the test is whether anything could SPEAK, not what number came back. A body Mole Office can read
  // means Mole Office answered; anything else means nothing answered.
  it('calls a gateway status with nothing readable "nothing answered", and never prints the number', () => {
    for (const status of [502, 503, 504]) {
      const fault = api.readFault(status, '/api/changes?limit=40', '<html><body>502 Bad Gateway</body></html>')
      expect(fault.kind).toBe('unreachable')
      // THE WORST STRING IN THE PRODUCT WAS THIS ONE. A person who has never run a web server does
      // not know that 502 means the thing behind this page is not running.
      expect(fault.message).toBe('Mole Office cannot reach its own server.')
      expect(fault.message).not.toContain(String(status))
      expect(fault.message).not.toContain('/api/')
      // And the route is kept, where a route belongs.
      expect(fault.path).toBe('/api/changes?limit=40')
      expect(fault.status).toBe(status)
    }
  })

  it('does not repeat a proxy’s own sentence, because it is not about this request', () => {
    // A proxy's page, as a proxy sends it: not JSON, no `error` field, nothing Mole Office can read.
    const fault = api.readFault(502, '/api/records', 'upstream connect error: connection refused')
    expect(fault.kind).toBe('unreachable')
    expect(fault.message).not.toContain('upstream')
  })

  it('shows the server’s own words when a gateway status carries them, because Mole Office sends those too', () => {
    // MEASURED RATHER THAN ASSUMED: `src/server/lib/resources.ts` throws a 502 naming the container
    // that was not stopped and a 503 saying containers cannot be reached. Both are the server's own
    // sentences about this request, and replacing them with "Mole Office cannot reach its own server"
    // tells the reader something false and throws away the only thing they could act on.
    //
    // `tools/review.mjs` proves the same claim from the other end, by mocking a 503 that says why
    // and requiring the words on screen. That proof failed for a whole morning while this rule was
    // "the status alone decides", and no test in the suite noticed.
    const said = 'Containers cannot be reached, so "zed-camera" was not stopped: the socket is closed.'
    const fault = api.readFault(503, '/api/resources/zed-camera', { error: said })
    expect(fault.kind).not.toBe('unreachable')
    expect(fault.message).toBe(said)
  })

  it('calls a 404 "not here", which is not a failure of anything', () => {
    const fault = api.readFault(404, '/api/records/NOPEnothere99', {
      error: 'There is no record at this address. It may have been deleted, or the link may be wrong.',
      detail: 'No record with id NOPEnothere99.',
    })
    expect(fault.kind).toBe('not-here')
    // The server's sentence is passed through and never replaced with a friendlier lie.
    expect(fault.message).toContain('There is no record at this address')
    // The id is kept, in the half that is for an agent and for Developer mode.
    expect(fault.detail).toContain('NOPEnothere99')
    expect(fault.message).not.toContain('NOPEnothere99')
  })

  it('calls a record in another project "elsewhere", and carries the two facts a button needs', () => {
    const fault = api.readFault(404, '/api/records/mnNEEXKzEiWs', {
      error: '"PLA filament, 2 spools" is in another project.',
      elsewhere: { title: 'PLA filament, 2 spools', workspaceId: 'robotics', recordId: 'mnNEEXKzEiWs' },
    })
    expect(fault.kind).toBe('elsewhere')
    expect(fault.elsewhere?.workspaceId).toBe('robotics')
    expect(fault.elsewhere?.recordId).toBe('mnNEEXKzEiWs')
  })

  it('leaves an ordinary refusal alone: the server understood and said no, and said why', () => {
    const fault = api.readFault(400, '/api/records', { error: 'A session name must not be blank.' })
    expect(fault.kind).toBe('refused')
    expect(fault.message).toBe('A session name must not be blank.')
  })

  it('says so plainly when the server answered with nothing anybody can read', () => {
    const fault = api.readFault(418, '/api/records', null)
    expect(fault.kind).toBe('broken')
    expect(fault.message).not.toContain('418')
    expect(fault.detail).toContain('418')
  })
})

// ============================================================================ the drawing

describe('the fault decides the drawing, and it is decided in one place', () => {
  const notHere = (): unknown =>
    api.readFault(404, '/api/records/NOPEnothere99', {
      error: 'There is no record at this address. It may have been deleted, or the link may be wrong.',
      detail: 'No record with id NOPEnothere99.',
    })

  it('draws a thing that is not there quietly, with no alarm word and no Retry', () => {
    const html = body(
      h(ui.ErrorNote, { message: 'ignored', fault: notHere() as never, retry: () => {} }),
    )
    // The router's own not-found page is the model: quiet, short, a way out, no alarm chrome.
    expect(html).toContain('There is no record at this address')
    expect(html).not.toContain('Failed.')
    expect(html).not.toContain('role="alert"')
    // A Retry whose only possible outcome is the identical answer is a button that wastes a press.
    expect(html).not.toContain('Retry')
  })

  it('opens a record in the project it is really in, instead of telling the reader to switch', () => {
    const fault = api.readFault(404, '/api/records/mnNEEXKzEiWs', {
      error: '"PLA filament, 2 spools" is in another project.',
      elsewhere: { title: 'PLA filament, 2 spools', workspaceId: 'robotics', recordId: 'mnNEEXKzEiWs' },
    })
    const html = body(h(ui.ErrorNote, { message: 'ignored', fault: fault as never, retry: () => {} }))
    expect(html).toContain('PLA filament, 2 spools')
    // A CONTROL, NOT A SENTENCE. The screen used to say "Switch to robotics and open it there" —
    // the interface asking the reader to do a thing the interface could do.
    expect(html).toContain('Open it in')
    expect(html).not.toContain('Failed.')
    expect(html).not.toContain('Retry')
  })

  it('says a stopped server is a stopped server, in English, and keeps the route for Developer mode', () => {
    const fault = api.readFault(502, '/api/changes?limit=40', {})
    const normal = inMode(h(ui.ErrorNote, { message: 'ignored', fault: fault as never, retry: () => {} }), 'normal')
    expect(normal).toContain('Mole Office cannot reach its own server.')
    expect(normal).toContain('so it is blank rather than empty')
    // A person tries again; a program retries.
    expect(normal).toContain('Try again')
    expect(normal).not.toContain('/api/changes')
    expect(normal).not.toContain('502')

    const developer = inMode(h(ui.ErrorNote, { message: 'ignored', fault: fault as never, retry: () => {} }), 'inspect')
    expect(developer).toContain('/api/changes?limit=40')
    expect(developer).toContain('502')
  })

  it('draws a refusal exactly as it always did, because the server understood and said no', () => {
    const fault = api.readFault(400, '/api/records', { error: 'A session name must not be blank.' })
    const html = body(h(ui.ErrorNote, { message: 'A session name must not be blank.', fault: fault as never }))
    expect(html).toContain('Failed.')
    expect(html).toContain('A session name must not be blank.')
  })

  it('is unchanged for a caller that hands over no fault at all', () => {
    // Thirty-odd callers report a refused WRITE and write their own label and their own sentence.
    const html = body(h(ui.ErrorNote, { message: 'Nothing was written.', label: 'Not applied.' }))
    expect(html).toContain('Not applied.')
    expect(html).toContain('Nothing was written.')
  })
})

// ============================================================================ the server's own prose

describe('a paragraph the server wrote for a caller reading JSON does not reach a normal screen', () => {
  const NOTE =
    `No anchor is recorded for human:${THE_TEST_OFFICES_OWNER.id}, so Mole Office cannot say what has changed since you last ` +
    'looked. PUT /api/anchor marks the point you have read to.'

  it('draws nothing at all in Normal, so a note cannot leak by default', () => {
    expect(inMode(h(ui.ServerNote, { text: NOTE }), 'normal')).toBe('')
  })

  it('draws it whole and unedited in Developer mode, because nothing is destroyed', () => {
    const developer = inMode(h(ui.ServerNote, { text: NOTE }), 'inspect')
    expect(developer).toContain('PUT /api/anchor')
    expect(developer).toContain(`human:${THE_TEST_OFFICES_OWNER.id}`)
  })

  it('draws nothing for a note that is absent or blank, rather than an empty paragraph', () => {
    expect(inMode(h(ui.ServerNote, { text: null }), 'inspect')).toBe('')
    expect(inMode(h(ui.ServerNote, { text: '   ' }), 'inspect')).toBe('')
  })
})

/**
 * A "NOT HERE" THE SERVER WORDED AND GAVE NO CODE FOLLOWS ERRORNOTE'S ONE RULE (wave 13k round 42).
 * WrongTurn drew such a sentence bare, so a Chinese page read the server's English with nothing to
 * say whose words they were. Now it is drawn as an uncoded refusal is (decision urY1I-insR_8): the
 * sentence first, marked as the office's own words after it, the whole of it a press away when the
 * door also wrote a short reason. A sentence the page wrote itself is drawn as it was.
 */
describe('a "not here" the server worded with no code says whose words they are', () => {
  async function loaded(search: string): Promise<{ api: API; ui: UI }> {
    const store = new Map<string, string>()
    ;(globalThis as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
      location: { hash: '', search },
    }
    vi.resetModules()
    return { api: await import('../src/web/api.ts'), ui: await import('../src/web/components/ui.tsx') }
  }
  const SAID = 'There is no record at this address. It may have been deleted, or the link may be wrong.'
  const MARK = { en: 'The reason above is in the office’s own words.', zh: '以上原因是办公室的原文。' }

  for (const [lang, search] of [['en', ''], ['zh', '?lang=zh']] as const) {
    it(`${lang}: puts the server's sentence first, in English, and marks it as the office's own after it`, async () => {
      const { api: a, ui: u } = await loaded(search)
      const fault = a.readFault(404, '/api/records/NOPEnothere99', { error: SAID })
      const html = body(h(u.ErrorNote, { message: 'ignored', fault }))
      const said = html.indexOf(`<span class="px-error-said" lang="en">${SAID}</span>`)
      expect(said, 'the sentence is not drawn as the office’s quoted words').toBeGreaterThan(-1)
      expect(html.indexOf(MARK[lang]), 'the mark is missing or comes before the sentence').toBeGreaterThan(said)
    })

    it(`${lang}: draws a short reason first and keeps the whole sentence a press away`, async () => {
      const { api: a, ui: u } = await loaded(search)
      const fault = a.readFault(404, '/api/records/NOPEnothere99', { error: SAID, reason: 'No record has this id.' })
      const html = body(h(u.ErrorNote, { message: 'ignored', fault }))
      expect(html).toContain('<span class="px-error-said" lang="en">No record has this id.</span>')
      expect(html).toContain(`<span class="px-error-long" lang="en">${SAID}</span>`)
      expect(html).toContain(MARK[lang])
    })

    it(`${lang}: draws a sentence the page wrote itself as it was, with no mark`, async () => {
      const { ui: u } = await loaded(search)
      const fault = { kind: 'not-here' as const, message: 'the page’s own sentence', said: null, path: '/x', status: 404, reason: null, detail: null, stored: null, elsewhere: null }
      const html = body(h(u.ErrorNote, { message: 'ignored', fault }))
      expect(html).toContain('the page’s own sentence')
      expect(html).not.toContain(MARK[lang])
    })
  }
})
