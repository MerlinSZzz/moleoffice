// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY SCHEMA PART FILE CAN BE THE FIRST FILE LOADED, and schema.ts and the maps made from its tables still load
 * whole after it.
 *
 * authored-table-of.ts reads every part table while it loads: it builds AUTHORED_TABLE_OF, and the maps made from
 * it, out of them. Until those maps moved there, schema.ts built them in its own body. A part file that imports
 * schema.ts back makes a cycle. When such a file was loaded before schema.ts, schema.ts ran inside that file's load
 * and found the file's table not yet made. Node and this runner usually load schema.ts first, so nothing else here
 * failed. The bundled office's chunks loaded a part first, and the office stopped at start, reading a column list of
 * undefined.
 *
 * So this loads each part file first, in a fresh set of modules, then schema.ts, then the maps. An import()
 * inside a function runs only when that function is called, so it is no part of the load.
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const PARTS = join(import.meta.dirname, '..', 'src', 'server', 'db', 'schema-parts')
const PART_FILES = readdirSync(PARTS).filter((file) => file.endsWith('.ts')).sort()

describe('a schema part file loaded first', () => {
  it('is looked for among the part files', () => {
    expect(PART_FILES.length).toBeGreaterThan(50)
  })

  it('leaves schema.ts whole after it, for every part file', async () => {
    const failed: string[] = []
    for (const file of PART_FILES) {
      vi.resetModules()
      try {
        await import(join(PARTS, file))
        await import('../src/server/db/schema.ts')
        const maps = await import('../src/server/db/authored-table-of.ts')
        const missing = Object.entries(maps.AUTHORED_TABLE_OF).filter(([, table]) => table === undefined).map(([name]) => name)
        if (missing.length > 0) failed.push(`${file}: the maps were made with no table for ${missing.join(', ')}`)
      } catch (e) {
        failed.push(`${file}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    expect(failed.join('\n')).toBe('')
  })
})
