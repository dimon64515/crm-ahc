import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();

  if (!user) return children;

  const navItems = [];
  if (user.role === 'contractor') {
    navItems.push({ to: '/works/new', label: 'Новая работа' });
  }
  if (user.role === 'director' || user.role === 'admin') {
    navItems.push({ to: '/dashboard', label: 'Дашборд' });
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
  const map = { contractor: 'Подрядчик', director: 'Директор', admin: 'Админ' };
  return map[role] || role;
}
