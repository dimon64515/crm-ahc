import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { worksAPI, reportsAPI, buildingsAPI, servicesAPI, usersAPI, requestsAPI } from '../api';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('requests');

  useEffect(() => {
    if (!user || user.role === 'contractor') {
      navigate('/works/new');
    }
  }, [user, navigate]);

  if (!user) return null;

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>Дашборд</h1>
        <div style={styles.headerActions}>
          <span style={styles.userInfo}>{user.full_name || user.username}</span>
          <button onClick={logout} style={styles.logoutBtn}>Выход</button>
        </div>
      </div>

      <div style={styles.tabs} role="tablist" aria-label="Виды отчётов">
        <button
          role="tab"
          aria-selected={activeTab === 'requests'}
          style={{ ...styles.tab, ...(activeTab === 'requests' ? styles.activeTab : {}) }}
          onClick={() => setActiveTab('requests')}
        >
          Заявки
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'detailed'}
          style={{ ...styles.tab, ...(activeTab === 'detailed' ? styles.activeTab : {}) }}
          onClick={() => setActiveTab('detailed')}
        >
          Детальный отчёт
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'summary'}
          style={{ ...styles.tab, ...(activeTab === 'summary' ? styles.activeTab : {}) }}
          onClick={() => setActiveTab('summary')}
        >
          Сводный отчёт
        </button>
      </div>

      {activeTab === 'requests' && <RequestsDashboard />}
      {activeTab === 'detailed' && <DetailedReport />}
      {activeTab === 'summary' && <SummaryReport />}
    </div>
  );
}

