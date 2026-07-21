import { useState, useEffect } from 'react';
import Select from 'react-select';
import { usersAPI, buildingsAPI, servicesAPI, materialsAPI, backupsAPI } from '../api';

const tabs = [
  { key: 'users', label: 'Пользователи' },
  { key: 'buildings', label: 'Корпуса' },
  { key: 'services', label: 'Виды работ' },
  { key: 'materials', label: 'Материалы' },
  { key: 'backups', label: 'Резервные копии' },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('users');

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>Настройки</h1>
      </div>

      <div style={styles.tabs} role="tablist" aria-label="Настройки">
        {tabs.map(t => (
          <button
            key={t.key}
            role="tab"
            aria-selected={activeTab === t.key}
            style={{ ...styles.tab, ...(activeTab === t.key ? styles.activeTab : {}) }}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'buildings' && <BuildingsTab />}
        {activeTab === 'services' && <ServicesTab />}
        {activeTab === 'materials' && <MaterialsTab />}
        {activeTab === 'backups' && <BackupsTab />}
      </div>
    </div>
  );
}

function UsersTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ username: '', full_name: '', email: '', phone: '', role: 'contractor', password: '' });

  useEffect(() => { load(); }, []);

  const load = async () => { setLoading(true); try { const res = await usersAPI.list(); setItems(res.data.items || []); } catch (e) {} finally { setLoading(false); } };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) await usersAPI.update(editing, form);
      else await usersAPI.create(form);
      setForm({ username: '', full_name: '', role: 'contractor', password: '' });
      setEditing(null);
      load();
    } catch (e) { alert(e.response?.data?.detail || 'Ошибка'); }
  };

  const handleDeactivate = async (id) => {
    if (!window.confirm('Деактивировать пользователя?')) return;
    try { await usersAPI.deactivate(id); load(); } catch (e) {}
  };

  return (
    <div>
      <form onSubmit={handleSubmit} style={styles.formInline}>
        <input placeholder="Логин" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} style={styles.input} required />
        <input placeholder="ФИО" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} style={styles.input} />
        <input type="email" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={styles.input} />
        <input placeholder="Телефон" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={styles.input} />
        <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={styles.input}>
          <option value="contractor">Подрядчик</option>
          <option value="comendant">Комендант</option>
          <option value="director">Директор</option>
          <option value="admin">Админ</option>
        </select>
        <input type="password" placeholder={editing ? 'Новый пароль (пусто = не менять)' : 'Пароль'} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} style={styles.input} required={!editing} />
        <button type="submit" style={styles.primaryBtn}>{editing ? 'Сохранить' : 'Добавить'}</button>
        {editing && <button type="button" onClick={() => { setEditing(null); setForm({ username: '', full_name: '', email: '', phone: '', role: 'contractor', password: '' }); }} style={styles.secondaryBtn}>Отмена</button>}
      </form>

      {loading ? <div style={styles.center}><div style={styles.spinner} /><p>Загрузка…</p></div> : (
        <table style={styles.table}>
          <thead><tr><th>Логин</th><th>ФИО</th><th>Email</th><th>Телефон</th><th>Роль</th><th>Статус</th><th style={{ textAlign: 'right' }}>Действия</th></tr></thead>
          <tbody>
            {items.map(u => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{u.full_name || '—'}</td>
                <td>{u.email || '—'}</td>
                <td>{u.phone || '—'}</td>
                <td><span style={roleBadge(u.role)}>{roleLabel(u.role)}</span></td>
                <td><span style={statusBadge(u.is_active)}>{u.is_active ? 'Активен' : 'Неактивен'}</span></td>
                <td style={{ textAlign: 'right' }}>
                  <button onClick={() => { setEditing(u.id); setForm({ username: u.username, full_name: u.full_name || '', email: u.email || '', phone: u.phone || '', role: u.role, password: '' }); }} style={styles.smallLink}>Ред.</button>
                  {u.is_active && <button onClick={() => handleDeactivate(u.id)} style={styles.smallDanger}>Деакт.</button>}
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#6b7280', padding: '48px' }}>Нет пользователей</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}

function BuildingsTab() {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ number: '', name: '', address: '', area: '' });

  useEffect(() => { load(); }, []);

  const load = async () => { try { const res = await buildingsAPI.list(); setItems(res.data || []); } catch (e) {} };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try { if (editing) await buildingsAPI.update(editing, form); else await buildingsAPI.create(form); setForm({ number: '', name: '', address: '', area: '' }); setEditing(null); load(); }
    catch (e) { alert(e.response?.data?.detail || 'Ошибка'); }
  };

  const handleDeactivate = async (id) => {
    if (!window.confirm('Деактивировать корпус?')) return;
    try { await buildingsAPI.deactivate(id); load(); } catch (e) {}
  };

  const handleActivate = async (id) => {
    if (!window.confirm('Активировать корпус?')) return;
    try { await buildingsAPI.activate(id); load(); } catch (e) {}
  };

  return (
    <div>
      <form onSubmit={handleSubmit} style={styles.formInline}>
        <input placeholder="Номер" value={form.number} onChange={e => setForm({ ...form, number: e.target.value })} style={styles.input} required />
        <input placeholder="Название" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={styles.input} />
        <input placeholder="Адрес" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} style={styles.input} />
        <input type="number" step="0.01" placeholder="Площадь (м²)" value={form.area} onChange={e => setForm({ ...form, area: e.target.value })} style={styles.input} />
        <button type="submit" style={styles.primaryBtn}>{editing ? 'Сохранить' : 'Добавить'}</button>
        {editing && <button type="button" onClick={() => { setEditing(null); setForm({ number: '', name: '', address: '', area: '' }); }} style={styles.secondaryBtn}>Отмена</button>}
      </form>
      <table style={styles.table}>
        <thead><tr><th>№</th><th>Название</th><th>Адрес</th><th>Площадь</th><th>Статус</th><th style={{ textAlign: 'right' }}>Действия</th></tr></thead>
        <tbody>
          {items.map(b => (
            <tr key={b.id} style={!b.is_active ? styles.inactiveRow : {}}>
              <td>{b.number}</td>
              <td>{b.name || '—'}</td>
              <td>{b.address || '—'}</td>
              <td className="tabular-nums">{b.area ? `${parseFloat(b.area).toFixed(1)} м²` : '—'}</td>
              <td><span style={statusBadge(b.is_active)}>{b.is_active ? 'Активен' : 'Неактивен'}</span></td>
              <td style={{ textAlign: 'right' }}>
                {b.is_active ? (
                  <>
                    <button onClick={() => { setEditing(b.id); setForm({ number: b.number, name: b.name || '', address: b.address || '', area: b.area || '' }); }} style={styles.smallLink}>Ред.</button>
                    <button onClick={() => handleDeactivate(b.id)} style={styles.smallDanger}>Деакт.</button>
                  </>
                ) : (
                  <button onClick={() => handleActivate(b.id)} style={styles.smallSuccess}>Актив.</button>
                )}
              </td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#6b7280', padding: '48px' }}>Нет корпусов</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function ServicesTab() {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', unit: '', price: '' });
  const [importResult, setImportResult] = useState(null);

  useEffect(() => { load(); }, []);

  const load = async () => { try { const res = await servicesAPI.list(); setItems(res.data.items || []); } catch (e) {} };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try { if (editing) await servicesAPI.update(editing, form); else await servicesAPI.create(form); setForm({ name: '', unit: '', price: '' }); setEditing(null); load(); }
    catch (e) { alert(e.response?.data?.detail || 'Ошибка'); }
  };

  const handleDeactivate = async (id) => {
    if (!window.confirm('Деактивировать вид работы?')) return;
    try { await servicesAPI.deactivate(id); load(); } catch (e) {}
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const res = await servicesAPI.import(file);
      setImportResult(res.data);
      load();
    } catch (err) {
      alert(err.response?.data?.detail || 'Ошибка импорта');
    }
    e.target.value = '';
  };

  return (
    <div>
      <form onSubmit={handleSubmit} style={styles.formInline}>
        <input placeholder="Название" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={styles.input} required />
        <input placeholder="Ед. изм." value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} style={styles.input} />
        <input type="number" step="0.01" placeholder="Базовая цена" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} style={styles.input} />
        <button type="submit" style={styles.primaryBtn}>{editing ? 'Сохранить' : 'Добавить'}</button>
        {editing && <button type="button" onClick={() => { setEditing(null); setForm({ name: '', unit: '', price: '' }); }} style={styles.secondaryBtn}>Отмена</button>}
        <label style={styles.importLabel}>
          <input type="file" accept=".xlsx" onChange={handleImport} style={{ display: 'none' }} />
          <span style={styles.importBtn}>📥 Импорт xlsx</span>
        </label>
      </form>

      {importResult && (
        <div style={importResult.errors > 0 ? styles.importWarn : styles.importOk}>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>{importResult.message}</div>
          {importResult.error_details.length > 0 && (
            <ul style={{ margin: '4px 0 0', paddingLeft: '16px', fontSize: '13px' }}>
              {importResult.error_details.map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          )}
          <button onClick={() => setImportResult(null)} style={styles.smallLink}>Закрыть</button>
        </div>
      )}

      <table style={styles.table}>
        <thead><tr><th>Название</th><th>Ед. изм.</th><th style={{ textAlign: 'right' }}>Цена</th><th>Статус</th><th style={{ textAlign: 'right' }}>Действия</th></tr></thead>
        <tbody>
          {items.map(s => (
            <tr key={s.id}>
              <td>{s.name}</td>
              <td>{s.unit || '—'}</td>
              <td style={{ textAlign: 'right' }} className="tabular-nums">{parseFloat(s.price || 0).toFixed(2)}</td>
              <td><span style={statusBadge(s.is_active)}>{s.is_active ? 'Активен' : 'Неактивен'}</span></td>
              <td style={{ textAlign: 'right' }}>
                <button onClick={() => { setEditing(s.id); setForm({ name: s.name, unit: s.unit || '', price: s.price || '' }); }} style={styles.smallLink}>Ред.</button>
                {s.is_active && <button onClick={() => handleDeactivate(s.id)} style={styles.smallDanger}>Деакт.</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MaterialsTab() {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', unit: '', price: '' });
  const [importResult, setImportResult] = useState(null);

  useEffect(() => { load(); }, []);

  const load = async () => { try { const res = await materialsAPI.list(); setItems(res.data.items || []); } catch (e) {} };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try { if (editing) await materialsAPI.update(editing, form); else await materialsAPI.create(form); setForm({ name: '', unit: '', price: '' }); setEditing(null); load(); }
    catch (e) { alert(e.response?.data?.detail || 'Ошибка'); }
  };

  const handleDeactivate = async (id) => {
    if (!window.confirm('Деактивировать материал?')) return;
    try { await materialsAPI.deactivate(id); load(); } catch (e) {}
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const res = await materialsAPI.import(file);
      setImportResult(res.data);
      load();
    } catch (err) {
      alert(err.response?.data?.detail || 'Ошибка импорта');
    }
    e.target.value = '';
  };

  return (
    <div>
      <form onSubmit={handleSubmit} style={styles.formInline}>
        <input placeholder="Название" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={styles.input} required />
        <input placeholder="Ед. изм." value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} style={styles.input} />
        <input type="number" step="0.01" placeholder="Базовая цена" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} style={styles.input} />
        <button type="submit" style={styles.primaryBtn}>{editing ? 'Сохранить' : 'Добавить'}</button>
        {editing && <button type="button" onClick={() => { setEditing(null); setForm({ name: '', unit: '', price: '' }); }} style={styles.secondaryBtn}>Отмена</button>}
        <label style={styles.importLabel}>
          <input type="file" accept=".xlsx" onChange={handleImport} style={{ display: 'none' }} />
          <span style={styles.importBtn}>📥 Импорт xlsx</span>
        </label>
      </form>

      {importResult && (
        <div style={importResult.errors > 0 ? styles.importWarn : styles.importOk}>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>{importResult.message}</div>
          {importResult.error_details.length > 0 && (
            <ul style={{ margin: '4px 0 0', paddingLeft: '16px', fontSize: '13px' }}>
              {importResult.error_details.map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          )}
          <button onClick={() => setImportResult(null)} style={styles.smallLink}>Закрыть</button>
        </div>
      )}

      <table style={styles.table}>
        <thead><tr><th>Название</th><th>Ед. изм.</th><th style={{ textAlign: 'right' }}>Цена</th><th>Статус</th><th style={{ textAlign: 'right' }}>Действия</th></tr></thead>
        <tbody>
          {items.map(m => (
            <tr key={m.id}>
              <td>{m.name}</td>
              <td>{m.unit || '—'}</td>
              <td style={{ textAlign: 'right' }} className="tabular-nums">{parseFloat(m.price || 0).toFixed(2)}</td>
              <td><span style={statusBadge(m.is_active)}>{m.is_active ? 'Активен' : 'Неактивен'}</span></td>
              <td style={{ textAlign: 'right' }}>
                <button onClick={() => { setEditing(m.id); setForm({ name: m.name, unit: m.unit || '', price: m.price || '' }); }} style={styles.smallLink}>Ред.</button>
                {m.is_active && <button onClick={() => handleDeactivate(m.id)} style={styles.smallDanger}>Деакт.</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BackupsTab() {
  const [backups, setBackups] = useState([]);
  const [filter, setFilter] = useState({ type: 'full', date_from: '', date_to: '', buildings: [], contractors: [] });
  const [creating, setCreating] = useState(false);
  const [buildings, setBuildings] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [restoreFile, setRestoreFile] = useState(null);
  const [restoreName, setRestoreName] = useState('');
  const [validateLoading, setValidateLoading] = useState(false);
  const [validateResult, setValidateResult] = useState(null);

  useEffect(() => { load(); loadBuildings(); loadContractors(); }, []);

  const load = async () => { try { const res = await backupsAPI.list(); setBackups(res.data.items || []); } catch (e) {} };
  const loadBuildings = async () => { try { const res = await buildingsAPI.list({ is_active: true }); setBuildings((res.data || []).map(b => ({ value: b.id, label: `${b.number} — ${b.name}` }))); } catch (e) {} };
  const loadContractors = async () => { try { const res = await usersAPI.list({ role: 'contractor', per_page: 1000 }); setContractors((res.data.items || []).map(u => ({ value: u.id, label: u.full_name || u.username }))); } catch (e) {} };

  const handleCreate = async () => {
    setCreating(true);
    try {
      if (filter.type === 'full') await backupsAPI.createFull();
      else if (filter.type === 'photos') await backupsAPI.createPhotos(filter);
      else { alert('Выбранный тип резервной копии не поддерживается'); setCreating(false); return; }
      load();
    } catch (e) { alert('Ошибка создания резервной копии'); }
    finally { setCreating(false); }
  };

  const handleDownload = async (backupId, part = 1) => {
    try {
      const res = await backupsAPI.download(backupId, part);
      const blob = new Blob([res.data], { type: 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${backupId}.part${part}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert('Ошибка скачивания архива');
    }
  };

  const handleDelete = async (backupId) => {
    if (!window.confirm('Удалить резервную копию?')) return;
    try { await backupsAPI.remove(backupId); load(); } catch (e) {}
  };

  const handleUpload = async (file) => {
    if (!file) return;
    try {
      setRestoreFile(file);
      setRestoreName(file.name.replace(/\.zip$/i, ''));
      await backupsAPI.upload(file);
      setValidateResult(null);
    } catch (e) {
      alert('Ошибка загрузки файла');
      setRestoreFile(null);
    }
  };

  const handleValidate = async () => {
    if (!restoreName) return;
    setValidateLoading(true);
    try {
      const res = await backupsAPI.validate(restoreName);
      setValidateResult(res.data);
    } catch (e) {
      setValidateResult({ valid: false, message: e.response?.data?.detail || 'Ошибка проверки' });
    } finally {
      setValidateLoading(false);
    }
  };

  const formatDate = (d) => { if (!d) return '—'; return new Date(d).toLocaleString('ru-RU'); };
  const formatSize = (bytes) => { if (!bytes) return '—'; const i = Math.floor(Math.log(bytes) / Math.log(1024)); return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${['Б','КБ','МБ','ГБ'][i]}`; };

  const selectStyles = {
    container: (base) => ({ ...base, minWidth: '200px', flex: 1 }),
    control: (base, state) => ({
      ...base,
      borderColor: state.isFocused ? '#2563eb' : '#d1d5db',
      boxShadow: state.isFocused ? '0 0 0 3px rgba(37,99,235,0.15)' : 'none',
      borderRadius: '8px',
      minHeight: '38px',
      fontSize: '14px',
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected ? '#2563eb' : state.isFocused ? '#eff6ff' : '#fff',
      color: state.isSelected ? '#fff' : '#374151',
      fontSize: '14px',
      padding: '8px 12px',
    }),
  };

  return (
    <div>
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Создать резервную копию</h3>
        <div style={{ ...styles.row, alignItems: 'flex-end' }}>
          <select value={filter.type} onChange={e => setFilter({ ...filter, type: e.target.value })} style={styles.input}>
            <option value="full">Полная копия (БД + файлы)</option>
            <option value="photos">Только фото</option>
          </select>
          <button onClick={handleCreate} disabled={creating} style={styles.primaryBtn}>
            {creating ? 'Создание…' : 'Создать'}
          </button>
        </div>
        {filter.type === 'photos' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <input type="date" placeholder="С" value={filter.date_from} onChange={e => setFilter({ ...filter, date_from: e.target.value })} style={styles.input} />
              <input type="date" placeholder="По" value={filter.date_to} onChange={e => setFilter({ ...filter, date_to: e.target.value })} style={styles.input} />
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Select
                isMulti
                options={buildings}
                value={filter.buildings}
                onChange={(val) => setFilter({ ...filter, buildings: val || [] })}
                placeholder="Корпуса"
                styles={selectStyles}
              />
              <Select
                isMulti
                options={contractors}
                value={filter.contractors}
                onChange={(val) => setFilter({ ...filter, contractors: val || [] })}
                placeholder="Подрядчики"
                styles={selectStyles}
              />
            </div>
          </div>
        )}
      </div>

      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Восстановление из бэкапа</h3>
        <div
          style={styles.dropZone}
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={(e) => { e.preventDefault(); handleUpload(e.dataTransfer.files[0]); }}
          onClick={() => document.getElementById('restore-upload')?.click()}
        >
          <input id="restore-upload" type="file" accept=".zip" style={{ display: 'none' }} onChange={e => handleUpload(e.target.files[0])} />
          <div style={{ fontSize: '24px', marginBottom: '6px' }}>📤</div>
          <div style={{ fontSize: '14px', color: '#374151' }}>
            {restoreFile ? restoreFile.name : 'Перетащите ZIP-часть бэкапа или нажмите для выбора'}
          </div>
        </div>
        {restoreFile && (
          <div style={{ marginTop: '12px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              placeholder="ID бэкапа (имя файла без .zip)"
              value={restoreName}
              onChange={e => setRestoreName(e.target.value)}
              style={styles.input}
            />
            <button onClick={handleValidate} disabled={validateLoading || !restoreName} style={styles.warningBtn}>
              {validateLoading ? 'Проверка…' : 'Проверить бэкап'}
            </button>
          </div>
        )}
        {validateResult && (
          <div style={{ marginTop: '12px', padding: '12px 16px', borderRadius: '8px', background: validateResult.valid ? '#f0fdf4' : '#fef2f2', color: validateResult.valid ? '#059669' : '#b91c1c' }}>
            <div style={{ fontWeight: 600, marginBottom: '6px' }}>{validateResult.valid ? 'Бэкап корректен' : 'Ошибка проверки'}</div>
            <div>{validateResult.message}</div>
            {validateResult.valid && (
              <div style={{ marginTop: '8px', fontSize: '13px', color: '#374151', background: '#f9fafb', padding: '8px', borderRadius: '6px' }}>
                <code>cd /home/dimon64515/projects/crm/backend && source venv/bin/activate && python scripts/restore_backup.py --backup-id {validateResult.backup_id} --yes</code>
              </div>
            )}
          </div>
        )}
      </div>

      <h3 style={styles.sectionTitle}>История</h3>
      {backups.length === 0 ? (
        <div style={styles.empty}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>📦</div>
          <div style={{ color: '#6b7280' }}>Нет резервных копий</div>
        </div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th>Тип</th>
              <th>Создана</th>
              <th style={{ textAlign: 'right' }}>Размер</th>
              <th>Частей</th>
              <th>Статус</th>
              <th style={{ textAlign: 'right' }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {backups.map(b => (
              <tr key={b.backup_id}>
                <td>
                  <span style={typeBadge(b.type)}>{b.type === 'full' ? 'Полная' : b.type === 'photos' ? 'Фото' : 'БД'}</span>
                </td>
                <td className="tabular-nums">{formatDate(b.created_at)}</td>
                <td style={{ textAlign: 'right' }} className="tabular-nums">{formatSize((b.size_mb || 0) * 1024 * 1024)}</td>
                <td style={{ textAlign: 'center' }}>{b.parts_count || 1}</td>
                <td><span style={statusBadge(b.status === 'completed')}>{b.status === 'completed' ? 'Готова' : b.status}</span></td>
                <td style={{ textAlign: 'right' }}>
                  {(b.parts_count || 1) > 1 ? (
                    <span>
                      {Array.from({ length: b.parts_count || 1 }, (_, i) => (
                        <button key={i} onClick={() => handleDownload(b.backup_id, i + 1)} style={styles.smallLink}>part{i + 1}</button>
                      ))}
                    </span>
                  ) : (
                    <button onClick={() => handleDownload(b.backup_id)} style={styles.smallLink}>Скачать</button>
                  )}
                  <button onClick={() => handleDelete(b.backup_id)} style={styles.smallDanger}>Удалить</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const roleLabel = (r) => ({ contractor: 'Подрядчик', comendant: 'Комендант', director: 'Директор', admin: 'Админ' }[r] || r);
const roleBadge = (r) => ({
  display: 'inline-block', padding: '3px 10px', borderRadius: '9999px', fontSize: '12px', fontWeight: 600,
  background: r === 'admin' ? '#fef3c7' : r === 'director' ? '#dbeafe' : r === 'comendant' ? '#f3e8ff' : '#d1fae5',
  color: r === 'admin' ? '#92400e' : r === 'director' ? '#1e40af' : r === 'comendant' ? '#7e22ce' : '#065f46',
});
const statusBadge = (active) => ({
  display: 'inline-block', padding: '3px 10px', borderRadius: '9999px', fontSize: '12px', fontWeight: 600,
  background: active ? '#d1fae5' : '#f3f4f6',
  color: active ? '#065f46' : '#6b7280',
});
const typeBadge = (type) => ({
  display: 'inline-block', padding: '3px 10px', borderRadius: '9999px', fontSize: '12px', fontWeight: 600,
  background: type === 'full' ? '#dbeafe' : type === 'photos' ? '#fef3c7' : '#e5e7eb',
  color: type === 'full' ? '#1e40af' : type === 'photos' ? '#92400e' : '#374151',
});

const styles = {
  header: { marginBottom: '20px' },
  title: { fontSize: '22px', fontWeight: 700, letterSpacing: '-0.025em' },
  tabs: { display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid #e5e7eb', paddingBottom: '1px', flexWrap: 'wrap' },
  tab: { padding: '10px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '14px', fontWeight: 500, color: '#6b7280', borderRadius: '8px 8px 0 0', borderBottom: '2px solid transparent', marginBottom: '-1px' },
  activeTab: { color: '#2563eb', borderBottomColor: '#2563eb', background: '#eff6ff' },
  section: { background: '#fff', borderRadius: '12px', padding: '20px', marginBottom: '20px', border: '1px solid #e5e7eb' },
  sectionTitle: { fontSize: '15px', fontWeight: 600, color: '#111827', margin: '0 0 12px' },
  formInline: { display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' },
  input: { padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', lineHeight: '20px', background: '#fff', minWidth: '140px', flex: '1 1 140px' },
  primaryBtn: { padding: '10px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  secondaryBtn: { padding: '10px 18px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' },
  importLabel: { cursor: 'pointer', flexShrink: 0 },
  importBtn: { display: 'inline-block', padding: '10px 18px', background: '#fff', color: '#059669', border: '1px solid #059669', borderRadius: '8px', fontSize: '14px', fontWeight: 500, whiteSpace: 'nowrap' },
  importOk: { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '14px', color: '#166534' },
  importWarn: { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '14px', color: '#92400e' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px', background: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  smallLink: { padding: '4px 10px', background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '13px', fontWeight: 500 },
  smallDanger: { padding: '4px 10px', background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '13px', fontWeight: 500 },
  smallSuccess: { padding: '4px 10px', background: 'none', border: 'none', color: '#059669', cursor: 'pointer', fontSize: '13px', fontWeight: 500 },
  inactiveRow: { backgroundColor: '#f9fafb', opacity: 0.7 },
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px', color: '#6b7280' },
  spinner: { width: '32px', height: '32px', border: '3px solid #e5e7eb', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '12px' },
  empty: { textAlign: 'center', padding: '48px 16px' },
  row: { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' },
  dropZone: { border: '2px dashed #d1d5db', borderRadius: '12px', padding: '24px', textAlign: 'center', cursor: 'pointer', background: '#f9fafb', transition: 'border-color 0.15s', marginTop: '8px' },
};
