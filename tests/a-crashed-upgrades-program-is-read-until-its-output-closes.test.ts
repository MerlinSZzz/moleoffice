// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE CRASHED UPGRADE'S PROGRAM WROTE IS READ UNTIL ITS OUTPUT CLOSES.
 *
 * crashTheUpgradeAt in tests/a-closed-stable-upgrade.ts reads how its program ended, and what it wrote, through
 * theEndOf. Output can still be on its way when a program has exited, and a failure read at that moment can lose the
 * program's own last sentence. Here that order is made certain rather than left to the machine: the made-up program
 * starts a process that shares its output and exits at once, and that process writes the last sentence 300 ms later.
 *
 * MUTATION (after a control run, then restored): theEndOf resolves at 'exit' again → the last sentence is missing.
 */
import { spawn } from 'node:child_process'
import { expect, it } from 'vitest'
import { theEndOf } from './a-closed-stable-upgrade.ts'

it("keeps a program's last sentence that reaches its output after the program has exited", async () => {
  const late = "setTimeout(()=>process.stderr.write('Synthetic last sentence, written after the program had exited.\\n'),300)"
  const program = `const {spawn}=require('node:child_process');
spawn(process.execPath,['-e',${JSON.stringify(late)}],{stdio:['ignore','inherit','inherit']});
process.stdout.write('Synthetic first line.\\n');process.exit(3)`
  const ended = await theEndOf(spawn(process.execPath, ['-e', program], { stdio: ['ignore', 'pipe', 'pipe'] }))
  expect(ended.code).toBe(3)
  expect(ended.said).toContain('Synthetic first line.')
  expect(ended.said, 'what the program wrote, as read when it ended').toContain('Synthetic last sentence, written after the program had exited.')
})
