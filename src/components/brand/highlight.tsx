/**
 * The brand book's marker-swipe highlight (p3, p14): an irregular block of
 * colour behind a short phrase set in Maragsâ.
 *
 * Both blobs are the real vectors lifted from p3 — the yellow from "trinity
 * talent house", the red from "a home for the right fit." The hand-drawn
 * wobble is the point, so they are not rounded rectangles.
 * `preserveAspectRatio="none"` lets one shape stretch to any phrase length:
 * the vertical wobble survives, only the horizontal jitter scales.
 *
 * No z-index anywhere. The blob is painted first and the text span carries
 * `relative`, so the text paints over it by DOM order. A negative z-index
 * here would risk the blob dropping behind the page background inside any
 * parent that never establishes a stacking context.
 *
 * Use sparingly — at most one per page. It is an emphasis device and stops
 * emphasising anything if every heading wears one.
 *
 * The text colour is hard-set rather than inherited: both blobs are light and
 * saturated, so the text must stay dark under dark mode too. `text-gray-900`
 * would be remapped to near-white by the dark retrofit in globals.css, which
 * lands at 1.52:1 on the yellow.
 */

const BLOBS = {
  yellow: {
    fill: "#ffcb00",
    viewBox: "0 0 242.56 56.70",
    transform: "translate(-347.15 -319.70)",
    d: "M 575.691406 368.875 L 549 369.621094 L 522.214844 368.042969 L 495.546875 369.550781 L 468.890625 371.308594 L 442.25 373.363281 L 415.515625 373.246094 L 388.753906 372.527344 L 362.179688 376.40625 L 350.199219 362.941406 L 347.152344 342.660156 L 360.257812 328.90625 L 386.933594 327.757812 L 413.589844 326.050781 L 440.289062 325.394531 L 466.980469 324.527344 L 493.65625 323.210938 L 520.386719 323.359375 L 546.972656 319.703125 L 573.796875 321.964844 L 587.667969 332.929688 L 589.710938 353.25 Z M 575.691406 368.875 ",
  },
  red: {
    fill: "#f93f40",
    viewBox: "0 0 268.36 56.25",
    transform: "translate(-821.73 -416.38)",
    d: "M 1078.179688 472.625 L 1051.265625 471.453125 L 1024.429688 467.65625 L 997.488281 467.34375 L 970.535156 467.3125 L 943.570312 467.609375 L 916.679688 465.464844 L 889.808594 462.636719 L 862.777344 464.996094 L 835.925781 461.367188 L 821.734375 448.890625 L 822.78125 430.09375 L 837.257812 416.378906 L 864.203125 416.46875 L 891.117188 417.742188 L 918.039062 418.78125 L 944.976562 419.308594 L 971.867188 421.492188 L 998.882812 419.386719 L 1025.703125 423.949219 L 1052.699219 422.605469 L 1079.675781 422.03125 L 1090.089844 438.015625 L 1089.519531 456.824219 Z M 1078.179688 472.625 ",
  },
} as const;

export function Highlight({
  children,
  color = "yellow",
  className = "",
}: {
  children: React.ReactNode;
  /** yellow reads as emphasis, red as a claim — both taken from p3. */
  color?: keyof typeof BLOBS;
  className?: string;
}) {
  const blob = BLOBS[color];
  return (
    <span className={`relative inline-block ${className}`}>
      <svg
        aria-hidden
        viewBox={blob.viewBox}
        preserveAspectRatio="none"
        className="absolute -inset-x-[0.3em] -inset-y-[0.12em] h-[calc(100%+0.24em)] w-[calc(100%+0.6em)]"
      >
        <g transform={blob.transform}>
          <path fill={blob.fill} fillRule="nonzero" d={blob.d} />
        </g>
      </svg>
      <span className="relative font-display text-[#1d1611]">{children}</span>
    </span>
  );
}
