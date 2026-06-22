import { useEffect, useRef } from "react";
import type {
  OpenAction,
  OpenActionAvailability,
  ProjectListItem,
} from "../lib/types";
import { ProjectRowActions } from "./ProjectRowActions";
import { StatusBadge } from "./StatusBadge";

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
  onSelect(projectId: string): void;
  onToggleProject(projectId: string, checked: boolean): void;
  onToggleAll(): void;
  onOpen(projectId: string, action: OpenAction): void;
};

export function ProjectTable({
  projects,
  activeProjectId,
  selectedProjectIds,
  openActions,
  onSelect,
  onToggleProject,
  onToggleAll,
  onOpen,
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
              <th className="col-status">状态</th>
              <th className="col-time">创建时间</th>
              <th className="col-time">最后更新</th>
              <th className="col-open">打开方式</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr
                className={`${project.id === activeProjectId || selected.has(project.id) ? "is-selected" : ""}`}
                tabIndex={0}
                key={project.id}
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
                    onToggleProject(project.id, !selected.has(project.id));
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
                      checked={selected.has(project.id)}
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
                    <strong className="project-name">
                      {project.favorite ? "★ " : ""}
                      {project.name}
                    </strong>
                    <span className="path">{project.path}</span>
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
                <td className="col-status">
                  <StatusBadge status={project.status} />
                </td>
                <td className="col-time mono" title="真实文件夹创建时间">
                  {formatDateTime(project.createdAt)}
                </td>
                <td className="col-time mono">
                  {formatDateTime(project.updatedAt)}
                </td>
                <td className="col-open">
                  <ProjectRowActions
                    availability={openActions}
                    disabled={project.status === "missing"}
                    onOpen={(action) => onOpen(project.id, action)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
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
