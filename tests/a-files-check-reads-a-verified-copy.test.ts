// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHECK OF A FILES SEAL READS A COPY OF THE STAGED FILES THAT ITS OWN TOOL MADE AND VERIFIED.
 *
 * Option A of a decision, with a read path that agrees with the suggestion in proposal yTg28XxSOqdE to
 * add one. Part 1 sealed a folder of files with no
 * git (tests/a-files-run-is-sealed-from-its-staged-folder.test.ts); this is the check that can read
 * one. Without it a files seal could be made and never checked.
 *
 * WHY A COPY, AND NOT A MOUNT OF THE STAGED FOLDER. A mount is live, so the bytes the model read could
 * differ from the bytes that were hashed if anything touched the folder in between; a copy freezes
 * exactly those, and the model's sandbox never sees the staged folder at all (a review).
 *
 * WHAT IS PROVED
 *   1. Every sealed file is copied, hashed as it is copied and compared with the seal; a text file is
 *      shown as an addition, a binary one described, and the verdict's `read` says it was a copy of
 *      the staged files, each checked against the seal before the model ran. No tip, no git base. The
 *      copy is removed once the verdict is delivered.
 *   2. A path with a file already landed at it is a MODIFY: the prompt shows the before and the after,
 *      and `read.before` carries the landed file's sha256, which is what the queue binds a modify
 *      operation's `before` to. The review's case: the last round of a recovery rewrites RECOVERY.md.
 *   3. A staged file changed after the seal stops the check before anything is assembled.
 *   4. The mode is compared from the STAGED file: a 0755 file sealed as 100755 passes although its copy
 *      is written 0644 under the umask, and a 0644 file sealed as 100755 stops the check (the
 *      review: a mode read back from the copy would be the copy's, not the staged file's).
 *   5. A symbolic link where a file was sealed is refused, even when it points at the sealed bytes.
 *   6. A copy left by an earlier check with the same id is refused and kept, never adopted.
 *   7. Criterion C22 holds on a copy: a model that rewrites a staged file in the copy it reads is not
 *      posted. A copy is not a repository, so `git status` would see nothing there.
 *
 * MUTATION PROOF, named, each run on 23 September 2026 in tools/the-inspector.mjs:
 *   - compare nothing with the seal's hash in aStagedCopyOfItsOwn, and case 3 goes red;
 *   - read the mode from the copy (fstat of the target) instead of the source, and case 4's 0755
 *     control goes red;
 *   - open the source without O_NOFOLLOW, and case 5 goes red: the link is followed to the sealed
 *     bytes and the check is assembled;
 *   - skip the landed file (no BEFORE), and case 2 goes red;
 *   - photograph a copy with git as a worktree is photographed, and case 7 goes red: the rewrite
 *     passes unseen;
 *   - A2: do not tell the check what the files checker handed on over its copy, and the case that says
 *     so goes red;
 *   - acceptance finding 52: read a files seal's file by the work area instead of the files area, and
 *     cases 1 and 2 and the case of the link out go red; leave out the stop for a folder of the files
 *     area that moved, and its case goes red.
 */
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { aCheckRowsSelection, aMadeUpCheckSession, inspectorFixture } from './inspector-tool-fixture.ts'

let fixture: Awaited<ReturnType<typeof inspectorFixture>>
const landings: string[] = []
beforeEach(async () => { fixture = await inspectorFixture() })
afterEach(async () => {
  await fixture.close()
  for (const one of landings.splice(0)) rmSync(one, { recursive: true, force: true })
})

const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')

/** A folder under the fixture's home holding these files. */
function folder(name: string, files: Record<string, string | Buffer>) {
  const at = join(fixture.home, name)
  mkdirSync(at, { recursive: true })
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(at, path)), { recursive: true })
    writeFileSync(join(at, path), body)
  }
  return at
}

/**
 * THE FOLDER A FILES RUN LANDS IN, holding these files: outside this checkout, because a file whose real location
 * lies in a git working tree is never inside a files area (acceptance finding 52).
 */
function landing(files: Record<string, string | Buffer>) {
  const at = realpathSync(mkdtempSync(join(tmpdir(), 'a-files-check-landing-')))
  landings.push(at)
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(at, path)), { recursive: true })
    writeFileSync(join(at, path), body)
  }
  return at
}

