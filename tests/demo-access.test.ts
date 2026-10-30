import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ auth: (handler: unknown) => handler }));
import middleware from "@/middleware";
const run = (path: string, auth: unknown = null) =>
  (middleware as unknown as (req: unknown) => Response | undefined)({
    auth,
    url: `https://school.example${path}`,
    nextUrl: new URL(`https://school.example${path}`),
  });
describe("public demo boundary", () => {
  it("opens only the exact demo page", () => {
    expect(run("/demo")?.headers.get("x-middleware-next")).toBe("1");
    expect(run("/demo?dorm=9001")?.headers.get("x-middleware-next")).toBe("1");
    for (const path of [
      "/analytics",
      "/live",
      "/admin/reports",
      "/api/analytics/overview",
      "/api/admin/reports",
      "/api/analytics/tracking",
      "/demo/private",
      "/demo-api",
    ]) {
      const response = run(path)!;
      expect(response.status).toBe(302);
      expect(new URL(response.headers.get("location")!).pathname).toBe(
        "/signin",
      );
    }
  });
});
