// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aPreAliasDatabase, aliasLibrary, fileSyntheticAlias, inventedRegistry, rawHistory, syntheticAlias } from './registry-alias-fixture.ts'

let source: TestDb, restored: TestDb | undefined, archive: string
beforeEach(async () => { source = await freshDb(); inventedRegistry(source); archive = aTestDatabaseFolder('alias-archive') })
afterEach(() => { source?.close(); restored?.close(); restored = undefined; if (archive) removeThisTestFolder(archive) })
const actor = {type:'human',id:THE_TEST_OFFICES_OWNER.id} as const
async function exported(scoped = false) {
  await fileSyntheticAlias(source)
  const run = source.api.createRecord({kind:'session',workspaceId:'default',title:'Synthetic preserved worker map',origin:'fixture',data:{state:'running',runtime:'codex'},actor})
  source.api.patchRecord(run.id,{dataPatch:{extra:{pin:'original-hash',asset:syntheticAlias.aliasId}}},actor)
  source.api.writeTheWorkerRun(run.id,syntheticAlias.aliasId,{
    state:'started',run:'synthetic-run',askedAt:'2026-01-01 00:00:00',
    askedBy:{who:{kind:'agent',id:syntheticAlias.aliasId},session:'synthetic-parent'},handle:'synthetic-worker',
    brief:{path:'/synthetic/brief.md',sha256:'0'.repeat(64),bytes:1},
    sandbox:{folder:'/synthetic',instance:'synthetic',container:'synthetic'},
  },actor)
  const raw=JSON.stringify(source.api.getRecord(run.id)!.data,null,2)
  source.client.sqlite.prepare('UPDATE records SET data=? WHERE id=?').run(raw,run.id)
  const last = source.client.sqlite.prepare('SELECT id FROM revisions WHERE record_id=? ORDER BY seq DESC LIMIT 1').get(run.id) as {id:string}
  source.client.sqlite.prepare('UPDATE revisions SET data=? WHERE id=?').run(raw,last.id)
  const lib = await import('../src/server/lib/export.ts')
  lib.writeExport(archive, scoped ? {workspaceId:'default'} : {})
  return {lib,run,raw}
}
function change(path: string, pattern: RegExp, replacement: string) {
  const full=join(archive,path), original=readFileSync(full,'utf8')
  expect(pattern.test(original),path).toBe(true)
  writeFileSync(full,original.replace(pattern,replacement))
}
/** A second project, whose run names its own agent by an old id, and a grant and a work area on the first project's agent. */
async function anotherProject() {
  const db=source.client.sqlite
  ;(await import('../src/server/lib/workspaces.ts')).createWorkspace({id:'synthetic-other',title:'Synthetic other project'})
  db.prepare('INSERT INTO assets (id, kind, origin, mime, created_at) VALUES (?, ?, ?, ?, ?)').run('synthetic-asset-c','avatar','default','image/svg+xml','2026-01-03 00:00:00')
  db.prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, created_at, retired) VALUES (?, ?, ?, ?, ?, ?)').run('CanonicalC3','Synthetic slate','current-slate','synthetic-asset-c','2026-01-03 00:00:00',0)
  db.prepare('UPDATE agents SET elevation=?, work_area=? WHERE id=?').run(JSON.stringify([{id:'SyntheticGrant1'}]),JSON.stringify(['/srv/synthetic-work-area']),syntheticAlias.canonicalId)
  ;(await aliasLibrary()).fileRegistryAliases(db,[{namespace:'agent-registry',aliasId:'archived-slate',canonicalId:'CanonicalC3'}])
  const run=source.api.createRecord({kind:'session',workspaceId:'synthetic-other',title:'Synthetic run in the other project',origin:'fixture',data:{state:'running',runtime:'codex'},actor})
  source.api.writeTheWorkerRun(run.id,'archived-slate',{
    state:'started',askedAt:'2026-01-03 00:00:00',askedBy:{who:{kind:'agent',id:'archived-slate'},session:'synthetic-parent'},handle:'synthetic-worker',
    brief:{path:'/synthetic/brief.md',sha256:'0'.repeat(64),bytes:1},sandbox:{folder:'/synthetic',instance:'synthetic',container:'synthetic'},
  },actor)
}
/** Imports the archive into a new office that `prepare` fills, and asks that it is refused for `problem` with nothing written. */
async function refusedInto(prepare: (db: TestDb) => void | Promise<void>, problem: RegExp) {
  restored?.close()
  restored = await freshDb()
  await prepare(restored)
  const db=restored.client.sqlite
  const tables=()=>({history:rawHistory(restored!),agents:db.prepare('SELECT * FROM agents ORDER BY id').all(),aliases:db.prepare('SELECT * FROM registry_aliases ORDER BY alias_id').all()})
  const before=tables()
  const lib=await import('../src/server/lib/import.ts')
  const plan=lib.planImport(archive)
  expect(plan.ok).toBe(false)
  expect(plan.refusals.map(one=>one.problem).join('\n')).toMatch(problem)
  expect(() => lib.applyImport(archive)).toThrow()
  expect(tables()).toEqual(before)
}
async function mustRefuse() {
  restored = await freshDb()
  const before=rawHistory(restored), beforeAgents=restored.client.sqlite.prepare('SELECT * FROM agents ORDER BY id').all()
  const lib=await import('../src/server/lib/import.ts')
  expect(lib.planImport(archive).ok).toBe(false)
  expect(() => lib.applyImport(archive)).toThrow()
  expect(rawHistory(restored)).toEqual(before)
  expect(restored.client.sqlite.prepare('SELECT * FROM agents ORDER BY id').all()).toEqual(beforeAgents)
}

