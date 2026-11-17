// Start and goodbye screens come in skins. To add one: write a Start and a Quit
// component (see shared.ts for the flow hooks), add its id to SKIN_IDS in
// types.ts, and register it here. Settings lists whatever is registered.

import type { ComponentType } from 'react';
import type { SkinId } from '../../types';
import { ClassicQuit } from './ClassicQuit';
import { ClassicStart } from './ClassicStart';
import { OrbitQuit } from './OrbitQuit';
import { OrbitStart } from './OrbitStart';
import type { QuitProps, StartProps } from './shared';

export interface Skin {
  name: string;
  description: string;
  Start: ComponentType<StartProps>;
  Quit: ComponentType<QuitProps>;
}

export const SKINS: Record<SkinId, Skin> = {
  orbit: {
    name: 'Orbit',
    description: 'A 3D Earth from low orbit. Continue dives into the planet through a flash.',
    Start: OrbitStart,
    Quit: OrbitQuit,
  },
  classic: {
    name: 'Classic',
    description: 'The game icon among the stars, with a short boot log.',
    Start: ClassicStart,
    Quit: ClassicQuit,
  },
};

export const skinFor = (id: SkinId): Skin => SKINS[id] ?? SKINS.orbit;
