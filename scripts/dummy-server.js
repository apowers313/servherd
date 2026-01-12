#!/usr/bin/env node

/**
 * Simple HTTP/HTTPS server for testing servherd
 *
 * Port can be specified via:
 *   - Environment variable: PORT=3000 node dummy-server.js
 *   - Command line: node dummy-server.js -p 3000
 *   - Command line: node dummy-server.js --port 3000
 *
 * HTTPS can be enabled via:
 *   - Command line: node dummy-server.js --cert /path/to/cert.pem --key /path/to/key.pem
 *
 * Command line takes precedence over environment variable.
 */

import { createServer as createHttpServer } from "http";
import { createServer as createHttpsServer } from "https";
import { readFileSync } from "fs";
import { argv, env } from "process";

// Default port
let port = 3000;
let certPath = null;
let keyPath = null;

// Check environment variable first
if (env.PORT) {
  port = parseInt(env.PORT, 10) || 3000;
}

// Command line args override environment variable
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "-p" || argv[i] === "--port") {
    port = parseInt(argv[i + 1], 10) || port;
  } else if (argv[i] === "--cert") {
    certPath = argv[i + 1];
  } else if (argv[i] === "--key") {
    keyPath = argv[i + 1];
  }
}

const requestHandler = (req, res) => {
  // No manual timestamp - PM2 will add timestamps automatically
  console.log(`${req.method} ${req.url}`);

  const protocol = certPath && keyPath ? "https" : "http";
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    message: "Hello from servherd dummy server!",
    port,
    protocol,
    timestamp: new Date().toISOString(),
    url: req.url,
  }));
};

let server;
let protocol;

if (certPath && keyPath) {
  // HTTPS mode
  try {
    const httpsOptions = {
      cert: readFileSync(certPath),
      key: readFileSync(keyPath),
    };
    server = createHttpsServer(httpsOptions, requestHandler);
    protocol = "https";
    console.log(`HTTPS mode enabled with cert: ${certPath}, key: ${keyPath}`);
  } catch (err) {
    console.error(`Failed to load certificates: ${err.message}`);
    process.exit(1);
  }
} else {
  // HTTP mode
  server = createHttpServer(requestHandler);
  protocol = "http";
}

server.listen(port, () => {
  console.log(`Dummy server running at ${protocol}://localhost:${port}`);

  // Log health check every 5 seconds (no manual timestamp - PM2 adds them)
  setInterval(() => {
    console.log(`Health check: OK (uptime: ${Math.floor(process.uptime())}s)`);
  }, 5000);
});
