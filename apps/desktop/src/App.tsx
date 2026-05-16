import { Navigate, Route, Routes } from "react-router-dom";
import { useMemo } from "react";
import AppShell from "./layouts/AppShell";
import Login from "./pages/Login";
import Today from "./pages/Today";
import Inbox from "./pages/Inbox";
import Calendar from "./pages/Calendar";
import Settings from "./pages/Settings";
import Widget from "./pages/Widget";
import { useTaskRepository } from "./data/TaskRepositoryContext";
import { createLocalSyncRunner } from "./sync/localSyncRunner";
import {
  createRemoteSyncConfig,
  type RemoteSyncEnv,
} from "./sync/remoteSyncConfig";

export default function App() {
  const repository = useTaskRepository();
  const localSyncRunner = useMemo(
    () => createLocalSyncRunner(repository),
    [repository],
  );
  const remoteSyncConfig = useMemo(
    () => createRemoteSyncConfig(readRemoteSyncEnv(import.meta.env)),
    [],
  );

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/widget" element={<Widget />} />
      <Route element={<AppShell />}>
        <Route path="/today" element={<Today />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route
          path="/settings"
          element={
            <Settings
              remoteSyncConfig={remoteSyncConfig}
              onRunLocalSyncSimulation={() => localSyncRunner.runOnce()}
            />
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/today" replace />} />
    </Routes>
  );
}

function readRemoteSyncEnv(env: ImportMetaEnv): RemoteSyncEnv {
  return {
    VITE_MOMO_SYNC_BASE_URL: env.VITE_MOMO_SYNC_BASE_URL,
    VITE_MOMO_SYNC_TOKEN: env.VITE_MOMO_SYNC_TOKEN,
  };
}
