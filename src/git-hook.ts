#!/usr/bin/env node
import * as cp from "child_process";
import * as https from "https";

// Helper for execSync
const exec = (cmd: string): string => {
  try {
    return cp.execSync(cmd, { encoding: "utf8" }).trim();
  } catch (e) {
    return "";
  }
};

const getConfig = (key: string): string => exec(`git config ${key}`);

const token = getConfig("clickup.apiToken");
if (!token) {
  process.exit(0);
}

const branch = exec("git symbolic-ref --short HEAD");

// Simple fetch wrapper
const request = (method: string, path: string, body?: any) => {
  const options: https.RequestOptions = {
    hostname: "api.clickup.com",
    path: "/api/v2" + path,
    method: method,
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
    },
  };
  const req = https.request(options, (res) => {
    // We don't really care about the response unless debugging
  });
  req.on("error", (e) => {
    // silent failure
  });
  if (body) {
    req.write(JSON.stringify(body));
  }
  req.end();
};

// The hook type is passed as the first argument
const hookType = process.argv[2];

if (hookType === "post-checkout") {
  // Logic for post-checkout
  const currentTask = getConfig("clickup.currentTask");
  const match = branch.match(/^clickup\/([^/]+)/);
  const newTaskId = match ? match[1] : null;

  if (currentTask && currentTask !== newTaskId) {
    request("PUT", `/task/${currentTask}`, { status: "open" });
    exec("git config --local --unset clickup.currentTask");
  }

  if (newTaskId && newTaskId !== currentTask) {
    request("PUT", `/task/${newTaskId}`, { status: "in progress" });
    exec(`git config --local clickup.currentTask "${newTaskId}"`);
  }
} else if (hookType === "post-merge") {
  // Logic for post-merge
  try {
    const log = exec("git log -1 --format=%s"); // "Merge branch clickup/XXX"
    const match = log.match(/Merge branch .clickup\/(\w+)./);
    if (match) {
      const taskId = match[1];
      request("PUT", `/task/${taskId}`, { status: "complete" });
    }
  } catch (e) {}
}
