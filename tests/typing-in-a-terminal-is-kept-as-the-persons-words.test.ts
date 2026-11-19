// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE PERSON TYPES INTO THE OFFICE'S OWN TERMINAL CAN BE KEPT AS THEIR OWN WORDS. Wave 13u, round 3.
 *
 * A decision, on a message, settles this. What the person types
 * in the office's own terminal passes the person-only typing door, so the office keeps it as their own words with no
 * press, as what they write in chat; a secretary may then pick a rule out of it and cite that record in a
 * decision, option C. The round's
 * brief added: never keep a line that looks like a secret; round 12 keeps such a line and says so, by three decisions
 * and answer LBC7EuG5aIqI. Round 3 keeps a line THE PERSON
 * MARKS: the holder remembers the last line the person ended with Enter, in memory only, and offers it only if the
 * screen showed it.
 *
 * WHAT IS PROVED HERE, against a real terminal holder and a scratch server process:
 *   1. the secret shapes: keys, tokens, a password given a value, a URL with a password; ordinary lines are not;
 *   2. a line the person typed and the screen showed is offered, kept as a note of theirs, and a secretary's decision in their
 *      name may cite it; a note an agent wrote with the same field may not be cited;
 *   3. a line typed at a prompt that does not echo (a password) is never offered or kept;
 *   4. a line that looks like a key is offered and kept, and the offer says so; an ordinary line's offer does not;
 *   5. a line that changed since the person read it is refused;
 *   6. a line with an arrow key in it, whose screen can differ from what was sent, is not offered;
 *   7. an agent is refused at both doors with its code;
 *   8. with keeping on, a line typed for the person by somebody else (the holder's typeALine, wave 13s round 83) is never
 *      kept: the note holds only the person's later line, and counts the other as typed by somebody else. The holder's
 *      own cases are in tests/a-line-is-typed-for-somebody-else.test.ts.
 *
 * CASE 8'S MUTATIONS, each alone after a control run, on 23 October 2026, each put back before the next:
 *   - the holder's typeALine reads its line and Enter as the person's typing: case 8 goes red, with cases 2 and 3 of
 *     tests/a-line-is-typed-for-somebody-else.test.ts;
 *   - takeTheLines (src/server/lib/terminal-keeping.ts) no longer counts a line typed by another: case 8 goes red alone,
 *     its note counting nothing typed by somebody else.
 */

import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { whyThisLooksLikeASecret } from '../src/shared/terminals.ts'
import { theRoleCardsFile } from '../src/server/lib/roles.ts'
import {
  AS_AN_AGENT,
  AS_THE_PERSON,
  aPlace,
  ask,
  groups,
  holder,
  sleep,
  startAHolder,
  startAServer,
  stopEverything,
  theStreamsScreen,
  until,
  type Place,
  type ScratchServer,
} from './terminal-holder-stand.ts'

let place: Place
let server: ScratchServer

afterAll(stopEverything, 60_000)

beforeAll(async () => {
  place = aPlace('typed')
  await startAHolder(place)
  server = await startAServer(place)
  const card = (JSON.parse(readFileSync(theRoleCardsFile(), 'utf8')) as { elevation: { onlyThisCardCanHoldIt: string } }).elevation.onlyThisCardCanHoldIt
  const quill = await ask(server.api, '/api/agents/started', { method: 'POST', body: { handle: 'quill', name: 'Quill', role: card } })
  if (quill.status !== 201) throw new Error(`The secretary could not be registered: ${JSON.stringify(quill.body)}`)
  const other = await ask(server.api, '/api/agents/started', { method: 'POST', body: { handle: 'some-agent', name: 'Some agent', role: 'worker' } })
  if (other.status !== 201) throw new Error(`The agent could not be registered: ${JSON.stringify(other.body)}`)
}, 120_000)

const AS_QUILL = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'quill' }

/**
 * A bash terminal the person opened, its process group recorded. KEEPING IS TURNED OFF: since round 4 every line is kept
 * with no press while it is on (tests/the-persons-typing-is-kept-with-no-press.test.ts), and the press proved here is the one
 * for a terminal whose keeping is off (decision YLv8grhgilBV, point 5).
 */
async function aShell(): Promise<{ id: string; pid: number }> {
  const opened = await ask(server.api, '/api/terminals', { method: 'POST', body: { folder: place.dir, command: '/bin/bash', args: ['--noprofile', '--norc'], cols: 100, rows: 30, keeping: false } })
  expect(opened.status, JSON.stringify(opened.body)).toBe(201)
  const terminal = opened.body['terminal'] as { id: string; pid: number }
  groups.add(terminal.pid)
  return terminal
}

