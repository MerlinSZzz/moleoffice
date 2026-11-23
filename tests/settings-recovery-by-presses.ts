// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createHash } from 'node:crypto'
import { appendFileSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { Locator } from 'playwright'
import { expect, vi } from 'vitest'
import { freshDb, liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { putTheMadeUpLabelIn, takeTheMadeUpLabelOut } from './the-made-up-label-above-the-page.ts'
import { SHIPPED_SIDEBAR } from '../src/shared/sidebar-arrangement.ts'
import type { RoleCard } from '../src/shared/roles.ts'
import type { ChapterContent } from '../src/shared/chapter-edit.ts'
import { powersOn } from '../src/shared/roles.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'

export type OfficeKind = 'fresh' | 'upgraded'
export const numberName = 'MOLE_OFFICE_BUS_MOST_ENTRIES'
export const wordKey = 'g6a.working.roster'
export const addedName = 'made-up-archivist'
const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const migrations = join(import.meta.dirname, '../drizzle')
const journal = JSON.parse(readFileSync(join(migrations, 'meta/_journal.json'), 'utf8')) as { version: string; dialect: string; entries: { idx: number; tag: string; when: number }[] }
let upgradedTemplate: string | undefined
/** The made-up upgraded office is two migrations behind: it is made without the journal's last two, so a branch that adds a migration changes nothing here. */
export const missingMigrations = journal.entries.slice(-2).map(entry => entry.tag)
export const recoveryCases = [
  'number-out-of-range', 'number-not-a-number', 'notice-unknown-kind', 'word-unknown-key', 'word-empty-value',
  'sidebar-unknown-page', 'sidebar-missing-page', 'role-unknown-supervisor', 'role-unknown-power',
  'role-unknown-appointee', 'role-no-duties', 'role-not-json', 'role-locked-name',
  'chapter-missing-rule', 'chapter-two-records',
] as const
export type RecoveryCase = typeof recoveryCases[number]
/**
 * AN ARRANGEMENT ROUND 4'S CHECK ACCEPTED STILL LOADS ONCE A PAGE MAY LEAVE ALL PROJECTS, which item 2 of wave 13r
 * round 5 allowed. Main has no sidebar setting: origin/main 83138edb8 has no
 * src/shared/sidebar-arrangement.ts, so no office upgraded from main can hold one. The stored arrangement is therefore
 * one that round 4's check accepted, written into the upgraded office before its first start: Working moved into
 * Office, and All projects in reverse order. It is not a recovery case, because nothing in it is refused.
 */
export const storedBeforeTheAllRuleChanged = 'stored-sidebar-round-4'
export function sidebarRound4Accepted() {
  const arrangement = { groups: SHIPPED_SIDEBAR.groups.map(group => ({ key: String(group.key), keys: [...group.keys] as string[] })) }
  const agents = arrangement.groups.find(group => group.key === 'agents')!, office = arrangement.groups.find(group => group.key === 'office')!
  office.keys.push(...agents.keys.splice(agents.keys.indexOf('working'), 1))
  arrangement.groups.find(group => group.key === 'all')!.keys.reverse()
  return arrangement
}
export const madeUpCard = (name = addedName): RoleCard => ({ name, rung: null, duties: 'Made-up archive duties.', powers: ['Reading everything'], appointedBy: 'the person', appoints: 'nobody', mustRead: { chapters: [{ chapter: 1, level: 'full' }], andWhatItsStarterNames: null }, reportsTo: 'The person.', whatEndsIt: 'When the made-up archive is read.', workArea: { grain: 'folders', most: 'no limit', says: 'Name the made-up archive folders.' } })

/**
 * This is the only added-role storage write. 'whole row' keeps the whole card in its row, as main stored it before the
 * words moved. 'row and record' keeps it as this release does: the powers and the structure in the row, and the words in
 * the card's role_card_words record, filed through the records door.
 */
async function storeAddedRoleBeforeStart(sqlite: Database.Database, how: 'whole row' | 'row and record', name: string, card: RoleCard | string) {
  if (how === 'whole row' || typeof card === 'string') {
    sqlite.prepare('INSERT INTO runtime_settings(name,value) VALUES (?,?)').run('office.role:' + name, typeof card === 'string' ? card : JSON.stringify(card))
    return
  }
  const { theCardWithoutItsWords, theWordsOf } = await import('../src/shared/roles.ts')
  const { createRecord } = await import('../src/server/lib/records.ts')
  sqlite.prepare('INSERT INTO runtime_settings(name,value) VALUES (?,?)').run('office.role:' + name, JSON.stringify(theCardWithoutItsWords(card as unknown as Record<string, unknown>)))
  // The records door refuses a blank word and asks for its key to be left out, so a card with no duties has a record without them.
  const words = Object.fromEntries(Object.entries(theWordsOf(card)).filter(([, word]) => word !== ''))
  createRecord({ kind: 'role_card_words', title: `The words of the ${name} card`, workspaceId: 'default', actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id }, data: { roleName: name, ...words } })
  // An office that filed this record had kept its other records' baselines too, as the notice case says below.
  const { migrateRevisions } = await import('../src/server/db/revision-backfill.ts')
  migrateRevisions(sqlite)
}

/** Every fixture write is here, before liveApp. The returned database reader opens read-only. */
export async function beforeTheOfficeStarts(kind: OfficeKind, bad?: RecoveryCase | typeof storedBeforeTheAllRuleChanged) {
  let file: string, sqlite: Database.Database, close: () => void
  const labelFixture = (target: Database.Database) => {
    target.prepare('UPDATE people SET name=? WHERE id=?').run('Made-up caretaker', THE_TEST_OFFICES_OWNER.id)
    for (const [id, title] of [['made-up-recovery-note', 'Made-up recovery note'], ['made-up-recovery-task', 'Made-up recovery task']]) {
      target.prepare("INSERT INTO records(id,workspace_id,owner_id,kind,title,data,origin,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'2026-10-14 05:00:00','2026-10-14 05:00:00')").run(id, 'default', THE_TEST_OFFICES_OWNER.id, 'note', title, '{}', 'fixture')
    }
  }
  if (kind === 'fresh') {
    const db = await freshDb()
    file = db.file; sqlite = db.client.sqlite; close = () => db.close()
    labelFixture(sqlite)
  } else {
    if (upgradedTemplate === undefined) {
      vi.resetModules()
      const folder = aTestDatabaseFolder('made-up-main-office')
      // Main copies these authoritative chapter records at its first start. Keep their real provenance. This tree's records code
      // may write a column the missing migrations add, so it copies them into a fully migrated scratch office, and their rows
      // move into the made-up office without the columns it lacks.
      const scratch = join(folder, 'scratch.db'); process.env.MOLE_OFFICE_DB = scratch
      const scratchSqlite = (await import('../src/server/db/client.ts')).sqlite
      expect(scratchSqlite.name).toBe(scratch)
      const scratchMigrate = await import('../src/server/db/migrate.ts')
      scratchMigrate.migrateInPlace(scratchSqlite, migrations)
      const before = newestRowids(scratchSqlite)
      // This checkout's copier makes the made-up main office, so the office holds every chapter this checkout ships.
      const { copyTheDefaultRegulationsOnce, readTheDefaultRegulations } = await import('../src/server/lib/default-regulations.ts')
      expect(copyTheDefaultRegulationsOnce().copied).toBe(readTheDefaultRegulations().length)
      const after = newestRowids(scratchSqlite)
      scratchSqlite.close()
      // The move carries the three tables the copy writes, so the copy must have added rows to no other. The index of the
      // records' text is not carried: the office makes it from the records themselves, by 0290's fill when the upgrade adds
      // that migration, and by the records' triggers on the move's inserts once the made-up office already has it.
      const theTextIndex = (table: string) => table === 'record_text' || table.startsWith('record_text_')
      expect(Object.keys(after).filter(table => after[table] !== before[table] && !theTextIndex(table)).sort()).toEqual(['changes', 'records', 'revisions'])
      vi.resetModules()
      const copied = join(folder, 'migrations')
      mkdirSync(join(copied, 'meta'), { recursive: true })
      const entries = journal.entries.filter(entry => !missingMigrations.includes(entry.tag))
      for (const entry of entries) copyFileSync(join(migrations, entry.tag + '.sql'), join(copied, entry.tag + '.sql'))
      writeFileSync(join(copied, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }))
      file = join(folder, 'office.db'); process.env.MOLE_OFFICE_DB = file
      const client = await import('../src/server/db/client.ts')
      sqlite = client.sqlite
      close = () => { sqlite.close(); removeThisTestFolder(folder) }
      const { migrateInPlace } = await import('../src/server/db/migrate.ts')
      migrateInPlace(sqlite, copied)
      moveTheChapterRows(scratch, sqlite, before)
      labelFixture(sqlite)
      const hashes = sqlite.prepare('SELECT hash FROM __drizzle_migrations').all() as { hash: string }[]
      for (const tag of missingMigrations) expect(hashes.map(row => row.hash)).not.toContain(migrationHash(tag))
      // The merge tool dates a branch's migrations after main's newest, so the journal's last two are also its newest by date,
      // and the newest migration the made-up office has is the one before them.
      const newest = entries.at(-1)!
      for (const tag of missingMigrations) expect(journal.entries.find(entry => entry.tag === tag)!.when).toBeGreaterThan(newest.when)
      // The installed office offers this real page before serving. The browser press performs the upgrade.
      const { prepareToServe } = await import('../src/server/db/migrate.ts')
      const decision = prepareToServe(sqlite, migrations)
      if (decision.serve || decision.update === undefined) throw new Error('The main fixture must need the two pending migrations.')
      const backups = join(folder, 'backups'); mkdirSync(backups)
      const { theReducedMode } = await import('../src/server/lib/the-update.ts')
      const reduced = theReducedMode({ sqlite, offer: { file, holds: decision.update.holds, wouldWrite: decision.update.wouldWrite, measuredOn: decision.update.measuredOn, backups }, migrationsFolder: migrations, headers: () => ({}) })
      const { chromium } = await import('playwright')
      const browser = await chromium.launch()
      try {
        await reduced.app.listen({ host: '127.0.0.1', port: 0 })
        const address = reduced.app.server.address()
        if (address === null || typeof address === 'string') throw new Error('The update page has no listening port.')
        const page = await browser.newPage()
        await page.goto(`http://127.0.0.1:${address.port}/`)
        const response = page.waitForResponse(reply => reply.url().endsWith('/api/office/the-update') && reply.request().method() === 'POST')
        await page.getByRole('button', { name: 'Back up and update', exact: true }).click()
        const replied = await response, body = await replied.json()
        evidence('upgraded/press Back up and update', { status: replied.status(), body })
        expect(replied.status(), JSON.stringify(body)).toBe(200)
        expect(body.update.state, JSON.stringify(body)).toBe('done')
        await reduced.done
        expect(prepareToServe(sqlite, migrations).serve).toBe(true)
        const after = sqlite.prepare('SELECT hash FROM __drizzle_migrations').all() as { hash: string }[]
        for (const tag of missingMigrations) expect(after.map(row => row.hash)).toContain(migrationHash(tag))
      } finally { await browser.close(); await reduced.app.close(); sqlite.close() }
      upgradedTemplate = file
    }
    // Each recovery case is a separate office. Its only direct writes precede that office's first start.
    const copy = aTestDatabaseFolder('made-up-upgraded-copy')
    file = join(copy, 'office.db'); copyFileSync(upgradedTemplate, file)
    vi.resetModules(); process.env.MOLE_OFFICE_DB = file
    sqlite = (await import('../src/server/db/client.ts')).sqlite
    close = () => { sqlite.close(); removeThisTestFolder(copy) }
  }
  if (bad !== undefined) {
    const setting = (name: string, value: unknown) => sqlite.prepare('INSERT INTO runtime_settings(name,value) VALUES (?,?)').run(name, typeof value === 'string' ? value : JSON.stringify(value))
    if (bad === 'number-out-of-range') setting(numberName, '65')
    if (bad === 'number-not-a-number') setting(numberName, 'made-up-not-a-number')
    if (bad === 'notice-unknown-kind') sqlite.prepare("INSERT INTO records(id,workspace_id,owner_id,kind,title,data,origin,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'2026-10-14 05:00:00','2026-10-14 05:00:00')").run('made-up-notice-rules', 'message-centre', THE_TEST_OFFICES_OWNER.id, 'notice_rules', 'Made-up old notice rules', JSON.stringify({ recipient: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }, mutedKinds: ['made-up-missing-notice'], because: 'Made-up older release value.' }), 'fixture')
    if (bad.startsWith('word-')) setting('office.word:' + (bad === 'word-unknown-key' ? 'made-up.missing.word' : wordKey), { en: bad === 'word-empty-value' ? '' : 'Made-up unknown word.', zh: null, zhFrom: null })
    if (bad === storedBeforeTheAllRuleChanged) setting('office.sidebar', sidebarRound4Accepted())
    if (bad.startsWith('sidebar-')) {
      const arrangement = { groups: SHIPPED_SIDEBAR.groups.map(group => ({ key: String(group.key), keys: [...group.keys] as string[] })) }
      if (bad === 'sidebar-unknown-page') arrangement.groups[0]!.keys.push('made-up-missing-page')
      else arrangement.groups[0]!.keys.shift()
      setting('office.sidebar', arrangement)
    }
    if (bad.startsWith('role-')) {
      const name = bad === 'role-locked-name' ? 'worker' : addedName
      const card = madeUpCard(name)
      if (bad === 'role-unknown-supervisor') card.reportsTo = 'The made-up-missing-supervisor role.'
      if (bad === 'role-unknown-power') card.powers = ['Made-up missing power']
      if (bad === 'role-unknown-appointee') card.appoints = 'made-up-missing-role' as RoleCard['appoints']
      if (bad === 'role-no-duties') card.duties = ''
      // A fresh office stores a card as this release does. A row under one of the office's own names has no words record
      // of its own in any release, so it stays a whole row.
      await storeAddedRoleBeforeStart(sqlite, kind === 'fresh' && bad !== 'role-locked-name' ? 'row and record' : 'whole row', name, bad === 'role-not-json' ? 'Made-up broken JSON {' : card)
    }
    if (bad.startsWith('chapter-')) {
      // A fresh office files the shipped chapters at its first start. Filing them first, with the same copier, lets the case change one.
      if (kind === 'fresh') {
        const { copyTheDefaultRegulationsOnce, readTheDefaultRegulations } = await import('../src/server/lib/default-regulations.ts')
        expect(copyTheDefaultRegulationsOnce().copied).toBe(readTheDefaultRegulations().length)
      }
      // These are the person's own writes through the records door, as an older page could have made them.
      const { createRecord, getRecord, patchRecord } = await import('../src/server/lib/records.ts')
      const owner = { type: 'human' as const, id: THE_TEST_OFFICES_OWNER.id }
      const held = (n: number) => getRecord((sqlite.prepare("SELECT id FROM records WHERE kind='module' AND deleted_at IS NULL AND json_extract(data,'$.extra.chapter')=?").get(n) as { id: string }).id)!
      if (bad === 'chapter-missing-rule') {
        const seven = held(7)
        patchRecord(seven.id, { dataPatch: { summaryBlocks: (seven.data['summaryBlocks'] as { id: string }[]).filter(rule => rule.id !== 'r-8') } }, owner, { op: 'update', note: 'Made-up older edit that left out rule r-8.' })
      } else {
        const three = held(3)
        const { shortForms, zh, ...data } = three.data as Record<string, unknown> & { shortForms: { label: { text: string } } }
        const copy = createRecord({ kind: 'module', title: three.title, summary: three.summary ?? undefined, workspaceId: three.workspaceId, actor: owner, data })
        // A label names the revision it was written from, so it is written once the copy has one, as the chapter door writes it.
        // The Chinese was written from English that includes the label, so it goes in the same write.
        const newest = sqlite.prepare('SELECT seq, content_hash FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1').get(copy.id) as { seq: number; content_hash: string }
        patchRecord(copy.id, { dataPatch: { zh, shortForms: { label: { text: shortForms.label.text, madeFrom: { seq: newest.seq, contentHash: newest.content_hash } } } } }, owner, { op: 'update', note: 'Made-up older label and Chinese on the second chapter 3.' })
      }
    }
    if (bad === 'notice-unknown-kind' || bad.startsWith('chapter-')) {
      // An office that holds these records kept their baselines too. This avoids testing an unrelated missing-ledger migration.
      const { migrateRevisions } = await import('../src/server/db/revision-backfill.ts')
      migrateRevisions(sqlite)
    }
  }
  return {
    file, close,
    read(sql: string, ...values: string[]) {
      if (!/^SELECT\b/i.test(sql)) throw new Error('After startup this test only reads the database.')
      const reader = new Database(file, { readonly: true, fileMustExist: true })
      try { return reader.prepare(sql).all(...values) } finally { reader.close() }
    },
  }
}
function migrationHash(tag: string) { return createHash('sha256').update(readFileSync(join(migrations, tag + '.sql'))).digest('hex') }
/**
 * The newest rowid of each table, so the rows a write adds are the ones after it. A table WITHOUT ROWID has no rowid, so
 * its count of rows stands in, and a write that adds to it still shows: two of the full-text index's own tables are such tables.
 */
