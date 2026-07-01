import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildingsAPI, requestsAPI } from '../api';

export default function RequestNewPage() {
  const navigate = useNavigate();
  const [buildings, setBuildings] = useState([]);
  const [buildingId, setBuildingId] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState('');

  useEffect(() => {
    buildingsAPI.list({ is_active: true }).then(r => setBuildings(r.data));
  }, []);

  const handlePhotosChange = (e) => {
    const selected = Array.from(e.target.files).slice(0, 5);
    setPhotos(selected);
    setPreviews(selected.map((file) => URL.createObjectURL(file)));
    setUploadProgress(0);
    setUploadStage('');
  };

  const removePhoto = (idx) => {
    const next = [...photos];
    const prev = [...previews];
    URL.revokeObjectURL(prev[idx]);
    next.splice(idx, 1);
    prev.splice(idx, 1);
    setPhotos(next);
    setPreviews(prev);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setUploadStage('Создание заявки…');
    try {
      const res = await requestsAPI.create({ building_id: parseInt(buildingId), description });
      const requestId = res.data.id;
      if (photos.length > 0) {
        setUploadStage('Загрузка фото…');
        await requestsAPI.uploadPhotos(requestId, photos, {
          onUploadProgress: (progressEvent) => {
            const percent = progressEvent.total
              ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
              : 0;
            setUploadProgress(percent);
          },
        });
      }
      navigate('/my-requests');
    } catch (err) {
      alert(err.response?.data?.detail || 'Ошибка создания заявки');
    } finally {
      setSubmitting(false);
      setUploadStage('');
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Новая заявка</h1>
      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.field}>
          <label style={styles.label}>Корпус</label>
          <select value={buildingId} onChange={e => setBuildingId(e.target.value)} required style={styles.input}>
            <option value="">Выберите корпус</option>
            {buildings.map(b => <option key={b.id} value={b.id}>{b.number} — {b.name}</option>)}
          </select>
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Описание</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} required minLength={5} style={{ ...styles.input, minHeight: 120 }} />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Фото (до 5)</label>
          <input type="file" accept="image/*" multiple
            onChange={handlePhotosChange} style={styles.input} disabled={submitting} />
          {previews.length > 0 && (
            <div style={styles.previewGrid}>
              {previews.map((src, idx) => (
                <div key={idx} style={styles.previewWrap}>
                  <img src={src} alt={`preview-${idx}`} style={styles.preview} />
                  {!submitting && (
                    <button type="button" onClick={() => removePhoto(idx)} style={styles.removeBtn}>×</button>
                  )}
                </div>
              ))}
            </div>
          )}
          {photos.length > 0 && <p style={styles.hint}>Выбрано фото: {photos.length}</p>}
          {submitting && uploadStage && (
            <div style={styles.progressBox}>
              <div style={styles.progressLabel}>{uploadStage} {uploadProgress > 0 ? `${uploadProgress}%` : ''}</div>
              <div style={styles.progressTrack}>
                <div style={{ ...styles.progressFill, width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}
        </div>
        <button type="submit" disabled={submitting} style={styles.button}>{submitting ? 'Создание…' : 'Создать заявку'}</button>
      </form>
    </div>
  );
}

const styles = {
  container: { maxWidth: 600, margin: '0 auto', padding: 24 },
  title: { fontSize: 22, fontWeight: 700, marginBottom: 20 },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 14, fontWeight: 500 },
  input: { padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14 },
  button: { padding: '12px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  previewGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 8, marginTop: 8 },
  previewWrap: { position: 'relative', width: '100%', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb' },
  preview: { width: '100%', height: '100%', objectFit: 'cover' },
  removeBtn: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%', border: 'none', background: '#ef4444', color: '#fff', fontSize: 16, lineHeight: 1, cursor: 'pointer' },
  hint: { fontSize: 13, color: '#6b7280', margin: '4px 0 0' },
  progressBox: { marginTop: 8 },
  progressLabel: { fontSize: 13, color: '#374151', marginBottom: 4 },
  progressTrack: { height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', background: '#2563eb', transition: 'width 0.2s ease' },
};
