// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MAIN-WORLD GUARD'S POLICY, AS A TABLE OF COMMANDS IT STOPS AND COMMANDS IT LETS THROUGH.
 *
 * One office guard, the same policy for every runtime, stops the dangerous
 * acts and lets everything else through. The policy is tools/guard/policy.mjs. This file hands it a
 * home, a checkout and an environment of its own making — nothing here is ever run, the policy only
 * reads the command text and the disk — and pins what it answers for each command, including the
 * shapes of 16 September 2026 (HOME=$SH …; rm -rf "$SH" with SH empty or the home;
 * SH=$(cat missing-file); rm -rf ~/).
 *
 * THE MADE-UP HOME IS UNDER THIS CHECKOUT'S GITIGNORED `.cache/`, NOT UNDER /tmp, so the real
 * temporary directory can be what the policy calls temporary, exactly as on the host.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THIS IS WRITTEN AGAINST, each after a control run, each restored after
 * ---------------------------------------------------------------------------------------
 *
 *   drop the empty-variable check in `lookAt` (`e.target.emptyVars.length > 0`)      → 3 red: the empty-SH rows.
 *   drop the home-and-ancestors check in `lookAt` (`at === sep || inside(home, at)`) → 13 red: ~/, ~/*, $THE_HOME….
 *   drop the "reassigns HOME and deletes" rule                                      → 2 red: the incident row, HOME=/tmp/x rm.
 *   drop the keys file (both entries) from `theProtectedPaths`                         → 6 red: the keys rows.
 *   make the rule-4 filter in `lookAt` keep every effect (`return true`)              → 5 red: the /tmp and /dev/null rows.
 *   make `couldTake` answer false (a `find -name` delete never reaches a protected file) → 2 red: the find rows of rule 3.
 *   make `couldTake` answer true (every `find -name` delete reaches one)              → 1 red: the find that cannot reach them.
 *
 * The secretary's exemption is decided from the card by the hook, so its mutation is in
 * tests/the-main-world-guard-hook.test.ts.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { areaReasons, lookAt, theProtectedPaths, type Asker, type World } from '../tools/guard/policy.mjs'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { settingNamed } from '../src/config/settings.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/\/+$/, '')

let scratch = ''
let home = ''
let checkout = ''
let world: World
let temp = ''

const WORKER = (): Asker => ({ exempt: false, role: 'worker', area: ['src/server', 'tests'], root: checkout })
const SECRETARY: Asker = { exempt: true, role: 'secretary' }
const NOBODY_ANSWERED: Asker = { cannot: 'the office did not answer.' }

beforeAll(() => {
  mkdirSync(join(REPO, '.cache'), { recursive: true })
  scratch = aTestDatabaseFolder('guard-policy', join(REPO, '.cache'))
  home = join(scratch, 'home', THE_TEST_OFFICES_OWNER.id)
  checkout = join(home, 'PROJECTS', 'mole-office')
  for (const dir of ['.ssh', '.claude', '.config/mole-office', 'PROJECTS/mole-office/.git', 'PROJECTS/mole-office/data/backups', 'PROJECTS/mole-office/src/server', 'PROJECTS/mole-office/tests', 'PROJECTS/mole-office/dist']) {
    mkdirSync(join(home, dir), { recursive: true })
  }
  for (const file of ['.claude/.credentials.json', '.ssh/config', 'PROJECTS/mole-office/data/keys.json', 'PROJECTS/mole-office/data/panelx.db', 'PROJECTS/mole-office/README.md']) {
    writeFileSync(join(home, file), 'made up for this test\n')
  }
  temp = aTestDatabaseFolder('guard-policy', '/tmp')
  world = {
    home,
    env: { HOME: home, PATH: process.env['PATH'] ?? '/usr/bin', THE_HOME: home, SCRATCH: temp },
    tempRoots: ['/tmp'],
    protectedPaths: theProtectedPaths({
      home,
      keys: join(checkout, 'data', 'keys.json'),
      backups: join(checkout, 'data', 'backups'),
      database: join(checkout, 'data', 'panelx.db'),
    }),
    inContainer: false,
  }
})

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
  rmSync(temp, { recursive: true, force: true })
})

/** What the policy answers for one call, as the asker it names. */
function verdict(tool: string, input: Record<string, unknown>, asker: Asker, cwd = checkout): { stopped: boolean; why: string } {
  const look = lookAt({ tool, input, cwd }, world)
  const reasons = look.reasons.length > 0 ? look.reasons : areaReasons(look.needsTheArea, asker)
  return { stopped: reasons.length > 0, why: reasons.join('\n') }
}

