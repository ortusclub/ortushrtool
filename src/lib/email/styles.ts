/**
 * Render-time email styling.
 *
 * Templates are stored as semantic HTML so they edit cleanly in the visual
 * editor. Visual polish (button look, status banners, container) is applied
 * at send time by wrapping the body and substituting class hooks for inline
 * styles — required because email clients strip <style> tags.
 */

const CONTAINER_STYLE =
  "font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;";

const CLASS_STYLES: Record<string, string> = {
  button:
    "display: inline-block; margin-top: 16px; padding: 10px 20px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;",
  "button-purple":
    "display: inline-block; margin-top: 16px; padding: 10px 20px; background: #7c3aed; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;",
  "button-teal":
    "display: inline-block; margin-top: 16px; padding: 10px 20px; background: #0d9488; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;",
  "banner-success":
    "background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 16px 0; font-weight: bold; color: #166534;",
  "banner-danger":
    "background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 16px 0; font-weight: bold; color: #991b1b;",
  "banner-warning":
    "background: #fef3c7; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin: 16px 0; color: #92400e;",
  muted: "color: #6b7280; font-size: 14px;",
};

/**
 * Applies inline styles to known class hooks in the body, then wraps the
 * result in the email container. Idempotent for HTML without class hooks.
 */
export function applyEmailStyles(body: string): string {
  const styled = body.replace(
    /class="([^"]+)"/g,
    (match, classList: string) => {
      const classes = classList.split(/\s+/).filter(Boolean);
      const styles = classes
        .map((c) => CLASS_STYLES[c])
        .filter((s): s is string => Boolean(s));
      if (styles.length === 0) return match;
      return `style="${styles.join(" ")}"`;
    }
  );
  return `<div style="${CONTAINER_STYLE}">\n${styled}\n</div>`;
}
