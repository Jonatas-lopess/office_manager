import { getVersion } from "@tauri-apps/api/app";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";

/**
 * Checks for updates in a internal network shared folder.
 * This is a simplified version of the Tauri updater for office environments.
 */
export async function checkInternalUpdate() {
  try {
    const updatePath = import.meta.env.VITE_UPDATE_PATH;
    if (!updatePath) {
      console.warn("VITE_UPDATE_PATH not set in .env");
      return;
    }

    // 1. Get current version
    const currentVersion = await getVersion();

    // 2. Read remote version file
    // Assumes version.txt is in the root of the update path
    const remoteVersionPath = `${updatePath}/version.txt`;
    const remoteVersion = (await readTextFile(remoteVersionPath)).trim();

    console.log(
      `Current version: ${currentVersion}, Remote version: ${remoteVersion}`,
    );

    // 3. Compare versions (simple string comparison for now, can be improved)
    if (remoteVersion !== currentVersion) {
      toast.info(`Nova atualização disponível!`, {
        description: `Versão ${remoteVersion} está disponível no servidor.`,
        action: {
          label: "Atualizar Agora",
          onClick: async () => {
            try {
              const installerPath = `${updatePath}/office_manager_installer.msi`;
              await openPath(installerPath);
              // Optionally close the app after launching installer
              // await exit();
            } catch (err) {
              console.error("Failed to open installer:", err);
              toast.error(
                "Erro ao abrir o instalador. Verifique o caminho da rede.",
              );
            }
          },
        },
        duration: 10000,
      });
    }
  } catch (error) {
    console.error("Update check failed:", error);
    // Silent fail if network share is not accessible
  }
}
