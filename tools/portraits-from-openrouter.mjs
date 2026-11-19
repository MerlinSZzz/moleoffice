#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ASK AN IMAGE MODEL ON OPENROUTER FOR THE ROLE CARD PORTRAITS, AND WRITE THEM AT 1024 SQUARE.
 *
 *     node tools/portraits-from-openrouter.mjs --all         every portrait that has no file yet
 *     node tools/portraits-from-openrouter.mjs worker         all three of one role
 *     node tools/portraits-from-openrouter.mjs worker 2       one portrait, overwriting what is there
 *     node tools/portraits-from-openrouter.mjs --list         what would be drawn, asking nothing
 *
 * Every form also takes `--out <folder>`, which is the whole output root: the pictures, the
 * reference picture, the runs ledger and the README all live there. Without it the root is
 * public/portraits/, which is the repository's own; a test uses `--out` to write into a folder of
 * its own and to leave the repository untouched.
 *
 * Criterion P47 (design/permissions/ACCEPTANCE.md section 8) asks for three portraits per role in
 * one style, seven roles, twenty-one pictures. This tool is the sibling of
 * `tools/avatars-from-openrouter.mjs`, which draws the 512-square avatars, and it differs from it
 * in four ways, each for a reason:
 *
 * 1. IT KEEPS 1024. A card portrait is drawn larger than an avatar, so nothing is resized, so this
 *    tool does not open a browser and does not need Playwright at all.
 * 2. IT SENDS THE REFERENCE PICTURE WITH THE PROMPT. See the next block.
 * 3. IT HOLDS THE PROMPTS. The scene of each of the twenty-one is in `THE_PORTRAITS` below and the
 *    style paragraph every one of them carries is `STYLE`, so what was asked for is in the
 *    repository rather than in somebody's shell history.
 * 4. IT WRITES DOWN EVERY CALL. `design/portraits/runs.json` gains one entry per request made —
 *    the full prompt, the model, `usage.cost`, the date — and `design/portraits/README.md` is
 *    rendered from that file between its two markers. A picture drawn twice keeps both entries and
 *    the earlier one is marked replaced, so the money spent is the sum of the file and not the sum
 *    of the pictures that survived.
 *
 * ---------------------------------------------------------------------------------------
 * THE REFERENCE PICTURE, AND WHAT THE SERVICE SAID WHEN IT WAS SENT
 * ---------------------------------------------------------------------------------------
 *
 * https://openrouter.ai/docs/features/multimodal/image-generation, read on 6 September 2026, says
 * `POST /api/v1/images` takes `input_references`: an array of `{ type: 'image_url', image_url: {
 * url } }`, where the url may be an HTTP(S) address or a base64 data URL. So
 * `design/portraits/reference/moleagents.png` — their three moles, the picture P47 names — is read
 * off the disk, turned into a `data:image/png;base64,...` url and sent with every prompt. It was
 * tried once before the run and `openai/gpt-image-2` accepted it and returned a picture.
 *
 * THE STYLE IS ALSO CARRIED IN WORDS. `STYLE` describes the reference in sentences and goes in
 * every prompt beside the picture. That is not a fallback for the reference failing — both are
 * sent on every call — it is the belt as well as the braces, because a model that weighs a
 * reference lightly still reads the words.
 *
 * ---------------------------------------------------------------------------------------
 * THE KEY, AND THE MONEY
 * ---------------------------------------------------------------------------------------
 *
 * The key is `OPENROUTER_API_KEY`, read the way the avatar tool reads it: through
 * `loadEnvFileIntoProcess()` in `src/config/settings.mjs`, the one place this repository opens
 * `.env`. It goes into one Authorization header and nowhere else. It is never printed, never
 * logged, and never written into `runs.json` or the README.
 *
 * NO KEY MEANS NO RUN, exit code 2, nothing written. Set-and-empty is refused separately from
 * never-set, because they are different statements.
 *
 * THE SPEND HAS A CEILING. The brief for this work says to stop and report at six US dollars.
 * `CEILING` is that number. Before every request the costs already in `runs.json` are added up,
 * and a run that has reached the ceiling stops with exit code 3 and asks nothing more. The check
 * is before the call and not after it, so the ceiling can be passed by at most one picture.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { loadEnvFileIntoProcess } from '../src/config/settings.mjs'
