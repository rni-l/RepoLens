import type { CSSProperties } from "react";
import type { TagNode } from "../lib/types";

type Props = {
  tags: TagNode[];
  selectedTagIds: string[];
  onChange(tagIds: string[]): void;
};

export function ProjectTagPicker({ tags, selectedTagIds, onChange }: Props) {
  const selected = new Set(selectedTagIds);

  function toggleTag(tagId: string) {
    if (selected.has(tagId)) {
      onChange(selectedTagIds.filter((id) => id !== tagId));
      return;
    }
    onChange([...selectedTagIds, tagId]);
  }

  return (
    <div className="tag-picker">
      {tags.length === 0 ? (
        <p className="muted">先在标签面板创建一个标签。</p>
      ) : (
        tags.map((tag) => (
          <label className="tag-choice" key={tag.id} style={{ "--tag-depth": tag.depth } as CSSProperties}>
            <input
              type="checkbox"
              checked={selected.has(tag.id)}
              onChange={() => toggleTag(tag.id)}
            />
            <span title={tag.path}>{tag.path.replaceAll("/", " / ")}</span>
          </label>
        ))
      )}
    </div>
  );
}
