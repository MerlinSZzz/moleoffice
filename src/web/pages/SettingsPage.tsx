// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { ProviderKeyPanel } from '../components/settings/ProviderKeyPanel.tsx'
import { StorageDestinationsPanel } from '../components/StorageDestinations.tsx'
/**
 * `#/settings` — HOW THIS BROWSER DRAWS MOLE OFFICE, AND WHO YOUR WRITES ARE ATTRIBUTED TO.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS PAGE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * The main rail answers where a person can go, and product configuration lives under Settings.
 *
 * Before this, four controls sat at the foot of the navigation column on every page: who a write is
 * attributed to, the Normal and Developer switch, a link to the component sheet when that switch
 * was on Developer, and a fold holding the theme, the density, the corners and the type. A person
 * looking for a room in their project had to read past all of them. They are all here now.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY CONTROL ON THIS PAGE IS THE ONLY COPY OF ITSELF
 * ---------------------------------------------------------------------------------------
 *
 * This is the reason nothing here needed a synchronising mechanism. `PresetBar` keeps its five
 * values in component state seeded once at import time; drawn here AND in the sidebar, changing the
 * theme in one would have left the other's buttons showing the old value while the document already
 * carried the new one. Two copies of a control is this repository's named recurring defect, and the
 * fix used here is the strongest of the three CLAUDE.md offers: delete one.
 *
 * The one thing drawn in two places is who you are writing as, and it is drawn as a CONTROL here
 * and as a read-only LINE in the rail. Both are written in src/web/components/Sidebar.tsx so one
 * function turns the stored actor into words, and both read `getActor` in api.ts, so changing it
 * here updates the rail while you watch.
 *
 * ---------------------------------------------------------------------------------------
 * THE PAGE IS IN CATEGORIES, AND ONE CATEGORY IS SHOWN AT A TIME, WITH EVERY PANEL OPEN
 * ---------------------------------------------------------------------------------------
 *
 * Layout A (wave 13y round 125, item 62): the categories in a list on the left, the chosen one marked, and beside
 * the list every panel of that category open. The categories and their order are those of the Settings design of 28
 * September 2026: seven in normal mode and two more in developer mode, which stand under a Developer heading at the
 * end of the list. Item 62 took back that design's folding of every panel, for Settings only. Nothing is grouped by
 * where a value is stored. CATEGORY_OF below says which category each panel is in, and the order of the page;
 * DEVELOPER_ONLY_PANELS says which panels normal mode leaves out. A category none of whose panels is drawn is left
 * out with them. The list, the category and the panels' blocks are drawn by src/web/components/SettingsFolds.tsx.
 * ONE BLOCK IS NOT A PANEL: the saved values this release refuses, drawn in normal mode under the page's title by
 * RefusedSavedSettings in src/web/components/OfficeControls.tsx, whichever category is shown.
 *
 * THE PAGE OPENS ON THE CATEGORY THIS BROWSER LAST CHOSE (src/web/lib/settings-category.ts), or on You when it has
 * chosen none.
 *
 * AN ADDRESS MAY NAME ONE PANEL: "#/settings/inject" opens the panel's category, Chat and messages, and scrolls to
 * the panel "Agents may inject". The builder is settingsPath in src/shared/addresses.ts. A developer-only panel
 * named in normal mode opens the Normal or Developer panel instead, with a line saying the named panel is shown in
 * developer mode. Three panels that were here are pages of their own since round 125, and their old addresses lead
 * there: Gates, Office controls and the sidebar's arrangement (MOVED_SETTINGS_PANELS in src/shared/addresses.ts).
 *
 * ---------------------------------------------------------------------------------------
 * KEYS AND MODELS ARE KEPT ON THE SERVER, NOT IN THIS BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * Criterion U2 put both on this page: `KeysPanel` holds the office's own keys, and
 * `RunModelsPanel` holds the model each run uses, for each place the office starts a run by itself
 * and for builders of each role card. An API key is a secret and a model choice is a fact about the
 * installation, so both are kept on the server behind a route, and each arrives with a fetch and a
 * loading state that the panels kept in this browser do not have. An agent's own model is set on
 * its profile, not here.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { settingsPath, type SettingsPanel } from '@shared/addresses.ts'
import { content, t, type WordKey } from '@shared/i18n.ts'
import { CATEGORY_OF, CATEGORY_TITLES, CATEGORIES, DEVELOPER_ONLY_PANELS, TITLE_KEYS, UNDER_THE_DEVELOPER_HEADING, WINDOW_ONLY_PANELS, panelsInCategory, type Category, type SettingsPanelDeclaration } from '@shared/settings-structure.ts'
import { cardWord } from '@shared/card-words.ts'
import { useLanguage } from '../lib/language.ts'
import { PresetBar } from '../components/PresetBar.tsx'
import { navigate, pathFor, RouteLink, useRoute } from '../components/router.tsx'
import { CategoryList, keepUnderTheList, MailToolEntry, PageEntry, panelAnchor, SettingsCategory, SettingsColumns, SettingsPanelBlock, type DrawnCategory } from '../components/SettingsFolds.tsx'
import { rememberedSettingsCategory, rememberSettingsCategory } from '../lib/settings-category.ts'
import type { StoreFault } from '../lib/store.ts'
// THE CONTROL FOR WHO A WRITE IS ATTRIBUTED TO LIVES IN THE FRAME'S FILE, and the note at the head
// of that file's "who writes" section says why: the rail prints the same name in its read-only
// line, and one function has to turn the stored actor into words or the two will drift. The import
// runs one way — this page reads the frame, and the frame never reads this page.
import { DESTINATIONS, WhoWritesControl } from '../components/Sidebar.tsx'
import { ViewSwitch } from '../components/ViewSwitch.tsx'
import { useInspect } from '../lib/mode.ts'
import { Panel } from '../components/ui.tsx'
import { DetailSaysPanel } from '../components/DetailSays.tsx'
import { RemoteAccessPanel } from '../components/RemoteAccessPanel.tsx'
import { MessageDoorPanel, ReplyReminderPanel, ThisComputerPanel } from '../components/ThisComputer.tsx'
import { RepositoriesPanel } from '../components/Repositories.tsx'
import { WorkSwitchesPanel } from '../components/WorkSwitchesPanel.tsx'
import { ReviewLevelPanel } from '../components/ReviewLevel.tsx'
// THE DIRECTORIES A PREVIEW MAY READ, criterion U4. Its own panel, beside the two other panels kept
// for one project: the list is derived per project and this is the only place it is drawn.
import { PreviewRootsPanel } from '../components/PreviewRoots.tsx'
import { ReviewMarksPanel } from '../components/ReviewMarks.tsx'
import { AppearancePanel } from '../components/Appearance.tsx'
import { ChatCirclePanel } from '../components/ChatCircle.tsx'
import { MessageLinksPanel } from '../components/MessageLinks.tsx'
import { ChatPicturesPanel } from '../components/ChatPictures.tsx'
import { ChatTextSizePanel } from '../components/ChatTextSize.tsx'
import { ChatLabelsPanel } from '../components/ChatLabelsPanel.tsx'
import { SendKeyPanel } from '../components/SendKeyPanel.tsx'
import { ShortcutsPanel } from '../components/ShortcutsPanel.tsx'
import { LanguagePanel } from '../components/LanguagePanel.tsx'
import { ProjectsPanel } from '../components/ProjectsPanel.tsx'
import { WordCheckPanel } from '../components/WordCheckPanel.tsx'
// WHETHER MEDIA A RECORD POINTS AT ARE LOADED, criterion U5. A different setting from the chat
// pictures panel above it: that one is about a picture inside a message.
import { MediaLoadPanel } from '../components/MediaLoad.tsx'
// WHAT THE OFFICE KEEPS: HOW MANY BACKUPS, AND THE TWO REQUEST-ROW WINDOWS. Criterion U6. The page's
// first numeric control; every kept setting above it is a text enum.
import { WhatIsKeptPanel } from '../components/WhatIsKept.tsx'
// THE PRICE TABLE THE USAGE PAGE ESTIMATES FROM. Criterion U3.
import { PriceTablePanel } from '../components/PriceTablePanel.tsx'
// WHETHER AGENTS MAY INJECT: ONE SWITCH FOR EVERY AGENT. Criterion M91. The page's first toggle.
import { InjectSwitchPanel } from '../components/InjectSwitch.tsx'
// WHICH PLUGINS ARE SWITCHED ON, one switch each (wave 13x round 14), drawn like the inject switch.
import { PluginSwitchesPanel } from '../components/PluginSwitches.tsx'
import { QuickInputsPanel } from '../components/QuickInputsPanel.tsx'
import { TerminalHolderPanel } from '../components/TerminalHolderPanel.tsx'
import { MachineNamesPanel } from '../components/MachineNames.tsx'
// WHO TAKES THE DEAD LETTERS, one agent the person names (problem 0WUuvB0IhRfb).
import { DeadLetterSecretaryPanel } from '../components/DeadLetterSecretary.tsx'
import { MergeQueueOwnerPanel } from '../components/MergeQueueOwner.tsx'
import { ModuleReminderSecretariesPanel } from '../components/ModuleReminderSecretaries.tsx'
// WHO TAKES THE USAGE NOTICES AND WHAT THE ONE AT 80% SAYS TO DO, two settings in one panel (wave 13y round 137).
import { UsageNoticesPanel } from '../components/UsageNotices.tsx'
// WHO IS THE GPU WATCHER, one agent or nobody, chosen here or named by the .env line (wave 13v round 35b).
import { GpuWatcherPanel } from '../components/GpuWatcher.tsx'
// THE KEYS THIS OFFICE HAS: ITS OWN TWO, AND EACH RUNTIME'S OWN ASKED READ-ONLY. Criterion U2. The
// page's first panel that draws a secret control, and the one the note at the head of this file
// said would arrive here: an API key is a secret and a model choice is a fact about the
// installation, so both belong on the server behind a route rather than in this browser.
import { KeysPanel } from '../components/KeysPanel.tsx'
import { GoSlotsPanel } from '../components/GoSlotsPanel.tsx'
// NOTIFICATIONS ON THIS DEVICE.
import { AllowNotificationsPanel } from '../components/AllowNotifications.tsx'
// THE MODEL EACH RUN USES, criterion U2: a model for each place the office starts a run by itself,
// and a default for builders of each role card. Drawn straight after the keys.
import { RunModelsPanel } from '../components/RunModelsPanel.tsx'
// THE ENTRY THAT FOLLOWS THE PERSON, F15 point 1. It sits with the keys because both are the
// office's own installation facts rather than a project's or this browser's, and because this is
// the one press that writes into the directory every Claude Code session on this machine reads.
import { InstallTheEntry } from '../components/InstallTheEntry.tsx'
import { InstallTheMailTool } from '../components/InstallTheMailTool.tsx'
import { SandboxMemoryCap } from '../components/SandboxMemoryCap.tsx'
import { QueueViewPanel } from '../components/QueueView.tsx'
// THE MACHINES THIS OFFICE TRUSTS, criterion P73. The same component the world's page draws.
import { TrustedMachines } from '../components/TrustedMachines.tsx'
// WHO HAS CALLED WITH A CLAIM AND NO KEY, criterion P83 point 6. The list the person reads before they
// close the window, drawn beside the machines the window covers.
import { HeaderOnlyCallers } from '../components/HeaderOnlyCallers.tsx'
// AND THE ONE PRESS THAT CLOSES IT, in the same panel: the list is what the person reads first, then the
// press beside it, and after the press the line that says who closed the window and when.
import { CloseTheWindow } from '../components/CloseTheWindow.tsx'
import { WindowShutdownPanel } from '../components/ShutDown.tsx'
import { StartAtLoginPanel } from '../components/StartAtLogin.tsx'
// THE DATA FOLDER AND ITS PRESSES, criteria DF18 and DF22. Normal mode draws this panel.
import { DataFolderPanel } from '../components/DataFolderPanel.tsx'
// THE THEMES PANEL OF THE LOOKS TAB: the person's own themes, copied, changed, checked and deleted.
import { OwnThemesPanel } from '../components/OwnThemesPanel.tsx'
import { isTheWindow } from '../../config/the-window-mark.mjs'
import { api } from '../api.ts'
import { RefusedSavedSettings, RestartControls } from '../components/OfficeControls.tsx'
import { ErrorNote, Loading, useAsync } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'

type SettingsSurface = SettingsPanel

export { TITLE_KEYS, DEVELOPER_ONLY_PANELS, WINDOW_ONLY_PANELS } from '@shared/settings-structure.ts'

/** Whether this page is drawn inside the standalone window (src/config/the-window-mark.mjs). */
const inTheWindow = (): boolean => typeof navigator !== 'undefined' && isTheWindow(navigator.userAgent)

