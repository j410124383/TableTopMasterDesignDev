const HANDLE_PREFIX = "dir-handle:";

type DirPickerWindow = Window & {
  showDirectoryPicker?: (opts?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
};

export function canPickDirectory(): boolean {
  return typeof (window as DirPickerWindow).showDirectoryPicker === "function";
}

export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  const picker = (window as DirPickerWindow).showDirectoryPicker;
  if (!picker) return null;
  try {
    return await picker({ mode: "readwrite" });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return null;
    throw err;
  }
}

export function folderDisplayName(handle: FileSystemDirectoryHandle): string {
  const raw = typeof handle.name === "string" ? handle.name : "";
  return raw.trim() || "已选择本地文件夹";
}

export async function ensurePermission(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  const withPerm = handle as FileSystemDirectoryHandle & {
    queryPermission?: (o: { mode: "readwrite" }) => Promise<PermissionState>;
    requestPermission?: (o: { mode: "readwrite" }) => Promise<PermissionState>;
  };
  if (withPerm.queryPermission) {
    const current = await withPerm.queryPermission({ mode: "readwrite" });
    if (current === "granted") return true;
  }
  if (withPerm.requestPermission) {
    return (await withPerm.requestPermission({ mode: "readwrite" })) === "granted";
  }
  return true;
}

export async function writeTextFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  text: string,
): Promise<void> {
  const file = await dir.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(text);
  await writable.close();
}

export async function writeBlobFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  blob: Blob,
): Promise<void> {
  const file = await dir.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(blob);
  await writable.close();
}

export async function readTextFile(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<string> {
  const file = await dir.getFileHandle(name);
  return (await file.getFile()).text();
}

export async function tryReadText(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<string | null> {
  try {
    return await readTextFile(dir, name);
  } catch {
    return null;
  }
}

export async function fileExists(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<boolean> {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

export async function ensureSubdir(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemDirectoryHandle> {
  return dir.getDirectoryHandle(name, { create: true });
}

export async function tryGetDir(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await dir.getDirectoryHandle(name);
  } catch {
    return null;
  }
}

export async function dirHasEntries(dir: FileSystemDirectoryHandle): Promise<boolean> {
  const anyDir = dir as FileSystemDirectoryHandle & {
    values?: () => AsyncIterable<FileSystemHandle>;
  };
  if (!anyDir.values) {
    const files = await listFileNames(dir);
    return files.length > 0;
  }
  for await (const _ of anyDir.values()) {
    return true;
  }
  return false;
}

export async function listFileNames(
  dir: FileSystemDirectoryHandle,
): Promise<string[]> {
  const names: string[] = [];
  const anyDir = dir as FileSystemDirectoryHandle & {
    values?: () => AsyncIterable<FileSystemHandle>;
  };
  if (!anyDir.values) return names;
  for await (const entry of anyDir.values()) {
    if (entry.kind === "file") names.push(entry.name);
  }
  return names;
}

export async function hasCeditorMarker(dir: FileSystemDirectoryHandle): Promise<boolean> {
  const names = await listFileNames(dir);
  return names.some((n) => n.endsWith(".ceditor") || n.endsWith(".tcp"));
}

export function handleKey(projectId: string): string {
  return `${HANDLE_PREFIX}${projectId}`;
}

export function safeFolderName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "untitled";
}

export async function removeFile(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<void> {
  try {
    await dir.removeEntry(name);
  } catch {
    /* missing is fine */
  }
}
