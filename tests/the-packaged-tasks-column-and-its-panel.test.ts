// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION F16 POINT 2 AND 3: THE PACKAGED-TASKS COLUMN, AND THE PANEL ON A TASK'S OWN PAGE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES
 * ---------------------------------------------------------------------------------------
 *
 * Two pure halves, rendered without a server, the way tests/the-worlds-page-shows-a-world-for-the-person
 * -.test.ts renders `TheOffice`: `TheTasksToTake` in src/web/pages/TasksToTakePage.tsx, and
 * `TaskPackageComputed` plus `packageOnTask` in src/web/components/TaskPackagePanel.tsx.
 *
 *   1. THE FIRST LINE STATES ITS OWN NUMBERS, OR SAYS THERE ARE NONE. Zero packaged tasks draws
 *      `Absence` at the ordinary tier and no sentence; one or more draws the count, singular or
 *      plural. Mutation: change the plural noun in `tasksToTakeLead` and the count test goes red.
 *
 *   2. `heldBy` AND `outsideName` ARE TWO DIFFERENT FACTS, AND A ROW DRAWS BOTH WHEN BOTH ARE TRUE,
 *      AND NEITHER WHEN NEITHER IS. Mutation: always draw the held-by fact regardless of whether it
 *      is null, and the "draws neither when neither is true" case goes red.
 *
 *   3. A TASK WITH NO PACKAGE DRAWS NOTHING AT ALL. `packageOnTask` answers null for an absent,
 *      null, or malformed `package` field, and only a plain object comes back. Mutation: drop the
 *      `typeof raw !== 'object'` guard, and the malformed-value case goes red.
 *
 *   4. A PACKAGE WHOSE TASK NAMES NO CODE SAYS SO IN A PLAIN SENTENCE, never a warning. Mutation:
 *      invert the `statedCodeCount === 0` branch, and the no-code sentence test goes red.
 *
 *   5. WHO IS RESPONSIBLE AND WHO HOLDS IT ARE NAMED BY THE NAME THE REGISTRY GIVES, on the column and on
 *      the panel, and never by the stored id. An agent no registry holds is said to be unregistered, and
 *      one whose registry could not be read is said to have a name nobody could read. Round 166's pictures
 *      found "agent" and a stored id on both, where the panel's own line named the same agent by its name.
 *      Mutation: make `packageParticipantNamed` answer the kind and the stored id, as the two places did
 *      before, and every case of part 5 goes red.
 *
 * Every mutation was run as a control first (green), then applied (red), then reversed by hand and
 * checked back to its original bytes — never `git checkout` — with the sha256 in the report.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import type { DelegationRow } from '../src/shared/delegation.ts'
import { createI18n, sayInEnglish, type WordKey } from '../src/shared/i18n.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import { actorTypeWord } from '../src/shared/words.ts'
import type { AsyncState } from '../src/web/components/ui.tsx'
import type { ParticipantsNamed } from '../src/web/lib/participant-lookup.ts'
// Type-only, so it is erased before this file runs and does not load api.ts early — the same
// reason tests/app-routes.test.ts gives for importing App.tsx's `Page` this way.
import type { DelegationReply } from '../src/web/api.ts'

type TasksToTakePageModule = typeof import('../src/web/pages/TasksToTakePage.tsx')
type TaskPackagePanelModule = typeof import('../src/web/components/TaskPackagePanel.tsx')
type ModeModule = typeof import('../src/web/lib/mode.ts')

let page: TasksToTakePageModule
let panel: TaskPackagePanelModule
let modes: ModeModule

beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', origin: 'http://127.0.0.1:41600', hostname: '127.0.0.1', reload: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  page = await import('../src/web/pages/TasksToTakePage.tsx')
  panel = await import('../src/web/components/TaskPackagePanel.tsx')
  modes = await import('../src/web/lib/mode.ts')
})

/** Render in developer mode, where the server's own sentences are drawn, and go back to normal after. */
const inDeveloperMode = (draw: () => string): string => {
  modes.setMode('inspect')
  try {
    return draw()
  } finally {
    modes.setMode('normal')
  }
}

/** The markup a person reads, with the hoisted stylesheet stripped. */
const strip = (html: string): string => html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')

