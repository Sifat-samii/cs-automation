import { pathToFileURL } from "node:url";
import { FileAgent, JsonLineAgentLogger } from "./agent.js";
import { AgentApiClient } from "./api-client.js";
import { parseFileAgentEnv } from "./config.js";
import { TransferJobExecutor } from "./executor.js";
import { NodeFileSystem } from "./filesystem.js";
import { RobocopyTreeCopyStrategy, TransferPublisher } from "./transfer.js";

export async function main(): Promise<void> {
  const env = parseFileAgentEnv(process.env);
  const fileSystem = new NodeFileSystem();
  await fileSystem.ensureDirectory(env.STAGING_ROOT);

  const api = new AgentApiClient({
    baseUrl: env.FILE_AGENT_API_BASE_URL,
    secret: env.INGEST_HMAC_SECRET,
    leaseOwner: env.FILE_AGENT_ID,
  });
  const publisher = new TransferPublisher(fileSystem, new RobocopyTreeCopyStrategy());
  const executor = new TransferJobExecutor({ env, fileSystem, publisher });
  const logger = new JsonLineAgentLogger();
  const agent = new FileAgent({
    api,
    executor,
    logger,
    pollMilliseconds: env.FILE_AGENT_POLL_MS,
    heartbeatMilliseconds: env.FILE_AGENT_HEARTBEAT_MS,
  });

  const controller = new AbortController();
  process.once("SIGINT", () => controller.abort());
  process.once("SIGTERM", () => controller.abort());
  await agent.run(controller.signal);
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  main().catch(() => {
    process.stderr.write(`${JSON.stringify({ level: "error", event: "agent.startup_failed" })}\n`);
    process.exitCode = 1;
  });
}
