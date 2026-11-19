// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NO LINK IN THE PAGE POINTS AT `#/record/<id>`, AN ADDRESS WITH NO PAGE. Problem oo4K1xWfb_5d.
 *
 * A record's page is `#/r/<id>`, built by `recordPath` in src/web/components/router.tsx. On 28 September
 * 2026 two links wrote the address by hand as `#/record/<id>`: the filed problem's link in TheFault.tsx
 * and "Open the group" in TheCheckOnARun.tsx. Each opened a page saying there is no such page. Both
 * now build it through the router (wave 13q round 9b, and wave 13k round 14 for the check panel).
 *
 * This reads every source file under src/web and fails, naming the file and the line, if any of them
 * writes `#/record/` or builds `/record/${…}` outside an API path. It also checks that the router's
 * own address for a record is still `/r/<id>`, so the test cannot pass by the router changing instead.
 *
 * MUTATION, red: in src/web/components/TheFault.tsx, write the filed problem's link as
 * `#/record/${theProblem}` again.
 */
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { recordPath } from '../src/web/components/router.tsx'

/** Every .ts, .tsx and .css file under a folder. */
function sourcesUnder(folder: string): string[] {
  const found: string[] = []
  for (const name of readdirSync(folder)) {
    const path = join(folder, name)
    if (statSync(path).isDirectory()) found.push(...sourcesUnder(path))
    else if (/\.(tsx?|css)$/.test(name)) found.push(path)
  }
  return found
}

it('keeps the router building a record page as /r/<id>', () => {
  expect(recordPath('abc123')).toBe('/r/abc123')
})
