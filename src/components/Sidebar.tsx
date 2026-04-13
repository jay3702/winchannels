import { NavLink } from 'react-router-dom';
import './Sidebar.css';

const NAV_ITEMS = [
  { to: '/',         label: 'Recent',      icon: '🕐' },
  { to: '/tv',       label: 'TV Shows',    icon: '📺' },
  { to: '/movies',   label: 'Movies',      icon: '🎬' },
  { to: '/library',  label: 'Library',     icon: '📁' },
  { to: '/settings', label: 'Settings',    icon: '⚙' },
];

export default function Sidebar() {
  return (
    <nav className="sidebar" aria-label="Main navigation">
      <div className="sidebar__brand">WinChannels</div>
      <ul className="sidebar__nav">
        {NAV_ITEMS.map(({ to, label, icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`
              }
            >
              <span className="sidebar__icon" aria-hidden="true">{icon}</span>
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
