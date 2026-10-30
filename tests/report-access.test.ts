import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getRun: vi.fn(),
  subscription: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/reports/store", () => ({
  getRun: mocks.getRun,
  subscription: mocks.subscription,
}));
import { GET } from "@/app/api/reports/[id]/route";
const call = () =>
  GET(new Request("https://duty.las.ch/api/reports/report1"), {
    params: { id: "report1" },
  });
beforeEach(() => {
  vi.stubEnv("REPORTS_ADMIN_EMAILS", "admin@las.ch");
  mocks.auth.mockResolvedValue({ user: { email: "head@las.ch" } });
  mocks.getRun.mockResolvedValue({
    kind: "weekly",
    subscriptionId: "savoy",
    html: "<p>Savoy only</p>",
    deliveries: [{ email: "head@las.ch" }],
  });
  mocks.subscription.mockResolvedValue({ recipients: ["head@las.ch"] });
});
it("denies other school staff and unsigned visitors", async () => {
  mocks.auth.mockResolvedValue({ user: { email: "other@las.ch" } });
  expect((await call()).status).toBe(404);
  mocks.auth.mockResolvedValue(null);
  expect((await call()).status).toBe(404);
});
it("permits the intended recipient, with private no-store headers", async () => {
  const res = await call();
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("Savoy only");
  expect(res.headers.get("Cache-Control")).toContain("no-store");
  expect(res.headers.get("Content-Security-Policy")).toContain(
    "default-src 'none'",
  );
});
it("revokes report access when the recipient is removed", async () => {
  mocks.subscription.mockResolvedValue({ recipients: [] });
  expect((await call()).status).toBe(404);
});
it("keeps previews and test reports admin-only", async () => {
  mocks.getRun.mockResolvedValue({
    kind: "preview",
    subscriptionId: "savoy",
    html: "preview",
    deliveries: [{ email: "head@las.ch" }],
  });
  expect((await call()).status).toBe(404);
  mocks.auth.mockResolvedValue({ user: { email: "admin@las.ch" } });
  expect((await call()).status).toBe(200);
});
