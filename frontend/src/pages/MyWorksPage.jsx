import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { worksAPI } from '../api';

export default function MyWorksPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadingId, setUploadingId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await worksAPI.list({ per_page: 100 });
      setItems(res.data.items || []);
    } catch (e) {}
    finally { setLoading(false); }
  };

  const handleUpload = async (workId, files) => {
    if (!files || files.length === 0) return;
    setUploadingId(workId);
    try {
      await worksAPI.uploadPhotos(workId, files);
      load();
    } catch (e) {
      alert(e.response?.data?.detail || 'Ошибка загрузки фото');
    } finally {
      setUploadingId(null);
    }
  };

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('ru-RU');
  };

  const formatServices = (services) => {
    if (!services || services.length === 0) return '—';
    const first = services[0].name || '—';
    if (services.length === 1) return first;
    return `${first} +${services.length - 1}`;
  };

  const formatServiceQuantity = (services) => {
    if (!services || services.length === 0) return '—';
    if (services.length === 1) return services[0].quantity;
    return `${services.length} усл.`;
  };

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>Мои записи</h1>
      </div>

      {loading ? (
        <div style={styles.center}><div style={styles.spinner} /><p>Загрузка…</p></div>
      ) : items.length === 0 ? (
        <div style={styles.empty}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
          <div style={{ color: '#6b7280' }}>Нет записей</div>
        </div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th>№</th>
              <th>Дата</th>
              <th>Корпус</th>
              <th>Вид работы</th>
              <th style={{ textAlign: 'center' }}>Кол-во</th>
              <th>Описание</th>
              <th style={{ textAlign: 'center' }}>Фото</th>
              <th style={{ textAlign: 'right' }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {items.map(w => (
              <tr key={w.id}>
                <td className="tabular-nums">{w.id}</td>
                <td className="tabular-nums">{formatDate(w.work_date)}</td>
                <td>{w.building?.name || w.building?.number || '—'}</td>
                <td>{formatServices(w.services)}</td>
                <td style={{ textAlign: 'center' }} className="tabular-nums">{formatServiceQuantity(w.services)}</td>
                <td style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={w.description}>{w.description || '—'}</td>
                <td style={{ textAlign: 'center' }} className="tabular-nums">{w.photos_count || 0}</td>
                <td style={{ textAlign: 'right' }}>
                  <button onClick={() => navigate(`/works/${w.id}`)} style={styles.smallLink}>Открыть</button>
                  <label style={styles.uploadLabel}>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      style={{ display: 'none' }}
                      onChange={e => {
                        handleUpload(w.id, e.target.files);
                        e.target.value = '';
                      }}
                    />
                    <span style={uploadingId === w.id ? styles.uploadingBtn : styles.uploadBtn}>
                      {uploadingId === w.id ? 'Загрузка…' : '+ Фото'}
                    </span>
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const styles = {
  header: { marginBottom: '20px' },
  title: { fontSize: '22px', fontWeight: 700, letterSpacing: '-0.025em' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px', background: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  smallLink: { padding: '4px 10px', background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '13px', fontWeight: 500 },
  uploadLabel: { cursor: 'pointer', marginLeft: '4px' },
  uploadBtn: { display: 'inline-block', padding: '4px 10px', background: '#f0fdf4', color: '#059669', borderRadius: '6px', fontSize: '13px', fontWeight: 500 },
  uploadingBtn: { display: 'inline-block', padding: '4px 10px', background: '#f3f4f6', color: '#6b7280', borderRadius: '6px', fontSize: '13px', fontWeight: 500 },
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px', color: '#6b7280' },
  spinner: { width: '32px', height: '32px', border: '3px solid #e5e7eb', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '12px' },
  empty: { textAlign: 'center', padding: '48px 16px' },
};
