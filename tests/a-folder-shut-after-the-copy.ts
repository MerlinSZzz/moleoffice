// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FOLDER SHUT AFTER A PRESS HAS MADE ITS COPY, so the write that follows fails and the copy cannot be taken away
 * (wave 13t, round W26).
 *
 * A press that changes a file the person keeps copies it to a backup name first, then writes the file whole to a
 * temporary file beside it and renames that into place. The words of a refusal whose copy could not be removed are only
 * said when the folder takes the copy and then refuses the rename and the removal. This makes that happen on the real
 * file system, with nothing mocked:
 *
 * - a named pipe is put at the press's temporary path, so the press waits when it opens that path to write;
 * - a Node process of its own waits for the copy to appear, shuts the folder to 0o500, then reads the pipe to its end,
 *   so the press goes on;
 * - the rename then fails, and so does the removal of the copy.
 *
 * If the copy does not appear within five seconds, the process reads the pipe without shutting the folder, so a press
 * that made no copy is shown by what the case checks rather than by a test that never ends. Root may write in any
 * folder, so run as root this proves nothing. A case that uses it asks tests/root-may-write-in-any-folder.ts first and
 * skips as root, and the helper itself throws as root, in that rule's words (round W27). Since round W28 both ask
 * whether a shut folder takes a write (tests/a-shut-folder-takes-a-write.ts), not whether the uid is 0.
 */
import { execFileSync, spawn } from 'node:child_process'
import { chmodSync, rmSync, statSync } from 'node:fs'

import { aShutFolderTakesAWrite } from './a-shut-folder-takes-a-write.ts'
import { ROOT_MAY_WRITE_IN_ANY_FOLDER } from './root-may-write-in-any-folder.ts'

const THE_WAIT = `
const fs = require('node:fs')
const [copy, folder, pipe] = process.argv.slice(1)
const until = Date.now() + 5000
const nap = new Int32Array(new SharedArrayBuffer(4))
while (!fs.existsSync(copy) && Date.now() < until) Atomics.wait(nap, 0, 0, 10)
if (fs.existsSync(copy)) fs.chmodSync(folder, 0o500)
fs.readFileSync(pipe)
`

/**
 * Run `press` with the folder shut as soon as `copy` appears in it, and give back what the press gave. The folder's own
 * mode is put back and the pipe removed afterwards, whatever the press did.
 */
export async function aFolderShutAfterTheCopy<T>(at: { folder: string; copy: string; temporary: string }, press: () => T | Promise<T>): Promise<T> {
  if (aShutFolderTakesAWrite()) throw new Error(`${ROOT_MAY_WRITE_IN_ANY_FOLDER} Ask skippedAsRoot(context) before this helper.`)
  const mode = statSync(at.folder).mode & 0o777
  execFileSync('mkfifo', [at.temporary])
  const waiting = spawn(process.execPath, ['-e', THE_WAIT, at.copy, at.folder, at.temporary], { stdio: 'ignore' })
  const ended = new Promise<void>((resolve) => waiting.once('exit', () => resolve()))
  try {
    return await press()
  } finally {
    if (waiting.exitCode === null && waiting.signalCode === null) waiting.kill('SIGKILL')
    await ended
    chmodSync(at.folder, mode)
    rmSync(at.temporary, { force: true })
  }
}
