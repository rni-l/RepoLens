import { memo, useEffect, useRef } from "react";
import { ArrowDown, ArrowUp, Pin } from "lucide-react";
import type { ProjectSort, ProjectSortKey } from "../lib/projectSort";
import type {
  OpenAction,
  OpenActionAvailability,
  ProjectListItem,
  ProjectPriority,
} from "../lib/types";
import { LINK_ENV_LABELS } from "./ProjectLinksEditor";
import { ProjectRowActions } from "./ProjectRowActions";

export const PRIORITY_LABELS: Record<ProjectPriority, string> = {
  0: "无",
  1: "低",
  2: "中",
  3: "高",
};

const SORT_OPTIONS: Array<{ key: ProjectSortKey; label: string }> = [
  { key: "updated", label: "最后更新" },
  { key: "created", label: "创建时间" },
  { key: "priority", label: "优先级" },
];

const INTERACTIVE_ROW_TARGET_SELECTOR = [
  "button",
  "input",
  "select",
  "textarea",
  "a",
  "[role='button']",
  "[data-row-interactive='true']"
].join(",");

type Props = {
  projects: ProjectListItem[];
  activeProjectId: string | null;
  selectedProjectIds: string[];
  openActions: OpenActionAvailability[];
  sort: ProjectSort;
  onSortChange(sort: ProjectSort): void;
  onSelect(projectId: string): void;
  onToggleProject(projectId: string, checked: boolean): void;
  onToggleAll(): void;
  onTogglePin(projectId: string): void;
  onOpen(projectId: string, action: OpenAction): void;
  onOpenUrl(url: string): void;
};

