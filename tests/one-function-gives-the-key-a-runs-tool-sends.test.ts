// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE FUNCTION GIVES THE KEY A RUN'S TOOL SENDS.
 *
 * A run's tool looks for its key in one order: the environment's key first (theAgentKey), then the run's own key from
 * the office tool file MOLE_OFFICE_TOOL_CONFIGURATION names, read only for the run's own agent and run
 * (theRunsKeyFromItsOfficeToolFile), and otherwise no key. That order was written twice: in officeHeaders
 * (tools/sandbox-common.mjs) and in tools/rules-chapters.mjs. If one of the two changed, the other could stay wrong
 * with nothing failing. Now theKeyARunsToolSends in src/config/run-permissions.mjs is the one place the order is
 * written, and both callers use it.
 *
 * WHAT IS PROVED
 *   1. officeHeaders sends the same whole headers as before, in each way a key is found or not found. These cases
 *      import nothing new, so they run at the commit before the function exists too, and are green there.
 *   2. theKeyARunsToolSends gives the key, where it came from (the environment or the file), and why no key went.
 *      When no key went because of the file, the reason is the file reader's own.
 *   3. When the agent or the run is empty, no file is read. The reason names what is empty, by the words the caller
 *      gives for the two values, and with no words given it names neither MOLE_OFFICE_AGENT nor MOLE_OFFICE_SESSION,
 *      because many callers of officeHeaders take the two values from flags or a record and not from those variables.
 *   4. For each way, the key officeHeaders sends, with no key passed, is the key theKeyARunsToolSends gives.
 *   5. The reason never holds a key.
 *
 * HOW. officeHeaders and theKeyARunsToolSends are called with an environment of this file's own, never this process's.
 * Every agent, run, key, project, purpose and trace here is made up. The office tool files are made up too, in a
 * scratch folder of this file's own under the system's temporary folder, removed at the end. Each file is written in
 * the shape the launcher writes, by aClaudeCommandsOfficeTool in src/config/run-permissions.mjs, as the rules export's
 * test makes its files (tests/the-rules-export-sends-the-runs-own-key-from-its-office-tool-file.test.ts, anOfficeToolFile).
 * The made-up address in a file is never asked. Nothing here reads a real office tool file or reaches an office.
 *
 * WRITTEN OUT. The header names content-type, x-mole-office-purpose and x-mole-office-trace, and the values
 * application/json and agent, are written out because officeHeaders writes them out itself. The only export of the two
 * trace names is in a module that opens a database when it is imported, and this file opens none. MOLE_OFFICE_AGENT and
 * MOLE_OFFICE_SESSION are written out as the rules export's test writes them.
 */
import { chmodSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_AGENT_KEY } from '../for-agents/agent-key.mjs'
import { KEY_HEADER } from '../src/config/key-header.mjs'
import { aClaudeCommandsOfficeTool, OFFICE_TOOL_CONFIGURATION, theRunsKeyFromItsOfficeToolFile } from '../src/config/run-permissions.mjs'
import { ACTOR_HEADERS, WORKSPACE_HEADER } from '../src/shared/request-headers.ts'
import { officeHeaders } from '../tools/sandbox-common.mjs'

// MADE-UP VALUES. No office issued any of these keys, and no agent, run or project of an office has these names.
const AGENT = 'made-up-agent-of-the-one-key-function'
const OTHER_AGENT = 'another-made-up-agent-of-the-one-key-function'
const RUN = 'aMadeUpRun05'
const OTHER_RUN = 'anotherMadeUpRun06'
const FILE_KEY = 'made-up-key-in-the-runs-office-tool-file'
const ENVIRONMENT_KEY = 'made-up-key-in-the-environment'
const CALLERS_KEY = 'made-up-key-the-caller-passes'
const WORKSPACE = 'a-made-up-project'
const PURPOSE = 'a-made-up-purpose'
const TRACE = 'a-made-up-trace'
const OTHERS_MAY_READ = 0o644
/** The words a caller may give for the two values. Made up, so a reason that holds them took them from the caller. */
const WORDS = { agent: 'the made-up name of the agent', session: 'the made-up name of the run' }

let scratch = ''
const files = { theRunsOwn: '', anotherRun: '', anotherAgent: '', othersMayRead: '' }

