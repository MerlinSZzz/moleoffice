// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Default-root boundary fixtures use an outside pathname without creating it; TMPDIR may itself be inside the permitted cache. Every refusal and byte assertion remains. */
/**
 * INLINE PREVIEW, TESTED AS A CONFINEMENT CONTRACT RATHER THAN AS AN ENDPOINT.
 *
 * `GET /api/file` is the one route in Mole Office that reads bytes off this machine and hands them to
 * whatever asked. The server binds to loopback with no login, so "whatever asked" includes every
 * other agent on this computer. There is therefore nothing to authenticate and nothing to trust:
 * the only thing standing between a request and a file is the rule this file tests.
 *
 * So none of the tests below is "the endpoint returns 403". Each one is a sentence about what
 * Mole Office is:
 *
 *   it shows you the picture your record points at
 *   it does not show you the file next to it
 *   it does not show you the file a deleted record used to point at
 *   it does not show you this machine's file when the record said the file is on another one
 *   it never shows you SOMETHING ELSE and calls it your file
 *
 * That last one is the invariant the whole product is built on, and it is why so many of these
 * tests assert on the absence of bytes rather than on a status code. A 200 carrying a placeholder
 * would pass a status assertion and would be the worst defect this repository could ship.
 *
 * The adversarial cases are deliberately not three: `..` in every position, encoded once and
 * twice, an absolute path outside the roots, a symlink out of the root, a symlink whose target
 * appears after the check, a directory, a named pipe, a socket, a character device, an unreadable
 * file, a file bigger than the cap, a stale reference, a withdrawn reference, and prose that
 * merely names a path.
 */

import { THE_TEST_OFFICES_OWNER, THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  truncateSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Response as LightMyRequestResponse } from 'light-my-request'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { expectPanelError, freshDb, type TestDb } from './helpers.ts'
import { settingWasSet } from '../src/config/settings.mjs'
import { trackApiRoutes, type ApiRoute } from '../src/server/api/kinds.ts'
import { SHAPE_SPECS } from '../src/shared/kinds.ts'
import type { PanelRecord } from '../src/shared/types.ts'

type FilesApi = typeof import('../src/server/api/files.ts')
type HttpLib = typeof import('../src/server/lib/http.ts')

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

let t: TestDb
let files: FilesApi
let app: FastifyInstance
let listRoutes: () => readonly ApiRoute[]

/** The one directory previews are allowed to read from, for most of this file. */
let root: string
/** A directory deliberately OUTSIDE the root, holding the thing an escape would reach. */
let outside: string
/** The socket file, kept so its server can be closed at the end. */
let socketServer: Server | null = null
/** Whether `mkfifo` exists on this machine; the named-pipe test says so rather than pretending. */
let hasMkfifo = false

/** The bytes a successful preview must hand back, byte for byte. */
const PICTURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 250, 251, 252])
const REPORT = '# The wrist calibration\n\nReprojection went 0.4 px to 1.9 px.\n'
/** What must never appear in any response body in this file. */
const SECRET = 'OUTSIDE-THE-ROOT-AND-NOBODY-MAY-READ-IT'

const at = (name: string): string => join(root, name)
// Only a referenced pathname: nothing is written outside the authorized test directories.
const outsideDefaults = '/__mole_office_preview_fixture__/outside-default-roots.png'

// ---------------------------------------------------------------------------- asking

async function ask(path: string, workspaceId?: string): Promise<LightMyRequestResponse> {
  return app.inject({
    method: 'GET',
    url: `/api/file?path=${encodeURIComponent(path)}`,
    ...(workspaceId === undefined ? {} : { headers: { 'x-mole-office-workspace': workspaceId } }),
  })
}

/** A refusal, checked as one: a JSON sentence, and not one byte of anything else. */
function refusal(res: LightMyRequestResponse, status: number): string {
  expect(res.statusCode, `body was ${res.body.slice(0, 300)}`).toBe(status)
  expect(String(res.headers['content-type'])).toContain('application/json')
  // The clause the whole product rests on: a refusal carries no stand-in for the content.
  expect(res.body).not.toContain(SECRET)
  expect(res.rawPayload.includes(PICTURE)).toBe(false)
  const body = JSON.parse(res.body) as { error?: unknown }
  expect(typeof body.error, `no error sentence in ${res.body.slice(0, 200)}`).toBe('string')
  return String(body.error)
}

// ---------------------------------------------------------------------------- the fixture

beforeAll(async () => {
  t = await freshDb()
  files = await import('../src/server/api/files.ts')
  const http: HttpLib = await import('../src/server/lib/http.ts')

  // realpath at creation, so every path in this file is already canonical and a failure here can
  // never be "/tmp is a symlink on this machine" wearing the costume of a confinement bug.
  root = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-preview-root-')))
  outside = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-preview-outside-')))

  writeFileSync(join(outside, 'secret.txt'), SECRET)

  writeFileSync(at('picture.png'), PICTURE)
  writeFileSync(at('report.md'), REPORT)
  writeFileSync(at('empty.txt'), '')
  writeFileSync(at('unreferenced.png'), PICTURE)
  writeFileSync(at('withdrawn.png'), PICTURE)
  writeFileSync(at('deleted-only.png'), PICTURE)
  writeFileSync(at('page.html'), '<script>fetch("/api/records")</script>')
  writeFileSync(at('blob.xyz'), 'bytes of an unknown kind')
  // The file the record says is on the Orin. It EXISTS here, which is the whole point: serving it
  // would be possible and is the substitution that must not happen.
  writeFileSync(at('machine-elsewhere.png'), PICTURE)
  writeFileSync(at('both-machines.png'), PICTURE)
  writeFileSync(at('unreadable.txt'), 'you should not be able to read this')
  chmodSync(at('unreadable.txt'), 0o000)

  mkdirSync(at('docs'))
  writeFileSync(join(at('docs'), 'inside.png'), PICTURE)

  symlinkSync(join(outside, 'secret.txt'), at('link-out.png'))
  symlinkSync(at('picture.png'), at('link-in.png'))
  symlinkSync(at('appears-later.png'), at('dangling.png'))
  symlinkSync(outside, at('linked-dir'))

  // Sparse, so a file over the cap costs no disk and no time.
  writeFileSync(at('big.bin'), '')
  truncateSync(at('big.bin'), files.MAX_PREVIEW_BYTES + 1)

  socketServer = createServer()
  await new Promise<void>((resolve) => socketServer?.listen(at('socketfile'), () => resolve()))

  try {
    execFileSync('mkfifo', [at('pipe')])
    hasMkfifo = true
  } catch {
    hasMkfifo = false
  }

  t.api.createRecord({ workspaceId: 'default',
    kind: 'module',
    title: 'Preview fixture',
    summary: 'The module whose references authorise every preview in this file.',
    data: {
      context: 'A module that points at things on disk, which is what makes them previewable.',
      parts: [],
      paths: [
        { id: 'report', label: 'The report', path: at('report.md'), kind: 'markdown' },
        { id: 'docs', label: 'The whole docs directory', path: at('docs'), kind: 'dir' },
        { id: 'empty', label: 'A file with nothing in it', path: at('empty.txt'), kind: 'other' },
        { id: 'missing', label: 'A file that is not there', path: at('missing.png'), kind: 'image' },
        { id: 'dangling', label: 'A link with nothing at the end of it', path: at('dangling.png'), kind: 'image' },
        { id: 'link-out', label: 'A link that leaves the root', path: at('link-out.png'), kind: 'image' },
        { id: 'link-in', label: 'A link that stays inside the root', path: at('link-in.png'), kind: 'image' },
        { id: 'linked-dir', label: 'A file under a linked directory', path: join(at('linked-dir'), 'secret.txt'), kind: 'other' },
        { id: 'big', label: 'Something far too big to preview', path: at('big.bin'), kind: 'other' },
        { id: 'socket', label: 'A socket, which is not a file', path: at('socketfile'), kind: 'other' },
        { id: 'pipe', label: 'A named pipe, which is not a file either', path: at('pipe'), kind: 'other' },
        { id: 'unreadable', label: 'A file this server may not read', path: at('unreadable.txt'), kind: 'other' },
        { id: 'page', label: 'An HTML report', path: at('page.html'), kind: 'html' },
        { id: 'blob', label: 'Something with an extension nobody recognises', path: at('blob.xyz'), kind: 'other' },
        { id: 'zero', label: 'The zero device', path: '/dev/zero', kind: 'other' },
        { id: 'outside-defaults', label: 'Synthetic path outside default roots', path: outsideDefaults, kind: 'image' },
        { id: 'outside', label: 'A file outside every root, named directly', path: join(outside, 'secret.txt'), kind: 'other' },
        { id: 'sibling', label: 'A file in the root\'s prefix-sibling directory', path: `${root}evil/secret.txt`, kind: 'other' },
      ],
      summaryBlocks: [
        {
          id: 'shot',
          type: 'image',
          path: at('picture.png'),
          alt: 'The v3 gripper holding the 50 mm cube.',
          caption: 'Third print, before the crack.',
        },
      ],
    },
    actor: HUMAN,
  })

  t.api.createRecord({ workspaceId: 'default',
    kind: 'module',
    title: 'Preview fixture on the Orin',
    summary: 'Points at two paths and says both files live on another machine.',
    data: {
      context: 'A module whose material is on the robot rather than on this workstation.',
      parts: [],
      paths: [
        { id: 'elsewhere', label: 'A capture on the Orin', path: at('machine-elsewhere.png'), kind: 'image', machine: 'orin' },
        { id: 'both', label: 'The Orin copy of a file that is also here', path: at('both-machines.png'), kind: 'image', machine: 'orin' },
      ],
    },
    actor: HUMAN,
  })

  t.api.createRecord({ workspaceId: 'default',
    kind: 'module',
    title: 'Preview fixture, here as well',
    summary: 'Points at the same path with no machine, which means this machine.',
    data: {
      context: 'The local half of the two-machine case.',
      parts: [],
      paths: [{ id: 'both-here', label: 'The local copy', path: at('both-machines.png'), kind: 'image' }],
    },
    actor: HUMAN,
  })

  t.api.createRecord({ workspaceId: 'default',
    kind: 'note',
    title: 'A note that merely mentions a path',
    summary: 'Prose naming a file is not a pointer at it.',
    data: { body: `Have a look at ${at('unreferenced.png')} when you get a moment.` },
    actor: HUMAN,
  })

  app = Fastify({ logger: false })
  listRoutes = trackApiRoutes(app)
  http.installErrorHandling(app)
  await app.register(files.fileRoutes, { prefix: '/api' })
  await app.ready()

  process.env.MOLE_OFFICE_PREVIEW_ROOTS = root
})

