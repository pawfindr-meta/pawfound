import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

class TelemetryThrottler {
  constructor(batchLimit = 5, autoFlushMs = 2000) {
    this.queue = [];
    this.batchLimit = batchLimit;
    this.autoFlushMs = autoFlushMs;
    this.isProcessing = false;
    this.timer = null;
  }

  // Adds a telemetry reading to the local queue
  queueTelemetry(deviceId, data) {
    this.queue.push({ deviceId, data, timestamp: new Date().toISOString() });
    
    // Trigger immediate flush if threshold reached
    if (this.queue.length >= this.batchLimit && !this.isProcessing) {
      this.flushQueue();
    } else {
      // Otherwise, set a timer to auto-flush stagnant updates
      this.resetAutoFlushTimer();
    }
  }

  resetAutoFlushTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.queue.length > 0 && !this.isProcessing) {
        this.flushQueue();
      }
    }, this.autoFlushMs);
  }

  // Bundles queued data into a single Firestore transaction
  async flushQueue() {
    if (this.queue.length === 0 || this.isProcessing) return;
    if (this.timer) clearTimeout(this.timer);
    
    this.isProcessing = true;
    const batch = writeBatch(db);
    
    // Extract current queue
    const payload = [...this.queue];
    this.queue = [];

    // Consolidate updates by deviceId to prevent duplicate batch operations
    const latestByDevice = {};
    payload.forEach((item) => {
      latestByDevice[item.deviceId] = {
        ...item.data,
        last_updated: item.timestamp,
        status: 'online'
      };
    });

    try {
      Object.keys(latestByDevice).forEach((deviceId) => {
        const deviceRef = doc(db, 'devices', deviceId);
        batch.set(deviceRef, latestByDevice[deviceId], { merge: true });
      });

      await batch.commit();
      console.log(`[Throttler] Committed batch telemetry for ${Object.keys(latestByDevice).length} devices.`);
    } catch (error) {
      console.error("[Throttler] Batch write failed, re-queueing data...", error);
      this.queue.unshift(...payload);
    } finally {
      this.isProcessing = false;
    }
  }
}

// Export singleton instance with 5-item threshold or 2-second auto-flush
export const telemetryThrottler = new TelemetryThrottler(5, 2000);