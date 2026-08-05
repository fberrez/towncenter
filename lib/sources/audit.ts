// In-house website audit: no third party, no key, no quota. It reads the home
// page, `robots.txt`, `sitemap.xml` and the last archive.org snapshot.
// It produces facts, never a score, and never throws: an unreachable site
// returns partial facts, because a harvest chains hundreds of addresses.

import type {
  SiteAuditFacts,
  SiteAuditIssue,
} from "@/lib/types";

const DEFAULT_TIMEOUT_MS = 8_000;

/** A robot UA gets 429 from sites that answer 200 to a browser. */
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// past the cap, keep the HEAD (metadata, generator, viewport) AND the TAIL
// (the footer, where the agency credit lives).
const MAX_HTML_CHARS = 3_000_000;
const HEAD_CHARS = 2_000_000;
const TAIL_CHARS = 1_000_000;

/** A sitemap index can list dozens of children. */
const MAX_SITEMAPS = 2;
const MAX_SITEMAP_CHILDREN = 5;

export type SiteAuditOptions = {
  timeoutMs?: number;
  /** Skipping the sitemap saves two network calls per address. */
  withSitemap?: boolean;
  /** Skipping archive.org saves one network call per address. */
  withWayback?: boolean;
};

// every key of the result is optional: a missing key reads as "unknown", a
// `false` is an observation.
export async function auditSite(
  url: string | null | undefined,
  options: SiteAuditOptions = {},
): Promise<SiteAuditFacts> {
  const raw = typeof url === "string" ? url.trim() : "";
  if (raw === "") return { issue: "no_known_site" };

  const parsed = parseUrl(raw);
  if (!parsed) return { issue: "no_known_site" };

  if (isInstagramUrl(parsed)) {
    return {
      // `no_known_site` is the safest value for a reader that ignores
      // `instagramAsSite`.
      issue: "no_known_site",
      url: parsed.toString(),
      instagramAsSite: true,
      https: parsed.protocol === "https:",
    };
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const page = await fetchHomePage(parsed, timeoutMs);

  if (!page) {
    return { issue: "site_unreachable", url: parsed.toString() };
  }

  const facts = readHtml(page);

  const origin = new URL(page.finalUrl).origin;
  const [sitemap, wayback] = await Promise.all([
    options.withSitemap === false
      ? Promise.resolve(null)
      : readSitemaps(origin, timeoutMs),
    options.withWayback === false
      ? Promise.resolve(null)
      : lastWaybackSnapshot(page.finalUrl, timeoutMs),
  ]);

  if (sitemap) facts.sitemapUrlCount = sitemap.urlCount;

  // decreasing reliability: a `<lastmod>` is the site's own statement, the
  // archive.org snapshot only dates a crawler's visit.
  const lastModified = sitemap?.lastModified ?? page.lastModified ?? wayback;
  if (lastModified) facts.lastModified = lastModified;

  return facts;
}

function parseUrl(raw: string): URL | null {
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (!url.hostname.includes(".")) return null;
    return url;
  } catch {
    return null;
  }
}

export function isInstagramUrl(url: URL | string): boolean {
  const parsed = typeof url === "string" ? parseUrl(url) : url;
  if (!parsed) return false;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  return host === "instagram.com" || host === "instagr.am" || host === "m.instagram.com";
}

type FetchedPage = {
  finalUrl: string;
  status: number;
  html: string;
  /** ISO, from the `Last-Modified` header when the server sends one. */
  lastModified: string | null;
};

// apex and `www` are not interchangeable: one can fail TLS while the other
// answers 200, so both are tried.
async function fetchHomePage(
  url: URL,
  timeoutMs: number,
): Promise<FetchedPage | null> {
  for (const candidate of hostCandidates(url)) {
    const page = await fetchPage(candidate, timeoutMs);
    if (page && page.status < 400) return page;
  }
  return null;
}

function hostCandidates(url: URL): string[] {
  const alternate = new URL(url.toString());
  alternate.hostname = url.hostname.startsWith("www.")
    ? url.hostname.slice(4)
    : `www.${url.hostname}`;

  const first = url.toString();
  const second = alternate.toString();
  return first === second ? [first] : [first, second];
}