function newestRowids(db: Database.Database) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]
  const noRowid = (name: string) => (db.prepare("SELECT wr FROM pragma_table_list WHERE schema = 'main' AND name = ?").get(name) as { wr: number }).wr === 1
  return Object.fromEntries(tables.map(({ name }) => [name, (db.prepare(`SELECT ${noRowid(name) ? 'count(*)' : 'max(rowid)'} AS n FROM "${name}"`).get() as { n: number | null }).n ?? 0]))
}
/** Moves the rows the chapter copy added to the scratch office into the made-up office, without the columns it lacks. Records go first: a revision and a change name their record. */
function moveTheChapterRows(scratch: string, office: Database.Database, before: Record<string, number>) {
  const from = new Database(scratch, { readonly: true, fileMustExist: true })
  try {
    office.transaction(() => {
      for (const table of ['records', 'revisions', 'changes']) {
        const has = new Set((office.prepare(`SELECT name FROM pragma_table_info('${table}')`).all() as { name: string }[]).map(column => column.name))
        for (const row of from.prepare(`SELECT * FROM "${table}" WHERE rowid > ? ORDER BY rowid`).all(before[table]) as Record<string, unknown>[]) {
          const columns = Object.keys(row).filter(column => has.has(column))
          office.prepare(`INSERT INTO "${table}" (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`).run(...columns.map(column => row[column]))
        }
      }
    })()
  } finally { from.close() }
}

