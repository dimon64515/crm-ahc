import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildingsAPI, requestsAPI } from '../api';

export default function RequestNewPage() {
  const navigate = useNavigate();
  const [buildings, setBuildings] = useState([]);
  const [buildingId, setBuildingId] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const photoInputRef = useRef(null);

  useEffect(() => {
    buildingsAPI.list({ is_active: true }).then(r => setBuildings(r.data));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await requestsAPI.create({ building_id: parseInt(buildingId), description });
      const requestId = res.data.id;
      if (photos.length > 0) {
        await requestsAPI.uploadPhotos(requestId, photos);
      }
      navigate('/my-requests');
    } catch (err) {
      alert('Ошибка создания заявки');
    } finally {
      setSubmitting(false);
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
          <input type="file" accept="image/*" multiple ref={photoInputRef}
            onChange={e => setPhotos(Array.from(e.target.files).slice(0, 5))} style={styles.input} />
          {photos.length > 0 && <p>Выбрано фото: {photos.length}</p>}
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
};