const bash = (command: string, asker: Asker = WORKER()) => verdict('Bash', { command }, asker)

/** A row: the command, and the sentence that must stop it, or null for "let through". */
type Row = [command: string, stoppedBecause: RegExp | null]

describe('the shapes of 16 September 2026 are stopped for everybody', () => {
  const rows: Row[] = [
    ['HOME=$SH npx vitest run tests/the-press-closes-the-window.test.ts', /sets HOME to something that is empty/],
    ['rm -rf "$SH"', /built on \$SH, which is empty or unset/],
    ['rm -rf $SH', /built on \$SH, which is empty or unset/],
    ['rm -rf "$THE_HOME"', /would delete the home directory/],
    ['SH=$(cat missing-file); rm -rf "$SH"', /may be empty: \$\(cat missing-file\)/],
    ['rm -rf ~/', /would delete the home directory/],
    [
      // THE INCIDENT'S OWN COMMAND, with its paths made relative to this made-up home.
      'mkdir -p .scratch\nSH=$(mktemp -d .scratch/home.XXXXXX)\necho "SCRATCH=$SH"\nHOME="$SH" nice -n 19 npx vitest run tests/a.test.ts > .scratch/base.log 2>&1\nrm -rf "$SH"',
      /reassigns HOME and deletes in the same command/,
    ],
  ]
  for (const [command, why] of rows) {
    it(`stops ${JSON.stringify(command).slice(0, 80)}`, () => {
      for (const asker of [WORKER(), SECRETARY]) {
        const got = bash(command, asker)
        expect(got.stopped, `${command} was let through`).toBe(true)
        expect(got.why).toMatch(why as RegExp)
      }
    })
  }

  it('lets the same test run through when its HOME is a real directory and nothing is deleted with it', () => {
    expect(bash('HOME="$SCRATCH" nice -n 19 npx vitest run tests/a.test.ts').stopped).toBe(false)
    expect(bash('HOME="${SCRATCH:?}" npx vitest run tests/a.test.ts').stopped).toBe(false)
    // ${X:?} WITH X EMPTY STOPS THE SHELL before HOME is ever set, which is the advice the guard gives.
    expect(bash('HOME="${SH:?}" npx vitest run tests/a.test.ts').stopped).toBe(false)
  })

  it('lets a delete through once the variable is shown not to be empty', () => {
    expect(bash('rm -rf "${SCRATCH:?}"').stopped).toBe(false)
    expect(bash('[ -n "$Q" ] && rm -rf "$Q"').stopped).toBe(false)
    expect(bash('if [ -d "$Q" ]; then rm -rf "$Q"; fi').stopped).toBe(false)
    expect(bash('D=$(mktemp -d); touch "$D/x"; rm -rf "${D:?}"').stopped).toBe(false)
  })
})