function evidence(name: string, value: unknown) {
  const folder = process.env.W13R_RECOVERY_EVIDENCE
  if (folder) { mkdirSync(folder, { recursive: true }); appendFileSync(join(folder, 'presses-and-readings.jsonl'), JSON.stringify({ name, value }) + '\n') }
}
export type Office = Awaited<ReturnType<typeof startOffice>>
export async function startOffice(kind: OfficeKind, bad?: RecoveryCase | typeof storedBeforeTheAllRuleChanged) {
  const fixture = await beforeTheOfficeStarts(kind, bad)
  let app: LiveApp
  try {
    app = await liveApp({ name: `made-up-${kind}-${bad ?? 'setting-edits'}`, database: fixture.file, workspace: 'default', viewport: { width: 1440, height: 1100 } })
  } catch (error) { evidence(`${kind}/${bad ?? 'start'}/startup-failure`, String(error)); fixture.close(); throw error }
  await app.context.addInitScript(({ id }) => {
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id }))
    localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light')
  }, { id: THE_TEST_OFFICES_OWNER.id })
  if (kind === 'upgraded') {
    const hashes = fixture.read('SELECT hash FROM __drizzle_migrations') as { hash: string }[]
    for (const tag of missingMigrations) expect(hashes.map(row => row.hash)).toContain(migrationHash(tag))
  }
  return { app, fixture, kind, async stop() { await app.stop(); fixture.close() } }
}

