import { AppView } from "../types";

const VIEW_PATHS: Record<AppView, string> = {
  calendar: "/calendar/",
  settings: "/settings/",
};

export function viewToPath(view: AppView): string {
  return VIEW_PATHS[view];
}

function normalizePath(pathname: string): string {
  if (!pathname) {
    return "/";
  }
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

export function pathToView(pathname: string): AppView {
  const normalizedPath = normalizePath(pathname);
  if (normalizedPath === "/settings/" || normalizedPath === "/block-generation/") {
    return "settings";
  }
  return "calendar";
}
