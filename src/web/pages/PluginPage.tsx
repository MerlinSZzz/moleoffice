// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE PAGE OF A SWITCHED-ON PLUGIN, DRAWN IN A FRAME THAT HOLDS NO KEY, AT #/plugin/<id>/<page>. Wave 13x round 15, step
 * 3 of the plugin pipeline udGnc-Bsr15R (block 3nJsBlPlYhcl), on two decisions: a general slot, and read-only
 * first.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS DRAWN
 * ---------------------------------------------------------------------------------------
 *
 * The page's title from the plugin's manifest, then a panel named by the plugin, holding the frame. The frame is an
 * iframe with sandbox="allow-scripts" and nothing else, so the plugin's page has no origin: it cannot read this page,
 * its storage or its cookie, and it cannot move it. Its files come from GET /api/plugins/<id>/files/, under a policy
 * that lets it connect to nothing and start a worker only from a blob: address it made. The protocol it speaks is
 * pluginAsksTheSlot in src/shared/plugins.ts.
 *
 * A PLUGIN WITH NO PAGE HERE IS NOT A BLANK FRAME. whyAPluginHasNoPage says why, and the page says it in words: no
 * plugins folder, no such plugin, refused, off, or no page by that name. Then four answers about a page that has one:
 *   · failed to load: the page's file was asked for before the frame was drawn and the office refused it, so its
 *     sentence is shown and no frame is drawn;
 *   · not answering: the page has not said it is ready within PLUGIN_READY_WITHIN_MS. The frame stays, because a slow
 *     page may still answer, and the sentence goes when it does;
 *   · moved: the frame loaded a second document. The office cannot see where, so it stops answering, takes the frame
 *     away and offers to open the page again;
 *   · refused: a request the slot will not pass on is answered to the plugin, in the protocol, with the reason.
 *
 * WHAT IT DOES NOT DO: pause a page nobody is looking at, notice a plugin switched off in another tab until this page is
 * opened again, notice the office map's motion switched in another tab until this page is opened again (wave 13y round
 * 119), or stop a plugin's page sending what it read away by moving its own frame. plugins/README.md says so.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { content, t, wordLanguage } from '@shared/i18n.ts'
import { settingsPath } from '@shared/addresses.ts'
import {
  OFFICE_MAP_PLUGIN,
  PLUGIN_READ_INTERFACE,
  PLUGIN_READ_VIEWS,
  PLUGIN_READY_WITHIN_MS,
  pluginAsksTheSlot,
  pluginFileAddress,
  pluginPageFile,
  pluginWordsIn,
  whyAPluginHasNoPage,
  type PluginManifest,
  type PluginReading,
  type TheSlotTellsAPlugin,
  type WhyAPluginHasNoPage,
} from '@shared/plugins.ts'
import { READ_TARGET_LIMIT, theTargetOfARead } from '@shared/plugin-read.ts'
import { api, errorMessage } from '../api.ts'
import { DRAWS_THE_NAME } from '../components/agent/pointing.ts'
import { declaredAttributes } from '../components/declares.ts'
import { useTheLookShowing } from '../components/PresetBar.tsx'
import { pluginPagePath } from '../components/router.tsx'
import { ErrorNote, Loading, Panel, useAsync } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { useLanguage } from '../lib/language.ts'
import { useInspect } from '../lib/mode.ts'
import { pluginReasonInPlainWords, theRawTextSaysMore } from '../lib/plugin-reason.ts'
import { whereRequestsGo } from '../lib/visiting.ts'
import { currentWorkspace, subscribeWorkspace } from '../lib/workspace.ts'