/** No POST, PUT or database writer is exposed after startup. Only the page presses below write settings. */
export async function get(office: Office, path: string) {
  const response = await fetch(office.app.api + path, { headers })
  const body = await response.json()
  evidence(`${office.kind}/GET ${path}`, { status: response.status, body })
  return { status: response.status, body }
}
export async function read(office: Office, path: string) {
  const reply = await get(office, path)
  expect(reply.status, JSON.stringify(reply.body)).toBe(200)
  return reply.body
}
export async function open(office: Office, path: string, width = 1440, theme = 'light', mode: 'normal' | 'inspect' = 'normal') {
  await office.app.page.setViewportSize({ width, height: 1100 })
  const url = `${office.app.site}/?lang=en&look=${theme}&mode=${mode}#/${path}`
  // Going to the address already open changes nothing and keeps the old reply, so the same address is loaded again.
  if (office.app.page.url() === url) await office.app.page.reload()
  else await office.app.page.goto(url)
  await waitForThePage(office.app.page, 60_000)
  if (path === 'settings/officecontrols') {
    await office.app.page.locator('.viewswitch').getByRole('button', { name: 'Developer', exact: true }).click()
    evidence(`${office.kind}/press Developer`, 'The running controls are only drawn in this office mode.')
  }
  if (path === 'settings/sidebar') {
    // The old address leads to the sidebar arrangement page, which opens as a reading; its controls are behind Edit
    // (wave 13y round 125, the decision in message ypSj7D2-j2bA).
    await expect.poll(() => new URL(office.app.page.url()).hash).toBe('#/sidebar-arrangement')
    await office.app.page.locator('.pfs').getByRole('link', { name: 'Edit', exact: true }).click()
    await expect.poll(() => new URL(office.app.page.url()).hash).toBe('#/sidebar-arrangement/edit')
    // The bar changes at the press, and the page is drawn again for the new address only after it.
    await waitForThePage(office.app.page, 60_000)
    evidence(`${office.kind}/press Edit`, 'The sidebar arrangement opens as a reading, and its controls are drawn after this press.')
  }
  expect(await office.app.page.locator('html').getAttribute('data-theme')).toBe(theme)
}
async function expand(details: Locator) {
  await details.waitFor()
  if (!await details.evaluate(node => (node as HTMLDetailsElement).open)) await details.locator(':scope > summary').click()
}
export async function press(office: Office, scope: Locator, name: string, door: string) {
  const reply = office.app.page.waitForResponse(response => new URL(response.url()).pathname === door && response.request().method() !== 'GET')
  await scope.getByRole('button', { name, exact: true }).click()
  const response = await reply
  evidence(`${office.kind}/press ${name}`, { method: response.request().method(), door, sent: response.request().postDataJSON(), status: response.status(), body: await response.json() })
  expect(response.status(), await response.text()).toBe(200)
}
async function reason(scope: Locator, label: string, why: string) { await scope.getByLabel(label, { exact: true }).fill('Made-up ' + why) }

/** The regulations page starts in reading mode: chapter editing and recovery presses appear only after its own mode press. */
async function editRegulations(office: Office) {
  await office.app.page.locator('.ofc-mode').getByRole('button', { name: sayInEnglish('regulationsMode.edit'), exact: true }).click()
}

