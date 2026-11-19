// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * SWITCHING THE PROJECT DOES NOT CHANGE THE CONTACTS OR LOSE A CONVERSATION. CRITERION M55.
 *
 * A serious fault: after switching to another project the contacts were different, some
 * messages were new, and the conversation with the secretary was gone entirely. It needed looking into.
 *
 * ---------------------------------------------------------------------------------------
 * THE CAUSE, MEASURED BEFORE ANY OF THIS WAS WRITTEN
 * ---------------------------------------------------------------------------------------
 *
 * On a copy of the owner's corpus (tools/isolated-mole-office.mjs, 6 September 2026):
 *
 *   GET /api/messages/contacts with `x-mole-office-workspace: panelx`    5 contacts
 *   the same request with `robotics`                                     10 contacts
 *   GET /api/messages/conversation?kind=agent&id=<secretary> in panelx   17 messages
 *   the same in robotics                                                  2 messages
 *
 * A message is a record and a record belongs to one project, so every read the chat made narrowed
 * the pool to the project in the header. The registries do not: `people` and `agents` are
 * installation-level tables with no workspace column, so WHO exists never changed. What changed was
 * every conversation, every unread count, the order of the list — a contact with nothing said in
 * this project sorts to the bottom with no last line — and the rows for writers nobody registered,
 * which are derived from the same narrowed pool. That is all three of the things the owner saw at once.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * Two projects, and one contact written to in each. Then, in a browser, with the project switcher:
 *
 *   1. THE CONTACTS ARE THE SAME LIST, in the same order, in both projects.
 *   2. THE CONVERSATION IS THE SAME CONVERSATION, holding what was said in both projects, opened
 *      from either.
 *   3. A MESSAGE WRITTEN IN THE OTHER PROJECT SAYS SO, by the project's name. "Where it matters"
 *      is the exception, so the mark is on the message from elsewhere and not on the one from here.
 *
 * ---------------------------------------------------------------------------------------
 * THE CONTROL
 * ---------------------------------------------------------------------------------------
 *
 * The switch is proved rather than assumed: the second project is read back off the switcher after
 * it is chosen, and each case waits for the conversation to be drawn before reading it. Without
 * that, a switcher that did nothing would make "the two lists are the same" true for the wrong
 * reason — which is the one way this test could pass on the broken build.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { switchTheProject, theProjectIdOnScreen } from './switch-the-project.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { openTheChat as openTheChatFromTheShell } from './open-the-chat.ts'

let app: LiveApp

const HERE = 'first-project'
const THERE = 'second-project'
const THERE_IS_CALLED = 'Second project'

/** What was said where. Each body is unique, so a message is identified by its words. */
const SAID_HERE = 'Written in the first project.'
const SAID_THERE = 'Written in the second project.'

/** The group opened in the first project, and the words written into it from each project. */
const THE_GROUP = 'The load cell'
const SAID_IN_THE_GROUP = 'Said in the group from the first project.'
const SAID_FROM_THERE = 'Typed into the group from the second project.'
let theGroupId = ''

function asTheOwner(workspaceId: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': workspaceId,
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_PERSON,
  }
}

/** The agent's own identity. A message is somebody speaking, so the agent's lines are written as it. */
function asTheAgent(workspaceId: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': workspaceId,
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': THE_TEST_OFFICES_SECRETARY.handle,
  }
}

async function post(path: string, workspaceId: string, body: unknown, as = asTheOwner): Promise<Response> {
  const sent = await fetch(`${app.api}${path}`, {
    method: 'POST',
    headers: as(workspaceId),
    body: JSON.stringify(body),
  })
  expect(sent.status, await sent.clone().text()).toBe(201)
  return sent
}

/** The contacts the panel is drawing, by their words, in the order they are drawn. */
async function contactsOnScreen(): Promise<string[]> {
  await app.page.waitForSelector('.px-chat-contact', { timeout: 30_000 })
  return app.page.$$eval('.px-chat-contact', (all) => all.map((one) => (one.textContent ?? '').trim()))
}

/** Which project the sidebar's project block is on, read off the block itself. */
async function theProjectOnScreen(): Promise<string | null> {
  return theProjectIdOnScreen(app.page)
}

