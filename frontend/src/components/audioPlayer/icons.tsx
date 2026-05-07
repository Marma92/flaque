import type { JSX, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { className?: string };

const baseProps: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 24 24",
  "aria-hidden": true
};

export function PlayIcon({ className = "h-4 w-4", ...rest }: IconProps): JSX.Element {
  return (
    <svg className={className} {...baseProps} fill="currentColor" {...rest}>
      <path d="M8 6v12l10-6-10-6z" />
    </svg>
  );
}

export function PauseIcon({ className = "h-4 w-4", ...rest }: IconProps): JSX.Element {
  return (
    <svg className={className} {...baseProps} fill="currentColor" {...rest}>
      <path d="M8 6h3v12H8zM13 6h3v12h-3z" />
    </svg>
  );
}

export function StopIcon({ className = "h-4 w-4", ...rest }: IconProps): JSX.Element {
  return (
    <svg className={className} {...baseProps} fill="currentColor" {...rest}>
      <path d="M7 7h10v10H7z" />
    </svg>
  );
}

export function PrevIcon({ className = "h-4 w-4", ...rest }: IconProps): JSX.Element {
  return (
    <svg className={className} {...baseProps} fill="currentColor" {...rest}>
      <path d="M7 6h2v12H7zM19 6v12l-8.5-6L19 6z" />
    </svg>
  );
}

export function NextIcon({ className = "h-4 w-4", ...rest }: IconProps): JSX.Element {
  return (
    <svg className={className} {...baseProps} fill="currentColor" {...rest}>
      <path d="M15 6h2v12h-2zM5 6v12l8.5-6L5 6z" />
    </svg>
  );
}

const strokeProps = {
  fill: "none" as const,
  stroke: "currentColor" as const,
  strokeWidth: 1.8
};

export function RepeatAllIcon({ className = "h-4 w-4" }: IconProps): JSX.Element {
  return (
    <svg className={className} {...baseProps} {...strokeProps}>
      <path d="M17 2l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 11V9a4 4 0 014-4h13" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 22l-3-3 3-3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 13v2a4 4 0 01-4 4H4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function RepeatOneIcon({ className = "h-4 w-4" }: IconProps): JSX.Element {
  return (
    <svg className={className} {...baseProps} {...strokeProps}>
      <path d="M17 2l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 11V9a4 4 0 014-4h13" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 22l-3-3 3-3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 13v2a4 4 0 01-4 4H4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 9v6" strokeLinecap="round" />
      <path d="M10.5 10.5L12 9l1.5 1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ShuffleIcon({ className = "h-4 w-4" }: IconProps): JSX.Element {
  return (
    <svg className={className} {...baseProps} {...strokeProps}>
      <path d="M16 3h5v5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 20l8-8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 3l-7 7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 4l6 6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 16l2 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function VolumeMutedIcon({ className = "h-4 w-4" }: IconProps): JSX.Element {
  return (
    <svg className={className} {...baseProps} {...strokeProps}>
      <path d="M3 10v4h4l5 4V6L7 10H3z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 9l5 6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 9l-5 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function VolumeOnIcon({ className = "h-4 w-4" }: IconProps): JSX.Element {
  return (
    <svg className={className} {...baseProps} {...strokeProps}>
      <path d="M3 10v4h4l5 4V6L7 10H3z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 9a5 5 0 010 6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 7a8 8 0 010 10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function QueueIcon({ className = "h-4 w-4" }: IconProps): JSX.Element {
  return (
    <svg className={className} {...baseProps} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AddIcon({ className = "h-4 w-4" }: IconProps): JSX.Element {
  return (
    <svg className={className} {...baseProps} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MoreIcon({ className = "h-4 w-4" }: IconProps): JSX.Element {
  return (
    <svg className={className} {...baseProps} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h.01M12 12h.01M19 12h.01" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CloseIcon({ className = "h-3.5 w-3.5", strokeWidth = 2.5, ...rest }: IconProps): JSX.Element {
  return (
    <svg className={className} {...baseProps} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" {...rest}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