function DetailedReport() {
  const { user } = useAuth();
  const [works, setWorks] = useState([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ date_from: '', date_to: '', building_id: '', service_id: '', user_id: '', search: '' });
  const [buildings, setBuildings] = useState([]);
  const [services, setServices] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [sortBy, setSortBy] = useState('created');
  const [sortOrder, setSortOrder] = useState('desc');
  const [loading, setLoading] = useState(false);
  const [totals, setTotals] = useState({ service_total: 0, materials_total: 0, total: 0 });
  const navigate = useNavigate();

  useEffect(() => { loadBuildings(); loadServices(); loadContractors(); loadWorks(); }, []);

  const loadBuildings = async () => { try { const res = await buildingsAPI.list({ is_active: true }); setBuildings(res.data); } catch (e) {} };
  const loadServices = async () => { try { const res = await servicesAPI.list(); setServices(res.data.items || []); } catch (e) {} };
  const loadContractors = async () => { try { const res = await usersAPI.list({ role: 'contractor' }); setContractors(res.data.items || []); } catch (e) {} };

  const loadWorks = async (params = {}) => {
    try {
      setLoading(true);
      const p = { ...filters, ...params, page, per_page: perPage, sort_by: sortBy, sort_order: sortOrder };
      const res = await worksAPI.list(p);
      setWorks(res.data.items || []);
      setTotal(res.data.total || 0);
      const t = (res.data.items || []).reduce((acc, w) => {
        const serviceTotal = (w.services || []).reduce((sum, s) => sum + parseFloat(s.total_price || 0), 0);
        return {
          service_total: acc.service_total + serviceTotal,
          materials_total: acc.materials_total + parseFloat(w.materials_total_price || 0),
          total: acc.total + parseFloat(w.total_price || 0),
        };
      }, { service_total: 0, materials_total: 0, total: 0 });
      setTotals(t);
    } catch (e) {} finally { setLoading(false); }
  };

  const handleFilter = () => { setPage(1); loadWorks({ page: 1 }); };
  const handleReset = () => { setFilters({ date_from: '', date_to: '', building_id: '', service_id: '', user_id: '', search: '' }); setPage(1); setTimeout(() => loadWorks({ page: 1, date_from: '', date_to: '', building_id: '', service_id: '', user_id: '', search: '' }), 0); };

  const handleExport = async () => {
    const res = await reportsAPI.export(filters);
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `works_report_${filters.date_from || 'all'}_${filters.date_to || 'all'}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handlePrint = async () => {
    try {
      const res = await reportsAPI.act(filters);
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `act_${filters.date_from || 'all'}_${filters.date_to || 'all'}.docx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert('Ошибка формирования акта: ' + (e.response?.data?.detail || 'нет данных для выбранных фильтров'));
    }
  };

  const handleInlinePriceEdit = async (workId, workServices) => {
    if (!workServices || workServices.length === 0) return;
    if (workServices.length === 1) {
      const val = prompt('Новая цена за ед. работы:', workServices[0].unit_price || '');
      if (val === null) return;
      try {
        await worksAPI.updatePrices(workId, { services: [{ service_id: workServices[0].service_id, unit_price: parseFloat(val) }] });
        loadWorks();
      } catch (e) { alert('Ошибка обновления цены'); }
    } else {
      const servicesPayload = [];
      for (const s of workServices) {
        const val = prompt(`Новая цена за ед. для «${s.name}»:`, s.unit_price || '');
        if (val === null) continue;
        servicesPayload.push({ service_id: s.service_id, unit_price: parseFloat(val) });
      }
      if (servicesPayload.length === 0) return;
      try {
        await worksAPI.updatePrices(workId, { services: servicesPayload });
        loadWorks();
      } catch (e) { alert('Ошибка обновления цены'); }
    }
  };

  const totalPages = Math.ceil(total / perPage) || 1;

  const sortIcon = (field) => {
    if (sortBy !== field) return '⇅';
    return sortOrder === 'asc' ? '↑' : '↓';
  };

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
    setTimeout(() => loadWorks({ page: 1 }), 0);
  };

  return (
    <div>
      <div style={styles.filters}>
        <input type="date" placeholder="С" value={filters.date_from} onChange={e => setFilters({ ...filters, date_from: e.target.value })} style={styles.filterInput} />
        <input type="date" placeholder="По" value={filters.date_to} onChange={e => setFilters({ ...filters, date_to: e.target.value })} style={styles.filterInput} />
        <select value={filters.building_id} onChange={e => setFilters({ ...filters, building_id: e.target.value })} style={styles.filterInput}>
          <option value="">Все корпуса</option>
          {buildings.map(b => <option key={b.id} value={b.id}>{b.number} — {b.name}</option>)}
        </select>
        <select value={filters.service_id} onChange={e => setFilters({ ...filters, service_id: e.target.value })} style={styles.filterInput}>
          <option value="">Все виды работ</option>
          {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filters.user_id} onChange={e => setFilters({ ...filters, user_id: e.target.value })} style={styles.filterInput}>
          <option value="">Все подрядчики</option>
          {contractors.map(u => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
        </select>
        <input type="text" placeholder="Поиск по описанию…" value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} style={styles.filterInput} />
        <button onClick={handleFilter} style={styles.filterBtn}>Применить</button>
        <button onClick={handleReset} style={styles.secondaryBtn}>Сбросить</button>
        <button onClick={handleExport} style={styles.exportBtn}>📥 Excel</button>
        <button onClick={handlePrint} style={styles.ghostBtn} className="no-print">🖨️ Печатная форма</button>
      </div>

      <div style={styles.statsRow}>
        <div style={styles.stats}>
          <span>Всего записей: <strong className="tabular-nums">{total}</strong></span>
          {loading && <span style={styles.loading}>Загрузка…</span>}
        </div>
        <div style={styles.perPage}>
          <span style={{ fontSize: '13px', color: '#6b7280' }}>На странице:</span>
          <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); setTimeout(() => loadWorks({ page: 1, per_page: Number(e.target.value) }), 0); }} style={{ ...styles.filterInput, minWidth: '70px', padding: '6px 10px' }}>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('date')}>Дата {sortIcon('date')}</th>
              <th>Корпус</th>
              <th>Подрядчик</th>
              <th>Вид работы</th>
              <th>Наименование</th>
              <th style={{ textAlign: 'center' }}>Ед.изм.</th>
              <th style={{ textAlign: 'center' }}>Кол-во</th>
              <th style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => toggleSort('price')}>Цена {sortIcon('price')}</th>
              <th style={{ textAlign: 'right' }}>Сумма работ</th>
              <th style={{ textAlign: 'right' }}>Сумма мат.</th>
              <th style={{ textAlign: 'right' }}>ИТОГО</th>
              <th style={{ textAlign: 'center' }}>Фото</th>
            </tr>
          </thead>
          <tbody>
            {works.map(w => {
              const serviceTotal = (w.services || []).reduce((sum, s) => sum + parseFloat(s.total_price || 0), 0);
              const serviceNames = (w.services || []).map(s => s.name).join(', ') || '—';
              return (
              <tr key={w.id} style={{ cursor: 'pointer' }} onClick={(e) => { if (!e.target.closest('button')) navigate(`/works/${w.id}`); }}>
                <td>{w.work_date}</td>
                <td>{w.building?.number}</td>
                <td>{w.created_by?.full_name || w.created_by?.username}</td>
                <td>{serviceNames}</td>
                <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={w.description}>{w.description}</td>
                <td style={{ textAlign: 'center' }}>{(w.services || []).map(s => s.unit).filter(Boolean).join(', ') || '—'}</td>
                <td style={{ textAlign: 'center' }} className="tabular-nums">{(w.services || []).map(s => s.quantity).join(', ') || '—'}</td>
                <td style={{ textAlign: 'right' }} className="tabular-nums">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                    <span>{(w.services || []).map(s => parseFloat(s.unit_price || 0).toFixed(2)).join(', ') || '—'}</span>
                    {user.role === 'admin' && (
                      <button onClick={(e) => { e.stopPropagation(); handleInlinePriceEdit(w.id, w.services); }} style={styles.inlineEditBtn} title="Изменить цену">✎</button>
                    )}
                  </div>
                </td>
                <td style={{ textAlign: 'right' }} className="tabular-nums">{serviceTotal.toFixed(2)}</td>
                <td style={{ textAlign: 'right' }} className="tabular-nums">{parseFloat(w.materials_total_price || 0).toFixed(2)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }} className="tabular-nums">{parseFloat(w.total_price || 0).toFixed(2)}</td>
                <td style={{ textAlign: 'center' }}>{w.photos_count}</td>
              </tr>
              );
            })}
            {works.length === 0 && !loading && (
              <tr><td colSpan={12} style={{ textAlign: 'center', color: '#6b7280', padding: '48px 16px' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
                <div>Нет данных для отображения</div>
                <div style={{ fontSize: '13px', marginTop: '4px' }}>Измените фильтры или создайте новую запись</div>
              </td></tr>
            )}
            {works.length > 0 && (
              <tr style={{ background: '#eff6ff', fontWeight: 600 }}>
                <td colSpan={8} style={{ textAlign: 'right', paddingRight: '16px' }}>ИТОГО по странице:</td>
                <td style={{ textAlign: 'right' }} className="tabular-nums">{totals.service_total.toFixed(2)}</td>
                <td style={{ textAlign: 'right' }} className="tabular-nums">{totals.materials_total.toFixed(2)}</td>
                <td style={{ textAlign: 'right' }} className="tabular-nums">{totals.total.toFixed(2)}</td>
                <td></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={styles.pagination}>
          <button disabled={page <= 1} onClick={() => { setPage(page - 1); loadWorks({ page: page - 1 }); }} style={styles.pageBtn}>← Назад</button>
          <span style={{ padding: '0 12px', fontSize: '14px', color: '#374151' }}>Страница {page} из {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => { setPage(page + 1); loadWorks({ page: page + 1 }); }} style={styles.pageBtn}>Вперёд →</button>
        </div>
      )}

    </div>
  );
}

