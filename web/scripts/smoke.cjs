/**
 * After `npm run build`, starts production server briefly and GETs main routes.
 * Usage: npm run smoke   (from web/)
 */
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

const root = path.join(__dirname, "..");
const port = process.env.SMOKE_PORT || "3999";

const proc = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "start", "--", "-p", port], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, NODE_ENV: "production" },
});

function waitForReady() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timeout waiting for Next.js Ready")), 60000);
    const onOut = (data) => {
      if (String(data).includes("Ready")) {
        clearTimeout(timeout);
        proc.stdout.off("data", onOut);
        resolve(undefined);
      }
    };
    proc.stdout.on("data", onOut);
    proc.stderr.on("data", (d) => {
      const s = String(d);
      if (s.includes("Error") || s.includes("error")) {
        process.stderr.write(s);
      }
    });
    proc.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`next start exited with code ${code}`));
    });
  });
}

function getStatus(pathname, maxRedirects = 8) {
  return new Promise((resolve, reject) => {
    let url = `http://127.0.0.1:${port}${pathname}`;
    let redirectsLeft = maxRedirects;

    const doGet = () => {
      const req = http.get(url, (res) => {
        const code = res.statusCode ?? 0;
        const loc = res.headers.location;
        if ([301, 302, 307, 308].includes(code) && loc && redirectsLeft > 0) {
          res.resume();
          redirectsLeft -= 1;
          try {
            url = new URL(loc, url).href;
          } catch (e) {
            reject(e);
            return;
          }
          doGet();
          return;
        }
        res.resume();
        resolve(code);
      });
      req.on("error", reject);
      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error(`GET ${pathname} timeout`));
      });
    };

    doGet();
  });
}

async function main() {
  try {
    await waitForReady();
  } catch (e) {
    proc.kill("SIGTERM");
    throw e;
  }

  const paths = [
    "/",
    "/api/health",
    "/api/leaderboard?period=7&timeControl=rapid",
    "/api/leaderboard/puzzles",
    "/leaderboard",
    "/leaderboard/puzzles",
    "/players/new",
  ];
  for (const p of paths) {
    const code = await getStatus(p);
    if (code !== 200) {
      console.error(`SMOKE FAIL ${p} -> HTTP ${code}`);
      proc.kill("SIGTERM");
      process.exit(1);
    }
    console.log(`SMOKE OK   ${p} -> 200`);
  }

  proc.kill("SIGTERM");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  try {
    proc.kill("SIGTERM");
  } catch {
    /* ignore */
  }
  process.exit(1);
});