import { providerKeyFromTheFileThenTheEnvironment } from '../src/config/provider-keys.mjs'
import { localStamp } from '../src/shared/time.ts'
import { aToolRouteToTheProvider } from './provider-router-tool-calls.mjs'

/** Where the portraits, the reference, the run ledger and the README live unless `--out` names another root. */
const DEFAULT_PORTRAITS = fileURLToPath(new URL('../public/portraits/', import.meta.url))

const argv = process.argv.slice(2)
const outAt = argv.indexOf('--out')
if (outAt !== -1 && (argv[outAt + 1] === undefined || argv[outAt + 1] === '')) {
  console.error('--out needs a folder. Nothing was written.')
  process.exit(1)
}
/** The output root: the pictures, the reference, the ledger and the README. */
const PORTRAITS = outAt === -1 ? DEFAULT_PORTRAITS : resolve(argv[outAt + 1])
const args = outAt === -1 ? argv : [...argv.slice(0, outAt), ...argv.slice(outAt + 2)]
const REFERENCE = join(PORTRAITS, 'reference/moleagents.png')
const LEDGER = join(PORTRAITS, 'runs.json')
const README = join(PORTRAITS, 'README.md')

/** The model asked, the side of the square kept, and the most this work may spend in US dollars. */
const MODEL = 'openai/gpt-image-2'
const SIDE = 1024
const CEILING = 6

/** The two markers in the README between which this tool writes, and nowhere else in that file. */
const BLOCK_START = '<!-- runs:start -->'
const BLOCK_END = '<!-- runs:end -->'

/**
 * THE STYLE OF THEIR THREE MOLES, IN WORDS, CARRIED BY EVERY PROMPT.
 *
 * Written by looking at design/portraits/reference/moleagents.png rather than by guessing from its
 * file name.
 */
const STYLE = [
  'Flat cartoon vector illustration in the exact style of the reference picture: one friendly,',
  'slightly chubby anthropomorphic mole, drawn with thick dark navy outlines of even weight and',
  'cel shading in two or three flat tones with no gradients, no airbrushing and no texture.',
  'The mole has dark slate blue-grey fur with a cool blue tint, a soft tan-beige muzzle and a',
  'shiny black rounded nose, tan-beige paws with pale blunt claws, a few fine whiskers, small',
  'round wire-rimmed spectacles, and large white eyes with round black pupils and one white',
  'highlight. Clothes are simple modern work clothes in a muted palette of mid-blue, olive green,',
  'grey and warm yellow. Props are drawn in flat greys, blues and warm browns with the same heavy',
  'outline. Storybook mascot proportions: a large head, short limbs, rounded shapes, a warm and',
  'competent expression. Plain pure white background, no scenery beyond the props named, no',
  'border, no frame, no shadow on the ground beyond a simple flat one.',
  'ABSOLUTELY NO TEXT: no letters, words, numbers, labels, signage, logos, watermark or signature',
  'anywhere in the picture; writing on paper or a screen is only abstract squiggly lines and bars.',
  'Exactly one mole, no second character, no human being, centred in the square.',
].join(' ')

/**
 * THE TWENTY-ONE PORTRAITS: seven roles, three each, and what each one shows.
 *
 * The five agent roles are the cards of design/permissions/roles.json and the props follow what
 * each card says it is for. `administrator` is the ordinary person's card of P45 and the last is
 * the owner's, drawn to the traits their brief named: an engineer of machines working on a two-armed
 * factory machine, touch sensors, grasping and passing things across, a stereo camera, a laptop of
 * terminals — and the administrator of Mole Office. Every one of them is a mole; none is a
 * likeness of a real face.
 *
 * @type {{ role: string, n: number, scene: string }[]}
 */
