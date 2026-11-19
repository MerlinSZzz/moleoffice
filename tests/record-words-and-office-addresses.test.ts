// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { isOfficeAddress } from '../src/shared/inline.ts'
import { FLAT_ROUTES, RECORD_SECTIONS } from '../src/shared/addresses.ts'

it('accepts office page paths and rejects characters outside the page alphabet', () => {
  for (const target of ['#/r/x"onclick=1', '#/r/x<', '#/r/x>', '#/r/x y', '#/r/x?y=1', '#/r/x\n']) {
    expect(isOfficeAddress(target), target).toBe(false)
  }
  for (const path of ['#/', ...Object.keys(FLAT_ROUTES).map(key => `#/${key}`),
    ...RECORD_SECTIONS.map(section => `#/r/Ab_c-1234567/${section}`),
    '#/plans/Ab_c-1234567/edit', '#/plan/2026-10-04', '#/toolset/named-tests']) {
    expect(isOfficeAddress(path), path).toBe(true)
  }
})
