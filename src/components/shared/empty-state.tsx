import {
  BrandPetals,
  BrandRing,
  BrandLeaves,
  BrandSunburst,
} from "@/components/brand/brand-shapes";

/**
 * The empty/complete state for a list or panel, with a p17 brand element.
 *
 * `tone` picks the shape by what the emptiness *means*, which is the whole
 * point of having four of them — "no results for your filter" and "you're all
 * caught up" are different messages and shouldn't wear the same illustration.
 */
type Tone = "empty" | "none-yet" | "all-clear" | "done";

const SHAPE: Record<Tone, (p: { className?: string }) => React.ReactElement> = {
  empty: BrandPetals, // neutral: a list with nothing in it
  "none-yet": BrandRing, // nothing has been created yet
  "all-clear": BrandLeaves, // nothing outstanding — a good state
  done: BrandSunburst, // an action just completed
};

export function EmptyState({
  tone = "empty",
  title,
  description,
  className = "",
}: {
  tone?: Tone;
  title: string;
  description?: string;
  className?: string;
}) {
  const Shape = SHAPE[tone];
  return (
    <div
      className={`flex flex-col items-center justify-center px-6 py-10 text-center ${className}`}
    >
      <Shape className="mb-3 h-12 w-12" />
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-gray-500">{description}</p>
      )}
    </div>
  );
}
