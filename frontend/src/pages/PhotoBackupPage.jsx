import React, { useState, useEffect } from 'react';
import { buildingsAPI, backupsAPI } from '../api';

export default function PhotoBackupPage() {
  const [filters, setFilters] = useState({ date_from: '', date_to: '', building_id: '' });
  const [buildings, setBuildings] = useState([]);
  const [backups, setBackups] = useState([]);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadBuildings(); loadBackups(); }, []);

  const loadBuildings = async () => {
    try {
      const res = await buildingsAPI.list({ is_active: true });
      setBuildings(res.data || []);
    } catch (e) {}
  };

  const loadBackups = async () => {
    setLoading(true);
    try {
      const res = await backupsAPI.list();
      setBackups((res.data.items || []).filter(b => b.type === 'photos'));
    } catch (e) {}
    finally { setLoading(false); }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const params = {};
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;
      if (filters.building_id) params.building_id = parseInt(filters.building_id);
      await backupsAPI.createPhotos(params);
      loadBackups();
    } catch (e) {
      alert('Ошибка создания архива фото');
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = async (backupId) => {
    try {
      const res = await backupsAPI.download(backupId);
      const blob = new Blob([res.data], { type: 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${backupId}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert('Ошибка скачивания архива');
    }
  };

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleString('ru-RU');
  };

  const formatSize = (mb) => {
    if (!mb) return '—';
    return `${mb} МБ`;
  };

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>Архив фотографий</h1>
      </div>

      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Создать архив фото</h3>
        <div style={styles.row}>
          <input
            type="date"
            placeholder="С"
            value={filters.date_from}
            onChange={e => setFilters({ ...filters, date_from: e.target.value })}
            style={styles.input}
          />
          <input
            type="date"
            placeholder="По"
            value={filters.date_to}
            onChange={e => setFilters({ ...filters, date_to: e.target.value })}
            style={styles.input}
          />
          <select
            value={filters.building_id}
            onChange={e => setFilters({ ...filters, building_id: e.target.value })}
            style={styles.input}
          >
            <option value="">Все корпуса</option>
            {buildings.map(b => (
              <option key={b.id} value={b.id}>{b.name || b.number}</option>
            ))}
          </select>
          <button onClick={handleCreate} disabled={creating} style={styles.primaryBtn}>
            {creating ? 'Создание…' : 'Создать архив'}
          </button>
        </div>
      </div>

      <h3 style={styles.sectionTitle}>История архивов</h3>
      {loading ? (
        <div style={styles.center}><div style={styles.spinner} /><p>Загрузка…</p></div>
      ) : backups.length === 0 ? (
        <div style={styles.empty}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>📦</div>
          <div style={{ color: '#6b7280' }}>Нет архивов фото</div>
        </div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th>Создан</th>
              <th style={{ textAlign: 'right' }}>Размер</th>
              <th>Статус</th>
              <th style={{ textAlign: 'right' }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {backups.map(b => (
              <tr key={b.backup_id}>
                <td className="tabular-nums">{formatDate(b.created_at)}</td>
                <td style={{ textAlign: 'right' }} className="tabular-nums">{formatSize(b.size_mb)}</td>
                <td>
                  <span style={statusBadge(b.status === 'completed')}>
                    {b.status === 'completed' ? 'Готов' : b.status}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button onClick={() => handleDownload(b.backup_id)} style={styles.smallLink}>Скачать</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const statusBadge = (active) => ({
  display: 'inline-block', padding: '3px 10px', borderRadius: '9999px', fontSize: '12px', fontWeight: 600,
  background: active ? '#d1fae5' : '#f3f4f6',
  color: active ? '#065f46' : '#6b7280',
});

const styles = {
  header: { marginBottom: '20px' },
  title: { fontSize: '22px', fontWeight: 700, letterSpacing: '-0.025em' },
  section: { background: '#fff', borderRadius: '12px', padding: '20px', marginBottom: '20px', border: '1px solid #e5e7eb' },
  sectionTitle: { fontSize: '15px', fontWeight: 600, color: '#111827', margin: '0 0 12px' },
  row: { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' },
  input: { padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', lineHeight: '20px', background: '#fff', minWidth: '140px', flex: '1 1 140px' },
  primaryBtn: { padding: '10px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px', background: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  smallLink: { padding: '4px 10px', background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '13px', fontWeight: 500 },
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px', color: '#6b7280' },
  spinner: { width: '32px', height: '32px', border: '3px solid #e5e7eb', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '12px' },
  empty: { textAlign: 'center', padding: '48px 16px' },
};
