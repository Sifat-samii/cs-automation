import type { FileAgentEnv } from "./config.js";
import {
  DropboxPublicAdapter,
  GoogleDriveAdapter,
  ManualDropAdapter,
  type TransferProgressCallback,
} from "./download-adapters.js";
import type { FileSystemPort } from "./filesystem.js";
import type { AgentArtifact, AgentJob } from "./api-client.js";
import { StagingVerifier, type ManifestArtifact } from "./staging.js";
import { TransferPublisher, type TransferLocation } from "./transfer.js";
import { PermanentTransferFailure } from "./transfer-errors.js";

export type ExecutionResult = {
  artifacts: readonly AgentArtifact[];
  bytesTotal: number;
};

export type ExecuteProgress = TransferProgressCallback;

function transferLocation(job: AgentJob, env: FileAgentEnv): TransferLocation {
  return {
    batchId: job.batch.id,
    attempt: job.attempts,
    backupRoot: env.BACKUP_ROOT_UNC,
    productionRoot: env.PRODUCTION_ROOT_UNC,
    stagingRoot: env.STAGING_ROOT,
    clientFolder: job.batch.order.client.folderName,
    orderFolder: job.batch.order.folderName,
    batchSubfolder: job.batch.subfolder,
    orderId: job.batch.order.id,
    orderCode: job.batch.order.code,
    clientCode: job.batch.order.client.code,
    createdAtUtc: job.batch.order.createdAtUtc,
  };
}

function stagedManifest(job: AgentJob): readonly ManifestArtifact[] {
  const artifacts = job.batch.artifacts.filter((artifact) => artifact.stage === "STAGED");
  if (artifacts.length === 0) {
    throw new PermanentTransferFailure(`Job ${job.kind} requires a staged manifest`);
  }
  return artifacts.map((artifact) => ({ ...artifact, stage: "STAGED" as const }));
}

export class TransferJobExecutor {
  private readonly env: FileAgentEnv;
  private readonly fileSystem: FileSystemPort;
  private readonly stagingVerifier: StagingVerifier;
  private readonly publisher: TransferPublisher;

  constructor(input: {
    env: FileAgentEnv;
    fileSystem: FileSystemPort;
    publisher: TransferPublisher;
  }) {
    this.env = input.env;
    this.fileSystem = input.fileSystem;
    this.stagingVerifier = new StagingVerifier(input.fileSystem);
    this.publisher = input.publisher;
  }

  async execute(job: AgentJob, onProgress?: ExecuteProgress): Promise<ExecutionResult> {
    const location = transferLocation(job, this.env);
    switch (job.kind) {
      case "DOWNLOAD": {
        const input = {
          batchId: job.batch.id,
          stagingRoot: this.env.STAGING_ROOT,
          manualDropConfirmed: job.batch.manualDropConfirmed,
          ...(onProgress ? { onProgress } : {}),
        };
        if (job.batch.manualDropConfirmed) {
          const result = await new ManualDropAdapter(this.fileSystem).download(input);
          return { artifacts: [], bytesTotal: result.bytesTotal };
        }

        const dropbox = job.batch.sourceLinks.filter((source) => source.kind === "DROPBOX");
        if (dropbox.length > 0) {
          let bytesTotal = 0;
          for (const source of dropbox) {
            const result = await new DropboxPublicAdapter(this.fileSystem).download({
              ...input,
              sourceId: source.id,
              ...(source.url ? { sourceUrl: source.url } : {}),
              ...(onProgress
                ? {
                    onProgress: async (bytesDone, sourceBytesTotal) =>
                      onProgress(bytesTotal + bytesDone, bytesTotal + sourceBytesTotal),
                  }
                : {}),
            });
            bytesTotal += result.bytesTotal;
          }
          return { artifacts: [], bytesTotal };
        }

        if (job.batch.sourceLinks.some((source) => source.kind === "GDRIVE")) {
          await new GoogleDriveAdapter().download(input);
        }
        throw new PermanentTransferFailure(
          "Batch has no supported public Dropbox link or confirmed manual drop",
        );
      }
      case "STAGE_VERIFY": {
        const result = await this.stagingVerifier.verify({
          batchId: job.batch.id,
          stagingRoot: this.env.STAGING_ROOT,
          backupRoot: this.env.BACKUP_ROOT_UNC,
          productionRoot: this.env.PRODUCTION_ROOT_UNC,
          clientFolder: job.batch.order.client.folderName,
          orderFolder: job.batch.order.folderName,
          batchSubfolder: job.batch.subfolder,
        });
        return { artifacts: result.artifacts, bytesTotal: result.bytesTotal };
      }
      case "WRITE_BACKUP": {
        const result = await this.publisher.writeBackup(location, stagedManifest(job));
        return { artifacts: result.artifacts, bytesTotal: result.bytesTotal };
      }
      case "COPY_PRODUCTION": {
        const result = await this.publisher.copyProduction(
          location,
          stagedManifest(job),
          onProgress,
        );
        return { artifacts: result.artifacts, bytesTotal: result.bytesTotal };
      }
      case "VERIFY_PRODUCTION": {
        const result = await this.publisher.verifyProduction(location, stagedManifest(job));
        return { artifacts: result.artifacts, bytesTotal: result.bytesTotal };
      }
    }
  }
}
