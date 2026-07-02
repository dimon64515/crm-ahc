import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { requestsAPI, buildingsAPI, usersAPI } from '../api';

const STATUS_BUTTONS = [
  { value: '', label: 'Все', style: { background: '#f3f4f6', color: '#374151', borderColor: '#d1d5db' } },
  { value: 'new', label: 'Новые', style: { background: '#eff6ff', color: '#2563eb', borderColor: '#bfdbfe' } },
  { value: 'in_progress', label: 'В работе', style: { background: '#fffbeb', color: '#d97706', borderColor: '#fde68a' } },
  { value: 'completed', label: 'Завершены', style: { background: '#f0fdf4', color: '#059669', borderColor: '#bbf7d0' } },
];

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

export default function RequestsListPage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ status: '', building_id: '' });
  const [buildings, setBuildings] = useState([]);
  const [users, setUsers] = useState([]);
  const [actionId, setActionId] = useState(null);

  const canTake = user?.role === 'contractor' || user?.role === 'director' || user?.role === 'admin';
  const canAssign = user?.role === 'director' || user?.role === 'admin';
  const canPrint = user?.role === 'director' || user?.role === 'admin';
  const canExtend = (req) => user?.role === 'admin' && req.status !== 'completed';
  const [selectedIds, setSelectedIds] = useState([]);

  const loadBuildings = async () => {
    try {
      const res = await buildingsAPI.list({ is_active: true });
      setBuildings(res.data || []);
    } catch (e) {
      setBuildings([]);
    }
  };

  const loadUsers = async () => {
    try {
      const res = await usersAPI.list({ per_page: 1000 });
      setUsers((res.data.items || []).filter((u) => u.is_active && ['contractor', 'director', 'admin'].includes(u.role)));
    } catch (e) {
      setUsers([]);
    }
  };

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (filters.status) params.status = filters.status;
      if (filters.building_id) params.building_id = filters.building_id;
      const res = await requestsAPI.list(params);
      setItems(res.data.items || []);
    } catch (e) {
      setError(e.response?.data?.detail || 'Ошибка загрузки заявок');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filters.status, filters.building_id]);

  useEffect(() => {
    loadBuildings();
    if (canAssign) {
      loadUsers();
    }
  }, [canAssign]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  useEffect(() => {
    setSelectedIds([]);
  }, [items.length]);

  const handleAction = async (action, id) => {
    setActionId(id);
    try {
      await action(id);
      await loadRequests();
    } catch (e) {
      alert(e.response?.data?.detail || 'Ошибка выполнения действия');
    } finally {
      setActionId(null);
    }
  };

  const handleAssign = async (requestId, userId) => {
    if (!userId) return;
    setActionId(requestId);
    try {
      await requestsAPI.assign(requestId, parseInt(userId, 10));
      await loadRequests();
    } catch (e) {
      alert(e.response?.data?.detail || 'Ошибка назначения исполнителя');
    } finally {
      setActionId(null);
    }
  };

  const toggleSelection = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (selectedIds.length === items.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(items.map((r) => r.id));
    }
  };

  const handlePrint = async () => {
    if (selectedIds.length === 0) return;
    try {
      const res = await requestsAPI.print(selectedIds);
      const blob = new Blob([res.data], { type: 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const idsPart = selectedIds.slice(0, 5).join('_');
      const suffix = selectedIds.length > 5 ? `_и_еще_${selectedIds.length - 5}` : '';
      link.download = `zayavki_${idsPart}${suffix}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert(e.response?.data?.detail || 'Ошибка формирования печатных форм');
    }
  };

  const canComplete = (req) => {
    if (req.status !== 'in_progress') return false;
    if (user?.role === 'director' || user?.role === 'admin') return true;
    if (user?.role === 'contractor' && req.executor?.id === user.id) return true;
    return false;
  };

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('ru-RU');
  };

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>Заявки</h1>
        {canPrint && (
          <button
            onClick={handlePrint}
            disabled={selectedIds.length === 0}
            style={{
              ...styles.printBtn,
              opacity: selectedIds.length === 0 ? 0.5 : 1,
              cursor: selectedIds.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            🖨 Печать выбранных ({selectedIds.length})
          </button>
        )}
      </div>

      <div style={styles.filters}>
        <div style={styles.statusButtons}>
          {STATUS_BUTTONS.map((s) => {
            const active = filters.status === s.value;
            return (
              <button
                key={s.value}
                onClick={() => setFilters({ ...filters, status: s.value })}
                style={{
                  ...styles.statusBtn,
                  background: s.style.background,
                  color: s.style.color,
                  borderColor: s.style.borderColor,
                  fontWeight: active ? 700 : 500,
                  boxShadow: active ? 'inset 0 0 0 1px ' + s.style.color : 'none',
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
        <select
          value={filters.building_id}
          onChange={(e) => setFilters({ ...filters, building_id: e.target.value })}
          style={styles.filterInput}
        >
          <option value="">Все корпуса</option>
          {buildings.map((b) => (
            <option key={b.id} value={b.id}>{b.number} — {b.name}</option>
          ))}
        </select>
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
                {canPrint && (
                  <th style={{ width: '40px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={items.length > 0 && selectedIds.length === items.length}
                      onChange={toggleAll}
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                )}
                <th>ID</th>
                <th>Корпус</th>
                <th>Описание</th>
                <th>Статус</th>
                <th>Создатель</th>
                <th>Исполнитель</th>
                <th>Срок</th>
                <th style={{ textAlign: 'center' }}>Продления</th>
                <th style={{ textAlign: 'right' }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {items.map((req) => (
                <tr key={req.id}>
                  {canPrint && (
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(req.id)}
                        onChange={() => toggleSelection(req.id)}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                  )}
                  <td className="tabular-nums">{req.id}</td>
                  <td>{req.building?.name || req.building?.number || '—'}</td>
                  <td style={styles.description} title={req.description}>{req.description || '—'}</td>
                  <td>
                    <span style={{ ...styles.badge, ...statusStyle(req.status) }}>
                      {statusLabel(req.status)}
                    </span>
                  </td>
                  <td>{req.creator?.full_name || req.creator?.username || '—'}</td>
                  <td>{req.executor?.full_name || req.executor?.username || '—'}</td>
                  <td className="tabular-nums">{formatDate(req.due_date)}</td>
                  <td style={{ textAlign: 'center' }} className="tabular-nums">{req.extended_count || 0}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <Link to={`/requests/${req.id}`} style={styles.smallLink}>Открыть</Link>
                    {canTake && req.status === 'new' && (
                      <button
                        onClick={() => handleAction(requestsAPI.take, req.id)}
                        disabled={actionId === req.id}
                        style={styles.actionBtn}
                      >
                        {actionId === req.id ? '…' : 'Взять в работу'}
                      </button>
                    )}
                    {canAssign && req.status !== 'completed' && (
                      <select
                        value=""
                        onChange={(e) => { const val = e.target.value; e.target.value = ''; handleAssign(req.id, val); }}
                        disabled={actionId === req.id}
                        style={styles.selectAssign}
                      >
                        <option value="">Назначить</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>{u.full_name || u.username}</option>
                        ))}
                      </select>
                    )}
                    {canExtend(req) && (
                      <button
                        onClick={() => handleAction(requestsAPI.extend, req.id)}
                        disabled={actionId === req.id}
                        style={styles.secondaryBtn}
                      >
                        {actionId === req.id ? '…' : 'Продлить'}
                      </button>
                    )}
                    {canComplete(req) && (
                      <button
                        onClick={() => handleAction(requestsAPI.complete, req.id)}
                        disabled={actionId === req.id}
                        style={styles.successBtn}
                      >
                        {actionId === req.id ? '…' : 'Завершить'}
                      </button>
                    )}
                  </td>
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
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  title: { fontSize: '22px', fontWeight: 700, letterSpacing: '-0.025em' },
  printBtn: { padding: '8px 16px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' },
  filters: { display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' },
  statusButtons: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  statusBtn: { padding: '8px 14px', borderRadius: '999px', border: '1px solid', fontSize: '14px', cursor: 'pointer', transition: 'all 0.15s ease' },
  filterInput: { padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', minWidth: '180px' },
  error: { padding: '12px 16px', background: '#fef2f2', color: '#b91c1c', borderRadius: '8px', marginBottom: '16px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px', background: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  description: { maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  badge: { display: 'inline-block', padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600 },
  smallLink: { display: 'inline-block', padding: '4px 10px', color: '#2563eb', textDecoration: 'none', fontSize: '13px', fontWeight: 500 },
  actionBtn: { display: 'inline-block', padding: '4px 10px', background: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', marginLeft: '4px' },
  selectAssign: { display: 'inline-block', padding: '4px 8px', background: '#fffbeb', color: '#d97706', border: '1px solid #fcd34d', borderRadius: '6px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', marginLeft: '4px', minWidth: '110px' },
  secondaryBtn: { display: 'inline-block', padding: '4px 10px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', marginLeft: '4px' },
  successBtn: { display: 'inline-block', padding: '4px 10px', background: '#f0fdf4', color: '#059669', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', marginLeft: '4px' },
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px', color: '#6b7280' },
  spinner: { width: '32px', height: '32px', border: '3px solid #e5e7eb', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '12px' },
  empty: { textAlign: 'center', padding: '48px 16px' },
};
