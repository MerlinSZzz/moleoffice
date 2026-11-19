// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
/**
 * AN OFFICE THE SIZE OF THE OWNER’S, MADE UP, FOR THE TESTS THAT TIME THE REVIEW PANEL.
 *
 * Copied from wave 13r round 13's proposal, where it was first used to measure the panel.
 *
 * The owner’s database cannot be reached from the sandbox, so this is sized from what the office answered to reads on
 * 4 October 2026: 14,633 records in panelx, 33 reviews there (24 abandoned, 5 collected, 2 collecting, 2 sent), and
 * 7 projects. It starts from tests/an-office-of-the-live-shape.ts (400 agents, 1,500 open runs, 200,000 api_calls
 * rows) and adds, in project `default` (which stands for panelx): 14,000 more records, comments on 200 of them,
 * and 31 reviews (the observed two sent reviews were never seeded); and in four projects, the 17 notes secretaries prepared for the person to file. Every name and every word
 * here is made up. The number of comments in the owner’s project could not be read, so it is a guess (COMMENTS below).
 *
 * Bulk rows copy validated record shapes and their history in one SQL transaction. A caller may pass `keep`, a path in its own scratch folder, and the file built
 * there is reused on the next run. Without `keep` it is built every time.
 */
import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { vi } from 'vitest'
import { anOfficeOfTheLiveShape } from './an-office-of-the-live-shape.ts'
import { TEST_DATABASE_PREFIX } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

export const THE_SIZE_OF_THE_OWNERS_OFFICE = {
  records: 14_000,
  /** A guess: comments a person leaves over weeks of review. */
  comments: 800,
  commentedRecords: 200,
  reviews: { abandoned: 24, collected: 5, collecting: 2 },
} as const

const PERSON = { type: 'human', id: THE_PERSON } as const

/** The 17 notes a secretary prepared for the person to file, as the owner said them in other terminals. Made up. */
export const PREPARED: { project: string; title: string; body: string; by: string }[] = [
  { project: 'robotics', title: 'In the terminal, about the gripper', body: '夹爪的力度先降到 20 牛，等新的支架到了再调回去。', by: 'quill' },
  { project: 'robotics', title: 'In the terminal, about the bench', body: 'Recalibrate the bench before every run, not once a day.', by: 'quill' },
  { project: 'robotics', title: 'In the terminal, about the camera', body: '相机的曝光不要自动调，固定在 8 毫秒。', by: 'quill' },
  { project: 'robotics', title: 'In the terminal, about the logs', body: 'Keep the raw logs for thirty days, then only the summaries.', by: `${THE_TEST_OFFICES_SECRETARY.handle}-made-up` },
  { project: 'robotics', title: 'In the terminal, about the mount', body: '铝支架已经订了，下周到。在那之前不跑 20 牛以上的试验。', by: 'quill' },
  { project: 'robotics', title: 'In the terminal, about the tests', body: 'A test that needs the real arm runs only at night.', by: `${THE_TEST_OFFICES_SECRETARY.handle}-made-up` },
  { project: 'ai-news', title: 'In the terminal, about the sources', body: '只收一手来源，转载的新闻不要。', by: 'quill' },
  { project: 'ai-news', title: 'In the terminal, about the digest', body: 'The digest goes out at seven, even when it is short.', by: 'quill' },
  { project: 'ai-news', title: 'In the terminal, about Chinese titles', body: '中文标题保留原文，不要翻译。', by: `${THE_TEST_OFFICES_SECRETARY.handle}-made-up` },
  { project: 'ai-news', title: 'In the terminal, about duplicates', body: 'Two stories about one paper are one story.', by: 'quill' },
  { project: 'release', title: 'In the terminal, about the installer', body: '安装包先只出 Linux，Windows 等下个月。', by: 'quill' },
  { project: 'release', title: 'In the terminal, about the notes', body: 'Release notes are written for a person, not for the changelog.', by: `${THE_TEST_OFFICES_SECRETARY.handle}-made-up` },
  { project: 'release', title: 'In the terminal, about closed source', body: '测试和合并工具不随安装包发出去。', by: 'quill' },
  { project: 'default', title: 'In the terminal, about the review panel', body: '评审面板不要挡住正在看的内容。', by: 'quill' },
  { project: 'default', title: 'In the terminal, about merges', body: 'Remind me about the merge speed in a week.', by: `${THE_TEST_OFFICES_SECRETARY.handle}-made-up` },
  { project: 'default', title: 'In the terminal, about secretaries', body: '确认我的话这件事不交给秘书。', by: 'quill' },
  { project: 'default', title: 'In the terminal, about Home', body: 'Home should open in under a second on the big office.', by: 'quill' },
]

