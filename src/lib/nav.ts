export interface NavItem {
  id: 'top' | 'about' | 'focus' | 'news' | 'resources' | 'contact';
  label: string;
  /** In-page anchor on the home page. */
  hash?: string;
  /** Real route. */
  path?: string;
  /** The anchor exists on every page (footer), so it never needs the "/" prefix. */
  local?: boolean;
}

export const NAV: NavItem[] = [
  { id: 'top', label: 'Trang chủ', hash: '#top' },
  { id: 'about', label: 'Về VBFA', hash: '#about' },
  { id: 'focus', label: 'Lĩnh vực', hash: '#focus' },
  { id: 'news', label: 'Tin tức', path: '/tin-tuc/' },
  { id: 'resources', label: 'Thư viện', hash: '#resources' },
  { id: 'contact', label: 'Liên hệ', hash: '#contact', local: true },
];

/** Anchors stay in-page on the home page; from other pages they point back to "/#section". */
export const navHref = (item: NavItem, onHome: boolean): string => {
  if (item.path) return item.path;
  const hash = item.hash ?? '';
  return item.local || onHome ? hash : `/${hash}`;
};

export const homeHref = (hash: string, onHome: boolean): string => (onHome ? hash : `/${hash}`);
