<p align="center">
  <img src="https://github.com/aleclarson/vscode-clickup-shortcuts/blob/main/icon.png?raw=true" width="128" height="128" alt="Icon">
</p>

# ClickUp Shortcuts

View and copy ClickUp task names and descriptions from a configured ClickUp folder using your personal API token.

## Setup Instructions

On first run, the extension will automatically prompt you for your **ClickUp Personal API Token** if it's missing (get it from [ClickUp Settings > Apps](https://app.clickup.com/settings/apps)). If no **Space ID** is configured, you will be prompted to select a space from your ClickUp workspaces.

## Features

- Select a ClickUp space to fetch tasks from.
- Interactively select a list from the space (including folder lists).
- Interactively select a single task from the list.
- **Tasks are grouped by priority** for easier selection.
- **Checkout task branch**: Automates creating and switching to branches named `clickup/<task-id>`, updates task status to "in progress", and assigns it to you.
- **Integrated Git hooks**: Automatically updates task status to "complete" when a task branch is merged into `main`.

## Contributed Commands

- `ClickUp: List Tasks and Copy`: Prompts for a list and then a task from the configured space and copies its name and description.
- `ClickUp: Checkout task branch`: Prompts for a task, checks out its branch, and updates its status in ClickUp.

## Configuration

- `clickup.apiToken`: Your ClickUp Personal API Token.
- `clickup.spaceId`: The ID of the ClickUp space to fetch tasks from.

## Local Development

1.  Clone this repository.
2.  Install dependencies: `pnpm install`.
3.  Press `F5` in VS Code to open a new window with the extension loaded.
4.  Run the command "ClickUp: List Tasks and Copy" from the Command Palette.