function SummaryReport() {
  const [filters, setFilters] = useState({ date_from: '', date_to: '', building_id: '' });
  const [groupBy, setGroupBy] = useState('building');
  const [report, setReport] = useState(null);
  const [buildings, setBuildings] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { buildingsAPI.list({ is_active: true }).then(r => setBuildings(r.data)); }, []);

  const loadReport = async () => {
    setLoading(true);
    try { const res = await reportsAPI.summary({ ...filters, group_by: groupBy }); setReport(res.data); }
    catch (e) {} finally { setLoading(false); }
  };

  const handleExport = async () => {
    const res = await reportsAPI.exportSummary({ ...filters, group_by: groupBy });
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `works_summary_${groupBy}_${filters.date_from || 'all'}_${filters.date_to || 'all'}.xlsx`;
    a.click();
  };

  const groupLabels = { building: 'Корпус', service: 'Вид работы', contractor: 'Подрядчик', date: 'Дата' };

  return (
    <div>
      <div style={styles.filters}>
        <input type="date" placeholder="С" value={filters.date_from} onChange={e => setFilters({ ...filters, date_from: e.target.value })} style={styles.filterInput} />
        <input type="date" placeholder="По" value={filters.date_to} onChange={e => setFilters({ ...filters, date_to: e.target.value })} style={styles.filterInput} />
        <select value={filters.building_id} onChange={e => setFilters({ ...filters, building_id: e.target.value })} style={styles.filterInput}>
          <option value="">Все корпуса</option>
          {buildings.map(b => <option key={b.id} value={b.id}>{b.number}</option>)}
        </select>
        <select value={groupBy} onChange={e => setGroupBy(e.target.value)} style={styles.filterInput}>
          <option value="building">По корпусам</option>
          <option value="service">По видам работ</option>
          <option value="contractor">По подрядчикам</option>
          <option value="date">По датам</option>
        </select>
        <button onClick={loadReport} style={styles.filterBtn}>{loading ? 'Формирование…' : 'Сформировать'}</button>
        {report && <button onClick={handleExport} style={styles.exportBtn}>📥 Excel</button>}
      </div>

      {report && (
        <div>
          <div style={styles.stats}>
            <span>Всего работ: <strong className="tabular-nums">{report.totals?.works_count || 0}</strong></span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th>{groupLabels[groupBy]}</th>
                  <th>Кол-во работ</th>
                  <th style={{ textAlign: 'right' }}>Сумма работ</th>
                  <th style={{ textAlign: 'right' }}>Сумма мат.</th>
                  <th style={{ textAlign: 'right' }}>ИТОГО</th>
                </tr>
              </thead>
              <tbody>
                {(report.items || []).map((item, idx) => (
                  <tr key={idx}>
                    <td>{item.group_name}</td>
                    <td style={{ textAlign: 'center' }}>{item.works_count}</td>
                    <td style={{ textAlign: 'right' }} className="tabular-nums">{parseFloat(item.service_total || 0).toFixed(2)}</td>
                    <td style={{ textAlign: 'right' }} className="tabular-nums">{parseFloat(item.materials_total || 0).toFixed(2)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }} className="tabular-nums">{parseFloat(item.total || 0).toFixed(2)}</td>
                  </tr>
                ))}
                <tr style={{ background: '#eff6ff', fontWeight: 600 }}>
                  <td>ИТОГО</td>
                  <td style={{ textAlign: 'center' }}>{report.totals?.works_count || 0}</td>
                  <td style={{ textAlign: 'right' }} className="tabular-nums">{parseFloat(report.totals?.service_total || 0).toFixed(2)}</td>
                  <td style={{ textAlign: 'right' }} className="tabular-nums">{parseFloat(report.totals?.materials_total || 0).toFixed(2)}</td>
                  <td style={{ textAlign: 'right' }} className="tabular-nums">{parseFloat(report.totals?.total || 0).toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function RequestsDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterBuilding, setFilterBuilding] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const canPrint = user?.role === 'director' || user?.role === 'admin';

  const statusLabel = { new: 'Новая', in_progress: 'В работе', completed: 'Завершена' };
  const statusStyle = {
    new: { background: '#eff6ff', color: '#2563eb' },
    in_progress: { background: '#fffbeb', color: '#d97706' },
    completed: { background: '#f0fdf4', color: '#059669' },
  };
  const statusButtons = [
    { value: '', label: 'Все', color: '#374151', bg: '#f3f4f6' },
    { value: 'new', label: 'Новые', color: '#2563eb', bg: '#eff6ff' },
    { value: 'in_progress', label: 'В работе', color: '#d97706', bg: '#fffbeb' },
    { value: 'completed', label: 'Завершены', color: '#059669', bg: '#f0fdf4' },
  ];

  useEffect(() => {
    buildingsAPI.list({ is_active: true }).then(r => setBuildings(r.data || [])).catch(() => setBuildings([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterStatus) params.status = filterStatus;
      if (filterBuilding) params.building_id = filterBuilding;
      const res = await requestsAPI.list(params);
      setItems(res.data.items || []);
    } catch (e) {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterBuilding]);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const total = items.length;
    const newCount = items.filter(r => r.status === 'new').length;
    const inProgress = items.filter(r => r.status === 'in_progress').length;
    const completed = items.filter(r => r.status === 'completed').length;
    const overdue = items.filter(r => r.status !== 'completed' && r.due_date && new Date(r.due_date) < new Date(new Date().setHours(0,0,0,0))).length;
    return { total, new: newCount, in_progress: inProgress, completed, overdue };
  }, [items]);

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('ru-RU') : '—';
  const isOverdue = (r) => r.status !== 'completed' && r.due_date && new Date(r.due_date) < new Date(new Date().setHours(0,0,0,0));

  useEffect(() => {
    setSelectedIds([]);
  }, [items.length, filterStatus, filterBuilding]);

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

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <div style={{ ...dashStyles.card, background: '#f3f4f6' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#374151' }}>{counts.total}</div>
          <div style={{ fontSize: '13px', color: '#6b7280' }}>Всего заявок</div>
        </div>
        <div style={{ ...dashStyles.card, background: '#eff6ff' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#2563eb' }}>{counts.new}</div>
          <div style={{ fontSize: '13px', color: '#2563eb' }}>Новые</div>
        </div>
        <div style={{ ...dashStyles.card, background: '#fffbeb' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#d97706' }}>{counts.in_progress}</div>
          <div style={{ fontSize: '13px', color: '#d97706' }}>В работе</div>
        </div>
        <div style={{ ...dashStyles.card, background: '#f0fdf4' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#059669' }}>{counts.completed}</div>
          <div style={{ fontSize: '13px', color: '#059669' }}>Завершены</div>
        </div>
        <div style={{ ...dashStyles.card, background: counts.overdue ? '#fef2f2' : '#f3f4f6' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: counts.overdue ? '#dc2626' : '#374151' }}>{counts.overdue}</div>
          <div style={{ fontSize: '13px', color: counts.overdue ? '#dc2626' : '#6b7280' }}>Просрочено</div>
        </div>
      </div>

      <div style={styles.filters}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {statusButtons.map((s) => (
            <button
              key={s.value}
              onClick={() => setFilterStatus(s.value)}
              style={{
                padding: '8px 14px',
                borderRadius: '999px',
                border: '1px solid ' + (filterStatus === s.value ? s.color : 'transparent'),
                background: s.bg,
                color: s.color,
                fontSize: '14px',
                fontWeight: filterStatus === s.value ? 700 : 500,
                cursor: 'pointer',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <select
          value={filterBuilding}
          onChange={(e) => setFilterBuilding(e.target.value)}
          style={styles.filterInput}
        >
          <option value="">Все корпуса</option>
          {buildings.map(b => <option key={b.id} value={b.id}>{b.number} — {b.name}</option>)}
        </select>
        {canPrint && (
          <button
            onClick={handlePrint}
            disabled={selectedIds.length === 0}
            style={{
              ...styles.secondaryBtn,
              opacity: selectedIds.length === 0 ? 0.5 : 1,
              cursor: selectedIds.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            🖨 Печать ({selectedIds.length})
          </button>
        )}
        <button onClick={() => navigate('/requests')} style={styles.filterBtn}>Перейти к заявкам →</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>Загрузка…</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>Заявки не найдены</div>
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
                <th>Статус</th>
                <th>Исполнитель</th>
                <th>Срок</th>
                <th style={{ textAlign: 'right' }}>Действие</th>
              </tr>
            </thead>
            <tbody>
              {items.slice(0, 10).map((r) => (
                <tr key={r.id}>
                  {canPrint && (
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(r.id)}
                        onChange={() => toggleSelection(r.id)}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                  )}
                  <td className="tabular-nums">{r.id}</td>
                  <td>{r.building?.name || r.building?.number || '—'}</td>
                  <td style={{ maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.description}>{r.description || '—'}</td>
                  <td>
                    <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, ...statusStyle[r.status] }}>
                      {statusLabel[r.status] || r.status}
                    </span>
                  </td>
                  <td>{r.executor?.full_name || r.executor?.username || '—'}</td>
                  <td className="tabular-nums" style={isOverdue(r) ? { color: '#dc2626', fontWeight: 600 } : {}}>{formatDate(r.due_date)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button onClick={() => navigate(`/requests/${r.id}`)} style={styles.filterBtn}>Открыть</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length > 10 && (
            <div style={{ textAlign: 'center', marginTop: '12px', color: '#6b7280', fontSize: '13px' }}>Показано 10 из {items.length}. Все заявки — на странице «Заявки».</div>
          )}
        </div>
      )}
    </div>
  );
}

const dashStyles = {
  card: { padding: '16px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' },
};

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
  title: { fontSize: '24px', fontWeight: 700, letterSpacing: '-0.025em' },
  headerActions: { display: 'flex', alignItems: 'center', gap: '16px' },
  userInfo: { fontSize: '14px', color: '#6b7280' },
  logoutBtn: { padding: '8px 16px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' },
  tabs: { display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid #e5e7eb', paddingBottom: '1px' },
  tab: { padding: '10px 18px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '14px', fontWeight: 500, color: '#6b7280', borderRadius: '8px 8px 0 0', borderBottom: '2px solid transparent', marginBottom: '-1px' },
  activeTab: { color: '#2563eb', borderBottomColor: '#2563eb', background: '#eff6ff' },
  filters: { display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' },
  filterInput: { padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', background: '#fff', minWidth: '140px' },
  filterBtn: { padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' },
  secondaryBtn: { padding: '8px 16px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' },
  exportBtn: { padding: '8px 16px', background: '#fff', color: '#059669', border: '1px solid #059669', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' },
  ghostBtn: { padding: '8px 16px', background: 'transparent', color: '#6b7280', border: '1px solid transparent', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' },
  statsRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' },
  stats: { color: '#374151', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '16px' },
  perPage: { display: 'flex', alignItems: 'center', gap: '8px' },
  loading: { color: '#6b7280', fontSize: '14px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px', background: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  inlineEditBtn: { padding: '2px 6px', background: 'transparent', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '13px', lineHeight: 1 },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '24px', gap: '8px' },
  pageBtn: { padding: '8px 16px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' },
  printOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', overflow: 'auto' },
  printBox: { background: '#fff', padding: '40px', borderRadius: '8px', maxWidth: '1200px', width: '100%', maxHeight: '90vh', overflow: 'auto' },
  printHeader: { textAlign: 'center', marginBottom: '24px' },
  printTitle: { fontSize: '20px', fontWeight: 700, margin: '0 0 8px' },
  printMeta: { fontSize: '13px', color: '#374151', lineHeight: 1.6, margin: 0 },
  printSignature: { marginTop: '32px', fontSize: '14px', color: '#374151' },
};