const THE_PORTRAITS = [
  // WORKER — "It builds one part of one module and reports what it did." Tools at a bench.
  {
    role: 'worker',
    n: 1,
    scene:
      'The mole is a workshop worker standing three-quarter view at a wooden workbench, wearing a ' +
      'warm yellow hard hat with a small round headlamp and a mid-blue work shirt with rolled ' +
      'sleeves. One paw holds a grey spanner and is tightening a bolt on a small grey machine part ' +
      'clamped on the bench; the other paw steadies the part. An open red-brown toolbox with a few ' +
      'screwdrivers sits on the bench beside it. Full body, cheerful and absorbed in the work.',
  },
  {
    role: 'worker',
    n: 2,
    scene:
      'The mole is a workshop worker crouching down on one knee beside a small grey machine, seen ' +
      'from three-quarter view, wearing a yellow hard hat with a headlamp and a blue work shirt ' +
      'under a canvas tool belt full of screwdrivers. One paw turns a socket wrench on the ' +
      'machine, the other holds a small replacement part up to look at it. Two or three spare ' +
      'bolts and a wrench lie neatly on the floor. Full body, concentrating.',
  },
  {
    role: 'worker',
    n: 3,
    scene:
      'The mole is a workshop worker sitting on a low wooden stool at a bench, three-quarter view, ' +
      'wearing a blue work shirt and a yellow hard hat pushed back with clear safety goggles ' +
      'resting on its brim. It holds a finished small metal part up in one paw and inspects it ' +
      'with a satisfied smile; a soldering iron in a stand and a coil of wire are on the bench. ' +
      'Full body, relaxed and pleased with the work.',
  },

  // INVESTIGATOR — "It reads, measures and plans, and it builds nothing." Magnifier, notes, a map.
  {
    role: 'investigator',
    n: 1,
    scene:
      'The mole is an investigator standing in three-quarter view, holding a large round ' +
      'magnifying glass with a brown handle up beside its face and peering through it. It wears ' +
      'an olive-green field jacket with big pockets over a blue shirt, a rolled paper map tucked ' +
      'under the other arm and a small notebook poking out of a pocket. Full body, curious and ' +
      'alert.',
  },
  {
    role: 'investigator',
    n: 2,
    scene:
      'The mole is an investigator crouched over a large unrolled paper map spread on the floor, ' +
      'seen from three-quarter view above, wearing an olive-green field jacket. One paw holds a ' +
      'round magnifying glass over the map, the other holds a yellow pencil about to mark a spot; ' +
      'an open notebook lies beside the map with abstract squiggly lines for notes. Full body, ' +
      'intent.',
  },
  {
    role: 'investigator',
    n: 3,
    scene:
      'The mole is an investigator standing three-quarter view at a cork pinboard, pointing at a ' +
      'pinned paper map with a yellow pencil while several small pinned notes with abstract ' +
      'squiggly lines surround it. It wears an olive-green field jacket over a blue shirt, with a ' +
      'round magnifying glass hanging on a cord around its neck and a small notebook in one paw. ' +
      'Full body, explaining what it found.',
  },

  // SUPERVISOR — "It holds one piece of work, starts the agents that do it, and is answerable."
  {
    role: 'supervisor',
    n: 1,
    scene:
      'The mole is a site supervisor standing three-quarter view holding an olive-green clipboard ' +
      'with a pencil clipped to it in one paw, the other paw raised and pointing to direct the ' +
      'work. It wears a yellow hard hat and a mid-blue work shirt. Behind and smaller: two ' +
      'stacked wooden crates and a short section of grey scaffold. Full body, calm and in charge.',
  },
  {
    role: 'supervisor',
    n: 2,
    scene:
      'The mole is a site supervisor standing on a low wooden platform in three-quarter view, ' +
      'looking out over a very small building site, an olive-green clipboard held against its ' +
      'chest in both paws. It wears a yellow hard hat and a warm yellow high-visibility vest over ' +
      'a blue shirt. Behind and much smaller: a tiny yellow crane and two crates. Full body, ' +
      'watchful and steady.',
  },
  {
    role: 'supervisor',
    n: 3,
    scene:
      'The mole is a site supervisor standing three-quarter view with one paw on its hip and an ' +
      'olive-green clipboard tucked under the other arm, studying a large paper plan pinned to a ' +
      'board, the plan showing only abstract lines and rectangles. It wears a yellow hard hat, a ' +
      'blue work shirt, and a small silver whistle on a cord round its neck. Two orange traffic ' +
      'cones stand beside it. Full body, considering.',
  },

  // SECRETARY — "the one agent whose job is the person". Desk, headset or telephone, in-tray, tidy.
  {
    role: 'secretary',
    n: 1,
    scene:
      'The mole is an office secretary seated three-quarter view at a very tidy wooden desk, ' +
      'wearing a slim black headset with a microphone, a neat mid-blue shirt and a grey ' +
      'waistcoat. One paw rests on an open appointment book of blank ruled pages, the other holds ' +
      'a pen. On the desk: a wire in-tray with a neat stack of papers and a cup of pens, all ' +
      'squared up. Upper body and desk, attentive and welcoming.',
  },
  {
    role: 'secretary',
    n: 2,
    scene:
      'The mole is an office secretary standing three-quarter view beside a tidy wooden desk, ' +
      'holding the handset of an old grey corded telephone to its ear with one paw and a small ' +
      'slip of paper with abstract squiggly writing in the other. It wears a neat mid-blue shirt ' +
      'and a grey waistcoat. On the desk: the telephone base, a wire in-tray and a wire out-tray, ' +
      'both tidy. Full body, listening carefully.',
  },
  {
    role: 'secretary',
    n: 3,
    scene:
      'The mole is an office secretary seated three-quarter view at a tidy wooden desk, sorting ' +
      'letters into a two-level wire in-tray with both paws, wearing a slim black headset and a ' +
      'soft olive-green cardigan over a blue shirt. On the desk: a small grey desk lamp switched ' +
      'on with a warm glow, and a neat stack of grey folders. Upper body and desk, quick and ' +
      'unhurried at once.',
  },

  // INSPECTOR — "It checks whether a started agent's work followed the rules." Checklist, stamp, lamp.
  {
    role: 'inspector',
    n: 1,
    scene:
      'The mole is an inspector standing three-quarter view, holding a long paper checklist of ' +
      'abstract ruled lines and small tick boxes in one paw and marking a tick with a yellow ' +
      'pencil in the other. It wears a grey-blue jacket over a blue shirt and its small round ' +
      'spectacles are pushed down its snout so it can look over them. A small silver handheld ' +
      'torch is clipped to its breast pocket. Full body, exacting but kindly.',
  },
  {
    role: 'inspector',
    n: 2,
    scene:
      'The mole is an inspector leaning over a plain wooden desk in three-quarter view, pressing a ' +
      'round wooden rubber stamp down onto a sheet of paper with one paw, a checklist of abstract ' +
      'ruled lines lying beside it. A grey desk lamp is switched on above with a warm pool of ' +
      'light. It wears a grey-blue jacket and round spectacles. Upper body and desk, decisive.',
  },
  {
    role: 'inspector',
    n: 3,
    scene:
      'The mole is an inspector standing three-quarter view with a small silver torch raised in ' +
      'one paw, its beam a pale flat cone shining onto a grey machine housing it is examining. An ' +
      'olive-green clipboard with a checklist of abstract ruled lines is tucked under the other ' +
      'arm and a round wooden stamp sits in its breast pocket. It wears a grey-blue jacket and ' +
      'round spectacles. Full body, searching.',
  },

  // ADMINISTRATOR — the ordinary person's card: "<name>, administrator of the Office".
  {
    role: 'administrator',
    n: 1,
    scene:
      'The mole is the administrator of an office, standing three-quarter view in front of a big ' +
      'wooden desk, holding up a large iron ring of three brass keys in one paw. It wears a smart ' +
      'grey waistcoat over a mid-blue shirt with the sleeves rolled. Behind, smaller and simply ' +
      'drawn, is a small square office building with plain windows. Full body, welcoming and ' +
      'responsible.',
  },
  {
    role: 'administrator',
    n: 2,
    scene:
      'The mole is the administrator of an office, seated three-quarter view behind a big wooden ' +
      'desk with both paws resting on an open ledger of blank ruled pages. A large iron ring of ' +
      'brass keys lies on the desk beside a cup of pens. Through a plain window behind it, drawn ' +
      'small and simply, is a small square office building. It wears a grey waistcoat over a blue ' +
      'shirt. Upper body and desk, settled and in charge.',
  },
  {
    role: 'administrator',
    n: 3,
    scene:
      'The mole is the administrator of an office, standing three-quarter view turning a large ' +
      'brass key in the lock of a plain wooden door, a canvas satchel over one shoulder and the ' +
      'rest of the key ring hanging from its paw. It wears a grey waistcoat over a mid-blue ' +
      'shirt. Behind, smaller and simply drawn, is a small square office building. Full body, ' +
      'arriving to open up for the day.',
  },

  // THE OWNER — engineer of machines and the administrator of Mole Office. They pick one of these three.
  {
    role: 'owner',
    n: 1,
    scene:
      'The mole is an engineer who builds machines, standing three-quarter view beside a two-armed factory ' +
      'machine: one white-and-grey torso on a bench with two slim articulated arms, each ending in ' +
      'a small two-finger parallel clamp. One paw adjusts a clamp finger, the other holds a ' +
      'small hex key. An open laptop on the bench shows two dark terminal windows of abstract ' +
      'pale green squiggly lines. It wears a mid-blue work shirt with rolled sleeves and round ' +
      'spectacles, with a small ring of brass keys clipped to its belt. Full body, absorbed and ' +
      'happy.',
  },
  {
    role: 'owner',
    n: 2,
    scene:
      'The mole is an engineer who builds machines, sitting three-quarter view at a laboratory bench, holding a ' +
      'small square touch sensor pad with a soft gel face up in one paw and studying it. On the ' +
      'bench an open laptop shows three dark terminal windows of abstract pale green squiggly ' +
      'lines, and a slim black stereo camera bar with two round lenses stands on a small tripod ' +
      'pointed at the bench. Behind, a little smaller, stands a white two-armed machine with two ' +
      'clamps. It wears a mid-blue work shirt and round spectacles. Full body, thinking.',
  },
  {
    role: 'owner',
    n: 3,
    scene:
      'The mole is an engineer of machines standing three-quarter view holding out a small wooden ' +
      'block towards the open two-finger claw of a white two-armed factory machine, in the ' +
      'middle of passing it across. A slim black stereo camera bar with two round lenses on a stand ' +
      'watches from the side, and an open laptop with a dark terminal window of abstract pale ' +
      'green squiggly lines sits on the bench behind. It wears a mid-blue work shirt, round ' +
      'spectacles, and a ring of brass keys on its belt. Full body, careful and pleased.',
  },
]

