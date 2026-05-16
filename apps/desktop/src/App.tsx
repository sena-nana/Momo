import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./layouts/AppShell";
import Login from "./pages/Login";
import Today from "./pages/Today";
import Inbox from "./pages/Inbox";
import Calendar from "./pages/Calendar";
import Settings from "./pages/Settings";
import Widget from "./pages/Widget";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/widget" element={<Widget />} />
      <Route element={<AppShell />}>
        <Route path="/today" element={<Today />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/today" replace />} />
    </Routes>
  );
}
