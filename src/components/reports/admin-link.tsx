"use client";
import Link from "next/link";
import useSWR from "swr";
export function ReportsAdminLink() {
  const { data } = useSWR<{ admin: boolean }>(
    "/api/admin/reports/access",
    async (url) => {
      const res = await fetch(url);
      return res.ok ? res.json() : { admin: false };
    },
    { revalidateOnFocus: false },
  );
  return data?.admin ? (
    <Link href="/admin/reports" className="btn btn--ghost btn--sm">
      Report admin
    </Link>
  ) : null;
}