/** @typedef {{ file: string, role: string, n: number, run: number, at: string, model: string, referenceSent: boolean, cost: number | null, bytes: number, prompt: string, replaced: boolean }} RunEntry */

/**
 * WHAT HAS BEEN ASKED FOR SO FAR. An empty ledger is a file that is not there yet, and that is not
 * an error; anything else that will not parse is, because guessing at it would lose the spend.
 *
 * @returns {RunEntry[]}
 */
function readLedger() {
  if (!existsSync(LEDGER)) return []
  const text = readFileSync(LEDGER, 'utf8')
  const held = JSON.parse(text)
  if (!Array.isArray(held)) {
    throw new Error(`${LEDGER} holds ${typeof held} and this tool writes an array. It was not changed.`)
  }
  return held
}

/** @param {RunEntry[]} entries */
function writeLedger(entries) {
  writeFileSync(LEDGER, `${JSON.stringify(entries, null, 2)}\n`)
}

/**
 * WHAT HAS BEEN SPENT, IN US DOLLARS, COUNTING THE PICTURES THAT WERE THROWN AWAY.
 *
 * A reply that carried no `usage.cost` is stored as null and counted as zero here, which understates
 * the spend; the README says which runs those were, so the understatement is visible rather than
 * silent. On 6 September 2026 every reply carried one.
 *
 * @param {RunEntry[]} entries
 */