async function switchTo(workspaceId: string): Promise<void> {
  await switchTheProject(app.page, workspaceId)
  await waitForThePage(app.page, 30_000)
  // THE CONTROL FOR EVERY CASE BELOW: the switch really happened.
  expect(await theProjectOnScreen(), 'the project switcher did not move').toBe(workspaceId)
}

/**
 * The panel open, at the list of contacts.
 *
 * IT PRESSES BACK WHEN A CONVERSATION IS ALREADY OPEN. The panel remembers who the reader was
 * talking to, so after a case has opened one it reopens on that conversation — and then the list of
 * contacts is not on screen at all. Waiting for a contact row without this would time out on a
 * panel that is working perfectly.
 */
async function openTheChat(): Promise<void> {
  await openTheChatFromTheShell(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 30_000 })
  const back = await app.page.$('.px-chat-back')
  if (back !== null) await back.click()
  await app.page.waitForSelector('.px-chat-contact', { timeout: 30_000 })
}

/** Every message drawn in the open conversation: its words, and the project mark under it. */
async function whatIsDrawn(): Promise<{ body: string; project: string | null }[]> {
  await app.page.waitForSelector('.px-chat-one', { timeout: 30_000 })
  return app.page.$$eval('.px-chat-one', (all) =>
    all.map((one) => ({
      body: (one.querySelector('.px-chat-words')?.textContent ?? '').trim(),
      project: one.querySelector('.px-chat-project')?.textContent ?? null,
    })),
  )
}

beforeAll(async () => {
  app = await liveApp({ name: 'chat-across-projects', viewport: { width: 1440, height: 1000 } })

  // TWO PROJECTS. The first is the one a fresh database starts in under another name, so it is made
  // here like the second and neither is special.
  for (const [id, title] of [
    [HERE, 'First project'],
    [THERE, THERE_IS_CALLED],
  ]) {
    const made = await fetch(`${app.api}/api/workspaces`, {
      method: 'POST',
      headers: asTheOwner('default'),
      body: JSON.stringify({ id, title }),
    })
    expect(made.status, await made.clone().text()).toBe(201)
  }

  // ONE AGENT, REGISTERED ONCE. Its record is filed in the first project; the registry is the
  // installation's, which is the fact the cause above turns on.
  await post('/api/records', HERE, {
    kind: 'agent',
    title: THE_TEST_OFFICES_SECRETARY.name,
    data: { handle: THE_TEST_OFFICES_SECRETARY.handle, runtime: 'claude-code', state: 'active' },
  })

  // AND SOMETHING SAID IN EACH PROJECT, both to the owner, so the conversation has two halves.
  await post(
    '/api/records',
    HERE,
    { kind: 'message', title: 'From the first', data: { body: SAID_HERE, to: [{ kind: 'person', id: THE_PERSON }] } },
    asTheAgent,
  )
  await post(
    '/api/records',
    THERE,
    { kind: 'message', title: 'From the second', data: { body: SAID_THERE, to: [{ kind: 'person', id: THE_PERSON }] } },
    asTheAgent,
  )

  // AND A GROUP, OPENED IN THE FIRST PROJECT, with the owner and the agent in it. Decision
  // `t5DlN5-uTZoT` makes it the person's, so the cases at the foot of this file read it from the
  // second project. Opening it writes the line saying it was opened, which is what those cases find.
  const opened = await post('/api/groups', HERE, {
    name: THE_GROUP,
    because: 'Two of us are on the same bench.',
    members: [
      { who: { kind: 'person', id: THE_PERSON }, because: 'The owner opened it.' },
      { who: { kind: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle }, because: 'It is doing the pulls.' },
    ],
  })
  theGroupId = ((await opened.json()) as { group: { id: string } }).group.id
  await post(
    '/api/records',
    HERE,
    {
      kind: 'message',
      title: 'Into the group',
      data: { body: SAID_IN_THE_GROUP, toGroup: theGroupId },
    },
    asTheAgent,
  )

  await app.page.goto(`${app.site}/#/`)
  await waitForThePage(app.page, 30_000)
  await switchTo(HERE)
}, 240_000)

afterAll(async () => {
  await app.stop()
})

