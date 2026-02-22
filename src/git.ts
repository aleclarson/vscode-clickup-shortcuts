import * as cp from "child_process";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

function exec(command: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cp.exec(command, { cwd }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`Git error: ${stderr || err.message}`));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

function getRoot(): string {
  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
    throw new Error("No workspace folder open");
  }
  return vscode.workspace.workspaceFolders[0].uri.fsPath;
}

export async function checkBranchExists(branchName: string): Promise<{ local: boolean; remote: boolean }> {
  const root = getRoot();
  let local = false;
  let remote = false;

  try {
    await exec(`git show-ref --verify --quiet refs/heads/${branchName}`, root);
    local = true;
  } catch (e) {}

  try {
    const output = await exec(`git ls-remote --heads origin ${branchName}`, root);
    if (output.includes(`refs/heads/${branchName}`)) {
      remote = true;
    }
  } catch (e) {}

  return { local, remote };
}

export async function checkoutBranch(branchName: string) {
  await exec(`git checkout ${branchName}`, getRoot());
}

export async function createBranch(branchName: string, base: string) {
  const root = getRoot();
  await exec(`git checkout -b ${branchName} ${base}`, root);
}

export async function pushBranch(branchName: string) {
  await exec(`git push -u origin ${branchName}`, getRoot());
}

export async function getCurrentBranch(): Promise<string> {
  return await exec("git symbolic-ref --short HEAD", getRoot());
}

export async function fetchRemote() {
  await exec("git fetch", getRoot());
}

export async function setGitConfig(key: string, value: string) {
    await exec(`git config --local ${key} "${value}"`, getRoot());
}

export async function installGitHooks(extensionContext: vscode.ExtensionContext) {
  const root = getRoot();
  const hooksDir = path.join(root, ".git", "hooks");
  if (!fs.existsSync(hooksDir)) {
      // If hooks dir doesn't exist, we can't install hooks.
      return;
  }

  // The hook script is bundled as git-hook.js in the extension's out directory
  const hookScriptPath = path.join(extensionContext.extensionPath, "out", "git-hook.js").replace(/\\/g, "/");

  const writeHook = (name: "post-checkout" | "post-merge") => {
      const hookPath = path.join(hooksDir, name);
      const hookCmd = `node "${hookScriptPath}" "${name}" "$@" &`;

      if (fs.existsSync(hookPath)) {
          const content = fs.readFileSync(hookPath, "utf8");
          if (!content.includes(hookCmd)) {
              fs.appendFileSync(hookPath, `\n${hookCmd}\n`);
          }
      } else {
          fs.writeFileSync(hookPath, `#!/bin/sh\n${hookCmd}\n`, { mode: 0o755 });
      }
  };

  writeHook("post-checkout");
  writeHook("post-merge");
}
