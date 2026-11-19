// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { SecretariatAssembly } from './native-assembly.ts'

// The repaired exact recipe was supplied before this commit.
// Source SHA-256: 1c5024f9408a6f8f09ad34b5b4d2e77a17e7ec524768a118242582048c5d5368
// The two 104-row side extensions repeat the exact native row without seams.
// Since that recipe, the laptop and lamp that hung on the back wall are gone.
// The B42 board is left out because it is drawn turned, and this map uses only
// pieces that face the room.
export const secretariatAssembly: SecretariatAssembly = {
  "width": 728,
  "height": 520,
  "parts": [
    {
      "sprite": "B04-floor",
      "crop": {
        "x": 52,
        "y": 78,
        "width": 624,
        "height": 260
      },
      "x": 52,
      "y": 78,
      "layer": "floor",
      "depth": 78
    },
    {
      "sprite": "B04-floor",
      "crop": {
        "x": 52,
        "y": 130,
        "width": 624,
        "height": 104
      },
      "x": 52,
      "y": 338,
      "layer": "floor",
      "depth": 338
    },
    {
      "sprite": "B04-floor",
      "crop": {
        "x": 52,
        "y": 234,
        "width": 624,
        "height": 26
      },
      "x": 52,
      "y": 442,
      "layer": "floor",
      "depth": 442
    },
    {
      "sprite": "B04-floor",
      "crop": {
        "x": 260,
        "y": 260,
        "width": 208,
        "height": 52
      },
      "x": 260,
      "y": 468,
      "layer": "floor",
      "depth": 468
    },
    {
      "sprite": "B04-back",
      "x": 0,
      "y": 0,
      "layer": "back",
      "crop": {
        "x": 0,
        "y": 0,
        "width": 728,
        "height": 338
      },
      "depth": 0
    },
    {
      "sprite": "lantern",
      "x": 215,
      "y": 440,
      "layer": "object",
      "depth": 440
    },
    {
      "sprite": "lantern",
      "x": 475,
      "y": 440,
      "layer": "object",
      "depth": 440
    },
    {
      "sprite": "B04-back",
      "crop": {
        "x": 0,
        "y": 338,
        "width": 52,
        "height": 26
      },
      "x": 0,
      "y": 442,
      "layer": "back",
      "depth": 442
    },
    {
      "sprite": "B04-back",
      "crop": {
        "x": 676,
        "y": 338,
        "width": 52,
        "height": 26
      },
      "x": 676,
      "y": 442,
      "layer": "back",
      "depth": 442
    },
    {
      "sprite": "B04-front",
      "crop": {
        "x": 52,
        "y": 338,
        "width": 52,
        "height": 26
      },
      "x": 52,
      "y": 442,
      "layer": "front",
      "depth": 520
    },
    {
      "sprite": "B04-front",
      "crop": {
        "x": 52,
        "y": 338,
        "width": 52,
        "height": 26
      },
      "x": 104,
      "y": 442,
      "layer": "front",
      "depth": 520
    },
    {
      "sprite": "B04-front",
      "crop": {
        "x": 52,
        "y": 338,
        "width": 52,
        "height": 26
      },
      "x": 156,
      "y": 442,
      "layer": "front",
      "depth": 520
    },
    {
      "sprite": "B04-front",
      "crop": {
        "x": 52,
        "y": 338,
        "width": 52,
        "height": 26
      },
      "x": 208,
      "y": 442,
      "layer": "front",
      "depth": 520
    },
    {
      "sprite": "B04-front",
      "crop": {
        "x": 52,
        "y": 338,
        "width": 52,
        "height": 26
      },
      "x": 468,
      "y": 442,
      "layer": "front",
      "depth": 520
    },
    {
      "sprite": "B04-front",
      "crop": {
        "x": 52,
        "y": 338,
        "width": 52,
        "height": 26
      },
      "x": 520,
      "y": 442,
      "layer": "front",
      "depth": 520
    },
    {
      "sprite": "B04-front",
      "crop": {
        "x": 52,
        "y": 338,
        "width": 52,
        "height": 26
      },
      "x": 572,
      "y": 442,
      "layer": "front",
      "depth": 520
    },
    {
      "sprite": "B04-front",
      "crop": {
        "x": 52,
        "y": 338,
        "width": 52,
        "height": 26
      },
      "x": 624,
      "y": 442,
      "layer": "front",
      "depth": 520
    },
    {
      "sprite": "B04-front",
      "crop": {
        "x": 104,
        "y": 298,
        "width": 13,
        "height": 40
      },
      "x": 247,
      "y": 402,
      "layer": "front",
      "depth": 520
    },
    {
      "sprite": "B04-front",
      "crop": {
        "x": 195,
        "y": 298,
        "width": 13,
        "height": 40
      },
      "x": 468,
      "y": 402,
      "layer": "front",
      "depth": 520
    }
  ],
  "desks": [
    {
      "x": 62,
      "y": 160
    },
    {
      "x": 292,
      "y": 160
    },
    {
      "x": 522,
      "y": 160
    },
    {
      "x": 90,
      "y": 310
    },
    {
      "x": 494,
      "y": 310
    }
  ],
  "walkable": [
    {
      "x": 52,
      "y": 78,
      "width": 624,
      "height": 364
    },
    {
      "x": 260,
      "y": 442,
      "width": 208,
      "height": 78
    }
  ],
  "entrance": {
    "x": 260,
    "y": 442,
    "width": 208,
    "height": 78
  }
}
for (const x of [0, 676]) for (let y = 338; y < 442; y++) {
  (secretariatAssembly.parts as import('./native-assembly.ts').NativePart[]).push({ sprite: 'B04-back', x, y, layer: 'back', depth: y, crop: { x, y: 337, width: 52, height: 1 } })
}
