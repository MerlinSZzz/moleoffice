// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { aliasLibrary, fileSyntheticAlias, inventedRegistry, rawHistory, syntheticAlias } from './registry-alias-fixture.ts'

let t: TestDb
beforeEach(async () => { t = await freshDb(); inventedRegistry(t) })
afterEach(() => t?.close())

describe('permanent typed registry aliases', () => {
  it('files aliases atomically, keeps retired targets and changes no historical bytes', async () => {
    const before = rawHistory(t), lib = await fileSyntheticAlias(t)
    lib.fileRegistryAliases(t.client.sqlite, [syntheticAlias])
    lib.fileRegistryAliases(t.client.sqlite, [{ ...syntheticAlias, aliasId: 'still-older-cobalt' }])
    expect(lib.equivalentRegistryIds(t.client.sqlite, { namespace: 'agent-registry', id: syntheticAlias.aliasId })).toEqual(['CanonicalA1', 'archived-cobalt', 'still-older-cobalt'])
    expect(rawHistory(t)).toEqual(before)
  })
  it.each([
    ['unknown type', { ...syntheticAlias, namespace: 'handle' }],
    ['untyped', { aliasId: 'untyped', canonicalId: 'CanonicalA1' }],
    ['extra property', { ...syntheticAlias, extra: true }],
    ['orphan', { ...syntheticAlias, canonicalId: 'AbsentTarget' }],
    ['registry source collision', { ...syntheticAlias, aliasId: 'CanonicalB2' }],
    ['self cycle', { ...syntheticAlias, canonicalId: syntheticAlias.aliasId }],
    ['empty source', { ...syntheticAlias, aliasId: '' }],
  ])('refuses %s before writing any row', async (_name, bad) => {
    const lib = await aliasLibrary()
    expect(() => lib.fileRegistryAliases(t.client.sqlite, [{ ...syntheticAlias, aliasId: 'otherwise-valid' }, bad])).toThrow()
    expect(t.client.sqlite.prepare('SELECT * FROM registry_aliases').all()).toEqual([])
  })
  it('refuses duplicate source conflicts, retargeting and alias chains without partial filing', async () => {
    const lib = await fileSyntheticAlias(t)
    const before = t.client.sqlite.prepare('SELECT * FROM registry_aliases').all()
    for (const rows of [
      [{ ...syntheticAlias, canonicalId: 'CanonicalB2' }],
      [{ ...syntheticAlias, aliasId: 'new-alias', canonicalId: syntheticAlias.aliasId }],
      [{ ...syntheticAlias, aliasId: 'new-alias' }, { ...syntheticAlias, aliasId: 'new-alias', canonicalId: 'CanonicalB2' }],
    ]) expect(() => lib.fileRegistryAliases(t.client.sqlite, rows)).toThrow()
    expect(t.client.sqlite.prepare('SELECT * FROM registry_aliases').all()).toEqual(before)
  })
  it('enforces immutability, canonical target survival and registry-id reservation in SQL', async () => {
    await fileSyntheticAlias(t)
    const before = t.client.sqlite.prepare('SELECT * FROM registry_aliases').all()
    for (const sql of [
      "UPDATE registry_aliases SET canonical_id='CanonicalB2'",
      'DELETE FROM registry_aliases',
      "UPDATE agents SET id='archived-cobalt' WHERE id='CanonicalB2'",
      "DELETE FROM agents WHERE id='CanonicalA1'",
      "UPDATE agents SET id='AnotherCanonical' WHERE id='CanonicalA1'",
      "INSERT INTO agents (id,name,handle,avatar_asset_id,created_at) VALUES ('archived-cobalt','Synthetic','fresh-address','synthetic-asset-b','2026-01-01 00:00:00')",
      "INSERT INTO registry_aliases (namespace,alias_id,canonical_id) VALUES ('agent-registry','orphan','missing')",
      "INSERT INTO registry_aliases (namespace,alias_id,canonical_id) VALUES ('agent-registry','CanonicalB2','CanonicalA1')",
      "INSERT INTO registry_aliases (namespace,alias_id,canonical_id) VALUES ('agent-registry','chain','archived-cobalt')",
    ]) expect(() => t.client.sqlite.exec(sql), sql).toThrow(/alias/i)
    t.client.sqlite.exec("UPDATE agents SET handle='another-address', retired=1 WHERE id='CanonicalB2'")
    expect(t.client.sqlite.prepare('SELECT * FROM registry_aliases').all()).toEqual(before)
  })
  it('resolves stored identities before reused handles consistently in cached database readers', async () => {
    await fileSyntheticAlias(t)
    const refs = await import('../src/server/lib/agent-references.ts')
    for (const reader of [refs.theAgentWithThisId.bind(null, t.client.sqlite), refs.eachAgentsIdentityReadOnce(t.client.sqlite), refs.everyAgentsIdentityReadOnce(t.client.sqlite), refs.everyAgentsIdentityWithReferencesReadOnce(t.client.sqlite)]) {
      expect(reader(syntheticAlias.aliasId)?.id).toBe(syntheticAlias.canonicalId)
      expect(reader('current-cobalt')).toBeNull()
    }
    const could = refs.everyAgentAReferenceCouldName(t.client.sqlite, syntheticAlias.aliasId)
    expect(could.byId?.id).toBe('CanonicalA1')
    expect(could.liveByHandle?.id).toBe('CanonicalB2')
    expect(refs.theOneAgentAmong(could)).toBeNull()
    expect(refs.everyAgentsIdentityWithReferencesReadOnce(t.client.sqlite).reference?.(syntheticAlias.aliasId)).toEqual(could)
  })
  it('keeps namespace mandatory and queries finite spellings once per real primary key', async () => {
    const lib = await fileSyntheticAlias(t)
    t.client.sqlite.exec('CREATE TABLE synthetic_identity_rows (part TEXT, seq INTEGER, first_kind TEXT, first_id TEXT, second_kind TEXT, second_id TEXT, PRIMARY KEY (part,seq))')
    const add = t.client.sqlite.prepare('INSERT INTO synthetic_identity_rows VALUES (?,?,?,?,?,?)')
    add.run('a',1,'agent',syntheticAlias.aliasId,'agent','CanonicalA1')
    add.run('a',2,'agent','CanonicalA1','system',syntheticAlias.aliasId)
    add.run('b',1,'person',syntheticAlias.aliasId,'system','CanonicalA1')
    add.run('b',2,'agent','CanonicalB2','record',syntheticAlias.aliasId)
    const query = { table: 'synthetic_identity_rows', references: [{ kindColumn:'first_kind', idColumn:'first_id' }, { kindColumn:'second_kind', idColumn:'second_id' }], identity: { namespace:'agent-registry', id:'CanonicalA1' } }
    expect(lib.rowsForRegistryIdentity(t.client.sqlite, query).map(row => [row['part'],row['seq']])).toEqual([['a',1],['a',2]])
    expect(lib.rowsForRegistryIdentity(t.client.sqlite, { ...query, identity:{ namespace:'agent-registry', id:syntheticAlias.aliasId } })).toEqual(lib.rowsForRegistryIdentity(t.client.sqlite, query))
    for (const namespace of [undefined, 'person', 'system', 'handle', 'record', 'key', 'asset']) {
      expect(() => lib.equivalentRegistryIds(t.client.sqlite, { namespace, id:syntheticAlias.aliasId } as never)).toThrow()
    }
    expect(() => lib.equivalentRegistryIds(t.client.sqlite, { namespace:'agent-registry', id:'MissingIdentity' })).toThrow()
  })
  it('uses aliases for stored stamps and participants but keeps arriving ambiguity explicit', async () => {
    await fileSyntheticAlias(t)
    const participants = await import('../src/server/lib/participants.ts')
    const list = participants.listParticipants().agents
    expect(participants.theAgentAStoredReferenceNamesIn(list)(syntheticAlias.aliasId)?.id).toBe('CanonicalA1')
    expect(participants.theAgentAStoredReferenceNamesIn(list.filter(row => row.id !== 'CanonicalA1'))(syntheticAlias.aliasId)).toBeNull()
    expect(participants.theAgentAStoredIdNames(syntheticAlias.aliasId)?.id).toBe('CanonicalA1')
    const arriving = () => participants.participantForActor({type:'agent',id:syntheticAlias.aliasId})
    expect(arriving).toThrow(syntheticAlias.canonicalId)
    expect(arriving).toThrow('CanonicalB2')
    expect(participants.participantForActor({type:'agent',id:syntheticAlias.aliasId,keyHolder:'CanonicalA1'})).toEqual({kind:'agent',id:'CanonicalA1'})
    expect(participants.participantForActor({type:'system',id:syntheticAlias.aliasId})).toBeNull()
    expect(participants.participantForActor({type:'human',id:syntheticAlias.aliasId})).toBeNull()
    expect(t.api.everyAgentAStoredStampCouldName(syntheticAlias.aliasId).map(row => row.id)).toEqual(['CanonicalA1'])
  })
  it('binds the alias migration level to its stable slug after queue renumbering', async () => {
    const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'))
    const entry=journal.entries.find((row:{tag:string})=>row.tag.endsWith('_registry_aliases_keep_their_identity'))
    expect(entry).toBeDefined()
    const renamed={...journal,entries:journal.entries.map((row:{tag:string})=>row===entry?{...entry,tag:'0999_registry_aliases_keep_their_identity'}:row)}
    renamed.entries.push({...entry,tag:'0305_another_schema_part',when:entry.when+1000})
    vi.resetModules()
    vi.doMock('node:fs',async()=>{
      const actual=await vi.importActual<typeof import('node:fs')>('node:fs')
      return {...actual,readFileSync:(...args:Parameters<typeof actual.readFileSync>)=>String(args[0]).endsWith('/meta/_journal.json')?JSON.stringify(renamed):actual.readFileSync(...args)}
    })
    try { expect((await aliasLibrary()).registryAliasMigrationWhen()).toBe(entry.when) }
    finally { vi.doUnmock('node:fs') }
  })
  it('migration 0305 is idempotent without replacing filed relations', async () => {
    await fileSyntheticAlias(t)
    const journal = JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url),'utf8'))
    const entry = journal.entries.find((row: {tag:string}) => row.tag.endsWith('_registry_aliases_keep_their_identity'))
    expect(entry).toBeDefined()
    const sql = readFileSync(new URL(`../drizzle/${entry.tag}.sql`,import.meta.url),'utf8')
    for (let pass=0;pass<2;pass++) for (const part of sql.split('--> statement-breakpoint')) t.client.sqlite.exec(part)
    expect(t.client.sqlite.prepare('SELECT * FROM registry_aliases').all()).toEqual([{namespace:'agent-registry',alias_id:syntheticAlias.aliasId,canonical_id:syntheticAlias.canonicalId}])
  })
})
