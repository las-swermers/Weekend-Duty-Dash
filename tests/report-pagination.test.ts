import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/orah", () => ({
  orahCall: vi.fn(),
  OrahError: class extends Error {
    constructor(_status: number, message: string) {
      super(message);
    }
  },
}));
import { orahCall } from "@/lib/orah";
import {
  listPastoralTimeline,
  listLocationRecordTimeline,
} from "@/lib/orah-resources";
beforeEach(() => vi.mocked(orahCall).mockReset());
for (const [name, load] of [
  ["pastoral", listPastoralTimeline],
  ["location", listLocationRecordTimeline],
] as const) {
  it(`${name} paginates using documented query page fields and stops on a partial page`, async () => {
    vi.mocked(orahCall)
      .mockResolvedValueOnce({ data: [{ id: 1 }, { id: 2 }] })
      .mockResolvedValueOnce({ data: [{ id: 3 }] });
    const result = await load("2026-10-19", "2026-10-25", {
      pageSize: 2,
      requireComplete: true,
    });
    expect(result).toHaveLength(3);
    expect(vi.mocked(orahCall).mock.calls[1][1]).toMatchObject({
      query: { page_index: 1, page_size: 2 },
    });
  });
  it(`${name} rejects missing data, repeated pages and capped results`, async () => {
    vi.mocked(orahCall).mockResolvedValue({ data: [{ id: 1 }] });
    await expect(
      load("start", "end", { pageSize: 1, maxPages: 2, requireComplete: true }),
    ).rejects.toThrow("overlapping");
    vi.mocked(orahCall).mockResolvedValue({ data: [{ id: 1 }] });
    await expect(
      load("start", "end", { pageSize: 1, maxPages: 1, requireComplete: true }),
    ).rejects.toThrow("limit");
    vi.mocked(orahCall).mockResolvedValue({});
    await expect(
      load("start", "end", { requireComplete: true }),
    ).rejects.toThrow("invalid timeline");
  });
}
