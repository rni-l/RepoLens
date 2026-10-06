import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import type { TagNode } from "../lib/types";
import { orderTagsForTree } from "../lib/tagState";

type Props = {
  tags: TagNode[];
  selectedTagIds: string[];
  onChange(tagIds: string[]): void;
  density?: "compact" | "comfortable";
  disabled?: boolean;
  className?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  ariaLabel?: string;
};

export function TagTreeSelector({
  tags,
  selectedTagIds,
  onChange,
  density = "comfortable",
  disabled = false,
  className = "",
  searchPlaceholder = "搜索标签名称或路径",
  emptyText = "先创建标签后再选择。",
  ariaLabel = "层级标签选择"
}: Props) {
  const [query, setQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(tags.filter((tag) => tag.depth === 0).map((tag) => tag.id)));

  const selected = useMemo(() => new Set(selectedTagIds), [selectedTagIds]);
  const orderedTags = useMemo(() => orderTagsForTree(tags), [tags]);
  const tagById = useMemo(() => new Map(orderedTags.map((tag) => [tag.id, tag])), [orderedTags]);
  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, TagNode[]>();
    for (const tag of orderedTags) {
      const siblings = map.get(tag.parentId) ?? [];
      siblings.push(tag);
      map.set(tag.parentId, siblings);
    }
    return map;
  }, [orderedTags]);

  const visibleTagIds = useMemo(() => {
    const trimmed = normalizeSearch(query);
    if (!trimmed) {
      return null;
    }
    const visible = new Set<string>();
    for (const tag of orderedTags) {
      if (!normalizeSearch(`${tag.name} ${tag.path}`).includes(trimmed)) {
        continue;
      }
      let current: TagNode | undefined = tag;
      while (current) {
        visible.add(current.id);
        current = current.parentId ? tagById.get(current.parentId) : undefined;
      }
    }
    return visible;
  }, [orderedTags, query, tagById]);

  useEffect(() => {
    setExpandedIds((current) => {
      const valid = new Set(orderedTags.map((tag) => tag.id));
      const next = new Set(Array.from(current).filter((id) => valid.has(id)));
      for (const tag of orderedTags) {
        if (tag.depth === 0) {
          next.add(tag.id);
        }
      }
      for (const tagId of selectedTagIds) {
        let currentTag = tagById.get(tagId);
        while (currentTag?.parentId) {
          next.add(currentTag.parentId);
          currentTag = tagById.get(currentTag.parentId);
        }
      }
      return next;
    });
  }, [orderedTags, selectedTagIds, tagById]);

  function toggleTag(tagId: string) {
    if (disabled) {
      return;
    }
    const next = selected.has(tagId)
      ? selectedTagIds.filter((id) => id !== tagId)
      : [...selectedTagIds, tagId];
    onChange(orderTagIds(next, orderedTags));
  }

  function toggleExpanded(tagId: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  }

  function renderTag(tag: TagNode): JSX.Element | null {
    if (visibleTagIds && !visibleTagIds.has(tag.id)) {
      return null;
    }
    const children = childrenByParent.get(tag.id) ?? [];
    const hasChildren = children.length > 0;
    const expanded = Boolean(visibleTagIds) || expandedIds.has(tag.id);
    return (
      <div className="tag-selector-branch" key={tag.id}>
        <div
          className={`tag-selector-node ${selected.has(tag.id) ? "is-selected" : ""}`}
          style={{ "--tag-depth": tag.depth } as CSSProperties}
          role="treeitem"
          aria-level={tag.depth + 1}
          aria-expanded={hasChildren ? expanded : undefined}
          aria-selected={selected.has(tag.id)}
        >
          <button
            className="tag-selector-expander"
            type="button"
            aria-label={expanded ? "收起子标签" : "展开子标签"}
            disabled={!hasChildren}
            onClick={() => toggleExpanded(tag.id)}
          >
            {hasChildren ? expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : null}
          </button>
          <label className="tag-selector-choice">
            <input
              type="checkbox"
              checked={selected.has(tag.id)}
              disabled={disabled}
              onChange={() => toggleTag(tag.id)}
            />
            <span className="tag-selector-main">
              <strong>{tag.name}</strong>
              <small title={tag.path}>{tag.path.replaceAll("/", " / ")}</small>
            </span>
            <span className="count">{tag.projectCount}</span>
          </label>
        </div>
        {hasChildren && expanded ? children.map((child) => renderTag(child)) : null}
      </div>
    );
  }

  const rendered = (childrenByParent.get(null) ?? []).map((tag) => renderTag(tag)).filter(Boolean);

  return (
    <div className={`tag-tree-selector tag-tree-selector-${density} ${className}`}>
      <label className="tag-selector-search" aria-label="搜索标签">
        <Search size={14} aria-hidden="true" />
        <input
          type="search"
          value={query}
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchPlaceholder}
          autoComplete="off"
        />
        {query ? (
          <button className="tag-selector-clear" type="button" aria-label="清空标签搜索" onClick={() => setQuery("")}>
            <X size={13} />
          </button>
        ) : null}
      </label>
      <div className="tag-selector-tree" role="tree" aria-label={ariaLabel}>
        {tags.length === 0 ? (
          <p className="muted">{emptyText}</p>
        ) : rendered.length ? (
          rendered
        ) : (
          <p className="muted">没有匹配的标签。</p>
        )}
      </div>
    </div>
  );
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase().replace(/\s*\/\s*/g, "/");
}

function orderTagIds(tagIds: string[], tags: TagNode[]): string[] {
  const selected = new Set(tagIds);
  return tags.filter((tag) => selected.has(tag.id)).map((tag) => tag.id);
}
