import * as vscode from "vscode";
import { getLists, getTasks, Task, getCurrentUser, updateTask, fetchClickUp, Team, Space } from "./clickup";
import { checkBranchExists, checkoutBranch, createBranch, pushBranch, installGitHooks, setGitConfig, fetchRemote } from "./git";

async function getOrPromptConfig(): Promise<{ token: string; spaceId: string } | undefined> {
  const config = vscode.workspace.getConfiguration("clickup");
  let token = config.get<string>("apiToken");
  let spaceId = config.get<string>("spaceId");

  // Prompt for API Token if missing
  if (!token) {
    const selection = await vscode.window.showInformationMessage(
      "ClickUp Personal API Token is missing.",
      "Get an API key",
      "Enter your API key",
    );

    if (!selection) {
      return;
    }

    if (selection === "Get an API key") {
      await vscode.env.openExternal(
        vscode.Uri.parse("https://app.clickup.com/settings/apps"),
      );
    }

    const input = await vscode.window.showInputBox({
      prompt: "Enter your ClickUp Personal API Token",
      placeHolder: "pk_...",
      ignoreFocusOut: true,
    });
    if (!input) {
      return;
    }
    token = input;
    await config.update(
      "apiToken",
      token,
      vscode.ConfigurationTarget.Global,
    );
  }

  // Prompt for Space ID if missing
  if (!spaceId) {
    try {
      const teamsRes = await fetchClickUp("/team", token) as { teams: Team[] };
      const teams = teamsRes.teams;
      if (!teams?.length) {
        throw new Error("No teams found");
      }

      let team: Team | undefined;
      if (teams.length > 1) {
        const selected = await vscode.window.showQuickPick(
          teams.map((t) => ({ label: t.name, team: t })),
          { placeHolder: "Select ClickUp Team" },
        );
        team = selected?.team;
      } else {
        team = teams[0];
      }
      if (!team) {
        return;
      }

      const spacesRes = await fetchClickUp(`/team/${team.id}/space`, token) as { spaces: Space[] };
      const spaces = spacesRes.spaces;
      const selectedSpace = await vscode.window.showQuickPick(
        spaces.map((s) => ({ label: s.name, space: s })),
        { placeHolder: "Select ClickUp Space" },
      );
      if (!selectedSpace) {
        return;
      }
      const space = selectedSpace.space;

      spaceId = space.id;
      await config.update(
        "spaceId",
        spaceId,
        vscode.ConfigurationTarget.Workspace,
      );
    } catch (err: any) {
      vscode.window.showErrorMessage(`Setup failed: ${err.message}`);
      return;
    }
  }

  return { token, spaceId };
}

async function selectTask(token: string, spaceId: string): Promise<Task | undefined> {
    try {
        const lists = await getLists(spaceId, token);
        if (lists.length === 0) {
            vscode.window.showInformationMessage("No lists found in space");
            return;
        }

        const selectedListChoice = await vscode.window.showQuickPick(
            lists.map((l) => ({ label: l.name, list: l })),
            { placeHolder: "Select ClickUp List" }
        );

        if (!selectedListChoice) {
            return;
        }

        const tasks = await getTasks(selectedListChoice.list.id, token);
        if (tasks.length === 0) {
            vscode.window.showInformationMessage("No tasks found in list");
            return;
        }

        return await promptTaskSelection(tasks);
    } catch (error: any) {
        vscode.window.showErrorMessage(`Error selecting task: ${error.message}`);
        return;
    }
}

