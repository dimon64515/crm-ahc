import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await login(username, password);
      if (user.role === 'contractor') {
        navigate('/works/new');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.brand}>
          <div style={styles.brandIcon}>🏗️</div>
          <h1 style={styles.title}>CRM АХЧ</h1>
          <p style={styles.subtitle}>Вход в систему</p>
        </div>

        {error && (
          <div role="alert" style={styles.error}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label htmlFor="username" style={styles.label}>
              Логин
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={styles.input}
              placeholder="Введите логин…"
              autoComplete="username"
              spellCheck={false}
              required
            />
          </div>

          <div style={styles.field}>
            <label htmlFor="password" style={styles.label}>
              Пароль
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              placeholder="Введите пароль…"
              autoComplete="current-password"
              required
            />
          </div>

          <button
            type="submit"
            style={styles.button}
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? 'Вход…' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    background: '#f3f4f6',
  },
  card: {
    background: '#fff',
    padding: '40px',
    borderRadius: '12px',
    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)',
    width: '100%',
    maxWidth: '380px',
    border: '1px solid #e5e7eb',
  },
  brand: { textAlign: 'center', marginBottom: '28px' },
  brandIcon: { fontSize: '40px', marginBottom: '12px' },
  title: {
    fontSize: '24px',
    fontWeight: 700,
    marginBottom: '4px',
    letterSpacing: '-0.025em',
    color: '#111827',
  },
  subtitle: {
    fontSize: '14px',
    color: '#6b7280',
    margin: 0,
  },
  error: {
    background: '#fef2f2',
    color: '#b91c1c',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '20px',
    fontSize: '14px',
    border: '1px solid #fecaca',
  },
  form: { display: 'flex', flexDirection: 'column', gap: '16px' },
  field: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
  },
  input: {
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    fontSize: '15px',
    lineHeight: '20px',
    background: '#fff',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    width: '100%',
  },
  button: {
    padding: '11px 16px',
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '4px',
    transition: 'background 0.15s',
    lineHeight: '20px',
  },
};
