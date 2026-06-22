import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { ProjectStatus, TagNode } from "../lib/types";

type FilterKey = "all" | ProjectStatus | "favorite";
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
  onQueryChange(query: string): void;
  onFilterChange(filter: FilterKey): void;
  onTagFilterChange(tagIds: string[]): void;
};

export function ProjectSearchBar({
  query,
  activeFilter,
  tags,
  selectedTagIds,
  onQueryChange,
  onFilterChange,
  onTagFilterChange
}: Props) {
  const [draftQuery, setDraftQuery] = useState(query);
  const selectedTags = tags.filter((tag) => selectedTagIds.includes(tag.id));

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

  function addTagFilter(tagId: string) {
    if (!tagId || selectedTagIds.includes(tagId)) return;
    onTagFilterChange([...selectedTagIds, tagId]);
  }

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
        <label className="tag-filter-select">
          <span>标签</span>
          <select value="" onChange={(event) => addTagFilter(event.target.value)}>
            <option value="">按层级标签筛选</option>
            {tags.map((tag) => (
              <option value={tag.id} key={tag.id}>
                {tag.path.replaceAll("/", " / ")}
              </option>
            ))}
          </select>
        </label>
      </div>
      {selectedTags.length ? (
        <div className="active-tag-filters">
          {selectedTags.map((tag) => (
            <button
              className="chip is-active"
              type="button"
              key={tag.id}
              title={tag.path}
              onClick={() => onTagFilterChange(selectedTagIds.filter((id) => id !== tag.id))}
            >
              {tag.name}<X size={13} />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export type { FilterKey };
