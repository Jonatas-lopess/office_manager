import { openManagedFolder, FolderNotConfiguredError } from "@/lib/managed-fs";

export { FolderNotConfiguredError as ClientFolderNotConfiguredError };

/**
 * Opens <customClientFolderPath>/<clientName>, creating it if needed.
 */
export async function openClientFolder(clientName: string): Promise<void> {
  const baseDir = localStorage.getItem("customClientFolderPath");
  await openManagedFolder(baseDir, clientName);
}

export async function openClientFolderBase(baseDir: string): Promise<void> {
  await openManagedFolder(baseDir);
}
