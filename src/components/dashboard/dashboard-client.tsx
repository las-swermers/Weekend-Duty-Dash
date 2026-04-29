"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";

import {
  AddLinkDialog,
  type AddLinkDraft,
  type EditLinkDraft,
} from "@/components/dashboard/add-link-dialog";
import { AlertSummary } from "@/components/dashboard/alert-summary";
import { Launchpad } from "@/components/dashboard/launchpad";
import { Masthead } from "@/components/dashboard/masthead";
import { HCSection, NoPaSection } from "@/components/dashboard/sections";
import { PastoralCategoryGrid } from "@/components/shared/pastoral-category-grid";
import { Toast } from "@/components/dashboard/toast";
import type { HCStudent, NoPaStudent } from "@/lib/mock";
import type { Resource } from "@/types/resource";

interface Props {
  weekendLabel: string;
  aoc: string;
  userName: string | null;
  weekendRange: { startISO: string; endISO: string };
  initial: {
    hc: HCStudent[];
    noPa: NoPaStudent[];
    resources: Resource[];
  };
}

const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
};

export function DashboardClient({
  weekendLabel,
  aoc,
  userName,
  weekendRange,
  initial,
}: Props) {
  const hc = useSWR<{ students: HCStudent[] }>(
    "/api/orah/health-center",
    fetcher,
    { refreshInterval: 60_000, fallbackData: { students: initial.hc } },
  );
  const noPa = useSWR<{ students: NoPaStudent[] }>(
    "/api/orah/no-pa",
    fetcher,
    { refreshInterval: 60_000, fallbackData: { students: initial.noPa } },
  );
  const resources = useSWR<{
    resources: Resource[];
    mode?: "kv" | "sheet" | "seed" | "fallback";
    editUrl?: string | null;
    canAdd?: boolean;
  }>("/api/resources", fetcher, {
    fallbackData: { resources: initial.resources },
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Resource | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("just now");

  useEffect(() => {
    const startedAt = Date.now();
    const id = setInterval(() => {
      const mins = Math.floor((Date.now() - startedAt) / 60_000);
      setLastUpdated(mins === 0 ? "just now" : `${mins}m ago`);
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2400);
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([hc.mutate(), noPa.mutate(), resources.mutate()]);
    setLastUpdated("just now");
    setRefreshing(false);
    showToast("Dashboard refreshed");
  }, [hc, noPa, resources, showToast]);

  const handleJump = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      window.scrollTo({
        top: el.getBoundingClientRect().top + window.scrollY - 24,
        behavior: "smooth",
      });
    }
  }, []);

  const handleAddSave = useCallback(
    async (draft: AddLinkDraft | EditLinkDraft) => {
      const isEdit = "originalName" in draft;
      const res = await fetch("/api/resources", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      await resources.mutate();
      if (isEdit) {
        setEditTarget(null);
        showToast(`Updated “${draft.name}”`);
      } else {
        setDialogOpen(false);
        showToast(`Added “${draft.name}”`);
      }
    },
    [resources, showToast],
  );

  const handleRemove = useCallback(
    async (resource: Resource) => {
      if (!window.confirm(`Remove “${resource.name}” from the launchpad?`)) {
        return;
      }
      try {
        const res = await fetch("/api/resources", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: resource.name, url: resource.url }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }
        await resources.mutate();
        showToast(`Removed “${resource.name}”`);
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : "Failed to remove tile",
        );
      }
    },
    [resources, showToast],
  );

  const counts = useMemo(
    () => ({
      hc: hc.data?.students.length ?? 0,
      noPa: noPa.data?.students.length ?? 0,
    }),
    [hc.data, noPa.data],
  );

  return (
    <div className="app" data-density="balanced">
      <Masthead
        weekendLabel={weekendLabel}
        aoc={aoc}
        userName={userName}
        refreshing={refreshing}
        lastUpdated={lastUpdated}
        onRefresh={handleRefresh}
      />

      <AlertSummary counts={counts} onJump={handleJump} />

      <div className="sections">
        <HCSection data={hc.data?.students ?? []} />
        <NoPaSection data={noPa.data?.students ?? []} />
      </div>

      <PastoralCategoryGrid
        id="weekend-infractions"
        num="03"
        title="To Serve"
        titleEm="This Weekend"
        sub="Clipboards, dorm-night restrictions, and early check-ins for the upcoming weekend."
        emptyMessage="No infractions logged for this weekend yet."
        categories={[
          "Saturday Clipboard",
          "Sunday Clipboard",
          "Friday Night in the Dorm",
          "Saturday Night in the Dorm",
          "1-hour early check-in",
          "2-hour early check-in",
        ]}
        startISO={weekendRange.startISO}
        endISO={weekendRange.endISO}
        enableTickOff
      />

      <Launchpad
        resources={resources.data?.resources ?? []}
        mode={resources.data?.mode ?? "kv"}
        editUrl={resources.data?.editUrl ?? null}
        canAdd={resources.data?.canAdd ?? false}
        onAdd={() => setDialogOpen(true)}
        onRemove={handleRemove}
        onEdit={(r) => setEditTarget(r)}
      />

      <footer className="colophon">
        <div>LAS · 1854 Leysin · Internal tool</div>
        <div className="colophon__center">
          “A thoughtful weekend is a quiet one.”
        </div>
        <div>v0.1 · Read-only · {new Date().getFullYear()}</div>
      </footer>

      <AddLinkDialog
        open={dialogOpen}
        mode="add"
        onClose={() => setDialogOpen(false)}
        onSave={handleAddSave}
      />

      <AddLinkDialog
        open={editTarget !== null}
        mode="edit"
        initial={
          editTarget
            ? {
                name: editTarget.name,
                url: editTarget.url,
                icon: editTarget.icon,
              }
            : null
        }
        onClose={() => setEditTarget(null)}
        onSave={handleAddSave}
      />

      <Toast message={toast} />
    </div>
  );
}
