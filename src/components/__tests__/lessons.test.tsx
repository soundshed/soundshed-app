// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../../testing/componentTestSetup";
import { LessonStateStore } from "../../stores/lessonstate";

const getVideoSearchResults = vi.fn();

// lessons.tsx pulls lessonManager from components/app, which would drag in the
// whole application (routing, electron bridges, device managers) on import.
vi.mock("../app", () => ({
  lessonManager: {
    getVideoSearchResults: (...args: any[]) => getVideoSearchResults(...args),
    storeFavourite: vi.fn(),
    deleteFavourite: vi.fn(),
    loadFavourites: vi.fn(),
  },
}));

vi.mock("react-player/youtube", () => ({ default: () => null }));

vi.mock("../../env", () => ({
  default: { YoutubeAPIKey: "test-key", IsWebMode: true },
}));

import LessonsControl from "../lessons";

const setState = (patch: Record<string, any>) =>
  LessonStateStore.update((s) => Object.assign(s, patch));

const resetStore = () =>
  setState({
    searchResults: [],
    favourites: [],
    playingVideoUrl: null,
    isSearching: false,
    searchError: null,
    hasSearched: false,
  });

const searchBox = () => screen.getByPlaceholderText(/search backing tracks/i);

describe("Jam backing-track search", () => {
  beforeEach(() => {
    getVideoSearchResults.mockReset();
    getVideoSearchResults.mockResolvedValue([]);
    resetStore();
  });

  describe("triggering a search", () => {
    it("searches when Enter is pressed in the field", async () => {
      const user = userEvent.setup();
      render(<LessonsControl />);
      getVideoSearchResults.mockClear();

      await user.type(searchBox(), "enter sandman{Enter}");

      expect(getVideoSearchResults).toHaveBeenCalledWith(
        false,
        "backing track enter sandman"
      );
    });

    it("searches when the button is clicked", async () => {
      const user = userEvent.setup();
      render(<LessonsControl />);
      getVideoSearchResults.mockClear();

      await user.type(searchBox(), "enter sandman");
      await user.click(screen.getByRole("button", { name: /^search$/i }));

      expect(getVideoSearchResults).toHaveBeenCalledWith(
        false,
        "backing track enter sandman"
      );
    });

    it("does not search on every keystroke", async () => {
      const user = userEvent.setup();
      render(<LessonsControl />);
      getVideoSearchResults.mockClear();

      await user.type(searchBox(), "blues");

      expect(getVideoSearchResults).not.toHaveBeenCalled();
    });

    it("falls back to a plain query when the box is blank", async () => {
      const user = userEvent.setup();
      render(<LessonsControl />);
      getVideoSearchResults.mockClear();

      await user.type(searchBox(), "   {Enter}");

      expect(getVideoSearchResults).toHaveBeenCalledWith(
        false,
        "backing track"
      );
    });

    it("ignores a second search while one is already running", async () => {
      const user = userEvent.setup();
      setState({ isSearching: true });
      render(<LessonsControl />);
      getVideoSearchResults.mockClear();

      await user.type(searchBox(), "x{Enter}");

      expect(getVideoSearchResults).not.toHaveBeenCalled();
    });
  });

  describe("populating on open", () => {
    it("requests results when there are none", () => {
      render(<LessonsControl />);

      expect(getVideoSearchResults).toHaveBeenCalledWith(true, "backing track");
    });

    it("does not re-request when results are already present", () => {
      setState({
        searchResults: [
          {
            itemId: "a",
            url: "u",
            title: "Track",
            channelTitle: "C",
            description: "",
            thumbnailUrl: "t",
            channelId: "c",
            datePublished: new Date(),
          },
        ],
      });

      render(<LessonsControl />);

      expect(getVideoSearchResults).not.toHaveBeenCalled();
    });
  });

  describe("reporting state", () => {
    it("shows the failure message and hides the result list", () => {
      setState({ searchError: "Quota is gone." });
      render(<LessonsControl />);

      expect(screen.getByRole("alert")).toHaveTextContent("Quota is gone.");
      expect(screen.queryByText(/no results yet/i)).toBeNull();
    });

    it("offers a retry that runs the search again", async () => {
      const user = userEvent.setup();
      setState({ searchError: "Quota is gone." });
      render(<LessonsControl />);
      getVideoSearchResults.mockClear();

      await user.click(screen.getByRole("button", { name: /try again/i }));

      expect(getVideoSearchResults).toHaveBeenCalledTimes(1);
    });

    it("shows a busy indicator and disables the button while searching", () => {
      setState({ isSearching: true });
      render(<LessonsControl />);

      expect(screen.getByRole("status", { name: /searching/i })).toBeTruthy();
      expect(
        (screen.getByRole("button", { name: /^search$/i }) as HTMLButtonElement)
          .disabled
      ).toBe(true);
    });

    it("says nothing has been searched yet before the first search", () => {
      render(<LessonsControl />);

      expect(screen.getByText(/no results yet/i)).toBeTruthy();
    });

    it("says nothing matched once a search has run", () => {
      setState({ hasSearched: true });
      render(<LessonsControl />);

      expect(screen.getByText(/no backing tracks matched/i)).toBeTruthy();
    });

    it("says it is searching while a search is in flight", () => {
      setState({ isSearching: true });
      render(<LessonsControl />);

      expect(screen.getByText(/searching/i)).toBeTruthy();
    });
  });
});
