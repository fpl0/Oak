// electron-builder afterPack hook: copy the staged runtime into Oak.app/Contents/Resources/oak before
// signing. extraResources would drop node_modules (and bun's workspace symlinks), so rsync it as-is.
const { execFileSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function afterPack(ctx) {
  const app = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`);
  const dest = path.join(app, "Contents", "Resources", "oak");
  const src = path.join(__dirname, "..", "stage", "oak");
  execFileSync("rsync", ["-a", "--delete", `${src}/`, `${dest}/`], { stdio: "inherit" });
};
