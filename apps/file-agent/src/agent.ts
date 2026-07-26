import type { AgentArtifact, AgentJob } from "./api-client.js";
import type { ExecutionResult } from "./executor.js";
import { TransferFailure } from "./transfer-errors.js";

export interface AgentLogger {
  info(event: string, metadata: Readonly<Record<string, string | number | boolean>>): void;
  error(event: string, metadata: Readonly<Record<string, string | number | boolean>>): void;
}

export interface AgentApiPort {
  lease(): Promise<AgentJob | null>;
  progress(jobId: string, bytesDone: number, bytesTotal: number): Promise<void>;
  complete(jobId: string, artifacts: readonly AgentArtifact[]): Promise<void>;
  fail(jobId: string, errorClass: "TRANSIENT" | "PERMANENT", error: string): Promise<void>;
}

export interface JobExecutorPort {
  execute(job: AgentJob): Promise<ExecutionResult>;
}

export class JsonLineAgentLogger implements AgentLogger {
  info(event: string, metadata: Readonly<Record<string, string | number | boolean>>): void {
    process.stdout.write(`${JSON.stringify({ level: "info", event, ...metadata })}\n`);
  }

  error(event: string, metadata: Readonly<Record<string, string | number | boolean>>): void {
    process.stderr.write(`${JSON.stringify({ level: "error", event, ...metadata })}\n`);
  }
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

export class FileAgent {
  private readonly api: AgentApiPort;
  private readonly executor: JobExecutorPort;
  private readonly logger: AgentLogger;
  private readonly pollMilliseconds: number;
  private readonly heartbeatMilliseconds: number;

  constructor(input: {
    api: AgentApiPort;
    executor: JobExecutorPort;
    logger?: AgentLogger;
    pollMilliseconds: number;
    heartbeatMilliseconds: number;
  }) {
    this.api = input.api;
    this.executor = input.executor;
    this.logger = input.logger ?? new JsonLineAgentLogger();
    this.pollMilliseconds = input.pollMilliseconds;
    this.heartbeatMilliseconds = input.heartbeatMilliseconds;
  }

  private heartbeat(job: AgentJob): ReturnType<typeof setInterval> {
    return setInterval(() => {
      void this.api.progress(job.id, job.bytesDone, job.bytesTotal).catch(() =>
        this.logger.error("agent.heartbeat_failed", {
          jobId: job.id,
          jobKind: job.kind,
        }),
      );
    }, this.heartbeatMilliseconds);
  }

  async runOnce(): Promise<boolean> {
    const job = await this.api.lease();
    if (!job) return false;
    this.logger.info("agent.job_leased", {
      jobId: job.id,
      jobKind: job.kind,
      attempt: job.attempts,
    });

    const heartbeat = this.heartbeat(job);
    try {
      const result = await this.executor.execute(job);
      await this.api.progress(job.id, result.bytesTotal, result.bytesTotal);
      clearInterval(heartbeat);
      await this.api.complete(job.id, result.artifacts);
      this.logger.info("agent.job_completed", {
        jobId: job.id,
        jobKind: job.kind,
        bytesTotal: result.bytesTotal,
      });
    } catch (error) {
      clearInterval(heartbeat);
      const failureClass = error instanceof TransferFailure ? error.errorClass : "TRANSIENT";
      const message = error instanceof Error ? error.message : "Unknown transfer failure";
      await this.api.fail(job.id, failureClass, message);
      this.logger.error("agent.job_failed", {
        jobId: job.id,
        jobKind: job.kind,
        errorClass: failureClass,
      });
    }
    return true;
  }

  async run(signal: AbortSignal): Promise<void> {
    this.logger.info("agent.started", { pollMilliseconds: this.pollMilliseconds });
    while (!signal.aborted) {
      try {
        const worked = await this.runOnce();
        if (!worked) await delay(this.pollMilliseconds, signal);
      } catch {
        this.logger.error("agent.poll_failed", { retryInMilliseconds: this.pollMilliseconds });
        await delay(this.pollMilliseconds, signal);
      }
    }
    this.logger.info("agent.stopped", { graceful: true });
  }
}