function spentSoFar(entries) {
  return entries.reduce((total, entry) => total + (entry.cost ?? 0), 0)
}

/** The whole prompt sent for one portrait: the style paragraph, then the scene. @param {{ scene: string }} portrait */
function promptFor(portrait) {
  return `${STYLE} ${portrait.scene}`
}

/** The README table and the per-picture sections, rendered from the ledger. @param {RunEntry[]} entries */
function renderBlock(entries) {
  const kept = entries.filter((entry) => !entry.replaced)
  const total = spentSoFar(entries)
  const noCost = entries.filter((entry) => entry.cost === null).length

  const lines = [
    BLOCK_START,
    '',
    '*Everything from here to the end of this file is written by',
    '`tools/portraits-from-openrouter.mjs` out of the ledger beside this file. Edit the tool or the',
    'ledger, not this block.*',
    '',
    '## Every request made',
    '',
    `${String(entries.length)} request${entries.length === 1 ? '' : 's'} to the image model,`,
    `${String(kept.length)} picture${kept.length === 1 ? '' : 's'} kept, **$${total.toFixed(4)}** spent in all` +
      `${noCost === 0 ? '' : `, and ${String(noCost)} of them came back with no \`usage.cost\`, so the real spend is higher than that`}.`,
    'A row marked replaced is a picture that was drawn again; its money was still spent.',
    '',
    '| Picture | Run | Date | Model | Reference sent | `usage.cost` | Kept |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ]
  for (const entry of entries) {
    lines.push(
      `| \`${entry.file}\` | ${String(entry.run)} | ${entry.at.slice(0, 10)} | \`${entry.model}\` | ` +
        `${entry.referenceSent ? 'yes' : 'no'} | ` +
        `${entry.cost === null ? 'not reported' : `$${entry.cost.toFixed(4)}`} | ` +
        `${entry.replaced ? 'replaced' : 'yes'} |`,
    )
  }

  lines.push('', '## The prompt each picture was drawn from', '')
  lines.push(
    'Every prompt is the same style paragraph followed by that picture\'s own scene. Both halves are',
    'printed here in full, exactly as they were sent.',
    '',
  )
  for (const entry of entries) {
    lines.push(
      `### \`${entry.file}\`, run ${String(entry.run)}${entry.replaced ? ' (replaced)' : ''}`,
      '',
      `Asked of \`${entry.model}\` on ${entry.at.slice(0, 10)} at ${String(SIDE)} by ${String(SIDE)}, ` +
        `${entry.referenceSent ? 'with the reference picture sent as `input_references`' : 'with no reference picture'}, ` +
        `${entry.cost === null ? 'and the reply carried no `usage.cost`' : `and it cost $${entry.cost.toFixed(4)}`}. ` +
        `${String(entry.bytes)} bytes came back.`,
      '',
      '```text',
      entry.prompt,
      '```',
      '',
    )
  }
  lines.push(BLOCK_END, '')
  return lines.join('\n')
}

