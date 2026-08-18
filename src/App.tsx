import { Route, Switch } from "wouter";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import ClientsPage from "@/pages/clients";
import ServicesPage from "@/pages/services";
import RefundsPage from "@/pages/refunds";
import LogsPage from "@/pages/logs";
import SettingsPage from "@/pages/settings";
import { useEffect } from "react";
import { checkInternalUpdate } from "./lib/updater";
import { Toaster as SonnerToaster } from "sonner";
import { SidebarProvider } from "@/components/ui/sidebar";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/clients" component={ClientsPage} />
      <Route path="/services" component={ServicesPage} />
      <Route path="/refunds" component={RefundsPage} />
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
      {/* SidebarProvider lives here so it persists across route changes,
          preventing the sidebar from re-mounting on every navigation */}
      <SidebarProvider>
        <Router />
      </SidebarProvider>
    </TooltipProvider>
  );
}
