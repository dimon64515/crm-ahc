import React, { useState, useEffect, useCallback, useRef } from 'react';
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

  const PrimaryActionButton = ({ req }) => {
    if (req.status === 'new' && canTake) {
      return (
        <button
          onClick={() => handleAction(requestsAPI.take, req.id)}
          disabled={actionId === req.id}
          style={styles.actionBtn}
        >
          {actionId === req.id ? '…' : 'Взять в работу'}
        </button>
      );
    }
    if (req.status === 'in_progress' && canComplete(req)) {
      return (
        <button
          onClick={() => handleAction(requestsAPI.complete, req.id)}
          disabled={actionId === req.id}
          style={styles.successBtn}
        >
          {actionId === req.id ? '…' : 'Завершить'}
        </button>
      );
    }
    return null;
  };

  const ActionsMenu = ({ req }) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
      const handleClickOutside = (e) => {
        if (menuRef.current && !menuRef.current.contains(e.target)) {
          setIsOpen(false);
        }
      };
      const handleEscape = (e) => {
        if (e.key === 'Escape') setIsOpen(false);
      };
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
      };
    }, []);

    const handlePrintOne = async () => {
      setIsOpen(false);
      try {
        const res = await requestsAPI.print([req.id]);
        const blob = new Blob([res.data], { type: 'application/zip' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `zayavka_${req.id}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } catch (e) {
        alert(e.response?.data?.detail || 'Ошибка формирования печатной формы');
      }
    };

    const handleAssignMenu = async () => {
      setIsOpen(false);
      const executorId = req.executor?.id;
      if (!executorId) {
        alert('Сначала выберите исполнителя в колонке «Исполнитель»');
        return;
      }
      setActionId(req.id);
      try {
        await requestsAPI.assign(req.id, executorId, req.service?.id);
        await loadRequests();
      } catch (e) {
        alert(e.response?.data?.detail || 'Ошибка назначения исполнителя');
      } finally {
        setActionId(null);
      }
    };

    return (
      <div style={styles.menuContainer} ref={menuRef}>
        <button
          type="button"
          aria-label="Ещё действия"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((v) => !v)}
          disabled={actionId === req.id}
          style={styles.menuBtn}
        >
          ⋯
        </button>
        {isOpen && (
          <div style={styles.menuDropdown} role="menu">
            <Link to={`/requests/${req.id}`} style={styles.menuItem} role="menuitem" onClick={() => setIsOpen(false)}>
              Открыть
            </Link>
            {canAssign && req.status === 'new' && (
              <button type="button" style={styles.menuItem} role="menuitem" onClick={handleAssignMenu}>
                Назначить
              </button>
            )}
            {canPrint && (
              <button type="button" style={styles.menuItem} role="menuitem" onClick={handlePrintOne}>
                Печать
              </button>
            )}
            {canExtend(req) && (
              <button type="button" style={styles.menuItem} role="menuitem" onClick={() => { setIsOpen(false); handleAction(requestsAPI.extend, req.id); }}>
                Продлить
              </button>
            )}
          </div>
        )}
      </div>
    );
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
                <PrimaryActionButton req={req} />
                <ActionsMenu req={req} />
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
                  <td style={{ textAlign: 'right', whiteSpace: 'normal', width: '1%' }}>
                    <div style={{ ...styles.actionsGroup, justifyContent: 'flex-end' }}>
                      <PrimaryActionButton req={req} />
                      <ActionsMenu req={req} />
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
  statusButtons: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  statusBtn: { padding: '8px 14px', borderRadius: '999px', border: '1px solid', fontSize: '14px', cursor: 'pointer', transition: 'all 0.15s ease' },
  filterInput: { padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', minWidth: '180px' },
  error: { padding: '12px 16px', background: '#fef2f2', color: '#b91c1c', borderRadius: '8px', marginBottom: '16px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px', background: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  description: { maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  badge: { display: 'inline-block', padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600 },
  actionBtn: { display: 'inline-block', padding: '4px 10px', background: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', marginLeft: '4px' },
  inlineSelect: { padding: '4px 8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px', maxWidth: '180px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' },
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
  cardActions: { marginTop: '4px', display: 'flex', gap: '8px', alignItems: 'center' },
  actionsGroup: { display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' },
  menuContainer: { position: 'relative', display: 'inline-block' },
  menuBtn: { width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #d1d5db', background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '16px', fontWeight: 700, color: '#4b5563' },
  menuDropdown: { position: 'absolute', right: 0, top: '38px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 10, minWidth: '160px', overflow: 'hidden', textAlign: 'left' },
  menuItem: { display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', fontSize: '13px', textAlign: 'left', cursor: 'pointer', color: '#374151', textDecoration: 'none', boxSizing: 'border-box' },
  overdueText: { color: '#dc2626', fontWeight: 600 },
  overdueField: { color: '#dc2626' },
};
