import { describe, expect, it } from "vitest";
import {
  GENERIC_MESSAGE,
  QUOTA_EXCEEDED_MESSAGE,
  describeVideoSearchError,
} from "../videoSearchError";

const apiError = (status: number, reason?: string) => ({
  response: {
    status,
    data: reason
      ? { error: { errors: [{ reason }], message: "boom" } }
      : { error: { message: "boom" } },
  },
});

describe("describeVideoSearchError", () => {
  it.each(["quotaExceeded", "dailyLimitExceeded"])(
    "explains that the quota is exhausted for %s",
    (reason) => {
      expect(describeVideoSearchError(apiError(403, reason))).toBe(
        QUOTA_EXCEEDED_MESSAGE
      );
    }
  );

  it("mentions when the quota resets, since retrying will not help", () => {
    expect(QUOTA_EXCEEDED_MESSAGE).toMatch(/midnight US Pacific/i);
  });

  it.each([
    "keyInvalid",
    "ipRefererBlocked",
    "forbidden",
    "accessNotConfigured",
  ])("reports a rejected key for %s", (reason) => {
    expect(describeVideoSearchError(apiError(403, reason))).toMatch(
      /API key was rejected/i
    );
  });

  it("falls back to the quota explanation for an unlabelled 403", () => {
    expect(describeVideoSearchError(apiError(403))).toBe(
      QUOTA_EXCEEDED_MESSAGE
    );
  });

  it("asks the user to slow down on 429", () => {
    expect(describeVideoSearchError(apiError(429))).toMatch(/too many/i);
  });

  it("reports a connectivity problem when there is no response", () => {
    expect(describeVideoSearchError(new Error("Network Error"))).toMatch(
      /could not reach youtube/i
    );
  });

  it.each([[null], [undefined]])("survives a %p error", (err) => {
    expect(describeVideoSearchError(err)).toBe(GENERIC_MESSAGE);
  });

  it("falls back to the generic message for an unexpected status", () => {
    expect(describeVideoSearchError(apiError(500))).toBe(GENERIC_MESSAGE);
  });

  it("never returns an empty string", () => {
    const cases = [
      null,
      new Error("x"),
      apiError(403, "quotaExceeded"),
      apiError(500),
      { response: { status: 403, data: null } },
    ];

    for (const c of cases) {
      expect(describeVideoSearchError(c).length).toBeGreaterThan(0);
    }
  });
});
