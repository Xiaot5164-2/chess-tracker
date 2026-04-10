/**
 * 由 npm postbuild 调用：在成功 build 后写入指纹，供 prestart 校验。
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const webRoot = path.join(__dirname, "..");
const nextDir = path.join(webRoot, ".next");
const lockPath = path.join(webRoot, "package-lock.json");

if (!fs.existsSync(nextDir) || !fs.existsSync(lockPath)) {
  process.exit(0);
}

const lock = fs.readFileSync(lockPath);
const lockSha256 = crypto.createHash("sha256").update(lock).digest("hex");
const pkg = JSON.parse(fs.readFileSync(path.join(webRoot, "package.json"), "utf8"));
const nextVer = (pkg.dependencies && pkg.dependencies.next) || "";

const body = JSON.stringify({ lockSha256, next: nextVer }, null, 0);
fs.writeFileSync(path.join(nextDir, "project-checkmate-fingerprint.json"), body, "utf8");
