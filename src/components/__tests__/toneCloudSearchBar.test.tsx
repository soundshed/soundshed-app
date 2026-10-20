// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import "../../testing/componentTestSetup";
import ToneCloudSearchBar from "../soundshed/tone-cloud-search";

type BarProps = React.ComponentProps<typeof ToneCloudSearchBar>;

const renderBar = (overrides: Partial<BarProps> = {}) => {
  const props: BarProps = {
    keyword: "",
    onKeywordChange: vi.fn(),
    onSearch: vi.fn(),
    onPrevious: vi.fn(),
    onNext: vi.fn(),
    page: 1,
    isFirstPage: true,
    isSearching: false,
    canPage: true,
    ...overrides,
  };

  const utils = render(<ToneCloudSearchBar {...props} />);
  return { ...utils, props };
};

const field = () =>
  screen.getByRole("searchbox", { name: /search tonecloud/i }) as HTMLInputElement;

describe("ToneCloudSearchBar", () => {
  it("shows the current keyword", () => {
    renderBar({ keyword: "crunch" });

    expect(field().value).toBe("crunch");
  });

  it("reports each keystroke to the parent", async () => {
    const user = userEvent.setup();
    const { props } = renderBar();

    await user.type(field(), "ab");

    // Controlled input: the parent owns the value, so each keystroke is
    // reported against the unchanged "" prop.
    expect(props.onKeywordChange).toHaveBeenCalledTimes(2);
    expect(props.onKeywordChange).toHaveBeenNthCalledWith(1, "a");
  });

  it("searches when the button is clicked", async () => {
    const user = userEvent.setup();
    const { props } = renderBar({ keyword: "lead" });

    await user.click(screen.getByRole("button", { name: /^search$/i }));

    expect(props.onSearch).toHaveBeenCalledTimes(1);
  });

  it("searches when Enter is pressed in the field", async () => {
    const user = userEvent.setup();
    const { props } = renderBar({ keyword: "lead" });

    await user.type(field(), "{Enter}");

    expect(props.onSearch).toHaveBeenCalledTimes(1);
  });

  it("does not search on ordinary typing", async () => {
    const user = userEvent.setup();
    const { props } = renderBar();

    await user.type(field(), "abc");

    expect(props.onSearch).not.toHaveBeenCalled();
  });

  it("shows the current page number", () => {
    renderBar({ page: 4, isFirstPage: false });

    expect(screen.getByText("Page 4")).toBeTruthy();
  });

  it("disables Previous on the first page", () => {
    renderBar({ isFirstPage: true });

    const previous = screen.getByRole("button", {
      name: /previous page/i,
    }) as HTMLButtonElement;

    expect(previous.disabled).toBe(true);
  });

  it("enables Previous beyond the first page and reports clicks", async () => {
    const user = userEvent.setup();
    const { props } = renderBar({ page: 2, isFirstPage: false });

    await user.click(screen.getByRole("button", { name: /previous page/i }));

    expect(props.onPrevious).toHaveBeenCalledTimes(1);
  });

  it("reports Next clicks", async () => {
    const user = userEvent.setup();
    const { props } = renderBar();

    await user.click(screen.getByRole("button", { name: /next page/i }));

    expect(props.onNext).toHaveBeenCalledTimes(1);
  });

  it("shows a spinner instead of the page number while searching", () => {
    renderBar({ page: 2, isFirstPage: false, isSearching: true });

    expect(screen.queryByText("Page 2")).toBeNull();
    expect(screen.getByRole("status", { name: /searching/i })).toBeTruthy();
  });

  it("locks every control while a search is in flight", () => {
    renderBar({ page: 2, isFirstPage: false, isSearching: true });

    for (const name of [/^search$/i, /previous page/i, /next page/i]) {
      const button = screen.getByRole("button", { name }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    }
  });

  it("renders its icons as inline svg", () => {
    // Inline svg cannot regress the way the FontAwesome default imports did.
    const { container } = renderBar();

    expect(container.querySelectorAll("svg").length).toBe(3);
  });
});

describe("ToneCloudSearchBar paging before a search", () => {
  it.each([/previous page/i, /next page/i])(
    "disables %s until a search has run",
    (name) => {
      renderBar({ canPage: false, isFirstPage: false });

      expect(
        (screen.getByRole("button", { name }) as HTMLButtonElement).disabled
      ).toBe(true);
    }
  );

  it("does not page when the disabled Next arrow is clicked", async () => {
    const user = userEvent.setup();
    const { props } = renderBar({ canPage: false });

    await user.click(screen.getByRole("button", { name: /next page/i }));

    expect(props.onNext).not.toHaveBeenCalled();
  });

  it("enables Next once a search has run", () => {
    renderBar({ canPage: true });

    expect(
      (screen.getByRole("button", { name: /next page/i }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
  });

  it("keeps Search available before any search", () => {
    renderBar({ canPage: false });

    expect(
      (screen.getByRole("button", { name: /^search$/i }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
  });
});
