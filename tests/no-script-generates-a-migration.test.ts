// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NO SCRIPT GENERATES A MIGRATION.
 *
 * Every migration is written by hand, and the coordinator gives its number
 * (tests/how-a-migration-is-written.ts). A script that runs drizzle-kit's generator would write a
 * migration with a number nobody gave, so package.json has none. drizzle-kit stays a development
 * dependency: tests/a-schema-part-table-is-exported-and-restored.test.ts reads statements from its
 * diff, and drizzle.config.ts still names the schema for it.
 *
 *   1. package.json, read as JSON, has no `db:generate` script.
 *
 * The two refusals of tests/schema-inventory.test.ts are case 2 there.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const PACKAGE = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { scripts?: Record<string, string> }

describe('no script generates a migration', () => {
  it('1: package.json has no db:generate script', () => {
    expect(PACKAGE.scripts, 'package.json has no scripts, so nothing was checked').toBeDefined()
    expect(Object.keys(PACKAGE.scripts ?? {})).not.toContain('db:generate')
  })
})