/**
 * Build the office, or reuse the file already built at `keep`. Answers a copy the caller may serve and delete in its
 * own `afterAll`, after its stack has stopped.
 */
export async function anOfficeTheSizeOfTheirs(keep?: string, checkpoint: () => void = () => {}): Promise<{ file: string; remove: () => void }> {
  const dir = mkdtempSync(`${TEST_DATABASE_PREFIX}size-of-the-owners-office-`)
  const file = join(dir, 'panelx.db')
  try {
    if (keep === undefined) await build(file, checkpoint)
    else {
      if (!existsSync(keep)) await build(keep, checkpoint)
      copyFileSync(keep, file)
    }
  } catch (error) {
    rmSync(dir, { recursive: true, force: true })
    throw error
  }
  return { file, remove: () => rmSync(dir, { recursive: true, force: true }) }
}

async function build(keep: string, checkpoint: () => void): Promise<void> {
  checkpoint()
  const base = await anOfficeOfTheLiveShape()
  const dir = mkdtempSync(`${TEST_DATABASE_PREFIX}size-of-the-owners-office-build-`)
  const file = join(dir, 'panelx.db')
  copyFileSync(base.file, file)
  base.remove()
  vi.resetModules()
  process.env.MOLE_OFFICE_DB = file
  const client = await import('../src/server/db/client.ts')
  try {
    checkpoint()
    const api = await import('../src/server/lib/records.ts')
    const workspaces = await import('../src/server/lib/workspaces.ts')
    const reviews = await import('../src/server/lib/reviews.ts')

    for (const [id, title] of [['robotics', 'Robotics'], ['ai-news', 'AI news'], ['release', 'Release']] as const) {
      workspaces.createWorkspace({ id, title })
    }
    // THE SECRETARIES WHO PREPARED THE NOTES, one registered in each project they wrote in.
    for (const handle of ['quill', `${THE_TEST_OFFICES_SECRETARY.handle}-made-up`]) {
      for (const project of ['default', 'robotics', 'ai-news', 'release']) {
        api.createRecord({ kind: 'agent', title: handle === 'quill' ? 'Quill' : `${THE_TEST_OFFICES_SECRETARY.name} (made up)`, workspaceId: project, data: { handle, runtime: 'claude-code', state: 'active' }, actor: PERSON })
      }
    }

    // Validate one of each shape through the product. Copy only these ordinary records,
    // with their create change and first revision; registration and review lifecycle still
    // use the product. The old per-row title advisory scanned all earlier rows quadratically.
    const templates = ['task', 'note', 'report'].map((kind) => api.createRecord({
      kind: kind as 'task' | 'note' | 'report', title: `Made-up record ${kind === 'task' ? 1 : kind === 'note' ? 2 : 3}`,
      workspaceId: 'default', actor: PERSON,
      data: kind === 'report' ? { for: 'the owner', date: '2026-10-01', blocks: [{ id: 'b-1', type: 'text', text: 'Made-up report 3.' }] } : {},
    }))
    const made = templates.map((one) => one.id)
    const comment = api.createRecord({ kind: 'message', title: 'Made-up comment 1', workspaceId: 'default', actor: PERSON,
      data: { body: 'Made-up comment 1: this number does not match the log.', target: { target: { kind: 'record', recordId: made[0], workspaceId: 'default' }, place: { at: 'surface' } } },
    })
    // Copy all columns, including attribution, rather than guessing the current schema.
    const copy = (table: string, replacements: Record<string, string>, where: string) => {
      const columns = (client.sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((one) => one.name)
      return client.sqlite.prepare(`INSERT INTO ${table} (${columns.join(',')}) SELECT ${columns.map((column) => replacements[column] ?? column).join(',')} FROM ${table} WHERE ${where}`)
    }
    const recordCopy = copy('records', { id: '@id', title: '@title', data: '@data' }, 'id = @template')
    const changeCopy = copy('changes', { id: '@change', record_id: '@id', new_value: '@title', append_order: 'NULL' }, "record_id = @template AND op = 'create'")
    const revisionCopy = copy('revisions', { id: '@revision', record_id: '@id', title: '@title', data: '@data', content_hash: '@hash' }, 'record_id = @template AND seq = 1')
    const add = (template: typeof templates[number], title: string, data: Record<string, unknown>): string => {
      const id = randomUUID()
      const values = { id, title, data: JSON.stringify(data), template: template.id, change: randomUUID(), revision: randomUUID(), hash: api.versionOf({ ...template, title, data }) }
      recordCopy.run(values)
      changeCopy.run(values)
      revisionCopy.run(values)
      return id
    }
    client.sqlite.transaction(() => {
      for (let i = 3; i < THE_SIZE_OF_THE_OWNERS_OFFICE.records; i += 1) {
        checkpoint()
        const template = templates[i % 3]!
        const data = i % 3 === 2 ? { ...template.data, blocks: [{ id: 'b-1', type: 'text', text: `Made-up report ${String(i + 1)}.` }] } : template.data
        made.push(add(template, `Made-up record ${String(i + 1)}`, data))
      }
      for (let i = 1; i < THE_SIZE_OF_THE_OWNERS_OFFICE.comments; i += 1) {
        checkpoint()
        const on = made[i % THE_SIZE_OF_THE_OWNERS_OFFICE.commentedRecords]!
        add(comment, `Made-up comment ${String(i + 1)}`, { ...comment.data,
          body: `Made-up comment ${String(i + 1)}: this number does not match the log.`,
          target: { target: { kind: 'record', recordId: on, workspaceId: 'default' }, place: { at: 'surface' } },
        })
      }
    })()

    // REVIEWS, each on a record of its own, ended the ways the owner’s ended.
    let r = 0
    const aReview = (): string => {
      const on = made[THE_SIZE_OF_THE_OWNERS_OFFICE.commentedRecords + r] as string
      r += 1
      return reviews.startReview({ workspaceId: 'default', entry: { target: { kind: 'record', recordId: on, workspaceId: 'default' } } as never }, PERSON).review.id
    }
    for (let i = 0; i < THE_SIZE_OF_THE_OWNERS_OFFICE.reviews.abandoned; i += 1) reviews.abandonReview(aReview(), 'default', PERSON)
    for (let i = 0; i < THE_SIZE_OF_THE_OWNERS_OFFICE.reviews.collected; i += 1) reviews.finishCollecting(aReview(), 'default', PERSON)
    for (let i = 0; i < THE_SIZE_OF_THE_OWNERS_OFFICE.reviews.collecting; i += 1) aReview()

    // THE NOTES PREPARED FOR THE PERSON TO FILE.
    for (const one of PREPARED) {
      api.createRecord({
        kind: 'note',
        title: one.title,
        workspaceId: one.project,
        data: { body: one.body, for_the_person_to_file: true },
        actor: { type: 'agent', id: one.by },
      })
    }

    client.sqlite.pragma('wal_checkpoint(TRUNCATE)')
    copyFileSync(file, keep)
  } finally {
    client.sqlite.close()
    rmSync(dir, { recursive: true, force: true })
  }
}
