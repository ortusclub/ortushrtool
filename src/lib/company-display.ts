/**
 * users.company holds the legal entity name, which is not always what people
 * call it. Only the display differs — the stored value stays canonical, so
 * reports and filters keep grouping on one string.
 */
const COMPANY_DISPLAY_NAMES: Record<string, string> = {
  "Ortus Strategy Pte. Ltd.": "The Ortus Club",
};

/**
 * The "Working with" label, or null when it should be omitted.
 *
 * Hidden when the viewer's company IS the operating entity — telling a
 * Trinity employee they work with Trinity is noise, and reads oddly right
 * next to the identical brand in the top bar.
 */
export function assignedCompanyLabel(
  company: string | null | undefined
): string | null {
  const raw = company?.trim();
  if (!raw) return null;
  if (/\btrinity\b/i.test(raw)) return null;
  return COMPANY_DISPLAY_NAMES[raw] ?? raw;
}
