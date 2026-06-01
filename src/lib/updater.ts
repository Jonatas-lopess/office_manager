import { getVersion } from "@tauri-apps/api/app";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { toast } from "sonner";

/**
 * Checks for updates in a internal network shared folder.
 * This is a simplified version of the Tauri updater for office environments.
 */
export async function checkInternalUpdate(isManual = false) {
  try {
    const updatePath = import.meta.env.VITE_UPDATE_PATH;
    if (!updatePath) {
      console.warn("VITE_UPDATE_PATH not set in .env");
      if (isManual) {
        toast.error("Caminho de atualização não configurado.");
      }
      return;
    }

    // 1. Get current version
    const currentVersion = await getVersion();

    // 2. Read remote version file
    // Assumes version.txt is in the root of the update path
    const remoteVersionPath = `${updatePath}\\version.txt`;
    const remoteVersion = (await readTextFile(remoteVersionPath)).trim();

    // console.log(`Current version: ${currentVersion}, Remote version: ${remoteVersion}`);

    // 3. Compare versions (simple string comparison for now, can be improved)
    if (remoteVersion !== currentVersion) {
      toast.info(`Nova atualização disponível!`, {
        description: `Versão ${remoteVersion} está disponível no servidor.`,
        action: {
          label: "Atualizar Agora",
          onClick: async () => {
            const installerPath = `${updatePath}\\ManagerDesk_${remoteVersion}_x64_en-US.msi`;
            console.log("Attempting to open installer at:", installerPath);

            // We don't await because on Windows, opening an MSI can return
            // a "failure" even if it successfully launched the installer.
            openPath(installerPath).catch((err) => {
              console.error(
                "Installer launch returned error (likely false positive):",
                err,
              );
            });

            // Close the app immediately so the installer can run
            setTimeout(async () => {
              await getCurrentWindow().close();
            }, 500);
          },
        },
        duration: 10000,
      });
    } else if (isManual) {
      toast.success("O sistema já está atualizado!", {
        description: `Versão ${currentVersion} é a mais recente.`,
      });
    }
  } catch (error) {
    console.error("Update check failed:", error);
    if (isManual) {
      toast.error("Falha ao verificar atualizações. Verifique a rede.");
    }
    // Silent fail if network share is not accessible and not manual
  }
}
