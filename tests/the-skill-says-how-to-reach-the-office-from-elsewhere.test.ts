// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RULES FILE THIS CHECKOUT GENERATES STAYS UNDER THE SIZE AT WHICH CODEX DROPS IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS NOTICED, AND WHAT WAS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * An agent on another machine knew the user name and the matching network address, but could not
 * learn the office's default port from the skill. That is odd: if neither is written down, neither
 * should be known. Or was the skill on that machine not the latest?
 *
 * Measured then on `.claude/skills/mole-office/SKILL.md`, 902 lines: no port number anywhere, no
 * URL, no address, no mention of `GET /api/health`. The one sentence about where the office is named
 * two environment variables — `MOLE_OFFICE_API` and `MOLE_OFFICE_PORT` — which are variables of the
 * owner's machine and say nothing to an agent on another one. So the agent had the address from the
 * conversation and the port from nowhere, which is the asymmetry that was noticed.
 *
 * The second question, whether that machine's copy was out of date, had no answer either: the file
 * carried no version, no date and no generated-from marker, so no copy of it could be told from any
 * other.
 */
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { rulesSize, rulesTextFrom } from '../src/worker/rules.ts'

/**
 * ---------------------------------------------------------------------------------------
 * THE GENERATED RULES FILE, AND WHY THE SECTION STAYS OUT OF IT
 * ---------------------------------------------------------------------------------------
 *
 * `AGENTS.md` is written per run by src/worker/rules.ts from CLAUDE.md, the chapters and five named
 * sections of the core skill — never from `reference.md`, which is read on demand. So the no-drift
 * proof here has two halves, both checkable in this checkout: the generator still builds from the
 * checkout that carries this section, still carries its five core sections, still does NOT carry
 * this section (which would put a page about one machine in front of every run), and stays more than
 * the headroom under the 32,768 bytes at which Codex drops a rules file and says nothing. `AGENTS.md`
 * itself is generated into a run's directory, is in .gitignore, and is never edited by hand.
 */
describe('the copy of the section this checkout can generate stays whole', () => {

  it('stays within the headroom at which Codex reads none of it', () => {
    const REPO = fileURLToPath(new URL('..', import.meta.url))
    const size = rulesSize(rulesTextFrom(REPO))
    expect(size.tooBig, size.sentence).toBe(false)
  })
})
