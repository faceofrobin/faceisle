import type { LegalDocument } from "./types";

export const privacyPolicy: LegalDocument = {
  metaTitle: "Privacy — isle",
  title: "Privacy policy",
  updated: "Last updated: July 2026",
  intro: [
    "isle is a free browser game and a personal open-source project run by an individual — not a company. This page explains what stays on your device, what third parties may see when you load the site, and what is not collected.",
    "The short version: there are no accounts, no ads, no analytics trackers, and nothing is saved on your device. Your data is never sold.",
  ],
  sections: [
    {
      heading: "Who runs this",
      paragraphs: [
        "This site is operated by the author of isle as an individual personal project. For privacy questions, open an issue on the GitHub repository.",
      ],
      links: [
        {
          text: "GitHub repository",
          href: "https://github.com/kengocodes/isle",
        },
      ],
    },
    {
      heading: "What is stored on your device",
      paragraphs: [
        "Nothing. isle keeps no saves, no settings, no cookies, and no local storage. Each visit generates a fresh island in your browser, and closing the tab leaves nothing behind.",
      ],
    },
    {
      heading: "What is not collected",
      paragraphs: [
        "The game does not run accounts, analytics beacons, advertising trackers, or payment flows. It does not ask for a name, email, password, payment details, or precise location. There is no server-side player profile. All graphics and sound are generated in your browser — the game makes no requests to third-party services while you play.",
      ],
    },
    {
      heading: "Hosting and server logs",
      paragraphs: [
        "Copies of the game may be served from different hosts (for example the author’s site, itch.io, or similar platforms). Like most hosts, the platform serving your copy may process technical request data — for example IP address, user agent, timestamps, and the pages or files requested — in order to serve the game, keep it secure, and operate the platform. That processing is subject to that host’s privacy policy. This project does not run a separate analytics product on top of that.",
      ],
    },
    {
      heading: "Children",
      paragraphs: [
        "isle is a general-audience entertainment project and is not directed at children under 13. It does not knowingly collect personal information from children. If you believe a child has provided personal information through this site, contact the author via the GitHub repository and it will be addressed.",
      ],
      links: [
        {
          text: "GitHub repository",
          href: "https://github.com/kengocodes/isle",
        },
      ],
    },
    {
      heading: "Your choices",
      paragraphs: [
        "Since nothing is stored, there is nothing to clear. You can stop using the site at any time, and clearing this site’s data in your browser settings will always leave you exactly where you started.",
      ],
    },
    {
      heading: "Changes to this policy",
      paragraphs: [
        "If something meaningful changes — for example storing new data on your device, or adding a service that processes personal data — this page and the date at the top will be updated. Please check back after updates if you care about the details.",
      ],
    },
    {
      heading: "Related",
      paragraphs: [
        "How the game may be used is described in the Terms of service.",
      ],
      links: [{ text: "Terms of service", href: "#terms" }],
    },
  ],
};
