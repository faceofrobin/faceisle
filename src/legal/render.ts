import { privacyPolicy } from "./privacy";
import { isLegalPageId } from "./routes";
import { termsOfService } from "./terms";
import type { LegalDocument, LegalPageId } from "./types";

export function legalDocument(id: LegalPageId): LegalDocument {
  return id === "privacy" ? privacyPolicy : termsOfService;
}

function linkify(
  text: string,
  links: LegalDocument["sections"][number]["links"],
): DocumentFragment {
  const frag = document.createDocumentFragment();
  if (!links?.length) {
    frag.append(text);
    return frag;
  }

  let remaining = text;
  for (const link of links) {
    const index = remaining.indexOf(link.text);
    if (index === -1) continue;
    const before = remaining.slice(0, index);
    if (before) frag.append(before);
    const a = document.createElement("a");
    a.href = link.href;
    a.textContent = link.text;
    if (/^https?:\/\//i.test(link.href)) {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    } else {
      const id = link.href.replace(/^[#/]/, "");
      if (isLegalPageId(id)) a.dataset.legal = id;
    }
    frag.append(a);
    remaining = remaining.slice(index + link.text.length);
  }
  if (remaining) frag.append(remaining);
  return frag;
}

function appendParagraphs(
  parent: HTMLElement,
  paragraphs: string[],
  links: LegalDocument["sections"][number]["links"],
): void {
  for (const text of paragraphs) {
    const p = document.createElement("p");
    p.append(linkify(text, links));
    parent.append(p);
  }
}

export function renderLegalDocument(
  doc: LegalDocument,
  root: HTMLElement,
): void {
  root.replaceChildren();

  const article = document.createElement("article");
  article.className = "legal-article";

  const h1 = document.createElement("h1");
  h1.id = "legal-heading";
  h1.tabIndex = -1;
  h1.textContent = doc.title;
  article.append(h1);

  const updated = document.createElement("p");
  updated.className = "legal-updated";
  updated.textContent = doc.updated;
  article.append(updated);

  const intro = document.createElement("div");
  intro.className = "legal-intro";
  appendParagraphs(intro, doc.intro, undefined);
  article.append(intro);

  for (const section of doc.sections) {
    const sec = document.createElement("section");
    sec.className = "legal-section";

    const h2 = document.createElement("h2");
    h2.textContent = section.heading;
    sec.append(h2);

    const body = document.createElement("div");
    body.className = "legal-section-body";
    appendParagraphs(body, section.paragraphs, section.links);

    if (section.bullets?.length) {
      const ul = document.createElement("ul");
      for (const bullet of section.bullets) {
        const li = document.createElement("li");
        li.append(linkify(bullet, section.links));
        ul.append(li);
      }
      body.append(ul);
    }

    if (section.after?.length) {
      appendParagraphs(body, section.after, section.links);
    }

    sec.append(body);
    article.append(sec);
  }

  root.append(article);
}
