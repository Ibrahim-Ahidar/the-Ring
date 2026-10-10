import { memo } from "react";

type Props = {
  size?: number;
  className?: string;
};

/** Pulse ring logo. Never mirrored in RTL. */
function BrandMarkInner({ size = 32, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" strokeWidth="4.5" />
      <circle cx="24.5" cy="7.5" r="3.5" fill="currentColor" />
    </svg>
  );
}

export const BrandMark = memo(BrandMarkInner);
