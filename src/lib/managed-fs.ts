import { invoke } from "@tauri-apps/api/core";

export class FolderNotConfiguredError extends Error {}

/**
 * Ensures <baseDir>/<subDir> exists and opens it in the OS file explorer.
 * All fs/opener work happens in Rust (open_managed_folder), so it works for
 * any user-configured base folder — including network shares — without
 * needing a matching plugin-fs/plugin-opener capability scope.
 */
export async function openManagedFolder(
  baseDir: string | null | undefined,
  subDir?: string,
): Promise<void> {
  if (!baseDir) {
    throw new FolderNotConfiguredError();
  }
  await invoke("open_managed_folder", { baseDir, subDir: subDir ?? null });
}

/**
 * Ensures <baseDir>/<subDir> exists and writes `contents` to `filename`
 * inside it. Returns the final absolute path. See openManagedFolder.
 */
export async function writeManagedFile(
  baseDir: string | null | undefined,
  subDir: string | undefined,
  filename: string,
  contents: string,
): Promise<string> {
  if (!baseDir) {
    throw new FolderNotConfiguredError();
  }
  return await invoke<string>("write_managed_file", {
    baseDir,
    subDir: subDir ?? null,
    filename,
    contents,
  });
}
