// The frames: sidebar + top bar for the admin page, top bar only for the player dashboard.
import type { ReactNode } from 'react';
import { lanClock, type LiveSnapshot } from '@lan-os/shared';
import { Avatar, BrandMark, StatusDot } from './common.tsx';
import { Icon, type IconName } from './Icon.tsx';

/** active: highlight this item; when left out, the first in-page (#) link is highlighted. */
export interface NavItem { href: string; icon: IconName; label: string; count?: number; trailing?: boolean; target?: string; active?: boolean }

export function Shell({ snapshot, now, sectionLabel, nav, extraLabel, extraNav, health, account, breadcrumb, topbar, children }: {
  snapshot: LiveSnapshot; now: Date; sectionLabel: string; nav: NavItem[]; extraLabel?: string; extraNav?: NavItem[];
  health: ReactNode; account: ReactNode; breadcrumb: string; topbar: ReactNode; children: ReactNode;
}) {
  const clock = lanClock(snapshot.event, now);
  const dayLine = clock.phase === 'live' ? `Day ${clock.day} of ${clock.totalDays} · Live`
    : clock.phase === 'before' ? 'Starts soon' : 'Finished';
  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Main navigation">
        <a className="brand" href="/app"><BrandMark /><span>LAN <strong>OS</strong></span></a>
        <div className="side-event"><span className="side-event-dot" /><div><strong>{snapshot.event.name}</strong><small>{dayLine}</small></div></div>
        <p className="side-label">{sectionLabel}</p>
        <Nav items={nav} />
        {extraNav && extraNav.length > 0 && <>
          <p className="side-label" style={{ marginTop: 25 }}>{extraLabel}</p>
          <Nav items={extraNav} />
        </>}
        <div className="sidebar-bottom">
          <div className="sidebar-health">{health}</div>
          {account}
        </div>
      </aside>
      <div className="app-body">
        <header className="app-topbar">
          <div className="breadcrumb">{snapshot.event.name.toUpperCase()} <span>/</span> <b>{breadcrumb}</b></div>
          <div className="topbar-actions">{topbar}</div>
        </header>
        {children}
      </div>
    </div>
  );
}

/** The player dashboard's frame: one top bar and no menu, so everything fits on one screen. */
export function TopShell({ snapshot, now, topbar, account, children }: {
  snapshot: LiveSnapshot; now: Date; topbar: ReactNode; account: ReactNode; children: ReactNode;
}) {
  const clock = lanClock(snapshot.event, now);
  const dayLine = clock.phase === 'live' ? `Day ${clock.day} of ${clock.totalDays} · Live`
    : clock.phase === 'before' ? 'Starts soon' : 'Finished';
  return (
    <div className="shell top-shell">
      <div className="app-body">
        <header className="app-topbar">
          <div className="topbar-identity">
            <a className="brand" href="/app"><BrandMark /><span>LAN <strong>OS</strong></span></a>
            <div className="side-event"><span className="side-event-dot" /><div><strong>{snapshot.event.name}</strong><small>{dayLine}</small></div></div>
          </div>
          <div className="topbar-actions">{topbar}{account}</div>
        </header>
        {children}
      </div>
    </div>
  );
}

function Nav({ items }: { items: NavItem[] }) {
  return (
    <nav className="side-nav">
      {items.map((item, i) => (
        <a key={item.href} href={item.href} className={(item.active ?? (i === 0 && item.href.startsWith('#'))) ? 'active' : undefined} target={item.target}>
          <Icon name={item.icon} />{item.label}
          {item.count !== undefined && <span className="side-count">{item.count}</span>}
          {item.trailing && <Icon name="arrow-up-right" className="nav-trailing" />}
        </a>
      ))}
    </nav>
  );
}

/** Admins (the host PC and players with the admin role) switch between the player dashboard and the control room here. */
export function ModeSwitch({ mode }: { mode: 'player' | 'admin' }) {
  return (
    <nav className="mode-switch" aria-label="Switch view">
      <a href="/app" className={mode === 'player' ? 'active' : undefined} aria-current={mode === 'player' ? 'page' : undefined}><Icon name="users-round" />Player</a>
      <a href="/admin" className={mode === 'admin' ? 'active' : undefined} aria-current={mode === 'admin' ? 'page' : undefined}><Icon name="sliders-horizontal" />Admin</a>
    </nav>
  );
}

export function TopAvatar({ nickname, tone }: { nickname: string; tone: number }) {
  return <Avatar nickname={nickname} tone={tone} className="top-avatar" />;
}

export function AllSystems({ snapshot, connected }: { snapshot: LiveSnapshot; connected: boolean }) {
  const services = Object.values(snapshot.health);
  const worst = !connected ? 'warning' : services.some(s => s.level === 'warning') ? 'warning' : 'ok';
  const text = !connected ? 'Reconnecting…' : worst === 'ok' ? 'All systems normal'
    : services.filter(s => s.level === 'warning').map(s => `${s.label}: ${s.detail}`).join(' · ');
  return <span className="top-signal" title={text}><StatusDot level={worst} /> {worst === 'ok' || !connected ? text : 'Needs attention'}</span>;
}
