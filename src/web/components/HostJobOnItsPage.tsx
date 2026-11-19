// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13q, the stable office and its tools.
/**
 * A HOST JOB ON ITS OWN RECORD PAGE, WHOLE (wave 13q round 60). The page drew a job's plain fields: the tool, its
 * sha256, the state, the times, the exit code and the log. It left out what the job was asked with, who asked and
 * what came back, because each of those is an object and `drawableAsWords` keeps an object out of the body. The
 * digests in base64 are worked out on read by GET /api/host-jobs/<id> and stored nowhere, so the page never had them.
 * Each is now a row of this panel, and an absence is said in words.
 *
 * THE FIRST THREE ROWS ARE READ FROM THE RECORD THE PAGE HOLDS, and only the digests from the door, so a door that
 * cannot answer costs the page its digests and nothing else.
 *
 * A DIGEST IS TOLD APART FROM A KEY BY WHERE IT COMES FROM, since a sha256 in base64 is padded as base64 is, and the
 * mask hides a padded run whole, as a key. These come from the office's own read of the record's hex, so they are drawn
 * as they are. What the tool returned is drawn as the office filed it, masked.
 *
 * A DIGEST'S "=" NEVER STANDS ALONE ON A LINE (wave 13q round 62). A digest that could break anywhere broke after 43 of
 * its 44 characters at 390, so its last line held the "=" alone. Each is drawn as two halves that stay on one line each
 * (`WithTheDigest`), and the line breaks between them or not at all.
 */
import type { ReactNode } from 'react'
import { HOST_JOB_KIND, HOST_JOB_WAITING, theHalvesOfADigest, type HostJobState } from '@shared/host-jobs.ts'
import { content, t, type WordKey } from '@shared/i18n.ts'
import type { PanelRecord } from '@shared/types.ts'
import { api } from '../api.ts'
import { writerNamed } from '../lib/participant-lookup.ts'
import { useInspect } from '../lib/mode.ts'
import { readParticipantsOnce } from '../lib/oneread.ts'
import { declaredAttributes, type Declares } from './declares.ts'
import { RouteLink, recordPath } from './router.tsx'
import { titleHere } from './sections.ts'
import { ErrorNote, Loading, Panel } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'

/** One declared output as the job holds it. */
interface AnOutput {
  name: string
  state: 'returned' | 'missing' | 'too large' | 'not a regular file'
  size?: number
  text?: string
}

const HOST_JOB_PAGE_SHEET = 'mole-office-a-host-job'

const HOST_JOB_PAGE_CSS = `
.hj-facts { margin: 0; display: flex; flex-direction: column; gap: 0.45rem; }
.hj-fact { display: grid; grid-template-columns: 11rem minmax(0, 1fr); column-gap: 0.75rem; align-items: baseline; }
.hj-fact dt { color: var(--text-3); font-size: var(--fs-1); overflow-wrap: anywhere; }
.hj-fact dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.hj-line { margin: 0; font: var(--fs-2)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.hj-none { color: var(--text-2); }
.hj-digest { margin: 0; font: var(--fs-1)/var(--lh-read) var(--font-mono, monospace); color: var(--text-2); overflow-wrap: anywhere; }
.hj-digest-half { white-space: nowrap; }
.hj-text { margin: 0.25rem 0 0.5rem; padding: var(--pad); max-height: 16rem; overflow-y: auto; overflow-x: hidden; white-space: pre-wrap; overflow-wrap: anywhere; font: var(--fs-1)/var(--lh-read) var(--font-mono, monospace); border: var(--border-w) solid var(--border); border-radius: var(--radius-sm); background: var(--panel-2, var(--panel)); }
@media (max-width: 40rem) {
  .hj-fact { grid-template-columns: minmax(0, 1fr); }
}
`

