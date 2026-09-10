const API_BASE = '/api';

async function fetchJSON(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText} — ${url}`);
  return resp.json();
}

export async function getDates() {
  return fetchJSON(`${API_BASE}/dates`);
}

export async function getDepths(day = 1) {
  return fetchJSON(`${API_BASE}/depths?day=${day}`);
}

export async function getGrid({ variable = 'temperature', depth = 0, day = 1 } = {}) {
  return fetchJSON(`${API_BASE}/grid?variable=${variable}&depth=${depth}&day=${day}`);
}

export async function getFloats(day = 1) {
  return fetchJSON(`${API_BASE}/floats?day=${day}`);
}

export async function getCurrents(day = 1) {
  return fetchJSON(`${API_BASE}/currents?day=${day}`);
}

export async function getFloatHistory(floatId) {
  return fetchJSON(`${API_BASE}/floats/${encodeURIComponent(floatId)}/history`);
}

export async function getHealth() {
  return fetchJSON('/health');
}

export async function getDataStatus() {
  return fetchJSON(`${API_BASE}/data-status`);
}
