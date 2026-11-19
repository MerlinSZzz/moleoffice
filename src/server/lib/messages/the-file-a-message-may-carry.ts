// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FILES A MESSAGE MAY CARRY: only ones the file door, GET /api/file in src/server/api/files.ts, will serve to the
 * person it is sent to. Asked by the record door, src/server/lib/records.ts, on every write that gives a message a file.
 *
 * IT IS HERE AND NOT IN THE DOOR'S OWN FILE so the record door imports a module of lib, never one of api. The rule it asks
 * is still the door's own, `whereAFileIs` and `openConfined`, so the send and the door cannot come to disagree.
 */
import { closeSync } from 'node:fs'
import { picturesOf } from '@shared/messages.ts'
import { MAX_PREVIEW_BYTES } from '@shared/preview-limit.ts'
import { openConfined, previewRoots, rootsSentence, usableStoredPath, whereAFileIs, type OpenFile, type PreviewRoot } from '../where-a-file-may-be-read.ts'
import { NOTHING_WAS_SENT } from '@shared/message-refusal-words.ts'
import { PanelError } from '../panel-error.ts'

/**
 * A FILE A MESSAGE CARRIES IS ONE THE FILE DOOR WILL SERVE, OR THE MESSAGE IS NOT SENT. A file the door refuses would reach
 * the person as a bare "Refused", with no way to open or save it.
 *
 * The message is the record that will point at the file, so the door's clause 2 holds once it is stored. Every other clause is asked
 * here, before anything is written, in the project the reader's request will name: clause 1 by the rule a stored path is
 * read by, clause 3 by the attachment's `machine`, clause 4 by `whereAFileIs`, and clause 5 by opening the file. The first
 * file that fails refuses the whole message, with the file, the reason, where to put the file and how large it may be.
 *
 * CLAUSE 3 IS ASKED AS THE DOOR ASKS IT: a reference that names any machine, this machine's own name included, does not
 * authorise the door to serve the file (`localLiveReferences` there keeps only a reference with no machine). So an
 * attachment that names a machine is refused, whatever the name.
 *
 * AN ADDRESS THE BROWSER LOADS ITSELF IS REFUSED BY CLAUSE 1: a web address, a `data:` address or a path relative to the
 * page. The send cannot see that the browser would load one, so delivering it would be an attachment nobody checked. Nothing
 * in Mole Office writes one into a message: the chat stores a picture through POST /api/messages/pictures and attaches the
 * absolute path it hands back. An older message that carries one is still drawn by the browser, as before.
 *
 * THE SEND IS REFUSED, AND THE FILE IS NOT COPIED INTO A STORE. Copying would read a file from outside every root on an
 * agent's word, which is what the door's clause 4 exists to stop. The sender is told where the file has to be.
 *
 * `stored` IS THE MESSAGE AS IT WAS, ON A CHANGE. A file it already carried, at the same path on the same machine, is not
 * asked again, so a change to the words of an older message is not refused for a file that has gone since.
 */
export function refuseAFileTheDoorWouldNotServe(data: unknown, workspaceId: string, stored?: unknown): void {
  const carriedBefore = isAnObject(stored) ? picturesOf(stored) : []
  for (const file of isAnObject(data) ? picturesOf(data) : []) {
    const machine = file.machine?.trim() ?? ''
    if (carriedBefore.some((one) => one.path === file.path && (one.machine?.trim() ?? '') === machine)) continue
    const said = `The file "${file.alt}"`
    if (machine !== '') {
      throw new PanelError(
        `${said} is attached as being on the machine "${machine}". The file door serves a file only by a reference that ` +
          `names no machine, which means this one, because Mole Office cannot read another machine's disk. So the person ` +
          `could not open it. If the file is on this machine, attach it with no machine; if it is on another, copy it ` +
          `here first. ${whereToPutAFile(previewRoots(workspaceId))} ${NOTHING_WAS_SENT}`,
        409,
        undefined,
        undefined,
        'This file is attached as being on another machine, so it could not be opened.',
      )
    }
    const asked = usableStoredPath(file.path)
    if (asked === null) {
      throw new PanelError(
        `${said} is attached as ${JSON.stringify(file.path)}, which is not a plain absolute path. A file is served only by ` +
          `a path that starts with "/" and holds no ".." and no NUL, so the person could not open this one. ` +
          `${whereToPutAFile(previewRoots(workspaceId))} ${NOTHING_WAS_SENT}`,
        400,
        undefined,
        undefined,
        'This file is not attached by an absolute path.',
      )
    }
    const where = whereAFileIs(asked, workspaceId)
    const named = where.at === asked ? asked : `${asked} (read from ${where.at}, where its store is now)`
    if (where.is === 'outside' || where.is === 'linked-out') {
      throw new PanelError(
        `${said} (${named}) ${where.is === 'outside' ? 'is' : `is a link to ${where.canonical}, which is`} outside every ` +
          `preview root, so the person could not open it. ${whereToPutAFile(where.roots)} ${NOTHING_WAS_SENT}`,
        403,
        undefined,
        undefined,
        'This file is outside the directories Mole Office may read.',
      )
    }
    if (where.is === 'not-there') {
      throw new PanelError(
        `${said} (${named}) is not there, so the person could not open it. ${whereToPutAFile(where.roots)} ${NOTHING_WAS_SENT}`,
        404,
        undefined,
        undefined,
        'This file is not there.',
      )
    }
    if (where.is === 'unresolved') {
      throw new PanelError(
        `${said} (${named}) could not be resolved (${where.code}), so Mole Office cannot say the person could open it. ` +
          `${whereToPutAFile(where.roots)} ${NOTHING_WAS_SENT}`,
        409,
      )
    }
    let opened: OpenFile
    try {
      opened = openConfined(where.canonical)
    } catch (err) {
      if (!(err instanceof PanelError)) throw err
      throw new PanelError(`${said} cannot be attached. ${err.message} ${whereToPutAFile(where.roots)} ${NOTHING_WAS_SENT}`, err.status)
    }
    closeSync(opened.fd)
  }
}

/**
 * WHERE A SENDER PUTS A FILE SO THE PERSON CAN OPEN IT, AND HOW LARGE IT MAY BE. Every refusal says it, so the sender can
 * send the file again at once.
 */
function whereToPutAFile(roots: readonly PreviewRoot[]): string {
  const agents = roots.find((root) => root.source.kind === 'agents')
  return (
    `Put the file inside a preview root${agents === undefined ? '' : `, such as ${agents.configured}, the folder for what agents make`}, ` +
    'and attach that path. A file attached by its path has no size limit: in the chat a picture up to ' +
    `${MAX_PREVIEW_BYTES.toLocaleString('en-GB')} bytes is shown, a film of any size plays, and any other file is ` +
    'offered to open or save whole. A PNG, JPEG or WebP picture may instead go through POST /api/messages/pictures, ' +
    'which stores it in a root and hands back the path; GET /api/messages/pictures says its size limit. ' +
    rootsSentence(roots)
  )
}

/** A JSON object, which is what a message's `data` is. */
function isAnObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
