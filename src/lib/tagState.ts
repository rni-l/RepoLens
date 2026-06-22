export function pruneSelectedTagIds(selectedTagIds: string[], validTagIds: Iterable<string>): string[] {
  if (selectedTagIds.length === 0) {
    return selectedTagIds;
  }

  const valid = new Set(validTagIds);
  const next = selectedTagIds.filter((tagId) => valid.has(tagId));
  return next.length === selectedTagIds.length ? selectedTagIds : next;
}
