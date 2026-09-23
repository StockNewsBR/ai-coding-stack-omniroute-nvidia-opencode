import { describe, expect, it, vi } from "vitest";
import { executeWithUpstreamStartTimeout } from "../../../handlers/chatCore/upstreamTimeouts.ts";
import { buildTargetTimeoutRunner } from "../../combo/targetTimeoutRunner.ts";

describe("timeout cancellation settlement", () => {
  it("settles a timed-out combo operation before returning", async () => {
    let settled = false;
    const runner = buildTargetTimeoutRunner({
      comboTargetTimeoutMs: 5,
      log: { warn: vi.fn() },
      handleSingleModel: async (_body, _model, target) => {
        await new Promise<void>((resolve) => {
          target?.modelAbortSignal?.addEventListener("abort", () => setTimeout(resolve, 10), {
            once: true,
          });
        });
        settled = true;
        throw new Error("synthetic aborted upstream");
      },
    });

    const response = await runner({}, "synthetic/model");
    expect(response.status).toBe(504);
    expect(settled).toBe(true);
  });

  it("settles a timed-out upstream operation before rejecting", async () => {
    let settled = false;
    await expect(
      executeWithUpstreamStartTimeout({
        executor: { getTimeoutMs: () => 5 },
        provider: "synthetic",
        model: "synthetic/model",
        signal: new AbortController().signal,
        log: { warn: vi.fn() },
        execute: async (signal) => {
          await new Promise<void>((resolve) => {
            signal.addEventListener("abort", () => setTimeout(resolve, 10), { once: true });
          });
          settled = true;
          throw new Error("synthetic aborted upstream");
        },
      })
    ).rejects.toMatchObject({ name: "TimeoutError" });
    expect(settled).toBe(true);
  });
});
