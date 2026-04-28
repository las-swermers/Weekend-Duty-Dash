// Vercel KV-backed resource registry. The dashboard's launchpad reads from
// here; the registry is seeded on first read with the values in
// src/lib/mock.ts → INITIAL_RESOURCES so a fresh deploy renders something
// useful before the AOC has added anything.

import { kv } from "@vercel/kv";

import { INITIAL_RESOURCES } from "@/lib/mock";
import { slugify } from "@/lib/utils";
import type { NewResourceInput, Resource } from "@/types/resource";

const KEY = "resources:v1";

function sortByOrder(list: Resource[]): Resource[] {
  return [...list].sort((a, b) => a.order - b.order);
}

export async function getResources(): Promise<Resource[]> {
  const data = await kv.get<Resource[]>(KEY);
  if (!data) {
    await kv.set(KEY, INITIAL_RESOURCES);
    return sortByOrder(INITIAL_RESOURCES);
  }
  return sortByOrder(data);
}

export async function addResource(input: NewResourceInput): Promise<Resource> {
  const all = await getResources();
  const existingIds = new Set(all.map((r) => r.id));

  let id = slugify(input.name);
  let suffix = 1;
  while (existingIds.has(id)) {
    suffix += 1;
    id = `${slugify(input.name)}-${suffix}`;
  }

  const newResource: Resource = {
    id,
    name: input.name,
    url: input.url,
    icon: input.icon,
    category: input.category,
    addedBy: input.addedBy,
    addedAt: new Date().toISOString(),
    order: input.order ?? all.length,
  };
  await kv.set(KEY, [...all, newResource]);
  return newResource;
}

export async function updateResource(
  id: string,
  patch: Partial<Omit<Resource, "id">>,
): Promise<Resource | null> {
  const all = await getResources();
  let updated: Resource | null = null;
  const next = all.map((r) => {
    if (r.id !== id) return r;
    updated = { ...r, ...patch };
    return updated;
  });
  if (!updated) return null;
  await kv.set(KEY, next);
  return updated;
}

export async function deleteResource(id: string): Promise<boolean> {
  const all = await getResources();
  const next = all.filter((r) => r.id !== id);
  if (next.length === all.length) return false;
  await kv.set(KEY, next);
  return true;
}
