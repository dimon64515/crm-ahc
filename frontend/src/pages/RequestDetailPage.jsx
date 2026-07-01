import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { requestsAPI, usersAPI } from '../api';

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

export default function RequestDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [req, setReq] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('ru-RU');
  };

  const formatDateTime = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleString('ru-RU');
  };

  const loadRequest = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await requestsAPI.get(id);
      setReq(res.data);
    } catch (e) {
      setReq(null);
      setError(e.response?.data?.detail || 'Ошибка загрузки заявки');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadUsers = useCallback(async () => {
    try {
      const res = await usersAPI.list({ per_page: 1000 });
      setUsers((res.data.items || []).filter((u) => u.is_active));
    } catch (e) {
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    loadRequest();
  }, [loadRequest]);

  useEffect(() => {
    if (user?.role === 'director' || user?.role === 'admin') {
      loadUsers();
    }
  }, [loadUsers, user?.role]);

  const showMessage = (text, isError = false) => {
    setMessage({ text, isError });
    setTimeout(() => setMessage(''), 4000);
  };

  const handleAction = async (action, ...args) => {
    setActionLoading(true);
    setError('');
    try {
      await action(...args);
      showMessage('Действие выполнено успешно');
      await loadRequest();
    } catch (e) {
      const detail = e.response?.data?.detail || 'Ошибка выполнения действия';
      showMessage(detail, true);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedUserId) return;
    await handleAction(requestsAPI.assign, id, parseInt(selectedUserId, 10));
    setSelectedUserId('');
  };

  if (!user) return null;

  const isExecutor = user.role === 'contractor' || user.role === 'director' || user.role === 'admin';
  const isDirector = user.role === 'director' || user.role === 'admin';
  const isAdmin = user.role === 'admin';
  const isWatchman = user.role === 'watchman';

  const canTake = isExecutor && req?.status === 'new';
  const canAssign = isDirector && req?.status !== 'completed';
  const canComplete = req?.status === 'in_progress' && (
    isDirector || (user.role === 'contractor' && req?.executor?.id === user.id)
  );
  const canExtend = isAdmin && req?.status !== 'completed';

  const backPath = isWatchman ? '/my-requests' : '/requests';

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Заявка #{id}</h1>
        <button onClick={() => navigate(backPath)} style={styles.backBtn}>← Назад</button>
      </div>

      {message && (
        <div style={message.isError ? styles.errorMessage : styles.successMessage}>
          {message.text}
        </div>
      )}

      {loading && (
        <div style={styles.center}>
          <div style={styles.spinner} />
          <p>Загрузка…</p>
        </div>
      )}

      {error && !loading && <div style={styles.error}>{error}</div>}

      {!loading && req && (
        <>
          <div style={styles.card}>
            <div style={styles.row}>
              <span style={styles.label}>Статус</span>
              <span style={{ ...styles.badge, ...statusStyle(req.status) }}>{statusLabel(req.status)}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Корпус</span>
              <span style={styles.value}>{req.building?.name || req.building?.number || '—'}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Описание</span>
              <span style={styles.description}>{req.description || '—'}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Создатель</span>
              <span style={styles.value}>{req.creator?.full_name || req.creator?.username || '—'}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Исполнитель</span>
              <span style={styles.value}>{req.executor?.full_name || req.executor?.username || 'Не назначен'}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Срок исполнения</span>
              <span style={styles.value}>{formatDate(req.due_date)}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Количество продлений</span>
              <span style={styles.value}>{req.extended_count || 0}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Дата создания</span>
              <span style={styles.value}>{formatDateTime(req.created_at)}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Дата обновления</span>
              <span style={styles.value}>{formatDateTime(req.updated_at)}</span>
            </div>
          </div>

          {(canTake || canAssign || canComplete || canExtend) && (
            <div style={styles.actionsCard}>
              <h2 style={styles.actionsTitle}>Действия</h2>
              <div style={styles.actionsRow}>
                {canTake && (
                  <button
                    onClick={() => handleAction(requestsAPI.take, id)}
                    disabled={actionLoading}
                    style={styles.primaryBtn}
                  >
                    {actionLoading ? '…' : 'Взять в работу'}
                  </button>
                )}
                {canAssign && (
                  <div style={styles.assignGroup}>
                    <select
                      value={selectedUserId}
                      onChange={(e) => setSelectedUserId(e.target.value)}
                      disabled={actionLoading}
                      style={styles.select}
                    >
                      <option value="">Выберите исполнителя</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>{u.full_name || u.username}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleAssign}
                      disabled={actionLoading || !selectedUserId}
                      style={styles.warningBtn}
                    >
                      {actionLoading ? '…' : 'Назначить'}
                    </button>
                  </div>
                )}
                {canComplete && (
                  <button
                    onClick={() => handleAction(requestsAPI.complete, id)}
                    disabled={actionLoading}
                    style={styles.successBtn}
                  >
                    {actionLoading ? '…' : 'Завершить'}
                  </button>
                )}
                {canExtend && (
                  <button
                    onClick={() => handleAction(requestsAPI.extend, id)}
                    disabled={actionLoading}
                    style={styles.secondaryBtn}
                  >
                    {actionLoading ? '…' : 'Продлить срок'}
                  </button>
                )}
              </div>
            </div>
          )}

          <div style={styles.photosCard}>
            <h2 style={styles.photosTitle}>Фото ({(req.photos || []).length})</h2>
            {(req.photos || []).length === 0 ? (
              <div style={styles.emptyPhotos}>Нет прикреплённых фотографий</div>
            ) : (
              <div style={styles.photosGrid}>
                {(req.photos || []).map((photo) => (
                  <a
                    key={photo.id}
                    href={photo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.photoLink}
                    title={photo.original_name || photo.filename}
                  >
                    <img
                      src={photo.url}
                      alt={photo.original_name || photo.filename}
                      style={styles.photoThumb}
                      loading="lazy"
                    />
                  </a>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  container: { maxWidth: 720, margin: '0 auto', padding: '24px 16px' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' },
  title: { fontSize: '22px', fontWeight: 700, margin: 0 },
  backBtn: { padding: '8px 14px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' },
  card: { background: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' },
  row: { display: 'flex', flexDirection: 'column', gap: '4px' },
  label: { fontSize: '13px', color: '#6b7280', fontWeight: 500 },
  value: { fontSize: '15px', color: '#111827' },
  description: { fontSize: '15px', color: '#111827', whiteSpace: 'pre-wrap', lineHeight: 1.5 },
  badge: { display: 'inline-block', padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, width: 'fit-content' },
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px', color: '#6b7280' },
  spinner: { width: '32px', height: '32px', border: '3px solid #e5e7eb', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '12px' },
  error: { padding: '12px 16px', background: '#fef2f2', color: '#b91c1c', borderRadius: '8px', marginBottom: '16px' },
  errorMessage: { padding: '12px 16px', background: '#fef2f2', color: '#b91c1c', borderRadius: '8px', marginBottom: '16px' },
  successMessage: { padding: '12px 16px', background: '#f0fdf4', color: '#059669', borderRadius: '8px', marginBottom: '16px' },
  actionsCard: { background: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '20px', marginBottom: '20px' },
  actionsTitle: { fontSize: '16px', fontWeight: 600, margin: '0 0 14px 0' },
  actionsRow: { display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-start' },
  assignGroup: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' },
  select: { padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', minWidth: '200px', background: '#fff' },
  primaryBtn: { padding: '10px 16px', background: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' },
  warningBtn: { padding: '10px 16px', background: '#fffbeb', color: '#d97706', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' },
  successBtn: { padding: '10px 16px', background: '#f0fdf4', color: '#059669', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' },
  secondaryBtn: { padding: '10px 16px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' },
  photosCard: { background: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '20px' },
  photosTitle: { fontSize: '16px', fontWeight: 600, margin: '0 0 14px 0' },
  emptyPhotos: { color: '#6b7280', padding: '16px 0' },
  photosGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '12px' },
  photoLink: { display: 'block', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e5e7eb' },
  photoThumb: { width: '100%', height: '120px', objectFit: 'cover', display: 'block' },
};
