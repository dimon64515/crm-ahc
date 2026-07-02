import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { pushAPI, urlBase64ToUint8Array } from '../api';

function PushToggle() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    const pushSupported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
    setSupported(pushSupported);
    if (!pushSupported) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setEnabled(!!sub && Notification.permission === 'granted'))
      .catch((err) => console.error('Ошибка при получении push-подписки:', err));
  }, []);

  if (!supported || !(user?.role === 'director' || user?.role === 'admin')) return null;

  const handleToggle = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (!enabled) {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;
        const { data } = await pushAPI.getVapidPublicKey();
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(data.public_key),
        });
        const subJson = sub.toJSON();
        try {
          await pushAPI.subscribe({
            endpoint: subJson.endpoint,
            p256dh: subJson.keys.p256dh,
            auth: subJson.keys.auth,
          });
        } catch (err) {
          console.error('Ошибка при сохранении push-подписки на сервере:', err);
          await sub.unsubscribe();
        }
      } else {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          const subJson = sub.toJSON();
          try {
            await sub.unsubscribe();
            await pushAPI.unsubscribe({ endpoint: subJson.endpoint });
          } catch (err) {
            console.error('Ошибка при удалении push-подписки:', err);
          }
        }
      }
      const currentSub = await reg.pushManager.getSubscription();
      setEnabled(!!currentSub);
    } catch (err) {
      console.error('Ошибка при переключении push-уведомлений:', err);
    }
  };

  return (
    <button onClick={handleToggle} style={styles.pushBtn} type="button">
      {enabled ? '🔕 Отключить уведомления' : '🔔 Включить уведомления'}
    </button>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();

  if (!user) return children;

  const navItems = [];
  if (user.role === 'contractor') {
    navItems.push({ to: '/works/new', label: 'Новая работа' });
    navItems.push({ to: '/my-works', label: 'Мои записи' });
    navItems.push({ to: '/requests', label: 'Заявки' });
  }
  if (user.role === 'watchman') {
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
          <span className="layout-logo">CRM АХЧ</span>
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
      <main className="layout-main">{children}</main>
    </div>
  );
}

function roleLabel(role) {
  const map = { contractor: 'Подрядчик', watchman: 'Вахтёр', director: 'Директор', admin: 'Админ' };
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
