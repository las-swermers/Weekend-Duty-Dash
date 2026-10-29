// Empty persisted selection is the explicit "All" choice, not a request for
// an arbitrary default dorm. Resolve against fresh data so new dorms appear.
export function resolveDormSelection(
  selected: ReadonlySet<string>,
  available: string[],
): ReadonlySet<string> {
  return selected.size > 0 ? selected : new Set(available);
}
