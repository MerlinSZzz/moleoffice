// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// The old key comes from src/web/lib/renamedkeys.ts and the current key from
// PresetBar.STORAGE_PREFIX. tests/the-starting-office-uses-its-theme.test.ts guards both.
try {
  var earlyTheme = localStorage.getItem('mole-office.preset.theme')
  if (earlyTheme === null) earlyTheme = localStorage.getItem('panelx.preset.theme')
  if (earlyTheme === 'light' || earlyTheme === 'dark') document.documentElement.setAttribute('data-boot-theme', earlyTheme)
} catch (unavailable) {
  // The app's storage reader will report the refusal; the early page follows the system.
}