export function PluginPage({ id, slug }: { id: string; slug: string }) {
  useLanguage()
  const [state] = useAsync(() => api.plugins(), [id, slug])
  const why = state.status === 'ready' ? whyAPluginHasNoPage(state.value, id, slug) : null
  const plugin = state.status === 'ready' ? state.value.plugins.find((one) => one.id === id) : undefined
  const manifest = plugin?.manifest ?? null
  const page = manifest?.pages.find((one) => one.slug === slug)
  return (
    <div className="page plgp">
      <style href="mole-office-plugin-page" precedence="default">
        {PLUGIN_PAGE_CSS}
      </style>
      {state.status === 'loading' ? <Loading what={t('pluginPage.loading')} /> : null}
      {state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault} /> : null}
      {state.status === 'ready' && why !== null ? <NoPage id={id} slug={slug} plugin={plugin} why={why} /> : null}
      {state.status === 'ready' && why === null && plugin !== undefined && manifest !== null && page !== undefined ? (
        <>
          <h1 className="plgp-title">{content(pluginWordsIn(page.title, wordLanguage()))}</h1>
          <PluginFrame key={`${id}/${slug}`} id={id} manifest={manifest} slug={slug} />
        </>
      ) : null}
    </div>
  )
}

/** Why this address has no page, in words, and the way on: Settings for a plugin that could be switched on. */
export function NoPage({ id, slug, plugin, why }: { id: string; slug: string; plugin: PluginReading | undefined; why: WhyAPluginHasNoPage }) {
  const developer = useInspect()
  const manifest = plugin?.manifest ?? null
  const name = manifest === null ? id : pluginWordsIn(manifest.name, wordLanguage())
  // A REFUSED PLUGIN IS NEVER UNDEFINED HERE. whyAPluginHasNoPage answers refused only for a plugin it found, and the
  // page reads `plugin` from the same reading. If they ever disagree, that is a broken assumption and not something to
  // draw, so it is thrown.
  if (why.why === 'refused' && plugin === undefined) {
    throw new Error(`whyAPluginHasNoPage answered refused for the plugin "${id}", but the reading has no plugin with that id.`)
  }
  const refused = why.why === 'refused' ? plugin : undefined
  return (
    <section className="plgp-none" {...declaredAttributes({ surface: 'plugins.page' })}>
      <h1 className="plgp-title" {...DRAWS_THE_NAME}>
        {t('pluginPage.noPage')}
      </h1>
      <p className="plgp-why">
        {why.why === 'no-folder'
          ? t('pluginPage.why.noFolder')
          : why.why === 'unknown'
            ? t('pluginPage.why.unknown', { id: content(id) })
            : why.why === 'refused'
              ? t('pluginPage.why.refused', { name: content(name) })
              : why.why === 'off'
                ? why.nobodyChose
                  ? t('pluginPage.why.nobodyChose', { name: content(name) })
                  : t('pluginPage.why.off', { name: content(name) })
                : t('pluginPage.why.noSuchPage', { name: content(name), slug: content(slug) })}
      </p>
      {refused === undefined ? null : (
        <>
          {/* ONE SENTENCE TO A LINE, in the page's language, as the Settings panel draws it. */}
          {pluginReasonInPlainWords(refused).map((sentence, at) => (
            <p className="plgp-reason" key={at}>
              {sentence}
            </p>
          ))}
          {/* THE READER'S OWN TEXT, in Developer mode only and only where it says more than the plain words. */}
          {developer && theRawTextSaysMore(refused) ? (
            <p className="plgp-raw" lang="en">
              {content(refused.refusal ?? '')}
            </p>
          ) : null}
        </>
      )}
      {why.why === 'no-such-page' && manifest !== null ? (
        <ul className="plgp-pages">
          {manifest.pages.map((one) => (
            <li key={one.slug}>
              <a href={`#${pluginPagePath(id, one.slug)}`}>{content(pluginWordsIn(one.title, wordLanguage()))}</a>
            </li>
          ))}
        </ul>
      ) : null}
      {why.why === 'refused' || why.why === 'off' ? (
        <p className="plgp-way">
          <a href={`#${settingsPath('settings.plugins')}`}>{t('pluginPage.toSettings')}</a>
        </p>
      ) : null}
    </section>
  )
}

