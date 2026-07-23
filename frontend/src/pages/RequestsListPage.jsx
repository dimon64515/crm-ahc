import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { requestsAPI, buildingsAPI, usersAPI, servicesAPI } from '../api';

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
  const [services, setServices] = useState([]);
  const [actionId, setActionId] = useState(null);
  const [selectedAssignments, setSelectedAssignments] = useState({});

  const canTake = user?.role === 'contractor' || user?.role === 'director' || user?.role === 'admin';
  const canAssign = user?.role === 'director' || user?.role === 'admin';
  const canPrint = user?.role === 'director' || user?.role === 'admin' || user?.role === 'contractor';
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

  const loadServices = async () => {
    try {
      const res = await servicesAPI.list({ per_page: 1000 });
      setServices((res.data.items || []).filter((s) => s.is_active));
    } catch (e) {
      setServices([]);
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
      loadServices();
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

  const handleAssign = async (requestId) => {
    const assignment = selectedAssignments[requestId] || {};
    const userId = assignment.userId;
    const serviceId = assignment.serviceId;
    if (!userId) return;
    setActionId(requestId);
    try {
      await requestsAPI.assign(requestId, parseInt(userId, 10), serviceId ? parseInt(serviceId, 10) : undefined);
      setSelectedAssignments((prev) => ({ ...prev, [requestId]: {} }));
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

  const isOverdue = (req) => {
    if (!req.due_date || req.status === 'completed') return false;
    const [y, m, d] = req.due_date.split('-').map(Number);
    const due = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return due < today;
  };

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const renderActions = (req, actionStyle = {}) => (
    <div style={{ ...styles.actionsGroup, ...actionStyle }}>
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
        <>
          <select
            value={selectedAssignments[req.id]?.userId || ''}
            onChange={(e) => setSelectedAssignments((prev) => ({ ...prev, [req.id]: { ...prev[req.id], userId: e.target.value } }))}
            disabled={actionId === req.id}
            style={styles.selectAssign}
          >
            <option value="">Исполнитель</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name || u.username}</option>
            ))}
          </select>
          <select
            value={selectedAssignments[req.id]?.serviceId || ''}
            onChange={(e) => setSelectedAssignments((prev) => ({ ...prev, [req.id]: { ...prev[req.id], serviceId: e.target.value } }))}
            disabled={actionId === req.id}
            style={{ ...styles.selectAssign, width: 'auto', minWidth: 'auto', maxWidth: '180px', textOverflow: 'ellipsis', overflow: 'hidden' }}
          >
            <option value="">Услуга</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button
            onClick={() => handleAssign(req.id)}
            disabled={actionId === req.id || !selectedAssignments[req.id]?.userId}
            style={styles.actionBtn}
          >
            {actionId === req.id ? '…' : 'Назначить'}
          </button>
        </>
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
    </div>
  );

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
            🖨 Печать ({selectedIds.length})
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
      ) : isMobile ? (
        <div style={styles.cards}>
          {items.map((req) => (
            <div key={req.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={styles.cardTitleRow}>
                  {canPrint && (
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(req.id)}
                      onChange={() => toggleSelection(req.id)}
                      style={{ cursor: 'pointer', marginRight: '8px' }}
                    />
                  )}
                  <span style={styles.cardId}>#{req.id}</span>
                  <span style={{ ...styles.badge, ...statusStyle(req.status), marginLeft: '8px' }}>
                    {statusLabel(req.status)}
                  </span>
                </div>
                <div style={styles.cardBuilding}>{req.building?.name || req.building?.number || '—'}</div>
              </div>
              <div style={styles.cardBody}>
                <div style={styles.cardField}><span style={styles.cardLabel}>Описание:</span> {req.description || '—'}</div>
                <div style={styles.cardField}><span style={styles.cardLabel}>Услуга:</span> {req.service?.name || '—'}</div>
                <div style={styles.cardField}><span style={styles.cardLabel}>Создатель:</span> {req.creator?.full_name || req.creator?.username || '—'}</div>
                <div style={styles.cardField}><span style={styles.cardLabel}>Исполнитель:</span> {req.executor?.full_name || req.executor?.username || '—'}</div>
                <div style={{ ...styles.cardField, ...(isOverdue(req) ? styles.overdueField : {}) }}>
                  <span style={styles.cardLabel}>Срок:</span>
                  {formatDate(req.due_date)} · продлений: {req.extended_count || 0}
                  {isOverdue(req) && <span style={{ ...styles.overdueText, marginLeft: '8px' }}>Просрочено</span>}
                </div>
              </div>
              <div style={styles.cardActions}>
                {renderActions(req)}
              </div>
            </div>
          ))}
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
                <th>Услуга</th>
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
                  <td>{req.service?.name || '—'}</td>
                  <td>
                    <span style={{ ...styles.badge, ...statusStyle(req.status) }}>
                      {statusLabel(req.status)}
                    </span>
                  </td>
                  <td>{req.creator?.full_name || req.creator?.username || '—'}</td>
                  <td>{req.executor?.full_name || req.executor?.username || '—'}</td>
                  <td className="tabular-nums" style={isOverdue(req) ? { color: '#dc2626', fontWeight: 600 } : {}}>{formatDate(req.due_date)}</td>
                  <td style={{ textAlign: 'center' }} className="tabular-nums">{req.extended_count || 0}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'normal', width: '1%' }}>
                    {renderActions(req, { justifyContent: 'flex-end' })}
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
  cards: { display: 'flex', flexDirection: 'column', gap: '12px' },
  card: { background: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '14px' },
  cardHeader: { marginBottom: '10px' },
  cardTitleRow: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: '4px' },
  cardId: { fontWeight: 700, fontSize: '15px', color: '#111827' },
  cardBuilding: { fontSize: '14px', color: '#4b5563', fontWeight: 500 },
  cardBody: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' },
  cardField: { fontSize: '14px', color: '#374151', lineHeight: '1.4', wordBreak: 'break-word' },
  cardLabel: { color: '#6b7280', fontWeight: 500, marginRight: '4px' },
  cardActions: { marginTop: '4px' },
  actionsGroup: { display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' },
  overdueText: { color: '#dc2626', fontWeight: 600 },
  overdueField: { color: '#dc2626' },
};
