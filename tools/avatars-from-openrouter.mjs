#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ASK AN IMAGE MODEL ON OPENROUTER FOR ONE AVATAR, AND WRITE IT AS A 512 BY 512 PNG.
 *
 *     node tools/avatars-from-openrouter.mjs <name> "<what to draw>" [--out <folder>]
 *
 * By default the picture is written to public/avatars/generated/<name>.png; `--out <folder>` writes it
 * there instead, which is how a test starts this tool with a stand-in output folder. Criterion M30 says
 * a tool generates pictures with an image model when a key is present and never runs without one.
 *
 * ---------------------------------------------------------------------------------------
 * THE KEY, AND WHY IT IS NOT READ THE WAY EVERY OTHER SETTING IS READ
 * ---------------------------------------------------------------------------------------
 *
 * `readSetting` in src/config/settings.mjs REFUSES A NAME THAT IS NOT DECLARED THERE, on purpose:
 * a typo in a caller is a refusal rather than a silent `undefined`. `OPENROUTER_API_KEY` is not one
 * of the `MOLE_OFFICE_` settings, and it is not declared there — it is a secret belonging to an
 * outside service, and what the settings module reports is served to a page by `GET /api/runtime`.
 *
 * A CREDENTIAL IS DECLARED THERE NOW, AND HERE IS WHAT CHANGED. On 6 September 2026 the three
 * settings a Kimi CLI run needs, and the name the owner keeps their Moonshot key under, were declared
 * in `src/config/settings.mjs`, because nothing said how a Kimi run got a key and the owner's key
 * did nothing (problem oY8Vs5feaRai). Declaring a NAME is not serving a VALUE: `settingsFrom` names
 * the eight settings whose source `GET /api/runtime` reports and those four are not among them, and
 * `tests/the-product-knows-its-own-runtime.test.ts` fails if a key's value reaches that record at
 * any depth. This tool was not changed with them: nothing needed it to be, and reading a key it
 * already reads a different way would be a change with no reason. If somebody declares
 * `OPENROUTER_API_KEY` later, the sentence to keep is the one about values, not the one about names.
 *
 * So this tool uses the OTHER half of that module: `loadEnvFileIntoProcess()`, which is the one and
 * only place this repository reads `.env`, and then reads `process.env`. The module's own comment
 * names that case — "a CHILD PROCESS does, and so does anything reading `process.env` for a setting
 * that is not one of ours". Nothing here opens `.env` itself.
 *
 * THE KEY IS NEVER PRINTED, LOGGED OR WRITTEN DOWN. It goes into one Authorization header and
 * nowhere else. No error message here includes it, no file written here contains it, and the
 * request body is never dumped. `.env` is git-ignored, so the key is not in this repository.
 *
 * NO KEY MEANS NO RUN. One sentence, exit code 2, nothing written. A key set to an empty string is
 * refused too, and says so differently: set-and-empty and never-set are different statements, which
 * is the rule src/config/settings.mjs states for every other setting.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT OPENROUTER'S DOCUMENTATION SAYS, READ ON 4 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * From https://openrouter.ai/docs/features/multimodal/image-generation and the live model list at
 * https://openrouter.ai/api/v1/models?output_modality=image (both read on 4 September 2026):
 *
 * - THE ENDPOINT IS `POST https://openrouter.ai/api/v1/images`. It is its own endpoint, not chat
 *   completions. The body needs `model` and `prompt`; `n`, `size`, `aspect_ratio`, `quality`,
 *   `output_format`, `stream`, `input_references` and `provider` are optional.
 * - THE PICTURE COMES BACK AS BASE64 IN THE BODY, not as a link: `data` is an array and each entry
 *   holds `b64_json` (the bytes) and `media_type` (`"image/png"`, and `"image/svg+xml"` for the
 *   vector models). Nothing has to be fetched afterwards.
 * - WHAT IT COST IS IN THE SAME REPLY: `usage.cost`, in US dollars, beside `prompt_tokens`,
 *   `completion_tokens` and `total_tokens`. The docs say image billing is all-or-nothing — a
 *   generation either completes and is billed in full or fails and is not billed at all.
 * - WHICH MODELS RETURN IMAGES: ask `GET /api/v1/models?output_modality=image` (50 on that date) or
 *   `GET /api/v1/images/models`. The docs name `openai/gpt-image-2`, `openai/gpt-image-1`,
 *   `bytedance-seed/seedream-4.5`, `google/gemini-2.5-flash-image`, `black-forest-labs/flux.2-pro`
 *   and the Recraft vector models.
 *
 * THE MODEL THIS TOOL ASKS is `openai/gpt-image-2`, named in those docs and present in the live
 * list. It was chosen for flat, bold-outlined cartoon work and for its price: `image_output` was
 * $0.00003 per output token on 4 September 2026.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS TOOL HAS ACTUALLY RUN
 * ---------------------------------------------------------------------------------------
 *
 * RUN ON 4 SEPTEMBER 2026 against the real service, with the owner's key, in two rounds. Forty-two
 * pictures were asked for and forty-two came back, all from `openai/gpt-image-2` at 1024 by 1024,
 * resized here to 512. Forty-one are kept: one of two spring onions was the weaker and was deleted.
 *
 * The whole spend is **$0.3668**, read from `usage.cost` in each reply: ten in the first round for
 * $0.0995, thirty-two in the second for $0.2673. Each picture cost between $0.0062 and $0.0137, and
 * which of those two it is has nothing to do with the subject — it is how many tokens the model
 * spent thinking. design/avatars/README.md says what every one of them shows.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { chromium } from 'playwright'
import { loadEnvFileIntoProcess } from '../src/config/settings.mjs'
import { providerKeyFromTheFileThenTheEnvironment } from '../src/config/provider-keys.mjs'
import { aToolRouteToTheProvider } from './provider-router-tool-calls.mjs'

