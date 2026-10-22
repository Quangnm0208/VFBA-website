import type { Media } from './schema';

/** Minimal shape of the metadata Astro returns when a local image file is imported. */
export interface LocalImage {
  src: string;
  width: number;
  height: number;
}

export const localMedia = (image: LocalImage, alt = ''): Media => ({ src: image.src, width: image.width, height: image.height, alt });
