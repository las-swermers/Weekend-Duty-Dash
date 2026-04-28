export type ResourceCategory =
  | "Reference"
  | "Logistics"
  | "Health & Wellbeing"
  | "Discipline & Accountability"
  | "Communications"
  | "Activities"
  | "Admin";

export const CATEGORIES: ResourceCategory[] = [
  "Reference",
  "Logistics",
  "Health & Wellbeing",
  "Discipline & Accountability",
  "Communications",
  "Activities",
  "Admin",
];

export interface Resource {
  id: string;
  name: string;
  url: string;
  icon: string;
  category: ResourceCategory;
  addedBy: string;
  addedAt: string;
  order: number;
}

export type NewResourceInput = Omit<Resource, "id" | "addedAt" | "order"> & {
  order?: number;
};
