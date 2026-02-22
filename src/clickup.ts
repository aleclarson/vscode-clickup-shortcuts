import * as vscode from "vscode";

export interface Team {
  id: string;
  name: string;
}

export interface Space {
  id: string;
  name: string;
}

export interface Folder {
  id: string;
  name: string;
  lists?: List[];
}

export interface List {
  id: string;
  name: string;
}

export interface Task {
  id: string;
  name: string;
  description: string;
  status: { status: string };
  assignees: { id: number; username: string }[];
  priority: {
    id: string;
    priority: string;
    color: string;
    orderindex: string;
  } | null;
}

export interface User {
  id: number;
  username: string;
}

const BASE_URL = "https://api.clickup.com/api/v2";

export async function fetchClickUp(endpoint: string, token: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Authorization": token,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ClickUp API Error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function getCurrentUser(token: string): Promise<User> {
  const data = await fetchClickUp("/user", token) as { user: User };
  return data.user;
}

export async function getLists(spaceId: string, token: string): Promise<List[]> {
  const lists: List[] = [];
  // Space lists
  const spaceListsData = await fetchClickUp(`/space/${spaceId}/list`, token) as { lists: List[] };
  if (spaceListsData.lists) {
    lists.push(...spaceListsData.lists);
  }
  // Folder lists
  const foldersData = await fetchClickUp(`/space/${spaceId}/folder`, token) as { folders: Folder[] };
  if (foldersData.folders) {
    for (const folder of foldersData.folders) {
      if (folder.lists) {
        lists.push(...folder.lists.map(l => ({ ...l, name: `${folder.name} > ${l.name}` })));
      }
    }
  }
  return lists;
}

export async function getTasks(listId: string, token: string): Promise<Task[]> {
  const data = await fetchClickUp(`/list/${listId}/task?include_closed=false`, token) as { tasks: Task[] };
  return data.tasks || [];
}

export async function updateTask(taskId: string, updateData: any, token: string) {
  await fetchClickUp(`/task/${taskId}`, token, {
    method: "PUT",
    body: JSON.stringify(updateData),
  });
}
