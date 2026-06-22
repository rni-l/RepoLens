import { Plus, Pencil, Trash2, Filter, X } from "lucide-react";
import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import type { TagCreateInput, TagNode, TagUpdatePatch } from "../lib/types";

type Props = {
  tags: TagNode[];
  selectedTagIds: string[];
  onFilterChange(tagIds: string[]): void;
  onCreateTag(input: TagCreateInput): void;
  onUpdateTag(id: string, patch: TagUpdatePatch): void;
  onDeleteTag(id: string): void;
};

export function TagTreePanel({
  tags,
  selectedTagIds,
  onFilterChange,
  onCreateTag,
  onUpdateTag,
  onDeleteTag
}: Props) {
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newParentId, setNewParentId] = useState<string>("");
  const [renameValue, setRenameValue] = useState("");
  const selectedTag = useMemo(
    () => tags.find((tag) => tag.id === selectedTagId) ?? null,
    [selectedTagId, tags]
  );
  const activeFilter = new Set(selectedTagIds);

  function chooseTag(tag: TagNode) {
    setSelectedTagId(tag.id);
    setRenameValue(tag.name);
  }

  function createTag() {
    const parentId = newParentId || null;
    onCreateTag({ name: newName, parentId });
    setNewName("");
  }

  function renameTag() {
    if (!selectedTagId) return;
    onUpdateTag(selectedTagId, { name: renameValue });
  }

  function toggleFilter(tagId: string) {
    if (activeFilter.has(tagId)) {
      onFilterChange(selectedTagIds.filter((id) => id !== tagId));
      return;
    }
    onFilterChange([...selectedTagIds, tagId]);
  }

  return (
    <section className="panel tag-tree-panel" id="tags" data-od-id="tags" tabIndex={-1}>
      <div className="panel-head">
        <h2>标签</h2>
        <button className="tool" type="button" title="清除标签筛选" aria-label="清除标签筛选" onClick={() => onFilterChange([])}>
          <X size={15} />
        </button>
      </div>
      <div className="panel-body">
        <div className="tag-tree">
          {tags.length === 0 ? (
            <p className="muted">还没有标签。</p>
          ) : (
            tags.map((tag) => (
              <article
                className={`tag-tree-row ${selectedTagId === tag.id ? "is-selected" : ""}`}
                key={tag.id}
                style={{ "--tag-depth": tag.depth } as CSSProperties}
              >
                <button type="button" className="tag-tree-name" title={tag.path} onClick={() => chooseTag(tag)}>
                  <span>{tag.name}</span>
                  <small>{tag.projectCount}</small>
                </button>
                <button
                  className={`tool ${activeFilter.has(tag.id) ? "is-active" : ""}`}
                  type="button"
                  title="按此标签筛选"
                  aria-label={`按 ${tag.path} 筛选`}
                  onClick={() => toggleFilter(tag.id)}
                >
                  <Filter size={14} />
                </button>
              </article>
            ))
          )}
        </div>

        <div className="tag-editor">
          <label className="field">
            <span>新标签</span>
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="例如：数据转换"
            />
          </label>
          <label className="field">
            <span>父标签</span>
            <select value={newParentId} onChange={(event) => setNewParentId(event.target.value)}>
              <option value="">根级标签</option>
              {tags.map((tag) => (
                <option value={tag.id} key={tag.id}>
                  {tag.path.replaceAll("/", " / ")}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary" type="button" disabled={!newName.trim()} onClick={createTag}>
            <Plus size={15} /> 新建标签
          </button>
        </div>

        <div className="tag-editor">
          <label className="field">
            <span>重命名选中标签</span>
            <input
              value={renameValue}
              disabled={!selectedTag}
              onChange={(event) => setRenameValue(event.target.value)}
              placeholder="选择左侧标签"
            />
          </label>
          <div className="inline-actions">
            <button className="btn" type="button" disabled={!selectedTag || !renameValue.trim()} onClick={renameTag}>
              <Pencil size={15} /> 重命名
            </button>
            <button
              className="btn btn-danger"
              type="button"
              disabled={!selectedTag}
              onClick={() => selectedTag && onDeleteTag(selectedTag.id)}
            >
              <Trash2 size={15} /> 删除
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
