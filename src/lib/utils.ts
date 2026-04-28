export function cn(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(" ");
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function severityFor(count: number): "low" | "mid" | "high" {
  if (count === 0) return "low";
  if (count <= 2) return "mid";
  return "high";
}
