// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NO DOOR READS AN AGENT BY A BARE HANDLE WHERE TWO AGENTS MAY SHARE IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PROTECTS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion I8 of design/agents/IDENTITY-ACCEPTANCE.md, and criterion I2's own rule. An agent's id
 * and its handle are two different things: the id is minted once and belongs to one agent for ever,
 * while a handle is a name that can be changed in place and, after retirement, given to a new agent.
 * `agentByHandle` answers by the NAME. In a door that means "find the agent this request is about",
 * that answer is wrong the moment one string is one agent's id and another agent's name, so the
 * resolver in src/server/lib/participants.ts must be asked instead — it answers the key, an exact
 * id, a live handle, a retired handle, and refuses an ambiguity rather than picking a row.
 *
 * A HANDFUL OF DOORS ARE NOT ASKING THAT QUESTION, and the list below names each one with its
 * reason. They are not exempt from the rule; their question is genuinely about a name:
 *
 *   · the register-myself door, which asks whether a live agent already bears a handle;
 *   · the started door, which asks the same before it registers an agent with no key of its own;
 *   · the new agent door, which asks the same before it makes an agent from a name;
 *   · the visitor confirm, which asks the same about a credential's handle;
 *   · the role-request answer that admits a waiting self-registration, which asks whether the
 *     handle the waiting session asked for is already a row;
 *   · api/agents.ts, whose `agentByHandle` is inbox.ts's OWN function of the same name, answering a
 *     different question — an agent record inside one project, not the installation registry.
 *
 * Every other file under src/server/api/ must call it nowhere.
 *
 * THE ROLE-REQUEST ANSWER LIVES IN src/server/lib/ NOW, and is still guarded. The route in src/server/api/roles.ts and
 * the person's one press in src/server/lib/one-press.ts both run it, so its call is still a door's call. This file
 * walks that one file beside the doors, and holds it to the one call and the reason roles.ts was allowed.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS REMOVED. Control run first.
 * ---------------------------------------------------------------------------------------
 *
 *   Add one bare `agentByHandle('somebody')` call to any door not in the list below — for example
 *   src/server/api/notebook.ts — and this file fails, naming that file and line.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { describe, expect, it } from 'vitest'

import { withoutComments } from './config.test.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const API_DIR = join(ROOT, 'src/server/api')

/**
 * THE ONE FILE OUTSIDE src/server/api/ THAT IS WALKED AS A DOOR: the role-request answer, which the route and the
 * person's one press both run. It is named, not walked for, so a file that is not there is red rather than skipped.
 */
const THE_ROLE_REQUEST_ANSWER = 'src/server/lib/answering-a-role-request.ts'

/**
 * THE SHORT NAMED LIST. Each entry says how many calls a file may make and why the question those
 * calls ask is a handle question. A file not named here may make none.
 */
const ALLOWED: { file: string; calls: number; reason: string }[] = [
  // THE COUNTS MOVED WITH PIECE I-2 (criterion I3, which lets a retired agent and a live one share a
  // handle): `agentByHandle` answers the one LIVE agent bearing a handle, so only the "is the name
  // taken?" questions still call it. The two reads of "the row just written" in participants.ts and
  // the one in visitors.ts read the row by its record now, and the waiter's three handle doors in
  // handles.ts resolve the handle through the one resolver.
  // THE SECOND CALL CAME WITH THE NO-KEY REGISTRATION: an agent registered with no key of its own
  // must be a new row, and a handle a live agent bears in any project would join that agent's row.
  {
    file: 'src/server/api/participants.ts',
    calls: 2,
    reason:
      'The register-myself door asks whether a LIVE agent already bears the handle, so a session that ' +
      'asks twice is answered with the registration it has. The started door asks the same before it ' +
      'registers an agent with no key of its own, and refuses the handle if one does. Both are ' +
      'name-taken questions.',
  },
  {
    file: 'src/server/api/visitors.ts',
    calls: 1,
    reason:
      "The visitor confirm asks whether a LIVE agent already bears a credential's handle. The confirm " +
      'door has already refused every other taken handle (problem z-9zXhVeAPvA), so the only row that ' +
      'answers here carries this credential, and the confirm writes nothing on it and no second row.',
  },
  {
    file: 'src/server/api/new-agent.ts',
    calls: 1,
    reason:
      'The new agent door asks whether a LIVE agent already bears the handle the name gives, before it makes ' +
      "one, as the started door does: an agent record with a handle a live agent bears in any project would join " +
      "that agent's registry row. It is a name-taken question.",
  },
  // THE ROLE-REQUEST ANSWER MOVED OUT OF src/server/api/roles.ts with its one call and its reason. It is still guarded,
  // because the route and the person's one press both run it.
  {
    file: THE_ROLE_REQUEST_ANSWER,
    calls: 1,
    reason:
      'The role-request answer admits a waiting self-registration, so it asks whether the handle ' +
      'that session asked for is already a registry row. It is a name-taken question, not "which ' +
      'agent is this".',
  },
  {
    file: 'src/server/api/agents.ts',
    calls: 1,
    reason:
      "This is inbox.ts's own `agentByHandle`, which answers an agent record inside one project — " +
      'a different identity question from the installation-wide registry.',
  },
]

/** Every TypeScript file under src/server/api/, walked rather than listed. */
function doorFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.ts')) out.push(relative(ROOT, full))
    }
  }
  walk(API_DIR)
  return out.sort()
}

/** The line numbers where a file calls `agentByHandle(`, with comments stripped first. */
function callSites(file: string): { line: number; text: string }[] {
  const code = withoutComments(readFileSync(join(ROOT, file), 'utf8'))
  const out: { line: number; text: string }[] = []
  code.split('\n').forEach((text, index) => {
    // The import named `agentByHandle` carries no paren after it; a call always does.
    if (text.includes('agentByHandle(')) out.push({ line: index + 1, text: text.trim() })
  })
  return out
}

const FILES = [...doorFiles(), THE_ROLE_REQUEST_ANSWER].sort()

describe('no door reads an agent by a bare handle', () => {
  it('finds the door files it is about, so an empty walk cannot pass as a clean one', () => {
    // A walk that silently found nothing would make every assertion below vacuously true.
    expect(FILES.length).toBeGreaterThan(50)
    expect(FILES).toContain('src/server/api/participants.ts')
    expect(FILES).toContain('src/server/api/roles.ts')
    expect(FILES).toContain('src/server/api/inspection.ts')
    expect(FILES).toContain('src/server/api/notebook.ts')
    expect(FILES).toContain('src/server/api/visitors.ts')
  })

  it('is on the short named list only, and every other door calls it nowhere', () => {
    const allowed = new Map(ALLOWED.map((one) => [one.file, one]))
    const offenders: string[] = []
    for (const file of FILES) {
      const sites = callSites(file)
      const permit = allowed.get(file)
      if (sites.length === 0) continue
      if (permit === undefined) {
        offenders.push(`${file}: ${sites.map((one) => `line ${String(one.line)}`).join(', ')}`)
      } else if (sites.length > permit.calls) {
        offenders.push(
          `${file}: ${String(sites.length)} calls, ${String(permit.calls)} allowed (${sites
            .map((one) => `line ${String(one.line)}`)
            .join(', ')})`,
        )
      }
    }
    expect(
      offenders,
      'these doors read an agent by a bare handle, where the one resolver must answer instead ' +
        `(or exceed their named allowance): ${offenders.join('; ')}`,
    ).toEqual([])
  })


})
