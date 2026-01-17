import fs from "fs";
import path from "path";
import os from "os";
import { spawnSync } from "child_process";

const root = process.cwd();
const vscodeDir = path.join(root, ".vscode");
const settingsPath = path.join(vscodeDir, "settings.json");
const extensionsPath = path.join(vscodeDir, "extensions.json");

const baseExcludeDirs = [
  "node_modules",
  "dist",
  "build",
  "coverage",
  "tmp",
  "logs",
];

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

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const readJson = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) {
    return {};
  }
  return JSON.parse(raw);
};

const writeJson = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
};

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
  const skipDirs = new Set([".git", ...baseExcludeDirs, ".next"]);
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

const collectPackageJsonPaths = () => {
  const packageJsons = [path.join(root, "package.json")];
  const rootPackage = readJson(path.join(root, "package.json"));
  const workspaces = Array.isArray(rootPackage.workspaces)
    ? rootPackage.workspaces
    : [];
  for (const workspace of workspaces) {
    if (workspace.includes("*")) {
      const baseDir = workspace.split("*")[0].replace(/\/$/, "");
      const absBase = path.join(root, baseDir);
      if (!fs.existsSync(absBase)) {
        continue;
      }
      for (const entry of fs.readdirSync(absBase, { withFileTypes: true })) {
        if (!entry.isDirectory()) {
          continue;
        }
        const candidate = path.join(absBase, entry.name, "package.json");
        if (fs.existsSync(candidate)) {
          packageJsons.push(candidate);
        }
      }
    } else {
      const candidate = path.join(root, workspace, "package.json");
      if (fs.existsSync(candidate)) {
        packageJsons.push(candidate);
      }
    }
  }
  return [...new Set(packageJsons)];
};

const collectDependencies = () => {
  const deps = new Set();
  for (const pkgPath of collectPackageJsonPaths()) {
    const pkg = readJson(pkgPath);
    for (const section of [
      "dependencies",
      "devDependencies",
      "peerDependencies",
      "optionalDependencies",
    ]) {
      const entries = pkg?.[section] ?? {};
      for (const dep of Object.keys(entries)) {
        deps.add(dep);
      }
    }
  }
  return deps;
};

const normalizeFiles = (files) => files.map((file) => file.toLowerCase());

const hasFileName = (files, names) =>
  files.some((file) => names.some((name) => file.endsWith(name)));

const hasExtension = (files, extensions) =>
  files.some((file) => extensions.some((ext) => file.endsWith(ext)));

const computeTsServerMemory = (tsJsCount) => {
  const totalGb = os.totalmem() / 1024 / 1024 / 1024;
  let base;
  if (totalGb >= 32) {
    base = 6144;
  } else if (totalGb >= 16) {
    base = 4096;
  } else if (totalGb >= 8) {
    base = 3072;
  } else {
    base = 2048;
  }

  let extra = 0;
  if (tsJsCount > 2000) {
    extra = 2048;
  } else if (tsJsCount > 1000) {
    extra = 1024;
  } else if (tsJsCount > 500) {
    extra = 512;
  }

  const max = totalGb >= 32 ? 8192 : totalGb >= 16 ? 6144 : 4096;
  return Math.min(base + extra, max);
};

const ensureGpuAcceleration = () => {
  const appData = process.env.APPDATA;
  if (!appData) {
    return [];
  }
  const argvPaths = [
    path.join(appData, "Code", "argv.json"),
    path.join(appData, "Code - Insiders", "argv.json"),
  ];
  const updated = [];
  for (const argvPath of argvPaths) {
    if (!fs.existsSync(argvPath)) {
      continue;
    }
    const raw = fs.readFileSync(argvPath, "utf8");
    if (!raw.includes("disable-hardware-acceleration")) {
      continue;
    }
    const next = raw.replace(
      /"disable-hardware-acceleration"\s*:\s*true/gi,
      "\"disable-hardware-acceleration\": false"
    );
    if (next !== raw) {
      fs.writeFileSync(argvPath, next, "utf8");
      updated.push(argvPath);
    }
  }
  return updated;
};

const files = listFiles();
const normalizedFiles = normalizeFiles(files);
const deps = collectDependencies();

const usesNext =
  deps.has("next") ||
  hasFileName(normalizedFiles, [
    "next.config.js",
    "next.config.mjs",
    "next.config.cjs",
  ]);
const usesTurbo =
  deps.has("turbo") || hasFileName(normalizedFiles, ["turbo.json"]);
const usesDocker = hasFileName(normalizedFiles, [
  "dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
]);
const usesGithubActions = normalizedFiles.some((file) =>
  file.startsWith(".github/workflows/")
);

const excludeDirs = new Set(baseExcludeDirs);
if (usesNext) {
  excludeDirs.add(".next");
}
if (usesTurbo) {
  excludeDirs.add(".turbo");
}

const tsJsCount = normalizedFiles.filter((file) =>
  /\.(ts|tsx|js|jsx)$/.test(file)
).length;
const tsServerMemory = computeTsServerMemory(tsJsCount);

ensureDir(vscodeDir);
const settings = readJson(settingsPath);

const mergeExclude = (existing, dirs, suffix = "") => {
  const next = typeof existing === "object" && existing ? { ...existing } : {};
  for (const dir of dirs) {
    next[`**/${dir}${suffix}`] = true;
  }
  return next;
};

settings["terminal.integrated.gpuAcceleration"] = "on";
settings["typescript.tsserver.maxTsServerMemory"] = tsServerMemory;
settings["files.exclude"] = mergeExclude(settings["files.exclude"], excludeDirs);
settings["search.exclude"] = mergeExclude(
  settings["search.exclude"],
  excludeDirs
);
settings["files.watcherExclude"] = mergeExclude(
  settings["files.watcherExclude"],
  excludeDirs,
  "/**"
);

writeJson(settingsPath, settings);

const recommendations = new Set(["dbaeumer.vscode-eslint"]);
if (usesDocker) {
  recommendations.add("ms-azuretools.vscode-containers");
}
if (usesGithubActions) {
  recommendations.add("github.vscode-github-actions");
}
if (hasExtension(normalizedFiles, [".ps1"])) {
  recommendations.add("ms-vscode.powershell");
}
if (hasExtension(normalizedFiles, [".svg"])) {
  recommendations.add("simonsiefke.svg-preview");
}
if (hasExtension(normalizedFiles, [".md"])) {
  recommendations.add("shd101wyy.markdown-preview-enhanced");
}
recommendations.add("christian-kohler.npm-intellisense");

writeJson(extensionsPath, {
  recommendations: Array.from(recommendations).sort(),
});

const updatedArgv = ensureGpuAcceleration();

const summary = {
  tsJsCount,
  tsServerMemory,
  excludeDirs: Array.from(excludeDirs).sort(),
  updatedArgv,
};

process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
