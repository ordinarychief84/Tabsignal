import Link from "next/link";

/**
 * The TabCall logo.
 *
 * The mark was hand-inlined as raw SVG in about twenty files, each with
 * its own sizes and colours, which is why a brand change meant hunting
 * hex values through the app. One component now, three variants.
 *
 * Treatment, fixed:
 *   - Deep Plum icon container
 *   - Saffron signal symbol
 *   - Deep Plum wordmark on light, Warm Ivory wordmark on plum
 *
 * No shadows, gradients, glow or recolouring. Callers pick a variant and
 * a size; they don't get to pass colours.
 */

type Size = "sm" | "md" | "lg";

const BOX: Record<Size, string> = { sm: "h-7 w-7", md: "h-8 w-8", lg: "h-10 w-10" };
const GLYPH: Record<Size, number> = { sm: 16, md: 19, lg: 24 };
const WORD: Record<Size, string> = { sm: "text-base", md: "text-lg", lg: "text-2xl" };

/** The signal mark alone — a rising arc over a point. */
export function LogoMark({ size = "md" }: { size?: Size }) {
  const g = GLYPH[size];
  return (
    <span
      aria-hidden
      className={`inline-flex ${BOX[size]} shrink-0 items-center justify-center rounded-xl bg-plum`}
    >
      <svg width={g} height={g} viewBox="0 0 24 24" role="presentation">
        <path
          d="M 6 11 Q 12 6, 18 11"
          fill="none"
          stroke="#F4C95D"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="12" cy="16" r="2" fill="#F4C95D" />
      </svg>
    </span>
  );
}

export function Logo({
  size = "md",
  /** `onDark` flips the wordmark for Deep Plum surfaces. */
  tone = "onLight",
  href,
  className = "",
}: {
  size?: Size;
  tone?: "onLight" | "onDark";
  /** Wraps in a link when given. Omit inside an existing anchor. */
  href?: string;
  className?: string;
}) {
  const content = (
    <>
      <LogoMark size={size} />
      <span
        className={[
          WORD[size],
          "font-semibold tracking-tight",
          tone === "onDark" ? "text-ivory" : "text-plum",
        ].join(" ")}
      >
        TabCall
      </span>
    </>
  );

  const shell = `inline-flex items-center gap-2 ${className}`;

  if (href) {
    return (
      <Link href={href} aria-label="TabCall" className={shell}>
        {content}
      </Link>
    );
  }
  return <span className={shell}>{content}</span>;
}
