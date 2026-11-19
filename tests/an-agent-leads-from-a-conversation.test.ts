// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/** New fake-runtime completions now submit an explicit record manifest; the lead and navigation assertions are unchanged. */
/**
 * AN AGENT LEADS FROM A CONVERSATION. Criterion M23 of design/messages/ACCEPTANCE.md, section 9.
 *
 * *When asked in words to take the person to a page, the agent files a lead (M8) and, if the person is following,
 * the page moves; the worker's prompt and the skill say how, in one place; a link in the text is
 * still drawn, and is not what "take me there" means.*
 *
 * The point behind it: told "take me there" in a conversation, an agent could send a link that the person
 * had to press, rather than taking the person to that page itself. Problem
 * `e98DakSPxDwT`.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE PLACE, AND WHICH WAY ROUND IT IS
 * ---------------------------------------------------------------------------------------
 *
 * **The skill is the source and the prompt reads it.** `## When somebody asks you to take them to a
 * page` in `.claude/skills/mole-office/SKILL.md` is the only text that says how; `howToLead` in
 * src/worker/rules.ts cuts that section out by its heading and `promptFor` puts it in the prompt,
 * and the same heading is in `SKILL_SECTIONS` so the generated `AGENTS.md` carries it too. Nothing
 * holds a copy. The first two tests below are what makes that true rather than intended.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS REAL HERE AND WHAT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * The server, the browser, the messages, the lead and the page that moves are all real. The agent
 * tool is `tests/fake-runtime.mjs`, which reads its prompt and does what it says: it files a lead
 * when the prompt carried the section telling it how, and names a link in its words when it did
 * not. So what these tests watch is the prompt working, not the script knowing about leads.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { HOW_TO_LEAD, howToLead } from '../src/worker/rules.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))
const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

let restoreFixtureFetch: (() => void) | undefined
let app: LiveApp
let outputs: string
let settings: WorkerSettings
const watching: Parameters<typeof onePass>[1] = []

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function write(body: unknown): Promise<Record<string, unknown>> {
  const reply = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify(body),
  })
  return (await reply.json()) as Record<string, unknown>
}

async function read(path: string): Promise<Record<string, unknown>> {
  const reply = await fetch(`${app.api}${path}`, { headers: AS_THE_OWNER })
  return (await reply.json()) as Record<string, unknown>
}

/** File one note and give back its id. */
async function note(title: string): Promise<string> {
  const held = await write({ kind: 'note', title, data: { date: '2026-09-04', body: 'Somewhere to be taken.' } })
  return (held['record'] as { id: string }).id
}

/** Register a durable agent and give back its registry id. */
async function anAgent(handle: string): Promise<string> {
  await write({ kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code', workArea: ['records'] } })
  const listed = (await read('/api/participants')) as { agents?: { id: string; handle: string }[] }
  const found = (listed.agents ?? []).find((a) => a.handle === handle)
  if (found === undefined) throw new Error(`no registry row for ${handle}`)
  return found.id
}

/** Say something to an agent, as the owner. */
async function say(agentId: string, body: string): Promise<string> {
  const held = await write({
    kind: 'message',
    title: body.slice(0, 60),
    data: { body, to: [{ kind: 'agent', id: agentId }] },
  })
  const id = (held['record'] as { id: string }).id
  // AND THE PERSON PRESSES TO START AN AGENT FOR IT. Criterion M78: the agent here is fresh and has
  // no conversation of its own to pick up, so a message to it waits for the person's press rather than
  // starting a run by itself. This file is about the LEAD the run then files, so the press is setup.
  await fetch(`${app.api}/api/messages/${id}/start-an-agent`, { method: 'POST', headers: AS_THE_OWNER, body: '{}' })
  return id
}

/** Every message in the pool that carries a lead, with what it leads to. */
async function leads(): Promise<{ id: string; sentBy: { id: string } | null; body: string; lead: unknown }[]> {
  const pool = (await read('/api/messages?full=1')) as {
    messages?: { id: string; sentBy: { id: string } | null; body: string; lead: unknown }[]
  }
  return (pool.messages ?? []).filter((one) => one.lead !== null && one.lead !== undefined)
}

/** Run worker passes until something is true, or say it never was. */
async function until(what: () => Promise<boolean>, within = 30_000): Promise<boolean> {
  const deadline = Date.now() + within
  for (;;) {
    await onePass(settings, watching)
    if (await what()) return true
    if (Date.now() >= deadline) return false
    await new Promise((go) => setTimeout(go, 200))
  }
}

const whereWeAre = async (): Promise<string> => app.page.evaluate(() => window.location.hash)

beforeAll(async () => {
  app = await liveApp({ name: 'an-agent-leads-from-a-conversation', viewport: { width: 1280, height: 900 } })
  // This fake runtime submits a labelled completion note through the real finish writer.
  // Its conversational lead is still filed by the worker, with every original assertion intact.
  const realFetch = globalThis.fetch
  const fixtureFetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (String(url).startsWith(`${app.api}/api/records/`) && init?.method === 'PATCH' && typeof init.body === 'string') {
      const payload = JSON.parse(init.body) as { dataPatch?: Record<string, unknown> }
      if (payload.dataPatch?.['state'] === 'finished' && !payload.dataPatch['submission']) {
        const made = await realFetch(`${app.api}/api/records`, { method: 'POST', headers: AS_THE_OWNER, body: JSON.stringify({ kind: 'note', title: 'Synthetic fixture: runtime completed', data: {} }) })
        if (!made.ok) throw new Error(await made.text())
        const held = await made.json() as { record: { id: string } }
        payload.dataPatch['submission'] = { kind: 'records', records: [held.record.id] }
        return realFetch(url, { ...init, body: JSON.stringify(payload) })
      }
    }
    return realFetch(url, init)
  })
  restoreFixtureFetch = () => fixtureFetch.mockRestore()
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-leading-runs-'))
  settings = {
    api: app.api,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: aCheckoutForATestRun(),
    runs: 2,
    hops: 3,
    outputRoot: outputs,
    // THE TEST OFFICE'S DATABASE, so the worker finds the office's key beside it, as the worker of a real office does.
    // A run's served conditions are written at its end only by the run's own agent with a key or by the office itself,
    // and the worker is the office only with the office's key, even while the key window is open.
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: FAKE, MOLE_OFFICE_DB: join(app.dir, 'panelx.db') },
  }
}, 180_000)

