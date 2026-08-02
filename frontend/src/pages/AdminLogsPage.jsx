import { useState, useEffect } from 'react';
import { auditLogsAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';

const ACTION_LABELS = {
  created: 'Создан',
  updated: 'Изменён',
  deleted: 'Удалён',
  assigned: 'Назначен',
};

const ENTITY_LABELS = {
  request: 'Заявка',
  work: 'Отчёт',
  user: 'Пользователь',
};

export default function AdminLogsPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    entity_type: '',
    action: '',
    user_id: '',
    date_from: '',
    date_to: '',
  });
  const [selectedLog, setSelectedLog] = useState(null);

  useEffect(() => {
    if (user?.role !== 'admin') {
      return;
    }
    fetchLogs();
  }, [page, filters, user]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params = {
        page,
        per_page: 50,
        ...Object.fromEntries(
          Object.entries(filters).filter(([_, v]) => v !== '')
        ),
      };
      const response = await auditLogsAPI.list(params);
      setLogs(response.data.items);
      setTotal(response.data.total);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setPage(1);
  };

  const totalPages = Math.ceil(total / 50);

  if (!user || user.role !== 'admin') {
    return <div className="p-4">Доступ запрещён</div>;
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Журнал действий</h1>

      <div className="bg-white rounded shadow p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <select
            name="entity_type"
            value={filters.entity_type}
            onChange={handleFilterChange}
            className="border rounded px-3 py-2"
          >
            <option value="">Все типы сущностей</option>
            <option value="request">Заявки</option>
            <option value="work">Отчёты</option>
          </select>

          <select
            name="action"
            value={filters.action}
            onChange={handleFilterChange}
            className="border rounded px-3 py-2"
          >
            <option value="">Все действия</option>
            <option value="created">Создание</option>
            <option value="updated">Изменение</option>
            <option value="deleted">Удаление</option>
          </select>

          <input
            type="date"
            name="date_from"
            value={filters.date_from}
            onChange={handleFilterChange}
            className="border rounded px-3 py-2"
            placeholder="С"
          />

          <input
            type="date"
            name="date_to"
            value={filters.date_to}
            onChange={handleFilterChange}
            className="border rounded px-3 py-2"
            placeholder="По"
          />

          <button
            onClick={() => setFilters({ entity_type: '', action: '', user_id: '', date_from: '', date_to: '' })}
            className="bg-gray-500 text-white px-4 py-2 rounded"
          >
            Сбросить
          </button>
        </div>
      </div>

      <div className="bg-white rounded shadow overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left">Дата</th>
              <th className="px-4 py-2 text-left">Действие</th>
              <th className="px-4 py-2 text-left">Сущность</th>
              <th className="px-4 py-2 text-left">ID</th>
              <th className="px-4 py-2 text-left">Пользователь</th>
              <th className="px-4 py-2 text-left">Детали</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" className="px-4 py-8 text-center">Загрузка...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan="6" className="px-4 py-8 text-center">Нет записей</td></tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-t cursor-pointer hover:bg-gray-50" onClick={() => setSelectedLog(log)}>
                  <td className="px-4 py-2">{new Date(log.created_at).toLocaleString('ru-RU')}</td>
                  <td className="px-4 py-2">{ACTION_LABELS[log.action] || log.action}</td>
                  <td className="px-4 py-2">{ENTITY_LABELS[log.entity_type] || log.entity_type}</td>
                  <td className="px-4 py-2">{log.entity_id || '-'}</td>
                  <td className="px-4 py-2">{log.user?.full_name || log.user?.username}</td>
                  <td className="px-4 py-2 text-gray-500">Нажмите для деталей</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t flex justify-between items-center">
            <span>Всего: {total}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                Назад
              </button>
              <span className="px-3 py-1">{page} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                Вперёд
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedLog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" onClick={() => setSelectedLog(null)}>
          <div className="bg-white rounded shadow-lg max-w-4xl w-full max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-xl font-bold">Детали действия #{selectedLog.id}</h2>
              <button onClick={() => setSelectedLog(null)} className="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div><strong>Дата:</strong> {new Date(selectedLog.created_at).toLocaleString('ru-RU')}</div>
                <div><strong>Действие:</strong> {ACTION_LABELS[selectedLog.action] || selectedLog.action}</div>
                <div><strong>Сущность:</strong> {ENTITY_LABELS[selectedLog.entity_type] || selectedLog.entity_type}</div>
                <div><strong>ID сущности:</strong> {selectedLog.entity_id || '-'}</div>
                <div><strong>Пользователь:</strong> {selectedLog.user?.full_name || selectedLog.user?.username}</div>
              </div>

              {selectedLog.old_values && (
                <div className="mb-4">
                  <h3 className="font-bold mb-2">Было:</h3>
                  <pre className="bg-gray-100 p-3 rounded overflow-auto text-sm">{JSON.stringify(selectedLog.old_values, null, 2)}</pre>
                </div>
              )}

              {selectedLog.new_values && (
                <div>
                  <h3 className="font-bold mb-2">Стало:</h3>
                  <pre className="bg-gray-100 p-3 rounded overflow-auto text-sm">{JSON.stringify(selectedLog.new_values, null, 2)}</pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
