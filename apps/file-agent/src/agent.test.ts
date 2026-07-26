import { describe, expect, it, vi } from "vitest";
import type { AgentApiPort, AgentLogger, JobExecutorPort } from "./agent.js";
import { FileAgent } from "./agent.js";
import type { AgentJob } from "./api-client.js";
import { PermanentTransferFailure } from "./transfer-errors.js";

function job(): AgentJob {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "DOWNLOAD",
    attempts: 1,
    maxAttempts: 3,
    leaseOwner: "agent-1",
    leaseExpiresAt: "2026-07-26T12:01:00.000Z",
    bytesDone: 0,
    bytesTotal: 0,
    correlationId: "22222222-2222-4222-8222-222222222222",
    batch: {
      id: "33333333-3333-4333-8333-333333333333",
      sequence: 1,
      kind: "INITIAL",
      status: "PENDING",
      subfolder: "01_INITIAL",
      manualDropConfirmed: false,
      sourceLinks: [],
      artifacts: [],
      order: {
        id: "44444444-4444-4444-8444-444444444444",
        code: "VRLY_260726_001",
        folderName: "VRLY_260726_001__spring_drop",
        backupPath: "\\\\server\\backup\\order",
        productionPath: "\\\\server\\production\\order",
        createdAtUtc: "2026-07-26T12:00:00.000Z",
        client: { code: "VRLY", folderName: "Verily" },
      },
    },
  };
}

function logger(): AgentLogger {
  return { info: vi.fn(), error: vi.fn() };
}

describe("File Agent loop", () => {
  it("executes, reports progress, and completes a leased job", async () => {
    const leased = job();
    const api: AgentApiPort = {
      lease: vi.fn().mockResolvedValue(leased),
      progress: vi.fn().mockResolvedValue(undefined),
      complete: vi.fn().mockResolvedValue(undefined),
      fail: vi.fn().mockResolvedValue(undefined),
    };
    const executor: JobExecutorPort = {
      execute: vi.fn().mockResolvedValue({ artifacts: [], bytesTotal: 4096 }),
    };
    const agent = new FileAgent({
      api,
      executor,
      logger: logger(),
      pollMilliseconds: 500,
      heartbeatMilliseconds: 60_000,
    });

    await expect(agent.runOnce()).resolves.toBe(true);
    expect(api.progress).toHaveBeenCalledWith(leased.id, leased.attempts, 4096, 4096);
    expect(api.complete).toHaveBeenCalledWith(leased.id, leased.attempts, []);
    expect(api.fail).not.toHaveBeenCalled();
  });

  it("reports a permanent adapter failure without retrying it locally", async () => {
    const leased = job();
    const api: AgentApiPort = {
      lease: vi.fn().mockResolvedValue(leased),
      progress: vi.fn().mockResolvedValue(undefined),
      complete: vi.fn().mockResolvedValue(undefined),
      fail: vi.fn().mockResolvedValue(undefined),
    };
    const executor: JobExecutorPort = {
      execute: vi
        .fn()
        .mockRejectedValue(new PermanentTransferFailure("Operator must use manual drop")),
    };
    const agent = new FileAgent({
      api,
      executor,
      logger: logger(),
      pollMilliseconds: 500,
      heartbeatMilliseconds: 60_000,
    });

    await expect(agent.runOnce()).resolves.toBe(true);
    expect(api.fail).toHaveBeenCalledWith(
      leased.id,
      leased.attempts,
      "PERMANENT",
      "Operator must use manual drop",
    );
    expect(api.complete).not.toHaveBeenCalled();
  });

  it("returns false when the queue is empty", async () => {
    const api: AgentApiPort = {
      lease: vi.fn().mockResolvedValue(null),
      progress: vi.fn().mockResolvedValue(undefined),
      complete: vi.fn().mockResolvedValue(undefined),
      fail: vi.fn().mockResolvedValue(undefined),
    };
    const executor: JobExecutorPort = {
      execute: vi.fn(),
    };
    const agent = new FileAgent({
      api,
      executor,
      logger: logger(),
      pollMilliseconds: 500,
      heartbeatMilliseconds: 60_000,
    });

    await expect(agent.runOnce()).resolves.toBe(false);
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it("forwards non-zero executor progress before completion", async () => {
    const leased = job();
    const api: AgentApiPort = {
      lease: vi.fn().mockResolvedValue(leased),
      progress: vi.fn().mockResolvedValue(undefined),
      complete: vi.fn().mockResolvedValue(undefined),
      fail: vi.fn().mockResolvedValue(undefined),
    };
    const executor: JobExecutorPort = {
      execute: vi.fn().mockImplementation(async (_job, onProgress) => {
        await onProgress?.(1024, 4096);
        return { artifacts: [], bytesTotal: 4096 };
      }),
    };
    const agent = new FileAgent({
      api,
      executor,
      logger: logger(),
      pollMilliseconds: 500,
      heartbeatMilliseconds: 60_000,
    });

    await agent.runOnce();

    expect(api.progress).toHaveBeenNthCalledWith(1, leased.id, leased.attempts, 1024, 4096);
    expect(api.progress).toHaveBeenLastCalledWith(leased.id, leased.attempts, 4096, 4096);
  });
});