/** Whether the reader asked for less motion, kept up to date. */
function useLessMotion(): boolean {
  return useSyncExternalStore((listener) => {
    const asked = window.matchMedia('(prefers-reduced-motion: reduce)')
    asked.addEventListener('change', listener)
    return () => {
      asked.removeEventListener('change', listener)
    }
  }, () => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
}

/** The frame, and the slot that answers it. */
function PluginFrame({ id, manifest, slug }: { id: string; manifest: PluginManifest; slug: string }) {
  const { language } = useLanguage()
  const look = useTheLookShowing()
  const lessMotion = useLessMotion()
  const project = useSyncExternalStore(subscribeWorkspace, currentWorkspace, currentWorkspace)
  const [opening, setOpening] = useState(0)
  const [file] = useAsync(() => api.pluginPageFile(id, slug), [id, slug, opening])
  const frame = useRef<HTMLIFrameElement>(null)
  const loads = useRef(0)
  const [ready, setReady] = useState(false)
  const [late, setLate] = useState(false)
  const [moved, setMoved] = useState(false)
  const name = pluginWordsIn(manifest.name, language)
  const pageTitle = pluginWordsIn(manifest.pages.find((one) => one.slug === slug)?.title ?? { en: slug }, language)
  const drawn = file.status === 'ready' && file.value.loads && !moved
  // WHETHER THE OFFICE MAP MAY MOVE (wave 13y round 119). The office stores it, and the office map's row on the Settings
  // page changes it. While it is off, the map's page is told reduced motion, whatever this browser asks. It is read
  // before the page is first told its context, so the map is never told it may move while that is not known. A failed
  // read tells the map to keep still and says so above the frame. Every other plugin is told only what the browser asks.
  const theMap = id === OFFICE_MAP_PLUGIN
  const [motion] = useProjectAsync(() => (theMap ? api.pixelSettings().then((reading) => reading.settings.motion) : Promise.resolve(true)), [id])
  const motionKnown = !theMap || motion.status !== 'loading'
  const keptStill = theMap && !(motion.status === 'ready' && motion.value)

  const context: TheSlotTellsAPlugin = {
    interface: PLUGIN_READ_INTERFACE,
    kind: 'context',
    plugin: id,
    page: slug,
    language: language === 'zh' ? 'zh' : 'en',
    theme: look,
    reducedMotion: lessMotion || keptStill,
    project,
  }
  const contextNow = useRef(context)
  contextNow.current = context
  const readyNow = useRef(false)
  const answersNow = useRef<'bytes' | undefined>(undefined)
  // Wave 13y round 44: every context carries the last accepted ready's grant, including repeated contexts.
  const contextForThePage = (): TheSlotTellsAPlugin => ({
    ...contextNow.current,
    ...(answersNow.current === 'bytes' ? { answers: 'bytes' as const } : {}),
  })

  // THE PAGE IS TOLD AGAIN WHENEVER WHAT IT WAS TOLD CHANGES, once it has said it is ready and the office map's motion
  // is known.
  useEffect(() => {
    if (!ready || !drawn || !motionKnown) return
    frame.current?.contentWindow?.postMessage(contextForThePage(), '*')
  }, [ready, drawn, motionKnown, context.language, context.theme, context.reducedMotion, context.project])

  // NOT ANSWERING: the page has PLUGIN_READY_WITHIN_MS from the frame being drawn to say it is ready.
  useEffect(() => {
    if (!drawn) return
    const timer = window.setTimeout(() => {
      if (!readyNow.current) setLate(true)
    }, PLUGIN_READY_WITHIN_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [drawn])

  // THE SLOT. Only a message from this frame's own window is read, and only the shapes pluginAsksTheSlot accepts are
  // answered. The answer is sent to '*' because the frame has no origin to name; the frame being taken away the moment
  // it loads a second document is what keeps an answer from reaching a page that is not the plugin's.
  useEffect(() => {
    if (!drawn) return
    let closed = false
    const asking = new Set<string>()
    const tell = (message: TheSlotTellsAPlugin, transfer: Transferable[] = []): void => {
      if (!closed) frame.current?.contentWindow?.postMessage(message, '*', transfer)
    }
    const refuse = (asked: { id: string | null; view: string | null }, why: Extract<TheSlotTellsAPlugin, { kind: 'refused'; said: string }>['why'], said: string): void => {
      tell({ interface: PLUGIN_READ_INTERFACE, kind: 'refused', id: asked.id, view: asked.view, why, said })
    }
    const onMessage = (event: MessageEvent): void => {
      const own = frame.current?.contentWindow
      if (own === null || own === undefined || event.source !== own) return
      const read = pluginAsksTheSlot.safeParse(event.data)
      if (!read.success) {
        refuse(
          { id: null, view: null },
          'not-understood',
          `The slot reads {interface: "${PLUGIN_READ_INTERFACE}", ask: "ready", answers?: "bytes"} and {interface, ask: "read", id, view, query?, tag?}, and this message was neither. ${read.error.issues.map((issue) => `${issue.path.join('.') || 'the message'}: ${issue.message}`).join(' ')}`,
        )
        return
      }
      const asked = read.data
      if (asked.ask === 'ready') {
        answersNow.current = asked.answers
        // SAID AGAIN, it is told again at once. Said the first time, the effect above tells it when the page redraws.
        if (readyNow.current) tell(contextForThePage())
        readyNow.current = true
        setReady(true)
        setLate(false)
        return
      }
      if (!(PLUGIN_READ_VIEWS as readonly string[]).includes(asked.view)) {
        refuse(asked, 'not-a-view', `"${asked.view}" is not a view of ${PLUGIN_READ_INTERFACE}. Its views are ${PLUGIN_READ_VIEWS.join(', ')}.`)
        return
      }
      if (!(manifest.reads as readonly string[]).includes(asked.view)) {
        refuse(asked, 'not-in-the-manifest', `This plugin's manifest does not name "${asked.view}" in its reads, so the slot does not read it.`)
        return
      }
      // TOO LONG TO SEND, measured on the path and query api.pluginRead sends (wave 13y round 52). Node would answer 431
      // or close the connection, and a plugin could not tell that from an office it cannot reach. The refusal carries the
      // two numbers and no sentence (round 52's fix).
      const bytes = theTargetOfARead(asked.view, asked.query).length
      if (bytes > READ_TARGET_LIMIT) {
        tell({ interface: PLUGIN_READ_INTERFACE, kind: 'refused', id: asked.id, view: asked.view, why: 'too-long', bytes, limit: READ_TARGET_LIMIT })
        return
      }
      if (asking.has(asked.view)) {
        refuse(asked, 'already-asking', `The slot is still reading "${asked.view}" for this page. Ask again when that answer comes.`)
        return
      }
      asking.add(asked.view)
      api
        .pluginRead(asked.view, asked.query, asked.tag, answersNow.current)
        .then((answer) => {
          if ('bytes' in answer) {
            tell({ interface: PLUGIN_READ_INTERFACE, kind: 'bytes', id: asked.id, view: asked.view, ...answer }, answer.bytes === null ? [] : [answer.bytes])
          } else {
            tell({ interface: PLUGIN_READ_INTERFACE, kind: 'answer', id: asked.id, view: asked.view, ...answer })
          }
        })
        .catch((err: unknown) => {
          refuse(asked, 'could-not-ask', `The slot could not reach the office: ${errorMessage(err)}`)
        })
        .finally(() => {
          asking.delete(asked.view)
        })
    }
    window.addEventListener('message', onMessage)
    return () => {
      closed = true
      window.removeEventListener('message', onMessage)
    }
  }, [drawn, manifest])

  const openAgain = (): void => {
    loads.current = 0
    readyNow.current = false
    answersNow.current = undefined
    setReady(false)
    setLate(false)
    setMoved(false)
    setOpening((n) => n + 1)
  }

  return (
    <Panel declares={{ surface: 'plugins.page' }} title={content(name)}>
      {file.status === 'loading' ? <Loading what={t('pluginPage.loading')} rows={1} /> : null}
      {file.status === 'error' ? <ErrorNote message={file.message} fault={file.fault} /> : null}
      {file.status === 'ready' && !file.value.loads ? (
        <p className="plgp-said" role="alert">
          {t('pluginPage.failedToLoad', { name: content(name), said: content(file.value.said) })}
        </p>
      ) : null}
      {moved ? (
        <div className="plgp-moved" role="alert">
          <p className="plgp-said">{t('pluginPage.moved', { name: content(name) })}</p>
          <button type="button" className="plgp-again" onClick={openAgain}>
            {t('pluginPage.openAgain')}
          </button>
        </div>
      ) : null}
      {theMap && motion.status === 'error' ? (
        <p className="plgp-said" role="status">
          {t('pluginPage.officeMap.unread', { why: content(motion.message) })}
        </p>
      ) : null}
      {late && !ready && drawn ? (
        <p className="plgp-said" role="status">
          {t('pluginPage.notAnswering', { name: content(name), seconds: String(PLUGIN_READY_WITHIN_MS / 1000) })}
        </p>
      ) : null}
      {drawn ? (
        <iframe
          key={opening}
          ref={frame}
          className="plgp-frame"
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          title={t('pluginPage.frameName', { name: content(name), page: content(pageTitle) })}
          src={whereRequestsGo(pluginFileAddress(id, pluginPageFile(slug)))}
          onLoad={() => {
            loads.current += 1
            if (loads.current > 1) setMoved(true)
          }}
        />
      ) : null}
    </Panel>
  )
}

/** The page's own rules. Every value is a token. No backtick inside. */
const PLUGIN_PAGE_CSS = `
.plgp { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }
.plgp-title { margin: 0; font: 600 var(--fs-4)/var(--lh-tight) var(--font-ui); color: var(--text); overflow-wrap: anywhere; }
.plgp-none { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.plgp-why, .plgp-way { margin: 0; max-width: var(--measure); font: var(--fs-2)/var(--lh-body) var(--font-ui); color: var(--text-2); }
.plgp-reason { margin: 0; max-width: var(--measure-in-box); font: var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text-3); overflow-wrap: anywhere; }
.plgp-raw { margin: 0; max-width: var(--measure); font: var(--fs-1)/var(--lh-body) var(--font-mono); color: var(--text-3); overflow-wrap: anywhere; }
.plgp-pages { margin: 0; padding-left: calc(var(--pad) * 2); display: flex; flex-direction: column; gap: 4px; font: var(--fs-2)/var(--lh-body) var(--font-ui); }
.plgp-said {
  margin: 0 0 var(--pad); max-width: var(--measure); padding: 2px var(--pad);
  color: var(--st-failed); background: var(--st-failed-bg);
  border-left: var(--rail) solid var(--st-failed-line); border-radius: var(--radius-sm);
  font: var(--fs-1)/var(--lh-body) var(--font-ui); overflow-wrap: anywhere;
}
.plgp-moved { display: flex; flex-direction: column; align-items: flex-start; gap: var(--pad); }
.plgp-again {
  padding: 4px var(--pad); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
  background: var(--panel); color: var(--text); font: var(--fs-1)/var(--lh-tight) var(--font-ui); cursor: pointer;
}
.plgp-again:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.plgp-frame {
  display: block; width: 100%; height: 70dvh; min-height: 320px;
  border: var(--border-w) solid var(--border); border-radius: var(--radius-sm); background: var(--bg);
}
`
