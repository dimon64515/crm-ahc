import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { requestsAPI } from '../api';

const STATUS_LABELS = {
  new: 'Новая',
  in_progress: 'В работе',
  completed: 'Завершена',
};

const STATUS_STYLES = {
  new: { background: '#eff6ff', color: '#2563eb' },
  in_progress: { background: '#fffbeb', color: '#d97706' },
  completed: { background: '#f0fdf4', color: '#059669' },
};

const statusLabel = (status) => STATUS_LABELS[status] || status;
const statusStyle = (status) => STATUS_STYLES[status] || { background: '#f3f4f6', color: '#374151' };

export default function MyRequestsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('ru-RU');
  };

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await requestsAPI.my();
      setItems(res.data.items || []);
    } catch (e) {
      setItems([]);
      setError(e.response?.data?.detail || 'Ошибка загрузки заявок');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const truncate = (text, maxLength = 60) => {
    if (!text) return '—';
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}…`;
  };

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>Мои заявки</h1>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {loading ? (
        <div style={styles.center}>
          <div style={styles.spinner} />
          <p>Загрузка…</p>
        </div>
      ) : items.length === 0 ? (
        <div style={styles.empty}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
          <div style={{ color: '#6b7280' }}>Заявки не найдены</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Корпус</th>
                <th>Описание</th>
                <th>Статус</th>
                <th>Срок</th>
                <th style={{ textAlign: 'center' }}>Продления</th>
                <th>Создана</th>
              </tr>
            </thead>
            <tbody>
              {items.map((req) => (
                <tr
                  key={req.id}
                  onClick={() => navigate(`/requests/${req.id}`)}
                  style={styles.row}
                >
                  <td className="tabular-nums">{req.id}</td>
                  <td>{req.building?.name || req.building?.number || '—'}</td>
                  <td style={styles.description} title={req.description}>
                    {truncate(req.description)}
                  </td>
                  <td>
                    <span style={{ ...styles.badge, ...statusStyle(req.status) }}>
                      {statusLabel(req.status)}
                    </span>
                  </td>
                  <td className="tabular-nums">{formatDate(req.due_date)}</td>
                  <td style={{ textAlign: 'center' }} className="tabular-nums">
                    {req.extended_count || 0}
                  </td>
                  <td className="tabular-nums">{formatDate(req.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const styles = {
  header: { marginBottom: '20px' },
  title: { fontSize: '22px', fontWeight: 700, letterSpacing: '-0.025em' },
  error: { padding: '12px 16px', background: '#fef2f2', color: '#b91c1c', borderRadius: '8px', marginBottom: '16px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px', background: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  row: { cursor: 'pointer' },
  description: { maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  badge: { display: 'inline-block', padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600 },
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px', color: '#6b7280' },
  spinner: { width: '32px', height: '32px', border: '3px solid #e5e7eb', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '12px' },
  empty: { textAlign: 'center', padding: '48px 16px' },
};
