import type { OpenAction, OpenActionAvailability, ProjectListItem } from "../lib/types";
import { ProjectRowActions } from "./ProjectRowActions";
import { StatusBadge } from "./StatusBadge";

type Props = {
  projects: ProjectListItem[];
  selectedProjectId: string | null;
  openActions: OpenActionAvailability[];
  onSelect(projectId: string): void;
  onOpen(projectId: string, action: OpenAction): void;
};

export function ProjectTable({ projects, selectedProjectId, openActions, onSelect, onOpen }: Props) {
  return (
    <section className="library" data-od-id="project-library" aria-label="项目列表">
      <div className="library-head" aria-hidden="true">
        <span>项目</span>
        <span>技术栈</span>
        <span>状态</span>
        <span>打开方式</span>
      </div>
      {projects.length === 0 ? (
        <div className="empty-state">
          <strong>还没有匹配的项目</strong>
          <span>添加扫描根或调整搜索条件后再试。</span>
        </div>
      ) : (
        projects.map((project) => (
          <article
            className={`project-row ${project.id === selectedProjectId ? "is-selected" : ""}`}
            role="button"
            tabIndex={0}
            key={project.id}
            onClick={() => onSelect(project.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(project.id);
              }
            }}
          >
            <span className="project-title">
              <strong>{project.favorite ? "★ " : ""}{project.name}</strong>
              <span className="path">{project.path}</span>
            </span>
            <span className="tags">
              {(project.techStacks.length ? project.techStacks : project.tags).slice(0, 4).map((tag) => (
                <span className="tag" key={tag}>{tag}</span>
              ))}
            </span>
            <StatusBadge status={project.status} />
            <ProjectRowActions
              availability={openActions}
              disabled={project.status === "missing"}
              onOpen={(action) => onOpen(project.id, action)}
            />
          </article>
        ))
      )}
    </section>
  );
}
