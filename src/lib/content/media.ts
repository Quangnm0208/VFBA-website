import type { Media } from './schema';

/** Minimal shape of the metadata Astro returns when a local image file is imported. */
export interface LocalImage {
  src: string;
  width: number;
  height: number;
}

const sources = new Map<string, LocalImage>();

/** Local seed images are registered so <Media> can generate width variants at build time (see Media.astro). */
export const localMedia = (image: LocalImage, alt = ''): Media => {
  sources.set(image.src, image);
  return { src: image.src, width: image.width, height: image.height, alt };
};
export const localSource = (src: string): LocalImage | undefined => sources.get(src);
