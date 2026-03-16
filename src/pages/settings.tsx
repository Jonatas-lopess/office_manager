import { useState } from "react";
import { Check, Moon, SunMedium, Loader2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// import { Switch } from "@/components/ui/switch";
import { AppShell, TableCard } from "@/components/panel/panel-kit";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSync } from "@/db/sync-context";
import packageJson from "../../package.json";

export default function SettingsPage() {
  const { myId, connectedPeers, connectionStatus } = useSync();
  const [dark, setDark] = useState(false);
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
        </div>
      </ScrollArea>
    </AppShell>
  );
}
