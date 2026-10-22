/** Short commit SHA of this build, so a deployed URL can be tied to an exact commit (see scripts/qa/smoke.mjs). */
export const BUILD_SHA = (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? 'local').slice(0, 7);
