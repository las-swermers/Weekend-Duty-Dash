// Shapes for the weekly Warnings review (Orah "Infraction → Warning"
// records joined against the dorm's conversation log in Google Sheets).

// One Orah warning, flattened for display. `date` is when the incident
// happened; `createdBy` is the staff member who wrote it up.
export interface WarningRecord {
  id: number;
  date: string;
  description: string;
  action: string;
  note: string;
  createdBy: string;
}

export type ConversationStatus = "done" | "pending";

// One row of the Conversations sheet. `key` is `<studentId>|<weekKey>`.
export interface ConversationEntry {
  key: string;
  studentId: number;
  studentName: string;
  dorm: string;
  week: string;
  status: ConversationStatus;
  levelOverride: number | null;
  conversationDate: string | null;
  loggedBy: string;
  response: string;
  updatedAt: string;
}

export interface WarningStudent {
  studentId: number;
  name: string;
  initials: string;
  dorm: string;
  dormId: number | null;
  yearLevel: string | null;

  warningsThisWeek: WarningRecord[];
  termWarningCount: number;
  warningsSinceLastConversation: number;

  lastConversationAt: string | null;
  conversationCount: number;

  computedLevel: number;
  levelOverride: number | null;
  effectiveLevel: number;
  // True when enough warnings have stacked up since the last logged
  // conversation to warrant having another one now.
  dueNow: boolean;

  // This week's conversation row, when one exists.
  conversation: ConversationEntry | null;
}

export interface WarningsWeek {
  key: string;
  startISO: string;
  endISO: string;
  label: string;
  isCurrent: boolean;
}

export interface WarningsMeta {
  categories: string[];
  termStartISO: string;
  threshold: number;
  sheetConfigured: boolean;
  sheetUrl: string | null;
  sensitiveSuppressed: number;
  recordsScanned: number;
  dorms: string[];
  pulledAt: string;
}

export interface WarningsResponse {
  week: WarningsWeek;
  students: WarningStudent[];
  meta: WarningsMeta;
}
