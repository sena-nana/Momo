import { NavLink, Outlet } from "react-router-dom";
import { PanelTopOpen } from "lucide-react";
import { useState } from "react";
import { openWidgetWindow } from "../window/widgetWindow";

const NAV = [
  { to: "/today", label: "Today" },
  { to: "/inbox", label: "Inbox" },
  { to: "/calendar", label: "Calendar" },
  { to: "/settings", label: "Settings" },
];

export default function AppShell() {
  const [widgetError, setWidgetError] = useState<string | null>(null);

  async function onOpenWidget() {
    setWidgetError(null);
    try {
      await openWidgetWindow();
    } catch (e) {
      setWidgetError(String(e));
    }
  }

  return (
    <div className="shell">
      <aside className="shell__sidebar">
        <div className="shell__brand">Momo</div>
        <nav className="shell__nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                "shell__nav-item" + (isActive ? " is-active" : "")
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="shell__footer">
          <button
            type="button"
            className="shell__widget-button"
            onClick={onOpenWidget}
          >
            <PanelTopOpen size={16} aria-hidden="true" />
            Open widget
          </button>
          {widgetError && <p className="shell__error">{widgetError}</p>}
          <NavLink to="/login" className="shell__nav-item">
            Sign out
          </NavLink>
        </div>
      </aside>
      <main className="shell__main">
        <Outlet />
      </main>
    </div>
  );
}