/**
 * The run's reading carries a files seal of these files, as the office writes one, and the agent's files area is
 * the root they land in, as the office's check door hands it (acceptance finding 52). The work area stays the
 * fixture's own: a files seal's files are read by the files area, never by the work area.
 */
function sealed(stagedAt: string, root: string, files: Record<string, string | Buffer>, modes: Record<string, string> = {}) {
  fixture.state.filesArea = [{ written: root, resolved: realpathSync(root) }]
  fixture.state.submission = {
    id: 'fixture-seal',
    seal: {
      kind: 'files',
      run: fixture.run,
      hash: 'a'.repeat(64),
      git: null,
      records: null,
      area: ['recordings', 'RECOVERY.md'],
      files: {
        stagedAt,
        root,
        files: Object.keys(files).sort().map((path) => ({ path, hash: sha(files[path]!), mode: modes[path] ?? '100644' })),
      },
    },
  }
}

const RECORDING = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x01, 0x02, 0x00, 0xff, 0xfe])
const NEW_RECOVERY = '# Recovery\n\nThe two large recordings are in this round.\n'
const OLD_RECOVERY = '# Recovery\n\nThe two large recordings are not in this commit.\n'

function assembled() {
  return fixture.state.writes.find((one) => one.path.endsWith('/assembled'))?.body
}

