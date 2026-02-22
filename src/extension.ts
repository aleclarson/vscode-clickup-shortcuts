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
}

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    "clickup-tasks.listTasks",
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
        const selectedTaskChoice = await vscode.window.showQuickPick(
          tasks.map((t) => ({
            label: t.name,
            description: t.description || "",
            task: t,
          })),
          { placeHolder: "Select ClickUp Task" },
        );

        if (!selectedTaskChoice) {
          return;
        }

        const selectedTask = selectedTaskChoice.task;

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