afterAll(async () => {
  delete process.env.MOLE_OFFICE_PREVIEW_ROOTS
  await app.close()
  // AWAITED, and that is the whole point of these three lines. `Server.close()` is asynchronous:
  // it stops accepting and then completes later. Calling it without awaiting left the listening
  // handle open, so the vitest worker had nothing to exit on and this file hung for ever — the
  // suite went from seven seconds to killed-at-ten-minutes with no failure reported, which is the
  // most expensive shape a test problem can take, because a hang looks like slowness rather than
  // like a bug.
  if (socketServer !== null) {
    const server = socketServer
    await new Promise<void>((resolve) => server.close(() => resolve()))
    socketServer = null
  }
  chmodSync(at('unreadable.txt'), 0o600)
  rmSync(root, { recursive: true, force: true })
  rmSync(outside, { recursive: true, force: true })
  t.close()
})

// ============================================================ what a preview is actually for

describe('a file a record points at is shown, exactly', () => {
  it('hands back the picture in a module summary, byte for byte', async () => {
    const res = await ask(at('picture.png'))
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
    // Byte equality, not "a 200 and some length". A preview that re-encodes, pads or truncates is
    // showing something nobody has.
    expect(Buffer.compare(res.rawPayload, PICTURE)).toBe(0)
    expect(String(res.headers['content-type'])).toBe('image/png')
  })

  it('hands back a file a module names in data.paths, with the type its extension declares', async () => {
    const res = await ask(at('report.md'))
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe(REPORT)
    expect(String(res.headers['content-type'])).toContain('text/markdown')
  })

  it('says which record authorised it, so bytes can be traced back to the reason for them', async () => {
    const res = await ask(at('report.md'))
    const record = t.api.getRecordByTitle('Preview fixture', 'default')
    expect(res.headers['x-mole-office-record']).toBe(record?.id)
    expect(String(res.headers['x-mole-office-reference'])).toContain('data.paths[#report].path')
  })

  it('shows an empty file as empty rather than as an error or a stand-in', async () => {
    // Nothing is wrong with a file that has nothing in it, and answering 404 for one would be a
    // report of absence about a file that exists.
    const res = await ask(at('empty.txt'))
    expect(res.statusCode).toBe(200)
    expect(res.rawPayload.length).toBe(0)
  })

  it('reads the file again on every request, so the answer is never a memory of it', async () => {
    const changing = at('changing.txt')
    writeFileSync(changing, 'first')
    t.api.createRecord({ workspaceId: 'default',
      kind: 'module',
      title: 'Preview fixture that changes',
      data: {
        context: 'Points at a file whose content is edited between two requests.',
        parts: [],
        paths: [{ id: 'changing', label: 'A file being edited', path: changing, kind: 'other' }],
      },
      actor: HUMAN,
    })

    expect((await ask(changing)).body).toBe('first')
    writeFileSync(changing, 'second')
    expect((await ask(changing)).body).toBe('second')
    // And nothing about the first answer invited a browser to keep it.
    expect(String((await ask(changing)).headers['cache-control'])).toContain('no-store')
  })

  it('follows a symlink that stays inside the root, because the rule is about where content is', async () => {
    const res = await ask(at('link-in.png'))
    expect(res.statusCode, res.body.slice(0, 200)).toBe(200)
    expect(Buffer.compare(res.rawPayload, PICTURE)).toBe(0)
  })
})

// ============================================================ only what a record points at

describe('a file nothing points at is not previewable, however ordinary it is', () => {
  it('refuses a file sitting in the root that no record names', async () => {
    const res = await ask(at('unreferenced.png'))
    const error = refusal(res, 403)
    expect(error).toContain('No live record in this project points at')
    expect(error).toContain('data.summaryBlocks')
  })

  it('does not treat prose that names a path as a pointer at it', async () => {
    // A note whose body contains the path exists in this fixture. Reading a path out of prose
    // would make every filename anybody ever typed into a note into a readable file.
    const note = t.api.getRecordByTitle('A note that merely mentions a path', 'default')
    expect(note?.data['body']).toContain(at('unreferenced.png'))
    expect(refusal(await ask(at('unreferenced.png')), 403)).toContain('No live record in this project points at')
  })

  it('refuses a file INSIDE a directory a record points at, and says why that is not enough', async () => {
    // The commonest PathRef in the real corpus is a directory. If pointing at a directory handed
    // over everything under it, a single `paths` entry would turn a project folder into a file
    // server, which is the thing this endpoint is not.
    const error = refusal(await ask(join(at('docs'), 'inside.png')), 403)
    expect(error).toContain('directory reference does not carry the files under it')
  })

  it('stops serving a file the moment the reference is taken off the record', async () => {
    const created = t.api.createRecord({ workspaceId: 'default',
      kind: 'module',
      title: 'Preview fixture, withdrawn',
      data: {
        context: 'Points at a file, until it does not.',
        parts: [],
        paths: [{ id: 'w', label: 'A file that stops being pointed at', path: at('withdrawn.png'), kind: 'image' }],
      },
      actor: HUMAN,
    })
    expect((await ask(at('withdrawn.png'))).statusCode).toBe(200)

    // A MERGE, BECAUSE TAKING THE REFERENCE OFF IS WHAT THIS WRITE MEANS. `paths: null` removes the
    // key and leaves everything else alone; the wholesale `data` this used to send said the same
    // thing by omission, which is the write the record page can no longer make by accident.
    t.api.patchRecord(
      created.id,
      { dataPatch: { context: 'It no longer points at anything.', paths: null } },
      HUMAN,
    )

    const error = refusal(await ask(at('withdrawn.png')), 403)
    expect(error).toContain('No live record in this project points at')
  })

  it('refuses a file only a DELETED record ever pointed at, and names the record to restore', async () => {
    const created = t.api.createRecord({ workspaceId: 'default',
      kind: 'module',
      title: 'Preview fixture that was deleted',
      data: {
        context: 'Deleted after being filed, which is how Mole Office removes things.',
        parts: [],
        paths: [{ id: 'gone', label: 'A file whose record is gone', path: at('deleted-only.png'), kind: 'image' }],
      },
      actor: HUMAN,
    })
    expect((await ask(at('deleted-only.png'))).statusCode).toBe(200)

    t.api.deleteRecord(created.id, HUMAN)

    const error = refusal(await ask(at('deleted-only.png')), 403)
    expect(error).toContain('been deleted')
    expect(error).toContain(created.id)
    // A soft delete is reversible, so the refusal says the reversible thing to do rather than
    // leaving a reader thinking the file has to be re-filed from scratch.
    expect(error).toContain(`POST /api/records/${created.id}/restore`)
  })
})

// ============================================================ the machine the file is on

describe('a reference that names another machine is never answered with this machine', () => {
  it('refuses, even though a file of exactly that name is sitting right there', async () => {
    // The file exists locally. Serving it would be trivially possible and would be a lie: two
    // machines with the same path hold two different files.
    expect(existsSync(at('machine-elsewhere.png'))).toBe(true)
    const error = refusal(await ask(at('machine-elsewhere.png')), 409)
    expect(error).toContain('orin')
    expect(error).toContain('not on this machine')
  })

  it('serves it when a live record does say the file is here, whatever another record says', async () => {
    // Two references to one path: one says the Orin, one says nothing, and "nothing" is the
    // declared way of saying this machine. The local one is a real statement about a real file.
    const res = await ask(at('both-machines.png'))
    expect(res.statusCode, res.body.slice(0, 200)).toBe(200)
    expect(res.headers['x-mole-office-record']).toBe(t.api.getRecordByTitle('Preview fixture, here as well', 'default')?.id)
  })
})

// ============================================================ traversal, in every spelling