describe('a check of a files seal reads a copy it verified', () => {
  it('copies and hashes every sealed file, shows each as an addition, and says it read a verified copy', async () => {
    const files = { 'recordings/E1a.wav': RECORDING, 'RECOVERY.md': NEW_RECOVERY }
    const stagedAt = folder('staged', files)
    const root = landing({})
    sealed(stagedAt, root, files)
    const check = aMadeUpCheckSession()
    const result = await fixture.inspect(['--check', check])
    expect(result.code, result.err).toBe(0)
    const body = assembled()!
    expect(body.base).toBeNull()
    const byPath = Object.fromEntries((body.changes as { path: string; changes: string }[]).map((one) => [one.path, one.changes]))
    expect(Object.keys(byPath).sort()).toEqual(['RECOVERY.md', 'recordings/E1a.wav'])
    expect(byPath['RECOVERY.md']).toContain('ADDED RECOVERY.md')
    expect(byPath['RECOVERY.md']).toContain('+The two large recordings are in this round.')
    expect(byPath['recordings/E1a.wav']).toContain('It is not text')
    expect(byPath['recordings/E1a.wav']).toContain(sha(RECORDING))
    expect(body.read.worktree).toBe(fixture.pathFor(check))
    expect(body.read.tip).toBeUndefined()
    expect(body.read.staged).toBe(stagedAt)
    expect(body.read.before).toEqual({})
    expect(body.read.says).toContain('a copy of the staged files, each checked against seal fixture-seal before the model ran')
    expect(existsSync(fixture.pathFor(check)), 'the copy is removed once the verdict is delivered').toBe(false)
  })

  it('shows a modify with its before, and carries the before hash on the read', async () => {
    const files = { 'recordings/E1a.wav': RECORDING, 'RECOVERY.md': NEW_RECOVERY }
    const stagedAt = folder('staged', files)
    const root = landing({ 'RECOVERY.md': OLD_RECOVERY })
    sealed(stagedAt, root, files)
    const result = await fixture.inspect(['--check', aMadeUpCheckSession()])
    expect(result.code, result.err).toBe(0)
    const body = assembled()!
    const recovery = (body.changes as { path: string; changes: string }[]).find((one) => one.path === 'RECOVERY.md')!.changes
    expect(recovery).toContain(`MODIFIED RECOVERY.md: it replaces the file landed at this path now, whose sha256 is ${sha(OLD_RECOVERY)}`)
    expect(recovery).toContain('-The two large recordings are not in this commit.')
    expect(recovery).toContain('+The two large recordings are in this round.')
    expect(body.read.before).toEqual({ 'RECOVERY.md': sha(OLD_RECOVERY) })
  })

  it('stops before anything is assembled when a staged file changed after the seal', async () => {
    const files = { 'recordings/E1a.wav': RECORDING, 'RECOVERY.md': NEW_RECOVERY }
    const stagedAt = folder('staged', files)
    sealed(stagedAt, landing({}), files)
    writeFileSync(join(stagedAt, 'RECOVERY.md'), `${NEW_RECOVERY}One line more.\n`)
    const result = await fixture.inspect(['--check', aMadeUpCheckSession()])
    expect(result.code).toBe(1)
    expect(result.err).toContain('Staged file RECOVERY.md differs from seal fixture-seal')
    expect(fixture.state.writes.filter((one) => one.path.endsWith('/prompt') || one.path.endsWith('/assembled'))).toEqual([])
    expect(result.err).toContain("The check's copy")
  })

  it('compares the mode of the staged file, never of the copy', async () => {
    const files = { 'recordings/run.sh': '#!/bin/sh\necho recovered\n' }
    const stagedAt = folder('staged', files)
    chmodSync(join(stagedAt, 'recordings/run.sh'), 0o755)
    sealed(stagedAt, landing({}), files, { 'recordings/run.sh': '100755' })
    const executable = await fixture.inspect(['--check', aMadeUpCheckSession()])
    expect(executable.code, executable.err).toBe(0)

    chmodSync(join(stagedAt, 'recordings/run.sh'), 0o644)
    fixture.state.writes.length = 0
    const plain = await fixture.inspect(['--check', 'mode-changed'])
    expect(plain.code).toBe(1)
    expect(plain.err).toContain('Staged file recordings/run.sh changed its mode after seal fixture-seal: sealed 100755, found 100644')
    expect(fixture.state.writes.filter((one) => one.path.endsWith('/assembled'))).toEqual([])
  })

  it('refuses a symbolic link where a file was sealed, even one pointing at the sealed bytes', async () => {
    const files = { 'RECOVERY.md': NEW_RECOVERY }
    const stagedAt = folder('staged', files)
    sealed(stagedAt, landing({}), files)
    const elsewhere = folder('elsewhere', { 'same.md': NEW_RECOVERY })
    unlinkSync(join(stagedAt, 'RECOVERY.md'))
    symlinkSync(join(elsewhere, 'same.md'), join(stagedAt, 'RECOVERY.md'))
    const result = await fixture.inspect(['--check', aMadeUpCheckSession()])
    expect(result.code).toBe(1)
    expect(result.err).toContain('RECOVERY.md is a symbolic link where a file was sealed')
    expect(fixture.state.writes.filter((one) => one.path.endsWith('/assembled'))).toEqual([])
  })

  it('refuses and keeps a copy an earlier check with the same id left behind', async () => {
    const files = { 'RECOVERY.md': NEW_RECOVERY }
    sealed(folder('staged', files), landing({}), files)
    const check = aMadeUpCheckSession()
    const left = fixture.pathFor(check)
    mkdirSync(join(left, 'staged'), { recursive: true })
    writeFileSync(join(left, 'staged', 'RECOVERY.md'), 'what the earlier check copied\n')
    const result = await fixture.inspect(['--check', check])
    expect(result.code).toBe(1)
    expect(result.err).toContain('File a fresh check session and ask again with its id')
    expect(readFileSync(join(left, 'staged', 'RECOVERY.md'), 'utf8')).toBe('what the earlier check copied\n')
  })

  it('tells the check what the files checker could not decide over its copy, and nothing it could (A2)', async () => {
    const recording = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x00, 0xfe, 0xff])
    const files = { 'recordings/E1a.bin': recording, 'RECOVERY.md': NEW_RECOVERY }
    const stagedAt = folder('staged', files)
    const root = landing({ 'RECOVERY.md': OLD_RECOVERY })
    const original = join(folder('originals', { 'E1a.bin': recording }), 'E1a.bin')
    sealed(stagedAt, root, files)
    // THE RECORDING'S ORIGINAL AS ITS SEAL RECORDED IT AT FINISH, where the run could not have written it.
    const seal = fixture.state.submission!['seal'] as { files: { files: Record<string, unknown>[] } }
    seal.files.files = seal.files.files.map((one) => (one['path'] === 'recordings/E1a.bin' ? { ...one, origin: { path: original, sha256: sha(recording), couldWrite: false } } : one))
    const result = await fixture.inspect(['--check', aMadeUpCheckSession()])
    expect(result.code, result.err).toBe(0)
    expect(result.out).toContain('The files checker ran over the copy and handed on RECOVERY.md')
    const body = assembled()!
    expect((body.needsJudgment as { path: string; why: string; changes: string }[]).map((one) => one.path)).toEqual(['RECOVERY.md'])
    expect(body.needsJudgment[0].why).toContain('No content check exists for .md files')
    expect(body.needsJudgment[0].changes).toContain('MODIFIED RECOVERY.md')
    expect((body.read.needsJudgment as { path: string }[]).map((one) => one.path)).toEqual(['RECOVERY.md'])
  })

  it('does not post a check whose model rewrote a staged file in the copy it read (C22)', async () => {
    const files = { 'RECOVERY.md': NEW_RECOVERY }
    sealed(folder('staged', files), landing({}), files)
    // The office is one of this branch: the inspector's Casting row names the model --model names below, with native
    // data, so the check starts from the row's selection and not from the compatibility list.
    fixture.state.checkModel = { model: 'a-stand-in', from: 'the role', says: 'Synthetic: the row names the stand-in.', selection: aCheckRowsSelection('a-stand-in') }
    const bin = join(fixture.home, 'bin')
    mkdirSync(bin)
    const standIn = (what: string) => {
      writeFileSync(
        join(bin, 'claude'),
        `#!/bin/sh\n# A stand-in for the model, never a model.\ncat > /dev/null\n${what}\n` +
          `printf '%s\\n' '{"result":"{\\"verdict\\":\\"released\\",\\"check\\":\\"stand-in\\"}"}'\n`,
      )
      chmodSync(join(bin, 'claude'), 0o755)
    }
    const env = { PATH: `${bin}:${process.env.PATH ?? ''}` }
    const flags = (check: string) => ['--check', check, '--on-the-host', '--model', 'a-stand-in', '--limit', '1']

    standIn('cat staged/RECOVERY.md > /dev/null')
    const reader = await fixture.inspect(flags(aMadeUpCheckSession()), env, { dry: false })
    expect(reader.err).not.toContain('changed the work it was checking')

    standIn("printf 'rewritten by the stand-in\\n' > staged/RECOVERY.md")
    const writer = await fixture.inspect(flags(aMadeUpCheckSession()), env, { dry: false })
    expect(writer.code).toBe(1)
    expect(writer.err).toContain('the inspector changed the work it was checking while it ran: in the copy this check made')
    expect(writer.err).toContain('staged/RECOVERY.md')
  })
})

