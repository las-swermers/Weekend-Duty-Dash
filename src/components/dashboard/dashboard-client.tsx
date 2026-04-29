"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";

import { AlertSummary } from "@/components/dashboard/alert-summary";
import { Launchpad } from "@/components/dashboard/launchpad";
import { Masthead } from "@/components/dashboard/masthead";
import { HCSection, NoPaSection } from "@/components/dashboard/sections";
import { Toast } from "@/components/dashboard/toast";
import type { HCStudent, NoPaStudent } from "@/lib/mock";
import type { Resource } from "@/types/resource";

interface Props {
  weekendLabel: string;
  aoc: string;
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

export function DashboardClient({ weekendLabel, aoc, initial }: Props) {
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
  const resources = useSWR<{ resources: Resource[] }>(
    "/api/resources",
    fetcher,
    { fallbackData: { resources: initial.resources } },
  );

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

  const handleEmail = useCallback(() => {
    showToast("Snapshot dialog — coming in Phase 4");
  }, [showToast]);

  const handleJump = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      window.scrollTo({
        top: el.getBoundingClientRect().top + window.scrollY - 24,
        behavior: "smooth",
      });
    }
  }, []);

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
        refreshing={refreshing}
        lastUpdated={lastUpdated}
        onRefresh={handleRefresh}
        onEmail={handleEmail}
      />

      <AlertSummary counts={counts} onJump={handleJump} />

      <div className="sections">
        <HCSection data={hc.data?.students ?? []} />
        <NoPaSection data={noPa.data?.students ?? []} />
      </div>

      <Launchpad resources={resources.data?.resources ?? []} />

      <footer className="colophon">
        <div>LAS · 1854 Leysin · Internal tool</div>
        <div className="colophon__center">
          “A thoughtful weekend is a quiet one.”
        </div>
        <div>v0.1 · Read-only · {new Date().getFullYear()}</div>
      </footer>

      <Toast message={toast} />
    </div>
  );
}
