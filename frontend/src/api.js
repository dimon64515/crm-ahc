import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8090/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const getUploadUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  const apiBase = API_URL.replace(/\/api\/?$/, '');
  return `${apiBase}${url}`;
};

export default api;

export const authAPI = {
  login: (username, password) => api.post('/auth/login', { username, password }),
  me: () => api.get('/auth/me'),
};

export const buildingsAPI = {
  list: (params) => api.get('/buildings', { params }),
  create: (data) => api.post('/buildings', data),
  update: (id, data) => api.put(`/buildings/${id}`, data),
  remove: (id) => api.delete(`/buildings/${id}`),
  deactivate: (id) => api.delete(`/buildings/${id}`),
  activate: (id) => api.put(`/buildings/${id}/activate`),
};

export const usersAPI = {
  list: (params) => api.get('/users', { params }),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  remove: (id) => api.delete(`/users/${id}`),
};

export const servicesAPI = {
  list: (params) => api.get('/services', { params }),
  create: (data) => api.post('/services', data),
  update: (id, data) => api.put(`/services/${id}`, data),
  remove: (id) => api.delete(`/services/${id}`),
  import: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/services/import', formData, {
      headers: { 'Content-Type': undefined },
    });
  },
};

export const materialsAPI = {
  list: (search) => api.get('/materials', { params: { search } }),
  create: (data) => api.post('/materials', data),
  update: (id, data) => api.put(`/materials/${id}`, data),
  remove: (id) => api.delete(`/materials/${id}`),
  import: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/materials/import', formData, {
      headers: { 'Content-Type': undefined },
    });
  },
};

export const worksAPI = {
  create: (data) => api.post('/works', data),
  list: (params) => api.get('/works', { params }),
  get: (id) => api.get(`/works/${id}`),
  update: (id, data) => api.put(`/works/${id}`, data),
  remove: (id) => api.delete(`/works/${id}`),
  uploadPhotos: (id, files) => {
    const formData = new FormData();
    const valid = (files || []).filter((f) => f instanceof File);
    valid.forEach((f) => formData.append('files', f));
    return api.post(`/works/${id}/photos`, formData, {
      headers: { 'Content-Type': undefined },
    });
  },
  uploadFiles: (id, files) => {
    const formData = new FormData();
    const valid = (files || []).filter((f) => f instanceof File);
    valid.forEach((f) => formData.append('files', f));
    return api.post(`/works/${id}/files`, formData, {
      headers: { 'Content-Type': undefined },
    });
  },
  deletePhoto: (workId, photoId) => api.delete(`/works/${workId}/photos/${photoId}`),
  deleteFile: (workId, fileId) => api.delete(`/works/${workId}/files/${fileId}`),
  updatePrices: (id, data) => api.put(`/works/${id}/prices`, data),
};

export const reportsAPI = {
  summary: (params) => api.get('/reports/summary', { params }),
  export: (params) => api.get('/reports/export', { params, responseType: 'blob' }),
  exportSummary: (params) => api.get('/reports/summary/export', { params, responseType: 'blob' }),
  act: (params) => api.get('/reports/act', { params, responseType: 'blob' }),
};

export const backupsAPI = {
  list: () => api.get('/backups'),
  createFull: () => api.post('/backups/full'),
  createPhotos: ({ date_from, date_to, buildings, contractors }) => api.post('/backups/photos', null, {
    params: {
      date_from,
      date_to,
      building_ids: (buildings || []).map((b) => b.value).join(','),
      user_ids: (contractors || []).map((u) => u.value).join(','),
    },
  }),
  download: (id, part = 1) => api.get(`/backups/download/${id}?part=${part}`, { responseType: 'blob' }),
  remove: (id) => api.delete(`/backups/${id}`),
  delete: (id) => api.delete(`/backups/${id}`),
  upload: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/backups/upload', formData, { headers: { 'Content-Type': undefined } });
  },
  validate: (id) => api.post(`/backups/validate/${id}`),
  restoreInfo: (id) => api.post('/backups/restore', null, { params: { backup_id: id } }),
};

export const requestsAPI = {
  create: (data) => api.post('/requests', data),
  list: (params) => api.get('/requests', { params }),
  my: () => api.get('/requests/my'),
  get: (id) => api.get(`/requests/${id}`),
  take: (id) => api.put(`/requests/${id}/take`),
  assign: (id, userId, serviceId) => api.put(`/requests/${id}/assign`, { user_id: userId, service_id: serviceId }),
  complete: (id) => api.put(`/requests/${id}/complete`),
  extend: (id) => api.post(`/requests/${id}/extend`),
  print: (ids) => api.post('/requests/print', { ids }, { responseType: 'blob' }),
  update: (id, data) => api.put(`/requests/${id}`, data),
  uploadPhotos: (id, files, { onUploadProgress } = {}) => {
    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));
    return api.post(`/requests/${id}/photos`, formData, {
      headers: { 'Content-Type': undefined },
      onUploadProgress,
    });
  },
};

export const pushAPI = {
  getVapidPublicKey: () => api.get('/push/vapid-public-key'),
  subscribe: (data) => api.post('/push/subscribe', data),
  unsubscribe: (data) => api.delete('/push/unsubscribe', { data }),
};

export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}
