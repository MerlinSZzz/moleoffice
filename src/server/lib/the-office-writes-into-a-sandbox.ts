// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ONE PLACE THE OFFICE'S SERVER WRITES INTO A SANDBOX FOLDER (Fr7xGMIidn97, way (a), on the conditions of
 * XHY2fVFG3Qq8, answer 6). Before this the server only read a sandbox folder: the brief the next-round and worker-run
 * doors read (./next-round.ts `theBriefAt`). The sandbox tool, tools/sandbox.mjs, makes and fills sandbox folders, and the
 * message worker starts it on the host for a round or a worker run; the server never did. Now the merge queue writes the
 * brief of a conflict it hands on into the briefs folder of the asked agent's sandbox (./merge-state-machine.ts
 * `writeTheResolveBrief`).
 *
 * A program in the sandbox can change the folder while the office writes, so the file is made in four steps:
 *   - the briefs folder is held open inside the sandbox folder's real path, refusing a link, and its real path must be
 *     the briefs folder of that real path;
 *   - the file is created through that open folder, as a new file (never one that is there already) and refusing a link,
 *     so a link put in the folder's place after it was opened does not move where the file is made. A name that is taken
 *     goes on to the next, for at most THE_MOST_NAMES_A_BRIEF_TRIES names, because the server tries them on its one
 *     thread (x2y70-Bc8xmi);
 *   - before a byte is written, the created file must be the one at the path the office names, by its device and inode,
 *     and its name in the open folder must lead to that path. If it is not, nothing is written into it and it is left
 *     empty;
 *   - the brief is written, and a failure says the file may hold part of it.
 * It refuses rather than write through a link. A refusal says what was found and what was written.
 *
 * A BRIEF'S DECLARATION, when the caller gives its words, is written beside the brief as `<the brief's file name>.round.json`,
 * the file the round start reads (src/shared/round-chapters/delivery.ts, `roundDeclaration`). The next-round door writes one
 * for an ask that names inside packages (./next-round.ts). It is made in the same steps as the brief, through the same open
 * folder. Each is made only as a new file: a taken brief's name goes on to the next name, and a taken declaration's name
 * refuses the whole before either file is made. Both files are created before either is written: a declaration that cannot be
 * created leaves its brief empty, and a failed write says which file may hold part of its words.
 *
 * THE NAME IS CHECKED HERE TOO, and not only by the caller: letters, digits, "-" and "_", so no name reaches outside the
 * briefs folder. This is the office's one writer into a sandbox, so it does not rely on its caller (a review,
 * forwarded in 8MQYUt5KEfoD).
 *
 * THE FOLDER IS HELD OPEN BY THE OPERATING-SYSTEM LAYER, `inAFolderHeldOpen` in ./resources.ts, because the way to hold a
 * folder is the machine's own (A7): Linux names a folder held open through /proc/self/fd. On
 * another system that layer holds nothing, and the office refuses to write rather than write without holding the folder
 * open.
 */
import { closeSync, constants, fstatSync, lstatSync, openSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { inAFolderHeldOpen } from './resources.ts'

/** The sandbox's own folder for briefs (tools/sandbox.mjs makes it with the sandbox). */
export const THE_SANDBOXS_BRIEFS = 'briefs'

/** How many names a brief tries before it is refused: `<stem>.md`, then `<stem>-2.md` to `<stem>-20.md`. */
export const THE_MOST_NAMES_A_BRIEF_TRIES = 20

/** What a brief's declaration is named after the brief's own file name. */
export const A_BRIEFS_DECLARATION_ENDS = '.round.json'

/** The refusal when the name a brief's declaration takes is there already. */
export function aDeclarationsNameIsTakenSays(path: string): string {
  return `${path} is there already, and a brief's declaration is written only as a new file, so the office made neither the brief nor its declaration. Nothing was written.`
}

/** The characters a brief's name may hold. */
const A_BRIEFS_NAME = /^[A-Za-z0-9_-]+$/

const said = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/** Where `path` leads by now, or null when nothing is there to lead anywhere. */
function whereItLeads(path: string): string | null {
  try { return realpathSync(path) } catch { return null }
}

/**
 * Create `file` through the held folder as a new file, refusing a link. Before a byte is written it must be the file at
 * `path` by its device and inode, and its name in the open folder must lead to that path; when it is not, it is closed
 * and left empty. `taken` when the name is there already.
 */
function aNewFileThrough(within: (name: string) => string, file: string, path: string): { fd: number } | { taken: true } | { failed: string } | { moved: true } {
  let fd: number
  try { fd = openSync(within(file), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o644) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return { taken: true }
    return { failed: said(error) }
  }
  let kept = false
  try {
    const made = fstatSync(fd)
    const there = lstatSync(path, { throwIfNoEntry: false })
    if (there === undefined || !there.isFile() || there.dev !== made.dev || there.ino !== made.ino || whereItLeads(within(file)) !== path) return { moved: true }
    kept = true
    return { fd }
  } finally { if (!kept) closeSync(fd) }
}

