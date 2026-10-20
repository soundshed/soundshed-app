// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LessonManager, VIDEO_SEARCH_CACHE_KEY } from "../lessonManager";
import { LessonStateStore } from "../../stores/lessonstate";
import { QUOTA_EXCEEDED_MESSAGE } from "../videoSearchError";
import { VideoSearchResult } from "../videoSearchApi";

const aResult = (id: string): VideoSearchResult => ({
  url: `https://www.youtube.com/watch?v=${id}`,
  itemId: id,
  datePublished: new Date("2024-01-01"),
  channelId: "chan",
  channelTitle: "Channel",
  title: `Track ${id}`,
  description: "",
  thumbnailUrl: "https://example.test/t.jpg",
});

const quotaError = () => ({
  response: {
    status: 403,
    data: { error: { errors: [{ reason: "quotaExceeded" }] } },
  },
});

const makeManager = (search: any) => new LessonManager({ search });

const resetStore = () =>
  LessonStateStore.update((s) => {
    s.searchResults = [];
    s.favourites = [];
    s.playingVideoUrl = null;
    s.isSearching = false;
    s.searchError = null;
    s.hasSearched = false;
  });

describe("LessonManager.getVideoSearchResults", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
  });

  describe("cache handling", () => {
    it("serves a non-empty cache without calling the API", async () => {
      const cached = [aResult("a")];
      localStorage.setItem(VIDEO_SEARCH_CACHE_KEY, JSON.stringify(cached));
      const search = vi.fn();

      const result = await makeManager(search).getVideoSearchResults(
        true,
        "backing track"
      );

      expect(search).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(LessonStateStore.getRawState().searchResults).toHaveLength(1);
    });

    it("treats an empty cached array as a miss and searches anyway", async () => {
      // Regression: caching [] permanently wedged the Jam tab. The mount
      // effect only refreshes when there are no results, and the cache
      // satisfied that request with the same empty array, so the tab showed
      // "No results yet" forever and never issued another request.
      localStorage.setItem(VIDEO_SEARCH_CACHE_KEY, "[]");
      const search = vi.fn().mockResolvedValue([aResult("a"), aResult("b")]);

      const result = await makeManager(search).getVideoSearchResults(
        true,
        "backing track"
      );

      expect(search).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(2);
      expect(LessonStateStore.getRawState().searchResults).toHaveLength(2);
    });

    it("recovers from a corrupt cache instead of throwing", async () => {
      localStorage.setItem(VIDEO_SEARCH_CACHE_KEY, "{not json");
      const search = vi.fn().mockResolvedValue([aResult("a")]);

      const result = await makeManager(search).getVideoSearchResults(
        true,
        "backing track"
      );

      expect(search).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
    });

    it("ignores a cached value that is not an array", async () => {
      localStorage.setItem(VIDEO_SEARCH_CACHE_KEY, '{"nope":true}');
      const search = vi.fn().mockResolvedValue([aResult("a")]);

      await makeManager(search).getVideoSearchResults(true, "backing track");

      expect(search).toHaveBeenCalledTimes(1);
    });

    it("skips the cache entirely when preferCached is false", async () => {
      localStorage.setItem(
        VIDEO_SEARCH_CACHE_KEY,
        JSON.stringify([aResult("cached")])
      );
      const search = vi.fn().mockResolvedValue([aResult("fresh")]);

      const result = await makeManager(search).getVideoSearchResults(
        false,
        "backing track blues"
      );

      expect(search).toHaveBeenCalledWith("backing track blues");
      expect(result[0].itemId).toBe("fresh");
    });

    it("caches successful results for next time", async () => {
      const search = vi.fn().mockResolvedValue([aResult("a")]);

      await makeManager(search).getVideoSearchResults(false, "q");

      const stored = JSON.parse(
        localStorage.getItem(VIDEO_SEARCH_CACHE_KEY) as string
      );
      expect(stored).toHaveLength(1);
    });
  });

  describe("failure handling", () => {
    it("surfaces a quota failure instead of rejecting silently", async () => {
      const search = vi.fn().mockRejectedValue(quotaError());

      const result = await makeManager(search).getVideoSearchResults(false, "q");

      expect(result).toEqual([]);
      const state = LessonStateStore.getRawState();
      expect(state.searchError).toBe(QUOTA_EXCEEDED_MESSAGE);
      expect(state.isSearching).toBe(false);
    });

    it("does not reject, so callers cannot produce an unhandled rejection", async () => {
      const search = vi.fn().mockRejectedValue(new Error("network"));

      await expect(
        makeManager(search).getVideoSearchResults(false, "q")
      ).resolves.toEqual([]);
    });

    it("leaves a failed search out of the cache", async () => {
      localStorage.setItem(
        VIDEO_SEARCH_CACHE_KEY,
        JSON.stringify([aResult("good")])
      );
      const search = vi.fn().mockRejectedValue(quotaError());

      await makeManager(search).getVideoSearchResults(false, "q");

      const stored = JSON.parse(
        localStorage.getItem(VIDEO_SEARCH_CACHE_KEY) as string
      );
      expect(stored[0].itemId).toBe("good");
    });

    it("clears a previous error once a search succeeds", async () => {
      const failing = makeManager(vi.fn().mockRejectedValue(quotaError()));
      await failing.getVideoSearchResults(false, "q");
      expect(LessonStateStore.getRawState().searchError).not.toBeNull();

      const working = makeManager(vi.fn().mockResolvedValue([aResult("a")]));
      await working.getVideoSearchResults(false, "q");

      expect(LessonStateStore.getRawState().searchError).toBeNull();
    });
  });

  describe("progress reporting", () => {
    it("flags a search as in progress while it runs", async () => {
      let release: (v: VideoSearchResult[]) => void;
      const pending = new Promise<VideoSearchResult[]>((r) => (release = r));
      const search = vi.fn().mockReturnValue(pending);

      const inFlight = makeManager(search).getVideoSearchResults(false, "q");

      expect(LessonStateStore.getRawState().isSearching).toBe(true);

      release!([aResult("a")]);
      await inFlight;

      expect(LessonStateStore.getRawState().isSearching).toBe(false);
    });

    it("records that a search has happened, so the empty state can differ", async () => {
      expect(LessonStateStore.getRawState().hasSearched).toBe(false);

      const search = vi.fn().mockResolvedValue([]);
      await makeManager(search).getVideoSearchResults(false, "q");

      expect(LessonStateStore.getRawState().hasSearched).toBe(true);
    });

    it("clears the in-progress flag even when the search throws", async () => {
      const search = vi.fn().mockRejectedValue(new Error("x"));

      await makeManager(search).getVideoSearchResults(false, "q");

      expect(LessonStateStore.getRawState().isSearching).toBe(false);
    });
  });
});
