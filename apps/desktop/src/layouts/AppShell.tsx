import { NavLink, Outlet } from "react-router-dom";

const NAV = [
  { to: "/today", label: "Today" },
  { to: "/inbox", label: "Inbox" },
  { to: "/calendar", label: "Calendar" },
  { to: "/settings", label: "Settings" },
];

export default function AppShell() {
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
