import { useEffect, useRef, useState } from "react";
import { Pin } from "lucide-react";
import { createTagPath } from "../lib/tagCreate";
import type { AiTaggingStatus, ProjectDetail, ProjectPriority, ProjectUpdatePatch, TagNode } from "../lib/types";
import { api } from "../lib/tauri";
import { AiTagSuggestionPanel } from "./AiTagSuggestionPanel";
import { ProjectLinksEditor } from "./ProjectLinksEditor";
import { PRIORITY_LABELS } from "./ProjectTable";
import { ProjectTagPicker } from "./ProjectTagPicker";

const TAG_SOURCE_TITLES = { rule: "规则自动打标", agent: "AI 打标" } as const;
const PRIORITY_OPTIONS: ProjectPriority[] = [3, 2, 1, 0];

type Props = {
  project: ProjectDetail | null;
  tags: TagNode[];
  aiStatus: AiTaggingStatus | null;
  onCopyPath(path: string): void;
  onSuggestionApplied(project: ProjectDetail): void;
  onProjectChanged(project: ProjectDetail, message: string): void;
  onError(message: string): void;
};

export function ProjectDetailPanel({
  project,
  tags,
  aiStatus,
  onCopyPath,
  onSuggestionApplied,
  onProjectChanged,
  onError
}: Props) {
  const [description, setDescription] = useState("");
  const [startCommand, setStartCommand] = useState("");
  const [testCommand, setTestCommand] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [isSavingFields, setIsSavingFields] = useState(false);
  const tagSaveSeq = useRef(0);
  const tagSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const projectRef = useRef(project);
  projectRef.current = project;

  const tagKey = project?.tags.map((tag) => tag.id).join(",") ?? "";
  const autoTagCount = project?.tags.filter((tag) => tag.source === "rule" || tag.source === "agent").length ?? 0;
  const fieldsDirty =
    Boolean(project) &&
    (description !== (project?.description ?? "") ||
      (startCommand.trim() || null) !== (project?.startCommand ?? null) ||
      (testCommand.trim() || null) !== (project?.testCommand ?? null));

  // Text drafts and tag selection reset independently, so saving tags never wipes unsaved text.
  useEffect(() => {
    setDescription(project?.description ?? "");
    setStartCommand(project?.startCommand ?? "");
    setTestCommand(project?.testCommand ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, project?.description, project?.startCommand, project?.testCommand]);

  useEffect(() => {
    setSelectedTagIds(project?.tags.map((tag) => tag.id) ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, tagKey]);

  async function saveFields() {
    if (!project || isSavingFields) return;
    setIsSavingFields(true);
    try {
      const next = await api.updateProject(project.id, {
        description,
        startCommand: startCommand.trim() || null,
        testCommand: testCommand.trim() || null
      });
      onProjectChanged(next, "已保存，后续扫描不会覆盖");
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSavingFields(false);
    }
  }

  async function saveRank(patch: Pick<ProjectUpdatePatch, "pinned" | "priority">, message: string) {
    if (!project) return;
    try {
      onProjectChanged(await api.updateProject(project.id, patch), message);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }

  /** Saves immediately; saves run one at a time and only the latest result is applied. */
  function changeTags(tagIds: string[], message = "标签已保存") {
    const projectId = projectRef.current?.id;
    if (!projectId) return;
    setSelectedTagIds(tagIds);
    const seq = ++tagSaveSeq.current;
    tagSaveQueue.current = tagSaveQueue.current.then(async () => {
      try {
        const next = await api.updateProject(projectId, { tagIds });
        if (seq === tagSaveSeq.current) {
          onProjectChanged(next, message);
        }
      } catch (error) {
        onError(error instanceof Error ? error.message : String(error));
        if (seq === tagSaveSeq.current) {
          setSelectedTagIds(projectRef.current?.tags.map((tag) => tag.id) ?? []);
        }
      }
    });
  }

  async function createAndAddTag(path: string) {
    try {
      const tag = await createTagPath(path, tags);
      changeTags(Array.from(new Set([...selectedTagIds, tag.id])), `已新建并添加标签 ${tag.path}`);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }

  async function clearAutoTags() {
    if (!project) return;
    try {
      onProjectChanged(await api.clearAutoTags(project.id), "已清除自动标签");
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <section className="panel" data-od-id="project-detail">
      <div className="panel-head">
        <h2>字段维护</h2>
        <button className="btn" type="button" disabled={!project} onClick={() => project && onCopyPath(project.path)}>
          复制路径
        </button>
      </div>
      <div className="panel-body">
        {project ? (
          <>
            <div className="detail-title">
              <strong>{project.name}</strong>
              <span className="path">{project.path}</span>
            </div>
            <div className="rank-row">
              <button
                className={`btn pin-toggle ${project.pinned ? "is-pinned" : ""}`}
                type="button"
                aria-pressed={project.pinned}
                onClick={() => void saveRank({ pinned: !project.pinned }, project.pinned ? "已取消置顶" : "已置顶")}
              >
                <Pin size={14} aria-hidden="true" /> {project.pinned ? "已置顶" : "置顶"}
              </button>
              <div className="priority-picker" role="radiogroup" aria-label="优先级">
                <span>优先级</span>
                {PRIORITY_OPTIONS.map((priority) => (
                  <button
                    className={`priority-option priority-${priority} ${project.priority === priority ? "is-active" : ""}`}
                    type="button"
                    role="radio"
                    aria-checked={project.priority === priority}
                    key={priority}
                    onClick={() => {
                      if (project.priority !== priority) {
                        void saveRank({ priority }, priority ? `优先级已设为${PRIORITY_LABELS[priority]}` : "已清除优先级");
                      }
                    }}
                  >
                    {PRIORITY_LABELS[priority]}
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              <span>描述</span>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>
            <label className="field">
              <span>启动命令</span>
              <input value={startCommand} onChange={(event) => setStartCommand(event.target.value)} />
            </label>
            <label className="field">
              <span>测试命令</span>
              <input value={testCommand} onChange={(event) => setTestCommand(event.target.value)} />
            </label>
            <button
              className="btn btn-primary"
              type="button"
              disabled={!fieldsDirty || isSavingFields}
              onClick={() => void saveFields()}
            >
              {isSavingFields ? "保存中…" : fieldsDirty ? "保存描述和命令" : "描述和命令已保存"}
            </button>
            <ProjectLinksEditor project={project} onChanged={onProjectChanged} onError={onError} />
            <div className="field">
              <span>项目标签 <em className="field-hint">勾选即保存</em></span>
              <ProjectTagPicker
                tags={tags}
                selectedTagIds={selectedTagIds}
                onChange={(tagIds) => changeTags(tagIds)}
                onCreateTag={createAndAddTag}
              />
            </div>
            <div className="tags tag-paths">
              {project.tags.map((tag) => {
                const auto = tag.source === "rule" || tag.source === "agent";
                return (
                  <span
                    className={`tag ${auto ? "tag-auto" : ""}`}
                    key={tag.id}
                    title={auto ? `${tag.path} · ${TAG_SOURCE_TITLES[tag.source as "rule" | "agent"]}` : tag.path}
                  >
                    {tag.path.replaceAll("/", " / ")}
                    {auto ? <em>{tag.source === "rule" ? "规则" : "AI"}</em> : null}
                  </span>
                );
              })}
              {autoTagCount ? (
                <button className="text-btn" type="button" onClick={() => void clearAutoTags()}>
                  清除自动标签
                </button>
              ) : null}
            </div>
            <div className="tags">
              {project.techStacks.map((stack) => (
                <span className="tag tag-muted" key={stack}>{stack}</span>
              ))}
            </div>
            <AiTagSuggestionPanel
              project={project}
              status={aiStatus}
              onApplied={onSuggestionApplied}
              onError={onError}
            />
          </>
        ) : (
          <p className="muted">选择一个项目查看详情。</p>
        )}
      </div>
    </section>
  );
}
