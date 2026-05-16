import { describe, expect, it, vi } from "vitest";
import { openWidgetWindow, WIDGET_WINDOW_OPTIONS } from "../src/window/widgetWindow";

describe("widget window service", () => {
  it("focuses an existing widget window", async () => {
    const existing = {
      show: vi.fn().mockResolvedValue(undefined),
      setFocus: vi.fn().mockResolvedValue(undefined),
    };
    const api = {
      getByLabel: vi.fn().mockResolvedValue(existing),
      create: vi.fn(),
    };

    await expect(openWidgetWindow(api)).resolves.toBe("focused");

    expect(api.getByLabel).toHaveBeenCalledWith("widget");
    expect(existing.show).toHaveBeenCalledTimes(1);
    expect(existing.setFocus).toHaveBeenCalledTimes(1);
    expect(api.create).not.toHaveBeenCalled();
  });

  it("creates the widget window with the compact route", async () => {
    const api = {
      getByLabel: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockReturnValue({}),
    };

    await expect(openWidgetWindow(api)).resolves.toBe("created");

    expect(api.create).toHaveBeenCalledWith("widget", WIDGET_WINDOW_OPTIONS);
    expect(WIDGET_WINDOW_OPTIONS.url).toBe("/widget");
    expect(WIDGET_WINDOW_OPTIONS.alwaysOnTop).toBe(true);
    expect(WIDGET_WINDOW_OPTIONS.decorations).toBe(false);
  });
});