/** A run's office tool file, as the launcher writes it, naming `agent`'s run `session` and holding `key`, with `mode`. */
function anOfficeToolFile(name: string, { agent = AGENT, session = RUN, key = FILE_KEY, mode = 0o600 } = {}): string {
  const path = join(scratch, name)
  const made = aClaudeCommandsOfficeTool(
    ['claude'],
    { MOLE_OFFICE_AGENT: agent, MOLE_OFFICE_SESSION: session, [THE_AGENT_KEY.value]: key, MOLE_OFFICE_API: 'http://127.0.0.1:1', MOLE_OFFICE_WORKSPACE: WORKSPACE },
    path,
  )
  expect(made.configuration, 'the launcher gives a Claude Code command an office tool configuration').not.toBeNull()
  writeFileSync(path, `${JSON.stringify(made.configuration)}\n`, { mode: 0o600 })
  chmodSync(path, mode)
  expect(statSync(path).mode & 0o777, `${path} has the mode this case asks for`).toBe(mode)
  return path
}

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-one-key-function-'))
  files.theRunsOwn = anOfficeToolFile('the-runs-own.json')
  files.anotherRun = anOfficeToolFile('another-run.json', { session: OTHER_RUN })
  files.anotherAgent = anOfficeToolFile('another-agent.json', { agent: OTHER_AGENT })
  files.othersMayRead = anOfficeToolFile('others-may-read.json', { mode: OTHERS_MAY_READ })
})