describe('a path that climbs is refused rather than tidied up', () => {
  it('refuses ".." in the middle even when the file it lands on is genuinely referenced', async () => {
    // /root/docs/../report.md IS /root/report.md, and that file is previewable. Answering would
    // mean the guard normalised a climbing path into a permitted one, which is exactly the trick.
    // Built as a string rather than with join(), which collapses the "..' before it is ever sent —
    // the first version of this test passed for that reason and was testing nothing.
    const error = refusal(await ask(`${at('docs')}/../report.md`), 400)
    expect(error).toContain('".." segment')
    expect(error).toContain('refused rather than normalised')
  })

  // The paths are built inside the test rather than in the table, because the table is evaluated
  // when this file is loaded and the root does not exist until beforeAll has run.
  it.each([
    ['at the front', () => '/../etc/passwd'],
    ['at the end', () => `${root}/..`],
    ['doubled', () => `${root}/../../etc/passwd`],
    ['as the whole path', () => '/..'],
    ['buried in a long path', () => `${root}/a/b/c/../../../../../../etc/passwd`],
    ['with a trailing slash', () => `${root}/../`],
  ])('refuses a climb %s', async (_where, path) => {
    expect(refusal(await ask(path()), 400)).toContain('".." segment')
  })

  it('refuses a climb that arrives percent-encoded, because the decoding happens before the guard', async () => {
    // %2e%2e%2f is "../" on the wire. It must meet the same refusal as the plain spelling rather
    // than being unwrapped somewhere the guard cannot see.
    const res = await app.inject({ method: 'GET', url: `/api/file?path=${encodeURIComponent(root)}%2f%2e%2e%2fetc%2fpasswd` })
    expect(refusal(res, 400)).toContain('".."')
  })

  it('does NOT decode a second time, so %252e%252e is a strange filename and not a climb', async () => {
    // Decoding twice would invent a traversal nobody wrote — the mirror image of the bug above,
    // and the one that turns a legal filename into an attack. It is refused for the honest
    // reason: no record points at a file with that name.
    const res = await app.inject({ method: 'GET', url: `/api/file?path=${encodeURIComponent(root)}%2f%252e%252e%2fsecret.txt` })
    expect(refusal(res, 403)).toContain('No live record in this project points at')
  })

  it('refuses a relative path rather than resolving it against wherever the server was started', async () => {
    const error = refusal(await ask('README.md'), 400)
    expect(error).toContain('must be absolute')
  })

  it('refuses a path carrying a NUL byte instead of letting it cut the path short', async () => {
    const error = refusal(await ask(`${at('picture.png')}\0.txt`), 400)
    expect(error).toContain('NUL')
  })

  it('refuses a query with no path at all, and one with anything else in it', async () => {
    expect(refusal(await app.inject({ method: 'GET', url: '/api/file' }), 400)).toContain('path')
    const extra = refusal(await app.inject({ method: 'GET', url: `/api/file?path=${encodeURIComponent(at('picture.png'))}&list=1` }), 400)
    expect(extra).toContain('no listing')
  })
})

describe('DF29: on Windows a path is read at either separator, and is inside a folder name for name', () => {
  it("keeps a picture's path inside its store on Windows, and a \"\\..\" between names is a climb", () => {
    const store = 'C:\\Users\\a\\data\\message-pictures'
    expect(
      files.inside('C:\\Users\\a\\data\\message-pictures\\p.png', store, 'win32'),
      'a path written with "\\" under a "\\" root is inside it on Windows',
    ).toBe(true)
    expect(
      files.inside('C:\\Users\\a\\data\\message-pictures\\p.png', 'C:\\Users\\a\\data\\message-pictures\\', 'win32'),
      'a root ending in "\\" names the same folder, so the path is still inside it',
    ).toBe(true)
    expect(
      files.inside('C:\\Users\\a\\data/message-pictures/p.png', store, 'win32'),
      'on Windows "/" separates names as "\\" does, so a path written with both is inside the store',
    ).toBe(true)
    expect(
      files.inside('C:\\Users\\a\\data\\message-picturesX\\p.png', store, 'win32'),
      "a folder whose name begins the store's name is not inside the store, because names are compared whole",
    ).toBe(false)
    expect(
      files.inside('C:\\Users\\a\\data\\message-pictures\\p.png', store, 'linux'),
      'on Linux "\\" is part of a name, so that path is not inside the store',
    ).toBe(false)
    expect(
      files.inside('/srv/data/message-pictures/p.png', '/srv/data/message-pictures', 'linux'),
      'a path under a "/" root is inside it on Linux, as before',
    ).toBe(true)
    expect(
      files.inside('/srv/data/message-picturesX/p.png', '/srv/data/message-pictures', 'linux'),
      "a folder whose name begins the root's name is not inside the root on Linux either",
    ).toBe(false)
    // The path begins with "/" so that it is absolute on the system the test runs on, and so the
    // only thing that differs between the two checks is which separator Windows reads.
    expect(
      files.usableStoredPath('/srv/a\\..\\b', 'win32'),
      'on Windows a ".." between "\\" names is a climb, so the stored path is unusable',
    ).toBeNull()
    expect(
      files.usableStoredPath('/srv/a\\..\\b', 'linux'),
      'on Linux "\\" is part of a name, so the same text holds no ".." name and stays usable',
    ).toBe('/srv/a\\..\\b')
  })
})

// ============================================================ the roots

describe('the preview roots are the boundary a record cannot argue with', () => {
  it('refuses a referenced file that sits outside every root', async () => {
    // The fixture record points straight at the file in the outside directory. Clause 2 passes;
    // this is the clause that does not depend on the record being honest.
    const error = refusal(await ask(join(outside, 'secret.txt')), 403)
    expect(error).toContain('outside every preview root')
    expect(error).toContain('MOLE_OFFICE_PREVIEW_ROOTS')
  })

  it('does not treat a directory whose name merely starts with the root as being inside it', async () => {
    // /tmp/mole-office-preview-root-XXXX and /tmp/mole-office-preview-root-XXXXevil are different
    // directories, and a string prefix test would call the second one confined.
    const sibling = `${root}evil`
    mkdirSync(sibling, { recursive: true })
    writeFileSync(join(sibling, 'secret.txt'), SECRET)
    try {
      const error = refusal(await ask(join(sibling, 'secret.txt')), 403)
      expect(error).toContain('outside every preview root')
    } finally {
      rmSync(sibling, { recursive: true, force: true })
    }
  })

  it('previews nothing at all when the setting is an empty string, and says that is deliberate', async () => {
    process.env.MOLE_OFFICE_PREVIEW_ROOTS = ''
    try {
      const error = refusal(await ask(outsideDefaults), 403)
      expect(error).toContain('means "preview nothing"')
      expect(error).toContain('honoured')
    } finally {
      process.env.MOLE_OFFICE_PREVIEW_ROOTS = root
    }
  })

  it('refuses to run at all on a relative root rather than guessing which directory was meant', async () => {
    process.env.MOLE_OFFICE_PREVIEW_ROOTS = 'projects/docs'
    try {
      const error = refusal(await ask(at('picture.png')), 500)
      expect(error).toContain('MOLE_OFFICE_PREVIEW_ROOTS')
      expect(error).toContain('not an absolute path')
    } finally {
      process.env.MOLE_OFFICE_PREVIEW_ROOTS = root
    }
  })

  it('refuses a configured root that is not there, rather than quietly dropping it from the list', async () => {
    // A boundary that silently shrinks is a boundary nobody can rely on, and the shrinking would
    // be invisible: everything simply stops being previewable, with no reason given.
    process.env.MOLE_OFFICE_PREVIEW_ROOTS = `${root}:${join(outside, 'no-such-directory')}`
    try {
      const error = refusal(await ask(at('picture.png')), 500)
      expect(error).toContain('MOLE_OFFICE_PREVIEW_ROOTS')
      expect(error).toContain('refused rather than dropped')
    } finally {
      process.env.MOLE_OFFICE_PREVIEW_ROOTS = root
    }
  })

  it('defaults to the two directories Mole Office writes into, and says so when they refuse', async () => {
    /*
     * IT WAS ONE DIRECTORY AND IT IS TWO SINCE 6 SEPTEMBER 2026, criterion M54.
     *
     * The default was the checkout alone, and the assertion here read *is unset, so this is the
     * Mole Office checkout*. Measured that day on a copy of the owner's corpus: every picture in report
     * `ubALECmP9ub4` sits under `~/.cache/mole-office/handback-shots/` — where CLAUDE.md tells every
     * agent to put a screenshot — and every one was refused 403
     * *outside every preview root*. Two of this project's own rules disagreeing.
     *
     * So the built-in roots are the two directories this product writes into itself. Nothing else
     * moved: an archive elsewhere in the home folder still has to be named on purpose, and this
     * synthetic referenced path is outside both. TMPDIR may legitimately be in the built-in cache root.
     */
    delete process.env.MOLE_OFFICE_PREVIEW_ROOTS
    try {
      const error = refusal(await ask(outsideDefaults), 403)
      expect(error).toContain('outside every preview root')
      // THE SENTENCE COUNTS WHAT IS REALLY IN FORCE. ~/.cache/mole-office is a built-in root only
      // when it is on disk, so a machine that has never run an agent has one root and the sentence
      // says so. Both readings are accepted here because both are true somewhere, and what this
      // case is about is that the refusal names the built-in list rather than a variable nobody set.
      //
      // AND THE FILE LAYER COUNTS TOO. Deleting the process variable does not unset the setting: the
      // live checkout's own `.env` is the second place a setting comes from, and since 8 September
      // 2026 the owner's `.env` names their projects there. On such a checkout
      // nobody-set is false, and the honest sentence names the list somebody set. Both states are
      // asserted for what they are; neither is skipped.
      if (settingWasSet('MOLE_OFFICE_PREVIEW_ROOTS', {})) {
        expect(error).toContain('MOLE_OFFICE_PREVIEW_ROOTS')
        expect(error).not.toContain('writes into itself')
      } else {
        expect(error).toMatch(/(this is the directory|these are the \d+ directories) Mole Office writes into itself/)
      }
    } finally {
      process.env.MOLE_OFFICE_PREVIEW_ROOTS = root
    }
  })
})

