import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const root = process.cwd();

const rgIgnoreGlobs = [
  "!**/.git/**",
  "!**/node_modules/**",
  "!**/dist/**",
  "!**/build/**",
  "!**/coverage/**",
  "!**/.next/**",
  "!**/tmp/**",
  "!**/logs/**",
];

const listFiles = () => {
  const rgArgs = ["--files", ...rgIgnoreGlobs.flatMap((g) => ["-g", g])];
  const rgResult = spawnSync("rg", rgArgs, {
    cwd: root,
    encoding: "utf8",
  });
  if (rgResult.status === 0) {
    return rgResult.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((file) => file.replace(/\\/g, "/"));
  }
  const files = [];
  const stack = [root];
  const skipDirs = new Set([
    ".git",
    "node_modules",
    "dist",
    "build",
    "coverage",
    ".next",
    "tmp",
    "logs",
  ]);
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) {
          stack.push(fullPath);
        }
        continue;
      }
      files.push(path.relative(root, fullPath).replace(/\\/g, "/"));
    }
  }
  return files;
};

const normalizedFiles = listFiles().map((file) => file.toLowerCase());

const hasExtension = (extensions) =>
  normalizedFiles.some((file) =>
    extensions.some((ext) => file.endsWith(ext))
  );

const hasPython = hasExtension([".py"]);
const hasCpp = hasExtension([".c", ".cpp", ".h", ".hpp"]);
const hasCmake = hasExtension([".cmake"]);
const hasSass = hasExtension([".scss", ".sass"]);
const hasSql = hasExtension([".sql"]);
const hasPlantuml = hasExtension([".puml", ".plantuml"]);
const hasPdf = hasExtension([".pdf"]);
const hasArduino = hasExtension([".ino"]);
const hasAsm = hasExtension([".asm", ".s"]);

const pruneRules = [
  { id: "ms-python.python", needed: hasPython },
  { id: "ms-python.vscode-pylance", needed: hasPython },
  { id: "ms-python.debugpy", needed: hasPython },
  { id: "ms-python.vscode-python-envs", needed: hasPython },
  { id: "ms-vscode.cpptools", needed: hasCpp },
  { id: "ms-vscode.cpptools-extension-pack", needed: hasCpp },
  { id: "ms-vscode.cpptools-themes", needed: hasCpp },
  { id: "ms-vscode.cmake-tools", needed: hasCmake },
  { id: "twxs.cmake", needed: hasCmake },
  { id: "glenn2223.live-sass", needed: hasSass },
  { id: "mrmlnc.vscode-scss", needed: hasSass },
  { id: "inferrinizzard.prettier-sql-vscode", needed: hasSql },
  { id: "jebbs.plantuml", needed: hasPlantuml },
  { id: "tomoki1207.pdf", needed: hasPdf },
  { id: "ms-vscode.vscode-serial-monitor", needed: hasArduino },
  { id: "enginedesigns.retroassembler", needed: hasAsm },
];

const resolveCodeBin = () => {
  const envOverride = process.env.VSCODE_CLI;
  if (envOverride && fs.existsSync(envOverride)) {
    return envOverride;
  }

  if (process.platform === "win32") {
    const whereResult = spawnSync("where.exe", ["code"], { encoding: "utf8" });
    if (whereResult.status === 0) {
      const matches = whereResult.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const cmdMatch = matches.find((line) => line.toLowerCase().endsWith(".cmd"));
      const match = cmdMatch ?? matches[0];
      if (match && fs.existsSync(match)) {
        return match;
      }
    }

    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      const knownPaths = [
        path.join(localAppData, "Programs", "Microsoft VS Code", "bin", "code.cmd"),
        path.join(localAppData, "Programs", "Microsoft VS Code Insiders", "bin", "code.cmd"),
      ];
      for (const candidate of knownPaths) {
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
    }
  } else {
    const whichResult = spawnSync("which", ["code"], { encoding: "utf8" });
    if (whichResult.status === 0) {
      const match = whichResult.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line);
      if (match && fs.existsSync(match)) {
        return match;
      }
    }
  }

  return null;
};

const codeBin = resolveCodeBin();
if (!codeBin) {
  process.stderr.write("VS Code CLI not available. Skipping extension prune.\n");
  process.exit(0);
}

const quoteArg = (value) => `"${value.replace(/"/g, '\\"')}"`;

const runCode = (args, options = {}) => {
  if (process.platform === "win32") {
    const command = [quoteArg(codeBin), ...args.map(quoteArg)].join(" ");
    return spawnSync(command, { ...options, shell: true });
  }
  return spawnSync(codeBin, args, options);
};

const codeCheck = runCode(["--version"], { encoding: "utf8" });
if (codeCheck.status !== 0) {
  process.stderr.write("VS Code CLI not available. Skipping extension prune.\n");
  process.exit(0);
}

const installed = runCode(["--list-extensions"], { encoding: "utf8" });
if (installed.status !== 0) {
  process.stderr.write("Unable to list extensions. Skipping.\n");
  process.exit(0);
}

const installedList = installed.stdout
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

const toRemove = pruneRules
  .filter((rule) => installedList.includes(rule.id) && !rule.needed)
  .map((rule) => rule.id);

for (const ext of toRemove) {
  const result = runCode(["--uninstall-extension", ext], { stdio: "inherit" });
  if (result.status !== 0) {
    process.stderr.write(`Failed to uninstall ${ext}\n`);
  }
}

process.stdout.write(JSON.stringify({ removed: toRemove }, null, 2) + "\n");
