import type { ReactNode } from "react";

type IconProps = { size?: number };

function Svg({ size = 16, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const IconUndo = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </Svg>
);
export const IconRedo = (p: IconProps) => (
  <Svg {...p}>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H10a6 6 0 0 0 0 12h3" />
  </Svg>
);
export const IconSave = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 3h11l3 3v15H5z" />
    <path d="M8 3v6h8V3M8 21v-7h8v7" />
  </Svg>
);
export const IconFolder = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7h6l2 2h10v10H3z" />
  </Svg>
);
export const IconExport = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v12" />
    <path d="m7 10 5-5 5 5" />
    <path d="M5 21h14" />
  </Svg>
);
export const IconHelp = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.1.9-1.1 1.8V14" />
    <path d="M12 17h.01" />
  </Svg>
);
export const IconEye = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="2.5" />
  </Svg>
);
export const IconEyeOff = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 3l18 18" />
    <path d="M10.6 10.6A2.5 2.5 0 0 0 12 14.5" />
    <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a16.6 16.6 0 0 1-3.4 4.3" />
    <path d="M6.1 6.1A16 16 0 0 0 2 12s3.5 7 10 7c1.5 0 2.8-.3 4-.8" />
  </Svg>
);
export const IconLock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Svg>
);
export const IconUnlock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 7.5-2" />
  </Svg>
);
export const IconFit = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </Svg>
);
export const IconOne = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M12 8v8M10 8h3" />
  </Svg>
);
export const IconGrid = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="7" height="7" />
    <rect x="13" y="4" width="7" height="7" />
    <rect x="4" y="13" width="7" height="7" />
    <rect x="13" y="13" width="7" height="7" />
  </Svg>
);
export const IconSnap = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12h16M12 4v16" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);
export const IconUp = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 14 6-6 6 6" />
  </Svg>
);
export const IconDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 10 6 6 6-6" />
  </Svg>
);
export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M9 7V5h6v2M7 7v12h10V7" />
  </Svg>
);
export const IconCopy = (p: IconProps) => (
  <Svg {...p}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M4 16V6a2 2 0 0 1 2-2h10" />
  </Svg>
);
export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const IconText = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 6h14M12 6v12M8 18h8" />
  </Svg>
);
export const IconImage = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="5" width="16" height="14" rx="2" />
    <circle cx="9" cy="10" r="1.5" />
    <path d="m20 16-5-5-9 7" />
  </Svg>
);
export const IconRect = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="7" width="14" height="10" rx="1" />
  </Svg>
);
export const IconStar = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 3 2.4 6.5H21l-5.2 4 2 6.5L12 16.5 6.2 20l2-6.5L3 9.5h6.6z" />
  </Svg>
);
export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
);
export const IconCsv = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3h9l5 5v13H6z" />
    <path d="M15 3v5h5M8 14h8M8 18h5" />
  </Svg>
);
export const IconHome = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 11 12 4l8 7" />
    <path d="M6 10.5V20h12v-9.5" />
  </Svg>
);
export const IconCreate = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20 15 9l3 3L7 23H4z" />
    <path d="M13.2 7.2 16.8 10.8" />
  </Svg>
);
export const IconDice = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <circle cx="9" cy="9" r="1.1" fill="currentColor" />
    <circle cx="15" cy="15" r="1.1" fill="currentColor" />
    <circle cx="15" cy="9" r="1.1" fill="currentColor" />
  </Svg>
);
export const IconStore = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9h16l-1.2 11H5.2z" />
    <path d="M4 9 6 4h12l2 5" />
    <path d="M9 13v4M15 13v4" />
  </Svg>
);
export const IconNews = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 5h11v14H7a2 2 0 0 1-2-2V5z" />
    <path d="M16 8h3v9a2 2 0 0 1-2 2h-1" />
    <path d="M8 9h5M8 13h5" />
  </Svg>
);
export const IconChat = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 5h14v10H9l-4 4V5z" />
  </Svg>
);
export const IconCrown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 16 6 8l6 5 6-5 2 8H4z" />
    <path d="M5 19h14" />
  </Svg>
);
export const IconUsers = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3.5 19c.6-3 2.8-5 5.5-5s4.9 2 5.5 5" />
    <circle cx="17" cy="9" r="2.4" />
    <path d="M16 14.2c2 .4 3.6 2 4.2 4.3" />
  </Svg>
);
export const IconVars = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 8h6M8 5v6" />
    <path d="M14 16h6M17 13v6" />
    <path d="m7 17 10-10" />
  </Svg>
);
export const IconPrint = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 9V4h10v5" />
    <rect x="5" y="9" width="14" height="8" rx="1" />
    <path d="M8 17h8v3H8z" />
  </Svg>
);
export const IconGear = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 4v2.2M12 17.8V20M4 12h2.2M17.8 12H20M6.2 6.2l1.6 1.6M16.2 16.2l1.6 1.6M17.8 6.2l-1.6 1.6M7.8 16.2l-1.6 1.6" />
  </Svg>
);
export const IconLayers = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 4 8 4-8 4-8-4z" />
    <path d="m4 14 8 4 8-4" />
  </Svg>
);
export const IconCards = (p: IconProps) => (
  <Svg {...p}>
    <rect x="7" y="5" width="10" height="14" rx="1.5" />
    <path d="M5 8v11a1.5 1.5 0 0 0 1.5 1.5H16" />
  </Svg>
);
export const IconExpand = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 4H4v5M15 4h5v5M4 15v5h5M20 15v5h-5" />
  </Svg>
);
export const IconCollapse = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 9 4 4M9 9H5M9 9V5M15 9l5-5M15 9h4M15 9V5M9 15l-5 5M9 15H5M9 15v4M15 15l5 5M15 15h4M15 15v4" />
  </Svg>
);
export const IconChevLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="m14 6-6 6 6 6" />
  </Svg>
);
export const IconChevRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="m10 6 6 6-6 6" />
  </Svg>
);
export const IconSmile = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M8 10h.01M16 10h.01M8.5 14.5S10 17 12 17s3.5-2.5 3.5-2.5" />
  </Svg>
);
export const IconMinus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14" />
  </Svg>
);
export const IconPen = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20 15 9l3 3L7 23H4z" />
    <path d="M13.2 7.2 16.8 10.8" />
  </Svg>
);
export const IconGrab = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 11V8a1 1 0 0 1 2 0v3" />
    <path d="M10 11V7a1 1 0 0 1 2 0v4" />
    <path d="M12 11V8a1 1 0 0 1 2 0v3" />
    <path d="M14 12v-1a1 1 0 0 1 2 0v5a4 4 0 0 1-4 4h-1.5a4.5 4.5 0 0 1-4.5-4.5V11" />
  </Svg>
);
export const IconNote = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 4h9l5 5v11H6z" />
    <path d="M15 4v5h5" />
    <path d="M9 13h6M9 17h4" />
  </Svg>
);
export const IconRefresh = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 12a8 8 0 1 1-2.2-5.5" />
    <path d="M20 5v5h-5" />
  </Svg>
);
export const IconMusic = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 18V6l10-2v12" />
    <circle cx="7" cy="18" r="2.5" />
    <circle cx="17" cy="16" r="2.5" />
  </Svg>
);
export const IconLink = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.5 14.5 7 17a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0" />
    <path d="M14.5 9.5 17 7a3.5 3.5 0 0 1 5 5l-3 3a3.5 3.5 0 0 1-5 0" />
  </Svg>
);
export const IconLine = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 19 19 5" />
  </Svg>
);
export const IconErase = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 15 7-7 5 5-7 7H6z" />
    <path d="M4 20h16" />
  </Svg>
);
export const IconBleed = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="16" height="16" rx="2" strokeDasharray="2.5 2" />
    <rect x="7" y="7" width="10" height="10" rx="1" />
  </Svg>
);
export const IconCropBleed = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3v12a3 3 0 0 0 3 3h12" />
    <path d="M18 21V9a3 3 0 0 0-3-3H3" />
  </Svg>
);
export const IconSafe = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="4" width="14" height="16" rx="2" />
    <rect x="8" y="7" width="8" height="10" rx="1" strokeDasharray="2 2" />
  </Svg>
);
export const IconCut = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h3M17 7h3M4 17h3M17 17h3M7 4v3M7 17v3M17 4v3M17 17v3" />
    <rect x="7" y="7" width="10" height="10" />
  </Svg>
);
export const IconCircle = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
  </Svg>
);
export const IconReturn = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 10 4 15l5 5" />
    <path d="M4 15h11a5 5 0 0 0 0-10H8" />
  </Svg>
);
export const IconBold = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 5h6.2a3.6 3.6 0 0 1 0 7.2H7z" />
    <path d="M7 12.2h7a3.8 3.8 0 0 1 0 7.6H7z" />
  </Svg>
);
export const IconItalic = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 5H9M13 19H7M14 5 10 19" />
  </Svg>
);
export const IconUnderline = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 5v7a5 5 0 0 0 10 0V5" />
    <path d="M5 20h14" />
  </Svg>
);
export const IconStrike = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14" />
    <path d="M16.5 7.2A4.2 4.2 0 0 0 12 5.4c-2.8 0-4.6 1.5-4.6 3.4 0 1.4.8 2.3 3.4 3" />
    <path d="M8 16.4c.7 1.5 2.2 2.4 4.2 2.4 2.7 0 4.6-1.4 4.6-3.4" />
  </Svg>
);
export const IconAlignLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6h16M4 12h10M4 18h14" />
  </Svg>
);
export const IconAlignCenter = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6h16M7 12h10M5 18h14" />
  </Svg>
);
export const IconAlignRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6h16M10 12h10M6 18h14" />
  </Svg>
);
export const IconAlignJustify = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </Svg>
);
export const IconValignTop = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 5h16M8 9h8v10H8z" />
  </Svg>
);
export const IconValignMiddle = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12h16M8 6h8v12H8z" />
  </Svg>
);
export const IconValignBottom = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 19h16M8 5h8v10H8z" />
  </Svg>
);
export const IconAutosize = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 16V8h4M15 8v8h4" />
    <path d="M10 12h4" />
  </Svg>
);
export const IconClip = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="5" width="14" height="14" rx="2" />
    <path d="M9 15h8" />
  </Svg>
);
export const IconEllipsis = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h.01M12 12h.01M19 12h.01" />
  </Svg>
);
export const IconBox = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8 12 3l9 5v8l-9 5-9-5z" />
    <path d="M12 13V3" />
    <path d="M3 8l9 5 9-5" />
  </Svg>
);
export const IconBook = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 5h9a3 3 0 0 1 3 3v12H7a3 3 0 0 0-3 3z" />
    <path d="M4 5v15" />
    <path d="M16 8h4v12h-7" />
  </Svg>
);
