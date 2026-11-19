// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TWO READERS OF AN AGENT'S KEY AGREE: aSecretFromTheEnvironment in for-agents/agent-key.mjs, which every node tool
 * reads the key through, and the_agent_key in for-agents/send-message.py, which the kit's three Python tools read it
 * through.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * A node tool takes the key from the file MOLE_AGENT_KEY_FILE names, or from MOLE_AGENT_KEY, and refuses both set, a
 * link, a file of another user or one others may read, and a file that holds anything but one key. The Python tools
 * read MOLE_AGENT_KEY alone, so an agent given its key as a file sent nothing from them, and an agent given both was
 * taken at the value. python3 cannot import the JavaScript reader, so the rules are written twice, and this file runs
 * both over the same cases, so that a rule changed in one and not the other fails here.
 * On Windows, which keeps no mode for a file, neither reader checks the mode, and a key read there is taken with a
 * line on stderr that says so.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS REAL
 * ---------------------------------------------------------------------------------------
 *
 * Both real readers, over files this test makes in a scratch folder of its own: the JavaScript one imported, the
 * Python one loaded from send-message.py by python3, as logins-week.py and mark-seen-in-the-office.py load it. Each
 * case is given to both, with the same environment, the same closing sentence and the same user id, and the two
 * answers must be the same key, or no key, or the same sentence. Each case also says which of the three it is, so
 * the two cannot agree on a wrong answer the case did not expect. Then the three real Python tools run against a fake
 * office this file serves: a key file's key reaches the office on the key header, and both variables set sends
 * nothing and says why, in the reader's sentence. Every key here is made up, and nothing reaches a real office.
 * Each case also names a system, given to both readers, and the words each reader wrote on stderr must be the same.
 * Windows is stood in for by 'win32', which is what node's process.platform and Python's sys.platform say there.
 * Nothing here ran on Windows.
 *
 *   1. The readers agree on every case: no key, the value alone, a key file with and without its line end, a
 *      visitor's token, the default user id, no user id, both set, a relative path, a missing file, a link, a
 *      folder, a named pipe, a file under a file, another user's file, mode 644 and mode 640, a file nobody may
 *      open, a key in capitals, a key with two line ends, a key with a carriage return, a file too large, bytes that
 *      are no text, and an empty file. Then, on Windows, modes 666 and 600, each taken with the line that says the
 *      mode was not checked, and a key in capitals, refused with no such line; and mode 666 on Linux with no user
 *      id, refused. Last, a relative path on Windows, on a Mac and on Linux, each refused in a sentence that names
 *      the path and gives, after "such as", an example that is a full path by that system's rules. On a Mac the
 *      example is in /Users, and on Windows the sentence does not say "starting with /".
 *   2. Each of the three Python tools sends the key file's key on the key header.
 *   3. Each of the three Python tools, with both variables set, asks nothing, ends 2, and says the reader's sentence.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF (after a green control), each alone
 * ---------------------------------------------------------------------------------------
 *
 *   a. send-message.py's pattern tried with search, and so "$" read as a match before the last line end: case 1 goes
 *      red on the key with two line ends.
 *   b. send-message.py's mode check taken out: case 1 goes red on modes 644 and 640.
 *   c. send-message.py's refusal of both set taken out: case 1 goes red on both set, and case 3 on each tool's exit.
 *   d. logins-week.py reading MOLE_AGENT_KEY itself again: cases 2 and 3 go red for it.
 *   e. agent-key.mjs's refusal of both set taken out: case 1 goes red on both set, and case 3 on the JavaScript
 *      reader, which took both.
 *   f. send-message.py printing the value after its refusal: case 3 goes red on the printed key.
 *   g. mark-seen-in-the-office.py marking the first id before it refuses: case 3 goes red on the office, which was
 *      asked.
 *   h. agent-key.mjs's mode check skipped where there is no user id, rather than on Windows: case 1 goes red on mode
 *      666 on Linux.
 *   i. send-message.py's mode check skipped where there is no user id, rather than on Windows: case 1 goes red on mode
 *      666 on Linux.
 *   j. agent-key.mjs saying nothing on Windows: case 1 goes red on modes 666 and 600 on Windows.
 *   k. send-message.py saying nothing on Windows: case 1 goes red on modes 666 and 600 on Windows.
 *   l. agent-key.mjs saying the line before the key's shape is judged: case 1 goes red on the key in capitals on
 *      Windows.
 *   m. agent-key.mjs giving the Linux example of a full path on Windows: case 1 goes red on the relative path on
 *      Windows.
 *   n. send-message.py giving the Linux example of a full path on Windows: case 1 goes red on the relative path on
 *      Windows, where the readers differ.
 *   o. agent-key.mjs giving the Linux example of a full path on a Mac: case 1 goes red on the relative path on a Mac.
 */
