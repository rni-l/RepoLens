import { type CSSProperties, useState } from "react";
import { Plus, Search } from "lucide-react";
import { splitTagPath } from "../lib/tagCreate";
import type { TagNode } from "../lib/types";

type Props = {
  tags: TagNode[];
  selectedTagIds: string[];
  disabled?: boolean;
  onChange(tagIds: string[]): void;
  onCreateTag(path: string): Promise<void>;
};

export function ProjectTagPicker({ tags, selectedTagIds, disabled = false, onChange, onCreateTag }: Props) {
  const [query, setQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const selected = new Set(selectedTagIds);
  const normalizedPath = splitTagPath(query).join("/");
  const needle = query.trim().toLowerCase().replace(/\s*\/\s*/g, "/");
  const visibleTags = needle ? tags.filter((tag) => tag.path.toLowerCase().includes(needle)) : tags;
  const canCreate = Boolean(normalizedPath) && !tags.some((tag) => tag.path === normalizedPath);

  function toggleTag(tagId: string) {
    if (selected.has(tagId)) {
      onChange(selectedTagIds.filter((id) => id !== tagId));
      return;
    }
    onChange([...selectedTagIds, tagId]);
  }

  async function createTag() {
    if (!canCreate || isCreating) return;
    setIsCreating(true);
    try {
      await onCreateTag(normalizedPath);
      setQuery("");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="tag-picker-wrap">
      <div className="tag-picker-search">
        <Search size={14} aria-hidden="true" />
        <input
          value={query}
          placeholder="搜索或新建标签，层级用 / 分隔，如 业务领域/AI"
          aria-label="搜索或新建标签"
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            // Enter picks the single match if there is one, otherwise creates the typed path.
            const exact = tags.find((tag) => tag.path === normalizedPath);
            if (exact) {
              if (!selected.has(exact.id)) toggleTag(exact.id);
              setQuery("");
            } else {
              void createTag();
            }
          }}
        />
      </div>
      {canCreate ? (
        <button className="tag-create-option" type="button" disabled={disabled || isCreating} onClick={() => void createTag()}>
          <Plus size={14} />
          <span>
            新建并添加 <strong>{normalizedPath.replaceAll("/", " / ")}</strong>
          </span>
        </button>
      ) : null}
      <div className="tag-picker">
        {tags.length === 0 ? (
          <p className="muted">还没有标签，在上方输入名称即可新建。</p>
        ) : visibleTags.length === 0 ? (
          <p className="muted">没有匹配的标签。</p>
        ) : (
          visibleTags.map((tag) => (
            <label
              className="tag-choice"
              key={tag.id}
              style={{ "--tag-depth": needle ? 0 : tag.depth } as CSSProperties}
            >
              <input
                type="checkbox"
                checked={selected.has(tag.id)}
                disabled={disabled}
                onChange={() => toggleTag(tag.id)}
              />
              <span title={tag.path}>{tag.path.replaceAll("/", " / ")}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
