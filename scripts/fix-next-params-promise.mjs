import fs from "fs";
import path from "path";

const ROOT = process.cwd();

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

const APP_DIR =
  exists(path.join(ROOT, "src", "app"))
    ? path.join(ROOT, "src", "app")
    : exists(path.join(ROOT, "app"))
      ? path.join(ROOT, "app")
      : null;

const TARGET_BASENAMES = new Set(["page.tsx", "page.ts", "layout.tsx", "layout.ts", "route.ts"]);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function fixContent(input) {
  let s = input;

  // params: Promise<...> -> params: ...
  s = s.replace(/params:\s*Promise\s*<([\s\S]*?)>/g, "params: $1");

  // type Ctx = { params: Promise<...> } -> type Ctx = { params: ... }
  s = s.replace(/type\s+Ctx\s*=\s*\{\s*params:\s*Promise\s*<([\s\S]*?)>\s*;?\s*\}/g, "type Ctx = { params: $1 }");

  // context: { params: Promise<...> } -> context: { params: ... }
  s = s.replace(/context:\s*\{\s*params:\s*Promise\s*<([\s\S]*?)>\s*\}/g, "context: { params: $1 }");

  // AnyParams | Promise<AnyParams> -> AnyParams
  s = s.replace(/\bAnyParams\s*\|\s*Promise\s*<\s*AnyParams\s*>\b/g, "AnyParams");

  // Promise<AnyParams> -> AnyParams
  s = s.replace(/\bPromise\s*<\s*AnyParams\s*>\b/g, "AnyParams");

  return s;
}

function main() {
  if (!APP_DIR) {
    console.error("Could not find app directory. Tried: src/app and app");
    process.exit(1);
  }

  const all = walk(APP_DIR);
  const files = all.filter((f) => TARGET_BASENAMES.has(path.basename(f)));

  console.log("Project root:", ROOT);
  console.log("App dir:", path.relative(ROOT, APP_DIR));
  console.log("Candidate files found:", files.length);

  let changed = 0;

  for (const file of files) {
    const before = fs.readFileSync(file, "utf8");
    const after = fixContent(before);

    if (after !== before) {
      fs.writeFileSync(file, after, "utf8");
      changed++;
      console.log("fixed:", path.relative(ROOT, file));
    }
  }

  console.log(`\nDone. Changed ${changed} file(s).`);
}

main();