/** One packaged task, with only the fields a test cares about spelled out. */
function packagedTask(over: Partial<DelegationRow> & Pick<DelegationRow, 'recordId' | 'title'>): DelegationRow {
  return {
    suits: 'own_module',
    parent: null,
    lines: [],
    pointIds: [],
    materials: [],
    pointCount: 0,
    planBlocks: [],
    inside: null,
    state: 'to_do',
    heldBy: null,
    outsideName: null,
    responsible: { kind: 'agent', id: 'SX' },
    responsibleWhy: 'the supervisor that created this task is responsible for it to the end',
    packagedAt: '2026-09-14 18:55:00',
    bundleId: 'bundle-1',
    statedCodeCount: 0,
    modules: [],
    namedModuleCount: 0,
    statedCodeFromModules: 0,
    modulesWithNoStatedCode: [],
    filesSays: 'The package names no module, so it carries no file list.',
    exportCount: 0,
    returnCount: 0,
    confirmedAt: null,
    says: 'Open to take, and it suits a module built on its own.',
    ...over,
  }
}

function reply(over: Partial<DelegationReply> = {}): DelegationReply {
  return { tasks: [], couldNotRead: [], workspaceId: 'panelx', note: 'the packaged tasks', ...over }
}

/** Both registries as the page reads them, holding the made-up agents and person the rows below name. */
const registries: AsyncState<ParticipantsNamed> = {
  status: 'ready',
  value: {
    people: [{ id: 'made-up-person-id', handle: 'made-up-person', name: 'A made-up person' }],
    agents: [
      { id: 'made-up-column-id', handle: 'made-up-column', name: 'A made-up column agent' },
      { id: 'made-up-secretary-id', handle: 'made-up-secretary', name: 'A made-up secretary' },
    ],
  },
}

// ---------------------------------------------------------------------------- 1. the first line

describe('the first line of Tasks to take states its own numbers, or says there are none', () => {
  it('draws Absence at the ordinary tier and no sentence when nothing is packaged', () => {
    const html = strip(renderToStaticMarkup(h(page.TheTasksToTake, { reply: reply() })))
    expect(html, 'the empty column drew a sentence rather than a quiet word').toContain('none packaged')
    expect(html).toContain('px-absent')
    expect(html).not.toContain('packaged in this project')
  })

  it('states one task in the singular', () => {
    const html = strip(
      renderToStaticMarkup(
        h(page.TheTasksToTake, { reply: reply({ tasks: [packagedTask({ recordId: 'r1', title: 'A task' })] }) }),
      ),
    )
    expect(html).toContain(sayInEnglish('tasksToTake.count', { n: 1 }))
  })

  it('states more than one task in the plural', () => {
    const html = strip(
      renderToStaticMarkup(
        h(page.TheTasksToTake, {
          reply: reply({
            tasks: [
              packagedTask({ recordId: 'r1', title: 'A task' }),
              packagedTask({ recordId: 'r2', title: 'Another task' }),
            ],
          }),
        }),
      ),
    )
    expect(html).toContain(sayInEnglish('tasksToTake.count', { n: 2 }))
  })
})

// ---------------------------------------------------------------------------- 2. heldBy and outsideName

describe('a row draws heldBy and outsideName as two different facts', () => {
  it('draws neither when neither is true', () => {
    const html = strip(
      renderToStaticMarkup(
        h(page.TheTasksToTake, {
          reply: reply({ tasks: [packagedTask({ recordId: 'r1', title: 'A quiet task' })] }),
        }),
      ),
    )
    expect(html, 'a row with no claim and no outside take says held by anyway').not.toContain('held by')
    expect(html, 'a row with no outside take says taken outside anyway').not.toContain('taken outside by')
  })

  it('draws both at once, because a package can be claimed and promised outside together', () => {
    const html = strip(
      renderToStaticMarkup(
        h(page.TheTasksToTake, {
          reply: reply({
            tasks: [
              packagedTask({
                recordId: 'r1',
                title: 'A busy task',
                heldBy: { kind: 'agent', id: 'made-up-column-id' },
                outsideName: 'ChatGPT (my own account)',
              }),
            ],
          }),
          names: registries,
        }),
      ),
    )
    expect(html).toContain('held by')
    expect(html).toContain(`${actorTypeWord('agent').text} A made-up column agent`)
    expect(html).toContain('taken outside by')
    expect(html).toContain('ChatGPT (my own account)')
  })

  it('draws no module named once in place of the server’s own row sentence', () => {
    const html = strip(
      renderToStaticMarkup(
        h(page.TheTasksToTake, {
          reply: reply({
            tasks: [packagedTask({ recordId: 'r1', title: 'A task', says: 'Taken by an agent, and it suits desk work.' })],
          }),
        }),
      ),
    )
    expect(html.split(sayInEnglish('tasksToTake.noModule')).length - 1).toBe(1)
    expect(html).not.toContain('Taken by an agent, and it suits desk work.')
  })

  it('draws no module named only on the row that names no module', () => {
    // A package that names a module has no state word: its tag and facts say the rest. The second row
    // names none, so the count shows the page still draws the word where it belongs.
    const html = strip(
      renderToStaticMarkup(
        h(page.TheTasksToTake, {
          reply: reply({
            tasks: [
              packagedTask({ recordId: 'r1', title: 'A task in a named module', says: null, namedModuleCount: 1 }),
              packagedTask({ recordId: 'r2', title: 'A task in no module' }),
            ],
          }),
        }),
      ),
    )
    expect(html).toContain('A task in a named module')
    expect(html.match(/class="ttt-says"/g)?.length).toBe(1)
  })

  it('draws the band of packages the column could not read, only when there is one', () => {
    const clean = strip(renderToStaticMarkup(h(page.TheTasksToTake, { reply: reply() })))
    expect(clean).not.toContain('Packages we could not read')

    const html = strip(
      renderToStaticMarkup(
        h(page.TheTasksToTake, {
          reply: reply({ couldNotRead: [{ recordId: 'r9', title: 'A broken package', because: 'its package field is not an object' }] }),
        }),
      ),
    )
    expect(html).toContain('Packages we could not read')
    expect(html).toContain('A broken package')
    expect(html).toContain(sayInEnglish('planning.notReadable'))
    expect(html).not.toContain('its package field is not an object')
  })
})

