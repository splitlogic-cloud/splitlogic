/* fix-next16-params.cjs
   Fix Next.js 16 param typings:
   - params: Promise<...>  -> params: ...
   - searchParams?: Promise<...> -> searchParams?: ...
   - await Promise.resolve(props.params) -> props.params
   - await Promise.resolve(props.searchParams ?? {}) -> (props.searchParams ?? {})
   Creates .bak backups.
*/

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const TARGET_DIR = path.join(ROOT, "src", "app");

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else if (ent.isFile() && (p.endsWith(".ts") || p.endsWith(".tsx"))) out.push(p);
  }
  return out;
}

function replaceAll(content) {
  let c = content;

  // 1) Type-level: params: Promise<...>  -> params: ...
  c = c.replace(/params\s*:\s*Promise<([^>]+)>/g, "params: $1");

  // 2) Type-level: searchParams?: Promise<...> -> searchParams?: ...
  c = c.replace(/searchParams\?\s*:\s*Promise<([^>]+)>/g, "searchParams?: $1");

  // 3) Common patterns in pages/layouts:
  // const params = await Promise.resolve(props.params);
  c = c.replace(
    /const\s+params\s*=\s*await\s+Promise\.resolve\(\s*props\.params\s*\);\s*\n/g,
    "const params = props.params;\n"
  );

  // const searchParams = await Promise.resolve(props.searchParams ?? {});
  c = c.replace(
    /const\s+searchParams\s*=\s*await\s+Promise\.resolve\(\s*props\.searchParams\s*\?\?\s*\{\}\s*\);\s*\n/g,
    "const searchParams = (props.searchParams ?? {});\n"
  );

  // 4) If you used Promise.resolve(props.searchParams ?? {}) inline:
  c = c.replace(/await\s+Promise\.resolve\(\s*props\.searchParams\s*\?\?\s*\{\}\s*\)/g, "(props.searchParams ?? {})");

  // 5) If you used Promise.resolve(props.params) inline:
  c = c.replace(/await\s+Promise\.resolve\(\s*props\.params\s*\)/g, "props.params");

  return c;
}

const files = walk(TARGET_DIR);

let changed = 0;
for (const file of files) {
  const before = fs.readFileSync(file, "utf8");
  const after = replaceAll(before);

  if (after !== before) {
    fs.writeFileSync(file + ".bak", before, "utf8");
    fs.writeFileSync(file, after, "utf8");
    changed++;
    console.log("patched:", path.relative(ROOT, file));
  }
}

console.log(`\nDone. Patched ${changed} file(s). Backups: *.bak`);