// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { api } from '../src/web/api.ts'
import { RuntimePage } from '../src/web/pages/RuntimePage.tsx'
import { UsagePage } from '../src/web/pages/UsagePage.tsx'
import { WorldsPage } from '../src/web/pages/WorldsPage.tsx'
import { WorldHerePage } from '../src/web/pages/WorldHerePage.tsx'
import { QueriesPage } from '../src/web/pages/QueriesPage.tsx'
import { FolderReadingPage } from '../src/web/pages/FolderReadingPage.tsx'
import { UI_CSS } from '../src/web/components/ui.tsx'
import { setWordLanguage, wordCheck, type PageLanguage } from '../src/shared/i18n.ts'
import { theApiIsOnPort } from '../src/web/lib/api-address.ts'
import { setMode } from '../src/web/lib/mode.ts'
import { forgetTheMachineOnThisPage } from '../src/web/lib/onemachine.ts'
import { adoptTheHomeWorld } from '../src/web/lib/world.ts'
import { thisPageIsHome, thisPageIsVisiting } from '../src/web/lib/visiting.ts'

// The real pages at a test office, with readings held still. Reject and Undo use the real door.
const supplied = (window as any).g9Fixtures
theApiIsOnPort(supplied.port)
const stops: string[] = []
Object.assign(api, {
  stopWorld: async (id: string) => { stops.push(id); return { couldNotStop: [] } },
  returnHome: async () => { localStorage.setItem('g9-returned', 'yes'); thisPageIsHome() },
})
const root = createRoot(document.getElementById('test')!)
const pages = { runtime: RuntimePage, usage: UsagePage, worlds: WorldsPage,
  worldhere: WorldHerePage, queries: QueriesPage, folderreading: FolderReadingPage }
let revision = 0
export const developerBrowser = {
  stops,
  check: wordCheck,
  draw(name: keyof typeof pages, language: PageLanguage, inspect = false, empty = false) {
    for (const [method, value] of Object.entries(empty ? supplied.emptyReadings : supplied.readings)) {
      Object.assign(api, { [method]: async () => structuredClone(value) })
    }
    setWordLanguage(language)
    document.documentElement.lang = language
    document.documentElement.dataset.theme = localStorage.getItem('mole-office.preset.theme') ?? 'light'
    setMode(inspect ? 'inspect' : 'normal')
    forgetTheMachineOnThisPage()
    const Page = pages[name]
    flushSync(() => root.render(<React.Fragment key={++revision}><style>{UI_CSS}</style><Page /></React.Fragment>))
  },
  away() {
    adoptTheHomeWorld({ database: 'elm-home-database', head: null })
    thisPageIsVisiting({ worldId: 'elm-copy', worldName: 'Elm copy', databaseIdentity: 'elm-copy-database',
      address: supplied.address, head: null, visitId: 'elm-visit' })
  },
}
;(window as any).g9 = developerBrowser