/** Put the rendered block back into the README, between its markers and nowhere else. @param {RunEntry[]} entries */
function writeReadme(entries) {
  if (!existsSync(README)) {
    throw new Error(
      `${README} does not exist. This tool writes only between ${BLOCK_START} and ${BLOCK_END} in a ` +
        'README somebody wrote; it does not invent the prose around them.',
    )
  }
  const text = readFileSync(README, 'utf8')
  const from = text.indexOf(BLOCK_START)
  const to = text.indexOf(BLOCK_END)
  if (from === -1 || to === -1 || to < from) {
    throw new Error(
      `${README} has no ${BLOCK_START} ... ${BLOCK_END} block, so there is nowhere to write the runs. ` +
        'It was not changed.',
    )
  }
  writeFileSync(README, text.slice(0, from) + renderBlock(entries) + text.slice(to + BLOCK_END.length + 1))
}

// ------------------------------------------------------------------------------------------------
// WHAT WAS ASKED OF THIS RUN
// ------------------------------------------------------------------------------------------------

if (args.length === 0) {
  console.error(
    'Usage: node tools/portraits-from-openrouter.mjs [--out <folder>] --all | --list | <role> [n]. Nothing was written.\n' +
      `Roles: ${[...new Set(THE_PORTRAITS.map((p) => p.role))].join(', ')}.`,
  )
  process.exit(1)
}