/**
 * Whether this reader sees a panel: every panel in developer mode, and the rest in normal mode. A window-only
 * panel is drawn only in the window.
 */
function drawn(surface: SettingsSurface, developer: boolean): boolean {
  if (WINDOW_ONLY_PANELS.has(surface) && !inTheWindow()) return false
  return developer || !DEVELOPER_ONLY_PANELS.has(surface)
}

/**
 * Where a panel is drawn: the name of its category, and whether only developer mode draws it. A sentence
 * elsewhere that sends a person to a panel is checked against this, so moving the panel turns its test red.
 */
export function whereThePanelIs(surface: SettingsSurface): { category: WordKey; developerOnly: boolean } {
  return { category: CATEGORY_TITLES[CATEGORY_OF[surface]], developerOnly: DEVELOPER_ONLY_PANELS.has(surface) }
}

/** The panels of one category that this reader sees, in the page's order. */
function panelsOf(category: Category, developer: boolean): readonly SettingsPanelDeclaration[] {
  return panelsInCategory(category, developer, inTheWindow())
}

/** The id of a category's heading, which the list's press controls. */
function categoryAnchor(category: Category): string {
  return `set-cat-${category}`
}

export function SettingsPage() {
  useLanguage()
  // Conditionally rendered rather than hidden with CSS, which is the rule docs/UX-CONTRACT.md
  // sets for everything Developer detail reveals: a screen reader would otherwise read out a link
  // to a page the reader has not asked to see.
  const developer = useInspect()
  const route = useRoute()
  // THE PANEL THE ADDRESS NAMES, if it names one: "#/settings/inject". Only the Settings route carries one.
  const named = route.name === 'settings' ? (route.panel ?? null) : null
  // A developer-only panel named while this reader is in normal mode is not drawn. The page opens the Normal or
  // Developer panel instead and says there that the named one is shown in developer mode.
  const namedButHidden = named !== null && !drawn(named, developer) ? named : null
  // THE PANEL THE PAGE SCROLLS TO, and whose category it shows: the named one, or the mode switch in its place.
  const target: SettingsSurface | null = named === null ? null : namedButHidden === null ? named : 'settings.mode'

  // THE CATEGORY THIS BROWSER LAST CHOSE, read once when the page opens, and anything that went wrong keeping it.
  const [remembered] = useState(() => rememberedSettingsCategory(CATEGORIES, 'you'))
  const [chosen, setChosen] = useState<Category>(remembered.category)
  const [fault, setFault] = useState<StoreFault | null>(remembered.fault)
  // How many times the person has chosen a category here, so the effect below runs after each choice.
  const [choices, setChoices] = useState(0)

  const categories = CATEGORIES.map((key) => ({ key, panels: panelsOf(key, developer) }))
    .filter(({ panels }) => panels.length > 0)
    .map(({ key, panels }) => {
      const shortName = UNDER_THE_DEVELOPER_HEADING[key]
      const title = t(CATEGORY_TITLES[key])
      return {
        drawn: { key, title, inTheList: shortName === undefined ? title : t(shortName), developer: shortName !== undefined, anchor: categoryAnchor(key) } satisfies DrawnCategory,
        panels,
      }
    })
  // AN ADDRESS THAT NAMES A PANEL SHOWS THAT PANEL'S CATEGORY. Otherwise the chosen one is shown, unless this reader
  // does not see it (a developer category in normal mode), and then the first one is.
  const wanted: Category = target === null ? chosen : CATEGORY_OF[target]
  const shown = categories.find(({ drawn }) => drawn.key === wanted) ?? categories[0]
  if (shown === undefined) throw new Error('The Settings page has no category with a panel this reader sees.')

  // THE CATEGORY AN ADDRESS OPENED IS THE ONE CHOSEN NOW, and this browser remembers it.
  useEffect(() => {
    if (target === null) return
    const category = CATEGORY_OF[target]
    setChosen(category)
    const refused = rememberSettingsCategory(category)
    if (refused !== null) setFault(refused)
  }, [target])

  // SCROLL TO THE NAMED PANEL, when the address names one and whenever it names another. When the reader switches to
  // developer mode with a developer-only panel named, that panel is now drawn, and the page scrolls to it.
  useEffect(() => {
    if (target === null) return
    const block = document.getElementById(panelAnchor(target))
    if (block === null) throw new Error(`The Settings page draws no panel with the id "${panelAnchor(target)}".`)
    return keepUnderTheList(block)
  }, [target])

  // AFTER A CHOICE, THE CHOSEN CATEGORY'S HEADING IS AT THE TOP, just under what sticks there, as each press of the
  // old row scrolled to its heading. The list stays in view as the page scrolls, so a person may choose from far down
  // a long category; the new one is then read from its heading, not from where that was. The heading is followed as
  // the category's panels load, as a named panel is.
  useEffect(() => {
    if (choices === 0) return
    const heading = document.getElementById(categoryAnchor(shown.drawn.key))
    if (heading === null) throw new Error(`The Settings page draws no category heading with the id "${categoryAnchor(shown.drawn.key)}".`)
    return keepUnderTheList(heading)
  }, [choices])

  const choose = (key: string) => {
    const category = CATEGORIES.find((each) => each === key)
    if (category === undefined) throw new Error(`The Settings page has no category "${key}".`)
    setChosen(category)
    const refused = rememberSettingsCategory(category)
    if (refused !== null) setFault(refused)
    // An address that names a panel would name one the page no longer shows, so it goes back to the page's own.
    if (named !== null) navigate(settingsPath())
    else setChoices((was) => was + 1)
  }

  return (
    <div className="set">
      <style href="mole-office-settings" precedence="default">
        {SETTINGS_CSS}
      </style>

      <header className="set-head">
        <h1 className="set-title">{t('nav.settings')}</h1>
      </header>

      {/* THE SAVED VALUES THE OFFICE REFUSES, IN NORMAL MODE ONLY. The Office controls page is a developer-only one,
          and a refusal that touches the person's own saved data must reach the person, so the block is drawn here
          whatever category is shown. In developer mode that page's own rows draw the same notice, so this block is
          left out and no press is drawn twice. */}
      {developer ? null : <RefusedSavedSettings />}

      {/* A BROWSER THAT WILL NOT KEEP THE CHOICE SAYS SO. The choice still holds while the page is open. */}
      {fault === null ? null : (
        <p className="set-say" role="status" data-settings-category-fault={fault.key}>
          {fault.message}
        </p>
      )}

      <SettingsColumns>
        <CategoryList categories={categories.map(({ drawn }) => drawn)} chosen={shown.drawn.key} onChoose={choose} />
        <SettingsCategory key={shown.drawn.key} category={shown.drawn}>
          {shown.panels.map((panel) => {
            const surface = panel.key as SettingsSurface
            return surface === 'settings.mailtool' ? (
              <MailToolEntry key={surface} title={t(panel.title)}>
                <InstallTheMailTool />
              </MailToolEntry>
            ) : surface === 'settings.arrangesidebar' ? (
              <PageEntry key={surface} surface={surface} title={t(panel.title)} what={t('settingsCats.arrangeSidebar.what')} to={pathFor('sidebarArrangement')} />
            ) : (
              <SettingsPanelBlock key={surface} surface={surface} title={t(panel.title)}>
                <PanelBody surface={(panel.body ?? surface) as SettingsSurface} namedButHidden={namedButHidden} />
              </SettingsPanelBlock>
            )
          })}
        </SettingsCategory>
      </SettingsColumns>
    </div>
  )
}

