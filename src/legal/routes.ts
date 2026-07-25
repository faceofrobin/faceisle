import type { LegalPageId } from "./types";

export function isLegalPageId(value: string): value is LegalPageId {
  return value === "privacy" || value === "terms";
}

export function legalHref(id: LegalPageId): string {
  return `#${id}`;
}

/** `#privacy` / `#terms` (with or without leading `#`). */
export function legalIdFromHash(hash: string = location.hash): LegalPageId | null {
  const id = hash.replace(/^#/, "").replace(/\/$/, "");
  return isLegalPageId(id) ? id : null;
}

/** Apex-site legacy paths: `/privacy`, `/terms`. */
export function legalIdFromPathname(
  pathname: string = location.pathname,
): LegalPageId | null {
  const m = pathname.match(/^\/(privacy|terms)\/?$/);
  return m && isLegalPageId(m[1]) ? m[1] : null;
}

export function legalIdFromHref(href: string, base: string = location.href): LegalPageId | null {
  const raw = href.trim();
  if (!raw || raw.startsWith("mailto:") || /^https?:\/\//i.test(raw)) {
    if (/^https?:\/\//i.test(raw)) {
      try {
        const url = new URL(raw);
        if (url.origin !== new URL(base).origin) return null;
        return legalIdFromHash(url.hash) ?? legalIdFromPathname(url.pathname);
      } catch {
        return null;
      }
    }
    return null;
  }
  if (raw.startsWith("#")) return legalIdFromHash(raw);
  try {
    const url = new URL(raw, base);
    return legalIdFromHash(url.hash) ?? legalIdFromPathname(url.pathname);
  } catch {
    return null;
  }
}

/** Rewrite `/privacy` → `/#privacy` so bookmarks keep working on the apex host. */
export function migrateLegacyLegalPath(): LegalPageId | null {
  const id = legalIdFromPathname(location.pathname);
  if (!id) return null;
  history.replaceState(
    { legal: id },
    "",
    `/${location.search}${legalHref(id)}`,
  );
  return id;
}