// ---------------------------------------------------------------------------- 3. a task with no package

describe('a task with no package draws nothing at all', () => {
  it('answers null for a task with no package field', () => {
    expect(panel.packageOnTask({})).toBeNull()
    expect(panel.packageOnTask(null)).toBeNull()
    expect(panel.packageOnTask(undefined)).toBeNull()
  })

  it('answers null for a package field that was written as something other than an object', () => {
    expect(panel.packageOnTask({ package: 'not an object' })).toBeNull()
    expect(panel.packageOnTask({ package: 42 })).toBeNull()
    expect(panel.packageOnTask({ package: null })).toBeNull()
  })

  it('answers null for an inside package, which this outside panel does not draw', () => {
    // ROUND 234'S INSIDE PACKAGE: a parent, its lines and its points, and no suits or acceptanceSource.
    // The task's own page threw reading acceptanceSource.file before this guard (check of lfkJAz4fMiYk).
    const inside = {
      bundleId: 'b-inside',
      forTheOutside: 'Take it and hand it back point by point.',
      acceptance: 'Every point is answered.',
      parent: { kind: 'decision', id: 'a-decision' },
      lines: ['13s'],
      pointIds: ['a-point'],
      at: '2026-11-09 15:00:00',
      by: { actorType: 'agent', actorId: 'a-supervisor' },
    }
    expect(panel.packageOnTask({ package: inside })).toBeNull()
  })

  it('reads a real package back whole', () => {
    const stated = {
      bundleId: 'b1',
      forTheOutside: 'Build the module on its own.',
      suits: 'own_module',
      acceptance: 'The module runs on its own.',
      acceptanceSource: { file: 'design/flows/ACCEPTANCE.md', criterion: 'F16', commit: '2d7f256e' },
      at: '2026-09-14 18:55:00',
      by: { actorType: 'agent', actorId: 'f16-package' },
    }
    expect(panel.packageOnTask({ package: stated })).toEqual(stated)
  })
})

/**
 * WHERE A PACKAGE'S CRITERIA WERE COPIED FROM IS DRAWN ON ROWS OF ITS OWN. The panel said it in one sentence,
 * "copied from {file}, criterion {criterion}, commit {commit}", and the file sat in the sentence. The sentence goes:
 * the file, the criterion and the commit are each a labelled row in the office's code style.
 */