afterAll(() => {
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

type AWay = {
  name: string
  env: () => Record<string, string>
  key: string | null
  from: 'environment' | 'file' | null
  /** What the reason names, when no key goes. */
  named?: () => string[]
}

/** Each way a run's tool finds a key or finds none, with the key that goes and where it came from. */
const THE_WAYS: AWay[] = [
  {
    name: "the environment's key, with the run's own file beside it: the environment's key goes",
    env: () => ({ [THE_AGENT_KEY.value]: ENVIRONMENT_KEY, [OFFICE_TOOL_CONFIGURATION]: files.theRunsOwn }),
    key: ENVIRONMENT_KEY,
    from: 'environment',
  },
  {
    name: "no key in the environment, and the run's own file: the file's key goes",
    env: () => ({ [OFFICE_TOOL_CONFIGURATION]: files.theRunsOwn }),
    key: FILE_KEY,
    from: 'file',
  },
  {
    name: 'no key in the environment, and a file that names another run: no key goes',
    env: () => ({ [OFFICE_TOOL_CONFIGURATION]: files.anotherRun }),
    key: null,
    from: null,
    named: () => [files.anotherRun, OTHER_RUN],
  },
  {
    name: 'no key in the environment, and a file that names another agent: no key goes',
    env: () => ({ [OFFICE_TOOL_CONFIGURATION]: files.anotherAgent }),
    key: null,
    from: null,
    named: () => [files.anotherAgent, OTHER_AGENT],
  },
  {
    name: 'no key in the environment, and a file others may read: no key goes',
    env: () => ({ [OFFICE_TOOL_CONFIGURATION]: files.othersMayRead }),
    key: null,
    from: null,
    named: () => [files.othersMayRead, OTHERS_MAY_READ.toString(8)],
  },
  {
    name: 'no key in the environment, and no file named: no key goes',
    env: () => ({}),
    key: null,
    from: null,
    named: () => [OFFICE_TOOL_CONFIGURATION],
  },
]

/** The agent and the run every way is asked for. */
const ASKED = { agent: AGENT, session: RUN }
const asked = { workspace: WORKSPACE, ...ASKED, purpose: PURPOSE, trace: TRACE }

/** The whole headers officeHeaders sends for `asked`, with `key` or with no key. */
function theHeaders(key: string | null): Record<string, string> {
  return {
    'content-type': 'application/json',
    [WORKSPACE_HEADER]: WORKSPACE,
    [ACTOR_HEADERS.type]: 'agent',
    [ACTOR_HEADERS.id]: AGENT,
    ...(key === null ? {} : { [KEY_HEADER]: key }),
    [ACTOR_HEADERS.session]: RUN,
    'x-mole-office-purpose': PURPOSE,
    'x-mole-office-trace': TRACE,
  }
}

/**
 * The new function, imported inside the cases that use it, so that the cases of officeHeaders also run at the commit
 * before it exists.
 */
async function theNewFunction() {
  const module = await import('../src/config/run-permissions.mjs')
  expect(typeof module.theKeyARunsToolSends, 'src/config/run-permissions.mjs exports theKeyARunsToolSends').toBe('function')
  return module.theKeyARunsToolSends
}

/** The ways the agent or the run is empty, with which of the two is empty. */
const EMPTIES: Array<{ agent: string | undefined; session: string | undefined; empty: Array<'agent' | 'session'> }> = [
  { agent: '', session: RUN, empty: ['agent'] },
  { agent: AGENT, session: '', empty: ['session'] },
  { agent: '', session: '', empty: ['agent', 'session'] },
  { agent: undefined, session: RUN, empty: ['agent'] },
  { agent: AGENT, session: undefined, empty: ['session'] },
]

describe('officeHeaders sends the whole headers it sent before, in each way a key is found', () => {
  for (const way of THE_WAYS) {
    it(way.name, () => {
      expect(officeHeaders({ ...asked, env: way.env() })).toEqual(theHeaders(way.key))
    })
  }

  it("a key the caller passes, with the environment's key and the run's own file beside it: the caller's key goes", () => {
    const env = { [THE_AGENT_KEY.value]: ENVIRONMENT_KEY, [OFFICE_TOOL_CONFIGURATION]: files.theRunsOwn }
    expect(officeHeaders({ ...asked, key: CALLERS_KEY, env })).toEqual(theHeaders(CALLERS_KEY))
  })

  it("no key from the caller (null), with the environment's key and the run's own file beside it: no key goes", () => {
    const env = { [THE_AGENT_KEY.value]: ENVIRONMENT_KEY, [OFFICE_TOOL_CONFIGURATION]: files.theRunsOwn }
    expect(officeHeaders({ ...asked, key: null, env })).toEqual(theHeaders(null))
  })
})

describe('theKeyARunsToolSends gives the key, where it came from, and why no key went', () => {
  for (const way of THE_WAYS) {
    it(way.name, async () => {
      const theKeyARunsToolSends = await theNewFunction()
      const env = way.env()
      const answer = theKeyARunsToolSends(env, ASKED)
      if (way.from !== null) {
        expect(answer).toEqual({ key: way.key, from: way.from, why: null })
        return
      }
      // The reason is the file reader's own, for this agent and this run.
      expect(answer).toEqual({ key: null, from: null, why: theRunsKeyFromItsOfficeToolFile(env, ASKED).why })
      for (const name of way.named?.() ?? []) expect(answer.why).toContain(name)
    })
  }
})

describe('no file is read when the agent or the run is empty', () => {
  it("gives no key, and a reason that names what is empty by the caller's words, and not the file", async () => {
    const theKeyARunsToolSends = await theNewFunction()
    const env = { [OFFICE_TOOL_CONFIGURATION]: files.theRunsOwn }
    expect(theRunsKeyFromItsOfficeToolFile(env, ASKED).key, 'the named file gives a key for the agent and the run').toBe(FILE_KEY)
    for (const one of EMPTIES) {
      const answer = theKeyARunsToolSends(env, { agent: one.agent, session: one.session }, WORDS)
      const said = JSON.stringify(one)
      expect(answer.key, said).toBeNull()
      expect(answer.from, said).toBeNull()
      expect(typeof answer.why, said).toBe('string')
      // Every reason the file reader gives, once it has the file's path, names the file.
      expect(answer.why, said).not.toContain(files.theRunsOwn)
      for (const part of ['agent', 'session'] as const) {
        if (one.empty.includes(part)) expect(answer.why, said).toContain(WORDS[part])
        else expect(answer.why, said).not.toContain(WORDS[part])
      }
    }
  })

  it('with no words given, the reason names neither MOLE_OFFICE_AGENT nor MOLE_OFFICE_SESSION, and still says which is empty', async () => {
    const theKeyARunsToolSends = await theNewFunction()
    const env = { [OFFICE_TOOL_CONFIGURATION]: files.theRunsOwn }
    const reasons = new Set<string>()
    for (const one of EMPTIES.slice(0, 3)) {
      const answer = theKeyARunsToolSends(env, { agent: one.agent, session: one.session })
      const said = JSON.stringify(one)
      expect(answer.key, said).toBeNull()
      expect(answer.from, said).toBeNull()
      expect(typeof answer.why, said).toBe('string')
      expect(answer.why, said).not.toContain(files.theRunsOwn)
      expect(answer.why, said).not.toContain('MOLE_OFFICE_AGENT')
      expect(answer.why, said).not.toContain('MOLE_OFFICE_SESSION')
      reasons.add(String(answer.why))
    }
    expect(reasons.size, 'no agent, no run, and neither each give a reason of their own').toBe(3)
  })
})

describe('the two callers agree', () => {
  it('for each way, officeHeaders with no key passed sends the key theKeyARunsToolSends gives', async () => {
    const theKeyARunsToolSends = await theNewFunction()
    for (const way of THE_WAYS) {
      const env = way.env()
      expect(officeHeaders({ ...asked, env })[KEY_HEADER] ?? null, way.name).toBe(theKeyARunsToolSends(env, ASKED).key)
    }
  })
})

describe('the reason never holds a key', () => {
  it('in any way, with or without words for the two values', async () => {
    const theKeyARunsToolSends = await theNewFunction()
    const answers = [
      ...THE_WAYS.map((way) => theKeyARunsToolSends(way.env(), ASKED)),
      ...EMPTIES.flatMap((one) => [WORDS, undefined].map((words) => theKeyARunsToolSends({ [OFFICE_TOOL_CONFIGURATION]: files.theRunsOwn }, { agent: one.agent, session: one.session }, words))),
    ]
    for (const answer of answers) {
      for (const key of [FILE_KEY, ENVIRONMENT_KEY]) expect(String(answer.why), JSON.stringify(answer.why)).not.toContain(key)
    }
  })
})