describe('the chat is the person’s, whichever project is open', () => {
  it('draws the same contacts in both projects, in the same order', async () => {
    await openTheChat()
    const here = await contactsOnScreen()
    expect(here.length, 'the panel drew no contacts, so nothing here is measured').toBeGreaterThan(0)
    expect(here.some((one) => one.includes(THE_TEST_OFFICES_SECRETARY.name)), `${THE_TEST_OFFICES_SECRETARY.name} is not a contact in the first project`).toBe(true)

    await switchTo(THERE)
    await openTheChat()
    const there = await contactsOnScreen()
    expect(there, 'the contacts changed with the project').toEqual(here)
  }, 180_000)

  it('opens one conversation from either project, holding what was said in both', async () => {
    for (const project of [HERE, THERE]) {
      await switchTo(project)
      await openTheChat()
      await app.page.click(`.px-chat-contact:has-text("${THE_TEST_OFFICES_SECRETARY.name}")`)
      const drawn = await whatIsDrawn()
      const bodies = drawn.map((one) => one.body)
      expect(bodies, `what was said in ${HERE} is missing while reading ${project}`).toContain(SAID_HERE)
      expect(bodies, `what was said in ${THERE} is missing while reading ${project}`).toContain(SAID_THERE)
    }
  }, 180_000)

  /**
   * WHAT THIS CASE ASSERTED BEFORE 7 SEPTEMBER 2026, and why it changed.
   *
   * It asserted that the mark is drawn on a message from another project and NOT on one from the
   * project the reader stands in. That is exactly what was then reported as a fault: switching to
   * another project made "in Mole Office" appear under lines that had not changed. The mark should be
   * on every message or on none, and criterion M73 makes that the owner's own
   * setting, off by default, and when it is on the mark is on EVERY message whatever project the owner stands
   * in, because the chat is the owner's across every project and never changes with it.
   *
   * So the case now proves both halves of the setting through the panel, and the thing it used to
   * prove — that the mark names a project by its name and never by its id — is still in it.
   */
  it('draws no project mark until the owner asks for one, and then draws it on every message', async () => {
    await switchTo(HERE)
    await openTheChat()
    await app.page.click(`.px-chat-contact:has-text("${THE_TEST_OFFICES_SECRETARY.name}")`)

    // OFF BY DEFAULT, and standing in one project does not make it appear on the other's messages.
    const before = await whatIsDrawn()
    const fromHereFirst = before.find((one) => one.body === SAID_HERE)
    const fromThereFirst = before.find((one) => one.body === SAID_THERE)
    expect(fromHereFirst, 'the message from this project is not drawn').toBeDefined()
    expect(fromThereFirst, 'the message from the other project is not drawn').toBeDefined()
    expect(fromHereFirst?.project, 'nobody asked for a mark and one was drawn').toBeNull()
    expect(fromThereFirst?.project, 'nobody asked for a mark and one was drawn').toBeNull()

    // THE OWNER TURNS IT ON, through the same door the settings panel presses.
    const set = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-mole-office-workspace': HERE,
        'x-mole-office-actor-type': 'human',
        'x-mole-office-actor-id': THE_PERSON,
      },
      body: JSON.stringify({ messageProjectMark: 'always' }),
    })
    expect(set.status, await set.clone().text()).toBe(200)

    // AND NOW IT IS ON BOTH, whichever project the owner stands in.
    await app.page.reload({ timeout: 60_000 })
    await openTheChat()
    await app.page.click(`.px-chat-contact:has-text("${THE_TEST_OFFICES_SECRETARY.name}")`)
    await app.page.waitForSelector('.px-chat-project', { timeout: 30_000 })
    const after = await whatIsDrawn()
    const fromHere = after.find((one) => one.body === SAID_HERE)
    const fromThere = after.find((one) => one.body === SAID_THERE)
    expect(fromHere?.project, 'the message written here carries no mark').not.toBeNull()
    expect(fromThere?.project, 'the message from the other project carries no mark').not.toBeNull()
    // AND EACH NAMES ITS OWN PROJECT, by its name and never by its id.
    expect(fromThere?.project ?? '').toContain(THERE_IS_CALLED)
    expect(fromHere?.project ?? '').not.toContain(THERE_IS_CALLED)
  }, 180_000)
})

// ================================================ and a group follows it, decision t5DlN5-uTZoT

