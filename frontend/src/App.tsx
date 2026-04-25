import { useEffect, useState } from "react";

import { AppView } from "./types";
import { pathToView, viewToPath } from "./utils/routing";
import { SettingsView } from "./views/BlockGenerationView";
import { CalendarView } from "./views/CalendarView";

function viewButtonClass(activeView: AppView, view: AppView): string {
  return [
    "rounded-md px-3 py-1.5 text-xs font-medium sm:px-4 sm:py-2 sm:text-sm",
    activeView === view ? "bg-slate-900 text-white" : "border border-slate-300 text-slate-700 hover:bg-slate-100",
  ].join(" ");
}

export function App() {
  const [activeView, setActiveView] = useState<AppView>(() => pathToView(window.location.pathname));

  useEffect(() => {
    const currentPath = window.location.pathname;
    const expectedPath = viewToPath(activeView);
    if (currentPath !== expectedPath) {
      window.history.replaceState(null, "", expectedPath);
    }
  }, [activeView]);

  useEffect(() => {
    const handlePopState = () => {
      setActiveView(pathToView(window.location.pathname));
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigateToView = (view: AppView) => {
    if (view === activeView) {
      return;
    }

    setActiveView(view);
    window.history.pushState(null, "", viewToPath(view));
  };

  return (
    <main className="min-h-screen bg-slate-100 p-2 text-slate-900 sm:p-3 md:p-6">
      <div className="mx-auto max-w-5xl space-y-2 sm:space-y-4">
        <nav className="flex flex-wrap gap-1.5 sm:gap-2">
          <a
            href={viewToPath("calendar")}
            className={viewButtonClass(activeView, "calendar")}
            onClick={(event) => {
              event.preventDefault();
              navigateToView("calendar");
            }}
          >
            Calendar
          </a>
          <a
            href={viewToPath("settings")}
            className={viewButtonClass(activeView, "settings")}
            onClick={(event) => {
              event.preventDefault();
              navigateToView("settings");
            }}
          >
            Settings
          </a>
        </nav>

        <div>{activeView === "calendar" ? <CalendarView /> : <SettingsView />}</div>
      </div>
    </main>
  );
}