/**
 * WHAT ONE PANEL DRAWS INSIDE ITS BLOCK. Most panels are a component of their own that draws its own Panel; the
 * few below that were written on this page draw theirs here. Every panel's contents are as they were before the
 * page was put in categories.
 */
function PanelBody({ surface, namedButHidden }: { surface: SettingsSurface; namedButHidden: SettingsSurface | null }): ReactNode {
  switch (surface) {
    case 'settings.providerkeys':
      return <ProviderKeyPanel />
    case 'settings.look':
      return (
        <Panel titleIs="label" declares={{ surface: 'settings.look' }} title={t('settingsPanel.title.look')}>
          {/* The row form: five controls across the panel, wrapping when there is no room. Every change
              is on the screen the moment it is pressed, which is why none of them has a caption. */}
          <PresetBar />
        </Panel>
      )
    case 'settings.ownthemes':
      return <OwnThemesPanel />
    case 'settings.detail':
      return (
        <Panel titleIs="label" declares={{ surface: 'settings.detail' }} title={t('settingsPanel.title.detail')}>
          <DetailSaysPanel />
        </Panel>
      )
    case 'settings.writer':
      return (
        <Panel titleIs="label" declares={{ surface: 'settings.writer' }} title={t('settingsPanel.title.writer')}>
          <div className="set-stack">
            <WhoWritesControl />
            {/* ONE LINE, AND IT IS THE CONSEQUENCE RATHER THAN THE MECHANISM. Which of three names is
                selected is on the control; what selecting one DOES is not, and it is permanent. */}
            <p className="set-say">{t('settingsPanel.page.writerSays')}</p>
          </div>
        </Panel>
      )
    case 'settings.mode':
      return <ModePanel namedButHidden={namedButHidden} />
    // YOUR OWN PICTURE, NAME AND STATE, here because a picture of a person is a resource like the appearance.
    case 'settings.appearance':
      return <AppearancePanel />
    // HOW THE CHAT CIRCLE DRAWS ITS NUMBER, criterion M32.
    case 'settings.chatbutton':
      return <ChatCirclePanel />
    // HOW A RECORD NAMED IN A MESSAGE IS DRAWN, criterion M47.
    case 'settings.messagelinks':
      return <MessageLinksPanel />
    // HOW A PICTURE INSIDE A MESSAGE IS DRAWN, criterion M64: at once, after a press, or only as its path.
    case 'settings.chatpictures':
      return <ChatPicturesPanel />
    // HOW BIG THE CHAT'S OWN TEXT IS, criterion M112.
    case 'settings.chattextsize':
      return <ChatTextSizePanel />
    // A PERSON'S OWN LABELS FOR THE MESSAGES THEY WRITE, listed by the flag left of Send.
    case 'settings.chatlabels':
      return <ChatLabelsPanel />
    // WHICH KEY SENDS A MESSAGE.
    case 'settings.sendkey':
      return <SendKeyPanel />
    case 'settings.shortcuts': return <ShortcutsPanel />
    case 'settings.language':
      return <LanguagePanel />
    case 'settings.projects':
      return <ProjectsPanel />
    case 'settings.words':
      return <WordCheckPanel />
    // WHETHER MEDIA A RECORD POINTS AT ARE LOADED, criterion U5. Not the chat pictures panel: that one is a
    // picture inside a message, and this is a picture or video in a report.
    case 'settings.mediaload':
      return <MediaLoadPanel />
    // WHAT THE OFFICE KEEPS, criterion U6: how many backups to keep and how long the two kinds of request row survive.
    case 'settings.storage': return <StorageDestinationsPanel />
    case 'settings.whatiskept':
      return <WhatIsKeptPanel />
    // THE DATA FOLDER, criterion DF18: where it is, who chose it, the last move and the presses that move it.
    case 'settings.datafolder':
      return <DataFolderPanel />
    case 'settings.prices':
      return <PriceTablePanel />
    // WHETHER AGENTS MAY INJECT, by criterion M91 and a decision: one switch for every
    // agent.
    case 'settings.inject':
      return <InjectSwitchPanel />
    case 'settings.machinenames':
      return <MachineNamesPanel />
    case 'settings.deadletters':
      return <DeadLetterSecretaryPanel />
    case 'settings.restart':
      return <RestartControls />
    case 'settings.mergequeueowner':
      return <MergeQueueOwnerPanel />
    case 'settings.modulereminders':
      return <ModuleReminderSecretariesPanel />
    case 'settings.usagenotices':
      return <UsageNoticesPanel />
    case 'settings.messagedoor':
      return <MessageDoorPanel />
    case 'settings.replyreminder':
      return <ReplyReminderPanel />
    case 'settings.windowshutdown':
      return <WindowShutdownPanel />
    case 'settings.startatlogin':
      return <StartAtLoginPanel />
    // THE KEYS THIS OFFICE HAS, criterion U2, and the OpenCode Go slots the provider router turns between.
    case 'settings.keys':
      return <><KeysPanel /><GoSlotsPanel /></>
    case 'settings.notifications':
      return <AllowNotificationsPanel />
    // THE SUMMONS MAIL is drawn by MailToolEntry, the Tools category's first entry, and never reaches here.
    case 'settings.mailtool':
      throw new Error('The summons mail is drawn as a tool entry, not as a panel.')
    // THE ENTRY THAT LEADS TO THE SIDEBAR'S ARRANGEMENT is drawn by PageEntry, and never reaches here.
    case 'settings.arrangesidebar':
      throw new Error('The entry "Arrange the sidebar" is drawn as a link to its page, not as a panel.')
    case 'settings.runmodels':
      return <RunModelsPanel />
    // ONE MEMORY LIMIT FOR ALL SANDBOXES TOGETHER, the person's press through the system's password dialog.
    case 'settings.sandboxmemory':
      return (
        <Panel titleIs="label" declares={{ surface: 'settings.sandboxmemory' }} title={t('settingsPanel.title.sandboxmemory')}>
          <SandboxMemoryCap />
        </Panel>
      )
    // WHO IS THE GPU WATCHER, chosen here or named by the .env line (wave 13v round 35b).
    case 'settings.gpuwatcher':
      return <GpuWatcherPanel />
    // WHICH PLUGINS ARE SWITCHED ON, one switch each, off until the owner switches it on (wave 13x round 14).
    case 'settings.plugins':
      return <PluginSwitchesPanel />
    // WHICH INPUTS THE OFFICE MAY TYPE INTO AN AGENT'S TERMINAL WHEN THE AGENT ASKS, the owner's list (wave 13u round 21).
    case 'settings.quickinputs':
      return <QuickInputsPanel />
    // THE TERMINAL HOLDER, and a press that restarts it after the owner has seen the terminals it ends (wave 13u round 23).
    case 'settings.terminalholder':
      return <TerminalHolderPanel />
    // THE ENTRY THAT PUTS MOLE OFFICE IN EVERY SESSION, F15 point 1. The press is the person's, and it merges rather than replacing.
    case 'settings.entry':
      return (
        <Panel titleIs="label" declares={{ surface: 'settings.entry' }} title={t('settingsPanel.title.entry')}>
          <InstallTheEntry />
        </Panel>
      )
    case 'settings.review':
      return <ReviewMarksPanel />
    // HOW THE WAITING-ON-YOU PAGE DRAWS EACH THING, criterion P54.
    case 'settings.queueview':
      return <QueueViewPanel />
    // The three panels kept for one project: repositories, how much review a finished run gets, and
    // which directories a preview may read (criterion U4). The second follows a decision.
    case 'settings.repositories':
      return <RepositoriesPanel />
    case 'settings.workswitches':
      return <WorkSwitchesPanel />
    case 'settings.reviewlevel':
      return <ReviewLevelPanel />
    case 'settings.previewroots':
      return <PreviewRootsPanel />
    // THE FACTS ABOUT THIS INSTALLATION, read-only, on a decision.
    case 'settings.thiscomputer':
      return <ThisComputerPanel />
    // WHETHER ANY OTHER COMPUTER CAN OPEN THIS MOLE OFFICE.
    case 'settings.access':
      return <RemoteAccessPanel />
    case 'settings.trusted':
      return <TrustedMachinesHere />
    case 'settings.headeronly':
      return <HeaderOnlyCallersHere />
    case 'settings.visitorceiling':
      return <VisitorCeilingHere />
  }
}

