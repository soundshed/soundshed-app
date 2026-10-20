import React from "react";

interface ToneCloudSearchBarProps {
  keyword: string;
  onKeywordChange: (keyword: string) => void;
  onSearch: () => void;
  onPrevious: () => void;
  onNext: () => void;
  page: number;
  isFirstPage: boolean;
  isSearching: boolean;

  /** False until a search has run. Paging before then would skip straight to page 2. */
  canPage: boolean;
}

const ToneCloudSearchBar = ({
  keyword,
  onKeywordChange,
  onSearch,
  onPrevious,
  onNext,
  page,
  isFirstPage,
  isSearching,
  canPage,
}: ToneCloudSearchBarProps) => {
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onSearch();
    }
  };

  return (
    <div className="ss-search" role="search">
      <div className="ss-search-field">
        <svg
          className="ss-search-icon"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="16.5" y1="16.5" x2="21" y2="21" />
        </svg>
        <input
          type="search"
          className="ss-search-input"
          placeholder="Search ToneCloud by keyword"
          aria-label="Search ToneCloud by keyword"
          value={keyword}
          onChange={(event) => onKeywordChange(event.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>

      <button
        type="button"
        className="ss-search-btn"
        onClick={onSearch}
        disabled={isSearching}
      >
        Search
      </button>

      <div className="ss-search-paging">
        <button
          type="button"
          className="ss-page-btn"
          onClick={onPrevious}
          disabled={!canPage || isFirstPage || isSearching}
          aria-label="Previous page"
          title="Previous page"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <span className="ss-page-label" aria-live="polite">
          {isSearching ? (
            <span
              className="spinner-border spinner-border-sm"
              role="status"
              aria-label="Searching"
            ></span>
          ) : (
            `Page ${page}`
          )}
        </span>

        <button
          type="button"
          className="ss-page-btn"
          onClick={onNext}
          disabled={!canPage || isSearching}
          aria-label="Next page"
          title="Next page"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default ToneCloudSearchBar;
