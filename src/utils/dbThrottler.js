import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

class TelemetryThrottler {
  constructor(minIntervalMs = 4500) {
    this.queue = new Map();
    this.lastCommitted = new Map();
    this.minIntervalMs = minIntervalMs;
    this.isProcessing = false;
    this.timer = null;
  }

  queueTelemetry(deviceId, data) {
    if (!deviceId) return;

    const now = Date.now();
    const lastWrite = this.lastCommitted.get(deviceId) || { time: 0, lat: 0, lng: 0 };

    const hasMovedSignificantly =
      Math.abs(data.lat - lastWrite.lat) > 0.00008 ||
      Math.abs(data.lng - lastWrite.lng) > 0.00008;

    const isTimeElapsed = now - lastWrite.time >= this.minIntervalMs;

    if (!hasMovedSignificantly && !isTimeElapsed && lastWrite.time !== 0) {
      return;
    }

    this.queue.set(deviceId, {
      ...data,
      last_updated: new Date().toISOString(),
      status: data.status || 'online',
    });

    this.scheduleFlush();
  }

  scheduleFlush() {
    if (this.timer || this.isProcessing) return;
    this.timer = setTimeout(() => {
      this.flushQueue();
    }, 1500);
  }

  async flushQueue() {
    if (this.queue.size === 0 || this.isProcessing) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.isProcessing = true;
    const batch = writeBatch(db);
    const stagedEntries = Array.from(this.queue.entries());
    this.queue.clear();

    const now = Date.now();
    stagedEntries.forEach(([deviceId, data]) => {
      const deviceRef = doc(db, 'devices', deviceId);
      batch.set(deviceRef, data, { merge: true });

      this.lastCommitted.set(deviceId, {
        time: now,
        lat: data.lat,
        lng: data.lng,
      });
    });

    try {
      await batch.commit();
      console.log(`[Throttler] Committed batch for ${stagedEntries.length} device(s) within quota.`);
    } catch (error) {
      console.error("[Throttler] Batch write failed. Restoring queue:", error);
      stagedEntries.forEach(([id, payload]) => {
        if (!this.queue.has(id)) this.queue.set(id, payload);
      });
    } finally {
      this.isProcessing = false;
      if (this.queue.size > 0) {
        this.scheduleFlush();
      }
    }
  }

  /**
   * Explicitly updates a device status to 'offline' and zeros all metrics
   */
  async setDeviceOffline(deviceId) {
    if (!deviceId) return;
    try {
      this.queue.delete(deviceId);
      this.lastCommitted.delete(deviceId);

      if (this.queue.size === 0 && this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }

      const deviceRef = doc(db, 'devices', deviceId);
      const batch = writeBatch(db);
      batch.set(
        deviceRef,
        {
          status: 'offline',
          last_updated: null,
          bpm: null,
          spo2: null,
          battery: null, // Clears battery state in Firestore
        },
        { merge: true }
      );

      await batch.commit();
      console.log(`[Throttler] Device ${deviceId} explicitly set to offline with zeroed vitals.`);
    } catch (err) {
      console.error(`[Throttler] Failed to set ${deviceId} offline:`, err);
    }
  }
}

export const telemetryThrottler = new TelemetryThrottler(4500);