/**
 * NORMAL OR DEVELOPER. The words on this control are "Normal" and "Developer". "Inspect" is a browser word and
 * tells a stranger nothing; the STORED word is still inspect, so ?mode=inspect and every saved setting go on
 * working. Both live in src/web/lib/mode.ts.
 *
 * When an address names a developer-only panel and this reader is in normal mode, the line under the switch says
 * that panel is shown in developer mode, so the address does not open nothing and say nothing.
 */
function ModePanel({ namedButHidden }: { namedButHidden: SettingsSurface | null }) {
  useLanguage()
  const developer = useInspect()
  // The sheet's own row, so its words and the page it opens stay one string. A missing key means
  // this page and DESTINATIONS have fallen out of step; say so rather than quietly drawing nothing.
  const sheet = DESTINATIONS.find((d) => d.key === 'sheet')
  if (sheet === undefined) throw new Error('No destination called "sheet".')
  return (
    <Panel titleIs="label" declares={{ surface: 'settings.mode' }} title={t('settingsPanel.title.mode')}>
      <div className="set-stack">
        <ViewSwitch />
        {namedButHidden === null ? null : (
          <p className="set-say" data-named-panel={namedButHidden}>
            {t('settingsCats.shownInDeveloperMode', { panel: t(TITLE_KEYS[namedButHidden]) })}
          </p>
        )}
        {developer ? (
          <RouteLink to={sheet.to} className="set-sheet" title={sheet.what}>
            {sheet.label}
          </RouteLink>
        ) : null}
      </div>
    </Panel>
  )
}