describe('aliases and original history survive archives', () => {
  it('round-trips literal history bytes, hashes and aliases in full archives', async () => {
    const {run,raw}=await exported()
    const before=rawHistory(source), aliases=source.client.sqlite.prepare('SELECT * FROM registry_aliases').all()
    restored = await freshDb()
    const lib=await import('../src/server/lib/import.ts')
    expect(lib.planImport(archive).refusals).toEqual([])
    lib.applyImport(archive)
    for (const table of ['records','revisions','changes'] as const) {
      const rows=before[table] as Record<string,unknown>[]
      for (const row of rows) expect(restored.client.sqlite.prepare(`SELECT * FROM ${table} WHERE id=?`).get(row['id'])).toEqual(row)
    }
    expect(restored.client.sqlite.prepare('SELECT data FROM records WHERE id=?').get(run.id)).toEqual({data:raw})
    expect(restored.client.sqlite.prepare('SELECT * FROM registry_aliases').all()).toEqual(aliases)
    expect((await import('../src/server/lib/participants.ts')).theAgentAStoredIdNames(syntheticAlias.aliasId)?.id).toBe(syntheticAlias.canonicalId)
    const again=lib.applyImport(archive)
    expect(Object.values(again.inserts).reduce((a,b)=>a+b,0)).toBe(0)
    expect(Object.values(again.updates).reduce((a,b)=>a+b,0)).toBe(0)
    expect(restored.client.sqlite.prepare('SELECT count(*) AS n FROM held_keys').get()).toEqual({n:0})
  })
  it('carries in a project archive only the alias of each old id its own rows store, and no agent, grant or setting', async () => {
    await anotherProject()
    const {lib}=await exported(true)
    const page=readFileSync(join(archive,'schema-parts/registry_aliases.md'),'utf8')
    expect(page).toMatch(/aliasId: "archived-cobalt"/)
    expect(page).toMatch(/carries 1 of the 2 permanent registry aliases/)
    expect(page).not.toMatch(/Only the whole-installation archive carries it/)
    const {counts,notes}=lib.buildExport({workspaceId:'default'}).report
    expect(counts['registry_aliases']).toBe(1)
    expect(counts['agents']).toBe(0)
    expect(readFileSync(join(archive,'MANIFEST.md'),'utf8')).toMatch(/^registry_aliases: 1$/m)
    for(const file of readdirSync(archive,{recursive:true}).map(String).filter(path=>statSync(join(archive,path)).isFile())) {
      expect(readFileSync(join(archive,file),'utf8'),file).not.toMatch(/archived-slate|CanonicalC3|SyntheticGrant1|synthetic-work-area/)
    }
    const said=notes.join('\n')
    expect(said).toMatch(/carries 1 of the 2 permanent registry aliases/)
    expect(said).toMatch(/The agents those aliases point to are NOT in this archive, nor the grants and settings kept on their registry rows/)
    expect(said).toMatch(/[1-9]\d* place\(s\) in this archive's rows could not be read for an agent id/)
  })
  it('imports a project archive where the alias\'s agent is held, and refuses it atomically where it is missing, hijacked, retargeted, doubled or lost', async () => {
    await exported(true)
    restored=await freshDb(); inventedRegistry(restored)
    const agents=restored.client.sqlite.prepare('SELECT * FROM agents ORDER BY id').all()
    const importer=await import('../src/server/lib/import.ts')
    expect(importer.planImport(archive).refusals).toEqual([])
    importer.applyImport(archive)
    expect(restored.client.sqlite.prepare('SELECT namespace, alias_id, canonical_id FROM registry_aliases').all())
      .toEqual([{namespace:'agent-registry',alias_id:syntheticAlias.aliasId,canonical_id:syntheticAlias.canonicalId}])
    expect(restored.client.sqlite.prepare('SELECT * FROM agents ORDER BY id').all()).toEqual(agents)
    expect((await import('../src/server/lib/participants.ts')).theAgentAStoredIdNames(syntheticAlias.aliasId)?.id).toBe(syntheticAlias.canonicalId)

    await refusedInto(() => {}, /orphan target "CanonicalA1"/)
    await refusedInto(db => {
      inventedRegistry(db)
      db.client.sqlite.prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, created_at, retired) VALUES (?, ?, ?, ?, ?, ?)')
        .run(syntheticAlias.aliasId,'Synthetic taken id','synthetic-taken','synthetic-asset-b','2026-01-03 00:00:00',0)
    }, /source "archived-cobalt" is another registry id/)
    await refusedInto(async db => {
      inventedRegistry(db)
      ;(await aliasLibrary()).fileRegistryAliases(db.client.sqlite,[{...syntheticAlias,canonicalId:'CanonicalB2'}])
    }, /cannot be retargeted/)
    const file=join(archive,'schema-parts/registry_aliases.md'), text=readFileSync(file,'utf8')
    writeFileSync(file,text+'\n'+text.match(/```mole-office registry_aliases\n[\s\S]*?```/)?.[0].replace('CanonicalA1','CanonicalB2')+'\n')
    change('MANIFEST.md',/^registry_aliases: 1$/m,'registry_aliases: 2')
    await refusedInto(db => inventedRegistry(db), /a second registry_aliases row claiming namespace \+ aliasId = agent-registry · archived-cobalt/)
    rmSync(file)
    change('MANIFEST.md',/^registry_aliases: .*\n/m,'')
    await refusedInto(db => inventedRegistry(db), /does not count `registry_aliases`/)
  })
  it.each([
    ['unknown type', /namespace: "agent-registry"/, 'namespace: "asset"'],
    ['orphan', /canonicalId: "CanonicalA1"/, 'canonicalId: "AbsentTarget"'],
    ['source collision', /aliasId: "archived-cobalt"/, 'aliasId: "CanonicalB2"'],
    ['chain', /canonicalId: "CanonicalA1"/, 'canonicalId: "archived-cobalt"'],
    ['unknown column', /namespace: "agent-registry"/, 'namespace: "agent-registry"\nunsupported: true'],
  ])('refuses imported %s atomically', async (_name,pattern,replacement) => {
    await exported(); change('schema-parts/registry_aliases.md',pattern,replacement); await mustRefuse()
  })
  it('refuses duplicate conflicting alias rows atomically', async () => {
    await exported()
    const file=join(archive,'schema-parts/registry_aliases.md'), text=readFileSync(file,'utf8')
    const block=text.match(/```mole-office registry_aliases\n[\s\S]*?```/)?.[0]
    expect(block).toBeDefined()
    writeFileSync(file,text+'\n'+block?.replace('CanonicalA1','CanonicalB2')+'\n')
    change('MANIFEST.md',/registry_aliases: 1/,'registry_aliases: 2')
    await mustRefuse()
  })
  it('refuses loss of alias relation even when the count/capability lines are removed', async () => {
    await exported()
    rmSync(join(archive,'schema-parts/registry_aliases.md'))
    change('MANIFEST.md',/^registry_aliases: .*\n/m,'')
    await mustRefuse()
  })
  it.each(['missing','unknown version','semantic disagreement','duplicate'])('refuses %s raw history envelope atomically', async variant => {
    await exported()
    const {HISTORY_BYTES_FOLDER,HISTORY_BYTES_VERSION,historyBytesPage}=await import('../src/server/lib/registry-aliases/history-bytes.ts')
    const page=historyBytesPage(1)
    expect(readdirSync(join(archive,HISTORY_BYTES_FOLDER)).map(name=>`${HISTORY_BYTES_FOLDER}/${name}`)).toEqual([page])
    if(variant==='missing') rmSync(join(archive,HISTORY_BYTES_FOLDER),{recursive:true})
    if(variant==='unknown version') change(page,new RegExp(`"version": ${String(HISTORY_BYTES_VERSION)},`),'"version": 999,')
    if(variant==='semantic disagreement') change(page,/original-hash/,'different-pin')
    if(variant==='duplicate') writeFileSync(join(archive,historyBytesPage(2)),readFileSync(join(archive,page)))
    await mustRefuse()
  })
  it('removes a stale optional history envelope on same-root re-export while retaining required bytes', async () => {
    await exported()
    const {HISTORY_BYTES_FILE,HISTORY_BYTES_FOLDER,historyBytesPage}=await import('../src/server/lib/registry-aliases/history-bytes.ts')
    const page=join(archive,historyBytesPage(1)), first=readFileSync(page,'utf8')
    // What an older export may leave in the root: the one envelope of the first capability, and a page no longer made.
    writeFileSync(join(archive,HISTORY_BYTES_FILE),first)
    writeFileSync(join(archive,historyBytesPage(2)),first)
    const exporter=await import('../src/server/lib/export.ts')
    const again=exporter.writeExport(archive)
    expect(readFileSync(page,'utf8')).toBe(first)
    expect(again.written.filter(path=>path.startsWith(`${HISTORY_BYTES_FOLDER}/`))).toEqual([])
    expect(again.removed).toEqual([HISTORY_BYTES_FILE,historyBytesPage(2)])
    restored=await freshDb()
    const emptyExporter=await import('../src/server/lib/export.ts')
    emptyExporter.writeExport(archive)
    expect(existsSync(join(archive,HISTORY_BYTES_FOLDER))).toBe(false)
    expect(existsSync(join(archive,HISTORY_BYTES_FILE))).toBe(false)
    expect((await import('../src/server/lib/import.ts')).planImport(archive).refusals).toEqual([])
  })
  it('refuses an imported retargeting of a filed alias against the complete resulting registry', async () => {
    await exported()
    change('schema-parts/registry_aliases.md',/canonicalId: "CanonicalA1"/,'canonicalId: "CanonicalB2"')
    restored=await freshDb(); inventedRegistry(restored); await fileSyntheticAlias(restored)
    const before=rawHistory(restored), aliases=restored.client.sqlite.prepare('SELECT * FROM registry_aliases').all()
    const importer=await import('../src/server/lib/import.ts')
    expect(importer.planImport(archive).ok).toBe(false)
    expect(()=>importer.applyImport(archive)).toThrow()
    expect(rawHistory(restored)).toEqual(before)
    expect(restored.client.sqlite.prepare('SELECT * FROM registry_aliases').all()).toEqual(aliases)
  })
  it('keeps empty-alias archive hand edits compatible and refuses any unsupported declared byte capability', async () => {
    const record=source.api.createRecord({kind:'module',workspaceId:'default',title:'Synthetic editable archive',data:{context:'synthetic-original'},actor})
    const exporter=await import('../src/server/lib/export.ts')
    exporter.writeExport(archive)
    change(`records/module/${record.id}.md`,/"context": "synthetic-original"/,'"context": "synthetic-edited"')
    const importer=await import('../src/server/lib/import.ts')
    expect(importer.planImport(archive).refusals).toEqual([])
    importer.applyImport(archive)
    expect(source.api.getRecord(record.id)?.data['context']).toBe('synthetic-edited')
    const manifest=join(archive,'MANIFEST.md'), original=readFileSync(manifest,'utf8')
    for(const capability of ['registryAliases','historyBytes']) {
      const without=original.replace(new RegExp('^'+capability+': .*\\n','m'),'')
      writeFileSync(manifest,without.replace(/^(format: .*\n)/m,'$1'+capability+': 999\n'))
      expect(importer.planImport(archive).ok).toBe(false)
    }
    writeFileSync(manifest,original.replace(/^(format: .*\n)/m,'$1historyBytes: 1\n'))
    rmSync(join(archive,'history-bytes.md'),{force:true})
    expect(importer.planImport(archive).ok).toBe(false)
    writeFileSync(manifest,original.replace(/^historyBytes: .*\n/m,''))
    writeFileSync(join(archive,'history-bytes.md'),'```json mole-office history_bytes\n{"version":1,"rows":[]}\n```\n')
    expect(importer.planImport(archive).ok).toBe(false)
  })
  it('accepts genuinely pre-alias archives while refusing missing metadata from alias-era ones', async () => {
    const lib=await import('../src/server/lib/export.ts'); lib.writeExport(archive)
    // Reconstruct the last pre-alias grammar from a synthetic empty-alias archive, including its migration list, which
    // ends before the alias migration: every migration from it on is taken out, a later one as well.
    const manifest=join(archive,'MANIFEST.md')
    writeFileSync(manifest,readFileSync(manifest,'utf8').replace(/^registry_aliases: .*\n/m,'').replace(/^registryAliases: .*\n/m,'').replace(/^historyBytes: .*\n/m,''))
    rmSync(join(archive,'schema-parts/registry_aliases.md'))
    rmSync(join(archive,'history-bytes.md'),{force:true})
    const aliasWhen=(await aliasLibrary()).registryAliasMigrationWhen()
    writeFileSync(manifest,readFileSync(manifest,'utf8').replace(/```mole-office migrations\n((?:(?!```)[\s\S])*?)```\n?/g,(block,fields:string)=>{
      const when=/^when: (\d+)$/m.exec(fields)
      if(when===null) throw new Error('a migration in the exported manifest has no when: '+block)
      return Number(when[1])>=aliasWhen?'':block
    }))
    restored=await freshDb()
    const importer=await import('../src/server/lib/import.ts')
    expect(importer.planImport(archive).refusals).toEqual([])
    importer.applyImport(archive)
    expect(restored.client.sqlite.prepare('SELECT * FROM registry_aliases').all()).toEqual([])
  })
  it.each(['missing','malformed','extra column'])('refuses %s alias storage in a sanitized SQLite backup at migration 0305', async shape => {
    await fileSyntheticAlias(source)
    const copy=join(archive,'synthetic-copy.db')
    source.client.sqlite.prepare('VACUUM INTO ?').run(copy)
    const backup=await import('../src/server/lib/backup.ts')
    expect(backup.verify(copy).problems).toEqual([])
    const Database=(await import('better-sqlite3')).default, db=new Database(copy)
    try {
      if(shape==='missing') db.exec('DROP TABLE registry_aliases')
      else if(shape==='extra column') db.exec('ALTER TABLE registry_aliases ADD COLUMN untyped_reference TEXT')
      else {
        db.exec('DROP TRIGGER registry_aliases_immutable_update; PRAGMA ignore_check_constraints=ON')
        db.prepare('UPDATE registry_aliases SET namespace=?').run('asset')
      }
    } finally {db.close()}
    expect(backup.verify(copy).problems.join(' ')).toMatch(/alias/i)
  })
  it('verifies and restores a genuinely pre-0305 SQLite backup into a newer schema', async () => {
    const copy=join(archive,'synthetic-old-copy.db')
    ;(await aPreAliasDatabase('alias-backup')).db.prepare('VACUUM INTO ?').run(copy)
    const Database=(await import('better-sqlite3')).default
    const backup=await import('../src/server/lib/backup.ts')
    expect(backup.verify(copy).problems).toEqual([])
    const recovered=join(archive,'synthetic-recovered.db'); cpSync(copy,recovered)
    const restoring=new Database(recovered)
    try {
      const {migrateInPlace}=await import('../src/server/db/migrate.ts')
      migrateInPlace(restoring,new URL('../drizzle',import.meta.url).pathname)
      expect(restoring.prepare('SELECT * FROM registry_aliases').all()).toEqual([])
    } finally {restoring.close()}
    expect(backup.verify(recovered).problems).toEqual([])
  })
})
