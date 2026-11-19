// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// The English list's place for wave 13v's new words, in English only. Their Chinese is written in
// the translation round before a version, and until then a Chinese page shows the English. joined.ts reads this file.
import { SURFACES } from '../surfaces.ts'
export const enWave13v = {
  // ---- the GPU watcher: src/server/lib/gpu-watcher.ts and src/web/components/GpuWatcher.tsx ----
  // {who} is an agent's name or handle and is never translated. {because} is the reason given, as it was written.
  get 'settingsPanel.title.gpuwatcher'(): string { return SURFACES['settings.gpuwatcher'] },
  'gpuWatcher.loading': 'the GPU watcher',
  'gpuWatcher.what': 'The agent, besides you, that may report GPU readings and record a cut-in step on a GPU booking. A .env line that names one comes before the choice here.',
  'gpuWatcher.inForce.env': '{who} is the GPU watcher. The .env line names it, and that line comes before the choice here.',
  'gpuWatcher.inForce.envNoAgent': 'The .env line names {who} as the GPU watcher, and no agent here has that handle. That line comes before the choice here, so no agent may hand in readings of the card.',
  'gpuWatcher.inForce.setHere': '{who} is the GPU watcher, chosen here.',
  'gpuWatcher.inForce.setHereRetired': 'The GPU watcher chosen here, {who}, is retired, so no agent may hand in readings of the card.',
  'gpuWatcher.inForce.setHereNotRegistered': 'The GPU watcher chosen here, {who}, is not a registered agent, so no agent may hand in readings of the card.',
  'gpuWatcher.inForce.nobody': 'No GPU watcher named, so no agent may report GPU readings.',
  'gpuWatcher.because': 'Reason given: {because}',
  'gpuWatcher.pick': 'GPU watcher',
  'gpuWatcher.pickNobody': 'None',
  'gpuWatcher.save': 'Save',
  'gpuWatcher.nobodyQualifies': 'No agent is registered here, so none can be chosen.',

  // ---- the zip export's question: src/web/components/BundlePanel.tsx and TaskPackagePanel.tsx ----
  // {title} and {fileName} are a record's title and the name the server gave the download. {n} is a
  // count: how many files went, how many named files were not on disk, and how many were left out.
  'zipExport.question': 'Should the related files go too?',
  'zipExport.textOnly': 'The text only',
  'zipExport.textAndFiles': 'The text with its files',
  'zipExport.bundlesFileAndDownload': 'File this and download the zip',
  'zipExport.bundlesDownload': 'Download the zip',
  'zipExport.makeTheZip': 'Make the zip',
  'zipExport.went': { one: '{n} file went with the text', other: '{n} files went with the text' },
  'zipExport.missing': { one: '{n} named file was not on disk', other: '{n} named files were not on disk' },
  'zipExport.leftOut': { one: '{n} file was left out', other: '{n} files were left out' },
  'zipExport.said': '{went}; {missing}; {leftOut}.',
  'zipExport.notRecorded': 'The office recorded the export but not the files that went with it, so this page cannot say what the zip held.',
  'zipExport.noPackage': 'This task has no package, so there is no export entry to read the files from.',

  // ---- the screen's answer recorded on a zip press: the export entry's new fields ----
  // The check and severity are the screen's own stored words; the page draws them through the word
  // list, so a word changed later reaches entries written before the change.
  'record.field.screening': 'screening',
  'record.field.findings': 'findings',
  'record.field.ranChecks': 'checks that ran',
  'record.field.check': 'check',
  'record.field.severity': 'severity',
  'record.field.where': 'where',
  'record.field.line': 'line',
  'record.field.startColumn': 'first column',
  'record.field.endColumn': 'last column',
} as const
