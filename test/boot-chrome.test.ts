import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const html = readFileSync(resolve(root, "index.html"), "utf8");
const BOOT_CHROME_HREF = "./src/ui/boot-chrome.css";

function beforeModuleScript(source: string): string {
  const idx = source.search(/<script\b[^>]*\btype\s*=\s*["']module["']/i);
  return idx === -1 ? source : source.slice(0, idx);
}

function linkedStylesheetHrefs(markup: string): string[] {
  return [...markup.matchAll(/<link\b[^>]*\brel\s*=\s*["']stylesheet["'][^>]*>/gi)]
    .map((m) => m[0].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1])
    .filter((href): href is string => Boolean(href));
}

function inlineStyles(markup: string): string {
  return [...markup.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((m) => m[1])
    .join("\n");
}

function firstPaintCss(source: string = html): string {
  const early = beforeModuleScript(source);
  const chunks = [inlineStyles(early)];
  for (const href of linkedStylesheetHrefs(early)) {
    if (/^https?:\/\//i.test(href) || href.startsWith("./assets/")) continue;
    const path = resolve(root, href.replace(/^\.\//, ""));
    chunks.push(readFileSync(path, "utf8"));
  }
  return chunks.join("\n");
}

function expectBootChrome(css: string): void {
  expect(css).toMatch(/\.hidden\s*\{[^}]*display:\s*none/s);
  expect(css).toMatch(/#boot\s*\{[^}]*position:\s*fixed/s);
  expect(css).toMatch(/#boot-label|#boot\s+\.boot-label|\.boot-label/s);
  expect(css).toMatch(/\.boot-bar-fill\s*\{/s);
  expect(css).toMatch(/body:not\(\.ready\)\s+#prompt/s);
  expect(css).toMatch(/#prompt\s*\{[^}]*position:\s*fixed/s);
  expect(css).toMatch(/#prompt\s*\{[^}]*color:\s*#fff4e4/s);
  expect(css).toMatch(/#footer-links\s*\{[^}]*position:\s*fixed/s);
  expect(css).toMatch(
    /#footer-links\s+a(?:\s*,\s*#footer-links\s+button)?\s*\{[^}]*color:\s*#fff4e4/s,
  );
  expect(css).toMatch(
    /#footer-links\s+a\s*,\s*#footer-links\s+button\s*\{[^}]*color:\s*#fff4e4/s,
  );
  expect(css).toMatch(/#footer-links\s+button\s*\{[^}]*background:\s*none/s);
}

describe("first-paint chrome CSS (FOUC guard)", () => {
  it(`links ${BOOT_CHROME_HREF} before the module script`, () => {
    const early = beforeModuleScript(html);
    expect(linkedStylesheetHrefs(early)).toContain(BOOT_CHROME_HREF);
  });

  it("exposes boot loader, prompt, footer, and .hidden before modules load", () => {
    expectBootChrome(firstPaintCss());
    expect(html).toMatch(/id="boot"/);
    expect(html).toMatch(/id="boot-label"/);
    expect(html).toMatch(/id="boot-fill"/);
  });
});

describe("production index.html first-paint chrome", () => {
  const distHtmlPath = resolve(root, "dist/index.html");

  it.skipIf(!existsSync(distHtmlPath))(
    "inlines boot chrome before the module script (vite plugin)",
    () => {
      const distHtml = readFileSync(distHtmlPath, "utf8");
      const early = beforeModuleScript(distHtml);
      expect(linkedStylesheetHrefs(early)).not.toContain(BOOT_CHROME_HREF);
      expectBootChrome(inlineStyles(early));
    },
  );
});
