import * as vscode from "vscode";

interface Team {
  id: string;
  name: string;
}

interface Space {
  id: string;
  name: string;
}

interface Folder {
  id: string;
  name: string;
  lists?: List[];
}

interface List {
  id: string;
  name: string;
}

interface Task {
  id: string;
  name: string;
  description: string;
  priority: {
    id: string;
    priority: string;
    color: string;
    orderindex: string;
  } | null;
}

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    "clickup-shortcuts.listTasks",
    async () => {
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
          const teamsRes = await fetch("https://api.clickup.com/api/v2/team", {
            headers: { Authorization: token },
          });
          const { teams } = (await teamsRes.json()) as { teams: Team[] };
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

          const spacesRes = await fetch(
            `https://api.clickup.com/api/v2/team/${team.id}/space`,
            {
              headers: { Authorization: token },
            },
          );
          const { spaces } = (await spacesRes.json()) as { spaces: Space[] };
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

      try {
        const lists: List[] = [];

        // 1. Get lists directly in the space
        const spaceListsRes = await fetch(
          `https://api.clickup.com/api/v2/space/${spaceId}/list`,
          {
            headers: { Authorization: token },
          },
        );
        const spaceListsData = (await spaceListsRes.json()) as { lists: List[] };
        if (spaceListsData.lists) {
          lists.push(...spaceListsData.lists);
        }

        // 2. Get folders and their lists in the space
        const foldersRes = await fetch(
          `https://api.clickup.com/api/v2/space/${spaceId}/folder`,
          {
            headers: { Authorization: token },
          },
        );
        const foldersData = (await foldersRes.json()) as { folders: Folder[] };
        if (foldersData.folders) {
          for (const folder of foldersData.folders) {
            if (folder.lists) {
              // Add folder name to list name for better identification
              lists.push(
                ...folder.lists.map((l) => ({
                  ...l,
                  name: `${folder.name} > ${l.name}`,
                })),
              );
            }
          }
        }

        if (lists.length === 0) {
          vscode.window.showInformationMessage("No lists found in space");
          return;
        }

        // Prompt user to select a list
        const selectedListChoice = await vscode.window.showQuickPick(
          lists.map((l) => ({ label: l.name, list: l })),
          { placeHolder: "Select ClickUp List" },
        );

        if (!selectedListChoice) {
          return;
        }

        const selectedList = selectedListChoice.list;

        // Fetch tasks from the selected list
        const listRes = await fetch(
          `https://api.clickup.com/api/v2/list/${selectedList.id}/task?include_closed=false`,
          {
            headers: { Authorization: token },
          },
        );
        const listData = (await listRes.json()) as { tasks: Task[] };
        const tasks = listData.tasks || [];

        if (tasks.length === 0) {
          vscode.window.showInformationMessage("No tasks found in list");
          return;
        }

        // Prompt user to select a task
        const selectedTask = await selectTask(tasks);

        if (!selectedTask) {
          return;
        }

        // Format: Task Name\nDescription
        const text = `${selectedTask.name}\n${selectedTask.description || ""}\n`;

        await vscode.env.clipboard.writeText(text);
        vscode.window.showInformationMessage(
          `Copied task "${selectedTask.name}" to clipboard`,
        );
      } catch (error: any) {
        vscode.window.showErrorMessage(`Error: ${error.message}`);
      }
    },
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}

async function selectTask(tasks: Task[]): Promise<Task | undefined> {
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
    topTasks.map((t) => ({
      label: t.name,
      description: t.description || "",
      task: t,
    }));

  // Add "View more" option if there are remaining tasks
  if (remainingTasks.length > 0) {
    items.push({
      label: `$(chevron-down) View tasks with ${nextPriorityLabel} priority or lower`,
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
    const remainingItems = remainingTasks.map((t) => ({
      label: `[${getPriorityLabel(getPriorityValue(t))}] ${t.name}`,
      description: t.description || "",
      task: t,
    }));

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
  // If orderindex is available, use it (assuming 1=Urgent, 2=High, 3=Normal, 4=Low)
  // However, the API returns it as string.
  // Also check priority name for safety.
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
