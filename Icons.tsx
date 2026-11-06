const Svg = ({ d, w = 2 }: { d: string; w?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

export const IconPlus = () => <Svg d="M12 5v14M5 12h14" />;
export const IconBack = () => <Svg d="M15 18l-6-6 6-6" />;
export const IconMore = () => <Svg d="M5 12h.01M12 12h.01M19 12h.01" w={3.2} />;
export const IconX = () => <Svg d="M18 6L6 18M6 6l12 12" />;
export const IconEdit = () => <Svg d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />;
export const IconTrash = () => <Svg d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />;
export const IconLogout = () => <Svg d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />;
export const IconGift = () => (
  <Svg d="M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8S10 3 7.5 4.5 9 8 12 8zM12 8s2-5 4.5-3.5S15 8 12 8z" />
);

export const Logo = () => (
  <svg viewBox="0 0 64 44" aria-hidden="true">
    <path d="M29 23l-9 18M35 23l9 18" stroke="var(--ribbon)" strokeWidth="6" strokeLinecap="round" />
    <path d="M32 22C22 5 5 3 5 14.5S22 25 32 22z" fill="var(--ribbon)" />
    <path d="M32 22c10-17 27-19 27-7.5S42 25 32 22z" fill="var(--ribbon)" />
    <circle cx="32" cy="22" r="6.5" fill="var(--plum)" />
  </svg>
);
export const IconExt = () => <Svg d="M15 3h6v6M10 14L21 3M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />;
export const IconSearch = () => <Svg d="M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-4.3-4.3" />;
