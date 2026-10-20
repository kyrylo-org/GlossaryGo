#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

// Package archives are not checkouts. Do not install into an enclosing repository.
let repositoryRoot;
try {
  repositoryRoot = git("rev-parse", "--show-toplevel");
} catch {
  process.exit(0);
}
if (realpathSync(repositoryRoot) !== realpathSync(root)) process.exit(0);

const hooks = join(git("rev-parse", "--path-format=absolute", "--git-common-dir"), "hooks");
const target = join(hooks, "pre-commit");
const previous = join(hooks, "pre-commit.before-glossarygo");
const marker = "# GlossaryGo repository hook dispatcher";
const wrapper = `#!/bin/sh
${marker}
set -eu
common_dir=$(git rev-parse --path-format=absolute --git-common-dir)
previous="$common_dir/hooks/pre-commit.before-glossarygo"
if [ -x "$previous" ]; then
  "$previous" "$@"
fi
root=$(git rev-parse --show-toplevel)
# Other worktrees may not have installed this version yet.
if [ -f "$root/.githooks/pre-commit" ]; then
  cd "$root"
  exec sh "$root/.githooks/pre-commit" "$@"
fi
`;
mkdirSync(hooks, { recursive: true });
if (existsSync(target) || lstatSync(target, { throwIfNoEntry: false })) {
  const managed = !lstatSync(target).isSymbolicLink() && readFileSync(target, "utf8") === wrapper;
  if (!managed) {
    if (existsSync(previous) || lstatSync(previous, { throwIfNoEntry: false })) {
      throw new Error(`Refusing to overwrite an existing hook backup: ${previous}`);
    }
    renameSync(target, previous);
  }
}
writeFileSync(target, wrapper, { mode: 0o755 });
chmodSync(target, 0o755);
console.log("Installed GlossaryGo pre-commit hook; preserved core.hooksPath and any existing repository hook.");