/**
 * The page's own rules, and nothing about a control: the appearance bar, the detail switch and the
 * select each ship their own.
 *
 * React 19 hoists a `<style href>` into <head> and de-duplicates by href, so this is one element
 * however often the page renders. Every value is a token, so a preset swap on <html> reaches all
 * of it — including while somebody is standing on this page changing one.
 */
const SETTINGS_CSS = `
.set { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }

.set-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--gut); min-width: 0; }

/* --fs-6, which is what every other page name in this product is set at. */
.set-title { margin: 0; color: var(--text); font: 600 var(--fs-6)/var(--lh-tight) var(--font-ui); }

.set-stack { display: flex; flex-direction: column; align-items: flex-start; gap: var(--pad); min-width: 0; }

/* ---------------------------------------------------------------- a repair that belongs upstream
   THE HAIRLINES BETWEEN THE APPEARANCE SEGMENTS ARE TOO FAINT TO BE A CONTROL EDGE, AND THIS PAGE
   IS WHERE THAT FIRST BECAME VISIBLE. styles.css draws them with var(--border): measured by
   node tools/legibility.mjs on 15 August, six of them came out at 1.26:1 in light and 1.33:1 in
   dark against the surface outside them, and WCAG 1.4.11 asks 3:1 of a control's visual boundary.
   Nothing caught it before because those controls were inside a closed fold in the sidebar, so no
   run ever saw them drawn.

   THE REAL FIX IS ONE TOKEN IN src/web/styles.css, which this change does not own, and it is
   reported rather than left. Scoping it here keeps the failure off the one page that draws them —
   this is the only place in the product that renders the bar — and the switch one panel below
   already uses var(--border-strong) for the same hairline, which is what passes. */
.set .presetbar-seg button { border-right-color: var(--border-strong); }

/* A CONTROL IS AS WIDE AS ITS WIDEST ANSWER, NOT AS WIDE AS THE PANEL. The shared select fills its
   parent, which is right in a form column and wrong here: a menu of three names drawn 1150px wide
   at 1440 reads as a text box somebody forgot to fill in. It still fills a phone, where the cap is
   wider than the screen. */
.set-stack > .px-select { width: 100%; max-width: 22rem; }

.set-say {
  margin: 0;
  max-width: var(--measure-in-box);
  font-size: var(--fs-2);
  line-height: var(--lh-tight);
  color: var(--text-2);
}

/* A press, not a row: the component sheet is a tool a developer opens, and drawing it as a
   destination row would put it back in the vocabulary of places this pass took it out of. */
.set-sheet {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font-size: var(--fs-1);
  font-weight: 600;
  text-decoration: none;
}
.set-sheet:hover { background: var(--hover); }
`

