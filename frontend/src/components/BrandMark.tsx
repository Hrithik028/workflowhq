import type { SVGProps } from "react";

/** Two streams joining into one path, drawn to stay legible at favicon size. */
function BrandMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M8 11h8c6 0 7 9 15 9" />
      <path d="M8 29h8c6 0 7-9 15-9" />
      <circle cx="7" cy="11" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="7" cy="29" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="33" cy="20" r="1.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default BrandMark;