async function promptTaskSelection(tasks: Task[]): Promise<Task | undefined> {
  // Group tasks by priority
  const groups: { [key: number]: Task[] } = {
    0: [], // Urgent
    1: [], // High
    2: [], // Normal
    3: [], // Low
    4: [], // No Priority
  };

  tasks.forEach((task) => {
    const priority = getPriorityValue(task);
    groups[priority].push(task);
  });

  // Find the highest priority group with tasks
  let highestPriorityGroupIndex = -1;
  for (let i = 0; i <= 4; i++) {
    if (groups[i].length > 0) {
      highestPriorityGroupIndex = i;
      break;
    }
  }

  if (highestPriorityGroupIndex === -1) {
    return undefined;
  }

  const topTasks = groups[highestPriorityGroupIndex];
  let remainingTasks: Task[] = [];
  let nextPriorityLabel = "";

  // Collect all remaining tasks
  for (let i = highestPriorityGroupIndex + 1; i <= 4; i++) {
    if (groups[i].length > 0) {
      if (nextPriorityLabel === "") {
        nextPriorityLabel = getPriorityLabel(i);
      }
      remainingTasks.push(...groups[i]);
    }
  }

  // Create QuickPick items for the top tasks
  const items: (vscode.QuickPickItem & { task?: Task; isLoadMore?: boolean })[] =
    topTasks.map((t) => {
      const priorityValue = getPriorityValue(t);
      const priorityLabel = getPriorityLabel(priorityValue);
      return {
        label: t.name,
        detail: `$(flag) ${priorityLabel}` + (t.description ? ` $(file-text) ${t.description}` : ""),
        task: t,
      };
    });

  // Add "View more" option if there are remaining tasks
  if (remainingTasks.length > 0) {
    items.push({
      label: "",
      description: `$(chevron-down) View tasks with ${nextPriorityLabel} priority or lower`,
      isLoadMore: true,
      alwaysShow: true,
    });
  }

  const selectedChoice = await vscode.window.showQuickPick(items, {
    placeHolder: `Select ClickUp Task (${getPriorityLabel(highestPriorityGroupIndex)})`,
  });

  if (!selectedChoice) {
    return undefined;
  }

  if (selectedChoice.isLoadMore) {
    // Show remaining tasks sorted by priority
    const remainingItems = remainingTasks.map((t) => {
      const priorityValue = getPriorityValue(t);
      const priorityLabel = getPriorityLabel(priorityValue);
      return {
        label: t.name,
        detail: `$(flag) ${priorityLabel}` + (t.description ? ` $(file-text) ${t.description}` : ""),
        task: t,
      };
    });

    const selectedRemaining = await vscode.window.showQuickPick(remainingItems, {
      placeHolder: "Select from remaining tasks",
    });

    return selectedRemaining?.task;
  }

  return selectedChoice.task;
}

function getPriorityValue(task: Task): number {
  if (!task.priority) {
    return 4; // No priority (lowest)
  }
  switch (task.priority.priority.toLowerCase()) {
    case "urgent":
      return 0;
    case "high":
      return 1;
    case "normal":
      return 2;
    case "low":
      return 3;
    default:
      return 4;
  }
}

function getPriorityLabel(priorityValue: number): string {
  switch (priorityValue) {
    case 0:
      return "Urgent";
    case 1:
      return "High";
    case 2:
      return "Normal";
    case 3:
      return "Low";
    default:
      return "No Priority";
  }
}

export function activate(context: vscode.ExtensionContext) {
  const listTasksDisposable = vscode.commands.registerCommand(
    "clickup-shortcuts.listTasks",
    async () => {
      const config = await getOrPromptConfig();
      if (!config) {
        return;
      }

      const task = await selectTask(config.token, config.spaceId);
      if (!task) {
        return;
      }

      const text = `${task.name}\n${task.description || ""}\n`;
      await vscode.env.clipboard.writeText(text);
      vscode.window.showInformationMessage(
        `Copied task "${task.name}" to clipboard`,
      );
    }
  );

  const checkoutTaskDisposable = vscode.commands.registerCommand(
      "clickup-shortcuts.checkoutTaskBranch",
      async () => {
          const config = await getOrPromptConfig();
          if (!config) {
            return;
          }

          const task = await selectTask(config.token, config.spaceId);
          if (!task) {
            return;
          }

          const branchName = `clickup/${task.id}`;

          // Git operations
          try {
             await vscode.window.withProgress({
                 location: vscode.ProgressLocation.Notification,
                 title: `Checking out task branch ${branchName}...`,
                 cancellable: false
             }, async (progress) => {
                 progress.report({ message: "Checking remote branches..." });
                 await fetchRemote();
                 const { local, remote } = await checkBranchExists(branchName);

                 if (local) {
                     progress.report({ message: "Checking out local branch..." });
                     await checkoutBranch(branchName);
                 } else if (remote) {
                     progress.report({ message: "Checking out remote branch..." });
                     await checkoutBranch(branchName);
                 } else {
                     progress.report({ message: "Creating new branch..." });
                     await createBranch(branchName, "main");
                     await pushBranch(branchName);
                 }

                 progress.report({ message: "Updating task status..." });
                 // Update task status and assignee
                 const user = await getCurrentUser(config.token);
                 await updateTask(task.id, {
                     status: "in progress",
                     assignees: {
                         add: [user.id]
                     }
                 }, config.token);

                 progress.report({ message: "Installing git hooks..." });
                 // Set config for hooks
                 await setGitConfig("clickup.apiToken", config.token);
                 // We also set current task immediately so hook knows we are here
                 await setGitConfig("clickup.currentTask", task.id);

                 await installGitHooks(context);
             });

             const text = `${task.name}\n${task.description || ""}\n`;
             await vscode.env.clipboard.writeText(text);

             vscode.window.showInformationMessage(`Checked out ${branchName} and updated task!`);

          } catch (err: any) {
              vscode.window.showErrorMessage(`Error: ${err.message}`);
          }
      }
  );

  context.subscriptions.push(listTasksDisposable, checkoutTaskDisposable);
}

export function deactivate() {}