import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join, posix, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { aSecretFromTheEnvironment, THE_AGENT_KEY } from '../for-agents/agent-key.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/\/+$/, '')
const SEND_MESSAGE = join(REPO, 'for-agents', 'send-message.py')
const LOGINS_WEEK = join(REPO, 'for-agents', 'logins-week.py')
const MARK_SEEN = join(REPO, 'for-agents', 'mark-seen-in-the-office.py')
/** This test's own closing sentence, given to both readers. */
const NOTHING = 'Nothing was done by this test.'
const A_KEY = '0123456789abcdef'.repeat(4)
const A_VISITORS_TOKEN = 'A-b_c'.repeat(8) + 'xyz'
const THIS_USER = process.getuid?.() ?? null

let dir = ''
beforeAll(() => {
  mkdirSync(join(REPO, '.cache'), { recursive: true })
  dir = mkdtempSync(join(REPO, '.cache', 'two-key-readers-'))
})
afterAll(() => {
  if (dir !== '') rmSync(dir, { recursive: true, force: true })
})

/** A file in the scratch folder holding `words`, with `mode` set after it is written, so no umask changes it. */
function aFile(name: string, words: string | Buffer, mode = 0o600): string {
  const path = join(dir, name)
  writeFileSync(path, words)
  chmodSync(path, mode)
  return path
}

type Outcome = 'a key' | 'no key' | 'refused'
/** A reader's answer, and what it wrote on stderr while it read. */
type Answer = ({ key: string | null } | { refused: string }) & { said: string }

/** The one line a reader writes on stderr when it took a key file on Windows without checking its mode. */
const THE_MODE_WAS_NOT_CHECKED = /^The key file .+ was read on Windows without checking who else may read it\.[^\n]*\n$/u

interface Case {
  name: string
  env: Record<string, string>
  /** The user id given to both readers; 'default' gives none, so each reader takes its own default. */
  uid: number | null | 'default'
  outcome: Outcome
  /** The key a case that ends in a key must end in. */
  key?: string
  /** The system given to both readers, as node names it; none gives none, so each reader takes the one it runs on. */
  system?: 'win32' | 'darwin' | 'linux'
  /** That the case's path is relative, so the sentence must say what a full path is on the case's system. */
  relative?: true
  /** Whether the readers must say that the mode was not checked. */
  says?: true
}

