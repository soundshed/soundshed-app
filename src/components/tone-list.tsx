import React from "react";
import { Tone } from "../core/soundshedApi";
import { appViewModel } from "./app";

type ToneSortMode = "default" | "downloads" | "name";

interface ToneListControlProps {
  toneList: Tone[];
  favourites: Tone[];
  onApplyTone: (tone: Tone) => void;
  onEditTone: (tone: Tone) => void;
  noneMsg?: string;
  enableToneEditor: boolean;
  enableFiltering?: boolean;
}

const ToneListControl = ({
  toneList,
  favourites,
  onApplyTone,
  onEditTone,
  noneMsg,
  enableToneEditor,
  enableFiltering = false,
}: ToneListControlProps) => {
  let noResultsMessage = noneMsg ?? "No results";
  const [keyword, setKeyword] = React.useState("");
  const [sortMode, setSortMode] = React.useState<ToneSortMode>("default");

  const normalizedKeyword = keyword.trim().toLowerCase();

  const toTagArray = (items?: string[]): string[] => {
    return (items ?? [])
      .map((item) => (item ?? "").toString().trim())
      .filter((item) => item.length > 0);
  };

  const getToneTags = (tone: Tone): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];

    const appendUnique = (items?: string[]) => {
      toTagArray(items).forEach((item) => {
        const key = item.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          result.push(item);
        }
      });
    };

    appendUnique(tone.tags);
    appendUnique(tone.categories);
    appendUnique(tone.artists);

    return result;
  };

  const getToneAuthor = (tone: Tone): string => {
    if (tone.author?.trim()) {
      return tone.author.trim();
    }

    return "";
  };

  const getToneDownloadCount = (tone: Tone): number | null => {
    if (tone.downloadCount == null) {
      return null;
    }

    const parsed = Number(tone.downloadCount);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    return Math.max(0, Math.floor(parsed));
  };

  const formatDownloadCount = (value: number): string => {
    return new Intl.NumberFormat().format(value);
  };

  const getSearchBlob = (tone: Tone): string => {
    return [
      tone.name,
      tone.description,
      getToneAuthor(tone),
      getToneTags(tone).join(" "),
    ]
      .filter((value) => value != null)
      .join(" ")
      .toLowerCase();
  };

  const visibleToneList = React.useMemo(() => {
    const source = toneList ?? [];

    const filtered = normalizedKeyword.length == 0
      ? source
      : source.filter((tone) => getSearchBlob(tone).indexOf(normalizedKeyword) > -1);

    if (sortMode == "default") {
      return filtered;
    }

    const sorted = [...filtered];
    if (sortMode == "downloads") {
      sorted.sort((a, b) => {
        const aCount = getToneDownloadCount(a) ?? -1;
        const bCount = getToneDownloadCount(b) ?? -1;

        if (aCount == bCount) {
          return (a.name ?? "").localeCompare(b.name ?? "", undefined, {
            sensitivity: "base",
          });
        }

        return bCount - aCount;
      });
    }

    if (sortMode == "name") {
      sorted.sort((a, b) =>
        (a.name ?? "").localeCompare(b.name ?? "", undefined, {
          sensitivity: "base",
        })
      );
    }

    return sorted;
  }, [toneList, normalizedKeyword, sortMode]);

  const isFavouriteTone = (t: Tone): boolean => {
    if (
      (favourites ?? []).find(
        (f) =>
          f.toneId == t.toneId ||
          (t.toneId != null && f.externalId == t.externalId)
      )
    ) {
      return true;
    } else {
      return false;
    }
  };

  const saveFavourite = (t: Tone) => {
    appViewModel.storeFavourite(t, false);
  };

  const deleteFavourite = (t: Tone) => {
    appViewModel.deleteFavourite(t);
  };

  const formatCategoryTags = (
    items: string[] = [],
    variant: string = "secondary"
  ) => {
    return items.map((i, idx) => (
      <span key={idx} className={`tone-tag tone-tag--${variant}`}>
        {i}
      </span>
    ));
  };

  const renderToneList = () => {
    return visibleToneList.map((tone: Tone) => {
      const tags = getToneTags(tone);
      const author = getToneAuthor(tone);
      const downloadCount = getToneDownloadCount(tone);

      return (
      <div key={tone.toneId ?? tone.externalId ?? tone.name} className="tone-row">

        {/* Play / image column */}
        <div className="tone-play">
          <button className="tone-btn-play" title="Apply tone" onClick={() => onApplyTone(tone)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
          </button>
          {tone.imageUrl && <img src={tone.imageUrl} className="tone-thumb" alt="" />}
        </div>

        {/* Edit button */}
        {enableToneEditor && (
          <div className="tone-edit">
            <button className="tone-btn-icon" title="Edit" onClick={() => onEditTone(tone)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          </div>
        )}

        {/* Name + description */}
        <div className="tone-info">
          <span className="tone-name">{tone.name}</span>
          {tone.description && <span className="tone-desc">{tone.description}</span>}
          {(author || downloadCount != null) && (
            <div className="tone-meta">
              {author && <span className="tone-meta-item">By {author}</span>}
              {downloadCount != null && (
                <span className="tone-meta-item">
                  {formatDownloadCount(downloadCount)} downloads
                </span>
              )}
            </div>
          )}
        </div>

        {/* Tags */}
        <div className="tone-tags">
          {formatCategoryTags(tags, "primary")}
        </div>

        {/* Favourite toggle */}
        <div className="tone-fav">
          {isFavouriteTone(tone) ? (
            <button className="tone-btn-icon tone-btn-danger" title="Remove favourite" onClick={() => deleteFavourite(tone)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
                <path d="M9 6V4h6v2"/>
              </svg>
            </button>
          ) : (
            <button className="tone-btn-icon tone-btn-accent" title="Save favourite" onClick={() => saveFavourite(tone)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </button>
          )}
        </div>

      </div>
    )});
  };

  return (
    <div className="tone-list">
      {enableFiltering && toneList && toneList.length > 0 ? (
        <div className="tone-list-toolbar">
          <input
            className="tone-list-search"
            type="search"
            placeholder="Search tones by keyword"
            value={keyword}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              setKeyword(event.target.value);
            }}
          />
          <select
            className="tone-list-sort"
            value={sortMode}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
              setSortMode(event.target.value as ToneSortMode);
            }}
          >
            <option value="default">Sort: Default</option>
            <option value="downloads">Sort: Downloads</option>
            <option value="name">Sort: Name</option>
          </select>
        </div>
      ) : null}

      {!toneList || toneList.length == 0 ? (
        <div className="tone-list-empty">{noResultsMessage}</div>
      ) : visibleToneList.length == 0 ? (
        <div className="tone-list-empty">No tones match your search.</div>
      ) : (
        <div>{renderToneList()}</div>
      )}
    </div>
  );
};

export default ToneListControl;