/** Where a generated picture is written unless `--out` names another folder. */
const DEFAULT_OUT = fileURLToPath(new URL('../public/avatars/generated/', import.meta.url))

/** The model asked, and the side of the square written out. */
const MODEL = 'openai/gpt-image-2'
const SIDE = 512

const argv = process.argv.slice(2)
const outAt = argv.indexOf('--out')
if (outAt !== -1 && (argv[outAt + 1] === undefined || argv[outAt + 1] === '')) {
  console.error('--out needs a folder. Nothing was written.')
  process.exit(1)
}
const OUT = outAt === -1 ? DEFAULT_OUT : resolve(argv[outAt + 1])
const [name, prompt] = outAt === -1 ? argv : [...argv.slice(0, outAt), ...argv.slice(outAt + 2)]
if (name === undefined || prompt === undefined || name === '' || prompt === '') {
  console.error('Usage: node tools/avatars-from-openrouter.mjs <name> "<what to draw>" [--out <folder>]. Nothing was written.')
  process.exit(1)
}
if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
  console.error(`"${name}" is not a usable file name: use lower-case letters, digits and hyphens. Nothing was written.`)
  process.exit(1)
}

// `.env` is read here, through the one reader this repository has, and never opened directly.
//
// THE OFFICE'S OWN KEY FILE IS READ FIRST, and the environment line only when nothing is set there.
// A key set on the Settings page is the office's own and takes precedence; the environment line is
// what keeps an installation that already had one in `.env` working. The line below says which store
// it used, and never the key.
const envFile = loadEnvFileIntoProcess()
// THE ROUTE AT THE OFFICE'S OWN ADDRESS IS TRIED FIRST. A run that holds its own key mints a tool token for this model
// and the office carries the request; an older office answers 404 and this tool uses the key file as before.
// ONLY THE UNPRICED-MODEL REFUSAL FALLS BACK. When the office cannot price this model's spend against its cap, it
// answers 409 and this tool says why and then uses the office key file. Every other refusal — a missing, wrong or
// ended token, a router that is off, an over-cap run — exits here and never falls back.
const atTheRouter = await aToolRouteToTheProvider({
  provider: 'openrouter', model: MODEL, endpoints: ['/images'], fallBackWhenUnpriced: true,
})
if (atTheRouter.refused === true) {
  console.error(`The image model was not asked and nothing was written. ${atTheRouter.why}`)
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

const imagesAddress = 'https://openrouter.ai/api/v1/images'
const imageRequest = {
  method: 'POST',
  headers: {
    // The only place the key is used, and the route replaces it with the router's own Authorization.
    ...(key === null ? {} : { authorization: `Bearer ${key}` }),
    'content-type': 'application/json',
    'http-referer': 'https://github.com/mole-office',
    'x-title': 'Mole Office avatars',
  },
  body: JSON.stringify({ model: MODEL, prompt, n: 1, size: '1024x1024' }),
}
const reply = route === null ? await fetch(imagesAddress, imageRequest) : await route.fetch(imagesAddress, imageRequest, 300_000)

if (!reply.ok) {
  // The body is printed because OpenRouter's refusals say what is wrong. It never contains the key:
  // the key travels in a header, and a header is not echoed back.
  const said = await reply.text()
  console.error(`OpenRouter refused with ${String(reply.status)}. Nothing was written. It said: ${said.slice(0, 600)}`)
  process.exit(1)
}

/** @type {{ data?: { b64_json?: string, media_type?: string }[], usage?: { cost?: number } }} */
const answer = await reply.json()
const first = answer.data?.[0]
if (first?.b64_json === undefined) {
  console.error(
    `OpenRouter answered 200 but the reply carried no image in data[0].b64_json, so nothing was written. ` +
      `It held: ${JSON.stringify(Object.keys(answer)).slice(0, 200)}`,
  )
  process.exit(1)
}
if (first.media_type !== undefined && first.media_type !== 'image/png') {
  console.error(
    `That model returned ${first.media_type} and this tool writes PNG, so nothing was written. The avatar route ` +
      'takes png, jpeg and webp only.',
  )
  process.exit(1)
}

const asSent = Buffer.from(first.b64_json, 'base64')

// RESIZED HERE, WITH THE PLAYWRIGHT THIS CHECKOUT ALREADY HAS. Models return 1024 and an avatar is
// wanted at 512; adding an image library for one `drawImage` would be a dependency for nothing.
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: SIDE, height: SIDE }, deviceScaleFactor: 1 })
const resized = await page.evaluate(async ([dataUrl, side]) => {
  const img = new Image()
  await new Promise((ok, no) => {
    img.onload = ok
    img.onerror = () => { no(new Error('the bytes OpenRouter sent did not decode as an image')) }
    img.src = String(dataUrl)
  })
  const canvas = document.createElement('canvas')
  canvas.width = Number(side)
  canvas.height = Number(side)
  const flat = canvas.getContext('2d')
  if (flat === null) throw new Error('no 2d context')
  flat.drawImage(img, 0, 0, Number(side), Number(side))
  return canvas.toDataURL('image/png')
}, [`data:image/png;base64,${first.b64_json}`, SIDE])
await browser.close()

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })
const to = join(OUT, `${name}.png`)
writeFileSync(to, Buffer.from(resized.slice('data:image/png;base64,'.length), 'base64'))

const cost = answer.usage?.cost
console.log(
  `${name}: ${MODEL} -> ${to} (${String(asSent.length)} bytes as sent, written at ${String(SIDE)} square). ` +
    `Cost: ${cost === undefined ? 'the reply carried no usage.cost, so this run cost is unknown' : `$${cost.toFixed(4)}`}`,
)
