/**
 * 由 npm prestart 调用：避免使用陈旧或中断的 .next（典型症状：Internal Server Error / MODULE_NOT_FOUND vendor-chunks）。
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const webRoot = path.join(__dirname, "..");
const nextDir = path.join(webRoot, ".next");
const buildIdPath = path.join(nextDir, "BUILD_ID");
const fpPath = path.join(nextDir, "chess-tracker-fingerprint.json");
const lockPath = path.join(webRoot, "package-lock.json");

if (process.env.SKIP_BUILD_FINGERPRINT === "1") {
  process.exit(0);
}

function fail(msg) {
  console.error(msg);
  console.error("建议执行: cd web && rm -rf .next && npm run build");
  process.exit(1);
}

if (!fs.existsSync(buildIdPath)) {
  fail("错误：未找到 .next 构建产物（缺少 BUILD_ID）。请先执行 npm run build。");
}

if (!fs.existsSync(fpPath)) {
  fail(
    "错误：构建产物缺少版本指纹（可能为中断的旧构建）。请重新完整构建后再 npm start。",
  );
}

if (!fs.existsSync(lockPath)) {
  fail("错误：缺少 package-lock.json，无法校验构建。");
}

let saved;
try {
  saved = JSON.parse(fs.readFileSync(fpPath, "utf8"));
} catch {
  fail("错误：构建指纹文件损坏。请重新执行 npm run build。");
}

const lock = fs.readFileSync(lockPath);
const lockSha256 = crypto.createHash("sha256").update(lock).digest("hex");
const pkg = JSON.parse(fs.readFileSync(path.join(webRoot, "package.json"), "utf8"));
const nextVer = (pkg.dependencies && pkg.dependencies.next) || "";

if (saved.lockSha256 !== lockSha256 || saved.next !== nextVer) {
  fail(
    "错误：当前 package-lock.json 或 Next 版本与已有 .next 不匹配（继续 start 易出现 Internal Server Error）。请重新构建。",
  );
}
