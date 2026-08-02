import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { worksAPI } from '../api';

export default function MyWorksPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadingId, setUploadingId] = useState(null);
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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
      ) : isMobile ? (
        <div style={styles.cards}>
          {items.map(w => (
            <div key={w.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <span style={styles.cardId}>#{w.id}</span>
                <span style={styles.cardDate}>{formatDate(w.work_date)}</span>
              </div>
              <div style={styles.cardBody}>
                <div style={styles.cardField}><span style={styles.cardLabel}>Корпус:</span> {w.building?.name || w.building?.number || '—'}</div>
                <div style={styles.cardField}><span style={styles.cardLabel}>Вид работы:</span> {formatServices(w.services)}</div>
                <div style={styles.cardField}><span style={styles.cardLabel}>Кол-во:</span> {formatServiceQuantity(w.services)}</div>
                <div style={styles.cardField}><span style={styles.cardLabel}>Описание:</span> {w.description || '—'}</div>
                <div style={styles.cardField}><span style={styles.cardLabel}>Фото:</span> {w.photos_count || 0}</div>
              </div>
              <div style={styles.cardActions}>
                <button onClick={() => navigate(`/works/${w.id}`)} style={styles.cardBtn}>Открыть</button>
                <label style={styles.cardUploadLabel}>
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
                  <span style={uploadingId === w.id ? styles.cardUploadingBtn : styles.cardUploadBtn}>
                    {uploadingId === w.id ? 'Загрузка…' : '+ Фото'}
                  </span>
                </label>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
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
        </div>
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
  cards: { display: 'flex', flexDirection: 'column', gap: '12px' },
  card: { background: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '14px' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' },
  cardId: { fontWeight: 700, fontSize: '16px', color: '#111827' },
  cardDate: { fontSize: '13px', color: '#6b7280' },
  cardBody: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' },
  cardField: { fontSize: '14px', color: '#374151', lineHeight: '1.4', wordBreak: 'break-word' },
  cardLabel: { color: '#6b7280', fontWeight: 500, marginRight: '4px' },
  cardActions: { marginTop: '4px', display: 'flex', gap: '8px', alignItems: 'center' },
  cardBtn: { padding: '8px 14px', background: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', flex: 1 },
  cardUploadLabel: { cursor: 'pointer' },
  cardUploadBtn: { display: 'inline-block', padding: '8px 14px', background: '#f0fdf4', color: '#059669', borderRadius: '8px', fontSize: '14px', fontWeight: 500, flex: 1, textAlign: 'center' },
  cardUploadingBtn: { display: 'inline-block', padding: '8px 14px', background: '#f3f4f6', color: '#6b7280', borderRadius: '8px', fontSize: '14px', fontWeight: 500, flex: 1, textAlign: 'center' },
};
