// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "../../testing/componentTestSetup";
import {
  FIRST_PAGE,
  buildToneCloudQuery,
  clampPage,
  nextPage,
  previousPage,
  useToneCloudSearch,
} from "../toneCloudSearch";

describe("buildToneCloudQuery", () => {
  it("includes the trimmed keyword and the page", () => {
    expect(buildToneCloudQuery("  blues lead  ", 3)).toEqual({
      page: 3,
      keyword: "blues lead",
    });
  });

  it("still sends an empty keyword so a previous search can be cleared", () => {
    // SparkAPI merges queries into one long-lived object and maps "" to null.
    // Omitting the key entirely would leave the old keyword in effect.
    const query = buildToneCloudQuery("", FIRST_PAGE);

    expect(query).toHaveProperty("keyword");
    expect(query.keyword).toBe("");
  });

  it.each([
    [null as any, ""],
    [undefined as any, ""],
    ["   ", ""],
  ])("normalises a %p keyword to an empty string", (input, expected) => {
    expect(buildToneCloudQuery(input, FIRST_PAGE).keyword).toBe(expected);
  });

  it.each([
    [0, FIRST_PAGE],
    [-5, FIRST_PAGE],
    [1.7, 1],
    [4, 4],
  ])("clamps page %p to %p", (input, expected) => {
    expect(buildToneCloudQuery("x", input).page).toBe(expected);
  });
});

describe("page arithmetic", () => {
  it.each([
    [NaN, FIRST_PAGE],
    [Infinity, FIRST_PAGE],
    [0, FIRST_PAGE],
    [2, 2],
  ])("clampPage(%p) is %p", (input, expected) => {
    expect(clampPage(input)).toBe(expected);
  });

  it("advances to the next page", () => {
    expect(nextPage(1)).toBe(2);
    expect(nextPage(7)).toBe(8);
  });

  it("never goes below the first page", () => {
    expect(previousPage(3)).toBe(2);
    expect(previousPage(FIRST_PAGE)).toBe(FIRST_PAGE);
    expect(previousPage(-10)).toBe(FIRST_PAGE);
  });
});

const setup = () => {
  const load = vi.fn();
  const view = renderHook(() => useToneCloudSearch(load));
  return { load, view };
};

describe("useToneCloudSearch", () => {
  it("starts on the first page with an empty keyword and loads nothing", () => {
    const { load, view } = setup();

    expect(view.result.current.keyword).toBe("");
    expect(view.result.current.page).toBe(FIRST_PAGE);
    expect(view.result.current.isFirstPage).toBe(true);
    // Mounting must not fire a request; the modal decides when to populate.
    expect(load).not.toHaveBeenCalled();
  });

  it("searches the current keyword from page one", () => {
    const { load, view } = setup();

    act(() => view.result.current.setKeyword("metal"));
    act(() => view.result.current.search());

    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith({ page: FIRST_PAGE, keyword: "metal" });
  });

  it("resets to page one when a new search runs", () => {
    const { load, view } = setup();

    act(() => view.result.current.search());
    act(() => view.result.current.goNext());
    act(() => view.result.current.goNext());
    expect(view.result.current.page).toBe(3);

    act(() => view.result.current.setKeyword("funk"));
    act(() => view.result.current.search());

    expect(view.result.current.page).toBe(FIRST_PAGE);
    expect(load).toHaveBeenLastCalledWith({
      page: FIRST_PAGE,
      keyword: "funk",
    });
  });

  it("pages forward carrying the keyword", () => {
    const { load, view } = setup();

    act(() => view.result.current.setKeyword("clean"));
    act(() => view.result.current.search());
    act(() => view.result.current.goNext());

    expect(view.result.current.page).toBe(2);
    expect(load).toHaveBeenLastCalledWith({ page: 2, keyword: "clean" });
  });

  it("pages backward and reports the first page", () => {
    const { view } = setup();

    act(() => view.result.current.search());
    act(() => view.result.current.goNext());
    act(() => view.result.current.goNext());

    act(() => view.result.current.goPrevious());

    expect(view.result.current.page).toBe(2);
    expect(view.result.current.isFirstPage).toBe(false);

    act(() => view.result.current.goPrevious());

    expect(view.result.current.page).toBe(FIRST_PAGE);
    expect(view.result.current.isFirstPage).toBe(true);
  });

  it("does not re-request when already on the first page", () => {
    const { load, view } = setup();

    act(() => view.result.current.goPrevious());

    expect(view.result.current.page).toBe(FIRST_PAGE);
    expect(load).not.toHaveBeenCalled();
  });

  it("uses the latest keyword rather than a stale closure", () => {
    const { load, view } = setup();

    act(() => view.result.current.setKeyword("first"));
    act(() => view.result.current.search());
    act(() => view.result.current.setKeyword("second"));
    act(() => view.result.current.goNext());

    expect(load).toHaveBeenLastCalledWith({ page: 2, keyword: "second" });
  });
});

describe("hasSearched", () => {
  it("is false before anything is searched", () => {
    const { view } = setup();

    expect(view.result.current.hasSearched).toBe(false);
  });

  it("becomes true after a search", () => {
    const { view } = setup();

    act(() => view.result.current.search());

    expect(view.result.current.hasSearched).toBe(true);
  });
});

describe("paging before any search", () => {
  // Reported from real use: the ToneCloud tab opened empty, and pressing the Next
  // arrow showed results — page 2 of an unfiltered listing, with page 1 skipped.
  it("does not load anything when Next is pressed before searching", () => {
    const { load, view } = setup();

    act(() => view.result.current.goNext());

    expect(load).not.toHaveBeenCalled();
    expect(view.result.current.page).toBe(FIRST_PAGE);
    expect(view.result.current.hasSearched).toBe(false);
  });

  it("does not load anything when Previous is pressed before searching", () => {
    const { load, view } = setup();

    act(() => view.result.current.goPrevious());

    expect(load).not.toHaveBeenCalled();
  });
});
