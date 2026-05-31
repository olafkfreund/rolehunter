// Clearbit Logo API — free, no key, just a URL builder.
// https://clearbit.com/logo
//
// Given a website like "https://stripe.com", returns
// "https://logo.clearbit.com/stripe.com". Returns null if no usable host.

export function clearbitLogoUrl(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    const u = new URL(website);
    if (!u.host || u.host === "localhost") return null;
    return `https://logo.clearbit.com/${u.host.replace(/^www\./, "")}`;
  } catch {
    // Sometimes Wikidata returns a host without scheme; try prepending https://
    try {
      const u = new URL(`https://${website}`);
      if (!u.host || u.host === "localhost") return null;
      return `https://logo.clearbit.com/${u.host.replace(/^www\./, "")}`;
    } catch {
      return null;
    }
  }
}