afterAll(async () => {
  restoreFixtureFetch?.()
  for (const left of watching.splice(0, watching.length)) left.adapter.stop(left.handle, 'the test is over')
  await app.stop()
  rmSync(outputs, { recursive: true, force: true })
})

describe('how to take somebody to a page is written in one place', () => {
  it('stops a run rather than starting one that does not know how, when the heading has moved', () => {
    // A SKILL THAT NO LONGER HAS THAT HEADING. Renaming the section is the way this breaks, and the
    // generator refuses by name rather than handing a run a prompt with a hole in it. Silence here
    // would be an agent answering "take me there" with a link and nothing saying why.
    const elsewhere = mkdtempSync(join(tmpdir(), 'mole-office-skill-'))
    mkdirSync(join(elsewhere, '.claude', 'skills', 'mole-office'), { recursive: true })
    writeFileSync(
      join(elsewhere, '.claude', 'skills', 'mole-office', 'SKILL.md'),
      '# Mole Office\n\n## Something else entirely\n\nNot about leading anybody anywhere.\n',
      'utf8',
    )
    expect(() => howToLead(elsewhere)).toThrow(new RegExp(HOW_TO_LEAD))
    expect(() => howToLead(elsewhere)).toThrow(/No run was started/)
    rmSync(elsewhere, { recursive: true, force: true })

    // AND A CHECKOUT WITH NO SKILL AT ALL is refused too, and says which file is missing.
    expect(() => howToLead(join(CHECKOUT, 'tests'))).toThrow(/take somebody to a page/)
  })
})

describe('asked in words to be taken somewhere, the agent files a lead', () => {
  let agentId: string
  let somewhere = ''

  it('files a lead naming the record, and not only a link in its words', async () => {
    agentId = await anAgent('guide-w')
    somewhere = await note('The place the person asked to be taken to')
    await say(agentId, `take me to ${somewhere}`)

    expect(await until(async () => (await leads()).length > 0)).toBe(true)
    const filed = (await leads()).filter((one) => one.sentBy?.id === agentId)
    expect(filed).toHaveLength(1)
    // THE TARGET IS WHAT THE AGENT WROTE. The stored lead also carries a `place`, which the write
    // door fills in, so this reads the half the agent is responsible for.
    expect((filed[0]?.lead as { target?: unknown } | null)?.target).toEqual({
      kind: 'record',
      recordId: somewhere,
      workspaceId: 'default',
    })

    // AND THE WORDS STILL NAME THE RECORD, so a reader who is not following gets a link as well.
    // A link is not what "take me there" means; it is what is left when leading is refused.
    const said = (await read('/api/messages?full=1')) as { messages?: { sentBy: { id: string } | null; body: string }[] }
    expect(
      (said.messages ?? []).some((one) => one.sentBy?.id === agentId && one.body.includes(somewhere)),
      'nothing the agent said named the record',
    ).toBe(true)
  }, 120_000)

  it('moves the page of a browser that is following it', async () => {
    await app.page.goto(`${app.site}/#/records`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)

    // ---- THE OFFER IS DRAWN AND NOTHING MOVES, because this browser follows nobody yet.
    await app.page.waitForSelector('.px-lead-offer', { timeout: 60_000 })
    expect(await whereWeAre()).toBe('#/records')

    // ---- FOLLOWING IS STARTED FROM THE RIGHT-CLICK MENU, which is the person's act and not the agent's.
    await app.page.click('main.page', { button: 'right', position: { x: 20, y: 20 } })
    // BEHIND ONE MORE PRESS since a decision, the criterion change of 27 September 2026.
    await app.page.click('.px-talk-more-btn')
    await app.page.waitForSelector('.px-lead-follow', { timeout: 30_000 })
    await app.page.click('.px-lead-follow')
    await app.page.waitForSelector('.px-lead-stop', { timeout: 30_000 })

    // ---- AND NOW THE PERSON ASKS IN WORDS, AND THE PAGE MOVES WITH NO PRESS.
    const second = await note('The second place the person asked for')
    await say(agentId, `take me to ${second}`)
    expect(
      await until(async () => (await leads()).some((one) => JSON.stringify(one.lead).includes(second))),
    ).toBe(true)
    await app.page.waitForFunction((where: string) => window.location.hash === where, `#/r/${second}`, {
      timeout: 60_000,
    })
    // AND THE AGENT'S WORDS ARE ON THE PAGE IT TOOK THE PERSON TO.
    await app.page.waitForSelector('.px-lead-brought', { timeout: 30_000 })
    expect(await app.page.textContent('.px-lead-brought')).toContain('guide-w')
  }, 180_000)
})