export async function numberEdits(office: Office) {
  await open(office, 'settings/officecontrols')
  const panel = office.app.page.locator(`[data-setting=${numberName}]`)
  await expand(panel)
  const row = async () => (await read(office, '/api/office/settings')).settings.find((one: { name: string }) => one.name === numberName)
  const shipped = (await row()).shippedValue
  await panel.getByLabel('Value', { exact: true }).fill('12')
  await reason(panel, 'Why change this?', 'number edit')
  await press(office, panel, 'Save value', '/api/office/settings')
  expect((await row()).chosen).toBe('12')
  expect(await panel.getByLabel('Value', { exact: true }).inputValue()).toBe('12')
  // Running numbers keep the last change, with no selectable version history. This is the shipped reset press.
  await reason(panel, 'Why change this?', 'number shipped restore')
  await press(office, panel, 'Reset to shipped value', '/api/office/settings')
  expect((await row()).chosen).toBe(shipped)
  expect(await panel.getByLabel('Value', { exact: true }).inputValue()).toBe(shipped)
}
export async function noticeEdits(office: Office) {
  await open(office, 'messages')
  const panel = office.app.page.locator('.px-notice-rules'); await expand(panel)
  const path = '/api/messages/notice-rules'
  const defaults = await read(office, path)
  const mutedKind = 'theBroadcastIsDue'
  const batchedKind = defaults.choices.find((one: { kind: string }) => one.kind !== mutedKind)!.kind
  const muted = panel.locator(`[data-notice-kind=${mutedKind}]`)
  const batched = panel.locator(`[data-notice-kind=${batchedKind}]`)
  await muted.selectOption({ label: sayInEnglish('noticeRules.mute') })
  await batched.selectOption({ label: sayInEnglish('noticeRules.batch') })
  await reason(panel, sayInEnglish('noticeRules.reason'), 'quiet and batch notices')
  await press(office, panel, sayInEnglish('noticeRules.save'), path)
  const edited = await read(office, path)
  expect(edited.mutedKinds).toEqual([mutedKind])
  expect(edited.batchedKinds).toEqual([batchedKind])
  expect(await muted.locator('option:checked').textContent()).toBe(sayInEnglish('noticeRules.mute'))
  expect(await batched.locator('option:checked').textContent()).toBe(sayInEnglish('noticeRules.batch'))
  await reason(panel, sayInEnglish('noticeRules.reason'), 'notice defaults')
  await press(office, panel, sayInEnglish('noticeRules.defaults'), path)
  expect((await read(office, path)).mutedKinds).toEqual(defaults.mutedKinds)
  expect((await read(office, path)).batchedKinds).toEqual(defaults.batchedKinds)
  await reason(panel, sayInEnglish('noticeRules.reason'), 'notice history restore')
  await panel.getByText(sayInEnglish('noticeRules.history'), { exact: true }).click()
  await press(office, panel.locator('details p').last(), sayInEnglish('noticeRules.restore'), path + '/restore')
  const restored = await read(office, path)
  expect(restored.mutedKinds).toEqual(edited.mutedKinds)
  expect(restored.batchedKinds).toEqual(edited.batchedKinds)
  expect(await muted.locator('option:checked').textContent()).toBe(sayInEnglish('noticeRules.mute'))
  expect(await batched.locator('option:checked').textContent()).toBe(sayInEnglish('noticeRules.batch'))
  await reason(panel, sayInEnglish('noticeRules.reason'), 'notice final defaults')
  await press(office, panel, sayInEnglish('noticeRules.defaults'), path)
  expect((await read(office, path)).mutedKinds).toEqual(defaults.mutedKinds)
  expect((await read(office, path)).batchedKinds).toEqual(defaults.batchedKinds)
  expect(await muted.locator('option:checked').textContent()).toBe(sayInEnglish('noticeRules.officeDefault'))
  expect(await batched.locator('option:checked').textContent()).toBe(sayInEnglish('noticeRules.officeDefault'))
}
export async function wordEdits(office: Office) {
  await open(office, 'settings/words')
  const table = office.app.page.locator('[data-word-table]')
  await table.getByLabel('Find a word', { exact: true }).fill(wordKey)
  const panel = table.locator(`[data-word-key="${wordKey}"]`); await expand(panel)
  const row = async () => (await read(office, '/api/words/table?key=' + wordKey)).words[0]
  const shipped = (await row()).shipped
  for (const text of ['Made-up first page words.', 'Made-up second page words.']) {
    await panel.getByLabel('English', { exact: true }).fill(text)
    await reason(panel, 'Why change this word?', text)
    await press(office, panel, 'Save word', '/api/words/table')
    expect((await row()).en).toBe(text)
    await expect.poll(() => panel.getByLabel('Why change this word?', { exact: true }).inputValue()).toBe('')
    await expect.poll(() => panel.getByLabel('English', { exact: true }).inputValue()).toBe(text)
  }
  await panel.getByText('Previous choices', { exact: true }).click()
  await reason(panel, 'Why change this word?', 'word history restore')
  await expect.poll(() => panel.getByRole('button', { name: 'Restore this word', exact: true }).count()).toBe(2)
  await press(office, panel.locator('details').last().locator(':scope > div').last(), 'Restore this word', '/api/words/restore')
  expect((await row()).en).toBe('Made-up first page words.')
  await expect.poll(() => panel.getByLabel('Why change this word?', { exact: true }).inputValue()).toBe('')
  await reason(panel, 'Why change this word?', 'word shipped restore')
  await press(office, panel, 'Use shipped word', '/api/words/restore')
  expect((await row()).en).toEqual(shipped.en)
  await expect.poll(() => panel.getByLabel('English', { exact: true }).inputValue()).toBe(shipped.en)
}
export async function sidebarEdits(office: Office) {
  await open(office, 'settings/sidebar')
  const panel = office.app.page.locator('[data-sidebar-arrangement]')
  const shipped = (await read(office, '/api/sidebar')).shipped
  await panel.locator('[data-sidebar-page=working] select').selectOption('office')
  await press(office, panel, 'Preview', '/api/sidebar/preview')
  await reason(panel, 'Why change the sidebar?', 'sidebar move')
  await press(office, panel, 'Apply', '/api/sidebar')
  const edited = (await read(office, '/api/sidebar')).arrangement
  expect(edited).not.toEqual(shipped)
  expect(await panel.locator('[data-sidebar-page=working] select').inputValue()).toBe('office')
  await sidebarShipped(office)
  await panel.getByText('History', { exact: true }).click()
  await expect.poll(() => panel.locator('.sa-history').count()).toBe(2)
  await press(office, panel.locator('.sa-history').last(), 'Put back', '/api/sidebar/preview')
  await reason(panel, 'Why change the sidebar?', 'sidebar history restore')
  await press(office, panel, 'Apply', '/api/sidebar/restore')
  expect((await read(office, '/api/sidebar')).arrangement).toEqual(edited)
  expect(await panel.locator('[data-sidebar-page=working] select').inputValue()).toBe('office')
  await sidebarShipped(office)
}
/**
 * The stored arrangement loads as it was stored and is used, and the owner's example, Flows into
 * Developer, is then made by presses on top of it. Developer is offered only in developer mode.
 */
