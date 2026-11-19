// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { it,expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
const run=(args:string[])=>spawnSync(process.execPath,['--import','tsx',join(process.cwd(),'tools/storage/upload.ts'),...args],{encoding:'utf8'})
it('provides usable offline upload/restore help and refuses missing arguments without the office',()=>{
 const help=run(['--help']);expect(help.status,help.stderr).toBe(0);expect(help.stdout).toContain('--database');expect(help.stdout).toContain('--destination');expect(help.stdout).toContain('restore');expect(help.stdout).toContain('--base')
 const invalid=run(['upload']);expect(invalid.status).not.toBe(0);expect(invalid.stderr).toContain('--database')
})
