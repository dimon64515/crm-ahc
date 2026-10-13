import { useState, useEffect, useCallback } from 'react';
import { auditLogsAPI, usersAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';

const ACTION_LABELS = {
  created: 'Создан',
  updated: 'Изменён',
  deleted: 'Удалён',
  assigned: 'Назначен',
};

const ACTION_STYLES = {
  created: { background: '#f0fdf4', color: '#059669' },
  updated: { background: '#eff6ff', color: '#2563eb' },
  deleted: { background: '#fef2f2', color: '#dc2626' },
  assigned: { background: '#fffbeb', color: '#d97706' },
};

const ENTITY_LABELS = {
  request: 'Заявка',
  work: 'Отчёт',
  user: 'Пользователь',
};

const EMPTY_FILTERS = {
  entity_type: '',
  action: '',
  user_id: '',
  date_from: '',
  date_to: '',
};

export default function AdminLogsPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [users, setUsers] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);

  const PER_PAGE = 50;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {
        page,
        per_page: PER_PAGE,
        ...Object.fromEntries(
          Object.entries(filters).filter(([, v]) => v !== '')
        ),
      };
      const response = await auditLogsAPI.list(params);
      setLogs(response.data.items || []);
      setTotal(response.data.total || 0);
    } catch (e) {
      setError(e.response?.data?.detail || 'Ошибка загрузки журнала');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    if (user?.role !== 'admin') return;
    fetchLogs();
  }, [fetchLogs, user]);

  useEffect(() => {
    if (user?.role !== 'admin') return;
    usersAPI.list({ per_page: 1000 })
      .then((res) => setUsers((res.data.items || []).filter((u) => u.is_active)))
      .catch(() => setUsers([]));
  }, [user]);

  const handleFilterChange = (name, value) => {
    setFilters((prev) => ({ ...prev, [name]: value }));
    setPage(1);
  };

  const renderValue = (value) => {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
    return String(value);
  };

  // Список изменённых полей: объединение ключей old_values и new_values
  const changedFields = (log) => {
    const oldVals = log.old_values || {};
    const newVals = log.new_values || {};
    const keys = [...new Set([...Object.keys(oldVals), ...Object.keys(newVals)])];
    return keys.map((key) => ({
      key,
      old: Object.prototype.hasOwnProperty.call(oldVals, key) ? oldVals[key] : undefined,
      new: Object.prototype.hasOwnProperty.call(newVals, key) ? newVals[key] : undefined,
    }));
  };

  if (!user || user.role !== 'admin') {
    return <div style={styles.empty}>Доступ запрещён</div>;
  }

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>Журнал действий</h1>
      </div>

      <div style={styles.filters}>
        <select
          value={filters.entity_type}
          onChange={(e) => handleFilterChange('entity_type', e.target.value)}
          style={styles.filterInput}
        >
          <option value="">Все типы сущностей</option>
          <option value="request">Заявки</option>
          <option value="work">Отчёты</option>
          <option value="user">Пользователи</option>
        </select>

        <select
          value={filters.action}
          onChange={(e) => handleFilterChange('action', e.target.value)}
          style={styles.filterInput}
        >
          <option value="">Все действия</option>
          <option value="created">Создание</option>
          <option value="updated">Изменение</option>
          <option value="deleted">Удаление</option>
          <option value="assigned">Назначение</option>
        </select>

        <select
          value={filters.user_id}
          onChange={(e) => handleFilterChange('user_id', e.target.value)}
          style={styles.filterInput}
        >
          <option value="">Все пользователи</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.full_name || u.username}</option>
          ))}
        </select>

        <input
          type="date"
          value={filters.date_from}
          onChange={(e) => handleFilterChange('date_from', e.target.value)}
          style={styles.filterInput}
          title="Дата с"
        />

        <input
          type="date"
          value={filters.date_to}
          onChange={(e) => handleFilterChange('date_to', e.target.value)}
          style={styles.filterInput}
          title="Дата по"
        />

        <button
          onClick={() => { setFilters(EMPTY_FILTERS); setPage(1); }}
          style={styles.secondaryBtn}
        >
          Сбросить
        </button>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {loading ? (
        <div style={styles.center}>
          <div style={styles.spinner} />
          <p>Загрузка…</p>
        </div>
      ) : logs.length === 0 ? (
        <div style={styles.empty}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
          <div style={{ color: '#6b7280' }}>Записи не найдены</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Пользователь</th>
                <th>Действие</th>
                <th>Сущность</th>
                <th>ID</th>
                <th style={{ textAlign: 'right' }}>Детали</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedLog(log)}
                >
                  <td className="tabular-nums" style={{ whiteSpace: 'nowrap' }}>
                    {new Date(log.created_at).toLocaleString('ru-RU')}
                  </td>
                  <td>{log.user?.full_name || log.user?.username || '—'}</td>
                  <td>
                    <span style={{ ...styles.badge, ...(ACTION_STYLES[log.action] || { background: '#f3f4f6', color: '#374151' }) }}>
                      {ACTION_LABELS[log.action] || log.action}
                    </span>
                  </td>
                  <td>{ENTITY_LABELS[log.entity_type] || log.entity_type}</td>
                  <td className="tabular-nums">{log.entity_id ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <span style={styles.detailsHint}>Открыть →</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && total > 0 && (
        <div style={styles.pagination}>
          <span style={{ color: '#6b7280', fontSize: '14px' }}>Всего: {total}</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{ ...styles.pageBtn, opacity: page === 1 ? 0.5 : 1 }}
            >
              ← Назад
            </button>
            <span className="tabular-nums" style={{ fontSize: '14px' }}>{page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              style={{ ...styles.pageBtn, opacity: page === totalPages ? 0.5 : 1 }}
            >
              Вперёд →
            </button>
          </div>
        </div>
      )}

      {selectedLog && (
        <div style={styles.overlay} onClick={() => setSelectedLog(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Детали действия #{selectedLog.id}</h2>
              <button onClick={() => setSelectedLog(null)} style={styles.closeBtn}>&times;</button>
            </div>
            <div style={styles.modalBody}>
              <div style={styles.detailsGrid}>
                <div><span style={styles.fieldLabel}>Дата:</span> {new Date(selectedLog.created_at).toLocaleString('ru-RU')}</div>
                <div>
                  <span style={styles.fieldLabel}>Действие:</span>{' '}
                  <span style={{ ...styles.badge, ...(ACTION_STYLES[selectedLog.action] || { background: '#f3f4f6', color: '#374151' }) }}>
                    {ACTION_LABELS[selectedLog.action] || selectedLog.action}
                  </span>
                </div>
                <div><span style={styles.fieldLabel}>Сущность:</span> {ENTITY_LABELS[selectedLog.entity_type] || selectedLog.entity_type}</div>
                <div><span style={styles.fieldLabel}>ID сущности:</span> {selectedLog.entity_id ?? '—'}</div>
                <div><span style={styles.fieldLabel}>Пользователь:</span> {selectedLog.user?.full_name || selectedLog.user?.username || '—'}</div>
              </div>

              {(selectedLog.old_values || selectedLog.new_values) ? (
                changedFields(selectedLog).length > 0 ? (
                  <div>
                    <h3 style={styles.sectionTitle}>Изменённые поля:</h3>
                    <table style={styles.diffTable}>
                      <thead>
                        <tr>
                          <th>Поле</th>
                          <th>Было</th>
                          <th>Стало</th>
                        </tr>
                      </thead>
                      <tbody>
                        {changedFields(selectedLog).map(({ key, old, new: newVal }) => (
                          <tr key={key}>
                            <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{key}</td>
                            <td style={{ color: '#b91c1c', wordBreak: 'break-word' }}>{renderValue(old)}</td>
                            <td style={{ color: '#047857', wordBreak: 'break-word' }}>{renderValue(newVal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={{ color: '#6b7280' }}>Детальных данных нет</p>
                )
              ) : (
                <p style={{ color: '#6b7280' }}>Детальных данных нет</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  title: { fontSize: '22px', fontWeight: 700, letterSpacing: '-0.025em' },
  filters: { display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' },
  filterInput: { padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', minWidth: '170px', background: '#fff' },
  secondaryBtn: { padding: '8px 16px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' },
  error: { padding: '12px 16px', background: '#fef2f2', color: '#b91c1c', borderRadius: '8px', marginBottom: '16px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px', background: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  badge: { display: 'inline-block', padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600 },
  detailsHint: { color: '#2563eb', fontSize: '13px', fontWeight: 500 },
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px', color: '#6b7280' },
  spinner: { width: '32px', height: '32px', border: '3px solid #e5e7eb', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '12px' },
  empty: { textAlign: 'center', padding: '48px 16px' },
  pagination: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' },
  pageBtn: { padding: '6px 14px', background: '#fff', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '16px',
  },
  modal: {
    background: '#fff',
    borderRadius: '12px',
    maxWidth: '720px',
    width: '100%',
    maxHeight: '85vh',
    overflow: 'auto',
    boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid #e5e7eb',
    position: 'sticky',
    top: 0,
    background: '#fff',
  },
  modalTitle: { fontSize: '18px', fontWeight: 700 },
  closeBtn: { background: 'transparent', border: 'none', fontSize: '28px', lineHeight: 1, color: '#6b7280', cursor: 'pointer', padding: '0 4px' },
  modalBody: { padding: '20px' },
  detailsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px', marginBottom: '20px', fontSize: '14px' },
  fieldLabel: { color: '#6b7280', fontWeight: 500 },
  sectionTitle: { fontSize: '15px', fontWeight: 700, marginBottom: '10px' },
  diffTable: { width: '100%', borderCollapse: 'collapse', fontSize: '13px', background: '#fff' },
};