export async function storedSidebarStillLoads(office: Office) {
  const stored = sidebarRound4Accepted(), row = await read(office, '/api/sidebar')
  expect(row.arrangement).toEqual(stored)
  expect(row.storedButNotUsed).toBeNull()
  await open(office, 'settings/sidebar', 1440, 'light', 'inspect')
  const panel = office.app.page.locator('[data-sidebar-arrangement]')
  expect(await panel.locator('[data-sidebar-recovery]').count()).toBe(0)
  expect(await panel.locator('[data-sidebar-page=working] select').inputValue()).toBe('office')
  expect(await panel.locator('[data-sidebar-group=all] [data-sidebar-page]').evaluateAll(all => all.map(one => one.getAttribute('data-sidebar-page')))).toEqual(stored.groups[0]!.keys)
  await panel.locator('[data-sidebar-page=flows] select').selectOption('developer')
  await press(office, panel, 'Preview', '/api/sidebar/preview')
  await reason(panel, 'Why change the sidebar?', 'Flows into Developer')
  await press(office, panel, 'Apply', '/api/sidebar')
  const moved = (await read(office, '/api/sidebar')).arrangement as typeof stored
  expect(moved.groups.find(group => group.key === 'developer')!.keys.at(-1)).toBe('flows')
  expect(moved.groups.find(group => group.key === 'all')!.keys).toEqual(stored.groups[0]!.keys.filter(key => key !== 'flows'))
  expect(moved.groups.find(group => group.key === 'office')!.keys).toEqual(stored.groups.find(group => group.key === 'office')!.keys)
  // The moved page reads every project, so the phone's top bar names no project over it; Modules reads one, and names it.
  await open(office, 'flows', 390)
  expect(await office.app.page.locator('.shell-bar-page').textContent()).toBe('Office flows')
  expect(await office.app.page.locator('.shell-bar-project').count()).toBe(0)
  await open(office, 'modules', 390)
  expect(await office.app.page.locator('.shell-bar-project').count()).toBe(1)
  await open(office, 'settings/sidebar')
  await sidebarShipped(office)
}
async function sidebarShipped(office: Office) {
  const panel = office.app.page.locator('[data-sidebar-arrangement]')
  await press(office, panel, 'Restore the shipped arrangement', '/api/sidebar/preview')
  await reason(panel, 'Why change the sidebar?', 'sidebar shipped restore')
  await press(office, panel, 'Apply', '/api/sidebar/restore')
  const row = await read(office, '/api/sidebar')
  expect(row.arrangement).toEqual(row.shipped)
  expect(row.storedButNotUsed).toBeNull()
}
async function fillRole(office: Office, name?: string) {
  const page = office.app.page
  if (name) await page.getByLabel('Name', { exact: true }).fill(name)
  await page.getByLabel('Duties', { exact: true }).fill('Made-up archive duties.')
  await page.locator('.added-choice').filter({ hasText: 'Reading everything' }).locator('input').check()
  await page.getByLabel('Who it reports to', { exact: true }).fill('The person.')
  await page.getByLabel('What ends it', { exact: true }).fill('When the made-up archive is read.')
  await page.getByLabel('Words shown when a work area is refused', { exact: true }).fill('Name the made-up archive folders.')
}
async function roleApply(office: Office, restoring = false) {
  const panel = office.app.page.locator('[data-added-role]')
  await reason(panel, 'Why change this card?', 'role apply or restore')
  await press(office, panel, 'Apply', '/api/roles/added' + (restoring ? '/restore' : ''))
  await expect.poll(() => office.app.page.url()).toContain('#/roles')
  // The page is drawn at once and says it is loading until its read answers; the entrance is drawn only with the cards.
  await office.app.page.locator('.rol [data-added-role-entrance]').waitFor()
}
export async function roleEdits(office: Office) {
  await open(office, 'roles/new'); await fillRole(office, addedName)
  await press(office, office.app.page.locator('[data-added-role]'), 'Preview', '/api/roles/added/preview')
  await roleApply(office)
  const row = async () => (await read(office, '/api/roles/added')).cards.find((one: { name: string }) => one.name === addedName)
  expect((await row()).card.duties).toBe('Made-up archive duties.')
  await open(office, 'roles/added/' + addedName)
  await office.app.page.getByLabel('Duties', { exact: true }).fill('Made-up changed archive duties.')
  await press(office, office.app.page.locator('[data-added-role]'), 'Preview', '/api/roles/added/preview'); await roleApply(office)
  expect((await row()).card.duties).toBe('Made-up changed archive duties.')
  await open(office, `roles/added/${addedName}/history`)
  await office.app.page.locator('[data-role-history] article').nth(1).waitFor()
  await press(office, office.app.page.locator('[data-role-history] article').nth(1), 'Put back', '/api/roles/added/preview')
  // THE ROLES READ IS HELD BACK A SECOND, so the Role cards page still says it is loading when the apply is done, as a
  // loaded machine once made it. The page's text is read only once the page has drawn the cards.
  const held = (url: URL) => url.pathname === '/api/roles'
  await office.app.page.route(held, async route => { await new Promise(done => setTimeout(done, 1000)); await route.continue() })
  await roleApply(office, true)
  expect((await row()).card.duties).toBe('Made-up archive duties.')
  expect(await office.app.page.locator('.rol').innerText()).toContain('Made-up archive duties.')
  await office.app.page.unroute(held)
  // An added role has no shipped card. Remove returns the office to its shipped absence.
  await open(office, `roles/added/${addedName}/remove`)
  await office.app.page.locator('[data-role-preview]').waitFor(); await roleApply(office, true)
  expect(await row()).toBeUndefined()
}

export const editedChapter = 10
const chapterDoor = '/api/office-regulations/chapters'
async function chapterRow(office: Office, n: number) {
  return (await read(office, chapterDoor)).chapters.find((one: { n: number }) => one.n === n)
}
/** The English of a chapter. A shipped restore keeps the Chinese only where the English did not change. */
function englishOf(chapter: ChapterContent) {
  return { label: chapter.label, title: chapter.title, conclusion: chapter.conclusion, rules: chapter.rules.map(rule => ({ id: rule.id, heading: rule.heading, text: rule.text })) }
}
/** Preview, give a reason, then Apply or Restore: the three presses that end every chapter change. */
async function chapterWrite(office: Office, editor: Locator, restoring: boolean, why: string) {
  await press(office, editor, 'Preview chapter', chapterDoor + '/preview')
  expect(await editor.locator('[data-chapter-preview] [role=alert]').count(), `${why}: the preview names no problem`).toBe(0)
  await reason(editor, 'Why change this chapter?', why)
  await press(office, editor, restoring ? 'Restore chapter' : 'Apply chapter', chapterDoor + (restoring ? '/restore' : ''))
  await editor.locator('[data-chapter-form]').waitFor({ state: 'detached' })
}
async function chapterEdit(office: Office, editor: Locator, title: string, chineseTitle: string) {
  await editor.getByRole('button', { name: 'Edit chapter', exact: true }).click()
  await editor.getByLabel('English title', { exact: true }).fill(title)
  await editor.getByLabel('Chinese title', { exact: true }).fill(chineseTitle)
  await chapterWrite(office, editor, false, 'chapter edit ' + title)
  expect((await chapterRow(office, editedChapter)).chapter.title).toBe(title)
}
async function chapterHistory(editor: Locator) {
  const toggle = editor.getByRole('button', { name: 'Chapter history', exact: true })
  if (await toggle.count()) await toggle.click()
  return editor.locator('[data-chapter-history]')
}
export async function chapterEdits(office: Office) {
  await open(office, 'regulations')
  const editor = office.app.page.locator(`[data-chapter-editor="${String(editedChapter)}"]`)
  await editor.waitFor()
  const shipped = (await chapterRow(office, editedChapter)).shipped as ChapterContent
  expect((await chapterRow(office, editedChapter)).inUse).toBe('stored')
  // Reading mode is the default: the chapter is drawn, and its editing press is not drawn until the page's own press.
  expect(await editor.getByRole('button', { name: sayInEnglish('chapterEdit.edit'), exact: true }).count()).toBe(0)
  await editRegulations(office)
  await expect.poll(() => editor.getByRole('button', { name: sayInEnglish('chapterEdit.edit'), exact: true }).count()).toBe(1)
  await chapterEdit(office, editor, 'Made-up first chapter title', '虚构的第一个章名')
  await chapterEdit(office, editor, 'Made-up second chapter title', '虚构的第二个章名')
  // The history names each version by its revision number. The second newest is the first edit.
  const versions = (await read(office, `${chapterDoor}/${String(editedChapter)}/history`)).versions as { seq: number; after: ChapterContent }[]
  expect(versions[1]!.after.title).toBe('Made-up first chapter title')
  const history = await chapterHistory(editor)
  await history.getByRole('button', { name: `Restore version ${String(versions[1]!.seq)}`, exact: true }).click()
  await chapterWrite(office, editor, true, 'chapter history restore')
  expect((await chapterRow(office, editedChapter)).chapter.title).toBe('Made-up first chapter title')
  await (await chapterHistory(editor)).getByRole('button', { name: 'Restore the shipped chapter', exact: true }).click()
  await chapterWrite(office, editor, true, 'chapter shipped restore')
  const after = await chapterRow(office, editedChapter)
  expect(after.inUse).toBe('stored'); expect(after.notUsed).toBeNull()
  expect(englishOf(after.chapter)).toEqual(englishOf(shipped))
  expect(await editor.locator('[data-chapter-recovery]').count()).toBe(0)
}

