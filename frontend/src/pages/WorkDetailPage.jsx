import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { worksAPI, buildingsAPI, servicesAPI, usersAPI, materialsAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';

export default function WorkDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [work, setWork] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [edited, setEdited] = useState({
    description: '',
    service_quantity: '',
    work_date: '',
    building_id: '',
    service_id: '',
    user_id: '',
    materials: [],
  });
  const [buildings, setBuildings] = useState([]);
  const [services, setServices] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [allMaterials, setAllMaterials] = useState([]);
  const [uploading, setUploading] = useState(false);
  const photoInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const loadWork = useCallback(async () => {
    try {
      setLoading(true);
      const res = await worksAPI.get(id);
      setWork(res.data);
      setEdited({
        description: res.data.description || '',
        service_quantity: res.data.service_quantity ?? '',
        work_date: res.data.work_date || '',
        building_id: res.data.building?.id || '',
        service_id: res.data.service?.id || '',
        user_id: res.data.created_by?.id || '',
        materials: (res.data.materials || []).map(m => ({ material_id: m.material_id, quantity: m.quantity })),
      });
    } catch {
      setWork(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadBuildings = useCallback(async () => { try { const res = await buildingsAPI.list({ is_active: true }); setBuildings(res.data); } catch {} }, []);
  const loadServices = useCallback(async () => { try { const res = await servicesAPI.list(); setServices(res.data.items || []); } catch {} }, []);
  const loadContractors = useCallback(async () => { try { const res = await usersAPI.list({ role: 'contractor' }); setContractors(res.data.items || []); } catch {} }, []);
  const loadMaterials = useCallback(async () => { try { const res = await materialsAPI.list(); setAllMaterials(res.data.items || []); } catch {} }, []);

  useEffect(() => {
    loadWork();
    if (user?.role === 'admin') {
      loadBuildings();
      loadServices();
      loadContractors();
      loadMaterials();
    }
  }, [loadWork, user, loadBuildings, loadServices, loadContractors, loadMaterials]);

  const canEdit = user.role === 'admin';
  const canUpload = user.role === 'admin' || (user.role === 'contractor' && work?.created_by?.id === user.id);

  const handleDelete = async () => {
    if (!window.confirm('Удалить запись?')) return;
    setDeleting(true);
    try {
      await worksAPI.remove(id);
      navigate(user.role === 'contractor' ? '/my-works' : '/dashboard');
    }
    catch { alert('Ошибка удаления'); }
    finally { setDeleting(false); }
  };

  const handleDeletePhoto = async (photoId) => {
    if (!window.confirm('Удалить фото?')) return;
    try { await worksAPI.deletePhoto(id, photoId); loadWork(); }
    catch { alert('Ошибка удаления фото'); }
  };

  const handleDeleteFile = async (fileId) => {
    if (!window.confirm('Удалить файл?')) return;
    try { await worksAPI.deleteFile(id, fileId); loadWork(); }
    catch { alert('Ошибка удаления файла'); }
  };

  const handlePriceEdit = async (type, newPrice, materialId = null) => {
    try {
      const prices = { service_unit_price: undefined, materials: [] };
      if (type === 'service') {
        prices.service_unit_price = parseFloat(newPrice);
      } else if (type === 'material' && materialId) {
        prices.materials = [{ material_id: materialId, unit_price: parseFloat(newPrice) }];
      }
      await worksAPI.updatePrices(id, prices);
      loadWork();
    } catch { alert('Ошибка обновления цен'); }
  };

  const handleUpdateWork = async () => {
    const payload = {};

    // Описание: отправляем только если изменилось
    if (edited.description !== (work.description || '')) {
      payload.description = edited.description;
    }

    // Дата: отправляем только если изменилась и не пустая
    if (edited.work_date && edited.work_date !== work.work_date) {
      payload.work_date = edited.work_date;
    }

    // Количество: нормализуем разделитель (запятая → точка) и проверяем
    if (edited.service_quantity !== '' && edited.service_quantity !== undefined && edited.service_quantity !== null) {
      const qtyStr = String(edited.service_quantity).replace(',', '.').trim();
      const qty = parseFloat(qtyStr);
      if (Number.isNaN(qty) || qty <= 0) {
        alert('Количество должно быть числом больше 0');
        return;
      }
      const originalQty = parseFloat(String(work.service_quantity).replace(',', '.').trim());
      if (qty !== originalQty) {
        payload.service_quantity = qty;
      }
    }

    if (user.role === 'admin') {
      if (edited.building_id && edited.building_id !== work.building?.id) {
        payload.building_id = parseInt(edited.building_id);
      }
      if (edited.service_id && edited.service_id !== work.service?.id) {
        payload.service_id = parseInt(edited.service_id);
      }
      if (edited.user_id && edited.user_id !== work.created_by?.id) {
        payload.user_id = parseInt(edited.user_id);
      }

      // Материалы отправляем только если список действительно изменился,
      // чтобы бэкенд не пересчитывал цены из справочника при правках описания/даты/количества.
      const materialsPayload = (edited.materials || [])
        .filter(m => m.material_id && m.quantity)
        .map(m => ({ material_id: parseInt(m.material_id), quantity: parseFloat(String(m.quantity).replace(',', '.')) }));
      const originalMaterials = (work.materials || [])
        .map(m => ({ material_id: parseInt(m.material_id), quantity: parseFloat(String(m.quantity).replace(',', '.')) }));
      const materialsChanged = materialsPayload.length !== originalMaterials.length ||
        materialsPayload.some((m, idx) => {
          const orig = originalMaterials[idx];
          return !orig || m.material_id !== orig.material_id || m.quantity !== orig.quantity;
        });
      if (materialsChanged) {
        payload.materials = materialsPayload;
      }
    }

    if (Object.keys(payload).length === 0) {
      setEditMode(false);
      return;
    }

    try {
      await worksAPI.update(id, payload);
      setEditMode(false);
      loadWork();
    } catch (e) {
      const data = e.response?.data;
      let msg = 'Ошибка сохранения';
      if (data) {
        if (Array.isArray(data.detail)) {
          msg = data.detail.map(err => `${err.loc?.join('.') || 'field'} — ${err.msg}`).join('\n');
        } else if (typeof data.detail === 'string') {
          msg = data.detail;
        } else if (typeof data.detail === 'object' && data.detail !== null) {
          msg = JSON.stringify(data.detail, null, 2);
        } else if (typeof data === 'object' && data !== null) {
          msg = JSON.stringify(data, null, 2);
        }
      }
      alert(msg);
    }
  };

  const handleUploadPhotos = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    try {
      await worksAPI.uploadPhotos(id, files);
      loadWork();
    } catch { alert('Ошибка загрузки фото'); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const handleUploadFiles = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    try {
      await worksAPI.uploadFiles(id, files);
      loadWork();
    } catch { alert('Ошибка загрузки файлов'); }
    finally { setUploading(false); e.target.value = ''; }
  };

  if (loading) return (
    <div style={styles.center}>
      <div style={styles.spinner} />
      <p style={styles.loadingText}>Загрузка…</p>
    </div>
  );

  if (!work) return (
    <div style={styles.center}>
      <div style={{ fontSize: '48px', marginBottom: '12px' }}>📄</div>
      <p>Запись не найдена</p>
      <button onClick={() => navigate('/dashboard')} style={styles.backBtn}>← Назад</button>
    </div>
  );

  const photos = work.photos || [];
  const files = work.files || [];

  return (
    <div>
      <div style={styles.header}>
        <button onClick={() => navigate('/dashboard')} style={styles.backBtn}>← Назад</button>
        <div style={styles.headerActions}>
          {canEdit && (
            <button onClick={() => { if (editMode) { setEditMode(false); loadWork(); } else { setEditMode(true); } }} style={styles.secondaryBtn}>
              {editMode ? 'Отмена' : '✏️ Редактировать'}
            </button>
          )}
          {(user.role === 'admin' || user.role === 'director') && (
            <button onClick={handleDelete} disabled={deleting} style={styles.dangerBtn}>
              {deleting ? 'Удаление…' : '🗑 Удалить'}
            </button>
          )}
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div>
            <h1 style={styles.title}>Запись №{work.id}</h1>
            <p style={styles.meta}>Дата: <strong className="tabular-nums">{work.work_date}</strong> · Корпус: <strong>{work.building?.number}</strong></p>
          </div>
          <div style={styles.badge}>{work.service?.name}</div>
        </div>

        {work.request_id && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Заявка</h3>
            <Link to={`/requests/${work.request_id}`} style={styles.link}>
              Заявка №{work.request_id}
            </Link>
          </div>
        )}

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Описание</h3>
          {editMode ? (
            <textarea
              value={edited.description}
              onChange={e => setEdited({ ...edited, description: e.target.value })}
              style={{ ...styles.input, minHeight: '80px', resize: 'vertical' }}
              rows={3}
            />
          ) : (
            <p style={styles.description}>{work.description || '—'}</p>
          )}
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Подрядчик</h3>
          <p style={styles.text}>{work.created_by?.full_name || work.created_by?.username}</p>
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Количество</h3>
          <p style={styles.text}>{work.service_quantity} {work.service?.unit || ''}</p>
        </div>

        {editMode && (
          <div style={styles.row}>
            <div style={styles.field}>
              <label style={styles.label}>Дата работы</label>
              <input type="date" value={edited.work_date} onChange={e => setEdited({ ...edited, work_date: e.target.value })} style={styles.input} />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Количество</label>
              <input type="number" min="0" step="0.01" value={edited.service_quantity} onChange={e => setEdited({ ...edited, service_quantity: e.target.value })} style={styles.input} />
            </div>
          </div>
        )}

        {editMode && user.role === 'admin' && (
          <div style={styles.row}>
            <div style={styles.field}>
              <label style={styles.label}>Корпус</label>
              <select value={edited.building_id} onChange={e => setEdited({ ...edited, building_id: e.target.value })} style={styles.input}>
                <option value="">Выберите корпус</option>
                {buildings.map(b => <option key={b.id} value={b.id}>{b.number} — {b.name}</option>)}
              </select>
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Вид работ</label>
              <select value={edited.service_id} onChange={e => setEdited({ ...edited, service_id: e.target.value })} style={styles.input}>
                <option value="">Выберите вид работ</option>
                {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Подрядчик</label>
              <select value={edited.user_id} onChange={e => setEdited({ ...edited, user_id: e.target.value })} style={styles.input}>
                <option value="">Выберите подрядчика</option>
                {contractors.map(u => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
              </select>
            </div>
          </div>
        )}

        {editMode && user.role === 'admin' && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Материалы</h3>
            {(edited.materials || []).map((m, idx) => (
              <div key={idx} style={{ ...styles.row, alignItems: 'flex-end' }}>
                <div style={{ ...styles.field, flex: 2 }}>
                  <label style={styles.label}>Материал</label>
                  <select value={m.material_id} onChange={e => {
                    const value = parseInt(e.target.value);
                    setEdited({ ...edited, materials: edited.materials.map((item, i) => i === idx ? { ...item, material_id: value } : item) });
                  }} style={styles.input}>
                    <option value="">Выберите материал</option>
                    {allMaterials.map(mat => <option key={mat.id} value={mat.id}>{mat.name} ({mat.unit})</option>)}
                  </select>
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>Кол-во</label>
                  <input type="number" min="0" step="0.01" value={m.quantity} onChange={e => {
                    setEdited({ ...edited, materials: edited.materials.map((item, i) => i === idx ? { ...item, quantity: e.target.value } : item) });
                  }} style={styles.input} />
                </div>
                <button onClick={() => setEdited({ ...edited, materials: edited.materials.filter((_, i) => i !== idx) })} style={styles.dangerBtn}>Удалить</button>
              </div>
            ))}
            <button onClick={() => setEdited({ ...edited, materials: [...edited.materials, { material_id: '', quantity: '' }] })} style={styles.secondaryBtn}>+ Добавить материал</button>
          </div>
        )}

        {editMode && (
          <div style={{ marginBottom: '16px' }}>
            <button onClick={handleUpdateWork} style={styles.primaryBtn}>💾 Сохранить изменения</button>
          </div>
        )}

        {user.role !== 'contractor' && (
        <div style={styles.totalsGrid}>
          <div style={styles.totalCard}>
            <div style={styles.totalLabel}>Сумма работ</div>
            <div style={styles.totalValue} className="tabular-nums">
              {parseFloat(work.service_total_price || 0).toFixed(2)}
            </div>
            {user.role === 'admin' && (
              <button onClick={() => {
                const val = prompt('Новая цена за ед.:', work.service_unit_price || '');
                if (val !== null) handlePriceEdit('service', val);
              }} style={styles.editLink}>Изменить</button>
            )}
          </div>
          <div style={styles.totalCard}>
            <div style={styles.totalLabel}>Сумма материалов</div>
            <div style={styles.totalValue} className="tabular-nums">
              {parseFloat(work.materials_total_price || 0).toFixed(2)}
            </div>
          </div>
          <div style={{ ...styles.totalCard, background: '#eff6ff', borderColor: '#bfdbfe' }}>
            <div style={styles.totalLabel}>Общая сумма</div>
            <div style={{ ...styles.totalValue, color: '#1e40af' }} className="tabular-nums">
              {parseFloat(work.total_price || 0).toFixed(2)}
            </div>
          </div>
        </div>
        )}

        {work.materials && work.materials.length > 0 && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Материалы</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th>Наименование</th>
                    <th style={{ textAlign: 'center' }}>Кол-во</th>
                    {user.role === 'admin' && (
                      <>
                        <th style={{ textAlign: 'right' }}>Цена</th>
                        <th style={{ textAlign: 'right' }}>Сумма</th>
                        <th style={{ textAlign: 'right' }}>Действие</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {work.materials.map((m, idx) => (
                    <tr key={idx}>
                      <td>{m.name || '—'}</td>
                      <td style={{ textAlign: 'center' }} className="tabular-nums">{m.quantity}</td>
                      {user.role === 'admin' && (
                        <>
                          <td style={{ textAlign: 'right' }} className="tabular-nums">{parseFloat(m.unit_price || 0).toFixed(2)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }} className="tabular-nums">{parseFloat(m.total_price || 0).toFixed(2)}</td>
                          <td style={{ textAlign: 'right' }}>
                            <button onClick={() => {
                              const val = prompt('Новая цена за ед.:', m.unit_price || '');
                              if (val !== null) handlePriceEdit('material', val, m.material_id);
                            }} style={styles.smallLink}>Изменить</button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div style={styles.card}>
        <div style={styles.sectionHeader}>
          <h3 style={styles.sectionTitle}>Фотографии <span style={styles.count}>({photos.length})</span></h3>
          {canUpload && (
            <label style={styles.uploadLabel}>
              <input type="file" accept="image/*" multiple onChange={handleUploadPhotos} ref={photoInputRef} style={{ display: 'none' }} />
              <span style={styles.uploadBtn}>{uploading ? 'Загрузка…' : '+ Добавить фото'}</span>
            </label>
          )}
        </div>
        {photos.length > 0 && (
          <div style={styles.gallery}>
            {photos.map((photo) => (
              <div key={photo.id} style={styles.galleryItem}>
                <img
                  src={photo.url}
                  alt={`Фото ${photo.id}`}
                  style={styles.galleryImg}
                  onClick={() => setLightbox(photo)}
                  loading="lazy"
                />
                {(user.role === 'admin' || user.role === 'director') && (
                  <button onClick={() => handleDeletePhoto(photo.id)} style={styles.galleryDelete} aria-label="Удалить фото">×</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={styles.card}>
        <div style={styles.sectionHeader}>
          <h3 style={styles.sectionTitle}>Файлы <span style={styles.count}>({files.length})</span></h3>
          {canUpload && (
            <label style={styles.uploadLabel}>
              <input type="file" multiple onChange={handleUploadFiles} ref={fileInputRef} style={{ display: 'none' }} />
              <span style={styles.uploadBtn}>{uploading ? 'Загрузка…' : '+ Добавить файл'}</span>
            </label>
          )}
        </div>
        {files.length > 0 && (
          <div style={styles.fileList}>
            {files.map((file) => (
              <div key={file.id} style={styles.fileItem}>
                <a href={file.url} download={file.original_name} style={styles.fileLink} title={file.original_name}>
                  <span style={styles.fileIcon}>📄</span>
                  <span style={styles.fileName}>{file.original_name}</span>
                  <span style={styles.fileSize} className="tabular-nums">{formatBytes(file.size)}</span>
                </a>
                {(user.role === 'admin' || user.role === 'director') && (
                  <button onClick={() => handleDeleteFile(file.id)} style={styles.fileDelete} aria-label={`Удалить ${file.original_name}`}>×</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {lightbox && (
        <div style={styles.lightbox} onClick={() => setLightbox(null)}>
          <img src={lightbox.url} alt="Просмотр" style={styles.lightboxImg} />
          <button style={styles.lightboxClose} onClick={() => setLightbox(null)} aria-label="Закрыть">×</button>
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes) return '—';
  const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

const styles = {
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', color: '#6b7280', fontSize: '16px' },
  spinner: { width: '40px', height: '40px', border: '3px solid #e5e7eb', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '16px' },
  loadingText: { fontSize: '15px', color: '#6b7280' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  backBtn: { padding: '8px 16px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' },
  headerActions: { display: 'flex', gap: '10px' },
  dangerBtn: { padding: '8px 16px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' },
  secondaryBtn: { padding: '8px 16px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' },
  primaryBtn: { padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' },
  card: { background: '#fff', borderRadius: '12px', padding: '24px', marginBottom: '20px', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' },
  title: { fontSize: '20px', fontWeight: 700, letterSpacing: '-0.025em', margin: 0 },
  meta: { fontSize: '14px', color: '#6b7280', margin: '4px 0 0' },
  badge: { padding: '6px 14px', background: '#eff6ff', color: '#1d4ed8', borderRadius: '9999px', fontSize: '13px', fontWeight: 600 },
  link: { color: '#2563eb', textDecoration: 'none', fontSize: '14px', fontWeight: 500 },
  section: { marginBottom: '20px' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
  sectionTitle: { fontSize: '15px', fontWeight: 600, color: '#111827', margin: 0 },
  description: { fontSize: '14px', color: '#374151', lineHeight: '1.6', margin: 0 },
  text: { fontSize: '14px', color: '#374151', margin: 0 },
  row: { display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' },
  field: { display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '180px' },
  label: { fontSize: '14px', fontWeight: 500, color: '#374151' },
  input: { padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', lineHeight: '20px', background: '#fff', width: '100%' },
  totalsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' },
  totalCard: { background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '16px', textAlign: 'center' },
  totalLabel: { fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', fontWeight: 500 },
  totalValue: { fontSize: '20px', fontWeight: 700, color: '#111827' },
  editLink: { marginTop: '8px', fontSize: '12px', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 },
  smallLink: { padding: '4px 10px', background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '13px', fontWeight: 500 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px', borderRadius: '8px', overflow: 'hidden' },
  count: { fontWeight: 400, fontSize: '14px', color: '#6b7280', marginLeft: '4px' },
  uploadLabel: { cursor: 'pointer' },
  uploadBtn: { display: 'inline-block', padding: '6px 12px', background: '#fff', color: '#2563eb', border: '1px solid #2563eb', borderRadius: '8px', fontSize: '13px', fontWeight: 500 },
  gallery: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '10px' },
  galleryItem: { position: 'relative', borderRadius: '10px', overflow: 'hidden', aspectRatio: '4/3', background: '#f3f4f6', cursor: 'pointer' },
  galleryImg: { width: '100%', height: '100%', objectFit: 'cover' },
  galleryDelete: { position: 'absolute', top: '6px', right: '6px', width: '26px', height: '26px', borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  fileList: { display: 'flex', flexDirection: 'column', gap: '8px' },
  fileItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb' },
  fileLink: { display: 'flex', alignItems: 'center', gap: '12px', color: '#374151', textDecoration: 'none', fontSize: '14px', flex: 1, overflow: 'hidden' },
  fileIcon: { fontSize: '20px', flexShrink: 0 },
  fileName: { fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  fileSize: { fontSize: '12px', color: '#6b7280', flexShrink: 0, marginLeft: 'auto' },
  fileDelete: { width: '28px', height: '28px', borderRadius: '6px', background: '#fef2f2', color: '#dc2626', border: 'none', cursor: 'pointer', fontSize: '16px', flexShrink: 0 },
  lightbox: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '24px', cursor: 'zoom-out' },
  lightboxImg: { maxWidth: '100%', maxHeight: '90vh', borderRadius: '8px', objectFit: 'contain' },
  lightboxClose: { position: 'fixed', top: '20px', right: '24px', width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', fontSize: '24px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
};
