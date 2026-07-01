import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { requestsAPI } from '../api';

const statusLabel = (status) => {
  const map = { new: 'Новая', in_progress: 'В работе', completed: 'Завершена' };
  return map[status] || status;
};

const statusStyle = (status) => {
  const map = {
    new: { background: '#eff6ff', color: '#2563eb' },
    in_progress: { background: '#fffbeb', color: '#d97706' },
    completed: { background: '#f0fdf4', color: '#059669' },
  };
  return map[status] || { background: '#f3f4f6', color: '#374151' };
};

export default function RequestDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [req, setReq] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadRequest = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await requestsAPI.get(id);
      setReq(res.data);
    } catch (e) {
      setError(e.response?.data?.detail || 'Ошибка загрузки заявки');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadRequest();
  }, [loadRequest]);

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('ru-RU');
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Заявка #{id}</h1>
        <button onClick={() => navigate(-1)} style={styles.backBtn}>← Назад</button>
      </div>

      {loading && (
        <div style={styles.center}>
          <div style={styles.spinner} />
          <p>Загрузка…</p>
        </div>
      )}

      {error && <div style={styles.error}>{error}</div>}

      {!loading && req && (
        <div style={styles.card}>
          <div style={styles.row}>
            <span style={styles.label}>Статус</span>
            <span style={{ ...styles.badge, ...statusStyle(req.status) }}>{statusLabel(req.status)}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Корпус</span>
            <span>{req.building?.name || req.building?.number || '—'}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Описание</span>
            <span style={styles.description}>{req.description || '—'}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Создатель</span>
            <span>{req.creator?.full_name || req.creator?.username || '—'}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Исполнитель</span>
            <span>{req.executor?.full_name || req.executor?.username || '—'}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Срок</span>
            <span>{formatDate(req.due_date)}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Продления</span>
            <span>{req.extended_count || 0}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Фото</span>
            <span>{(req.photos || []).length}</span>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { maxWidth: 700, margin: '0 auto', padding: '24px 16px' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' },
  title: { fontSize: '22px', fontWeight: 700 },
  backBtn: { padding: '8px 14px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' },
  card: { background: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' },
  row: { display: 'flex', flexDirection: 'column', gap: '4px' },
  label: { fontSize: '13px', color: '#6b7280', fontWeight: 500 },
  description: { whiteSpace: 'pre-wrap', lineHeight: 1.5 },
  badge: { display: 'inline-block', padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, width: 'fit-content' },
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px', color: '#6b7280' },
  spinner: { width: '32px', height: '32px', border: '3px solid #e5e7eb', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '12px' },
  error: { padding: '12px 16px', background: '#fef2f2', color: '#b91c1c', borderRadius: '8px', marginBottom: '16px' },
};
