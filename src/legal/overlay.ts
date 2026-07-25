import "./legal.css";
import { legalDocument, renderLegalDocument } from "./render";
import {
  legalHref,
  legalIdFromHash,
  legalIdFromHref,
  migrateLegacyLegalPath,
} from "./routes";
import type { LegalPageId } from "./types";

const DEFAULT_TITLE = "isle";

let wired = false;
let silence: (on: boolean) => void = () => {};

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

function setLegalReading(on: boolean): void {
  document.documentElement.classList.toggle("legal-reading", on);
  document.body.classList.toggle("legal-reading", on);
  silence(on);
}

function gameUrl(): string {
  return `${location.pathname}${location.search}`;
}

function legalUrl(id: LegalPageId): string {
  return `${location.pathname}${location.search}${legalHref(id)}`;
}

export function isLegalOpen(): boolean {
  return !$("legal").classList.contains("hidden");
}

export function openLegal(id: LegalPageId, push = true): void {
  const doc = legalDocument(id);
  renderLegalDocument(doc, $("legal-content"));
  setLegalReading(true);
  const legalEl = $("legal");
  legalEl.classList.remove("hidden");
  legalEl.setAttribute("role", "main");
  legalEl.setAttribute("aria-labelledby", "legal-heading");
  document.title = doc.metaTitle;
  legalEl.scrollTop = 0;
  $("legal-heading").focus({ preventScroll: true });
  if (push && legalIdFromHash() !== id) {
    history.pushState({ legal: id }, "", legalUrl(id));
  }
}

function closeLegal(push = true): void {
  const legalEl = $("legal");
  legalEl.classList.add("hidden");
  legalEl.removeAttribute("role");
  legalEl.removeAttribute("aria-labelledby");
  setLegalReading(false);
  document.title = DEFAULT_TITLE;
  if (push && legalIdFromHash()) {
    history.pushState({}, "", gameUrl());
  }
}

function syncFromLocation(): void {
  const id = legalIdFromHash();
  if (id) openLegal(id, false);
  else if (isLegalOpen()) closeLegal(false);
}

export function initLegalOverlay(setSilent: (on: boolean) => void): void {
  if (wired) return;
  wired = true;
  silence = setSilent;

  migrateLegacyLegalPath();

  document.addEventListener("click", (e) => {
    const a = (e.target as HTMLElement).closest?.("a");
    if (!(a instanceof HTMLAnchorElement)) return;
    const id = legalIdFromHref(a.getAttribute("href") ?? "");
    if (!id) return;
    e.preventDefault();
    openLegal(id);
  });

  $("btn-legal-back").addEventListener("click", (e) => {
    e.preventDefault();
    closeLegal();
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Escape" && isLegalOpen()) {
      e.preventDefault();
      closeLegal();
    }
  });

  window.addEventListener("popstate", syncFromLocation);
  window.addEventListener("hashchange", syncFromLocation);

  syncFromLocation();
}
