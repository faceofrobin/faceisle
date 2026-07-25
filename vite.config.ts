import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

const BOOT_CHROME = "./src/ui/boot-chrome.css";

function inlineBootChrome(): Plugin {
  const linkRe =
    /<link\s+rel="stylesheet"\s+href="\.\/src\/ui\/boot-chrome\.css"\s*\/>/;
  return {
    name: "inline-boot-chrome",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        if (!linkRe.test(html)) return html;
        const css = readFileSync(resolve(import.meta.dirname, BOOT_CHROME), "utf8");
        return html.replace(linkRe, `<style>\n${css}\n</style>`);
      },
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [inlineBootChrome()],
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 1500,
  },
});