function theCases(): Case[] {
  const file = (path: string): Record<string, string> => ({ MOLE_AGENT_KEY_FILE: path })
  const aLink = join(dir, 'a-link-to-a-key')
  symlinkSync(aFile('behind-the-link', `${A_KEY}\n`), aLink)
  const aFolder = join(dir, 'a-folder')
  mkdirSync(aFolder, { mode: 0o700 })
  const aPipe = join(dir, 'a-named-pipe')
  const made = spawnSync('mkfifo', ['-m', '600', aPipe])
  if (made.status !== 0) throw new Error(`mkfifo could not make the named pipe this test needs: ${made.stderr.toString('utf8')}`)
  const plain = aFile('a-key-with-its-line-end', `${A_KEY}\n`)
  return [
    { name: 'neither variable', env: {}, uid: THIS_USER, outcome: 'no key' },
    { name: 'both empty', env: { MOLE_AGENT_KEY: '', MOLE_AGENT_KEY_FILE: '' }, uid: THIS_USER, outcome: 'no key' },
    { name: 'the value alone, taken as it is', env: { MOLE_AGENT_KEY: 'any words at all' }, uid: THIS_USER, outcome: 'a key', key: 'any words at all' },
    { name: 'the value, and an empty file variable', env: { MOLE_AGENT_KEY: A_KEY, MOLE_AGENT_KEY_FILE: '' }, uid: THIS_USER, outcome: 'a key', key: A_KEY },
    { name: 'a key file with its line end', env: file(plain), uid: THIS_USER, outcome: 'a key', key: A_KEY },
    { name: 'a key file without a line end', env: file(aFile('a-key-without-a-line-end', A_KEY)), uid: THIS_USER, outcome: 'a key', key: A_KEY },
    { name: 'a visitor’s token', env: file(aFile('a-visitors-token', `${A_VISITORS_TOKEN}\n`)), uid: THIS_USER, outcome: 'a key', key: A_VISITORS_TOKEN },
    { name: 'each reader’s own default user id', env: file(plain), uid: 'default', outcome: 'a key', key: A_KEY },
    { name: 'no user id at all', env: file(aFile('owned-by-anyone', `${A_KEY}\n`)), uid: null, outcome: 'a key', key: A_KEY },
    { name: 'both set', env: { MOLE_AGENT_KEY: A_KEY, MOLE_AGENT_KEY_FILE: plain }, uid: THIS_USER, outcome: 'refused' },
    { name: 'a relative path', env: file('a-key-file'), uid: THIS_USER, outcome: 'refused' },
    { name: 'a relative path with quotes and letters beyond ASCII', env: file('ключ "здесь"\tтоже'), uid: THIS_USER, outcome: 'refused' },
    { name: 'a missing file', env: file(join(dir, 'nothing-is-here')), uid: THIS_USER, outcome: 'refused' },
    { name: 'a link', env: file(aLink), uid: THIS_USER, outcome: 'refused' },
    { name: 'a folder', env: file(aFolder), uid: THIS_USER, outcome: 'refused' },
    { name: 'a named pipe', env: file(aPipe), uid: THIS_USER, outcome: 'refused' },
    { name: 'a file under a file', env: file(join(plain, 'below')), uid: THIS_USER, outcome: 'refused' },
    { name: 'another user’s file', env: file(plain), uid: (THIS_USER ?? 0) + 1, outcome: 'refused' },
    { name: 'mode 644', env: file(aFile('mode-644', `${A_KEY}\n`, 0o644)), uid: THIS_USER, outcome: 'refused' },
    { name: 'mode 640', env: file(aFile('mode-640', `${A_KEY}\n`, 0o640)), uid: THIS_USER, outcome: 'refused' },
    { name: 'a file nobody may open', env: file(aFile('mode-000', `${A_KEY}\n`, 0o000)), uid: THIS_USER, outcome: 'refused' },
    { name: 'a key in capitals', env: file(aFile('capitals', `${A_KEY.toUpperCase()}\n`)), uid: THIS_USER, outcome: 'refused' },
    { name: 'a key with two line ends', env: file(aFile('two-line-ends', `${A_KEY}\n\n`)), uid: THIS_USER, outcome: 'refused' },
    { name: 'a key with a carriage return', env: file(aFile('carriage-return', `${A_KEY}\r\n`)), uid: THIS_USER, outcome: 'refused' },
    { name: 'a file too large', env: file(aFile('too-large', 'c'.repeat(80))), uid: THIS_USER, outcome: 'refused' },
    { name: 'bytes that are no text', env: file(aFile('no-text', Buffer.from([0xff, 0xfe, 0x00, 0x41]))), uid: THIS_USER, outcome: 'refused' },
    { name: 'an empty file', env: file(aFile('empty', '')), uid: THIS_USER, outcome: 'refused' },
    // Windows has no user id, so the stand-in gives none. Mode 666 on Linux is given none as well, so only the system
    // differs from mode 666 on Windows.
    { name: 'mode 666 on Windows', env: file(aFile('mode-666-on-windows', `${A_KEY}\n`, 0o666)), uid: null, system: 'win32', outcome: 'a key', key: A_KEY, says: true },
    { name: 'mode 600 on Windows', env: file(plain), uid: null, system: 'win32', outcome: 'a key', key: A_KEY, says: true },
    { name: 'a key in capitals on Windows', env: file(aFile('capitals-on-windows', `${A_KEY.toUpperCase()}\n`, 0o666)), uid: null, system: 'win32', outcome: 'refused' },
    { name: 'mode 666 on Linux', env: file(aFile('mode-666-on-linux', `${A_KEY}\n`, 0o666)), uid: null, system: 'linux', outcome: 'refused' },
    // A relative path is refused with an example of a full path on the system the reader runs on. The check is the
    // one node and Python make on the system they run on, so here a relative path stands for one on each system.
    {
      name: 'a relative path on Windows',
      env: file('a-key-file'),
      uid: null,
      system: 'win32',
      outcome: 'refused',
      relative: true,
    },
    {
      name: 'a relative path on a Mac',
      env: file('a-key-file'),
      uid: THIS_USER,
      system: 'darwin',
      outcome: 'refused',
      relative: true,
    },
    {
      name: 'a relative path on Linux',
      env: file('a-key-file'),
      uid: THIS_USER,
      system: 'linux',
      outcome: 'refused',
      relative: true,
    },
  ]
}

