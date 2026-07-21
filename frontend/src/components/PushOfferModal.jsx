import React from 'react';
import { usePushSubscription } from '../hooks/usePushSubscription';

export default function PushOfferModal({ onClose }) {
  const { supported, enabled, loading, subscribe } = usePushSubscription();

  if (!supported || enabled) return null;

  const handleEnable = async () => {
    const ok = await subscribe();
    if (ok) {
      onClose();
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.icon}>🔔</div>
        <h2 style={styles.title}>Включить уведомления?</h2>
        <p style={styles.text}>
          Получайте push-уведомления о новых заявках и изменениях статусов в реальном времени.
        </p>
        <div style={styles.actions}>
          <button onClick={handleEnable} disabled={loading} style={styles.primaryBtn}>
            {loading ? 'Включение…' : 'Включить'}
          </button>
          <button onClick={onClose} disabled={loading} style={styles.secondaryBtn}>
            Не сейчас
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '16px',
  },
  modal: {
    background: '#fff',
    borderRadius: '16px',
    padding: '32px',
    maxWidth: '420px',
    width: '100%',
    textAlign: 'center',
    boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
  },
  icon: { fontSize: '48px', marginBottom: '16px' },
  title: { fontSize: '22px', fontWeight: 700, marginBottom: '8px', color: '#111827' },
  text: { fontSize: '15px', color: '#6b7280', marginBottom: '24px', lineHeight: 1.5 },
  actions: { display: 'flex', gap: '12px', justifyContent: 'center' },
  primaryBtn: {
    padding: '10px 20px',
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  secondaryBtn: {
    padding: '10px 20px',
    background: '#f3f4f6',
    color: '#374151',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
  },
};
