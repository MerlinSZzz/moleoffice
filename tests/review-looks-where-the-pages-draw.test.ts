// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * REVIEW LOOKS WHERE THE PAGES DRAW NOW. Problem OEt2jBpK3Glq (3 October 2026, from wave 13j's round 27b,
 * report CRfHytzOtE89): three of the four proofs of `node tools/review.mjs` and its graph pictures failed on main,
 * because two pages moved on 29 September and the review did not follow them. The project drawing left `#/pipeline` for
 * its own address, and Home began to draw its sessions block only for a developer. These cases pin where the review
 * looks; a real run of the review is what proves the pictures and the proofs.
 *
 * WAVE 13t ROUND 34: the sessions proof failed again on every run. Home stopped drawing sessions at all on 10 October
 * 2026, at c2414ce9d. Since 5 October (decision z_A0xVMbWOzh, 55368cc68) the server's own words
 * about a fault are drawn only in Developer mode. So the proof reads the sessions page alone, and reads its failure
 * there as a developer sees it.
 */
import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEVELOPER_MODE, theProjectDrawingAddress, theSessionsFailureAddress, theSessionsProofAddresses } from '../tools/review.mjs'
import { parseRoute } from '../src/shared/addresses.ts'
import { MODES } from '../src/shared/mode.ts'

const routerSource = ['src/shared/addresses.ts', 'src/web/components/router.tsx']
  .map((file) => readFileSync(join(process.cwd(), file), 'utf8'))
  .join('\n\n')

it('mutation DRAWING_BACK_TO_LIST: the canvas proofs open the project drawing, which the app reads as the drawing', () => {
  const address = theProjectDrawingAddress(routerSource, '#/pipeline')
  expect(parseRoute(address)).toEqual({ name: 'pipeline', drawing: true })
  expect(parseRoute('#/pipeline')).not.toEqual({ name: 'pipeline', drawing: true })
})

it('mutation HOME_HAS_SESSIONS: the sessions proof reads the sessions page alone, and reads its failure as a developer sees it', () => {
  expect(theSessionsProofAddresses()).toEqual([{ address: '#/sessions', label: 'the sessions page' }])
  expect(MODES).toContain(DEVELOPER_MODE)
  const [query, hash] = theSessionsFailureAddress().split('#')
  expect(new URLSearchParams(query).get('mode')).toBe(DEVELOPER_MODE)
  expect(parseRoute(`#${hash}`)).toEqual(parseRoute('#/sessions'))
})
