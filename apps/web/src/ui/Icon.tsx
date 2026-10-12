// The prototype's line icons (design/prototype/assets/app.js), as one component.
const PATHS: Record<string, string> = {
  'layout-dashboard': '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  'music-2': '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  'chart-no-axes-column': '<path d="M8 3v18M14 8v13M20 13v8"/><path d="M5 21V12"/>',
  'gamepad-2': '<path d="M6 12h4m-2-2v4"/><circle cx="15.5" cy="11.5" r=".5" fill="currentColor"/><circle cx="18.5" cy="14.5" r=".5" fill="currentColor"/><path d="M6.3 5.6a3 3 0 0 0-2.8 2.1l-1.7 6.4a4.5 4.5 0 0 0 6.9 4.8L11 17h2l2.3 1.9a4.5 4.5 0 0 0 6.9-4.8l-1.7-6.4a3 3 0 0 0-2.8-2.1z"/>',
  'history': '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  'sliders-horizontal': '<path d="M3 6h6m4 0h8M3 12h10m4 0h4M3 18h4m4 0h10"/><circle cx="11" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="18" r="2"/>',
  'arrow-up-right': '<path d="M7 17 17 7M7 7h10v10"/>',
  'arrow-left': '<path d="m12 19-7-7 7-7M5 12h14"/>',
  'arrow-right': '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  'chevrons-up-down': '<path d="m7 10 5-5 5 5m-10 4 5 5 5-5"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'chevron-up': '<path d="m6 15 6-6 6 6"/>',
  'plus': '<path d="M12 5v14M5 12h14"/>',
  'calendar-plus': '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M12 13v6m-3-3h6"/>',
  'scan-face': '<path d="M3 9V6a3 3 0 0 1 3-3h3M15 3h3a3 3 0 0 1 3 3v3M21 15v3a3 3 0 0 1-3 3h-3M9 21H6a3 3 0 0 1-3-3v-3M9 10h.01M15 10h.01M9 15c1.7 1.7 4.3 1.7 6 0"/>',
  'refresh-cw': '<path d="M20 11a8 8 0 0 0-14-5L4 8M4 4v4h4M4 13a8 8 0 0 0 14 5l2-2m0 4v-4h-4"/>',
  'check': '<path d="m5 12 4 4L19 6"/>',
  'external-link': '<path d="M14 4h6v6M20 4l-9 9"/><path d="M20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5"/>',
  'projector': '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M7 21h10M12 17v4M7 9h.01M11 9h.01"/>',
  'megaphone': '<path d="m3 11 18-6v14L3 13v-2ZM3 11h5v2H3Zm5 2 2 7h4l-3-6"/>',
  'users-round': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3.1a4 4 0 0 1 0 7.8M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
  'activity': '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
  'shield-alert': '<path d="M12 22s9-4 9-10V5l-9-3-9 3v7c0 6 9 10 9 10ZM12 8v5m0 4h.01"/>',
  'monitor': '<rect x="2" y="3" width="20" height="15" rx="2"/><path d="M8 22h8m-4-4v4"/>',
  'shield-check': '<path d="M12 22s9-4 9-10V5l-9-3-9 3v7c0 6 9 10 9 10Z"/><path d="m9 12 2 2 4-4"/>',
  'moon-star': '<path d="M20 15A8 8 0 0 1 9 4a8 8 0 1 0 11 11ZM18 2v4m-2-2h4"/>',
  'sun-dim': '<circle cx="12" cy="12" r="4"/><path d="M12 4V2m0 20v-2M4 12H2m20 0h-2M5.7 5.7 4.2 4.2M19.8 19.8l-1.5-1.5M18.3 5.7l1.5-1.5M5.7 18.3l-1.5 1.5"/>',
  'panels-top-left': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/>',
  'pause': '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  'play': '<path d="m8 5 12 7-12 7z"/>',
  'skip-forward': '<path d="m4 5 10 7-10 7V5Zm10 0 7 7-7 7V5Z"/>',
  'info': '<circle cx="12" cy="12" r="10"/><path d="M12 11v5M12 8h.01"/>',
  'send': '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  'x': '<path d="M18 6 6 18M6 6l12 12"/>',
  'server': '<rect x="3" y="3" width="18" height="8" rx="2"/><rect x="3" y="13" width="18" height="8" rx="2"/><path d="M7 7h.01M7 17h.01"/>',
  'database-backup': '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.65 4 3 9 3 2 0 3.8-.2 5.2-.7M21 5v6M3 12c0 1.65 4 3 9 3M14 17h7m-3-3 3 3-3 3"/>',
  'ban': '<circle cx="12" cy="12" r="9"/><path d="m5.5 5.5 13 13"/>',
  'eye-off': '<path d="M3 3l18 18M10.5 6.1c.5-.1 1-.1 1.5-.1 5.5 0 9 6 9 6a16 16 0 0 1-3.2 3.6M6.2 6.7C3.4 8.3 2 12 2 12s3.5 6 10 6a9.9 9.9 0 0 0 4.2-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  'link': '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2"/>',
  'copy': '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  'log-out': '<path d="M10 17l5-5-5-5m5 5H3M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"/>',
  'clock': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
  'eye': '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  'trash': '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={className ? `icon ${className}` : 'icon'} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: PATHS[name] ?? PATHS.info! }} />
  );
}