/** Type into a terminal as the person, and wait until the screen shows `until`. */
async function type(id: string, data: string, shows: string): Promise<void> {
  const typed = await ask(server.api, `/api/terminals/${id}/input`, { method: 'POST', body: { data } })
  expect(typed.status, JSON.stringify(typed.body)).toBe(200)
  await until(() => theStreamsScreen(server.api, id), (lines) => lines.join('\n').includes(shows), 10_000)
  // The holder asks the screen whether it showed the line a moment after Enter.
  await sleep(600)
}

const lastLine = (id: string) => ask(server.api, `/api/terminals/${id}/last-line`)
const keep = (id: string, text: string, headers = AS_THE_PERSON) => ask(server.api, `/api/terminals/${id}/keep-my-line`, { method: 'POST', body: { text }, headers })
const notes = async (): Promise<number> => (((await ask(server.api, '/api/records?kind=note')).body['records'] ?? []) as unknown[]).length

describe('a line that looks like a secret', () => {
  it('1: is told apart from an ordinary line', () => {
    for (const secret of [
      'export OPENAI_API_KEY=sk-proj-4f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c',
      'git clone https://jory:hunter2@example.com/repo.git',
      'password: correct horse battery staple',
      'mysql -u root -pS3cretPass',
      'curl -H "Authorization: Bearer abcdefghijklmnop1234567890"',
      'ghp_1234567890abcdefghijABCDEFGHIJ123456',
      'AKIAIOSFODNN7EXAMPLE',
      '-----BEGIN OPENSSH PRIVATE KEY-----',
      'echo dGhpcyBpcyBhIHZlcnkgbG9uZyBiYXNlNjQgc3RyaW5n',
      'token=Zx81Ka92Lm03Pq74Rs65Tu56',
    ]) expect(whyThisLooksLikeASecret(secret), secret).not.toBeNull()
    for (const ordinary of [
      'from now on, run the tests before every commit',
      '以后每次提交前都先跑测试',
      'cd /srv/mole-office-fixtures/sandboxes/w13u/worktrees/wave-13u-supervisor',
      'git log --oneline -5',
      'ssh -p2222 me@example.com',
      'mkdir -p src/holder',
      'npm run build && npm test',
      'the-office-terminal-holder-keeps-every-terminal-running',
    ]) expect(whyThisLooksLikeASecret(ordinary), ordinary).toBeNull()
  })

  // CHECK J5sHdzTwkRgr: .env lines slipped through, because \b finds no edge after an underscore. Every line here is too
  // short and too plain for the other shapes, so only the name=value rule can catch it.
  it('1b: written as a .env line, with or without export, quoted or not, in any case, is caught by the name=value rule', () => {
    for (const secret of [
      'export DB_PASSWORD=hunter2',
      'export DB_PASS=hunter2x',
      'GITHUB_TOKEN=abc123',
      'export OPENAI_API_KEY=abcdef',
      'API_KEY="abcdef"',
      "export MY_SECRET='two words'",
      'db_password=hunter2',
      'DB_PASSWD=x',
      'DB_PWD=x',
      'AWS_ACCESS_KEY=abc',
      'SSH_PRIVATE_KEY=abc',
      'SERVICE_CREDENTIALS=abc',
      'BASIC_AUTH=hunter2',
    ]) expect(whyThisLooksLikeASecret(secret), secret).toBe('a password or a key given a value')
    for (const ordinary of [
      'export PATH=$PATH:/usr/local/bin',
      'export NODE_ENV=production',
      'echo $PWD',
      'OLDPWD=/tmp',
      'bypass=1',
      'pass the tests before you commit',
    ]) expect(whyThisLooksLikeASecret(ordinary), ordinary).toBeNull()
  })

  // WAVE 13W ROUND 2 (message _wB1mehQp4KB): the message door reads this rule too, and agents' messages carry full
  // commit ids and record ids all day. MUTATION: drop the line in whatLooksLikeASecret that lets A_COMMIT_ID through.
  it('1c: a git commit id, exactly 40 lower-case hex characters, is not a secret, and a 64-character run of hex still is', () => {
    const commit = '5e70e031d85db292b53623b992f6014bdab158c5'
    expect(whyThisLooksLikeASecret(`git checkout ${commit}`)).toBeNull()
    expect(whyThisLooksLikeASecret(`主分支在 ${commit}。`)).toBeNull()
    expect(whyThisLooksLikeASecret(`export KEYLESS=${'0123456789abcdef'.repeat(4)}`)).toBe('a long run of letters and digits')
    expect(whyThisLooksLikeASecret(`${commit}0`)).toBe('a long run of letters and digits')
    expect(whyThisLooksLikeASecret(commit.toUpperCase())).toBe('a long run of letters and digits')
  })

  // MUTATION: in aGeneratedLookingWord, judge the whole word instead of its pieces split at / and ,.
  it('1d: a word is judged piece by piece, split at / and , so a path or a list of record ids is not a secret', () => {
    expect(whyThisLooksLikeASecret('curl /api/records/XqaNTuTUOp6q/revisions')).toBeNull()
    expect(whyThisLooksLikeASecret('echo XqaNTuTUOp6q,7rFbOI0bkbsv,CIEmX5lMaXFS')).toBeNull()
    expect(whyThisLooksLikeASecret(`cat /tmp/${'Zx81Ka92' + 'Lm03Pq74' + 'Rs65Tu56'}`)).toBe('a word that looks generated, as a key is')
  })
})

