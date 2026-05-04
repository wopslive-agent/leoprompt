import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import Dashboard from "./pages/Dashboard";
import Onboarding from "./pages/Onboarding";
import Conversations from "./pages/Conversations";
import ConversationDetail from "./pages/ConversationDetail";
import Leads from "./pages/Leads";
import Billing from "./pages/Billing";
import AITraining from "./pages/AITraining";
import Settings from "./pages/Settings";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/signin"} component={SignIn} />
      <Route path={"/signup"} component={SignUp} />
      <Route path={"/dashboard"} component={Dashboard} />
      <Route path={"/onboarding"} component={Onboarding} />
      <Route path={"/conversations"} component={Conversations} />
      <Route path={"/conversations/:id"} component={ConversationDetail} />
      <Route path={"/leads"} component={Leads} />
      <Route path={"/billing"} component={Billing} />
      <Route path={"/ai-training"} component={AITraining} />
      <Route path={"/settings"} component={Settings} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
