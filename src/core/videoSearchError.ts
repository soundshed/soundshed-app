/**
 * Turns a failed YouTube Data API call into something worth showing a user.
 *
 * `youtube-search` performs the request with axios, so a failing call rejects
 * with an axios error carrying the API's own JSON error body. The distinction
 * that matters most in practice is a quota exhaustion, because the fix is to
 * wait rather than to retry.
 */

export const QUOTA_EXCEEDED_MESSAGE =
  "The daily YouTube search quota for this site has been used up. It resets at midnight US Pacific time. Your saved favourites still work.";

export const GENERIC_MESSAGE =
  "Backing-track search is temporarily unavailable. Please try again.";

export function describeVideoSearchError(error: any): string {
  if (error == null) return GENERIC_MESSAGE;

  const response = error.response;

  // No response at all: offline, DNS failure, or the request was blocked.
  if (response == null) {
    return "Could not reach YouTube. Check your connection and try again.";
  }

  const apiError = response.data?.error;
  const reason = apiError?.errors?.[0]?.reason;

  if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
    return QUOTA_EXCEEDED_MESSAGE;
  }

  if (
    reason === "keyInvalid" ||
    reason === "ipRefererBlocked" ||
    reason === "forbidden" ||
    reason === "accessNotConfigured"
  ) {
    return "This site's YouTube API key was rejected, so backing-track search is unavailable.";
  }

  if (response.status === 403) {
    // A 403 without a recognised reason is still almost always quota or key
    // related, and those are the only 403s this endpoint returns in practice.
    return QUOTA_EXCEEDED_MESSAGE;
  }

  if (response.status === 429) {
    return "Too many searches at once. Please wait a moment and try again.";
  }

  return GENERIC_MESSAGE;
}