describe('a line the person typed into the office\'s terminal', () => {
  it('2: is offered when the screen showed it, kept as the person\'s note, and a secretary may cite it in a decision', async () => {
    const shell = await aShell()
    await type(shell.id, 'echo the kiln fires on friday\r', 'the kiln fires on friday\n')
    const offered = await lastLine(shell.id)
    expect(offered.status, JSON.stringify(offered.body)).toBe(200)
    expect(offered.body).toMatchObject({ line: { text: 'echo the kiln fires on friday' }, why: null })

    const kept = await keep(shell.id, 'echo the kiln fires on friday')
    expect(kept.status, JSON.stringify(kept.body)).toBe(201)
    const id = (kept.body['record'] as { id: string }).id
    const record = (await ask(server.api, `/api/records/${id}`)).body['record'] as { kind: string; data: Record<string, unknown> }
    expect(record.kind).toBe('note')
    expect(record.data['body']).toBe('echo the kiln fires on friday')
    expect(String(record.data['typed_in_terminal'])).toContain(`/bin/bash --noprofile --norc in ${place.dir}`)

    const decision = (reference: string) => ({
      kind: 'decision',
      title: 'The kiln fires on Friday',
      data: { replaces: [], decided_by: 'the owner', authority: 'the owner said so', authority_reference: reference, option_taken: 'Friday.', because: 'The person typed it.' },
    })
    const cited = await ask(server.api, '/api/records', { method: 'POST', body: decision(id), headers: AS_QUILL })
    expect(cited.status, JSON.stringify(cited.body)).toBe(201)

    // THE SAME FIELD ON A NOTE AN AGENT WROTE does not make it the person's.
    const forged = await ask(server.api, '/api/records', { method: 'POST', headers: AS_QUILL, body: { kind: 'note', title: 'friday', data: { body: 'friday', typed_in_terminal: 'bash in /x' } } })
    expect(forged.status, JSON.stringify(forged.body)).toBe(201)
    const refused = await ask(server.api, '/api/records', { method: 'POST', body: decision((forged.body['record'] as { id: string }).id), headers: AS_QUILL })
    expect(refused.status, JSON.stringify(refused.body)).toBe(403)
  }, 60_000)

  it('3: typed at a prompt that does not echo, as a password is, is never offered or kept', async () => {
    const shell = await aShell()
    await type(shell.id, "read -s -p 'pw: ' x; echo; echo read-done\r", 'pw: ')
    await type(shell.id, 'plain-words-for-a-password\r', 'read-done')
    const offered = await lastLine(shell.id)
    expect(offered.body).toMatchObject({ line: null, why: 'not-shown' })
    const before = await notes()
    const kept = await keep(shell.id, 'plain-words-for-a-password')
    expect(kept.status, JSON.stringify(kept.body)).toBe(409)
    expect(kept.body['code']).toBe('terminalNoLineToKeep')
    expect(await notes()).toBe(before)
  }, 60_000)

  it('4: that looks like a key is offered and kept, and the offer says it looks like one (round 12)', async () => {
    // A KEY-LIKE LINE IS NOT REFUSED, by answer LBC7EuG5aIqI under the owner's decision. The
    // token is made up.
    const shell = await aShell()
    await type(shell.id, 'echo token=Zx81Ka92Lm03Pq74Rs65Tu56\r', 'token=Zx81Ka92Lm03Pq74Rs65Tu56\n')
    expect((await lastLine(shell.id)).body).toMatchObject({ line: { text: 'echo token=Zx81Ka92Lm03Pq74Rs65Tu56' }, why: null, looksLikeAKey: true })
    const before = await notes()
    const kept = await keep(shell.id, 'echo token=Zx81Ka92Lm03Pq74Rs65Tu56')
    expect(kept.status, JSON.stringify(kept.body)).toBe(201)
    expect(await notes()).toBe(before + 1)
    // AN ORDINARY LINE IS OFFERED WITH NO WARNING.
    await type(shell.id, 'echo plain-words\r', 'plain-words\n')
    expect((await lastLine(shell.id)).body).toMatchObject({ line: { text: 'echo plain-words' }, why: null, looksLikeAKey: false })
  }, 60_000)

  it('5: that changed since the person read it is refused, and nothing is written', async () => {
    const shell = await aShell()
    await type(shell.id, 'echo first-line\r', 'first-line\n')
    expect((await lastLine(shell.id)).body).toMatchObject({ line: { text: 'echo first-line' } })
    await type(shell.id, 'echo second-line\r', 'second-line\n')
    const before = await notes()
    const kept = await keep(shell.id, 'echo first-line')
    expect(kept.status, JSON.stringify(kept.body)).toBe(409)
    expect(kept.body['code']).toBe('terminalLineChanged')
    expect(await notes()).toBe(before)
  }, 60_000)

  it('6: with an arrow key in it is not offered, because the screen can differ from what was sent', async () => {
    const shell = await aShell()
    await type(shell.id, 'echo moved\x1b[D\x1b[C-here\r', 'moved-here\n')
    expect((await lastLine(shell.id)).body).toMatchObject({ line: null, why: 'none' })
  }, 60_000)

  it('7: refuses an agent at both doors with its code', async () => {
    const shell = await aShell()
    const read = await ask(server.api, `/api/terminals/${shell.id}/last-line`, { headers: AS_AN_AGENT })
    expect(read.status, JSON.stringify(read.body)).toBe(403)
    expect(read.body['code']).toBe('terminalsOnlyThePerson')
    const kept = await keep(shell.id, 'anything', AS_AN_AGENT)
    expect(kept.status, JSON.stringify(kept.body)).toBe(403)
    expect(kept.body['code']).toBe('terminalsOnlyThePerson')
  }, 60_000)

  it('8: typed for the person by somebody else is never kept, and the note counts it as typed by somebody else', async () => {
    // KEEPING AS THE TERMINAL OPENS, which is on.
    const opened = await ask(server.api, '/api/terminals', { method: 'POST', body: { folder: place.dir, command: '/bin/bash', args: ['--noprofile', '--norc'], cols: 100, rows: 30 } })
    expect(opened.status, JSON.stringify(opened.body)).toBe(201)
    const shell = opened.body['terminal'] as { id: string; pid: number; keeping: boolean }
    groups.add(shell.pid)
    expect(shell.keeping).toBe(true)
    const typed = await holder(place, { op: 'typeALine', terminal: shell.id, text: 'echo for-the-person-$((8*8))' })
    expect(typed).toMatchObject({ entered: true, linesToTake: 1 })
    await until(() => theStreamsScreen(server.api, shell.id), (lines) => lines.join('\n').includes('for-the-person-64'), 10_000)
    await type(shell.id, 'echo the-persons-own-$((9*9))\r', 'the-persons-own-81')
    const keeping = await until(
      async () => (await ask(server.api, `/api/terminals/${shell.id}/keeping`)).body as { note: { id: string; lines: number; leftOut: Record<string, number> } | null },
      (read) => read.note !== null && read.note.lines === 1 && read.note.leftOut['typedByAnother'] === 1,
      10_000,
    )
    expect(keeping.note).toMatchObject({ lines: 1, leftOut: { typedByAnother: 1, notShown: 0, edited: 0, tooLong: 0 } })
    const note = (await ask(server.api, `/api/records/${keeping.note!.id}`)).body['record'] as { data: Record<string, unknown> }
    expect(note.data['body']).toBe('echo the-persons-own-$((9*9))')
    expect(note.data['left_out_typed_by_another']).toBe(1)
    expect(JSON.stringify(note.data)).not.toContain('for-the-person')
  }, 60_000)
})