async function fetchPage(
  url: string,
  timeoutMs: number,
): Promise<FetchedPage | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
    });

    const body = await response.text().catch(() => "");
    const header = response.headers.get("last-modified");
    const parsedHeader = header ? new Date(header) : null;

    return {
      finalUrl: response.url || url,
      status: response.status,
      html: capHtml(body),
      lastModified:
        parsedHeader && Number.isFinite(parsedHeader.getTime())
          ? parsedHeader.toISOString()
          : null,
    };
  } catch {
    // broken TLS, missing DNS, reset connection, timeout: none are fatal here.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function capHtml(html: string): string {
  if (html.length <= MAX_HTML_CHARS) return html;
  return `${html.slice(0, HEAD_CHARS)}\n${html.slice(-TAIL_CHARS)}`;
}

async function fetchText(url: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "fr-FR,fr;q=0.9" },
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Every pattern in this file is written lowercase and accent-free. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** The few entities that show up in a `<title>`. Not an HTML parser. */
function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&eacute;/gi, "é")
    .replace(/&egrave;/gi, "è")
    .replace(/&agrave;/gi, "à")
    .replace(/&ccedil;/gi, "ç")
    .replace(/&#8217;/g, "'")
    .replace(/&#x27;/gi, "'");
}

function extractTitle(html: string): string {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match) return "";
  return decodeEntities(match[1] ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMeta(html: string, name: string): string | null {
  const pattern = new RegExp(
    `<meta[^>]+name=["']?${name}["']?[^>]*>`,
    "i",
  );
  const tag = pattern.exec(html)?.[0];
  if (!tag) return null;
  const content = /content=["']([^"']*)["']/i.exec(tag)?.[1];
  return content ? decodeEntities(content).trim() : null;
}

// order matters, most specific first: a Shopify theme sometimes runs behind a
// WordPress, and it is the shop that decides the offer.
const TECH_MARKERS: Array<{ label: string; test: RegExp }> = [
  { label: "Shopify", test: /cdn\.shopify\.com|\/cdn\/shop\/|myshopify\.com|shopify\.theme|x-shopify/ },
  { label: "Wix", test: /wixstatic\.com|parastorage\.com|wix\.com website builder|x-wix-/ },
  { label: "Squarespace", test: /squarespace\.com|static1\.squarespace|squarespace-cdn/ },
  { label: "Webflow", test: /webflow\.(com|io)|assets\.website-files\.com|data-wf-page/ },
  { label: "Framer", test: /framerusercontent\.com|framer\.(com|website)/ },
  { label: "PrestaShop", test: /prestashop/ },
  { label: "WooCommerce", test: /woocommerce/ },
  { label: "WordPress", test: /\/wp-content\/|\/wp-includes\/|\/wp-json|wp-embed/ },
  { label: "Drupal", test: /drupal-settings-json|\/sites\/default\/files\// },
  { label: "Joomla", test: /\/media\/jui\/|joomla/ },
  { label: "Weebly", test: /weebly\.com/ },
  { label: "Jimdo", test: /jimdo/ },
  { label: "e-monsite", test: /e-monsite\.com/ },
  { label: "SiteW", test: /sitew\.com/ },
  { label: "Odoo", test: /odoo/ },
  { label: "Google Sites", test: /sites\.google\.com|gstatic\.com\/_\/mss\// },
  { label: "Ghost", test: /ghost\.io|content\/images\/size\/w\d/ },
];

function canonicalGenerator(raw: string): string {
  const folded = fold(raw);
  if (folded.includes("wordpress")) return raw.trim().slice(0, 60);
  if (folded.includes("wix")) return "Wix";
  if (folded.includes("squarespace")) return "Squarespace";
  if (folded.includes("shopify")) return "Shopify";
  if (folded.includes("webflow")) return "Webflow";
  if (folded.includes("drupal")) return raw.trim().slice(0, 60);
  if (folded.includes("joomla")) return raw.trim().slice(0, 60);
  return raw.trim().slice(0, 60);
}

// strings that give away an untouched template. Matched against folded HTML,
// so they carry no accents.
const DEFAULT_THEME_MARKERS: RegExp[] = [
  /just another wordpress site/,
  /welcome to wordpress\. this is your first post/,
  /site title.*tagline/,
  /mon site wordpress/,
  /\/themes\/twenty(twenty|nineteen|seventeen|sixteen|fifteen)/,
  /ce site a ete concu avec .{0,20}wix/,
  /this (site|website) was designed with .{0,20}wix/,
  /creez votre site (web )?(aujourd|des)/,
  /lorem ipsum dolor sit amet/,
  /this is a placeholder/,
  /page en construction|site en construction|under construction/,
];

/** Free themes shipped with Shopify. */
const SHOPIFY_DEFAULT_THEMES =
  /"name"\s*:\s*"(dawn|debut|brooklyn|venture|minimal|simple|express|craft|crave|sense|studio|taste|colorblock|publisher|refresh|ride|spotlight|origin)"/;

/** Titles that say nothing: the field was never filled in. */
const PLACEHOLDER_TITLES = new Set([
  "",
  "home",
  "home page",
  "accueil",
  "page d accueil",
  "untitled",
  "untitled document",
  "document sans nom",
  "document sans titre",
  "new page",
  "nouvelle page",
  "site title",
  "titre du site",
  "my site",
  "mon site",
  "my website",
  "website",
  "site web",
  "index",
  "welcome",
  "bienvenue",
  "blog",
  "my blog",
  "my wordpress site",
  "mon site wordpress",
  "just another wordpress site",
  "boutique en ligne",
  "online store",
]);

function readHtml(page: FetchedPage): SiteAuditFacts {
  const html = page.html;
  const hay = fold(html);
  const finalUrl = new URL(page.finalUrl);
  const host = finalUrl.hostname.replace(/^www\./, "");

  const title = extractTitle(html);
  const generator = extractMeta(html, "generator");

  const tech = detectTechno(hay, generator);

  const facts: SiteAuditFacts = {
    issue: "site_ok" satisfies SiteAuditIssue,
    url: page.finalUrl,
    tech,
    https: finalUrl.protocol === "https:",
    viewport: /<meta[^>]+name=["']?viewport/i.test(html),
    titleFilled: isTitleFilled(title, host),
    structuredData: /application\/ld\+json/i.test(html),
    onlineSales: detectSelling(hay),
    onlineBooking: detectBooking(hay),
    agencyDetected: detectAgency(hay),
    instagramAsSite: false,
  };

  const photos = readImages(html);
  // the key stays ABSENT when the page shows no image at all: see `readImages`.
  if (photos.visible) {
    facts.usablePhotos = photos.count >= SIGNIFICANT_IMAGES_MIN;
  }

  facts.defaultTheme = detectDefaultTheme(hay, title, host, tech);

  return facts;
}

function detectTechno(hay: string, generator: string | null): string | null {
  if (generator && generator.trim() !== "") return canonicalGenerator(generator);
  for (const marker of TECH_MARKERS) {
    if (marker.test.test(hay)) return marker.label;
  }
  return null;
}

// the domain name copied into the `<title>` counts as EMPTY: that is what the
// host puts there when nobody typed anything.
function isTitleFilled(title: string, host: string): boolean {
  const folded = fold(title).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  if (folded.length < 3) return false;
  if (PLACEHOLDER_TITLES.has(folded)) return false;

  const foldedHost = fold(host);
  if (folded === foldedHost.replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()) {
    return false;
  }
  const bare = foldedHost.split(".")[0] ?? "";
  if (bare !== "" && folded === bare) return false;

  return true;
}

function detectDefaultTheme(
  hay: string,
  title: string,
  host: string,
  tech: string | null,
): boolean {
  for (const marker of DEFAULT_THEME_MARKERS) {
    if (marker.test(hay)) return true;
  }

  const foldedTitle = fold(title).trim();

  if (/^(welcome to|bienvenue sur)\b/.test(foldedTitle)) return true;
  if (!isTitleFilled(title, host)) return true;

  // only tested on a Shopify shop: "Dawn" is also a first name.
  if (tech === "Shopify" && SHOPIFY_DEFAULT_THEMES.test(hay)) return true;
  if (tech === "Shopify" && foldedTitle === "dawn") return true;

  return false;
}

// only evidence of USE counts: Wix ships its commerce module on EVERY site, so
// a token in a bundle is not a shop.
function detectSelling(hay: string): boolean {
  return (
    /ubereats\.com|deliveroo\.|just-?eat\.|foodora|glovo/.test(hay) ||
    /ajouter au panier|add to cart|voir le panier|mon panier|votre panier/.test(hay) ||
    /href="[^"]*\/(cart|panier|checkout|commande)(\/|"|\?)/.test(hay) ||
    /woocommerce|snipcart|shopify\.checkout|cart_count|prestashop/.test(hay) ||
    /click *(and|&|et) *collect|click-and-collect|commander en ligne|commande en ligne/.test(hay)
  );
}

function detectBooking(hay: string): boolean {
  return /zenchef|thefork|lafourchette|opentable|sevenrooms|resy\.com|guestonline|bookatable|tableonline|reserver une table|book a table|reservation en ligne|reserver en ligne/.test(
    hay,
  );
}

// agency credit in the footer. "Powered by WordPress" is NOT an agency: see
// `PLATFORM_WORDS`.
const AGENCY_PATTERNS: RegExp[] = [
  // the leading `\b` is load-bearing: without it "handmade by" matches "made
  // by".
  /\b(realisation|realise|realisee|conception|concu|developpe|developpement|design|designed|created|made|built|site) (du site |de ce site |web )?(par|by)\s+([^<\n.,]{2,40})/g,
  /\b(web ?design|webdesign|creation (du )?site|agence) (par|by)\s+([^<\n.,]{2,40})/g,
];

/** What follows "by" and is a platform rather than an agency. */
const PLATFORM_WORDS =
  /wordpress|shopify|wix|squarespace|webflow|woocommerce|prestashop|joomla|drupal|elementor|divi|blogger|jimdo|weebly|framer|odoo|google|wordpress\.com|nous|moi|l equipe/;

function detectAgency(hay: string): boolean {
  for (const pattern of AGENCY_PATTERNS) {
    // the patterns are global: reset the cursor before each page.
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null = pattern.exec(hay);
    while (match) {
      const tail = match[match.length - 1] ?? "";
      if (!PLATFORM_WORDS.test(tail)) return true;
      match = pattern.exec(hay);
    }
  }
  return false;
}

/** An assumed heuristic, not a measurement. */
const SIGNIFICANT_IMAGES_MIN = 5;

/** File names that are not photos: chrome, not content. */
const DECORATIVE_HINTS =
  /icon|logo|sprite|pixel|spacer|blank|favicon|avatar|badge|flag|emoji|1x1|placeholder|loader|spinner|arrow|bullet|separator|pattern|noise|tracking|beacon/;

const PHOTO_EXTENSION = /\.(jpe?g|png|webp|avif)(\?|#|$)/;

/** CDNs that serve images without an extension: the host decides, not the URL. */
const IMAGE_CDN =
  /wixstatic\.com|cdn\.shopify\.com|images\.squarespace-cdn|cloudinary\.com|imgix\.net|unsplash\.com|cdninstagram|images\.prismic|imagedelivery\.net|contentful|googleusercontent\.com|ggpht\.com|framerusercontent\.com|fbcdn\.net|imagekit\.io|cdn\.sanity\.io/;

// "no photos" is not "nothing seen": a Wix page serves ZERO `<img>` because
// everything is injected by JavaScript. `visible` false means the caller must
// leave the fact unknown rather than answer "no".
function readImages(html: string): { count: number; visible: boolean } {
  const urls = new Set<string>();

  const attributes =
    /(?:src|data-src|data-lazy-src|data-original|data-bg)\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null = attributes.exec(html);
  while (match) {
    addImage(urls, match[1] ?? "");
    match = attributes.exec(html);
  }

  const srcset = /srcset\s*=\s*["']([^"']+)["']/gi;
  match = srcset.exec(html);
  while (match) {
    const first = (match[1] ?? "").split(",")[0]?.trim().split(/\s+/)[0] ?? "";
    addImage(urls, first);
    match = srcset.exec(html);
  }

  const background = /background-image\s*:\s*url\(\s*["']?([^"')]+)/gi;
  match = background.exec(html);
  while (match) {
    addImage(urls, match[1] ?? "");
    match = background.exec(html);
  }

  if (/property=["']og:image["']/i.test(html)) urls.add("og:image");

  const visible =
    /<img[\s>]/i.test(html) || /background-image\s*:\s*url\(\s*["']?https?:/i.test(html);

  return { count: urls.size, visible };
}

function addImage(urls: Set<string>, raw: string): void {
  const value = raw.trim();
  if (value === "" || value.startsWith("data:")) return;

  const folded = fold(value);
  if (DECORATIVE_HINTS.test(folded)) return;
  if (/\.(svg|gif|ico)(\?|#|$)/.test(folded)) return;
  if (!PHOTO_EXTENSION.test(folded) && !IMAGE_CDN.test(folded)) return;

  urls.add(value.split("?")[0] ?? value);
}

type SitemapReading = {
  urlCount: number;
  lastModified: string | null;
};

// a `sitemap.xml` is often a `<sitemapindex>`, so counting the root `<loc>`
// under-reports. One level of descent only, and the count stays a floor.
async function readSitemaps(
  origin: string,
  timeoutMs: number,
): Promise<SitemapReading | null> {
  const declared = await readRobots(origin, timeoutMs);
  const candidates =
    declared.length > 0 ? declared : [`${origin}/sitemap.xml`];

  let urlCount = 0;
  let lastModified: string | null = null;
  let seen = false;

  for (const candidate of candidates.slice(0, MAX_SITEMAPS)) {
    const xml = await fetchText(candidate, timeoutMs);
    if (!xml) continue;
    seen = true;

    if (/<sitemapindex/i.test(xml)) {
      const children = extractLocs(xml).slice(0, MAX_SITEMAP_CHILDREN);
      for (const child of children) {
        const childXml = await fetchText(child, timeoutMs);
        if (!childXml) continue;
        urlCount += countUrlEntries(childXml);
        lastModified = laterOf(lastModified, latestLastmod(childXml));
      }
      continue;
    }

    urlCount += countUrlEntries(xml);
    lastModified = laterOf(lastModified, latestLastmod(xml));
  }

  return seen ? { urlCount, lastModified } : null;
}

/** The `Sitemap:` lines of robots.txt, deduplicated and absolute. */
async function readRobots(origin: string, timeoutMs: number): Promise<string[]> {
  const text = await fetchText(`${origin}/robots.txt`, timeoutMs);
  if (!text) return [];

  const found = new Set<string>();
  const pattern = /^\s*sitemap\s*:\s*(\S+)\s*$/gim;
  let match: RegExpExecArray | null = pattern.exec(text);
  while (match) {
    const raw = match[1] ?? "";
    try {
      found.add(new URL(raw, origin).toString());
    } catch {
      // an unreadable `Sitemap:` line does not stop the following ones.
    }
    match = pattern.exec(text);
  }
  return [...found];
}

function extractLocs(xml: string): string[] {
  const out: string[] = [];
  const pattern = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let match: RegExpExecArray | null = pattern.exec(xml);
  while (match) {
    out.push(match[1] ?? "");
    match = pattern.exec(xml);
  }
  return out;
}

function countUrlEntries(xml: string): number {
  return (xml.match(/<url>/gi) ?? []).length || extractLocs(xml).length;
}

function latestLastmod(xml: string): string | null {
  const pattern = /<lastmod>\s*([^<\s]+)\s*<\/lastmod>/gi;
  let best: string | null = null;
  let match: RegExpExecArray | null = pattern.exec(xml);
  while (match) {
    const date = new Date(match[1] ?? "");
    if (Number.isFinite(date.getTime())) {
      best = laterOf(best, date.toISOString());
    }
    match = pattern.exec(xml);
  }
  return best;
}

function laterOf(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

// archive.org always answers 200; a missing snapshot is an empty
// `archived_snapshots: {}`, and the timestamp is a `YYYYMMDDhhmmss` that
// `new Date()` cannot read. The index is keyed on the exact STRING, so a
// trailing slash returns `{}` where the same host without it returns a snapshot.
async function lastWaybackSnapshot(
  url: string,
  timeoutMs: number,
): Promise<string | null> {
  for (const form of waybackForms(url)) {
    const endpoint = `https://archive.org/wayback/available?url=${encodeURIComponent(form)}`;
    const body = await fetchText(endpoint, timeoutMs);
    if (!body) continue;

    try {
      const payload = JSON.parse(body) as {
        archived_snapshots?: {
          closest?: { available?: boolean; timestamp?: string };
        };
      };
      const closest = payload.archived_snapshots?.closest;
      if (!closest?.available || !closest.timestamp) continue;
      const iso = waybackTimestampToIso(closest.timestamp);
      if (iso) return iso;
    } catch {
      // unreadable answer: try the next form.
    }
  }
  return null;
}

/** `https://www.example.fr/` -> [`www.example.fr`, `example.fr`]. */
function waybackForms(url: string): string[] {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return [];
  }

  const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
  const other = parsed.hostname.startsWith("www.")
    ? parsed.hostname.slice(4)
    : `www.${parsed.hostname}`;

  return [...new Set([`${parsed.hostname}${path}`, `${other}${path}`])];
}

/** `20250808103321` -> `2025-08-08T10:33:21.000Z`. */
export function waybackTimestampToIso(stamp: string): string | null {
  if (!/^\d{14}$/.test(stamp)) return null;
  const date = new Date(
    Date.UTC(
      Number(stamp.slice(0, 4)),
      Number(stamp.slice(4, 6)) - 1,
      Number(stamp.slice(6, 8)),
      Number(stamp.slice(8, 10)),
      Number(stamp.slice(10, 12)),
      Number(stamp.slice(12, 14)),
    ),
  );
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
