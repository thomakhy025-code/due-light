/** True only in the GitHub Pages static export. There is no Node server on that host. */
export const pagesHost = process.env.NEXT_PUBLIC_DUE_LIGHT_HOST === "pages";

export const pagesReaderMessage =
  "The study model could not load in this browser. Clear dates and bullet notes still work on this device.";
