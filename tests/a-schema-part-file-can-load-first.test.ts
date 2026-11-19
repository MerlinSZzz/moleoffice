// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY SCHEMA PART FILE CAN BE THE FIRST FILE LOADED, and schema.ts still loads whole after it.
 *
 * schema.ts reads some part tables while it loads: it builds AUTHORED_TABLE_OF, and the maps made from
 * it, out of them. A part file that imports schema.ts back makes a cycle. When such a file is loaded
 * before schema.ts, schema.ts runs inside that file's load and finds the file's table not yet made.
 * Node and this runner usually load schema.ts first, so nothing else here fails. The bundled office's
 * chunks loaded a part first, and the office stopped at start, reading a column list of undefined.
 *
 * So this loads each part file first, in a fresh set of modules, and then schema.ts. An import()
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
        const schema = await import('../src/server/db/schema.ts')
        const missing = Object.entries(schema.AUTHORED_TABLE_OF).filter(([, table]) => table === undefined).map(([name]) => name)
        if (missing.length > 0) failed.push(`${file}: schema.ts loaded with no table for ${missing.join(', ')}`)
      } catch (e) {
        failed.push(`${file}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    expect(failed.join('\n')).toBe('')
  })
})