/** @type {typeof THE_PORTRAITS} */
let wanted
if (args[0] === '--list') {
  for (const portrait of THE_PORTRAITS) {
    console.log(`${portrait.role}-${String(portrait.n)}: ${portrait.scene.slice(0, 100)}...`)
  }
  process.exit(0)
} else if (args[0] === '--all') {
  // Only the ones with no file yet, so a run that stopped can be started again without paying twice
  // for what it already drew. A picture is redrawn by naming it.
  wanted = THE_PORTRAITS.filter((p) => !existsSync(join(PORTRAITS, p.role, `${p.role}-${String(p.n)}.png`)))
  if (wanted.length === 0) {
    console.log('Every portrait already has a file, so nothing was asked for. Name one to draw it again.')
    process.exit(0)
  }
} else {
  const [role, which] = args
  const ofThatRole = THE_PORTRAITS.filter((p) => p.role === role)
  if (ofThatRole.length === 0) {
    console.error(
      `"${String(role)}" is not one of the roles. Nothing was written. ` +
        `They are: ${[...new Set(THE_PORTRAITS.map((p) => p.role))].join(', ')}.`,
    )
    process.exit(1)
  }
  if (which === undefined) {
    wanted = ofThatRole
  } else {
    const found = ofThatRole.filter((p) => String(p.n) === which)
    if (found.length === 0) {
      console.error(`${role} has no portrait ${which}; it has 1 to ${String(ofThatRole.length)}. Nothing was written.`)
      process.exit(1)
    }
    wanted = found
  }
}

// `.env` is read here, through the one reader this repository has, and never opened directly.
//
// THE OFFICE'S OWN KEY FILE IS READ FIRST, and the environment line only when nothing is set there.
// A key set on the Settings page is the office's own and takes precedence; the environment line is
// what keeps an installation that already had one in `.env` working. The line below says which store
// it used, and never the key.
const envFile = loadEnvFileIntoProcess()
// THE ROUTE AT THE OFFICE'S OWN ADDRESS IS TRIED FIRST. A run that holds its own key mints one tool token for this
// model and the office carries every picture request; an older office answers 404 and the tool uses the key file.
// ONLY THE UNPRICED-MODEL REFUSAL FALLS BACK. When the office cannot price this model's spend against its cap, it
// answers 409 and this tool says why and then uses the office key file. Every other refusal — a missing, wrong or
// ended token, a router that is off, an over-cap run — exits here and never falls back.
const atTheRouter = await aToolRouteToTheProvider({
  provider: 'openrouter', model: MODEL, endpoints: ['/images'], fallBackWhenUnpriced: true,
})
if (atTheRouter.refused === true) {
  console.error(`The portraits were not asked for and nothing was written. ${atTheRouter.why}`)
  process.exit(2)
}
const route = atTheRouter.route
let key = null
if (atTheRouter.unpricedModel === true) {
  console.log(`The office would not price this model's spend, so no tool token was minted. It said: ${atTheRouter.why}`)
  console.log('This tool uses the office key file instead.')
}
if (route === null) {
  const from = providerKeyFromTheFileThenTheEnvironment('openrouter', ['OPENROUTER_API_KEY'])
  if (from.value === null) {
    console.error(
      (from.empty
        ? 'OPENROUTER_API_KEY is set to an empty value, which is not a key, so no image model was asked and nothing was written. '
        : 'OPENROUTER_API_KEY is not set, so no image model was asked and nothing was written. ') +
        `Set it on the Settings page of Mole Office, or put it in the environment or in ` +
        `${envFile.path}${envFile.found ? '.' : ', which does not exist yet.'}` +
        (from.why === null ? '' : ` (${from.why})`),
    )
    process.exit(2)
  }
  // WHICH STORE IT CAME FROM, so a person can tell a key set here from one set in `.env`. Not the key.
  console.log(`Using the OpenRouter key from ${from.from}.`)
  if (atTheRouter.olderOffice === true) console.log('The office has no tool-token door, so this run uses the office key file as before.')
  key = from.value
} else {
  console.log(`Using the provider router at ${route.office}, with a tool token minted for this run.`)
}

if (!existsSync(REFERENCE)) {
  console.error(`The reference picture ${REFERENCE} is not there, so nothing was asked and nothing was written.`)
  process.exit(1)
}
const referenceDataUrl = `data:image/png;base64,${readFileSync(REFERENCE).toString('base64')}`

// ------------------------------------------------------------------------------------------------
// THE RUN
// ------------------------------------------------------------------------------------------------

let ledger = readLedger()
let askedThisRun = 0