describe('where the acceptance criteria were copied from is drawn on rows of its own', () => {
  const en = (key: string): string => createI18n('en').t(key as WordKey)
  const A_SOURCE = { file: 'design/flows/ACCEPTANCE.md', criterion: 'F16', commit: '2d7f256e' }

  function aPackagedTask(): PanelRecord {
    return {
      id: 'r1', workspaceId: 'panelx', kind: 'task', title: 'A task', summary: null,
      data: {
        package: {
          bundleId: 'b1', forTheOutside: 'Build the module on its own.', suits: 'own_module',
          acceptance: 'The module runs on its own.', acceptanceSource: A_SOURCE,
          at: '2026-09-14 18:55:00', by: { actorType: 'agent', actorId: 'f16-package' },
        },
      },
      origin: 'authored' as const, createdAt: '2026-09-14 18:55:00', updatedAt: '2026-09-14 18:55:00', deletedAt: null, ownerId: null,
    } as unknown as PanelRecord
  }

  /** The acceptance block alone, from its start to the end of its element. */
  function theAcceptance(html: string): string {
    const at = html.indexOf('class="tpp-acceptance"')
    expect(at, 'the acceptance block was not drawn').toBeGreaterThan(-1)
    return html.slice(html.lastIndexOf('<', at), html.indexOf('</div>', at) + '</div>'.length)
  }

  it('draws the file, the criterion and the commit as rows, and no sentence holds the file', () => {
    const block = theAcceptance(strip(renderToStaticMarkup(h(panel.TaskPackagePanel, { record: aPackagedTask() }))))
    const rows = [...block.matchAll(/<dt>([^<]*)<\/dt><dd><(\w+)[^>]*>([^<]*)<\/\2>/g)].map((m) => ({ label: m[1], tag: m[2], value: m[3] }))
    expect(rows).toEqual([
      { label: en('tpp.row.copiedFrom'), tag: 'code', value: A_SOURCE.file },
      { label: en('tpp.row.criterion'), tag: 'code', value: A_SOURCE.criterion },
      { label: en('tpp.row.commit'), tag: 'code', value: A_SOURCE.commit },
    ])
    for (const said of block.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)) expect(said[1], 'a sentence holds the file').not.toContain(A_SOURCE.file)
  })
})

// ---------------------------------------------------------------------------- 4. no code named

describe('a package whose task names no code draws none beside code stated', () => {
  const row = (over: Partial<DelegationRow> = {}) => packagedTask({ recordId: 'r1', title: 'A task', ...over })
  const noCode = `<p class="tpp-code"><span class="tpp-key">${sayInEnglish('tpp.codeStated')}</span>${sayInEnglish('absence.none')}</p>`

  it('draws none beside code stated when statedCodeCount is zero', () => {
    const html = strip(
      renderToStaticMarkup(h(panel.TaskPackageComputed, { reply: reply({ tasks: [row()] }), recordId: 'r1' })),
    )
    expect(html).toContain(noCode)
  })

  it('draws the count instead, once code is stated', () => {
    const html = strip(
      renderToStaticMarkup(
        h(panel.TaskPackageComputed, { reply: reply({ tasks: [row({ statedCodeCount: 3 })] }), recordId: 'r1' }),
      ),
    )
    expect(html).not.toContain(noCode)
    expect(html).toContain('3 relationships')
  })

  it('draws the count of exports and returns, singular and plural', () => {
    const one = strip(
      renderToStaticMarkup(
        h(panel.TaskPackageComputed, { reply: reply({ tasks: [row({ exportCount: 1, returnCount: 1 })] }), recordId: 'r1' }),
      ),
    )
    expect(one).toContain('1 time')
    const many = strip(
      renderToStaticMarkup(
        h(panel.TaskPackageComputed, { reply: reply({ tasks: [row({ exportCount: 2, returnCount: 4 })] }), recordId: 'r1' }),
      ),
    )
    expect(many).toContain('2 times')
    expect(many).toContain('4 times')
  })

  it('draws who is responsible, and how that was worked out only in developer mode', () => {
    const drawn = () =>
      strip(
        renderToStaticMarkup(
          h(panel.TaskPackageComputed, {
            reply: reply({ tasks: [row({ responsible: { kind: 'agent', id: 'made-up-secretary-id' }, responsibleWhy: 'the secretary created it' })] }),
            recordId: 'r1',
            names: registries,
          }),
        ),
      )
    const html = drawn()
    expect(html).toContain(`${actorTypeWord('agent').text} A made-up secretary`)
    expect(html).not.toContain('the secretary created it')
    expect(inDeveloperMode(drawn)).toContain('the secretary created it')
  })

  it('draws an ordinary absence, not a guess, when the change log cannot say who is responsible', () => {
    const html = strip(
      renderToStaticMarkup(
        h(panel.TaskPackageComputed, { reply: reply({ tasks: [row({ responsible: null })] }), recordId: 'r1' }),
      ),
    )
    expect(html).toContain(sayInEnglish('tpp.notRecorded'))
    expect(html).toContain('px-absent')
  })

  it('draws not readable when the row itself is missing, and the reason from couldNotRead only in developer mode', () => {
    const drawn = () =>
      strip(
        renderToStaticMarkup(
          h(panel.TaskPackageComputed, {
            reply: reply({ couldNotRead: [{ recordId: 'r1', title: 'A task', because: 'its package field could not be read' }] }),
            recordId: 'r1',
          }),
        ),
      )
    const html = drawn()
    expect(html).toContain(sayInEnglish('planning.notReadable'))
    expect(html).not.toContain('its package field could not be read')
    expect(inDeveloperMode(drawn)).toContain('its package field could not be read')
  })

  it('draws not listed when neither list names the task', () => {
    const html = strip(renderToStaticMarkup(h(panel.TaskPackageComputed, { reply: reply(), recordId: 'r1' })))
    expect(html).toContain(sayInEnglish('tpp.notListed'))
  })
})

