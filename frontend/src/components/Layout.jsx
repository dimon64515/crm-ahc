import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePushSubscription } from '../hooks/usePushSubscription';
import PushOfferModal from './PushOfferModal';

function PushToggle() {
  const { user } = useAuth();
  const { supported, enabled, subscribe, unsubscribe } = usePushSubscription();

  if (!supported || !user) return null;

  const handleToggle = async () => {
    if (enabled) {
      await unsubscribe();
    } else {
      await subscribe();
    }
  };

  return (
    <button onClick={handleToggle} style={styles.pushBtn} type="button">
      {enabled ? '🔕 Отключить уведомления' : '🔔 Включить уведомления'}
    </button>
  );
}

export default function Layout({ children, fullWidth = false }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [showOffer, setShowOffer] = useState(false);

  useEffect(() => {
    const pushSupported =
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window;
    if (pushSupported && Notification.permission === 'default') {
      setShowOffer(true);
    }
  }, []);

  if (!user) return children;

  const navItems = [];
  if (user.role === 'contractor') {
    navItems.push({ to: '/works/new', label: 'Новая работа' });
    navItems.push({ to: '/my-works', label: 'Мои записи' });
    navItems.push({ to: '/requests', label: 'Заявки' });
  }
  if (user.role === 'comendant') {
    navItems.push({ to: '/requests/new', label: 'Новая заявка' });
    navItems.push({ to: '/my-requests', label: 'Мои заявки' });
  }
  if (user.role === 'director' || user.role === 'admin') {
    navItems.push({ to: '/dashboard', label: 'Дашборд' });
    navItems.push({ to: '/requests', label: 'Заявки' });
    navItems.push({ to: '/photo-backup', label: 'Архив фото' });
  }
  if (user.role === 'admin') {
    navItems.push({ to: '/settings', label: 'Настройки' });
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <nav className="layout-nav" role="navigation" aria-label="Главное меню">
        <div className="layout-nav-left">
          <img src="/icon-192x192.png" alt="CRM АХЧ" className="layout-logo-icon" />
          {navItems.map((item) => {
            const active = location.pathname === item.to || location.pathname.startsWith(item.to + '/');
            return (
              <Link
                key={item.to}
                to={item.to}
                className={active ? 'layout-link layout-link-active' : 'layout-link'}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
        <div className="layout-nav-right">
          <PushToggle />
          <span className="layout-user" title={user.role}>
            <span className="layout-user-name">{user.full_name || user.username}</span>
            <span className="layout-role-badge">{roleLabel(user.role)}</span>
          </span>
          <button onClick={logout} className="layout-logout">Выход</button>
        </div>
      </nav>
      <main className={`layout-main ${fullWidth ? 'layout-main-full-width' : ''}`}>{children}</main>
      {showOffer && <PushOfferModal onClose={() => setShowOffer(false)} />}
    </div>
  );
}

function roleLabel(role) {
  const map = { contractor: 'Подрядчик', comendant: 'Комендант', director: 'Директор', admin: 'Админ' };
  return map[role] || role;
}

const styles = {
  pushBtn: {
    background: 'transparent',
    border: '1px solid currentColor',
    borderRadius: '4px',
    padding: '4px 8px',
    cursor: 'pointer',
    color: 'inherit',
    fontSize: '0.9rem',
  },
};
