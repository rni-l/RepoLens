import type { ProjectStatus } from "../lib/types";

type FilterKey = "all" | ProjectStatus | "favorite";

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
  onQueryChange(query: string): void;
  onFilterChange(filter: FilterKey): void;
};

export function ProjectSearchBar({ query, activeFilter, onQueryChange, onFilterChange }: Props) {
  return (
    <section className="toolbar" data-od-id="filters">
      <label className="search-box" aria-label="搜索项目">
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          placeholder="搜索名称、路径、标签、技术栈或启动命令"
          autoComplete="off"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
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
      </div>
    </section>
  );
}

export type { FilterKey };
