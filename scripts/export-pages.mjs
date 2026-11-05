import { spawn } from "node:child_process";
import { access, cp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const apiDir = path.join(root, "app", "api");
const stashDir = path.join(root, ".pages-api-stash");
const outDir = path.join(root, "out");
const staging = process.env.PAGES_OUT ?? path.join("/tmp", "due-light-pages");

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env, cwd: root });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited ${code}`))));
  });
}

let moved = false;
try {
  await rm(stashDir, { recursive: true, force: true });
  if (await exists(apiDir)) {
    await rename(apiDir, stashDir);
    moved = true;
  }
  await rm(path.join(root, ".next"), { recursive: true, force: true });
  await run("npx", ["next", "build"], {
    ...process.env,
    PAGES: "1",
    NEXT_PUBLIC_DUE_LIGHT_HOST: "pages",
  });
  if (!(await exists(path.join(outDir, "index.html")))) {
    throw new Error("Static export did not write out/index.html");
  }
  await writeFile(path.join(outDir, ".nojekyll"), "");
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  await cp(outDir, staging, { recursive: true });
  await writeFile(path.join(staging, ".nojekyll"), "");
  console.log(`pages export ready at ${staging}`);
} finally {
  if (moved) {
    await rm(apiDir, { recursive: true, force: true });
    await rename(stashDir, apiDir);
  }
}
