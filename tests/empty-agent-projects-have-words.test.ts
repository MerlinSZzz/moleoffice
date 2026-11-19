// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** An agent with no projects says so, and a long list names every project. */
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { bundlePageCode } from './a-bundle-of-page-code.ts'

let browser: Browser
let page: Page
let script = ''
beforeAll(async () => {
  const built = await bundlePageCode({
    stdin: {
      contents: `import { createElement } from 'react';
        import { createRoot } from 'react-dom/client';
        import { ProjectMarks } from './src/web/components/ProjectMarks.tsx';
        const root = createRoot(document.getElementById('app'));
        window.drawAgentProjects = projects => root.render(createElement(ProjectMarks, { projects, agent: true,
          known: [{ id: 'a', title: 'Made-up A' }, { id: 'b', title: 'Made-up B' }, { id: 'c', title: 'Made-up C' }] }));`,
      resolveDir: process.cwd(), loader: 'tsx',
    },
    bundle: true, write: false, format: 'iife', platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' },
  })
  script = built.outputFiles[0]!.text
  browser = await chromium.launch()
  page = await browser.newPage()
  await page.route('http://projects.test/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="app"></div>' }))
  await page.goto('http://projects.test/')
  await page.addScriptTag({ content: script })
}, 120_000)
afterAll(async () => { await browser?.close() })

it('says the office has no project and names all three when assigned', async () => {
  await page.evaluate(() => (window as unknown as { drawAgentProjects: (projects: string[]) => void }).drawAgentProjects([]))
  await expect.poll(() => page.locator('#app').innerText()).toContain(t('agentTags.noProjects'))
  await page.evaluate(() => (window as unknown as { drawAgentProjects: (projects: string[]) => void }).drawAgentProjects(['a', 'b', 'c']))
  await expect.poll(() => page.locator('[data-agent-project]').count()).toBe(3)
})