describe('rule 1: the home, its ancestors and the root', () => {
  const rows: Row[] = [
    ['rm -rf ~', /home directory/],
    ['rm -rf ~/*', /everything matching \* directly inside the home directory/],
    ['rm -rf ~/.*', /directly inside the home directory/],
    ['rm -rf "$THE_HOME/.."', /which holds the home directory/],
    ['sudo rm -rf /', /the root of the filesystem/],
    ['cd && rm -rf *', /directly inside the home directory/],
    ['cd $UNSET_DIR && rm -rf *', /directly inside the home directory/],
    ["find ~ -name '*.pyc' -delete", /files anywhere under the home directory/],
    ['bash -c "rm -rf \\"$HOME\\""', /home directory/],
    ['echo $(rm -rf ~/)', /home directory/],
    ['rm -rf "$HOME/$X"', /built on \$X, which is empty or unset/],
    ['nice -n 19 xargs rm -rf < list; rm -rf ~', /home directory/],
  ]
  for (const [command, why] of rows) {
    it(`stops ${JSON.stringify(command)} for a secretary too`, () => {
      const got = bash(command, SECRETARY)
      expect(got.stopped, `${command} was let through`).toBe(true)
      expect(got.why).toMatch(why as RegExp)
    })
  }
})

describe('rule 2: HOME', () => {
  const rows: Row[] = [
    ['unset HOME', /leaves HOME unset/],
    ['env HOME= npm test', /sets HOME to something that is empty/],
    ['export HOME=/ ; ls', /holds the real home|sets HOME to \//],
    ['HOME=/tmp/x rm -rf build', /reassigns HOME and deletes/],
    ['HOME=$(mktemp -d) npm test', /may be empty/],
  ]
  for (const [command, why] of rows) {
    it(`stops ${JSON.stringify(command)}`, () => {
      const got = bash(command, SECRETARY)
      expect(got.stopped, `${command} was let through`).toBe(true)
      expect(got.why).toMatch(why as RegExp)
    })
  }
  it('lets a HOME that is a real directory through', () => {
    expect(bash('export HOME=/tmp/fake-home; npm test', SECRETARY).stopped).toBe(false)
  })
})

describe('rule 3: keys, backups, credentials and the live database', () => {
  const rows: Row[] = [
    ['echo x > data/keys.json', /office's keys file/],
    ['rm -rf data', /keys file .* is inside it|would delete .*data/],
    ['rm -rf data/backups/2026-09-01', /backups/],
    ['cp id_ed25519 ~/.ssh/id_ed25519', /SSH keys/],
    ['echo "Host x" >> ~/.ssh/config', /SSH keys/],
    ['rm ~/.claude/.credentials.json', /credentials/],
    ['rm -rf ~/.claude', /credentials .* is inside it/],
    ['rm -rf ~/.config', /Mole Office's own configuration/],
    ['mv data/panelx.db /tmp/', /live database/],
    ['git clean -fdx', /keys file/],
    ['rm -rf *', /keys file/],
    ["find data -name '*.json' -delete", /keys file/],
    ["find . -iname 'KEYS.*' -delete", /keys file/],
  ]
  for (const [command, why] of rows) {
    it(`stops ${JSON.stringify(command)} for a secretary too`, () => {
      const got = bash(command, SECRETARY)
      expect(got.stopped, `${command} was let through`).toBe(true)
      expect(got.why).toMatch(why as RegExp)
    })
  }
  it('lets reading them, writing to the database through its own program, and a find that cannot reach them, through', () => {
    expect(bash("find . -name '*.tmp' -delete", SECRETARY).stopped).toBe(false)
    expect(bash('cat data/keys.json | head -c 0', SECRETARY).stopped).toBe(false)
    expect(bash("sqlite3 data/panelx.db 'select 1'", SECRETARY).stopped).toBe(false)
    expect(bash('ls ~/.ssh', SECRETARY).stopped).toBe(false)
  })
  it('stops the file tools on them as well', () => {
    expect(verdict('Write', { file_path: join(checkout, 'data', 'keys.json'), content: '{}' }, SECRETARY).stopped).toBe(true)
    expect(verdict('Edit', { file_path: join(home, '.ssh', 'config') }, SECRETARY).stopped).toBe(true)
    expect(verdict('write', { filePath: join(home, '.config', 'mole-office', 'x.env') }, SECRETARY).stopped).toBe(true)
  })
})

describe('rule 4: outside the work area, unless the card says the holder is limited by nothing', () => {
  // [command, stopped for a worker whose area is src/server and tests]
  const rows: [string, boolean][] = [
    ['rm -rf src/server/old', false],
    ['find tests -name "*.snap" -delete', false],
    ['for f in src/server/*.tmp; do rm "$f"; done', false],
    ['rm -rf dist', true],
    ['mv README.md tests/', true],
    ['cat notes > README.md', true],
    ['git reset --hard', true],
    ['git clean -fd', true],
    ['echo hello > a-new-file.txt', false],
    ['echo more >> README.md', false],
    ['rm -rf /tmp/some-scratch-of-mine', false],
    ['D=$(mktemp -d); rm -rf "${D:?}"', false],
    ['npm test > /dev/null 2>&1', false],
  ]
  for (const [command, stopped] of rows) {
    it(`${stopped ? 'stops' : 'lets through'} ${JSON.stringify(command)} for a worker, and lets a secretary do it`, () => {
      const worker = bash(command, WORKER())
      expect(worker.stopped, worker.why).toBe(stopped)
      if (stopped) expect(worker.why).toMatch(/outside your work area \(src\/server, tests/)
      expect(bash(command, SECRETARY).stopped).toBe(false)
    })
  }

  it('reads the file tools and the patch format the same way', () => {
    expect(verdict('Write', { file_path: join(checkout, 'README.md'), content: 'x' }, WORKER()).stopped).toBe(true)
    expect(verdict('Write', { file_path: join(checkout, 'NEW.md'), content: 'x' }, WORKER()).stopped).toBe(false)
    expect(verdict('Edit', { file_path: join(checkout, 'README.md') }, WORKER()).stopped).toBe(false)
    const deletes = (path: string) => ({ command: `*** Begin Patch\n*** Delete File: ${path}\n*** End Patch\n` })
    expect(verdict('apply_patch', deletes('README.md'), WORKER()).stopped).toBe(true)
    expect(verdict('apply_patch', deletes('src/server/old.ts'), WORKER()).stopped).toBe(false)
    // dsh and OpenCode name the shell `bash` and give it a working directory of its own.
    expect(verdict('bash', { command: 'rm -rf dist', workdir: checkout }, WORKER(), '/').stopped).toBe(true)
  })

  it('stops a delete outside the temporary directory when the office cannot say who is asking, and nothing else', () => {
    expect(bash('rm -rf dist', NOBODY_ANSWERED).why).toMatch(/cannot check that against your work area: the office did not answer/)
    expect(bash('ls -la', NOBODY_ANSWERED).stopped).toBe(false)
    expect(bash('rm -rf /tmp/scratch-of-mine', NOBODY_ANSWERED).stopped).toBe(false)
    expect(bash('echo x > a-new-file.txt', NOBODY_ANSWERED).stopped).toBe(false)
  })

  it('treats an agent with no registered area as having nothing inside it', () => {
    const none: Asker = { exempt: false, role: 'supervisor', area: null, root: checkout }
    expect(bash('rm -rf src/server/old', none).why).toMatch(/no registered work area/)
  })
})

describe('rule 5: a kill by pattern, for everybody (problem LD9Yor6qIVVC; decision gP_TJ0FWdg2U, point 3)', () => {
  // Mutations, each alone: rule 5's reasons left out; a kill fed by $(…) or backquotes not read; a kill fed by a
  // pipeline not read; fuser -k not read; the pipeline not ended at ; (`pgrep -f vite; kill 123` goes red).
  // Problem DsxidFiPDaaw's, each alone: a subshell's commands not carried out of its parentheses; the pipeline ended
  // at a subshell's opening parenthesis; a while loop's input not read; a for loop's word list not read; the input
  // written after done not read; a loop not ended at its done (the let-through loop rows go red).
  const stopped = [
    // THE SHAPE OF 4 SEPTEMBER 2026, as a loop over a pattern and as one command. The first loop is the one typed that
    // night; the second sends to the group without a second lister in the kill.
    'for p in $(pgrep -f "src/server/index.ts"); do kill -TERM -$(ps -o pgid= -p $p); done',
    'for p in $(pgrep -f "src/server/index.ts"); do kill -TERM -- -$p; done',
    'pkill -f src/server/index.ts',
    'killall node',
    'sudo pkill -9 tsx',
    'kill $(pgrep -f "src/server/index.ts")',
    'kill -9 `pidof node`',
    'pgrep -f vite | xargs kill',
    "ps aux | grep tsx | awk '{print $2}' | xargs -r kill -9",
    // On the product's default port, as src/config/settings.mjs declares it: the guard stops fuser -k on any port.
    `fuser -k ${String(settingNamed('MOLE_OFFICE_PORT').fallback)}/tcp`,
    'bash -c "pkill -f vite"',
    // A KILL FED THROUGH A SUBSHELL OR A LOOP (problem DsxidFiPDaaw).
    '(pgrep -f vite) | xargs kill',
    'pgrep -f vite | (xargs kill)',
    'pgrep -f vite | while read p; do kill $p; done',
    "ps aux | grep vite | awk '{print $2}' | while read -r p; do kill -9 \"$p\"; done",
    'for p in `pidof node`; do kill $p; done',
    'while read p; do kill $p; done < <(pgrep -f vite)',
    'while read p; do kill $p; done <<< "$(pgrep -f vite)"',
  ]
  for (const command of stopped) {
    it(`stops ${JSON.stringify(command)}`, () => {
      for (const asker of [WORKER(), SECRETARY]) {
        const got = bash(command, asker)
        expect(got.stopped, `${command} was let through`).toBe(true)
        expect(got.why).toContain('is a kill by pattern')
        expect(got.why).toContain('kill -- -<group>, or kill <pid>')
      }
    })
  }
  const letThrough = [
    'kill -- -12345',
    'kill 12345',
    'kill -TERM $(cat .scratch/server.pid)',
    'pgrep -f vite',
    'ps aux | grep vite',
    'cat pids.txt | xargs kill',
    'pgrep -f vite; kill 123',
    '(pgrep -f vite); kill 123',
    'cat pids.txt | while read p; do kill $p; done',
    'for p in $(cat .scratch/pids); do kill $p; done',
    'pgrep -f vite | while read p; do echo $p; done; kill 123',
    'for p in $(pgrep -f vite); do echo $p; done; kill 123',
  ]
  for (const command of letThrough) {
    it(`lets ${JSON.stringify(command)} through`, () => {
      const got = bash(command, SECRETARY)
      expect(got.stopped, got.why).toBe(false)
    })
  }
  it('stands down inside a sandbox, where the container is the wall', () => {
    const look = lookAt({ tool: 'Bash', input: { command: 'pkill -f vite' }, cwd: checkout }, { ...world, inContainer: true })
    expect(look.reasons).toEqual([])
  })
})

describe('everything else is let through', () => {
  const rows = [
    'ls -la',
    'git status && git log --oneline -3',
    'npm run build 2>&1 | tail -5',
    "cat <<'EOF' > /tmp/notes.md\nrm -rf ~\nEOF",
    'grep -rn "rm -rf" tools/',
    'echo "rm -rf ~ is what we never do"',
  ]
  for (const command of rows) {
    it(`lets ${JSON.stringify(command)} through`, () => {
      const got = bash(command)
      expect(got.stopped, got.why).toBe(false)
    })
  }

  it('stands down inside a sandbox, where the container is the wall', () => {
    const look = lookAt({ tool: 'Bash', input: { command: 'rm -rf ~' }, cwd: checkout }, { ...world, inContainer: true })
    expect(look.reasons).toEqual([])
    expect(look.needsTheArea).toEqual([])
  })
})
