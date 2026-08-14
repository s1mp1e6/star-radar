/* 自检脚本：语法检查 src 下全部 JS 文件 + 运行单测（npm run check） */
import { execSync } from "node:child_process";
import { readdirSync } from "node:fs";

function walk(dir, out = []) {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${f.name}`;
    if (f.isDirectory()) walk(p, out);
    else if (f.name.endsWith(".js")) out.push(p);
  }
  return out;
}

const srcFiles = walk("src").concat(walk("public/assets"));
const testFiles = walk("tests");

let failed = false;

for (const f of srcFiles) {
  try {
    execSync(`node --check "${f}"`, { stdio: "inherit" });
    console.log(`✓ 语法通过 ${f}`);
  } catch {
    failed = true;
  }
}

if (testFiles.length === 0) {
  console.log("⚠ 未发现测试文件（tests/ 为空）");
} else {
  try {
    execSync(`node --test ${testFiles.map(f => `"${f}"`).join(" ")}`, { stdio: "inherit" });
  } catch {
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