// ============================================================ the roots derived for a project

/**
 * THE FENCE IS DERIVED BESIDE THE VARIABLE AND NEVER IN PLACE OF IT.
 *
 * Criterion U4 as rewritten on 8 September 2026: the directories a preview may read are the
 * checkout, ~/.cache/mole-office, every registered repository's root, and every existing directory
 * a registered work area names under one of those roots. The secretary added the repository half on
 * 13 September, on his words of 10:01: his robotics pictures are reached through the REGISTERED
 * REPOSITORY and never through an absolute path typed into a work area.
 *
 * The variable keeps its three states, and the roots in force are the union. DECISIONS-PENDING
 * section 22 and section 24 are deliberately open, and this derivation answers neither: the unset
 * case still falls to the built-in directories, and an explicitly empty setting is still honoured
 * as "preview nothing".
 */
describe('the roots are derived for the project, beside the variable', () => {
  let repos: typeof import('../src/server/lib/repositories.ts')
  let repoRoot: string
  let repoFile: string
  let databaseDirectory: string
  /** A second project, so a root registered in one can be shown absent from the other. */
  const OTHER = 'preview-other-project'

  beforeAll(async () => {
    repos = await import('../src/server/lib/repositories.ts')
    const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
    createWorkspace({ id: OTHER, title: 'Preview, another project' })
    repoRoot = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-preview-repo-')))
    repoFile = join(repoRoot, 'picture.png')
    writeFileSync(repoFile, PICTURE)
    const { settings } = await import('../src/config/settings.mjs')
    databaseDirectory = dirname(resolve(settings().databasePath))
    // THE SAME ABSOLUTE PATH IS POINTED AT BY A LIVE RECORD IN BOTH PROJECTS, so any refusal below
    // is the outer fence and never "no record in this project points at it".
    for (const workspaceId of ['default', OTHER]) {
      t.api.createRecord({
        workspaceId,
        kind: 'module',
        title: `A file under a repository root (${workspaceId})`,
        data: {
          context: 'Points at a file only a registered repository root can reach.',
          parts: [],
          paths: [{ id: 'repo', label: 'The file', path: repoFile, kind: 'image' }],
        },
        actor: HUMAN,
      })
    }
  })

  afterAll(() => {
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it('serves a file under a registered repository root, and refuses it once the repository is gone', async () => {
    const repository = repos.registerRepository({ workspaceId: 'default', name: 'preview-candidate', root: repoRoot, actor: HUMAN })
    try {
      const served = await ask(repoFile, 'default')
      expect(served.statusCode, served.body.slice(0, 300)).toBe(200)
      expect(Buffer.compare(served.rawPayload, PICTURE)).toBe(0)
    } finally {
      repos.deleteRepository(repository.id, 'default', HUMAN)
    }
    // MUTATION: drop the repository source from `derivedClaims` and this case is red.
    expect(refusal(await ask(repoFile, 'default'), 403)).toContain('outside every preview root')
  })

  it('serves the same path in the project whose repository covers it and refuses it in another', async () => {
    const repository = repos.registerRepository({ workspaceId: 'default', name: 'preview-per-project', root: repoRoot, actor: HUMAN })
    try {
      expect((await ask(repoFile, 'default')).statusCode).toBe(200)
      // MUTATION: ignore the workspace in `derivedClaims` and this case is red.
      expect(refusal(await ask(repoFile, OTHER), 403)).toContain('outside every preview root')
    } finally {
      repos.deleteRepository(repository.id, 'default', HUMAN)
    }
  })

  it('says where each root came from, and leaves out a work area that resolves nowhere', async () => {
    const present = join(repoRoot, 'docs')
    mkdirSync(present)
    t.api.createRecord({
      workspaceId: 'default',
      kind: 'agent',
      title: 'A worker whose area names one real folder and one that is not there',
      data: { handle: 'preview-area-worker', workArea: ['docs', 'not-a-directory'] },
      actor: HUMAN,
    })
    const repository = repos.registerRepository({ workspaceId: 'default', name: 'preview-provenance', root: repoRoot, actor: HUMAN })
    try {
      const roots = files.previewRoots('default')
      // Every entry says where it came from, as a value rather than a sentence built at the end.
      for (const found of roots) {
        expect(found.source.kind, `no source on ${found.configured}`).toBeTruthy()
      }
      const withSource = (kind: string): string[] =>
        roots.filter((found) => found.source.kind === kind).map((found) => found.configured)
      expect(withSource('env')).toContain(root)
      expect(withSource('checkout').length).toBeGreaterThan(0)
      expect(withSource('repository')).toContain(repoRoot)
      expect(withSource('workarea')).toContain(present)
      // MUTATION: include a work area that resolves to no directory and the absence below is red.
      expect(roots.map((found) => found.configured)).not.toContain(join(repoRoot, 'not-a-directory'))
    } finally {
      repos.deleteRepository(repository.id, 'default', HUMAN)
      rmSync(present, { recursive: true, force: true })
    }
  })

  it('keeps the setting whole: its own roots and the derived ones are both in force', () => {
    const roots = files.previewRoots('default')
    expect(roots.some((found) => found.source.kind === 'env' && found.configured === root)).toBe(true)
    expect(roots.some((found) => found.source.kind === 'checkout')).toBe(true)
  })

  it('honours an explicitly empty setting as preview nothing, and lets no derived directory override it', () => {
    process.env.MOLE_OFFICE_PREVIEW_ROOTS = ''
    try {
      // MUTATION: make the variable additive instead of replacing, so that setting it empty still
      // leaves the derived list in force, and this case is red.
      expect(files.previewRoots('default')).toEqual([])
    } finally {
      process.env.MOLE_OFFICE_PREVIEW_ROOTS = root
    }
  })

  it('stores a message picture under a registered repository root and serves it back', async () => {
    const { storeAMessagePicture } = await import('../src/server/lib/messagepictures.ts')
    // THE SETTING DOES NOT COVER THE DATABASE HERE. Only a repository registered in this project
    // rooted at the database's own directory lets the upload through, so this case proves the
    // workspace is carried into the store and not just the variable.
    // MUTATION: ignore the workspace in `whereMessagePicturesGo` and this case is red.
    const repository = repos.registerRepository({
      workspaceId: OTHER,
      name: 'preview-message-pictures',
      root: databaseDirectory,
      actor: HUMAN,
    })
    try {
      const stored = storeAMessagePicture(PICTURE, OTHER)
      t.api.createRecord({
        workspaceId: OTHER,
        kind: 'module',
        title: 'A module pointing at a stored message picture',
        data: {
          context: 'Points at the picture a message just stored.',
          parts: [],
          summaryBlocks: [{ id: 'shot', type: 'image', path: stored.path, alt: 'A picture sent in a message' }],
        },
        actor: HUMAN,
      })
      const served = await ask(stored.path, OTHER)
      expect(served.statusCode, served.body.slice(0, 300)).toBe(200)
      expect(Buffer.compare(served.rawPayload, PICTURE)).toBe(0)
    } finally {
      repos.deleteRepository(repository.id, OTHER, HUMAN)
    }
  })

  it('names the repository that would have allowed the file, and the press, in one short sentence', async () => {
    const repository = repos.registerRepository({ workspaceId: OTHER, name: 'preview-elsewhere', root: repoRoot, actor: HUMAN })
    try {
      const res = await ask(repoFile, 'default')
      expect(res.statusCode, res.body.slice(0, 300)).toBe(403)
      const body = JSON.parse(res.body) as { error?: string; reason?: string }
      const error = String(body.error)
      // THE FULL ACCOUNT NAMES WHAT WOULD HAVE ALLOWED THE FILE AND THE PRESS THAT REGISTERS ONE.
      expect(error).toContain('preview-elsewhere')
      expect(error).toContain(OTHER)
      expect(error).toContain('Settings page')
      expect(error).toContain('Repositories panel')
      // MUTATION: drop `whatWouldHaveAllowed` from the message and the three assertions above are red.
      //
      // AND THE SHORT REASON STAYS ONE SENTENCE, UNDER 140 CHARACTERS, NOT NAMING THE VARIABLE.
      const reason = String(body.reason)
      expect(reason.length, `the short reason is ${String(reason.length)} characters: ${reason}`).toBeLessThan(140)
      expect(reason).not.toContain('MOLE_OFFICE_PREVIEW_ROOTS')
      expect((reason.match(/[.!?](\s|$)/g) ?? []).length).toBe(1)
    } finally {
      repos.deleteRepository(repository.id, OTHER, HUMAN)
    }
  })
})

// ============================================================ symlinks

describe('a link out of the root is followed and then refused, not refused and then followed', () => {
  it('refuses a link inside the root whose target is outside it', async () => {
    const error = refusal(await ask(at('link-out.png')), 403)
    expect(error).toContain('resolves to')
    expect(error).toContain('outside every preview root')
  })

  it('refuses a file under a linked DIRECTORY that leaves the root', async () => {
    // The escape does not have to be the last component. /root/linked-dir/secret.txt looks
    // confined segment by segment and is not.
    const error = refusal(await ask(join(at('linked-dir'), 'secret.txt')), 403)
    expect(error).toContain('outside every preview root')
  })

  it('answers a link with nothing at the end of it as missing, and never as empty', async () => {
    // An empty 200 here would be indistinguishable from a real empty file, which is the quietest
    // possible way to lie about what is on disk.
    const res = await ask(at('dangling.png'))
    const error = refusal(res, 404)
    expect(res.rawPayload.length).toBeGreaterThan(0)
    expect(error).toContain('is not there')
    expect(error).toContain('stale')
  })

  it('re-decides after a target appears: out of the root refuses, inside the root serves', async () => {
    // The same request, three times, with the world changing underneath it. Nothing is cached, so
    // a link that becomes an escape is refused the moment it does — and a link that becomes a
    // real confined file is served the moment it does.
    const target = at('appears-later.png')

    // 1. dangling — nothing at the end of it
    expect(refusal(await ask(at('dangling.png')), 404)).toContain('is not there')

    // 2. the target appears, pointing out of the root
    unlinkSync(at('dangling.png'))
    symlinkSync(join(outside, 'secret.txt'), at('dangling.png'))
    expect(refusal(await ask(at('dangling.png')), 403)).toContain('outside every preview root')

    // 3. the target appears inside the root
    unlinkSync(at('dangling.png'))
    writeFileSync(target, PICTURE)
    symlinkSync(target, at('dangling.png'))
    const served = await ask(at('dangling.png'))
    expect(served.statusCode).toBe(200)
    expect(Buffer.compare(served.rawPayload, PICTURE)).toBe(0)

    // Put the fixture back the way the other tests expect to find it.
    unlinkSync(at('dangling.png'))
    unlinkSync(target)
    symlinkSync(target, at('dangling.png'))
  })

  it('refuses to follow a link at the moment of reading, even one already approved', async () => {
    // The gap between "this path was checked" and "this path is read" is where a swapped symlink
    // gets in. The read refuses a link outright rather than resolving it a second time, so the
    // window is closed rather than narrowed. Reached directly, because the only way to be sure
    // the READ carries the rule is to hand it a link the checks never saw.
    const err = expectPanelError(t, () => files.readConfined(at('link-in.png')), 409)
    expect(err.message).toContain('symbolic link')
    expect(err.message).toContain('Nothing was read')
  })
})

// ============================================================ what is not a file

describe('a reference that is not a readable file says which of those it is', () => {
  it('refuses a directory, and does not answer with a listing of it', async () => {
    const res = await ask(at('docs'))
    const error = refusal(res, 409)
    expect(error).toContain('a directory')
    expect(error).not.toContain('inside.png')
    expect(res.body).not.toContain('inside.png')
  })

  it('refuses a character device instead of reading from it', async () => {
    // /dev/zero never ends. Reading it would hang the request or exhaust the machine, and both
    // are worse than a refusal — this is why the file's KIND is checked before a byte is read.
    process.env.MOLE_OFFICE_PREVIEW_ROOTS = `${root}:/dev`
    try {
      const error = refusal(await ask('/dev/zero'), 409)
      expect(error).toContain('a character device')
    } finally {
      process.env.MOLE_OFFICE_PREVIEW_ROOTS = root
    }
  })

  it('refuses a named pipe rather than blocking forever waiting for a writer', async () => {
    if (!hasMkfifo) {
      // Said out loud rather than silently passing: an unchecked case is not a checked one.
      expect(hasMkfifo, 'mkfifo is not on this machine, so the named-pipe case was NOT exercised').toBe(false)
      return
    }
    const error = refusal(await ask(at('pipe')), 409)
    expect(error).toContain('a named pipe')
  })

  it('refuses a socket, naming the error the operating system gave', async () => {
    const error = refusal(await ask(at('socketfile')), 409)
    expect(error).toContain('ENXIO')
    expect(error).toContain('Nothing was served')
  })

  it('reports a file it may not read as unreadable, which is not the same as missing', async () => {
    if (process.getuid?.() === 0) {
      expect(process.getuid?.(), 'running as root, so the unreadable case was NOT exercised').toBe(0)
      return
    }
    const error = refusal(await ask(at('unreadable.txt')), 409)
    expect(error).toContain('cannot read it')
    expect(error).toContain('not as missing and not as empty')
  })

  it('reports a reference to a file that is not there as a stale reference', async () => {
    const error = refusal(await ask(at('missing.png')), 404)
    expect(error).toContain('is not there')
    expect(error).toContain('Preview fixture')
    expect(error).toContain('NOTHING is served in its place')
  })

  it('refuses a file over the cap whole, rather than serving the first part of it', async () => {
    const res = await ask(at('big.bin'))
    const error = refusal(res, 413)
    expect(error).toContain(files.MAX_PREVIEW_BYTES.toLocaleString('en-GB'))
    expect(error).toContain('refused whole rather than served short')
    // The half-file is the dangerous answer: a truncated CSV looks complete and short.
    expect(res.rawPayload.length).toBeLessThan(4096)
  })
})

// ============================================================ what a preview may become

describe('a previewed file cannot act as Mole Office', () => {
  it('sandboxes a file a browser would run as a document', async () => {
    // Mole Office serves its own app from this origin in production. An HTML report with a script in
    // it, opened from here, would be able to call this API as the person — the one identity
    // allowed to write a decision.
    const res = await ask(at('page.html'))
    expect(res.statusCode).toBe(200)
    expect(String(res.headers['content-security-policy'])).toContain('sandbox')
    expect(String(res.headers['content-security-policy'])).toContain("default-src 'none'")
  })

  it('never lets the browser decide for itself what a file is', async () => {
    const res = await ask(at('picture.png'))
    expect(String(res.headers['x-content-type-options'])).toBe('nosniff')
  })

  it('describes an unrecognised extension as bytes rather than guessing it is text', async () => {
    const res = await ask(at('blob.xyz'))
    expect(res.statusCode).toBe(200)
    expect(String(res.headers['content-type'])).toBe(files.UNKNOWN_CONTENT_TYPE)
  })
})

// ============================================================ the shape of the surface

describe('this is one endpoint, and it stays one', () => {
  it('registers exactly one route: there is no listing, no directory and no search', () => {
    // A "what can I preview" endpoint would be a browsable index of everything the corpus points
    // at, which is the file browser this deliberately is not.
    expect(listRoutes().map((route) => `${route.method} ${route.path}`)).toEqual(['GET /api/file'])
  })

  it('describes itself where GET /api reads, so its refusals can be learnt without provoking one', () => {
    const note = listRoutes()[0]?.note ?? ''
    expect(note.length).toBeGreaterThan(40)
    expect(note.trim().endsWith('.')).toBe(true)
    expect(note).toContain('MOLE_OFFICE_PREVIEW_ROOTS')
    expect(note).toContain('NOT A FILE SERVER')
  })

  it('finds a path in every shape the schema declares one on, without being told where to look', () => {
    // The recurring defect in this repository is two places that must agree with nothing making
    // them agree. The reference reader knows nothing about shapes — it walks for a `path` key —
    // and this is the test that fails if that ever stops being true of a declared shape.
    const declaring = Object.values(SHAPE_SPECS).filter((shape) => shape.fields.some((field) => field.key === 'path'))
    expect(declaring.length, 'no declared shape has a `path` field any more').toBeGreaterThan(0)

    for (const shape of declaring) {
      const example = Object.fromEntries(shape.fields.map((field) => [field.key, field.example]))
      const record = {
        id: 'test',
        title: `a record holding a ${shape.name}`,
        data: { buried: { deeper: [example] } },
        deletedAt: null,
      } as unknown as PanelRecord
      const found = files.storedPathsIn(record).map((stored) => stored.path)
      expect(found, `${shape.name} declares a path and the preview reference reader did not find it`).toContain(
        String(example['path']),
      )
    }
  })

  it('drops a stored path that is relative or climbs, rather than repairing it into a reference', () => {
    // A record cannot authorise a file by writing a path that walks to it: both sides of the
    // comparison go through the same three rules, and an unusable reference is not one.
    const record = {
      id: 'test',
      title: 'a record with unusable paths',
      data: {
        paths: [
          { id: 'rel', path: 'docs/report.md' },
          { id: 'climb', path: `${THE_TEST_FIXTURE_ROOT}/PROJECTS/../.ssh/id_rsa` },
          { id: 'fine', path: `${THE_TEST_FIXTURE_ROOT}/PROJECTS/report.md` },
        ],
      },
      deletedAt: null,
    } as unknown as PanelRecord
    const usable = files.storedPathsIn(record).filter((stored) => stored.normalised !== null)
    expect(usable.map((stored) => stored.normalised)).toEqual([`${THE_TEST_FIXTURE_ROOT}/PROJECTS/report.md`])
  })
})

// ============================================================ the rendering half

/**
 * WHAT THE PAGE DRAWS FOR WHAT THE ENDPOINT ANSWERS.
 *
 * Everything above tests the endpoint. This tests the other half of the same promise, because a
 * confinement rule nobody renders and a picture nobody can see are the same failure from two ends:
 * for months a module's image block drew a grey box and a path, and the page contained no `<img>`
 * element at all.
 *
 * THE OUTCOMES ARE BUILT FROM REAL RESPONSES OF THE SERVER SET UP ABOVE, through
 * `previewRefusal` — the same function the component calls. A test that mapped statuses to
 * outcomes itself would be checking a second copy of that rule, which is this repository's own
 * recurring defect, and it would pass on the day the component's copy stopped agreeing with it.
 *
 * There is no DOM and no `fetch` in this runner, so what is checked here is the markup for each
 * outcome, rendered with react-dom/server. What that covers is exactly the thing that matters: is
 * there an `<img>`, and if not, does the page say WHY in words.
 */
describe('the rendering half: an image renders, and every refusal says why in words', () => {
  type SummaryBlocks = typeof import('../src/web/components/SummaryBlocks.tsx')
  let sb: SummaryBlocks
  let render: (el: unknown) => string
  let h: typeof import('react').createElement

  const BLOCK = {
    type: 'image' as const,
    id: 'shot',
    path: '',
    alt: 'The v3 gripper holding the 50 mm cube.',
    caption: 'Third print, before the crack.',
  }

  /** The block from the fixture module, pointed at one path. */
  const blockAt = (path: string) => ({ ...BLOCK, path })

  /** One real answer from the server above, turned into an outcome by the component's own reader. */
  async function outcomeFor(path: string): Promise<import('../src/web/components/SummaryBlocks.tsx').PreviewOutcome> {
    const res = await ask(path)
    if (res.statusCode === 200) {
      return {
        phase: 'shown',
        // What a browser would hold: an object URL over the bytes that just arrived. Never the
        // filesystem path, and never a second request to the endpoint.
        src: 'blob:panelx/8f2c',
        type: String(res.headers['content-type']),
        bytes: res.rawPayload.length,
      }
    }
    return sb.previewRefusal(res.statusCode, res.body)
  }

  const drawn = async (path: string): Promise<string> =>
    render(h(sb.ImagePreview, { block: blockAt(path), outcome: await outcomeFor(path) }))

  beforeAll(async () => {
    // The component library reaches src/web/api.ts, which reads window.localStorage while it is
    // being evaluated. This is the smallest stand-in that lets the import happen; the server
    // tests above have already run their own setup and nothing here touches them.
    const store = new Map<string, string>()
    ;(globalThis as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
      location: { hash: '' },
      addEventListener: () => {},
      removeEventListener: () => {},
    }
    const react = await import('react')
    const server = await import('react-dom/server')
    h = react.createElement
    render = (el) => server.renderToStaticMarkup(el as never).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
    sb = await import('../src/web/components/SummaryBlocks.tsx')
  })

  it('draws a REAL <img> for the picture the fixture module points at', async () => {
    // End to end in one test: the endpoint hands back the exact bytes, and the component that is
    // handed that answer puts an image element on the page. Neither half is worth anything alone.
    const res = await ask(at('picture.png'))
    expect(res.statusCode).toBe(200)
    expect(res.rawPayload.equals(PICTURE)).toBe(true)

    const html = await drawn(at('picture.png'))
    expect(html).toContain('<img')
    expect(html).toContain('The v3 gripper holding the 50 mm cube.')
  })

  it('never points an <img> at the filesystem path, which no browser can open', () => {
    // The reason this component drew no image for years, and the thing that must not come back.
    const html = render(
      h(sb.ImagePreview, {
        block: blockAt(at('picture.png')),
        outcome: { phase: 'shown', src: 'blob:panelx/8f2c', type: 'image/png', bytes: 14 },
      }),
    )
    expect(html).not.toContain('file:')
    expect(html).not.toContain(`src="${at('picture.png')}"`)
  })

  it('asks the endpoint for the path exactly as the record spells it', () => {
    // The endpoint refuses a `..` rather than normalising it and does not decode twice, so a
    // comparison against the stored string only means something if this end does not rewrite it.
    expect(sb.previewUrl('/tmp/a b/overlay 05.png')).toBe('/api/file?path=%2Ftmp%2Fa%20b%2Foverlay%2005.png')
  })

  it('draws no <img> and prints the endpoint\'s own reason for every refusal it has', async () => {
    const cases: Array<[string, string]> = [
      // nothing points at it — the reference clause
      [at('unreferenced.png'), 'No live record in this project points at'],
      // only a deleted record points at it
      [at('deleted-only.png'), 'has been deleted'],
      // the record says the file is on another machine
      [at('machine-elsewhere.png'), 'not on this machine'],
      // a symlink that leaves the roots, judged after the links are followed
      [at('link-out.png'), 'outside every preview root'],
      // a directory reference does not carry the files under it
      [join(at('docs'), 'inside.png'), 'No live record in this project points at'],
      // it is a directory
      [at('docs'), 'not a file'],
      // it is bigger than the cap
      [at('big.bin'), 'preview limit'],
      // it is there and cannot be read
      [at('unreadable.txt'), 'unreadable'],
    ]
    for (const [path, fragment] of cases) {
      const html = await drawn(path)
      expect(html, `${path} drew an image`).not.toContain('<img')
      expect(html, `${path} lost the endpoint's sentence`).toContain(fragment)
      expect(html, `${path} did not say it was refused`).toContain('data-preview="refused"')
    }
  })

  it('draws a stale pointer as NOTHING THERE, which is not the same as refused', async () => {
    // The record points at it, the rule allowed it, and the file has been moved or deleted since
    // somebody wrote it down. That is fixed by editing the record; a refusal is not.
    const html = await drawn(at('missing.png'))
    expect(html).toContain('data-preview="missing"')
    expect(html).toContain('nothing there')
    expect(html).toContain('is not there')
    expect(html).not.toContain('<img')
  })

  it('KEEPS THE THREE APART: not fetched, refused, and nothing there', async () => {
    const notAsked = render(h(sb.ImagePreview, { block: blockAt(at('picture.png')), outcome: { phase: 'not-asked' } }))
    const refused = await drawn(at('unreferenced.png'))
    const missing = await drawn(at('missing.png'))

    expect(new Set([notAsked, refused, missing]).size, 'two of the three are drawn identically').toBe(3)
    expect(notAsked).toContain('data-preview="not-asked"')
    expect(refused).toContain('data-preview="refused"')
    expect(missing).toContain('data-preview="missing"')

    // And the words, not only the attribute: an attribute nobody can see is not a label.
    expect(notAsked).toContain('not fetched')
    expect(notAsked).toContain('has not been refused and it has not been looked for')
    expect(refused).toContain('will not serve this file')
    expect(missing).toContain('nothing there')
  })

  it('says nothing has been established when nothing answered, rather than calling it a refusal', () => {
    const html = render(
      h(sb.ImagePreview, {
        block: blockAt(at('picture.png')),
        outcome: { phase: 'unreachable', why: 'Failed to fetch' },
      }),
    )
    expect(html).toContain('data-preview="unreachable"')
    expect(html).toContain('nothing at all is known about this file')
    expect(html).toContain('Failed to fetch')
    expect(html).not.toContain('<img')
  })

  it('says the bytes arrived and are not a picture, rather than calling the file missing', () => {
    const html = render(
      h(sb.ImagePreview, {
        block: blockAt(at('report.md')),
        outcome: { phase: 'undecodable', type: 'text/markdown; charset=utf-8', bytes: 61 },
      }),
    )
    expect(html).toContain('data-preview="undecodable"')
    expect(html).toContain('61 bytes')
    expect(html).toContain('text/markdown')
    expect(html).toContain('The file is there and Mole Office was allowed to read it')
    expect(html).not.toContain('<img')
  })

  it('NEVER STANDS ANYTHING IN FOR THE PICTURE, in any failure it has', async () => {
    // The one assertion this whole feature exists to keep. Not one of these may produce an image
    // element, a data: URI, a file: URL or a second request dressed up as the file.
    const failures = [
      { phase: 'not-asked' } as const,
      { phase: 'asking' } as const,
      await outcomeFor(at('unreferenced.png')),
      await outcomeFor(at('missing.png')),
      { phase: 'unreachable', why: 'the server is not running' } as const,
      { phase: 'undecodable', type: null, bytes: null } as const,
      { phase: 'browser-refused', src: 'https://example.invalid/x.png' } as const,
    ]
    for (const outcome of failures) {
      const html = render(h(sb.ImagePreview, { block: blockAt(at('picture.png')), outcome }))
      expect(html, `${outcome.phase} drew an image element`).not.toContain('<img')
      expect(html, `${outcome.phase} drew a data URI`).not.toContain('data:image')
      expect(html, `${outcome.phase} drew a file URL`).not.toContain('file:')
      // And it still shows the alt text, which is the only description of the picture left.
      expect(html, `${outcome.phase} lost the alt text`).toContain('The v3 gripper holding the 50 mm cube.')
    }
  })

  it('starts a block that points at a real path as NOT FETCHED, never as nothing there', () => {
    // The first render, before any effect has run and before the person's media-load choice has
    // been read. Drawing "missing" here would report a file nobody has looked for as a file that is
    // not there.
    //
    // THE ATTRIBUTE MOVED AND THE STATE DID NOT. Until criterion U5 a report's picture always
    // fetched, so the only reason it could be undrawn on the first render was that nothing had
    // asked yet, and the figure said `data-preview="not-asked"`. U5 added a second reason — the
    // person's own choice — so the figure now says `data-preview="held"` and, beside it, which of
    // the two holds it: `data-media-load="not-read"` while the row is still on its way, or the
    // chosen word once it has arrived. The words a person reads are still "not fetched", and no image
    // element appears, which is everything this case was written to pin. THE PATH ON THIS MACHINE IS
    // DRAWN IN DEVELOPER MODE ONLY since wave 13s round 12, and this render is a person's.
    const html = render(h(sb.SummaryBlocks, { blocks: [blockAt(at('picture.png'))] }))
    expect(html).toContain('data-preview="held"')
    expect(html).toContain('data-media-load="not-read"')
    expect(html).toContain('not fetched')
    expect(html).not.toContain(at('picture.png'))
    expect(html).not.toContain('<img')
  })

  it('leaves a web address to the browser rather than sending it through the endpoint', async () => {
    // `/api/file` serves paths on this machine. An http URL is not one, and refusing it for the
    // honest reason that it is not absolute would be a worse answer than simply loading it.
    //
    // WHAT CHANGED, AND WHAT DID NOT. This case asserted that a web address renders as an ordinary
    // image on the first render. Criterion U5 makes whether media are loaded the person's own
    // choice, and a picture at a web address is transmitted from a third party to the person's browser, so
    // the choice governs it exactly as it governs a path on this machine. What the case pins is
    // unchanged in substance: a web address is never sent through the endpoint, and where the
    // person has chosen nothing it still renders as an ordinary image, as it did before. What is
    // new is that it waits for the row to be read first, because nothing loads while the choice is
    // still on its way — otherwise a person who chose "never" would be fetched once during the gap.
    const { sayMediaLoad } = await import('../src/web/lib/mediaload.ts')
    sayMediaLoad(null)
    const html = render(h(sb.SummaryBlocks, { blocks: [{ ...BLOCK, path: 'https://example.org/overlay.png' }] }))
    expect(html).toContain('src="https://example.org/overlay.png"')
    expect(html).not.toContain('/api/file')
  })

  it('holds a web address too when the person chose never, naming the address and no press', async () => {
    // The other side of the case above, and the reason it is one criterion rather than two: a
    // picture at a web address is media, and a person who asked for media never to load has asked
    // for this one not to be fetched either. It shows the address, because that is how the file is
    // found, and no press, because a press that cannot load anything would be a lie.
    const { sayMediaLoad } = await import('../src/web/lib/mediaload.ts')
    sayMediaLoad('never')
    const html = render(h(sb.SummaryBlocks, { blocks: [{ ...BLOCK, path: 'https://example.org/overlay.png' }] }))
    expect(html).toContain('data-media-load="never"')
    expect(html).toContain('https://example.org/overlay.png')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('/api/file')
    // And it leaves the person's row as the rest of this file found it.
    sayMediaLoad(null)
  })

  it('reports a refusal that is not JSON as what it is, rather than inventing a reason', async () => {
    expect(sb.readPreviewError(502, '<html>Bad Gateway</html>')).toContain('not JSON')
    expect(sb.readPreviewError(500, '')).toContain('empty body')
    expect(sb.readPreviewError(403, '{"error":"the roots say no"}')).toBe('the roots say no')
  })
})

// ============================================================ the project the preview is asked in

/**
 * A PREVIEW IS SERVED ON THE AUTHORITY OF A RECORD IN THE PROJECT BEING ASKED ABOUT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS BLOCK EXISTS, AND WHY THE 62 TESTS ABOVE DID NOT CATCH WHAT IT CATCHES
 * ---------------------------------------------------------------------------------------
 *
 * `referencesTo` read `listRecords({ workspaceId: 'default' })`, hard-coded. Every record in this
 * file is filed in `default` and every request above sends no workspace header, which means
 * `default` — so the whole suite was green, and had been green since the corpus migration moved
 * every real record out of that project. explore.md names this shape: a test can hold a defect in
 * place. It held this one.
 *
 * Measured against the live server on 2026-08-12, in BOTH directions:
 *
 *   - a file pointed at only by a `panelx` record → 403 "No live record points at …", with or
 *     without the header. Untrue, and it sends the caller to fix a record that is already right.
 *   - a file pointed at only by a `default` record → 200 to a request working in `panelx`, with
 *     `x-mole-office-record` naming a record from a project the caller was not in.
 *
 * The second is the one that matters: a project boundary that leaks in the direction of serving
 * bytes is worse than one that leaks in the direction of refusing them.
 */
describe('a preview belongs to the project it is asked in', () => {
  /** The path both projects will point at, so only the workspace differs. */
  const shared = () => at('picture.png')

  // The fixture database is built once for the whole file, so the projects are made once too — a
  // second `createWorkspace` with the same id is refused, correctly, and that refusal is not what
  // these tests are about.
  beforeAll(async () => {
    const { createWorkspace, readWorkspaces } = await import('../src/server/lib/workspaces.ts')
    const have = new Set(readWorkspaces().map((w) => w.id))
    for (const id of ['panelx', 'robotics']) {
      if (!have.has(id)) {
        createWorkspace({ id, title: id, note: 'A project, so the preview has more than one to choose between.' })
      }
    }
  })

  it('serves a file a record in THIS project points at, in any project', async () => {
    for (const workspace of ['panelx', 'robotics']) {
      const file = at(`only-${workspace}.png`)
      writeFileSync(file, PICTURE)
      t.api.createRecord({
        workspaceId: workspace,
        kind: 'module',
        title: `Preview fixture in ${workspace}`,
        data: { context: 'Points at one file.', parts: [], paths: [{ id: 'p', label: 'it', path: file, kind: 'image' }] },
        actor: HUMAN,
      })

      const res = await ask(file, workspace)
      expect(res.statusCode, `body was ${res.body.slice(0, 300)}`).toBe(200)
      expect(res.rawPayload.includes(PICTURE)).toBe(true)
      // And the provenance header names a record in the project that was asked about.
      const named = t.api.getRecord(String(res.headers['x-mole-office-record']))
      expect(named?.workspaceId).toBe(workspace)
    }
  })

  it('REFUSES a file only another project points at, and names the project rather than the record', async () => {
    const file = at('only-robotics-2.png')
    writeFileSync(file, PICTURE)
    const owner = t.api.createRecord({
      workspaceId: 'robotics',
      kind: 'module',
      title: 'A robotics module with a secret name',
      data: { context: 'Points at one file.', parts: [], paths: [{ id: 'p', label: 'it', path: file, kind: 'image' }] },
      actor: HUMAN,
    })

    const error = refusal(await ask(file, 'panelx'), 403)
    expect(error).toContain('robotics')
    expect(error).toContain('x-mole-office-workspace: robotics')
    // A PROJECT MAY SAY WHERE SOMETHING IS AND MAY NOT READ INTO IT. The same rule the record-move
    // verb and the session resolver already settled: the title and the id belong to that project.
    expect(error).not.toContain(owner.title)
    expect(error).not.toContain(owner.id)
    // And it is NOT the "nothing points at it" sentence, which would send the caller to file a
    // reference that already exists.
    expect(error).not.toContain('so Mole Office will not read it. This endpoint serves a file only when')
  })

  it('does not serve one project a file another project authorises, which is the leak', async () => {
    // The fixture module in `default` points at picture.png. Asking as `panelx` used to be served
    // it, because the reference read only ever looked in `default`.
    const res = await ask(shared(), 'panelx')
    expect(res.statusCode).not.toBe(200)
    expect(res.rawPayload.includes(PICTURE)).toBe(false)
  })

  it('answers an unknown project with the standard refusal, not with a preview', async () => {
    // Proof that this route uses the shared workspace gate rather than a mechanism of its own: an
    // id naming no project is refused by `requireWorkspace`, exactly as on every other route.
    const res = await ask(shared(), 'no-such-project')
    expect(res.statusCode).toBe(404)
    expect(res.rawPayload.includes(PICTURE)).toBe(false)
  })
})

// ============================================================ a video streamed, a file saved whole

/**
 * A REPORT'S VIDEO IS WATCHED IN THE PAGE, AT ANY SIZE, AND ANY FILE CAN BE SAVED WHOLE. The owner's
 * words of 24 September 2026 in panelx said a video over the cap could not be watched here.
 * They were agreed at 10:51 in a second message, in the shape set out in message
 * 7fFI7J3l5Gih.
 *
 * Every case below is still the confinement contract: a stretch, a HEAD and a saved copy are each
 * refused exactly where the whole file is, and nothing in this block serves a byte the five clauses
 * above would not.
 *
 * MUTATION PROOFS, 24 September 2026, each alone in src/server/api/files.ts: a Range header read
 * as nothing, and the stretch cases go red; the cap applied to a video again, and the long video is
 * refused; a saved copy sent inline, and the saving case goes red; the project in the address
 * ignored, and the address case goes red; two projects allowed to disagree, and the refusal of them
 * goes red.
 */
describe('a video is streamed a stretch at a time, and any file can be saved whole', () => {
  /** A recognisable 64 KiB, so a stretch can be compared with the part of the file it names. */
  const CLIP = Buffer.from(Array.from({ length: 64 * 1024 }, (_, i) => i % 251))
  const VIDEO_PROJECT = 'preview-video-project'
  let goneId = ''

  const askWith = (path: string, headers: Record<string, string>, extra = ''): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'GET', url: `/api/file?path=${encodeURIComponent(path)}${extra}`, headers })

  beforeAll(async () => {
    writeFileSync(at('clip.mp4'), CLIP)
    // Sparse, like big.bin: a video over the page's limit that costs no disk.
    writeFileSync(at('long.mp4'), '')
    truncateSync(at('long.mp4'), files.MAX_PREVIEW_BYTES + 1024)
    writeFileSync(at('in-another-project.mp4'), CLIP)
    writeFileSync(at('gone.mp4'), CLIP)
    t.api.createRecord({ workspaceId: 'default',
      kind: 'module',
      title: 'Preview fixture with videos',
      data: {
        context: 'A module that points at two recordings.',
        parts: [],
        paths: [
          { id: 'clip', label: 'A short recording', path: at('clip.mp4'), kind: 'other' },
          { id: 'long', label: 'A recording longer than the page shows whole', path: at('long.mp4'), kind: 'other' },
        ],
      },
      actor: HUMAN,
    })
    const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
    createWorkspace({ id: VIDEO_PROJECT, title: 'Preview, a project named in the address' })
    t.api.createRecord({ workspaceId: VIDEO_PROJECT,
      kind: 'module',
      title: 'A recording filed in another project',
      data: { context: 'Only this project points at it.', parts: [], paths: [{ id: 'there', label: 'The recording', path: at('in-another-project.mp4'), kind: 'other' }] },
      actor: HUMAN,
    })
    const gone = t.api.createRecord({ workspaceId: 'default',
      kind: 'module',
      title: 'A recording whose record was deleted',
      data: { context: 'Deleted after being filed.', parts: [], paths: [{ id: 'gone', label: 'The recording', path: at('gone.mp4'), kind: 'other' }] },
      actor: HUMAN,
    })
    goneId = gone.id
  })

  it('answers a Range with that stretch, 206, saying where it sits in the whole', async () => {
    const res = await askWith(at('clip.mp4'), { range: 'bytes=100-199' })
    expect(res.statusCode, res.body.slice(0, 300)).toBe(206)
    expect(res.headers['content-range']).toBe(`bytes 100-199/${String(CLIP.length)}`)
    expect(res.headers['content-length']).toBe('100')
    expect(res.headers['accept-ranges']).toBe('bytes')
    expect(String(res.headers['content-type'])).toBe('video/mp4')
    expect(res.rawPayload.equals(CLIP.subarray(100, 200))).toBe(true)

    // The last n bytes, and a stretch from an offset to the end.
    const tail = await askWith(at('clip.mp4'), { range: 'bytes=-10' })
    expect(tail.statusCode).toBe(206)
    expect(tail.headers['content-range']).toBe(`bytes ${String(CLIP.length - 10)}-${String(CLIP.length - 1)}/${String(CLIP.length)}`)
    expect(tail.rawPayload.equals(CLIP.subarray(CLIP.length - 10))).toBe(true)
    const rest = await askWith(at('clip.mp4'), { range: `bytes=${String(CLIP.length - 5)}-` })
    expect(rest.rawPayload.equals(CLIP.subarray(CLIP.length - 5))).toBe(true)

    // A stretch running past the end is cut at the end, and says so.
    const over = await askWith(at('clip.mp4'), { range: `bytes=${String(CLIP.length - 3)}-999999999` })
    expect(over.statusCode).toBe(206)
    expect(over.headers['content-range']).toBe(`bytes ${String(CLIP.length - 3)}-${String(CLIP.length - 1)}/${String(CLIP.length)}`)
    expect(over.rawPayload.length).toBe(3)
  })

  // AN iPHONE'S PLAYER IS ANSWERED (acceptance finding 74; the owner's test of 24 September 2026, 16:12). Apple's media
  // player sends X-Playback-Session-Id with every request a <video> makes, and the identity guard refused it with 400
  // before this door read the file, so every report video showed a slashed play button on an iPhone.
  // MUTATION PROOF, 24 September 2026, alone in src/server/lib/http.ts: the exemption taken out, and this goes red.
  it("answers the request an iPhone's media player makes, headers and all", async () => {
    const res = await askWith(at('clip.mp4'), {
      range: 'bytes=0-1',
      'x-playback-session-id': '0A1B2C3D-4E5F-6789-ABCD-EF0123456789',
      'accept-encoding': 'identity',
      accept: '*/*',
      'user-agent': 'AppleCoreMedia/1.0.0.22A3354 (iPhone; U; CPU OS 18_0 like Mac OS X; en_gb)',
    })
    expect(res.statusCode, res.body.slice(0, 300)).toBe(206)
    expect(res.headers['content-range']).toBe(`bytes 0-1/${String(CLIP.length)}`)
    expect(res.rawPayload.equals(CLIP.subarray(0, 2))).toBe(true)
  })

  it('answers a stretch the file has none of with 416 and its size, and sends none of it', async () => {
    const res = await askWith(at('clip.mp4'), { range: `bytes=${String(CLIP.length)}-` })
    expect(res.statusCode).toBe(416)
    expect(res.headers['content-range']).toBe(`bytes */${String(CLIP.length)}`)
    expect(String(res.headers['content-type'])).toContain('application/json')
    expect(res.rawPayload.includes(CLIP.subarray(0, 64))).toBe(false)
  })

  it('answers a Range it does not read with the whole file, rather than guessing a part', async () => {
    const res = await askWith(at('clip.mp4'), { range: 'bytes=0-9,20-29' })
    expect(res.statusCode).toBe(200)
    expect(res.rawPayload.equals(CLIP)).toBe(true)
  })

  it('streams a video over the page limit whole, where any other file is refused', async () => {
    const res = await ask(at('long.mp4'))
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
    expect(res.headers['content-length']).toBe(String(files.MAX_PREVIEW_BYTES + 1024))
    expect(res.rawPayload.length).toBe(files.MAX_PREVIEW_BYTES + 1024)
    const end = await askWith(at('long.mp4'), { range: 'bytes=-16' })
    expect(end.statusCode).toBe(206)
    expect(end.headers['content-range']).toBe(`bytes ${String(files.MAX_PREVIEW_BYTES + 1008)}-${String(files.MAX_PREVIEW_BYTES + 1023)}/${String(files.MAX_PREVIEW_BYTES + 1024)}`)
    // The same size, not a video, shown in the page: still refused whole, and told how to save it.
    expect(refusal(await ask(at('big.bin')), 413)).toContain('download=1')
  })

  it('saves any file whole with download=1, as an attachment, byte for byte', async () => {
    const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')
    const res = await askWith(at('clip.mp4'), {}, '&download=1')
    expect(res.statusCode).toBe(200)
    expect(String(res.headers['content-disposition'])).toMatch(/^attachment; filename="clip\.mp4"/u)
    expect(sha(res.rawPayload)).toBe(sha(CLIP))
    // Not a video and over the page limit: saved whole all the same.
    const big = await askWith(at('big.bin'), {}, '&download=1')
    expect(big.statusCode).toBe(200)
    expect(big.rawPayload.length).toBe(files.MAX_PREVIEW_BYTES + 1)
    // Shown in the page, the same file says inline.
    expect(String((await ask(at('clip.mp4'))).headers['content-disposition'])).toMatch(/^inline;/u)
  })

  it('answers a HEAD with the GET\'s headers and no bytes, and refuses one the GET would refuse', async () => {
    const res = await app.inject({ method: 'HEAD', url: `/api/file?path=${encodeURIComponent(at('clip.mp4'))}` })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-length']).toBe(String(CLIP.length))
    expect(String(res.headers['content-type'])).toBe('video/mp4')
    expect(res.rawPayload.length).toBe(0)
    // A file nothing points at tells a HEAD nothing about itself: neither its size nor its type.
    const refused = await app.inject({ method: 'HEAD', url: `/api/file?path=${encodeURIComponent(at('unreferenced.png'))}` })
    expect(refused.statusCode).toBe((await ask(at('unreferenced.png'))).statusCode)
    expect(String(refused.headers['content-type'])).toContain('application/json')
    expect(refused.headers['x-mole-office-record']).toBeUndefined()
  })

  it('takes the project from the address for a player that cannot send a header, and refuses two that disagree', async () => {
    // Asked in no project, the default one answers, and nothing there points at the file.
    expect((await ask(at('in-another-project.mp4'))).statusCode).toBe(403)
    const inTheAddress = await askWith(at('in-another-project.mp4'), { range: 'bytes=0-15' }, `&workspace=${VIDEO_PROJECT}`)
    expect(inTheAddress.statusCode, inTheAddress.body.slice(0, 300)).toBe(206)
    expect(inTheAddress.rawPayload.equals(CLIP.subarray(0, 16))).toBe(true)
    // The header and the address agreeing is one project, and is served.
    const both = await askWith(at('in-another-project.mp4'), { 'x-mole-office-workspace': VIDEO_PROJECT }, `&workspace=${VIDEO_PROJECT}`)
    expect(both.statusCode).toBe(200)
    // The header and the address naming different projects is refused, and nothing is read.
    const two = refusal(await askWith(at('in-another-project.mp4'), { 'x-mole-office-workspace': 'default' }, `&workspace=${VIDEO_PROJECT}`), 400)
    expect(two).toContain('names two projects')
  })

  it('refuses a stretch and a saved copy of a file whose record was deleted, as it refuses the whole', async () => {
    expect((await ask(at('gone.mp4'))).statusCode).toBe(200)
    t.api.deleteRecord(goneId, HUMAN)
    expect(refusal(await askWith(at('gone.mp4'), { range: 'bytes=0-15' }), 403)).toContain('been deleted')
    expect(refusal(await askWith(at('gone.mp4'), {}, '&download=1'), 403)).toContain('been deleted')
  })

  it('refuses a stretch of a link out of the root, as it refuses the whole', async () => {
    expect(refusal(await askWith(at('link-out.png'), { range: 'bytes=0-3' }), 403)).toContain('outside every preview root')
  })
})