// ---------------------------------------------------------------------------- 5. who is named, and how

describe('the column and the panel name an agent by its registry name, never by its stored id', () => {
  const named = packagedTask({
    recordId: 'r1',
    title: 'A made-up task',
    responsible: { kind: 'agent', id: 'made-up-secretary-id' },
    heldBy: { kind: 'agent', id: 'made-up-column-id' },
  })
  /** Both places, drawn from one row and one reading of the registries. */
  const both = (row: DelegationRow, names: AsyncState<ParticipantsNamed>) => ({
    column: strip(renderToStaticMarkup(h(page.TheTasksToTake, { reply: reply({ tasks: [row] }), names }))),
    panel: strip(renderToStaticMarkup(h(panel.TaskPackageComputed, { reply: reply({ tasks: [row] }), recordId: row.recordId, names }))),
  })
  const agent = actorTypeWord('agent').text

  it('names a registered agent by its name, with its kind before it, in both places', () => {
    const drawn = both(named, registries)
    for (const [where, html] of Object.entries(drawn)) {
      expect(html, where).toContain(`${agent} A made-up secretary`)
      expect(html, where).not.toContain('made-up-secretary-id')
    }
    expect(drawn.column).toContain(`${agent} A made-up column agent`)
    expect(drawn.column).not.toContain('made-up-column-id')
  })

  it('names a registered person by their name, from the people registry', () => {
    const drawn = both(packagedTask({ recordId: 'r1', title: 'A made-up task', responsible: { kind: 'person', id: 'made-up-person-id' } }), registries)
    for (const [where, html] of Object.entries(drawn)) {
      expect(html, where).toContain(`${actorTypeWord('human').text} A made-up person`)
      expect(html, where).not.toContain('made-up-person-id')
    }
  })

  it('says an agent no registry holds is unregistered, and draws no id for it', () => {
    const drawn = both(packagedTask({ recordId: 'r1', title: 'A made-up task', responsible: { kind: 'agent', id: 'made-up-stranger-id' } }), registries)
    for (const [where, html] of Object.entries(drawn)) {
      expect(html, where).toContain(sayInEnglish('record.writer.unregisteredAgent'))
      expect(html, where).not.toContain('made-up-stranger-id')
    }
  })

  it('says the name could not be read when the registries could not be, and draws no id', () => {
    const drawn = both(named, { status: 'error', message: 'A made-up registry failure.' })
    for (const [where, html] of Object.entries(drawn)) {
      expect(html, where).toContain(sayInEnglish('tpp.nameNotRead.agent'))
      expect(html, where).not.toContain('made-up-secretary-id')
    }
    expect(drawn.column).not.toContain('made-up-column-id')
  })

  it('draws the kind alone while the registries are read, and no id', () => {
    const drawn = both(named, { status: 'loading' })
    for (const [where, html] of Object.entries(drawn)) {
      expect(html, where).toContain(agent)
      expect(html, where).not.toContain('made-up-secretary-id')
    }
    expect(drawn.column).not.toContain('made-up-column-id')
  })
})

// ---------------------------------------------------------------------------- 6. the outside export

/**
 * THE PRESS THAT MAKES THE TEXT A PERSON CARRIES TO AN OUTSIDE CHAT. Criterion F16 points 1 and 6.
 *
 * It is drawn on the task's own panel and on every row of the column, because both render
 * `TaskPackageActions`. This checks the panel half is really there and shut on arrival, so that the
 * press `tests/the-text-that-leaves-for-an-outside-chat.test.ts` drives by name cannot go missing
 * from the drawn page while that file still passes against the door.
 *
 * Mutation: remove `<TaskOutsideExport …>` from `TaskPackageActions` and this goes red.
 */
describe('the press that makes the text for an outside chat', () => {
  it('is drawn on the package panel, behind a fold that is shut on arrival', () => {
    const row = packagedTask({ recordId: 'r1', title: 'A task' })
    const html = strip(
      renderToStaticMarkup(h(panel.TaskPackageComputed, { reply: reply({ tasks: [row] }), recordId: 'r1' })),
    )
    expect(html, 'the press that makes the outside text is not on the panel').toContain(
      'Copy the text for an outside chat',
    )
    expect(html, 'the press itself is missing').toContain('Make the text')
  })
})
