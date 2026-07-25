
interface LegalSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  after?: string[];
  links?: Array<{ text: string; href: string }>;
}

export interface LegalDocument {
  metaTitle: string;
  title: string;
  updated: string;
  intro: string[];
  sections: LegalSection[];
}

export type LegalPageId = "privacy" | "terms";
