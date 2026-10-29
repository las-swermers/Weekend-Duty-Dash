import type { WarningsResponse } from "@/types/warnings";

export interface Subscription {
  id: string;
  name: string;
  dormId: number;
  dormName: string;
  recipients: string[];
  warnings: boolean;
  analytics: boolean;
  expanded: boolean;
  weekday: number;
  enabled: boolean;
  updatedAt: string;
  updatedBy: string;
}
export interface Count {
  label: string;
  count: number;
}
export interface DormAnalytics {
  total: number;
  uniqueStudents: number;
  categories: Count[];
  daily: Count[];
  trend: Count[];
  restCheckins: number;
  restingStudents: number;
  restEvents: {
    name: string;
    when: string;
    location: string;
    action: string;
  }[];
}
export interface ReportData {
  name: string;
  dorm: string;
  week: string;
  label: string;
  generatedAt: string;
  warnings?: WarningsResponse;
  analytics?: DormAnalytics;
  expanded: boolean;
}
export interface Delivery {
  email: string;
  firstAttemptAt?: string;
  providerId?: string;
  error?: string;
}
export interface ReportRun {
  id: string;
  subscriptionId: string;
  subscriptionVersion: string;
  week: string;
  name: string;
  kind: "weekly" | "test" | "preview";
  createdAt: string;
  html: string;
  text: string;
  from: string;
  subject: string;
  deliveries: Delivery[];
}
export interface RunSummary {
  snapshotAvailable: boolean;
  id: string;
  subscriptionId: string;
  name: string;
  week: string;
  kind: ReportRun["kind"];
  createdAt: string;
  accepted: number;
  total: number;
  errors: string[];
}