/** What the JavaScript reader answers for one case, and what it wrote on stderr. */
function theNodeReader(one: Case): Answer {
  const said: string[] = []
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
    said.push(String(chunk))
    return true
  })
  try {
    const key = aSecretFromTheEnvironment(THE_AGENT_KEY, one.env, NOTHING, one.uid === 'default' ? undefined : one.uid, one.system)
    return { key, said: said.join('') }
  } catch (why) {
    return { refused: (why as Error).message, said: said.join('') }
  } finally {
    stderr.mockRestore()
  }
}

/** The Python reader, loaded from send-message.py as the kit's other two tools load it, over every case at once. */
const THE_PYTHON_RUNNER = `
import contextlib, importlib.util, io, json, sys
spec = importlib.util.spec_from_file_location("the_message_script", sys.argv[1])
script = importlib.util.module_from_spec(spec)
spec.loader.exec_module(script)
out = []
for one in json.load(sys.stdin):
    given = {} if one["uid"] == "default" else {"uid": one["uid"]}
    if one["system"] is not None:
        given["system"] = one["system"]
    said = io.StringIO()
    try:
        with contextlib.redirect_stderr(said):
            key = script.the_agent_key(one["env"], one["nothing"], **given)
        out.append({"key": key, "said": said.getvalue()})
    except ValueError as why:
        out.append({"refused": str(why), "said": said.getvalue()})
print(json.dumps(out, ensure_ascii=False))
`

function thePythonReader(cases: Case[]): Answer[] {
  const ran = spawnSync('python3', ['-B', '-c', THE_PYTHON_RUNNER, SEND_MESSAGE], {
    input: JSON.stringify(cases.map((one) => ({ env: one.env, uid: one.uid, system: one.system ?? null, nothing: NOTHING }))),
    env: { PATH: process.env['PATH'] ?? '' },
    timeout: 20_000,
  })
  if (ran.status !== 0) throw new Error(`python3 could not run the Python reader (exit ${String(ran.status)}): ${ran.stderr.toString('utf8')}`)
  return JSON.parse(ran.stdout.toString('utf8')) as Answer[]
}

