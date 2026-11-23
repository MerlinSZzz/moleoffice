// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { expect, it } from 'vitest'
import { buildTheFirstOfficeInAHook, freshDb } from './helpers.ts'
import { CHANGES, WHOLE } from '../src/server/lib/pack/manifest.ts'

buildTheFirstOfficeInAHook()

it('chooses a whole pack for an empty or broken folder, Sunday, or an explicit request', async () => {
  const office = await freshDb()
  try {
    const { makePack } = await import('../src/server/lib/pack/make.ts')
    const root = dirname(office.file)
    const packs = join(root, 'packs')
    const weekday = new Date(2026, 10, 23, 9)
    const empty = await makePack({ to: packs, database: office.file, now: weekday })
    expect(empty.pack).toBe(WHOLE)
    expect(empty.notes.join(' ')).toContain('No readable pack chain')
    const next = await makePack({ to: packs, database: office.file, now: new Date(2026, 10, 24, 9) })
    expect(next.pack).toBe(CHANGES)
    const sunday = await makePack({ to: packs, database: office.file, now: new Date(2026, 10, 29, 9) })
    expect(sunday.pack).toBe(WHOLE)
    const broken = join(root, 'broken')
    mkdirSync(broken)
    const name = 'not-a-pack.zip'
    writeFileSync(join(broken, name), 'broken')
    const unreadable = 'mole-office-pack-20260101-010000-whole.zip'
    writeFileSync(join(broken, unreadable), 'broken')
    const repaired = await makePack({ to: broken, database: office.file, now: weekday })
    expect(repaired.pack).toBe(WHOLE)
    expect(repaired.notes.join(' ')).toContain(name)
    expect(repaired.notes.join(' ')).toContain(unreadable)
    const command = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/pack.ts', 'make', '--to', packs, '--whole', '--json'], { encoding: 'utf8', env: { ...process.env, MOLE_OFFICE_DB: office.file } })
    expect(command.status, command.stdout + command.stderr).toBe(0)
    expect(command.stdout).toContain(`"pack": "${WHOLE}"`)
    expect(command.stdout).toContain('No pack record was filed')
  } finally { office.close() }
}, 120_000)
