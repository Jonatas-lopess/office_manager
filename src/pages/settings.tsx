import { useState } from "react";
import { Check, Moon, SunMedium, Loader2, WifiOff, Trash2, Database, Save, Folder, Lock as LockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// import { Switch } from "@/components/ui/switch";
import { AppShell, TableCard } from "@/components/panel/panel-kit";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSync } from "@/db/sync-context";
import { useDb } from "@/db/context";
import { useToast } from "@/hooks/use-toast";
import { clientsTable, servicesTable } from "@/db/schema";
import { logAction } from "@/lib/logger";
import packageJson from "../../package.json";
import { appDataDir, join } from "@tauri-apps/api/path";
import { copyFile, mkdir, exists } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";

export default function SettingsPage() {
  const { orm } = useDb();
  const { myId, connectedPeers, connectionStatus } = useSync();
  const { toast } = useToast();
  const [dark, setDark] = useState(false);
  const [isUnlocked] = useState(
    () => sessionStorage.getItem("isUnlocked") === "true",
  );
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [resetInput, setResetInput] = useState("");

  const handleFullReset = async () => {
    await orm.delete(servicesTable);
    await orm.delete(clientsTable);
    await logAction(orm, {
      action: `BASE REINICIADA: Todos os clientes e serviços foram excluídos`,
      module: "Configurações",
      status: "Warning",
      device: connectedPeers.find((p) => p.id === myId)?.ip || undefined,
    });
    toast({
      variant: "destructive",
      title: "Base reiniciada",
      description: `Todos os registros de clientes e serviços foram removidos com sucesso.`,
    });
    setIsResetDialogOpen(false);
    setResetInput("");
  };

  const handleBackup = async () => {
    try {
      const updatePath = import.meta.env.VITE_UPDATE_PATH;
      if (!updatePath) {
        toast({
          variant: "destructive",
          title: "Erro no Backup",
          description: "Caminho de rede (VITE_UPDATE_PATH) não configurado.",
        });
        return;
      }

      const backupDir = await join(updatePath, "Backups");

      // Ensure directory exists
      if (!(await exists(backupDir))) {
        await mkdir(backupDir, { recursive: true });
      }

      const dateStr = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      const backupPath = await join(backupDir, `backup_${dateStr}.db`);

      const appDir = await appDataDir();
      const sourceDb = await join(appDir, "my_local_database.db");

      // In Tauri dev, the db might be in a different place depending on setup,
      // but usually it's in the app data dir.
      await copyFile(sourceDb, backupPath);

      toast({
        title: "Backup Concluído",
        description: `Cópia salva em: ${backupPath}`,
      });

      await logAction(orm, {
        action: `BACKUP CRIADO: Backup salvo em rede`,
        module: "Configurações",
        status: "Success",
      });
    } catch (err) {
      console.error("Backup failed:", err);
      toast({
        variant: "destructive",
        title: "Falha no Backup",
        description: "Não foi possível copiar o arquivo da base para a rede.",
      });
    }
  };

  const handleOpenBackupDir = async () => {
    try {
      const updatePath = import.meta.env.VITE_UPDATE_PATH;
      if (!updatePath) {
        toast({
          variant: "destructive",
          title: "Erro",
          description: "Caminho de rede (VITE_UPDATE_PATH) não configurado.",
        });
        return;
      }

      const backupDir = await join(updatePath, "Backups");

      // Ensure directory exists
      if (!(await exists(backupDir))) {
        await mkdir(backupDir, { recursive: true });
      }

      await openPath(backupDir);
    } catch (err) {
      console.error("Failed to open backup directory:", err);
      toast({
        variant: "destructive",
        title: "Erro ao abrir pasta",
        description: "Não foi possível abrir a pasta de backup.",
      });
    }
  };

  const openResetDialog = () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setResetCode(code);
    setResetInput("");
    setIsResetDialogOpen(true);
  };
  // const [compact, setCompact] = useState(false);

  const codenameArray = [
    "Alfa",
    "Bravo",
    "Charlie",
    "Delta",
    "Echo",
    "Foxtrot",
  ];

  return (
    <AppShell
      title="Configurações"
      subtitle="Preferências e padrões do painel."
    >
      <ScrollArea className="flex-1 pr-4">
        <div className="grid gap-4 lg:grid-cols-3" data-testid="grid-settings">
          <Card
            className="panel-card lg:col-span-2"
            data-testid="card-preferences"
          >
            <div className="p-5">
              <div
                className="text-sm font-medium"
                data-testid="text-preferences-title"
              >
                Preferências
              </div>
              <div className="mt-4 grid gap-4" data-testid="list-preferences">
                <div
                  className="flex items-center justify-between gap-4"
                  data-testid="row-theme"
                >
                  <div>
                    <div
                      className="text-sm font-medium"
                      data-testid="text-theme-label"
                    >
                      Tema
                    </div>
                    <div
                      className="mt-1 text-sm text-muted-foreground"
                      data-testid="text-theme-desc"
                    >
                      Alternar entre claro e escuro.
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setDark((v) => !v);
                      document.documentElement.classList.toggle("dark");
                    }}
                    className="gap-2"
                    data-testid="button-toggle-theme"
                  >
                    {dark ? (
                      <>
                        <SunMedium className="h-4 w-4" />
                        Claro
                      </>
                    ) : (
                      <>
                        <Moon className="h-4 w-4" />
                        Escuro
                      </>
                    )}
                  </Button>
                </div>

                <div
                  className="flex items-center justify-between gap-4"
                  data-testid="row-shortcuts"
                >
                  <div>
                    <div
                      className="text-sm font-medium"
                      data-testid="text-shortcuts-label"
                    >
                      Atalhos de teclado
                    </div>
                    <div
                      className="mt-1 text-sm text-muted-foreground"
                      data-testid="text-shortcuts-desc"
                    >
                      Navegação rápida.
                    </div>
                  </div>
                  <div
                    className="flex items-center gap-2"
                    data-testid="kbd-shortcuts"
                  >
                    <span
                      className="kbd rounded-md px-2 py-1 text-xs"
                      data-testid="kbd-g"
                    >
                      G
                    </span>
                    <span
                      className="kbd rounded-md px-2 py-1 text-xs"
                      data-testid="kbd-d"
                    >
                      D
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="panel-card" data-testid="card-backup">
            <div className="p-5">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Database className="h-4 w-4" />
                Backup e Segurança
              </div>
              <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                Realize cópias de segurança da base de dados local para o servidor de rede.
              </p>

              <div className="mt-5 grid gap-2">
                <Button
                  variant="outline"
                  onClick={handleBackup}
                  className="w-full gap-2 border-emerald-500/20 bg-emerald-500/5 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700"
                  data-testid="button-backup-db"
                >
                  <Save className="h-4 w-4" />
                  Gerar Backup Agora
                </Button>
                <Button
                  variant="outline"
                  onClick={handleOpenBackupDir}
                  className="w-full gap-2"
                  data-testid="button-open-backup-dir"
                >
                  <Folder className="h-4 w-4" />
                  Abrir Pasta de Backup
                </Button>
                <div className="text-[10px] text-center text-muted-foreground italic">
                  O backup será salvo na pasta compartilhada da rede.
                </div>
              </div>
            </div>
          </Card>

          <Card
            className={cn(
              "panel-card border-destructive/20 bg-destructive/5 lg:col-span-2 relative overflow-hidden",
              !isUnlocked && "opacity-80",
            )}
            data-testid="card-danger-zone"
          >
            <div className={cn("p-5", !isUnlocked && "blur-[2px] pointer-events-none select-none")}>
              <div
                className="text-sm font-semibold text-destructive flex items-center gap-2"
                data-testid="text-danger-zone-title"
              >
                <Trash2 className="h-4 w-4" />
                Zona de Perigo
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Ações irreversíveis que afetam todos os dados do sistema.
              </p>

              <div className="mt-4 pt-4 border-t border-destructive/10">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium">
                      Reiniciar Base Total
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Exclui todos os clientes e serviços cadastrados.
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    onClick={openResetDialog}
                    className="gap-2 shrink-0"
                    data-testid="button-reset-total"
                  >
                    <Trash2 className="h-4 w-4" />
                    Reiniciar
                  </Button>
                </div>
              </div>
            </div>

            {!isUnlocked && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/20 backdrop-blur-[1px] z-10 transition-all">
                <div className="rounded-full bg-destructive/10 p-3 mb-2">
                  <LockIcon className="h-6 w-6 text-destructive" />
                </div>
                <div className="text-[10px] font-bold text-destructive uppercase tracking-widest">
                  Zona Bloqueada
                </div>
                <p className="text-[9px] text-muted-foreground mt-1">
                  Desbloqueie o painel para acessar
                </p>
              </div>
            )}
          </Card>

          <TableCard
            title="Espaço de Trabalho"
            description="Padrões deste protótipo"
            dataTestId="card-workspace"
          >
            <div
              className="grid gap-3 p-4 text-sm"
              data-testid="list-workspace"
            >
              <div
                className="flex items-center justify-between"
                data-testid="row-workspace-status"
              >
                <div
                  className="text-muted-foreground"
                  data-testid="text-workspace-status-label"
                >
                  Status
                </div>
                <div
                  className="inline-flex items-center gap-2"
                  data-testid="text-workspace-status-value"
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Ativo
                </div>
              </div>
              <div
                className="flex items-center justify-between"
                data-testid="row-workspace-version"
              >
                <div
                  className="text-muted-foreground"
                  data-testid="text-workspace-version-label"
                >
                  Versão
                </div>
                <div
                  className="font-mono text-xs"
                  data-testid="text-workspace-version-value"
                >
                  v{packageJson.version}
                </div>
              </div>
              <div
                className="flex items-center justify-between"
                data-testid="row-workspace-changes"
              >
                <div
                  className="text-muted-foreground"
                  data-testid="text-workspace-changes-label"
                >
                  Alterações
                </div>
                {connectionStatus === "connected" ? (
                  <div
                    className="inline-flex items-center gap-2"
                    data-testid="text-workspace-changes-value"
                  >
                    <Check className="h-4 w-4 text-emerald-500" />
                    Sincronizado
                  </div>
                ) : connectionStatus === "connecting" ||
                  connectionStatus === "reconnecting" ? (
                  <div
                    className="inline-flex items-center gap-2 text-amber-500"
                    data-testid="text-workspace-changes-value"
                  >
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sincronizando...
                  </div>
                ) : (
                  <div
                    className="inline-flex items-center gap-2 text-destructive"
                    data-testid="text-workspace-changes-value"
                  >
                    <WifiOff className="h-4 w-4" />
                    Desconectado
                  </div>
                )}
              </div>
            </div>
          </TableCard>

          <TableCard
            title="Dispositivos conectados"
            description="Sessões ativas no momento"
            dataTestId="card-devices"
          >
            <div className="grid gap-3 p-4 text-sm" data-testid="list-devices">
              {connectedPeers.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-4">
                  Nenhum dispositivo conectado.
                </div>
              ) : (
                connectedPeers.map((peer, idx) => {
                  const isMe = peer.id === myId;
                  const pingIndicator = (
                    <div className="relative">
                      <div className="h-2 w-2 rounded-full bg-emerald-500" />
                      {isMe && (
                        <div className="absolute inset-0 h-2 w-2 animate-ping rounded-full bg-emerald-500 opacity-75" />
                      )}
                    </div>
                  );

                  return (
                    <div
                      key={peer.id}
                      className="flex items-center justify-between"
                      data-testid={`row-device-${idx + 1}`}
                    >
                      <div className="flex items-center gap-3">
                        {isMe ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              {pingIndicator}
                            </TooltipTrigger>
                            <TooltipContent>Este Dispositivo</TooltipContent>
                          </Tooltip>
                        ) : (
                          pingIndicator
                        )}
                        <div className="font-medium">
                          {codenameArray[idx] || `PC ${idx + 1}`}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {peer.ip}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </TableCard>
        </div>
      </ScrollArea>

      <AlertDialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              Reiniciar Base de Dados
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é <span className="font-bold underline">irreversível</span> e excluirá <span className="font-bold text-foreground">todos os clientes e serviços</span> cadastrados.
              <br />
              <br />
              Para confirmar, digite o código abaixo:
              <span className="mt-2 flex justify-center">
                <span className="bg-muted px-3 py-1 font-mono text-lg font-bold tracking-widest rounded-md border text-foreground select-none">
                  {resetCode}
                </span>
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Input
              value={resetInput}
              onChange={(e) => setResetInput(e.target.value.toUpperCase())}
              placeholder="Digite o código acima..."
              className="text-center font-mono uppercase"
              autoComplete="off"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={resetInput !== resetCode}
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                handleFullReset();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Excluir Tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
