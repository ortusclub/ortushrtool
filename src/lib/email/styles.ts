/**
 * Render-time email styling.
 *
 * Templates are stored as semantic HTML so they edit cleanly in the visual
 * editor. Visual polish (button look, status banners, container, brand
 * header/footer) is applied at send time by wrapping the body and
 * substituting class hooks for inline styles — required because email
 * clients strip <style> tags.
 *
 * Colors below are the same tokens as `src/app/globals.css` (Trinity brand
 * book, 2026), not a separate palette. Headings fall back straight to
 * Georgia rather than attempting to load Maragsa Display via @font-face —
 * Gmail and most corporate gateways strip custom web fonts in mail
 * entirely, so a real @font-face there would silently do nothing for most
 * recipients while adding a failure mode. Georgia is also the brand's own
 * declared fallback (see --font-display in globals.css).
 */

const APP_URL = (() => {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  return url && !url.includes("localhost") ? url : "https://trinityhr.vercel.app";
})();

const LOGO_COLOR_URL = `${APP_URL}/email/trinity-mark-color.png`;
const LOGO_MONO_URL = `${APP_URL}/email/trinity-mark-mono.png`;

const STRIPE_COLORS = [
  "#ac4c02", // brand-brown
  "#ffa103", // brand-gold
  "#ffcc1e", // brand-yellow
  "#fb844a", // brand-orange
  "#90c06c", // brand-green-leaf
  "#5e9f33", // brand-green
  "#3c3487", // brand-indigo
];

const OUTER_STYLE =
  "max-width: 600px; margin: 0 auto; border-radius: 10px; overflow: hidden; background: #fffdfa; border: 1px solid #ede0ce;";

const BODY_STYLE =
  "font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; padding: 30px 28px 26px; color: #46362a;";

const H2_STYLE =
  "font-family: Georgia, 'Times New Roman', serif; font-weight: 400; font-size: 22px; margin: 0 0 14px; color: #1d1611;";

const STRIPE =
  `<div style="display:table;width:100%;height:5px;">` +
  STRIPE_COLORS.map((c) => `<div style="display:table-cell;background:${c};"></div>`).join("") +
  `</div>`;

const HEADER =
  `<div style="background:#f5eace;padding:18px 24px;border-bottom:1px solid #e9dcc0;">` +
  `<img src="${LOGO_COLOR_URL}" width="33" height="16" alt="Trinity" style="vertical-align:middle;margin-right:9px;" />` +
  `<span style="font-family: Georgia, 'Times New Roman', serif; font-size:17px; color:#201847; vertical-align:middle;">Trinity&nbsp;HR</span>` +
  `</div>`;

const FOOTER =
  `<div style="padding:18px 28px 22px;background:#fffdfa;border-top:1px solid #ede0ce;text-align:center;">` +
  `<img src="${LOGO_MONO_URL}" width="24" height="12" alt="" style="opacity:0.55;margin-bottom:6px;" />` +
  `<p style="margin:0;font-size:11.5px;color:#a3907a;">This is an automated message from Trinity HR</p>` +
  `</div>`;

const CLASS_STYLES: Record<string, string> = {
  button:
    "display: inline-block; margin-top: 16px; padding: 12px 26px; background: #3c3487; color: #ffffff; text-decoration: none; border-radius: 7px; font-weight: 600;",
  "button-purple":
    "display: inline-block; margin-top: 16px; padding: 12px 26px; background: #5a4aa0; color: #ffffff; text-decoration: none; border-radius: 7px; font-weight: 600;",
  "button-teal":
    "display: inline-block; margin-top: 16px; padding: 12px 26px; background: #1f8399; color: #ffffff; text-decoration: none; border-radius: 7px; font-weight: 600;",
  "banner-success":
    "background: #f1f7ea; border: 1px solid #c9e2b2; border-radius: 8px; padding: 14px 16px; margin: 16px 0; font-weight: 600; color: #2f5119;",
  "banner-danger":
    "background: #fdf0f0; border: 1px solid #f3c2c1; border-radius: 8px; padding: 14px 16px; margin: 16px 0; font-weight: 600; color: #711917;",
  "banner-warning":
    "background: #fffaea; border: 1px solid #ffe58c; border-radius: 8px; padding: 14px 16px; margin: 16px 0; color: #6b4e00;",
  muted: "color: #7e6a55; font-size: 13px;",
};

/**
 * Applies inline styles to known class hooks in the body, then wraps the
 * result in the branded container (palette stripe, logo header, footer).
 * Idempotent for HTML without class hooks.
 */
export function applyEmailStyles(body: string): string {
  const styled = body
    .replace(/<h2>/g, `<h2 style="${H2_STYLE}">`)
    .replace(/class="([^"]+)"/g, (match, classList: string) => {
      const classes = classList.split(/\s+/).filter(Boolean);
      const styles = classes
        .map((c) => CLASS_STYLES[c])
        .filter((s): s is string => Boolean(s));
      if (styles.length === 0) return match;
      return `style="${styles.join(" ")}"`;
    });

  return (
    `<div style="${OUTER_STYLE}">` +
    STRIPE +
    HEADER +
    `<div style="${BODY_STYLE}">${styled}</div>` +
    FOOTER +
    `</div>`
  );
}
