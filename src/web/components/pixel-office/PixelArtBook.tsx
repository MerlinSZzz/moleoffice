// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { pixelArtPath } from '@shared/pixel-office.ts'
import { sceneWord, type SceneLanguage } from './CForestAssets.ts'

const SHEET_ALT: readonly ['g6c.pixel.artBook.altStates', 'g6c.pixel.artBook.altClothes', 'g6c.pixel.artBook.altAccessories'] = ['g6c.pixel.artBook.altStates', 'g6c.pixel.artBook.altClothes', 'g6c.pixel.artBook.altAccessories']
const SHEET_CAPTION: readonly ['g6c.pixel.artBook.captionStates', 'g6c.pixel.artBook.captionClothes', 'g6c.pixel.artBook.captionAccessories'] = ['g6c.pixel.artBook.captionStates', 'g6c.pixel.artBook.captionClothes', 'g6c.pixel.artBook.captionAccessories']

export function PixelArtBook({ language }: { language: SceneLanguage }) {
  return <details className="px-art-book"><summary>{sceneWord(language, 'g6c.pixel.artBook.summary')}</summary><p className="px-muted">{sceneWord(language, 'g6c.pixel.artBook.lead')}</p>{(['states','clothes','accessories'] as const).map((id,i) => <figure key={id}><a href={pixelArtPath(id)} target="_blank" rel="noreferrer"><img loading="lazy" src={pixelArtPath(id)} alt={sceneWord(language, SHEET_ALT[i]!)}/></a><figcaption>{sceneWord(language, SHEET_CAPTION[i]!)}</figcaption></figure>)}</details>
}
