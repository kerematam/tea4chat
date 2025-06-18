import { spawn } from "bun";
import { existsSync } from "fs";

// Path to the compiled server binary (relative to the project root)
const SERVER_BIN = process.env.SERVER_BIN || "./dist/server";

// Check if the server binary exists
if (!existsSync(SERVER_BIN)) {
  console.error(`Server binary not found at: ${SERVER_BIN}`);
  console.error("Please run 'bun run build' first to compile the server binary");
  process.exit(1);
}

// Number of CPU cores available
const CPU_COUNT = Number(process.env.WORKER_COUNT) || navigator.hardwareConcurrency || 2;

console.log(`Starting ${CPU_COUNT} Bun workers with reuse-port…`);
console.log(`Using server binary: ${SERVER_BIN}`);

const workers: Bun.Subprocess[] = [];

for (let i = 0; i < CPU_COUNT; i++) {
  const child = spawn({
    cmd: [SERVER_BIN],
    env: {
      ...process.env,
      REUSE_PORT: "true", // Ensure each worker enables SO_REUSEPORT
    },
    stdout: "inherit",
    stderr: "inherit",
  });

  workers.push(child);
  console.log(`Worker #${i + 1} (pid: ${child.pid}) started`);
}

function shutdown() {
  console.log("Shutting down workers…");
  for (const worker of workers) {
    try {
      worker.kill();
    } catch (_) {
      // ignore
    }
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown); 