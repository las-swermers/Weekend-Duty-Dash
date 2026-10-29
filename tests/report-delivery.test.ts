import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  save: vi.fn(),
  loadSubscription: vi.fn(),
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mocks.send };
  },
}));
vi.mock("@vercel/kv", () => ({
  kv: { get: vi.fn().mockResolvedValue("<p>Frozen email</p>") },
}));
vi.mock("@/lib/reports/store", () => ({
  saveRun: mocks.save,
  subscription: mocks.loadSubscription,
  getRun: vi.fn(),
  withLock: vi.fn(),
}));
vi.mock("@/lib/reports/data", () => ({ buildReport: vi.fn() }));
import { deliverRun, retryAllowed, sendingEnabled } from "@/lib/reports/send";
import type { ReportRun } from "@/lib/reports/types";
const run = (): ReportRun => ({
  id: "weekly-savoy-2026-10-19",
  subscriptionId: "savoy",
  subscriptionVersion: "v1",
  name: "Savoy",
  week: "2026-10-19",
  kind: "weekly",
  createdAt: new Date().toISOString(),
  html: "<p>Report</p>",
  text: "Report",
  from: "dashboard@las.ch",
  subject: "Savoy",
  deliveries: [{ email: "head@las.ch" }],
});
beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "test-only");
  vi.stubEnv("EMAIL_FROM", "dashboard@las.ch");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://duty.las.ch");
  vi.stubEnv("REPORTS_EMAIL_ENABLED", "1");
  vi.stubEnv("VERCEL_ENV", "production");
  mocks.loadSubscription.mockResolvedValue({
    enabled: true,
    updatedAt: "v1",
    recipients: ["head@las.ch"],
  });
  mocks.send.mockResolvedValue({ data: { id: "provider-id" }, error: null });
});
it("does not send from a preview deployment or when disabled", async () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  expect(sendingEnabled()).toBe(false);
  await expect(deliverRun(run())).rejects.toThrow();
  expect(mocks.send).not.toHaveBeenCalled();
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("REPORTS_EMAIL_ENABLED", "0");
  expect(sendingEnabled()).toBe(false);
});
it("persists send intent, sends individually, and skips accepted recipients on retry", async () => {
  const r = run();
  await deliverRun(r);
  expect(mocks.send).toHaveBeenCalledTimes(1);
  expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.send.mock.invocationCallOrder[0],
  );
  expect(mocks.send.mock.calls[0][0].to).toBe("head@las.ch");
  expect(mocks.send.mock.calls[0][1].idempotencyKey).toContain(r.id);
  expect(r.deliveries[0].providerId).toBe("provider-id");
  await deliverRun(r);
  expect(mocks.send).toHaveBeenCalledTimes(1);
});
it("reuses the exact payload and key after an uncertain provider response", async () => {
  const r = run();
  mocks.send.mockRejectedValueOnce(new Error("timeout"));
  await deliverRun(r);
  expect(r.deliveries[0].error).toContain("unconfirmed");
  const first = mocks.send.mock.calls[0];
  await deliverRun(r);
  expect(mocks.send.mock.calls[1]).toEqual(first);
  expect(r.deliveries[0].providerId).toBe("provider-id");
});
it("will not blindly resend after provider idempotency expires", async () => {
  const r = run();
  r.deliveries[0].firstAttemptAt = new Date(
    Date.now() - 24 * 3600_000,
  ).toISOString();
  await deliverRun(r);
  expect(mocks.send).not.toHaveBeenCalled();
  expect(r.deliveries[0].error).toContain("Needs review");
  expect(retryAllowed("invalid")).toBe(false);
});
it("stops on recipient removal, subscription pause, or scope changes", async () => {
  for (const current of [
    { enabled: false, updatedAt: "v1", recipients: ["head@las.ch"] },
    { enabled: true, updatedAt: "v1", recipients: [] },
    { enabled: true, updatedAt: "v2", recipients: ["head@las.ch"] },
  ]) {
    mocks.loadSubscription.mockResolvedValue(current);
    const r = run();
    await deliverRun(r);
    expect(r.deliveries[0].error).toContain("Cancelled");
  }
  expect(mocks.send).not.toHaveBeenCalled();
});