function outcomeOf(answer: Answer): Outcome {
  if ('refused' in answer) return 'refused'
  return answer.key === null ? 'no key' : 'a key'
}

/**
 * WHAT THE REFUSAL OF A RELATIVE PATH MISSES, on the case's system, or on this one when the case names none. It must
 * name the path the case gave, and give after "such as" an example that is a full path by that system's rules. The
 * Mac keeps a person's home folder in /Users, so there the example is in /Users. On Windows a full path begins with a
 * drive letter, so there the sentence must not say "starting with /".
 */
function whatTheFullPathSentenceMisses(sentence: string, one: Case): string[] {
  const system = one.system ?? process.platform
  const given = one.env.MOLE_AGENT_KEY_FILE ?? ''
  const example = /such as (\S+?),/u.exec(sentence)?.[1]
  const misses: string[] = []
  if (!sentence.includes(JSON.stringify(given))) misses.push(`does not name the path ${JSON.stringify(given)}`)
  if (example === undefined) misses.push('gives no example after "such as"')
  else if (!(system === 'win32' ? win32 : posix).isAbsolute(example)) misses.push(`gives ${JSON.stringify(example)}, which is no full path on ${system}`)
  else if (system === 'darwin' && !example.startsWith('/Users/')) misses.push(`gives ${JSON.stringify(example)}, which is not in /Users`)
  if (system === 'win32' && sentence.includes('starting with /')) misses.push('says "starting with /" on Windows')
  return misses
}

describe('the JavaScript and the Python reader of an agent’s key agree', () => {
  it('case 1: give the same key, no key, or the same sentence for every case', () => {
    const cases = theCases()
    const python = thePythonReader(cases)
    const differ: string[] = []
    cases.forEach((one, at) => {
      const node = theNodeReader(one)
      const theirs = python[at]!
      if (JSON.stringify(node) !== JSON.stringify(theirs)) differ.push(`${one.name}: node ${JSON.stringify(node)}, python ${JSON.stringify(theirs)}`)
      if (outcomeOf(node) !== one.outcome) differ.push(`${one.name}: node gave ${outcomeOf(node)}, the case expects ${one.outcome}`)
      if (one.key !== undefined && 'key' in node && node.key !== one.key) differ.push(`${one.name}: node gave another key than the case's`)
      if (one.relative === true && 'refused' in node) {
        for (const why of whatTheFullPathSentenceMisses(node.refused, one)) differ.push(`${one.name}: node said ${JSON.stringify(node.refused)}, which ${why}`)
      }
      if (one.says === true ? !THE_MODE_WAS_NOT_CHECKED.test(node.said) : node.said !== '') {
        differ.push(`${one.name}: node wrote ${JSON.stringify(node.said)} on stderr, and the case expects ${one.says === true ? 'that the mode was not checked' : 'nothing'}`)
      }
    })
    expect(differ).toEqual([])
  })
})

interface Asked {
  path: string
  key: string | undefined
}

