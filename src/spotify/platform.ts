/**
 * Phones and tablets. Spotify's Web Playback SDK doesn't support mobile browsers,
 * so there the page only acts as a remote for a Spotify Connect device.
 * iPadOS reports itself as a Mac, hence the touch check.
 */
export const IS_MOBILE: boolean =
  typeof navigator !== 'undefined' &&
  (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1));
