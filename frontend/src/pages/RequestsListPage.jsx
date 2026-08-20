import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from "react-router-dom";;
import { useAuth } from '../contexts/AuthContext';
import { requestsAPI, buildingsAPI, usersAPI, servicesAPI } from '../api';

const STATUS_BUTTONS = [
  { value: 'new', label: 'Новые', style: { background: '#eff6ff', color: '#2563eb', borderColor: '#bfdbfe' } },
  { value: 'in_progress', label: 'В работе', style: { background: '#fffbeb', color: '#d97706', borderColor: '#fde68a' } },
  { value: 'completed', label: 'Завершённые', style: { background: '#f0fdf4', color: '#059669', borderColor: '#bbf7d0' } },
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

function downloadZip(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

function RequestActions({ req, actionId, canTake, canAssign, canPrint, canExtendReq, onAction, onAssign, onPrintOne, loadRequests }) {
  return (
    <div style={styles.actionsGroup}>
      {req.status === 'new' && canTake && (
        <button
          onClick={() => onAction(requestsAPI.take, req.id)}
          disabled={actionId === req.id}
          style={styles.actionBtn}
        >
          {actionId === req.id ? '…' : 'Взять в работу'}
        </button>
      )}
      {canAssign && req.status === 'new' && (
        <button
          onClick={() => onAssign(req.id, req.executor?.id, req.service?.id, loadRequests)}
          disabled={actionId === req.id}
          style={styles.warningBtn}
        >
          {actionId === req.id ? '…' : 'Назначить'}
        </button>
      )}
      {canPrint && (
        <button
          onClick={async () => {
            try {
              const res = await requestsAPI.print([req.id]);
              const blob = new Blob([res.data], { type: 'application/zip' });
              onPrintOne(blob, `zayavka_${req.id}.zip`);
            } catch (e) {
              alert(e.response?.data?.detail || 'Ошибка формирования печатной формы');
            }
          }}
          disabled={actionId === req.id}
          style={styles.secondaryBtn}
        >
          Печать
        </button>
      )}
      {canExtendReq && (
        <button
          onClick={() => onAction(requestsAPI.extend, req.id)}
          disabled={actionId === req.id}
          style={styles.secondaryBtn}
        >
          {actionId === req.id ? '…' : 'Продлить'}
        </button>
      )}
      <Link
        to={`/requests/${req.id}`}
        style={{ ...styles.actionBtn, display: 'inline-block', textAlign: 'center', textDecoration: 'none' }}
      >
        Открыть
      </Link>
    </div>
  );
}

export default function RequestsListPage() {
  const { user } = useAuth(); const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isContractor = user?.role === 'contractor';
  const [filters, setFilters] = useState({
    status: 'new',
    building_id: '',
    created_from: '',
    created_to: '',
    completed_from: '',
    completed_to: '',
  });
  const [buildings, setBuildings] = useState([]);
  const [users, setUsers] = useState([]);
  const [services, setServices] = useState([]);
  const [actionId, setActionId] = useState(null);

  const canTake = user?.role === 'contractor' || user?.role === 'director' || user?.role === 'admin';
  const canAssign = user?.role === 'director' || user?.role === 'admin';
  const canPrint = user?.role === 'contractor' || user?.role === 'director' || user?.role === 'admin';
  const canFilterByPeriod = user?.role === 'director' || user?.role === 'admin';
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
      if (filters.created_from) params.created_from = filters.created_from;
      if (filters.created_to) params.created_to = filters.created_to;
      if (filters.completed_from) params.completed_from = filters.completed_from;
      if (filters.completed_to) params.completed_to = filters.completed_to;
      const res = await requestsAPI.list(params);
      let items = res.data.items || [];

      // Для подрядчика: фильтруем "В работе" и "Завершённые" только по своим заявкам
      if (isContractor && (filters.status === 'in_progress' || filters.status === 'completed')) {
        items = items.filter(req => req.executor?.id === user.id);
      }

      setItems(items);
    } catch (e) {
      setError(e.response?.data?.detail || 'Ошибка загрузки заявок');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filters, isContractor, user]);

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
  }, [filters]);

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

  const handleUpdateField = async (requestId, field, value) => {
    setActionId(requestId);
    try {
      await requestsAPI.update(requestId, { [field]: value ? parseInt(value, 10) : null });
      await loadRequests();
    } catch (e) {
      alert(e.response?.data?.detail || 'Ошибка обновления заявки');
    } finally {
      setActionId(null);
    }
  };

  const renderServiceCell = (req) => {
    if (!canAssign) return req.service?.name || '—';
    return (
      <select
        value={req.service?.id || ''}
        onChange={(e) => handleUpdateField(req.id, 'service_id', e.target.value)}
        disabled={actionId === req.id || req.status === 'completed'}
        style={styles.inlineSelect}
      >
        <option value="">Не выбрана</option>
        {services.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    );
  };

  const renderExecutorCell = (req) => {
    if (!canAssign) return req.executor?.full_name || req.executor?.username || '—';
    return (
      <select
        value={req.executor?.id || ''}
        onChange={(e) => handleUpdateField(req.id, 'assigned_to', e.target.value)}
        disabled={actionId === req.id || req.status === 'completed'}
        style={styles.inlineSelect}
      >
        <option value="">Не назначен</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.full_name || u.username}</option>
        ))}
      </select>
    );
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

  const selectAllByFilter = () => {
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
      const idsPart = selectedIds.slice(0, 5).join('_');
      const suffix = selectedIds.length > 5 ? `_и_еще_${selectedIds.length - 5}` : '';
      downloadZip(blob, `zayavki_${idsPart}${suffix}.zip`);
    } catch (e) {
      alert(e.response?.data?.detail || 'Ошибка формирования печатных форм');
    }
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

  const handleAssign = async (requestId, executorId, serviceId, reload) => {
    if (!executorId) {
      alert('Сначала выберите исполнителя в колонке «Исполнитель»');
      return;
    }
    setActionId(requestId);
    try {
      await requestsAPI.assign(requestId, executorId, serviceId);
      await reload();
    } catch (e) {
      alert(e.response?.data?.detail || 'Ошибка назначения исполнителя');
    } finally {
      setActionId(null);
    }
  };

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>Заявки</h1>
        {canPrint && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {canFilterByPeriod && (
              <button
                onClick={selectAllByFilter}
                disabled={items.length === 0}
                style={{
                  ...styles.secondaryBtn,
                  opacity: items.length === 0 ? 0.5 : 1,
                  cursor: items.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                {selectedIds.length === items.length && items.length > 0 ? 'Снять выбор' : 'Выбрать все по фильтру'}
              </button>
            )}
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
          </div>
        )}
      </div>

      <div style={styles.tabBar}>
        {STATUS_BUTTONS.map((s) => {
          const active = filters.status === s.value;
          return (
            <button
              key={s.value}
              onClick={() => setFilters({ ...filters, status: s.value })}
              style={{
                ...styles.tabBtn,
                color: active ? s.style.color : '#6b7280',
                borderBottomColor: active ? s.style.color : 'transparent',
                background: active ? s.style.background : 'transparent',
                fontWeight: active ? 700 : 500,
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <div style={styles.filters}>
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
        {canFilterByPeriod && (
          <>
            <input
              type="date"
              placeholder="Создана с"
              value={filters.created_from}
              onChange={(e) => setFilters({ ...filters, created_from: e.target.value })}
              style={styles.filterInput}
            />
            <input
              type="date"
              placeholder="Создана по"
              value={filters.created_to}
              onChange={(e) => setFilters({ ...filters, created_to: e.target.value })}
              style={styles.filterInput}
            />
            <input
              type="date"
              placeholder="Завершена с"
              value={filters.completed_from}
              onChange={(e) => setFilters({ ...filters, completed_from: e.target.value })}
              style={styles.filterInput}
            />
            <input
              type="date"
              placeholder="Завершена по"
              value={filters.completed_to}
              onChange={(e) => setFilters({ ...filters, completed_to: e.target.value })}
              style={styles.filterInput}
            />
          </>
        )}
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
            <div
              key={req.id}
              style={{
                ...styles.card,
                cursor: "pointer",
                ...(req.is_emergency ? { background: '#fef2f2' } : {}),
              }}
              onClick={() => navigate(`/requests/${req.id}`)}
            >
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
                <div style={styles.cardField}><span style={styles.cardLabel}>Услуга:</span> {renderServiceCell(req)}</div>
                <div style={styles.cardField}><span style={styles.cardLabel}>Создатель:</span> {req.creator?.full_name || req.creator?.username || '—'}</div>
                <div style={styles.cardField}><span style={styles.cardLabel}>Исполнитель:</span> {renderExecutorCell(req)}</div>
                <div style={{ ...styles.cardField, ...(isOverdue(req) ? styles.overdueField : {}) }}>
                  <span style={styles.cardLabel}>Срок:</span>
                  {formatDate(req.due_date)} · продлений: {req.extended_count || 0}
                  {isOverdue(req) && <span style={{ ...styles.overdueText, marginLeft: '8px' }}>Просрочено</span>}
                </div>
              </div>
              <div style={styles.cardActions}>
                <RequestActions
                  req={req}
                  actionId={actionId}
                  canTake={canTake}
                  canAssign={canAssign}
                  canPrint={canPrint}
                  canExtendReq={canExtend(req)}
                  onAction={handleAction}
                  onAssign={handleAssign}
                  onPrintOne={downloadZip}
                  loadRequests={loadRequests}
                />
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
                <tr key={req.id} style={req.is_emergency ? { ...styles.row, backgroundColor: '#fef2f2' } : styles.row}>
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
                  <td>{renderServiceCell(req)}</td>
                  <td>
                    <span style={{ ...styles.badge, ...statusStyle(req.status) }}>
                      {statusLabel(req.status)}
                    </span>
                  </td>
                  <td>{req.creator?.full_name || req.creator?.username || '—'}</td>
                  <td>{renderExecutorCell(req)}</td>
                  <td className="tabular-nums" style={isOverdue(req) ? { color: '#dc2626', fontWeight: 600 } : {}}>{formatDate(req.due_date)}</td>
                  <td style={{ textAlign: 'center' }} className="tabular-nums">{req.extended_count || 0}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap', width: '1%' }}>
                    <div style={{ ...styles.actionsGroup, justifyContent: 'flex-end' }}>
                      <RequestActions
                        req={req}
                        actionId={actionId}
                        canTake={canTake}
                        canAssign={canAssign}
                        canPrint={canPrint}
                        canExtendReq={canExtend(req)}
                        onAction={handleAction}
                        onAssign={handleAssign}
                        onPrintOne={downloadZip}
                        loadRequests={loadRequests}
                      />
                    </div>
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
  tabBar: { display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '1px solid #e5e7eb' },
  tabBtn: { padding: '10px 18px', border: 'none', borderBottom: '2px solid transparent', background: 'transparent', fontSize: '14px', cursor: 'pointer', transition: 'all 0.15s ease', borderRadius: '8px 8px 0 0' },
  filterInput: { padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', minWidth: '180px' },
  error: { padding: '12px 16px', background: '#fef2f2', color: '#b91c1c', borderRadius: '8px', marginBottom: '16px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px', background: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  row: {},
  description: { maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  badge: { display: 'inline-block', padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600 },
  actionBtn: { display: 'inline-flex', alignItems: 'center', padding: '4px 10px', background: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', textDecoration: 'none' },
  secondaryBtn: { display: 'inline-flex', alignItems: 'center', padding: '4px 10px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' },
  warningBtn: { display: 'inline-flex', alignItems: 'center', padding: '4px 10px', background: '#fffbeb', color: '#d97706', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' },
  inlineSelect: { padding: '4px 8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px', maxWidth: '180px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' },
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
  cardActions: { marginTop: '4px', display: 'flex', gap: '8px', alignItems: 'center' },
  actionsGroup: { display: 'inline-flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' },
  overdueText: { color: '#dc2626', fontWeight: 600 },
  overdueField: { color: '#dc2626' },
};