for (const portrait of wanted) {
  const file = `${portrait.role}/${portrait.role}-${String(portrait.n)}.png`
  const already = spentSoFar(ledger)
  if (already >= CEILING) {
    console.error(
      `STOPPED AT THE CEILING. $${already.toFixed(4)} has been spent and the ceiling is $${String(CEILING)}, so ` +
        `${file} and everything after it was not asked for. ${String(askedThisRun)} picture` +
        `${askedThisRun === 1 ? ' was' : 's were'} drawn in this run.`,
    )
    process.exit(3)
  }

  const prompt = promptFor(portrait)
  const imagesAddress = 'https://openrouter.ai/api/v1/images'
  const imageRequest = {
    method: 'POST',
    headers: {
      // The only place the key is used, and the route replaces it with the router's own Authorization.
      ...(key === null ? {} : { authorization: `Bearer ${key}` }),
      'content-type': 'application/json',
      'http-referer': 'https://github.com/mole-office',
      'x-title': 'Mole Office role card portraits',
    },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      n: 1,
      size: `${String(SIDE)}x${String(SIDE)}`,
      input_references: [{ type: 'image_url', image_url: { url: referenceDataUrl } }],
    }),
  }
  const reply = route === null ? await fetch(imagesAddress, imageRequest) : await route.fetch(imagesAddress, imageRequest, 300_000)

  if (!reply.ok) {
    // The body is printed because OpenRouter's refusals say what is wrong. It never contains the
    // key: the key travels in a header, and a header is not echoed back.
    const said = await reply.text()
    console.error(
      `OpenRouter refused ${file} with ${String(reply.status)}. That picture was not written and this run ` +
        `stopped after ${String(askedThisRun)}. It said: ${said.slice(0, 600)}`,
    )
    process.exit(1)
  }

  /** @type {{ data?: { b64_json?: string, media_type?: string }[], usage?: { cost?: number } }} */
  const answer = await reply.json()
  const first = answer.data?.[0]
  if (first?.b64_json === undefined) {
    console.error(
      `OpenRouter answered 200 for ${file} but the reply carried no image in data[0].b64_json, so nothing was ` +
        `written and this run stopped. It held: ${JSON.stringify(Object.keys(answer)).slice(0, 200)}`,
    )
    process.exit(1)
  }
  if (first.media_type !== undefined && first.media_type !== 'image/png') {
    console.error(
      `That model returned ${first.media_type} for ${file} and this tool writes PNG, so nothing was written.`,
    )
    process.exit(1)
  }

  const bytes = Buffer.from(first.b64_json, 'base64')
  const to = join(PORTRAITS, file)
  mkdirSync(dirname(to), { recursive: true })
  writeFileSync(to, bytes)
  askedThisRun += 1

  // The picture that was there before this one is still a thing that was paid for, so its entry
  // stays and is marked replaced rather than deleted.
  const runsBefore = ledger.filter((entry) => entry.file === file)
  for (const entry of runsBefore) entry.replaced = true
  ledger = [
    ...ledger,
    {
      file,
      role: portrait.role,
      n: portrait.n,
      run: runsBefore.length + 1,
      at: localStamp(new Date()), // local wall-clock time, chapter 4 rule 8 (acceptance finding 63)
      model: MODEL,
      referenceSent: true,
      cost: answer.usage?.cost ?? null,
      bytes: bytes.length,
      prompt,
      replaced: false,
    },
  ]
  writeLedger(ledger)
  writeReadme(ledger)

  const cost = answer.usage?.cost
  console.log(
    `${file}: ${MODEL} -> ${to} (${String(bytes.length)} bytes at ${String(SIDE)} square). ` +
      `${cost === undefined ? 'The reply carried no usage.cost, so this one is unknown.' : `Cost $${cost.toFixed(4)}.`} ` +
      `Spent in all: $${spentSoFar(ledger).toFixed(4)}.`,
  )
}

console.log(
  `Done: ${String(askedThisRun)} picture${askedThisRun === 1 ? '' : 's'} asked for and written. ` +
    `$${spentSoFar(ledger).toFixed(4)} spent across every run in ${LEDGER}, ceiling $${String(CEILING)}.`,
)
