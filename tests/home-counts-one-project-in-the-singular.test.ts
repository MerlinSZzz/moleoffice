// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOME SAYS "1 project", NOT "1 projects".
 *
 * The Projects heading's count read `t('home.projectCount', { n: count(n) })`. `count` formats a
 * number as a string for display, and a word's plural is chosen from a number, so a formatted "1"
 * always took the "other" form: Home said "1 projects" (seen in wave 13k's round 16 pictures). The
 * page now hands the word the number itself.
 *
 * MUTATION: give the word the formatted count again; the one-project case goes red.
 *
 * THE CARDS AND THEIR COUNT ARE ON THE PROJECTS PAGE since a decision, so the count is read from `ProjectCards`, which
 * that page draws, and no longer from Home.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { ProjectCards } from '../src/web/components/home/HomeSections.tsx'
import { en } from '../src/shared/words/en.ts'

function projects(n: number) {
  const workspaces = Array.from({ length: n }, (_, i) => ({ id: `made-up-${String(i)}`, title: `Made-up project ${String(i)}`, records: 1 }))
  return { status: 'ready', value: { workspaces } } as never
}

function html(n: number): string {
  return renderToStaticMarkup(
    h(ProjectCards, {
      waiting: { status: 'loading' } as never,
      attention: { status: 'loading' } as never,
      projects: projects(n),
      projectName: (id: string) => id,
    }),
  )
}

const forms = en['home.projectCount'] as { one: string; other: string }

it('says one project in the singular and two in the plural', () => {
  expect(html(1)).toContain(`>${forms.one.replace('{n}', '1')}<`)
  expect(html(2)).toContain(`>${forms.other.replace('{n}', '2')}<`)
})
