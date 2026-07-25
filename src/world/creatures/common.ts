import * as THREE from '../../gl';
import { PixelSprite } from '../../gfx/sprites/painter';

export interface CreatureSounds {
  frogHop(pan: number, near: number): void;
}

export type FramePair = [THREE.SpriteMaterial, THREE.SpriteMaterial];

export function frameMaterials(frames: [PixelSprite, PixelSprite]): FramePair {
  return [
    new THREE.SpriteMaterial({ map: frames[0].texture, transparent: true, alphaTest: 0.5, fog: true }),
    new THREE.SpriteMaterial({ map: frames[1].texture, transparent: true, alphaTest: 0.5, fog: true }),
  ];
}
