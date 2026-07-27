import { config } from "dotenv";

config({ path: ".env.test" });

// Phase 4: keep unit/integration tests off the live Ollama path by default.
process.env.AI_ENABLED = "false";