/**
 * THE MACHINES THIS OFFICE TRUSTS, READ-ONLY. Criterion P73.
 *
 * It fetches its own list rather than being handed one, the way `RemoteAccessPanel` and
 * `ThisComputerPanel` beside it do: the Settings page is a page of panels that each know one thing,
 * and a page-level fetch for one panel would make the whole page wait on it.
 */
function TrustedMachinesHere() {
  useLanguage()
  const [state, readAgain] = useAsync(() => api.trustedMachines(), [], { keep: 'settings.trustedMachines' })
  if (state.status === 'loading') return <Loading what={t('settingsPanel.page.loadingTrusted')} />
  if (state.status === 'error') return <ErrorNote message={state.message} fault={state.fault} />
  return (
    <Panel titleIs="label" declares={{ surface: 'settings.trusted' }} title={t('settingsPanel.title.trusted')}>
      <TrustedMachines said={state.value} presses={false} onChanged={readAgain} />
    </Panel>
  )
}

/**
 * WHO HAS CALLED WITH A CLAIM AND NO KEY, AND THE PRESS THAT CLOSES THE WINDOW. Criterion P83,
 * point 6.
 *
 * The list fetches its own reading for the reason `TrustedMachinesHere` above does: the Settings
 * page is a page of panels that each know one thing, and a page-level fetch for one panel would
 * make the whole page wait on it. The press below the list fetches the window's own state the same
 * way, and after it is pressed it reads that state again so the press is replaced by the line that
 * says who closed the window and when.
 */
