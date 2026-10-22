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

/**
 * Used when a published article has no cover image yet. The build must not fail for a cosmetic gap (it would take the whole
 * site down for one article); the card shows the brand image instead and the build log says which article needs a cover.
 */
export const DEFAULT_COVER: Media = { src: '/og-default.png', width: 1200, height: 630, alt: '' };
