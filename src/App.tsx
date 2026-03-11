import { useSyncBridge } from "./hooks/useSyncBridge";
import { useDb } from "./db/context";

import { Route, Switch } from "wouter";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import ClientsPage from "@/pages/clients";
import ServicesPage from "@/pages/services";
import LogsPage from "@/pages/logs";
import SettingsPage from "@/pages/settings";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/clients" component={ClientsPage} />
      <Route path="/services" component={ServicesPage} />
      <Route path="/logs" component={LogsPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

type AppProps = {
  hubIp: string | null;
  isTauri: boolean;
};

export default function App({ hubIp, isTauri }: AppProps) {
  const { db } = useDb();
  const wsUrl = hubIp ? `ws://${hubIp}:1234/ws` : `ws://localhost:1234/ws`;
  useSyncBridge(db, wsUrl, isTauri);

  return (
    <TooltipProvider>
      <Toaster />
      <Router />
    </TooltipProvider>
  );
}