/**
 * WRITE A BRIEF AS A NEW FILE IN THE SANDBOX'S BRIEFS FOLDER, named `<stem>.md`, or `<stem>-2.md` and on to the last
 * name it tries when that name is taken. `text` is given the name without `.md`, so a brief can name a folder of its own after it. Returns the
 * absolute path written and that name, or why nothing (or only an empty file) was written. With `declaration`, its words
 * are written beside the brief as `<name>.md.round.json`, and the answer names that file's absolute path too.
 */
export function writeABriefIntoASandbox(
  folder: string,
  stem: string,
  text: (name: string) => string,
  declaration?: (name: string) => string,
): { path: string; name: string; declaration?: string } | { refused: string } {
  if (!A_BRIEFS_NAME.test(stem)) {
    return { refused: `A brief's name holds only letters, digits, "-" and "_", and ${JSON.stringify(stem)} does not. Nothing was written.` }
  }
  let inside: string
  try { inside = realpathSync(folder) } catch (error) { return { refused: `The sandbox folder ${folder} cannot be read: ${said(error)}. Nothing was written.` } }
  const dir = join(inside, THE_SANDBOXS_BRIEFS)
  const done = inAFolderHeldOpen(inside, [THE_SANDBOXS_BRIEFS], (within, held): { path: string; name: string; declaration?: string } | { refused: string } => {
    const heldAt = realpathSync(held)
    if (heldAt !== dir) return { refused: `The briefs folder the office opened is at ${heldAt}, not ${dir}. Nothing was written.` }
    for (let n = 1; n <= THE_MOST_NAMES_A_BRIEF_TRIES; n += 1) {
      const name = `${stem}${n === 1 ? '' : `-${String(n)}`}`
      const path = join(dir, `${name}.md`)
      const declared = `${name}.md${A_BRIEFS_DECLARATION_ENDS}`
      const declaredPath = join(dir, declared)
      if (declaration !== undefined) {
        if (lstatSync(within(`${name}.md`), { throwIfNoEntry: false }) !== undefined) continue
        if (lstatSync(within(declared), { throwIfNoEntry: false }) !== undefined) return { refused: aDeclarationsNameIsTakenSays(declaredPath) }
      }
      const brief = aNewFileThrough(within, `${name}.md`, path)
      if ('taken' in brief) continue
      if ('failed' in brief) return { refused: `${path} cannot be created as a new file: ${brief.failed}. Nothing was written.` }
      if ('moved' in brief) {
        return { refused: `${path} changed while the office created it, so the office wrote nothing into the file it created, which is left empty.` }
      }
      try {
        if (declaration === undefined) {
          try { writeFileSync(brief.fd, text(name)) }
          catch (error) { return { refused: `${path} was created, and writing the brief into it failed: ${said(error)}. The file may hold part of the brief.` } }
          return { path, name }
        }
        const second = aNewFileThrough(within, declared, declaredPath)
        if (!('fd' in second)) {
          const why = 'taken' in second ? 'was taken while the office created the brief' : 'failed' in second ? `cannot be created as a new file: ${second.failed}` : 'changed while the office created it'
          return { refused: `${declaredPath} ${why}, so the office wrote nothing into the brief ${path} it created, which is left empty, and wrote no declaration.` }
        }
        try {
          try { writeFileSync(brief.fd, text(name)) }
          catch (error) { return { refused: `${path} was created, and writing the brief into it failed: ${said(error)}. The file may hold part of the brief, and its declaration ${declaredPath} is left empty.` } }
          try { writeFileSync(second.fd, declaration(name)) }
          catch (error) { return { refused: `${path} was written, and writing its declaration into ${declaredPath} failed: ${said(error)}. The declaration may hold part of its words.` } }
          return { path, name, declaration: declaredPath }
        } finally { closeSync(second.fd) }
      } finally { closeSync(brief.fd) }
    }
    const last = `${stem}-${String(THE_MOST_NAMES_A_BRIEF_TRIES)}.md`
    return { refused: `Every name the office tries in ${dir} is taken, from ${stem}.md to ${last}, and it tries no more than ${String(THE_MOST_NAMES_A_BRIEF_TRIES)}. Nothing was written.` }
  })
  if (!('notHeld' in done)) return done
  // 'a link' is the held folder's word for a part that is a link or no folder (inAFolderHeldOpen in ./resources.ts).
  if (done.notHeld === 'a link') return { refused: `${dir} is a link or not a folder, and the office does not write through a link. Nothing was written.` }
  return { refused: `The office cannot hold the briefs folder ${dir} open while it writes: ${done.notHeld}. Nothing was written.` }
}
