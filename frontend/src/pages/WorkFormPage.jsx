import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Select, { components } from 'react-select';
import AsyncSelect from 'react-select/async';
import { buildingsAPI, servicesAPI, materialsAPI, worksAPI } from '../api';

export default function WorkFormPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [buildings, setBuildings] = useState([]);
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [description, setDescription] = useState('');
  const [serviceQuantity, setServiceQuantity] = useState(1);
  const [servicePrice, setServicePrice] = useState('');
  const [serviceUnit, setServiceUnit] = useState('');
  const [serviceTotal, setServiceTotal] = useState(0);
  const [materials, setMaterials] = useState([{ id: 1, selected: null, quantity: 1, price: '', total: 0 }]);
  const [photos, setPhotos] = useState([]);
  const [workDate, setWorkDate] = useState(new Date().toISOString().split('T')[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [photoCounter, setPhotoCounter] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const photoInputRef = useRef(null);

  useEffect(() => { loadBuildings(); loadDraft(); }, []);

  // beforeunload: предупреждение при уходе с несохранённой формой
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (selectedBuilding || selectedService || description || photos.length) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [selectedBuilding, selectedService, description, photos]);

  // Ctrl+Enter — сохранить форму
  const formRef = useRef(null);
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    setServiceTotal(parseFloat(serviceQuantity || 0) * parseFloat(servicePrice || 0));
  }, [serviceQuantity, servicePrice]);

  useEffect(() => {
    const total = materials.reduce((sum, m) => sum + parseFloat(m.total || 0), 0);
    // materials total updated inline
  }, [materials]);

  useEffect(() => {
    const timer = setInterval(() => { saveDraft(); }, 30000);
    return () => clearInterval(timer);
  });

  const loadBuildings = async () => {
    try {
      const res = await buildingsAPI.list({ is_active: true });
      const opts = (res.data || []).map(b => ({ value: b.id, label: b.name || '' }));
      setBuildings(opts);
    } catch (e) {}
  };

  const isAdmin = user?.role === 'admin';

  const loadServices = useCallback(async (input) => {
    try {
      const res = await servicesAPI.list(input);
      return (res.data.items || []).map(s => ({ value: s.id, label: s.name, price: s.price, unit: s.unit }));
    } catch (e) { return []; }
  }, []);

  const loadMaterials = useCallback(async (input) => {
    try {
      const res = await materialsAPI.list(input);
      return (res.data.items || []).map(m => ({ value: m.id, label: `${m.name}${m.unit ? ` (${m.unit})` : ''}`, price: m.price, unit: m.unit }));
    } catch (e) { return []; }
  }, []);

  const addMaterialRow = () => {
    setMaterials([...materials, { id: Date.now(), selected: null, quantity: 1, price: '', total: 0 }]);
  };

  const checkDuplicateMaterials = () => {
    const selected = materials.filter(m => m.selected).map(m => m.selected.value);
    const duplicates = selected.filter((item, index) => selected.indexOf(item) !== index);
    return duplicates.length > 0;
  };
  const removeMaterialRow = (id) => { if (materials.length <= 1) return; setMaterials(materials.filter(m => m.id !== id)); };
  const updateMaterial = (id, updates) => {
    setMaterials(prev => prev.map(m => {
      if (m.id !== id) return m;
      const updated = { ...m, ...updates };
      updated.total = parseFloat(updated.quantity || 0) * parseFloat(updated.price || 0);
      return updated;
    }));
  };

  const getMaterialsTotal = () => materials.reduce((sum, m) => sum + parseFloat(m.total || 0), 0);
  const getGrandTotal = () => serviceTotal + getMaterialsTotal();

  const handlePhotoDrop = (e) => { e.preventDefault(); setIsDragging(false); const dropped = Array.from(e.dataTransfer.files); console.log('[WorkForm] dropped', dropped.length, 'files'); handlePhotos(dropped); };
  const handlePhotos = (fileList) => {
    const arr = Array.from(fileList || []);
    console.log('[WorkForm] handlePhotos', arr.length, 'items:', arr.map(f => ({ name: f.name, type: f.type, size: f.size, isFile: f instanceof File })));
    const total = [...photos, ...arr].length;
    if (total > 20) { setError(`Максимум 20 фотографий (выбрано ${total})`); return; }
    setPhotos(prev => [...prev, ...arr]);
    setPhotoCounter(total);
    setError('');
  };
  const removePhoto = (idx) => { setPhotos(prev => prev.filter((_, i) => i !== idx)); setPhotoCounter(prev => prev - 1); };



  const saveDraft = () => {
    const draft = { selectedBuilding, selectedService, description, serviceQuantity, servicePrice, workDate };
    localStorage.setItem('work_draft', JSON.stringify(draft));
  };
  const loadDraft = () => {
    const raw = localStorage.getItem('work_draft');
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      setDescription(d.description || '');
      setServiceQuantity(d.serviceQuantity || 1);
      setServicePrice(d.servicePrice || '');
      setWorkDate(d.workDate || new Date().toISOString().split('T')[0]);
    } catch (e) {}
  };

  const formatError = (err) => {
    if (!err) return 'Ошибка сохранения';
    if (typeof err === 'string') return translatePydanticError(err);
    if (Array.isArray(err)) {
      return err.map(e => {
        if (typeof e === 'string') return translatePydanticError(e);
        if (e.msg) return translatePydanticError(e.msg);
        return JSON.stringify(e);
      }).join('; ');
    }
    if (err.detail) return formatError(err.detail);
    if (err.message) return err.message;
    return JSON.stringify(err);
  };

  const translatePydanticError = (msg) => {
    const map = {
      'String should have at least 5 characters': 'Описание должно быть не менее 5 символов',
      'Input should be greater than 0': 'Значение должно быть больше 0',
      'Input should be a valid decimal': 'Введите корректное число',
      'Date should be in the past': 'Дата должна быть в прошлом или сегодня',
      'Field required': 'Обязательное поле не заполнено',
    };
    for (const [en, ru] of Object.entries(map)) {
      if (msg.includes(en)) return ru;
    }
    return msg;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedBuilding || !selectedService) { setError('Выберите корпус и вид работы'); return; }
    if (photos.length > 20) { setError(`Максимум 20 фотографий (загружено ${photos.length})`); return; }
    if (photos.length === 0) { setError('Загрузите хотя бы одну фотографию'); return; }
    if (checkDuplicateMaterials()) { setError('Материалы не должны дублироваться'); return; }

    // Фронтенд-валидация совместно с бэкендом
    const desc = (description || '').trim();
    if (desc.length < 5) { setError('Описание должно быть не менее 5 символов'); return; }

    const qty = parseFloat(serviceQuantity);
    if (!qty || qty <= 0) { setError('Количество работы должно быть больше 0'); return; }

    const today = new Date().toISOString().split('T')[0];
    if (workDate > today) { setError('Дата работы не может быть в будущем'); return; }

    const selectedMats = materials.filter(m => m.selected);
    for (const m of selectedMats) {
      const mq = parseFloat(m.quantity);
      if (!mq || mq <= 0) {
        setError(`Количество материала «${m.selected.label}» должно быть больше 0`);
        return;
      }
    }

    setSubmitting(true);
    setError('');

    try {
      // 1) Создаём работу через JSON
      const payload = {
        building_id: selectedBuilding.value,
        service_id: selectedService.value,
        description: desc,
        service_quantity: qty,
        work_date: workDate,
        materials: selectedMats.map(m => ({
          material_id: m.selected.value,
          quantity: parseFloat(m.quantity),
        })),
      };

      console.log('[WorkForm] payload:', payload);
      const res = await worksAPI.create(payload);
      const workId = res.data.id;
      console.log('[WorkForm] created work id:', workId);

      // 2) Загружаем фото отдельно
      if (photos.length > 0) {
        console.log('[WorkForm] uploading', photos.length, 'photos');
        await worksAPI.uploadPhotos(workId, photos);
      }

      localStorage.removeItem('work_draft');
      setSelectedBuilding(null);
      setSelectedService(null);
      setDescription('');
      setServiceQuantity(1);
      setServicePrice('');
      setServiceTotal(0);
      setMaterials([{ id: 1, selected: null, quantity: 1, price: '', total: 0 }]);
      setPhotos([]);
      setPhotoCounter(0);
    } catch (err) {
      console.error('[WorkForm] save error:', err);
      let msg = 'Ошибка сохранения';
      try {
        const detail = err.response?.data;
        console.error('[WorkForm] error detail:', detail);
        msg = formatError(detail) || msg;
      } catch (_) {}
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const selectStyles = {
    control: (base, state) => ({
      ...base,
      borderColor: state.isFocused ? '#2563eb' : '#d1d5db',
      boxShadow: state.isFocused ? '0 0 0 3px rgba(37,99,235,0.15)' : 'none',
      borderRadius: '8px',
      minHeight: '40px',
      fontSize: '14px',
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected ? '#2563eb' : state.isFocused ? '#eff6ff' : '#fff',
      color: state.isSelected ? '#fff' : '#374151',
      fontSize: '14px',
      padding: '10px 12px',
    }),
    placeholder: (base) => ({ ...base, color: '#9ca3af' }),
  };

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>Новая запись о работе</h1>
        {photoCounter > 0 && (
          <span style={styles.photoBadge}>{photoCounter}/20 фото</span>
        )}
      </div>

      {error && (
        <div role="alert" style={styles.error}>{error}</div>
      )}

      <form ref={formRef} id="work-form" onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.row}>
          <div style={styles.field}>
            <label htmlFor="work_date" style={styles.label}>Дата работы <span style={styles.required}>*</span></label>
            <input id="work_date" type="date" value={workDate} onChange={e => setWorkDate(e.target.value)} style={styles.input} required />
          </div>
          <div style={styles.field}>
            <label htmlFor="building" style={styles.label}>Корпус <span style={styles.required}>*</span></label>
            <Select
              id="building"
              options={buildings}
              value={selectedBuilding}
              onChange={setSelectedBuilding}
              placeholder="Выберите корпус…"
              styles={selectStyles}
            />
          </div>
        </div>

        <div style={styles.field}>
          <label htmlFor="service" style={styles.label}>Вид работы <span style={styles.required}>*</span></label>
          <AsyncSelect
            id="service"
            cacheOptions
            defaultOptions
            loadOptions={loadServices}
            value={selectedService}
            onChange={(val) => { setSelectedService(val); setServiceUnit(val?.unit || ''); if (val?.price !== undefined) setServicePrice(val.price.toFixed(2)); }}
            placeholder="Введите для поиска…"
            styles={selectStyles}
          />
          {serviceUnit && (
            <div style={styles.serviceMeta}>Ед. изм.: <strong>{serviceUnit}</strong></div>
          )}
        </div>

        <div style={styles.field}>
          <label htmlFor="quantity" style={styles.label}>Количество <span style={styles.required}>*</span></label>
          <input id="quantity" type="number" min="0" step="0.01" value={serviceQuantity} onChange={e => setServiceQuantity(e.target.value)} style={styles.input} />
        </div>

        <div style={styles.field}>
          <label htmlFor="description" style={styles.label}>Описание работы</label>
          <textarea
            id="description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            style={{ ...styles.input, minHeight: '80px', resize: 'vertical' }}
            placeholder="Подробное описание выполненных работ…"
            rows={3}
          />
        </div>

        {isAdmin && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Стоимость работы</h3>
          <div style={styles.row}>
            <div style={styles.field}>
              <label htmlFor="price" style={styles.label}>Цена за ед.</label>
              <input id="price" type="number" min="0" step="0.01" value={servicePrice} onChange={e => setServicePrice(e.target.value)} style={styles.input} placeholder="0.00" />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Сумма</label>
              <div style={styles.totalBox} className="tabular-nums">{serviceTotal.toFixed(2)}</div>
            </div>
          </div>
        </div>
        )}

        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>Материалы</h3>
            <button type="button" onClick={addMaterialRow} style={styles.addBtn}>+ Добавить</button>
          </div>
          {materials.map((m, idx) => (
            <div key={m.id} style={styles.materialRow}>
              <div style={{ flex: 2, minWidth: '200px' }}>
                <AsyncSelect
                  cacheOptions
                  defaultOptions
                  loadOptions={loadMaterials}
                  value={m.selected}
                  onChange={val => updateMaterial(m.id, { selected: val, price: val?.price !== undefined ? val.price.toFixed(2) : m.price })}
                  placeholder="Материал…"
                  styles={selectStyles}
                />
              </div>
              <div style={{ flex: 1, minWidth: '100px' }}>
                <input type="number" min="0" step="0.01" value={m.quantity} onChange={e => updateMaterial(m.id, { quantity: e.target.value })} style={styles.input} placeholder="Кол-во" />
              </div>
              {isAdmin && (
              <>
              <div style={{ flex: 1, minWidth: '100px' }}>
                <input type="number" min="0" step="0.01" value={m.price} onChange={e => updateMaterial(m.id, { price: e.target.value })} style={styles.input} placeholder="Цена" />
              </div>
              <div style={{ minWidth: '90px' }}>
                <div style={styles.totalBox} className="tabular-nums">{parseFloat(m.total || 0).toFixed(2)}</div>
              </div>
              </>
              )}
              <button type="button" onClick={() => removeMaterialRow(m.id)} style={styles.removeBtn} aria-label="Удалить материал" title="Удалить">×</button>
            </div>
          ))}
          {isAdmin && (
          <div style={styles.materialsTotal}>
            <span>Сумма материалов:</span>
            <strong className="tabular-nums">{getMaterialsTotal().toFixed(2)}</strong>
          </div>
          )}
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Фотографии <span style={styles.required}>*</span> <span style={styles.hint}>(до 20)</span></h3>
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handlePhotoDrop}
            onClick={() => photoInputRef.current?.click()}
            style={{ ...styles.dropZone, ...(isDragging ? styles.dropZoneActive : {}) }}
          >
            <input ref={photoInputRef} type="file" accept="image/*" multiple onChange={e => handlePhotos(e.target.files)} style={{ display: 'none' }} />
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>📷</div>
            <div style={{ fontSize: '14px', fontWeight: 500, color: '#374151' }}>
              {isDragging ? 'Отпустите для загрузки' : 'Перетащите фото или нажмите'}
            </div>
            <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
              {photoCounter}/20 загружено
            </div>
          </div>
          {photos.length > 0 && (
            <div style={styles.thumbnails}>
              {Array.from(photos).map((file, idx) => (
                <div key={idx} style={styles.thumb}>
                  <img src={URL.createObjectURL(file)} alt={`Фото ${idx + 1}`} style={styles.thumbImg} />
                  <button type="button" onClick={() => removePhoto(idx)} style={styles.thumbRemove} aria-label={`Удалить фото ${idx + 1}`}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {isAdmin && (
        <div style={styles.grandTotal}>
          <span>Общая сумма:</span>
          <strong className="tabular-nums" style={{ fontSize: '18px' }}>{getGrandTotal().toFixed(2)}</strong>
        </div>
        )}

        <div style={styles.actions}>
          <button type="submit" disabled={submitting} style={styles.submitBtn} aria-busy={submitting}>
            {submitting ? 'Сохранение…' : 'Сохранить запись'}
          </button>
          <button type="button" onClick={() => { localStorage.removeItem('work_draft'); window.location.reload(); }} style={styles.resetBtn}>
            Очистить форму
          </button>
        </div>
      </form>
    </div>
  );
}

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  title: { fontSize: '22px', fontWeight: 700, letterSpacing: '-0.025em' },
  photoBadge: { background: '#dbeafe', color: '#1d4ed8', padding: '6px 14px', borderRadius: '9999px', fontSize: '13px', fontWeight: 600 },
  error: { background: '#fef2f2', color: '#b91c1c', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px', border: '1px solid #fecaca' },
  form: { display: 'flex', flexDirection: 'column', gap: '20px' },
  row: { display: 'flex', gap: '16px', flexWrap: 'wrap' },
  field: { display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '180px' },
  label: { fontSize: '14px', fontWeight: 500, color: '#374151' },
  required: { color: '#dc2626' },
  input: {
    padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px',
    lineHeight: '20px', background: '#fff', transition: 'border-color 0.15s, box-shadow 0.15s', width: '100%',
  },
  section: { background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e5e7eb' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
  sectionTitle: { fontSize: '15px', fontWeight: 600, color: '#111827', margin: 0 },
  addBtn: { padding: '6px 12px', background: '#fff', color: '#2563eb', border: '1px solid #2563eb', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' },
  totalBox: { padding: '10px 12px', background: '#f9fafb', borderRadius: '8px', fontSize: '14px', fontWeight: 600, color: '#111827', border: '1px solid #e5e7eb' },
  materialRow: { display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap' },
  materialsTotal: { display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e5e7eb', fontSize: '14px', color: '#374151' },
  removeBtn: { width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: '8px', fontSize: '18px', cursor: 'pointer', flexShrink: 0 },
  dropZone: {
    border: '2px dashed #d1d5db', borderRadius: '12px', padding: '28px', textAlign: 'center',
    cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s', background: '#f9fafb',
  },
  dropZoneActive: { borderColor: '#2563eb', background: '#eff6ff' },
  thumbnails: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '10px', marginTop: '16px' },
  thumb: { position: 'relative', borderRadius: '8px', overflow: 'hidden', aspectRatio: '4/3', background: '#f3f4f6' },
  thumbImg: { width: '100%', height: '100%', objectFit: 'cover' },
  thumbRemove: { position: 'absolute', top: '4px', right: '4px', width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  fileList: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' },
  fileItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' },
  fileName: { fontSize: '14px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '400px' },
  fileRemove: { width: '28px', height: '28px', borderRadius: '6px', background: '#fef2f2', color: '#dc2626', border: 'none', cursor: 'pointer', fontSize: '16px', flexShrink: 0 },
  grandTotal: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', background: '#eff6ff', borderRadius: '12px', fontSize: '16px', fontWeight: 600, color: '#1e40af', border: '1px solid #bfdbfe' },
  actions: { display: 'flex', gap: '12px', flexWrap: 'wrap' },
  submitBtn: { padding: '12px 28px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: 600, cursor: 'pointer', flex: 1, minWidth: '180px' },
  resetBtn: { padding: '12px 28px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '10px', fontSize: '15px', fontWeight: 600, cursor: 'pointer', flex: 1, minWidth: '180px' },
  readOnlyInput: { background: '#f3f4f6', color: '#374151', cursor: 'default' },
  serviceMeta: { fontSize: '13px', color: '#6b7280', marginTop: '4px' },
  hint: { fontWeight: 400, fontSize: '13px', color: '#6b7280', marginLeft: '4px' },
};