function HeaderOnlyCallersHere() {
  useLanguage()
  const [state] = useAsync(() => api.headerOnlyCallers(), [], { keep: 'settings.headerOnlyCallers' })
  if (state.status === 'loading') return <Loading what={t('settingsPanel.page.loadingCallers')} />
  if (state.status === 'error') return <ErrorNote message={state.message} fault={state.fault} />
  return (
    <Panel titleIs="label" declares={{ surface: 'settings.headeronly' }} title={t('settingsPanel.title.headeronly')}>
      <HeaderOnlyCallers said={state.value} />
      <CloseTheWindow />
    </Panel>
  )
}

/**
 * THE HIGHEST CARD A VISITOR MAY HOLD, READ-ONLY. Criterion P86.
 *
 * It fetches the role declaration, which is where the server publishes the ceiling it enforces — the
 * same read the Settings page's other read-only panels make, and the same value the ask door and the
 * confirm use. There is no press: the ceiling is MOLE_OFFICE_VISITOR_CARD_CEILING, set in the
 * environment like every other office setting, and a control that wrote somewhere the server does not
 * read would be a lie about what it did.
 */
function VisitorCeilingHere() {
  useLanguage()
  const [state] = useProjectAsync(() => api.roles(), [], { keep: 'settings.roles' })
  if (state.status === 'loading') return <Loading what={t('settingsPanel.page.loadingCeiling')} />
  if (state.status === 'error') return <ErrorNote message={state.message} fault={state.fault} />
  const ceiling = state.value.visitorCardCeiling
  // THREE PATHS, AND THE PAGE CAN NAME TWO OF THEM ITSELF. Raised: the setting lifted the ceiling
  // above the default. The default: nothing moved it. Anything else is a setting that names a word
  // no card holds, or a card below the default; the server's own sentence says which, so it is
  // drawn as the server wrote it, in English, rather than guessed at here.
  const says = ceiling.raised
    ? t('settingsPanel.page.ceilingRaised', { card: cardWord(ceiling.ceiling), fallback: cardWord(ceiling.defaultCeiling), setting: content(ceiling.setting) })
    : ceiling.ceiling === ceiling.defaultCeiling
      ? t('settingsPanel.page.ceilingDefault', { card: cardWord(ceiling.ceiling), setting: content(ceiling.setting) })
      : null
  return (
    <Panel titleIs="label" declares={{ surface: 'settings.visitorceiling' }} title={t('settingsPanel.title.visitorceiling')}>
      <div className="set-stack">
        {says === null ? <p className="set-say" lang="en">{content(ceiling.says)}</p> : <p className="set-say">{says}</p>}
        <p className="set-say">
          {t('settingsPanel.page.ceilingSetting')} <code>{content(ceiling.setting)}</code>
        </p>
      </div>
    </Panel>
  )
}
