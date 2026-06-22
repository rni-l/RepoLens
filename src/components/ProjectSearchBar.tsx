import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { ProjectStatus, TagNode } from "../lib/types";
import { TagTreeSelector } from "./TagTreeSelector";

type FilterKey = "all" | ProjectStatus | "favorite";
type TagFilterMode = "include" | "exclude";
const SEARCH_DEBOUNCE_MS = 250;

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "全部" },
  { key: "active", label: "活跃" },
  { key: "experimental", label: "实验" },
  { key: "missing", label: "缺失" },
  { key: "favorite", label: "收藏" }
];

type Props = {
  query: string;
  activeFilter: FilterKey;
  tags: TagNode[];
  selectedTagIds: string[];
  tagFilterMode: TagFilterMode;
  onQueryChange(query: string): void;
  onFilterChange(filter: FilterKey): void;
  onTagFilterChange(tagIds: string[]): void;
  onTagFilterModeChange(mode: TagFilterMode): void;
};

export function ProjectSearchBar({
  query,
  activeFilter,
  tags,
  selectedTagIds,
  tagFilterMode,
  onQueryChange,
  onFilterChange,
  onTagFilterChange,
  onTagFilterModeChange
}: Props) {
  const [draftQuery, setDraftQuery] = useState(query);
  const selectedTags = tags.filter((tag) => selectedTagIds.includes(tag.id));
  const modeLabel = tagFilterMode === "include" ? "包含" : "排除";

  useEffect(() => {
    setDraftQuery(query);
  }, [query]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (draftQuery !== query) {
        onQueryChange(draftQuery);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [draftQuery, onQueryChange, query]);

  return (
    <section className="toolbar" data-od-id="filters">
      <label className="search-box" aria-label="搜索项目">
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          placeholder="搜索名称、路径、标签、技术栈或启动命令"
          autoComplete="off"
          value={draftQuery}
          onChange={(event) => setDraftQuery(event.target.value)}
        />
      </label>
      <div className="filters" aria-label="项目筛选">
        {FILTERS.map((filter) => (
          <button
            className={`chip ${activeFilter === filter.key ? "is-active" : ""}`}
            type="button"
            key={filter.key}
            onClick={() => onFilterChange(filter.key)}
          >
            {filter.label}
          </button>
        ))}
        <button
          className={`chip ${tagFilterMode === "exclude" ? "is-active" : ""}`}
          type="button"
          aria-pressed={tagFilterMode === "exclude"}
          onClick={() => onTagFilterModeChange(tagFilterMode === "include" ? "exclude" : "include")}
        >
          反选排除
        </button>
      </div>
      <div className="tag-filter-panel">
        <div className="tag-filter-head">
          <span>{modeLabel}标签子树</span>
          <button className="text-btn" type="button" disabled={!selectedTagIds.length} onClick={() => onTagFilterChange([])}>
            清空
          </button>
        </div>
        <TagTreeSelector
          tags={tags}
          selectedTagIds={selectedTagIds}
          onChange={onTagFilterChange}
          density="compact"
          searchPlaceholder="搜索筛选标签"
          emptyText="先在标签面板创建标签。"
          ariaLabel="项目筛选标签树"
        />
      </div>
      {selectedTags.length ? (
        <div className="active-tag-filters">
          <span className={`filter-mode-pill ${tagFilterMode === "exclude" ? "is-exclude" : ""}`}>
            当前{modeLabel}
          </span>
          {selectedTags.map((tag) => (
            <button
              className="chip is-active"
              type="button"
              key={tag.id}
              title={tag.path}
              onClick={() => onTagFilterChange(selectedTagIds.filter((id) => id !== tag.id))}
            >
              {tag.path.replaceAll("/", " / ")}<X size={13} />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export type { FilterKey, TagFilterMode };
