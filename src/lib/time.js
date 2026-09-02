export function formatLastSeen(timestamp, now = Date.now()) {
  if (!timestamp) return 'No signal yet';
  const delta = Math.max(0, now - timestamp);
  if (delta < 15000) return 'Live now';
  if (delta < 60000) return `Updated ${Math.floor(delta / 1000)}s ago`;
  if (delta < 3600000) return `Updated ${Math.floor(delta / 60000)}m ago`;
  return `Updated ${Math.floor(delta / 3600000)}h ago`;
}

export function isLive(timestamp, now = Date.now()) {
  return Boolean(timestamp) && now - timestamp < 45000;
}
