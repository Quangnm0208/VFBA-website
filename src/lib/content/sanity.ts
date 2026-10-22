/**
 * Sanity Content Lake reader (build time) + Sanity Assets CDN URL builder.
 *
 * The browser never talks to the Content Lake: pages are prerendered, and images are plain
 * https://cdn.sanity.io URLs generated here (resized, WebP/AVIF via `auto=format`, honouring crop/hotspot).
 */
import { createClient } from '@sanity/client';
import { createImageUrlBuilder } from '@sanity/image-url';
import { PUBLIC_SANITY_API_VERSION, PUBLIC_SANITY_DATASET, PUBLIC_SANITY_PROJECT_ID } from 'astro:env/client';
import { SANITY_API_READ_TOKEN } from 'astro:env/server';
import type { Media } from './schema';

export const sanityConfigured = (): boolean => Boolean(PUBLIC_SANITY_PROJECT_ID);

let client: ReturnType<typeof createClient> | undefined;
export function sanityClient() {
  if (!PUBLIC_SANITY_PROJECT_ID) throw new Error('PUBLIC_SANITY_PROJECT_ID is not set.');
  return (client ??= createClient({
    projectId: PUBLIC_SANITY_PROJECT_ID,
    dataset: PUBLIC_SANITY_DATASET,
    apiVersion: PUBLIC_SANITY_API_VERSION,
    // Build-time reads: skip the API CDN so a deploy triggered by a webhook never sees stale content.
    useCdn: false,
    perspective: 'published',
    token: SANITY_API_READ_TOKEN,
  }));
}

/** Raw image value as returned by GROQ (`asset` stays an unresolved reference). */
export interface SanityImageValue {
  alt?: string | null;
  asset?: { _ref?: string } | null;
  crop?: { top: number; bottom: number; left: number; right: number } | null;
  hotspot?: { x: number; y: number; width: number; height: number } | null;
}

const WIDTHS = [400, 800, 1200, 1600];
const REF = /^image-[A-Za-z0-9]+-(\d+)x(\d+)-[a-z0-9]+$/;

/** Convert a Sanity image value into a render-ready Media, or undefined when no asset is set. */
export function toMedia(image: SanityImageValue | null | undefined, maxWidth = 1600): Media | undefined {
  const ref = image?.asset?._ref;
  if (!image || !ref) return undefined;
  const match = REF.exec(ref);
  if (!match) return undefined;
  const crop = image.crop ?? { top: 0, bottom: 0, left: 0, right: 0 };
  const fullW = Number(match[1]) * (1 - crop.left - crop.right);
  const fullH = Number(match[2]) * (1 - crop.top - crop.bottom);
  const builder = createImageUrlBuilder({ projectId: PUBLIC_SANITY_PROJECT_ID!, dataset: PUBLIC_SANITY_DATASET });
  const url = (w: number) => builder.image(image as never).width(w).fit('max').auto('format').url();
  const widths = WIDTHS.filter((w) => w <= Math.min(fullW, maxWidth));
  if (!widths.length) widths.push(Math.round(Math.min(fullW, maxWidth)));
  const largest = widths[widths.length - 1]!;
  return {
    src: url(largest),
    width: Math.round(Math.min(fullW, largest)),
    height: Math.round((Math.min(fullW, largest) * fullH) / fullW),
    alt: image.alt ?? '',
    srcset: widths.map((w) => `${url(w)} ${w}w`).join(', '),
  };
}
