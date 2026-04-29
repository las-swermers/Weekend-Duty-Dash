export interface Resource {
  id: string;
  name: string;
  url: string;
  icon: string;
  addedBy: string;
  addedAt: string;
  order: number;
}

export type NewResourceInput = Omit<Resource, "id" | "addedAt" | "order"> & {
  order?: number;
};