function Fact({ fact, title, declares, children }: { fact: string; title: string; declares: Declares | null; children: ReactNode }) {
  return (
    <div className="hj-fact" data-job-fact={fact} {...(declares === null ? {} : declaredAttributes(declares))}>
      <dt>{title}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/** A word said where a fact is absent, so the row is never blank. */
function None({ word }: { word: WordKey }) {
  return <p className="hj-line hj-none">{t(word)}</p>
}

/** A size in bytes, in words. */
function theSize(size: number | undefined): string {
  if (size === undefined) return t('hostJobPage.size.unknown')
  return size === 1 ? t('hostJobPage.size.one') : t('hostJobPage.size.many', { size: content(String(size)) })
}

/** What became of one declared output, in one sentence. */
function whatBecameOf(output: AnOutput): string {
  const name = content(output.name)
  if (output.state === 'returned') return t('hostJobPage.outputs.returned', { name, size: theSize(output.size) })
  if (output.state === 'too large') return t('hostJobPage.outputs.tooLarge', { name, size: theSize(output.size) })
  if (output.state === 'missing') return t('hostJobPage.outputs.missing', { name })
  return t('hostJobPage.outputs.notAFile', { name })
}

/** An argument's value as it was asked. A host tool takes only plain values, so anything else is drawn as its JSON. */
function theValue(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : JSON.stringify(value)
}

function TheArguments({ job, declares }: { job: PanelRecord; declares: Declares }) {
  const given = job.data['arguments']
  const named = given !== null && typeof given === 'object' && !Array.isArray(given) ? Object.entries(given as Record<string, unknown>) : []
  return (
    <Fact fact="arguments" title={titleHere(HOST_JOB_KIND, 'arguments')} declares={declares}>
      {named.length === 0 ? <None word="hostJobPage.arguments.none" /> : null}
      {named.map(([name, value]) => (
        <p key={name} className="hj-line" data-argument={name}>
          {t('hostJobPage.arguments.one', { name: content(name), value: content(theValue(value)) })}
        </p>
      ))}
    </Fact>
  )
}

/**
 * WHO ASKED, in either shape the kind declares: {run, agent} for a job a running agent run asked
 * for, and {kind, id} for one the office files for the person or a secretary.
 */
function WhoAsked({ job, declares, inspect }: { job: PanelRecord; declares: Declares; inspect: boolean }) {
  const [participants] = useProjectAsync(readParticipantsOnce, [])
  const asked = job.data['askedBy'] as { run?: unknown; agent?: unknown; kind?: unknown; id?: unknown } | undefined
  const run = typeof asked?.run === 'string' ? asked.run : null
  const agent = typeof asked?.agent === 'string' ? asked.agent : asked?.kind === 'agent' && typeof asked.id === 'string' ? asked.id : null
  const person = asked?.kind === 'person' && typeof asked.id === 'string' ? asked.id : null
  return (
    <Fact fact="askedBy" title={titleHere(HOST_JOB_KIND, 'askedBy')} declares={declares}>
      {agent === null && person === null && run === null ? <None word="hostJobPage.askedBy.none" /> : null}
      {agent === null ? null : (
        <p className="hj-line" data-asked-by="agent">
          {writerNamed({ actorType: 'agent', actorId: agent }, participants.status === 'ready' ? participants.value : undefined)}
        </p>
      )}
      {person === null ? null : (
        <p className="hj-line" data-asked-by="person">
          {writerNamed({ actorType: 'human', actorId: person }, participants.status === 'ready' ? participants.value : undefined)}
        </p>
      )}
      {run === null ? null : (
        <p className="hj-line" data-asked-by="run">
          <RouteLink to={recordPath(run)}>{t('hostJobPage.askedBy.run')}</RouteLink>
        </p>
      )}
      {inspect ? (
        <p className="hj-line">
          <code className="wrap-anywhere">{JSON.stringify(asked ?? null)}</code>
        </p>
      ) : null}
    </Fact>
  )
}

function WhatCameBack({ job, declares }: { job: PanelRecord; declares: Declares }) {
  const outputs = job.data['outputs'] as AnOutput[] | undefined
  const waiting = HOST_JOB_WAITING.includes(job.data['state'] as HostJobState)
  return (
    <Fact fact="outputs" title={titleHere(HOST_JOB_KIND, 'outputs')} declares={declares}>
      {outputs === undefined ? <None word={waiting ? 'hostJobPage.outputs.waiting' : 'hostJobPage.outputs.notRead'} /> : null}
      {outputs !== undefined && outputs.length === 0 ? <None word="hostJobPage.outputs.none" /> : null}
      {(outputs ?? []).map((output) => (
        <div key={output.name} data-output={output.name}>
          <p className="hj-line">{whatBecameOf(output)}</p>
          {output.text === undefined ? null : <pre className="hj-text">{output.text}</pre>}
        </div>
      ))}
    </Fact>
  )
}

/**
 * A SENTENCE THAT HOLDS A DIGEST, with the digest in two halves that each stay on one line and a break allowed only
 * between them. No character is added, so a digest copied from the page is the digest.
 */
function WithTheDigest({ sentence, digest }: { sentence: string; digest: string }) {
  const at = sentence.lastIndexOf(digest)
  if (at === -1) return <>{sentence}</>
  const [first, second] = theHalvesOfADigest(digest)
  return (
    <>
      {sentence.slice(0, at)}
      <span className="hj-digest-half">{first}</span>
      <wbr />
      <span className="hj-digest-half">{second}</span>
      {sentence.slice(at + digest.length)}
    </>
  )
}

function TheDigests({ id }: { id: string }) {
  const [state, reload] = useProjectAsync(() => api.hostJob(id), [id])
  return (
    <Fact fact="digests" title={t('hostJobPage.digests.title')} declares={null}>
      {state.status === 'loading' ? <Loading label={t('hostJobPage.digests.title')} rows={1} /> : null}
      {state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault ?? null} retry={reload} /> : null}
      {state.status === 'ready' ? (
        <>
          {state.value.digests.program.sha256Base64 === null ? (
            <p className="hj-digest hj-none" data-digest="the program">{t('hostJobPage.digests.programAbsent')}</p>
          ) : (
            <p className="hj-digest" data-digest="the program">
              <WithTheDigest
                sentence={t('hostJobPage.digests.program', { digest: content(state.value.digests.program.sha256Base64) })}
                digest={state.value.digests.program.sha256Base64}
              />
            </p>
          )}
          {state.value.digests.outputs.map((output) =>
            output.sha256Base64 === null ? (
              <p key={output.name} className="hj-digest hj-none" data-digest={output.name}>{t('hostJobPage.digests.outputAbsent', { name: content(output.name) })}</p>
            ) : (
              <p key={output.name} className="hj-digest" data-digest={output.name}>
                <WithTheDigest sentence={t('hostJobPage.digests.output', { name: content(output.name), digest: content(output.sha256Base64) })} digest={output.sha256Base64} />
              </p>
            ),
          )}
          <p className="hj-line hj-none">{t('hostJobPage.digests.note')}</p>
        </>
      ) : null}
    </Fact>
  )
}

/** ON A HOST JOB'S OWN RECORD PAGE: what it was asked with, who asked, what came back, and the digests. */
export function TheHostJobOnItsPage({ record, sections }: { record: PanelRecord; sections: (key: string) => Declares }) {
  const inspect = useInspect()
  return (
    <>
      <style href={HOST_JOB_PAGE_SHEET} precedence="default">
        {HOST_JOB_PAGE_CSS}
      </style>
      {/* SEE-THROUGH, as the push's panel is: the page's article declares the record, and each row declares its own
          section of the job. The digests are no section, since they are worked out on read. */}
      <Panel declares={{ surface: null }} title={t('hostJobPage.heading')}>
        <dl className="hj-facts" data-host-job-facts="">
          <TheArguments job={record} declares={sections('arguments')} />
          <WhoAsked job={record} declares={sections('askedBy')} inspect={inspect} />
          <WhatCameBack job={record} declares={sections('outputs')} />
          <TheDigests id={record.id} />
        </dl>
      </Panel>
    </>
  )
}
