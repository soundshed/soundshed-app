import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser } from "@fortawesome/free-solid-svg-icons/faUser";
import { faWindowMaximize } from "@fortawesome/free-solid-svg-icons/faWindowMaximize";
import { faWindowMinimize } from "@fortawesome/free-solid-svg-icons/faWindowMinimize";
import { faWindowRestore } from "@fortawesome/free-solid-svg-icons/faWindowRestore";

/**
 * FontAwesome's per-icon modules are CommonJS but set `__esModule: true` while
 * exporting no `default`. A default import therefore resolves to `undefined`,
 * FontAwesomeIcon renders nothing, and the button shows up as an empty box with
 * no build or type error. These tests pin the working named-import form.
 */

const SRC_DIR = join(__dirname, "..", "..");

function collectSourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "node_modules") collectSourceFiles(full, found);
    } else if (/\.tsx?$/.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

describe("FontAwesome icon imports", () => {
  it.each([
    ["faUser", faUser, "user"],
    ["faWindowMaximize", faWindowMaximize, "window-maximize"],
    ["faWindowMinimize", faWindowMinimize, "window-minimize"],
    ["faWindowRestore", faWindowRestore, "window-restore"],
  ])("%s resolves to a usable icon definition", (_name, icon, iconName) => {
    expect(icon).toBeDefined();
    expect(icon.iconName).toBe(iconName);
    expect(icon.prefix).toBe("fas");
    // icon.icon is [width, height, ligatures, unicode, svgPathData]
    expect(Array.isArray(icon.icon)).toBe(true);
    expect(typeof icon.icon[4]).toBe("string");
    expect((icon.icon[4] as string).length).toBeGreaterThan(0);
  });

  it("exposes no default export, which is why default imports render nothing", async () => {
    // Read the raw CommonJS exports: this is what webpack sees at build time.
    // Vitest's own ESM interop synthesises a `default`, so `await import()` here
    // would hide the very bug this guards against.
    const { createRequire } = await import("module");
    const mod = createRequire(__filename)(
      "@fortawesome/free-solid-svg-icons/faWindowMinimize"
    );

    expect(mod.__esModule).toBe(true);
    expect(mod.default).toBeUndefined();
    expect(mod.faWindowMinimize).toBeDefined();
  });

  it.each([
    ["faUser", faUser],
    ["faWindowMaximize", faWindowMaximize],
    ["faWindowMinimize", faWindowMinimize],
    ["faWindowRestore", faWindowRestore],
  ])("%s actually renders a visible svg through FontAwesomeIcon", (_n, icon) => {
    const html = renderToStaticMarkup(
      React.createElement(FontAwesomeIcon, { icon })
    );

    // An unresolved icon renders "" and leaves an empty button in the UI.
    expect(html).not.toBe("");
    expect(html).toContain("<svg");
    expect(html).toContain("<path");
  });

  it("is never imported with the silently-undefined default form", () => {
    // e.g. `import faUser from "@fortawesome/..."` - compiles, types fine, renders nothing.
    const badImport = /^\s*import\s+fa\w+\s+from\s+["']@fortawesome/gm;
    const offenders: string[] = [];

    for (const file of collectSourceFiles(SRC_DIR)) {
      if (badImport.test(readFileSync(file, "utf8"))) {
        offenders.push(file.replace(SRC_DIR, "src"));
      }
      badImport.lastIndex = 0;
    }

    expect(offenders).toEqual([]);
  });
});
