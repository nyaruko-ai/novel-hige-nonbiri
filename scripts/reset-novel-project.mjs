import path from "node:path";
import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";
import {
  MINIMAL_SCAFFOLD_PATHS,
  RETAINED_INFRA_PATHS,
  RESETTABLE_WORKSPACE_PATHS,
  scaffoldProject,
} from "./init-novel-project.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const options = {
    title: "新しい小説プロジェクト",
    subtitle: "",
    author: "",
    genre: "異世界小説",
    sourceDraft: "草稿/初稿.md",
    slug: "",
    dryRun: false,
  };

  for (const arg of argv.slice(2)) {
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (!arg.startsWith("--")) {
      continue;
    }

    const separatorIndex = arg.indexOf("=");
    const key = separatorIndex === -1 ? arg.slice(2) : arg.slice(2, separatorIndex);
    const value = separatorIndex === -1 ? "true" : arg.slice(separatorIndex + 1);

    if (key in options) {
      options[key] = value;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv);

  process.stdout.write(
    `Retained infrastructure:\n- ${RETAINED_INFRA_PATHS.join("\n- ")}\n\nReset workspace roots:\n- ${RESETTABLE_WORKSPACE_PATHS.join("\n- ")}\n\nRecreated minimal scaffold:\n- ${MINIMAL_SCAFFOLD_PATHS.join("\n- ")}\n\n`,
  );

  if (!options.dryRun) {
    for (const relativePath of RESETTABLE_WORKSPACE_PATHS) {
      await rm(path.join(rootDir, relativePath), { recursive: true, force: true });
    }
  }

  const result = await scaffoldProject(options, {
    dryRun: options.dryRun,
    assumeMissing: true,
  });
  const headline = options.dryRun
    ? "Dry run only. No files were deleted or recreated."
    : "Workspace reset complete.";

  process.stdout.write(`${headline}\n`);
  if (result.created.length > 0) {
    process.stdout.write(`Created ${result.created.length} files:\n- ${result.created.join("\n- ")}\n`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
