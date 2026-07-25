import type { LegalDocument } from "./types";

export const termsOfService: LegalDocument = {
  metaTitle: "Terms — isle",
  title: "Terms of service",
  updated: "Last updated: July 2026",
  intro: [
    "By playing or otherwise using isle you agree to these terms. The game is a personal open-source project provided as-is for entertainment. They are short and in plain language.",
  ],
  sections: [
    {
      heading: "The project",
      paragraphs: [
        "isle is run by an individual as a personal project — not by a company. Source code lives in the GitHub repository under the MIT License. You may play the game in a browser, and you may use, modify, and redistribute the project under that license (see the LICENSE file in the repository).",
      ],
      links: [
        {
          text: "GitHub repository",
          href: "https://github.com/kengocodes/isle",
        },
      ],
    },
    {
      heading: "License and content",
      paragraphs: [
        "Unless a file or folder says otherwise, the software is offered under the MIT License. The isle name and branding should not be used in a way that implies official endorsement of a fork or unrelated project.",
      ],
    },
    {
      heading: "No warranty",
      paragraphs: [
        "The game is offered without warranties of any kind, express or implied. To the extent the law allows, the author is not liable for any loss arising from use of the game — including downtime, browser issues, or device issues.",
      ],
    },
    {
      heading: "Acceptable use",
      paragraphs: [
        "Do not attempt to disrupt hosting, overload the site with abusive automated traffic, or misrepresent the project or its author. Fair use of the open-source repository (cloning, forking, studying the code) is encouraged and is not restricted by this section.",
      ],
    },
    {
      heading: "Privacy",
      paragraphs: [
        "What little data third parties such as the host may process — and confirmation that the game itself stores nothing — is explained in the Privacy policy.",
      ],
      links: [{ text: "Privacy policy", href: "#privacy" }],
    },
    {
      heading: "Changes",
      paragraphs: [
        "These terms may be updated as the project evolves. The date at the top will change when they do. Continued use of the game after an update means you accept the revised terms. If you do not agree, stop using the site.",
      ],
    },
    {
      heading: "Contact",
      paragraphs: [
        "Questions about these terms: open an issue on the GitHub repository.",
      ],
      links: [
        {
          text: "GitHub repository",
          href: "https://github.com/kengocodes/isle",
        },
      ],
    },
  ],
};