function chapterOf(bad: RecoveryCase) { return bad === 'chapter-missing-rule' ? 7 : 3 }
async function recoveryPage(office: Office, bad: RecoveryCase, width = 1440, theme = 'light') {
  const route = bad.startsWith('number-') ? 'settings/officecontrols' : bad.startsWith('notice-') ? 'messages' : bad.startsWith('word-') ? 'settings/words' : bad.startsWith('sidebar-') ? 'settings/sidebar' : bad.startsWith('chapter-') ? 'regulations' : `roles/added/${bad === 'role-locked-name' ? 'worker' : addedName}/history`
  await open(office, route, width, theme)
  const page = office.app.page
  const panel = page.locator(bad.startsWith('number-') ? `[data-setting=${numberName}]` : bad.startsWith('notice-') ? '.px-notice-rules' : bad.startsWith('word-') ? '[data-word-table]' : bad.startsWith('sidebar-') ? '[data-sidebar-arrangement]' : bad.startsWith('chapter-') ? `[data-chapter-editor="${String(chapterOf(bad))}"]` : '[data-added-role]')
  await panel.waitFor()
  if (bad.startsWith('number-') || bad.startsWith('notice-')) await expand(panel)
  return panel
}
async function recoveryPictures(office: Office, bad: RecoveryCase) {
  const folder = process.env.W13R_RECOVERY_PICTURES
  if (office.kind !== 'fresh' || !folder) return
  mkdirSync(folder, { recursive: true })
  for (const [width, theme] of [[1440, 'light'], [390, 'dark']] as const) {
    const panel = await recoveryPage(office, bad, width, theme)
    const alert = panel.getByRole('alert').first()
    const recovery = panel.locator('[data-sidebar-recovery]')
    const target = await alert.count() ? alert : await recovery.count() ? recovery : bad === 'role-unknown-supervisor' ? panel.getByLabel('Who it reports to', { exact: true }) : panel
    await target.evaluate(node => { (node as HTMLElement).style.scrollMarginTop = '240px'; node.scrollIntoView({ block: 'start' }) })
    // This label identifies the fixture; it does not supply or change the product's error text.
    const called = bad.startsWith('number-') ? 'the Office controls page' : bad.startsWith('notice-') ? 'the Messages page' : bad.startsWith('word-') ? 'the Words page' : bad.startsWith('sidebar-') ? 'the Sidebar settings page' : bad.startsWith('chapter-') ? 'the Regulations page' : 'the Role cards page'
    await putTheMadeUpLabelIn(office.app.page, 'Made-up recovery test office', target, called)
    await office.app.page.screenshot({ path: join(folder, `${bad}-${width}-${theme}.png`) })
    await takeTheMadeUpLabelOut(office.app.page)
  }
}
export async function recover(office: Office, bad: RecoveryCase) {
  await recoveryPictures(office, bad)
  const panel = await recoveryPage(office, bad)
  const page = office.app.page
  // Word read failures use status too. Successful-save status messages are not recovery warnings.
  // A refused number, unused notice rules and unused words each have their own named status notice.
  const alerts = panel.locator('[role=alert], [data-sidebar-recovery][role=status], .px-error[role=status], [data-stored-refused][role=status], [data-notice-rules-not-used][role=status], [data-words-not-used][role=status]')
  // Soft assertions keep exercising the available press and preserve evidence of every unmet condition.
  // reportsTo is prose, not a role reference (supervisor clarification 1Edmq107XGZy).
  // Its unrecognised sentence is read back intact and remains editable. Other bad values must be named as unused.
  if (bad !== 'role-unknown-supervisor') expect.soft(await alerts.count(), `${bad}: the page must name the unusable stored value with an alert or status notice`).toBeGreaterThan(0)
  evidence(`${office.kind}/${bad}/page-before`, await panel.innerText())
  if (bad.startsWith('number-')) {
    const row = (await read(office, '/api/office/settings')).settings.find((one: { name: string }) => one.name === numberName)
    // The door names the stored value this release refuses. It does not claim which value each reader uses.
    expect.soft(row.storedButRefused, `${bad}: GET must name the stored number this release refuses`).toBeTruthy()
    await reason(panel, 'Why change this?', 'repair saved number')
    await press(office, panel, 'Reset to shipped value', '/api/office/settings')
    const after = (await read(office, '/api/office/settings')).settings.find((one: { name: string }) => one.name === numberName)
    expect(after.chosen).toBe(after.shippedValue); expect(after.unreadable).toBeNull(); expect(after.storedButRefused).toBeNull()
  } else if (bad.startsWith('sidebar-')) {
    const before = await read(office, '/api/sidebar')
    expect(before.storedButNotUsed?.problems.length).toBeGreaterThan(0)
    expect(before.arrangement).toEqual(before.shipped)
    await sidebarShipped(office)
  } else if (bad.startsWith('notice-')) {
    const before = await get(office, '/api/messages/notice-rules')
    expect.soft(before.status, 'Unknown notice kinds must leave a readable recovery choice').toBe(200)
    expect.soft(before.body.storedButNotUsed, 'GET must name the stored notice kind as not used').toBeTruthy()
    const restore = panel.getByRole('button', { name: 'Use office wake defaults', exact: true })
    expect(await restore.count(), 'FINDING: unknown notice kind leaves an error and no defaults press').toBe(1)
    await reason(panel, 'Why change these rules?', 'repair saved notice rules')
    await press(office, panel, 'Use office wake defaults', '/api/messages/notice-rules')
    expect((await read(office, '/api/messages/notice-rules')).mutedKinds).toEqual([])
  } else if (bad.startsWith('word-')) {
    const key = bad === 'word-unknown-key' ? 'made-up.missing.word' : wordKey
    // The whole table names every saved word this release cannot use, including a key it does not have.
    const before = await get(office, '/api/words/table')
    expect.soft(before.status, 'An unusable stored word must remain readable for recovery').toBe(200)
    expect.soft(before.body.storedButNotUsed?.some((one: { key: string }) => one.key === key), `${bad}: GET must name the saved word as not used`).toBe(true)
    if (bad === 'word-unknown-key') {
      // This release has no row for the key, so the notice's own press removes the saved word.
      const notUsed = panel.locator('[data-words-not-used]')
      await reason(notUsed, 'Why remove a saved word?', 'repair saved word')
      await press(office, notUsed.locator(`[data-word-not-used="${key}"]`), 'Remove this saved word', '/api/words/restore')
    } else {
      await panel.getByLabel('Find a word', { exact: true }).fill(key)
      const editor = panel.locator(`[data-word-key="${key}"]`); await expand(editor)
      await reason(editor, 'Why change this word?', 'repair saved word')
      await press(office, editor, 'Use shipped word', '/api/words/restore')
    }
    expect((await read(office, '/api/words/table')).storedButNotUsed.some((one: { key: string }) => one.key === key)).toBe(false)
  } else if (bad.startsWith('chapter-')) {
    const n = chapterOf(bad)
    const held = () => office.fixture.read("SELECT id FROM records WHERE kind='module' AND deleted_at IS NULL AND json_extract(data,'$.extra.chapter')=CAST(? AS INTEGER) ORDER BY id", String(n)) as { id: string }[]
    const before = await chapterRow(office, n)
    // The door names every stored record it does not use and reads the shipped chapter in their place.
    expect(before.inUse).toBe('shipped')
    expect([...before.notUsed.records].sort()).toEqual(held().map(one => one.id).sort())
    expect(before.notUsed.problems.join(' ')).toContain(bad === 'chapter-missing-rule' ? 'r-8' : 'more than one live record')
    // The recovery press belongs to editing mode, so the page's own mode press comes before it.
    await editRegulations(office)
    await panel.locator('[data-chapter-recovery]').getByRole('button', { name: 'Restore the shipped chapter', exact: true }).click()
    // Two records hold the chapter, so the press asks which one keeps it. The other is removed by the same write.
    const kept = held()[0]!.id
    if (bad === 'chapter-two-records') await panel.getByLabel('Which record should keep this chapter?', { exact: true }).selectOption(kept)
    await chapterWrite(office, panel, true, 'repair saved chapter')
    const after = await chapterRow(office, n)
    expect(after.inUse).toBe('stored'); expect(after.notUsed).toBeNull()
    expect(englishOf(after.chapter)).toEqual(englishOf(after.shipped))
    expect(held().map(one => one.id)).toEqual([kept])
  } else {
    const name = bad === 'role-locked-name' ? 'worker' : addedName
    const before = await read(office, '/api/roles/added')
    if (bad === 'role-unknown-supervisor') {
      expect(before.cards.find((row: { name: string }) => row.name === name).card.reportsTo).toBe('The made-up-missing-supervisor role.')
      expect((await read(office, '/api/roles')).cards.find((card: { name: string }) => card.name === name).reportsTo).toBe('The made-up-missing-supervisor role.')
      expect(await panel.getByLabel('Who it reports to', { exact: true }).inputValue()).toBe('The made-up-missing-supervisor role.')
    } else expect.soft(before.leftOut.some((row: { name: string }) => row.name === name), `${bad}: GET must list the unusable role`).toBe(true)
    if (bad === 'role-locked-name') {
      await press(office, panel, 'Remove', '/api/roles/added/preview')
      await reason(panel, 'Why change this card?', 'remove conflicting added row')
      expect(await panel.getByRole('button', { name: 'Apply', exact: true }).isEnabled(), 'FINDING: the locked-name row cannot be removed by its recovery press').toBe(true)
      await roleApply(office, true)
    } else {
      if (bad === 'role-unknown-power') await page.locator('.added-choice').filter({ hasText: 'Made-up missing power' }).locator('input').click()
      await fillRole(office)
      await press(office, panel, 'Preview', '/api/roles/added/preview')
      await roleApply(office)
      // Whichever way the card was stored, the press keeps it as this release does: its words in one live record, none in its row.
      const [row] = office.fixture.read('SELECT value FROM runtime_settings WHERE name=?', 'office.role:' + name) as { value: string }[]
      expect(JSON.parse(row!.value)).not.toHaveProperty('duties')
      const held = office.fixture.read("SELECT data FROM records WHERE kind='role_card_words' AND deleted_at IS NULL AND json_extract(data,'$.roleName')=?", name) as { data: string }[]
      expect(held).toHaveLength(1)
      expect(JSON.parse(held[0]!.data).duties).toBeTruthy()
    }
    expect((await read(office, '/api/roles/added')).leftOut.some((row: { name: string }) => row.name === name)).toBe(false)
    await open(office, 'roles')
    expect(await page.locator('[data-left-out-roles]').count()).toBe(0)
  }
  await expect.poll(() => alerts.count(), { message: `${bad}: the recovery alert is gone` }).toBe(0)
  evidence(`${office.kind}/${bad}/page-after`, await page.locator('main').innerText())
}

export async function lockedCards(office: Office) {
  const reply = await read(office, '/api/roles')
  // These are the complete public cards and the permission declaration used to expand their powers.
  const cards = reply.cards.filter((card: { source: string }) => card.source === 'built-in')
  return { cards, personCards: reply.personCards, powers: reply.powers, tree: reply.tree, acts: Object.fromEntries([...cards, ...reply.personCards].map((card: RoleCard) => [card.name, powersOn(reply, card).flatMap(power => power.acts)])) }
}

export async function rolesListNamesAnUnusedCard(office: Office) {
  await open(office, 'roles')
  const row = office.app.page.locator('[data-left-out-roles] article').filter({ hasText: addedName })
  await row.waitFor()
  expect(await row.innerText()).toContain('Made-up missing power')
  expect(await row.getByRole('link', { name: 'Restore', exact: true }).count()).toBe(1)
  expect(await row.evaluate(node => Boolean(node.closest('[role=alert], [role=status]') || node.querySelector('[role=alert], [role=status]'))), 'FINDING: the Roles list names the unusable card without an alert or status role').toBe(true)
}
