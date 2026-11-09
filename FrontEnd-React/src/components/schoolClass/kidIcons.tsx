import type { LucideIcon } from "lucide-react";

/**
 * Small filled pictures for the Classes page, after the user's reference design (2026-11-04): ABC blocks, a bear's face and a rocking
 * horse, which the icon set does not have. They take the colour of the text (`currentColor`), so they sit in any tinted circle; the
 * white parts (letters, eyes, muzzle) stay white. `data-icon` names each one (for the tests).
 */
type IconProps = { className?: string };

export function AbcBlocks({ className }: IconProps) {
  const letter = { textAnchor: "middle" as const, fontSize: 7.2, fontWeight: 800, fill: "#fff", fontFamily: "inherit" };
  return (
    <svg viewBox="0 0 24 24" aria-hidden data-icon="abc-blocks" className={className}>
      <rect x="6.8" y="1.2" width="10.4" height="10.4" rx="2.2" fill="currentColor" />
      <rect x="1.2" y="12.4" width="10.4" height="10.4" rx="2.2" fill="currentColor" opacity="0.82" />
      <rect x="12.4" y="12.4" width="10.4" height="10.4" rx="2.2" fill="currentColor" opacity="0.66" />
      <text x="12" y="9" {...letter}>
        A
      </text>
      <text x="6.4" y="20.2" {...letter}>
        B
      </text>
      <text x="17.6" y="20.2" {...letter}>
        C
      </text>
    </svg>
  );
}

export function BearFace({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden data-icon="bear" className={className}>
      <circle cx="5.4" cy="6.2" r="3.4" fill="currentColor" />
      <circle cx="18.6" cy="6.2" r="3.4" fill="currentColor" />
      <circle cx="5.4" cy="6.2" r="1.5" fill="#fff" opacity="0.35" />
      <circle cx="18.6" cy="6.2" r="1.5" fill="#fff" opacity="0.35" />
      <circle cx="12" cy="13.2" r="8.6" fill="currentColor" />
      <ellipse cx="12" cy="16.4" rx="4.2" ry="3.2" fill="#fff" opacity="0.92" />
      <circle cx="8.7" cy="11.6" r="1.25" fill="#fff" />
      <circle cx="15.3" cy="11.6" r="1.25" fill="#fff" />
      <ellipse cx="12" cy="15.2" rx="1.7" ry="1.15" fill="currentColor" />
      <path d="M12 16.2v1.4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

export function RockingHorse({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden data-icon="rocking-horse" className={className}>
      {/* the rocker */}
      <path d="M2.2 19.2c3.4 2.9 16.2 2.9 19.6 0" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      {/* the legs */}
      <path d="M7.4 13.2 5.9 19.9M10.1 13.8l-.4 6.6M14.4 13.8l.5 6.6M16.6 13l1.6 6.9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      {/* the body, the neck and the head */}
      <path d="M5.6 10.6c0-1.5 1.2-2.6 2.7-2.6h7.2l1.3-3.9c.3-.9 1.2-1.6 2.2-1.6h.5l2.8 2.5-1 2-2.1-.5-1.5 4.9c-.4 1.4-1.7 2.3-3.1 2.3H8.3a2.7 2.7 0 0 1-2.7-3.1z" fill="currentColor" />
      {/* the tail */}
      <path d="M5.8 9.9C4 9.5 2.9 10.4 2.5 12.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      {/* the ear and the eye */}
      <path d="M17.6 2.7 17.1.9l1.7 1.1z" fill="currentColor" />
      <circle cx="19.1" cy="4.9" r="0.75" fill="#fff" />
    </svg>
  );
}

/** A Lucide outline icon drawn filled with a light wash of its own colour (the reference's soft, filled look). */
export function Duotone({ icon: Icon, name, className }: IconProps & { icon: LucideIcon; name: string }) {
  return <Icon aria-hidden data-icon={name} className={className} fill="currentColor" fillOpacity={0.2} strokeWidth={2} />;
}
