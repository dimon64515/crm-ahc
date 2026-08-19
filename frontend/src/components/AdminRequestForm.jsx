import { useState } from 'react';
import { requestsAPI } from '../api';

export default function AdminRequestForm({ request, buildings, services, users, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    building_id: request.building?.id || '',
    service_id: request.service?.id || '',
    description: request.description || '',
    status: request.status || 'new',
    assigned_to: request.executor?.id || '',
    due_date: request.due_date || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = {
        ...formData,
        building_id: formData.building_id ? Number(formData.building_id) : null,
        service_id: formData.service_id ? Number(formData.service_id) : null,
        assigned_to: formData.assigned_to ? Number(formData.assigned_to) : null,
      };
      await requestsAPI.updateAdmin(request.id, data);
      onSave();
    } catch (error) {
      console.error('Failed to update request:', error);
      alert('Ошибка при сохранении');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Корпус</label>
        <select
          name="building_id"
          value={formData.building_id}
          onChange={handleChange}
          className="w-full border rounded px-3 py-2"
          required
        >
          <option value="">Выберите корпус</option>
          {buildings.map(b => (
            <option key={b.id} value={b.id}>{b.number} {b.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Вид работы</label>
        <select
          name="service_id"
          value={formData.service_id}
          onChange={handleChange}
          className="w-full border rounded px-3 py-2"
        >
          <option value="">Не указан</option>
          {services.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Описание</label>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleChange}
          className="w-full border rounded px-3 py-2"
          rows="3"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Статус</label>
        <select
          name="status"
          value={formData.status}
          onChange={handleChange}
          className="w-full border rounded px-3 py-2"
        >
          <option value="new">Новая</option>
          <option value="in_progress">В работе</option>
          <option value="completed">Завершена</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Исполнитель</label>
        <select
          name="assigned_to"
          value={formData.assigned_to}
          onChange={handleChange}
          className="w-full border rounded px-3 py-2"
        >
          <option value="">Не назначен</option>
          {users.filter(u => ['contractor', 'director', 'admin'].includes(u.role)).map(u => (
            <option key={u.id} value={u.id}>{u.full_name || u.username}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Срок выполнения</label>
        <input
          type="date"
          name="due_date"
          value={formData.due_date}
          onChange={handleChange}
          className="w-full border rounded px-3 py-2"
        />
      </div>

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border rounded"
        >
          Отмена
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
        >
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
      </div>
    </form>
  );
}
