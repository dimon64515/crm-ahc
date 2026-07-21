import { useState, useEffect, useCallback } from 'react';
import { pushAPI, urlBase64ToUint8Array } from '../api';

export function usePushSubscription() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const pushSupported =
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window;
    setSupported(pushSupported);
    if (!pushSupported) return;

    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setEnabled(!!sub && Notification.permission === 'granted'))
      .catch((err) => console.error('Ошибка при получении push-подписки:', err));
  }, []);

  const subscribe = useCallback(async () => {
    if (!supported) return false;
    setLoading(true);
    setError('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setEnabled(false);
        return false;
      }

      const reg = await navigator.serviceWorker.ready;
      const { data } = await pushAPI.getVapidPublicKey();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.public_key),
      });
      const subJson = sub.toJSON();
      await pushAPI.subscribe({
        endpoint: subJson.endpoint,
        p256dh: subJson.keys.p256dh,
        auth: subJson.keys.auth,
      });
      setEnabled(true);
      return true;
    } catch (err) {
      console.error('Ошибка при подписке на push:', err);
      setError(err.message || 'Не удалось включить уведомления');
      setEnabled(false);
      return false;
    } finally {
      setLoading(false);
    }
  }, [supported]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return false;
    setLoading(true);
    setError('');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const subJson = sub.toJSON();
        await sub.unsubscribe();
        await pushAPI.unsubscribe({ endpoint: subJson.endpoint });
      }
      setEnabled(false);
      return true;
    } catch (err) {
      console.error('Ошибка при отписке от push:', err);
      setError(err.message || 'Не удалось отключить уведомления');
      return false;
    } finally {
      setLoading(false);
    }
  }, [supported]);

  return { supported, enabled, loading, error, subscribe, unsubscribe };
}