/** A fake office that writes down each request's path and key header, and answers each with 200 and an empty object. */
async function aFakeOffice(): Promise<{ url: string; asked: Asked[]; close: () => Promise<void> }> {
  const asked: Asked[] = []
  const server: Server = createServer((req: IncomingMessage, res) => {
    req.resume()
    req.on('end', () => {
      const key = req.headers['x-mole-office-key']
      asked.push({ path: req.url ?? '', key: typeof key === 'string' ? key : undefined })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{}')
    })
  })
  await new Promise<void>((go) => server.listen(0, '127.0.0.1', () => go()))
  return {
    url: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`,
    asked,
    close: () => new Promise<void>((go) => server.close(() => go())),
  }
}

/** Run one Python tool in a process group of its own, with only the environment given, stopped by its group after ten seconds. */
async function theTool(script: string, args: string[], env: Record<string, string>): Promise<{ code: number | null; err: string }> {
  const child = spawn('python3', ['-B', script, ...args], { detached: true, env: { PATH: process.env['PATH'] ?? '', HOME: dir, ...env }, stdio: ['ignore', 'ignore', 'pipe'] })
  let err = ''
  child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString('utf8')))
  let stopped = false
  const timer = setTimeout(() => {
    stopped = true
    if (child.pid !== undefined) {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {
        // The group ended between the timer and the signal.
      }
    }
  }, 10_000)
  const code = await new Promise<number | null>((done) => child.on('close', (exit) => done(exit)))
  clearTimeout(timer)
  if (stopped) throw new Error(`${script} was still running after ten seconds, so its group was stopped`)
  return { code, err }
}

/** The three tools, each with the arguments that make it ask the office once with the key. */
function theTools(api: string): Array<{ name: string; script: string; args: string[] }> {
  const body = join(dir, 'a-message-body.txt')
  writeFileSync(body, 'Synthetic words.\n')
  return [
    { name: 'send-message.py', script: SEND_MESSAGE, args: ['synthetic-project', 'synthetic-reader', 'A synthetic title', body, '--as', 'synthetic-agent', '--api', api] },
    { name: 'logins-week.py', script: LOGINS_WEEK, args: ['synthetic-project', '--as', 'synthetic-agent', '--api', api] },
    { name: 'mark-seen-in-the-office.py', script: MARK_SEEN, args: ['--as', 'synthetic-agent', '--api', api, 'synthMessage1'] },
  ]
}

describe('the kit’s three Python tools read the key through the shared reader', () => {
  it('case 2: each sends the key file’s key on the key header', async () => {
    const office = await aFakeOffice()
    try {
      const keyFile = aFile('the-tools-key', `${A_KEY}\n`)
      const heard: Record<string, Array<string | undefined>> = {}
      for (const tool of theTools(office.url)) {
        const before = office.asked.length
        await theTool(tool.script, tool.args, { MOLE_AGENT_KEY_FILE: keyFile })
        heard[tool.name] = office.asked.slice(before).map((one) => (one.key === A_KEY ? 'the key file’s key' : one.key))
      }
      expect(heard).toEqual({
        'send-message.py': ['the key file’s key'],
        'logins-week.py': ['the key file’s key'],
        'mark-seen-in-the-office.py': ['the key file’s key'],
      })
    } finally {
      await office.close()
    }
  })

  it('case 3: each, with both variables set, asks nothing, ends 2 and says the reader’s sentence', async () => {
    const office = await aFakeOffice()
    try {
      const env = { MOLE_AGENT_KEY: A_KEY, MOLE_AGENT_KEY_FILE: aFile('the-tools-second-key', `${A_KEY}\n`) }
      // THE READER'S SENTENCE WITH NO CLOSING SENTENCE: each tool closes it with its own.
      let theSentence = ''
      try {
        aSecretFromTheEnvironment(THE_AGENT_KEY, env, '')
      } catch (why) {
        theSentence = (why as Error).message.trimEnd()
      }
      expect(theSentence, 'the JavaScript reader took both').not.toBe('')
      const said: Record<string, { code: number | null; saysTheSentence: boolean }> = {}
      for (const tool of theTools(office.url)) {
        const ran = await theTool(tool.script, tool.args, env)
        said[tool.name] = { code: ran.code, saysTheSentence: ran.err.startsWith(theSentence + ' ') }
        expect(ran.err.includes(A_KEY), `${tool.name} printed the key`).toBe(false)
      }
      expect(said).toEqual({
        'send-message.py': { code: 2, saysTheSentence: true },
        'logins-week.py': { code: 2, saysTheSentence: true },
        'mark-seen-in-the-office.py': { code: 2, saysTheSentence: true },
      })
      expect(office.asked).toEqual([])
    } finally {
      await office.close()
    }
  })
})
