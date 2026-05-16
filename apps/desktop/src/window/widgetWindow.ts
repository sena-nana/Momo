import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export const WIDGET_WINDOW_OPTIONS = {
  url: "/widget",
  title: "Momo Widget",
  decorations: false,
  transparent: true,
  alwaysOnTop: true,
  skipTaskbar: true,
  resizable: false,
  width: 360,
  height: 560,
  visible: true,
} as const;

type WidgetWindowState = "created" | "focused";

interface WidgetWindowHandle {
  show?: () => Promise<void>;
  setFocus?: () => Promise<void>;
}

interface WidgetWindowApi {
  getByLabel(label: string): Promise<WidgetWindowHandle | null>;
  create(label: string, options: typeof WIDGET_WINDOW_OPTIONS): WidgetWindowHandle;
}

const tauriWidgetWindowApi: WidgetWindowApi = {
  getByLabel: (label) => WebviewWindow.getByLabel(label),
  create: (label, options) => new WebviewWindow(label, options),
};

export async function openWidgetWindow(
  api: WidgetWindowApi = tauriWidgetWindowApi,
): Promise<WidgetWindowState> {
  const existing = await api.getByLabel("widget");
  if (existing) {
    await existing.show?.();
    await existing.setFocus?.();
    return "focused";
  }

  api.create("widget", WIDGET_WINDOW_OPTIONS);
  return "created";
}
