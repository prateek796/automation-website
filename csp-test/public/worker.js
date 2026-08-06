/**
 * Simple test worker — posts a heartbeat every second.
 * Used to verify whether CSP worker-src allows / blocks Worker creation.
 */

'use strict';

let tick = 0;

self.postMessage({ type: 'ready', message: 'Worker started' });

setInterval(() => {
  tick += 1;
  self.postMessage({
    type: 'heartbeat',
    tick,
    timestamp: Date.now(),
  });
}, 1000);
