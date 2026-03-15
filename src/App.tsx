import { Route, Switch } from "wouter";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import ClientsPage from "@/pages/clients";
import ServicesPage from "@/pages/services";
import LogsPage from "@/pages/logs";
import SettingsPage from "@/pages/settings";
import { useEffect } from "react";
import { checkInternalUpdate } from "./lib/updater";
import { Toaster as SonnerToaster } from "sonner";

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

export default function App() {
  useEffect(() => {
    checkInternalUpdate();
  }, []);

  return (
    <TooltipProvider>
      <Toaster />
      <SonnerToaster position="top-right" richColors />
      <Router />
    </TooltipProvider>
  );
}
