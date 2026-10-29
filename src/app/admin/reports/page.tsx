import Link from "next/link";
import { reportsAdmin } from "@/lib/reports/auth";
import { ReportAdmin } from "@/components/reports/report-admin";
import "./reports.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "Report admin · LAS Duty Dashboard" };
export default async function ReportAdminPage() {
  const email = await reportsAdmin();
  if (!email)
    return (
      <main className="report-admin">
        <Link href="/live">← Dashboard</Link>
        <h1>Report administration</h1>
        <p>This area is restricted to the site’s report administrators.</p>
        <p>
          The site operator must configure REPORTS_ADMIN_EMAILS with your school
          account before you can manage recipients.
        </p>
      </main>
    );
  return <ReportAdmin email={email} />;
}