// ACCEPTANCE FINDING 52 (report EnJvvsDTF_Dx, block f-52): a files seal's files are read by the agent's files area,
// on real locations, never by the repository-relative work area, which never held one.
describe("a check of a files seal reads what lands inside the agent's files area", () => {
  it('reads a file that lands inside it, and names, unread, one that a link in the root leads out of it', async () => {
    const files = { 'recordings/E1a.wav': RECORDING, 'RECOVERY.md': NEW_RECOVERY }
    const stagedAt = folder('staged', files)
    const root = landing({})
    const away = landing({})
    symlinkSync(away, join(root, 'recordings'))
    sealed(stagedAt, root, files)
    const result = await fixture.inspect(['--check', aMadeUpCheckSession()])
    expect(result.code, result.err).toBe(0)
    expect(result.out).toContain(`its files area        ${root}`)
    const byPath = Object.fromEntries((assembled()!.changes as { path: string; changes: string }[]).map((one) => [one.path, one.changes]))
    expect(byPath['RECOVERY.md']).toContain('ADDED RECOVERY.md')
    expect(byPath['recordings/E1a.wav']).toBe('Outside the files area. Named, not read.')
  })

  it('stops before anything is started when a folder of the files area moved since it was registered', async () => {
    const files = { 'RECOVERY.md': NEW_RECOVERY }
    const stagedAt = folder('staged', files)
    const root = landing({})
    const link = join(landing({}), 'the-area')
    symlinkSync(landing({}), link)
    sealed(stagedAt, root, files)
    fixture.state.filesArea = [{ written: link, resolved: root }]
    const check = aMadeUpCheckSession()
    const result = await fixture.inspect(['--check', check])
    expect(result.code).toBe(1)
    expect(result.err).toContain(`The files area ${link} resolved to ${root} when it was registered and resolves to`)
    expect(result.err).toContain('Nothing was assembled and nothing was written.')
    expect(fixture.state.writes).toEqual([])
    expect(existsSync(fixture.pathFor(check)), 'no copy was made').toBe(false)
  })
})
