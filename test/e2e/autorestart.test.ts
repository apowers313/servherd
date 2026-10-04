import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execa } from "execa";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

// Starts real servers under a real pm2 daemon, kills them with SIGKILL and checks
// that only a server started with --autorestart comes back. HOME and PM2_HOME point
// at a private temporary directory (kept short: pm2's unix sockets have a path limit),
// so the test never touches the developer's own registry or pm2 daemon.

const CLI = path.join(process.cwd(), "dist", "index.js");
// No spaces in the script: servherd joins the arguments into one command line
const IDLE = ["node", "-e", "setInterval(()=>{},1000)"];

let home: string;

function cli(...args: string[]) {
  return execa("node", [CLI, "--json", ...args], {
    env: { HOME: home, PM2_HOME: path.join(home, ".pm2"), PATH: process.env.PATH },
    extendEnv: false,
    cwd: home,
  });
}

async function info(name: string): Promise<{ status: string; pid?: number }> {
  const { stdout } = await cli("info", name);
  return JSON.parse(stdout).data;
}

async function startedPid(name: string, ...flags: string[]): Promise<number> {
  await cli("start", "--name", name, ...flags, "--", ...IDLE);
  const { status, pid } = await info(name);
  expect(status).toBe("online");
  expect(pid).toBeGreaterThan(0);
  return pid as number;
}

async function waitFor(check: () => Promise<boolean>, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

describe("autorestart against a real pm2", () => {
  beforeAll(async () => {
    await execa("npm", ["run", "build"], { cwd: process.cwd() });
    home = await mkdtemp(path.join(tmpdir(), "svh-"));
  }, 120000);

  afterAll(async () => {
    await execa(path.join(process.cwd(), "node_modules", ".bin", "pm2"), ["kill"], {
      env: { HOME: home, PM2_HOME: path.join(home, ".pm2") },
      reject: false,
    });
    await rm(home, { recursive: true, force: true });
  }, 60000);

  it("brings back a SIGKILLed server started with --autorestart", async () => {
    const pid = await startedPid("comes-back", "--autorestart");
    process.kill(pid, "SIGKILL");

    const back = await waitFor(async () => {
      const now = await info("comes-back");
      return now.status === "online" && now.pid !== undefined && now.pid !== pid;
    }, 20000);
    expect(back).toBe(true);
  });

  it("leaves a SIGKILLed server started without the flag down", async () => {
    const pid = await startedPid("stays-down");
    process.kill(pid, "SIGKILL");

    // Long enough for pm2's first backoff restart (100 ms) many times over
    await new Promise((r) => setTimeout(r, 3000));
    const now = await info("stays-down");
    expect(now.status).not.toBe("online");
  });
});