/**
 * A GROUP IS THE PERSON'S TOO, WHICHEVER PROJECT IS OPEN.
 *
 * Criterion M55 made a private conversation the person's and left a group as one project's. That
 * made the number on the chat circle add two counts about different things: unread messages, read
 * across every project, plus unread groups, read in the project on screen. And a group opened in one
 * project was invisible from another, with the three routes that take a group id refusing it by
 * name. Problem `m1ea9ihnnu9e`; decision `t5DlN5-uTZoT` settled that groups follow.
 *
 * WHAT THIS MEASURES. A group is opened in the first project. Then, standing in the second: it is in
 * the Groups tab, it opens, it holds what was said in both projects, and a message typed into it
 * from there is written and drawn. The write is done through the panel's own box rather than over
 * HTTP, because "a group the owner can see and cannot write in" was the state the decision rejected and a
 * press is what proves it is not this one.
 *
 * THE CONTROL. The switcher is read back after every switch, as it is above, so a case cannot pass
 * because the project never changed.
 */
describe('a group is the person’s too, whichever project is open', () => {
  /** Which groups the panel is drawing, by name, in the order they are drawn. */
  async function groupsOnScreen(): Promise<string[]> {
    await app.page.click('.px-chat-tab[data-tab="groups"]')
    await app.page.waitForSelector('.px-chat-list', { timeout: 30_000 })
    return app.page.$$eval('.px-chat-tab[data-tab="groups"] ~ * .px-chat-name, .px-chat-name', (all) =>
      all.map((one) => (one.textContent ?? '').trim()),
    )
  }

  it('lists a group opened in the first project while the second one is open', async () => {
    // THE CONTROL FIRST: it is there in the project it was opened in.
    await switchTo(HERE)
    await openTheChat()
    expect(await groupsOnScreen(), 'the group is not listed in the project it was opened in').toContain(THE_GROUP)

    await switchTo(THERE)
    await openTheChat()
    expect(await groupsOnScreen(), 'the group opened in the other project is not listed').toContain(THE_GROUP)
  }, 180_000)

  it('opens it from the second project, holding what was said in the first', async () => {
    await switchTo(THERE)
    await openTheChat()
    await groupsOnScreen()
    await app.page.click(`.px-chat-contact:has-text("${THE_GROUP}")`)
    const bodies = (await whatIsDrawn()).map((one) => one.body)
    expect(bodies.length, 'the group drew nothing at all').toBeGreaterThan(0)
    expect(bodies, 'what was said in the group from the first project is missing').toContain(SAID_IN_THE_GROUP)
    // AND THE WHOLE GROUP IS ON SCREEN, not the half of it a member wrote from here. The lines Mole
    // Office wrote when it was opened are drawn as notices rather than as messages, so they are read
    // off the panel rather than out of `whatIsDrawn`.
    const notices = await app.page.$$eval('.px-chat-note, .px-chat-system, .px-chat-notice', (all) =>
      all.map((one) => (one.textContent ?? '').trim()),
    )
    expect(
      [...bodies, ...notices].join(' · '),
      'the line saying the group was opened is not on screen',
    ).toContain('Group opened')
  }, 180_000)

  it('takes a message typed into it from the second project', async () => {
    await switchTo(THERE)
    await openTheChat()
    await groupsOnScreen()
    await app.page.click(`.px-chat-contact:has-text("${THE_GROUP}")`)
    await app.page.waitForSelector('.px-chat-write textarea', { timeout: 30_000 })
    await app.page.fill('.px-chat-write textarea', SAID_FROM_THERE)
    await app.page.click('.px-chat-send')
    await app.page.waitForFunction(
      (words) => [...document.querySelectorAll('.px-chat-words')].some((one) => (one.textContent ?? '').includes(words)),
      SAID_FROM_THERE,
      { timeout: 30_000 },
    )

    // AND THE SERVER REALLY HOLDS IT, asked of the server rather than read off the screen it was
    // typed into. A panel that drew the line and wrote nothing is the failure this product exists
    // to prevent.
    const said = await fetch(`${app.api}/api/groups/${theGroupId}`, { headers: asTheOwner(HERE) })
    expect(said.status, await said.clone().text()).toBe(200)
    const held = (await said.json()) as { messages: { body: string }[] }
    expect(held.messages.map((one) => one.body), 'the message typed from the other project was not written').toContain(
      SAID_FROM_THERE,
    )
  }, 180_000)
})