export function ProjectTable({
  projects,
  activeProjectId,
  selectedProjectIds,
  openActions,
  sort,
  onSortChange,
  onSelect,
  onToggleProject,
  onToggleAll,
  onTogglePin,
  onOpen,
  onOpenUrl,
}: Props) {
  const selected = new Set(selectedProjectIds);
  const allVisibleSelected =
    projects.length > 0 &&
    projects.every((project) => selected.has(project.id));
  const hasPartialSelection =
    selectedProjectIds.length > 0 && !allVisibleSelected;
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = hasPartialSelection;
    }
  }, [hasPartialSelection]);

  return (
    <section
      className="table-card"
      data-od-id="project-library"
      aria-label="项目列表"
    >
      <div className="sort-bar" role="group" aria-label="项目排序">
        <span className="sort-label">排序</span>
        {SORT_OPTIONS.map((option) => {
          const active = sort.key === option.key;
          const DirectionIcon = sort.direction === "desc" ? ArrowDown : ArrowUp;
          return (
            <button
              className={`sort-chip ${active ? "is-active" : ""}`}
              type="button"
              key={option.key}
              aria-pressed={active}
              title={active ? `当前${sort.direction === "desc" ? "降序" : "升序"}，点击切换` : `按${option.label}排序`}
              onClick={() =>
                onSortChange(
                  active
                    ? { key: option.key, direction: sort.direction === "desc" ? "asc" : "desc" }
                    : { key: option.key, direction: "desc" }
                )
              }
            >
              {option.label}
              {active ? <DirectionIcon size={13} aria-hidden="true" /> : null}
            </button>
          );
        })}
        <span className="sort-hint">置顶项目始终在最前</span>
      </div>
      {projects.length === 0 ? (
        <div className="empty-state">
          <strong>还没有匹配的项目</strong>
          <span>添加扫描根或调整搜索条件后再试。</span>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th className="col-check">
                <input
                  ref={headerCheckboxRef}
                  type="checkbox"
                  checked={allVisibleSelected}
                  aria-label="选择当前列表全部项目"
                  onChange={onToggleAll}
                />
              </th>
              <th className="col-project">项目</th>
              <th className="col-tags">标签</th>
              <th className="col-time col-created">创建时间</th>
              <th className="col-time">最后更新</th>
              <th className="col-open">打开方式</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                isActive={project.id === activeProjectId}
                isChecked={selected.has(project.id)}
                openActions={openActions}
                onSelect={onSelect}
                onToggleProject={onToggleProject}
                onTogglePin={onTogglePin}
                onOpen={onOpen}
                onOpenUrl={onOpenUrl}
              />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

type ProjectRowProps = {
  project: ProjectListItem;
  isActive: boolean;
  isChecked: boolean;
  openActions: OpenActionAvailability[];
  onSelect(projectId: string): void;
  onToggleProject(projectId: string, checked: boolean): void;
  onTogglePin(projectId: string): void;
  onOpen(projectId: string, action: OpenAction): void;
  onOpenUrl(url: string): void;
};

/** Memoized: with hundreds of rows, re-rendering every row on each toast or drawer toggle was noticeable. */
const ProjectRow = memo(function ProjectRow({
  project,
  isActive,
  isChecked,
  openActions,
  onSelect,
  onToggleProject,
  onTogglePin,
  onOpen,
  onOpenUrl,
}: ProjectRowProps) {
  return (
    <tr
      className={`${isActive || isChecked ? "is-selected" : ""} ${project.pinned ? "is-pinned" : ""}`}
      tabIndex={0}
      onClick={(event) => {
        if (isInteractiveRowTarget(event.target)) {
          return;
        }
        onSelect(project.id);
      }}
      onKeyDown={(event) => {
        if (isInteractiveRowTarget(event.target)) {
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(project.id);
        }
      }}
    >
      <td
        className="col-check"
        data-row-interactive="true"
        onMouseDown={(event) => {
          event.nativeEvent.stopImmediatePropagation();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.nativeEvent.stopImmediatePropagation();
          event.stopPropagation();
          onToggleProject(project.id, !isChecked);
        }}
        onDoubleClick={(event) => {
          event.nativeEvent.stopImmediatePropagation();
          event.stopPropagation();
        }}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <label
          className="row-check"
          data-row-interactive="true"
          onMouseDown={(event) => {
            event.nativeEvent.stopImmediatePropagation();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.nativeEvent.stopImmediatePropagation();
            event.stopPropagation();
          }}
          onDoubleClick={(event) => {
            event.nativeEvent.stopImmediatePropagation();
            event.stopPropagation();
          }}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={isChecked}
            aria-label={`选择 ${project.name}`}
            onClick={(event) => {
              event.nativeEvent.stopImmediatePropagation();
              event.stopPropagation();
            }}
            onChange={(event) => onToggleProject(project.id, event.currentTarget.checked)}
          />
        </label>
      </td>
      <td className="col-project">
        <span className="project-cell">
          <span className="project-title-row">
            <strong className="project-name">
              {project.favorite ? "★ " : ""}
              {project.name}
            </strong>
            {project.priority ? (
              <span className={`priority-badge priority-${project.priority}`} title={`优先级：${PRIORITY_LABELS[project.priority]}`}>
                {PRIORITY_LABELS[project.priority]}优先
              </span>
            ) : null}
            <button
              className={`pin-btn ${project.pinned ? "is-pinned" : ""}`}
              type="button"
              aria-pressed={project.pinned}
              aria-label={project.pinned ? `取消置顶 ${project.name}` : `置顶 ${project.name}`}
              title={project.pinned ? "取消置顶" : "置顶"}
              onClick={() => onTogglePin(project.id)}
            >
              <Pin size={13} aria-hidden="true" />
            </button>
          </span>
          {project.description ? (
            <span className="project-desc" title={project.description}>
              {project.description}
            </span>
          ) : null}
          <span className="path" title={project.path}>{project.path}</span>
          {project.links.length ? (
            <span className="row-links">
              {firstLinkPerEnv(project.links).map((link) => (
                <button
                  className={`env-badge env-${link.env}`}
                  type="button"
                  key={link.id}
                  title={`${link.label ? `${link.label} · ` : ""}${link.url}`}
                  onClick={() => onOpenUrl(link.url)}
                >
                  {LINK_ENV_LABELS[link.env]}
                  {link.port && link.env === "local" ? ` :${link.port}` : ""}
                </button>
              ))}
            </span>
          ) : null}
          <span className="mobile-meta">
            文件夹创建 {formatDateTime(project.createdAt)} · 更新{" "}
            {formatDateTime(project.updatedAt)}
          </span>
        </span>
      </td>
      <td className="col-tags">
        <span className="tags">
          {project.tags.slice(0, 4).map((tag) => (
            <span className="tag" key={tag.id} title={tag.path}>
              {tag.name}
            </span>
          ))}
          {project.tags.length === 0 &&
            project.techStacks.slice(0, 3).map((stack) => (
              <span className="tag tag-muted" key={stack}>
                {stack}
              </span>
            ))}
        </span>
      </td>
      <td className="col-time col-created mono" title="真实文件夹创建时间">
        <DateTimeCell value={project.createdAt} />
      </td>
      <td className="col-time mono" title={`文件夹创建 ${formatDateTime(project.createdAt)}`}>
        <DateTimeCell value={project.updatedAt} />
      </td>
      <td className="col-open">
        <ProjectRowActions
          availability={openActions}
          disabled={project.status === "missing"}
          onOpen={(action) => onOpen(project.id, action)}
        />
      </td>
    </tr>
  );
});

function firstLinkPerEnv(links: ProjectListItem["links"]): ProjectListItem["links"] {
  const seen = new Set<string>();
  return links.filter((link) => !seen.has(link.env) && Boolean(seen.add(link.env)));
}

function DateTimeCell({ value }: { value: string | null }) {
  const [date, time] = formatDateTime(value).split(" ");
  return (
    <span className="datetime">
      <span>{date}</span>
      {time ? <span>{time}</span> : null}
    </span>
  );
}

function isInteractiveRowTarget(target: EventTarget): boolean {
  return target instanceof Element && Boolean(target.closest(INTERACTIVE_ROW_TARGET_SELECTOR));
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
