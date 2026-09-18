import { BrandArches } from "@/components/brand/brand-shapes";

export function ComingSoon() {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <BrandArches className="mb-5 h-16 w-16" />
      <h2 className="font-display text-[26px] leading-tight text-gray-900">
        We&apos;re working on this feature!
      </h2>
      <p className="mt-2 text-gray-500">
        Come back later &mdash; something great is on the way.
      </p>
    </div>
  );
}
