import { safeStorage } from "../utils/storage";
import axios from 'axios';
import { auth } from '../firebase';

const client = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
});

// Add a request interceptor to include the JWT token
client.interceptors.request.use(
  async (config) => {
    let token = safeStorage.getItem('soc_token');
    
    // If Firebase user is logged in, get the latest token (which handles refresh)
    if (auth && auth.currentUser) {
      try {
        const fbToken = await auth.currentUser.getIdToken();
        if (fbToken) {
          token = fbToken;
          safeStorage.setItem('soc_token', token);
        }
      } catch (e) {
        console.error("Failed to get Firebase token", e);
      }
    }
    
    if (token === "null" || token === "undefined") {
      safeStorage.removeItem('soc_token');
      token = null;
    }
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Add a response interceptor to handle 401s
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.warn('API returned 401 Unauthorized. Token may be expired.');
      window.dispatchEvent(new CustomEvent('soc_unauthorized'));
    }
    return Promise.reject(error);
  }
);

export const api = {
  login: (username, password) => client.post('/auth/login', { username, password }),
  getLogs: (params = {}) => client.get('/logs', { params }),
  getStats: () => client.get('/logs/stats'),
  getAlerts: (params = {}) => client.get('/alerts', { params }),
  getAlert: (id) => client.get(`/alerts/${id}`),
  acknowledgeAlert: (id, acknowledged) => client.patch(`/alerts/${id}/acknowledge`, { acknowledged }),
  getSettings: () => client.get('/alerts/settings'),
  updateSettings: (settings) => client.post('/alerts/settings', settings),
  sendChatMessage: (message, context_alert_id = null) => client.post('/chat', { message, context_alert_id }),
  getChatHistory: () => client.get('/chat/history'),
  searchChatHistory: (query) => client.get('/chat/search', { params: { q: query } }),
  getChatContext: (alertId) => client.get(`/chat/context/${alertId}`),
  saveChatHistory: (role, content) => client.post('/chat/history', { role, content }),
  getProcesses: () => client.get('/system/processes'),
  getNetwork: () => client.get('/system/network'),
  getHealth: () => client.get('/health'),
  getUsers: () => client.get('/users'),
  createUser: (userData) => client.post('/users', userData),
  updateUser: (id, userData) => client.put(`/users/${id}`, userData),
  deleteUser: (id) => client.delete(`/users/${id}`),
  
  // IPS Endpoints
  getBlockedIps: () => client.get('/ips/blocked'),
  blockIp: (ip, reason, duration) => client.post('/ips/block', { ip, reason, duration }),
  unblockIp: (ip) => client.delete(`/ips/unblock/${ip}`),
  getFirewallRules: () => client.get('/ips/firewall-rules'),
  deleteFirewallRule: (id) => client.delete(`/ips/firewall-rules/${id}`),

  // Phase 1 Endpoints
  getPhase1Threats: () => client.get('/phase1/threats'),
  getPhase1Layers: () => client.get('/phase1/layers'),
  getPhase1Memory: () => client.get('/phase1/memory'),

  // EDR Endpoints
  getEDRVulnerabilities: () => client.get('/edr/vulnerabilities'),
  getEDRQuarantines: () => client.get('/edr/quarantines'),
  runEDRScan: () => client.post('/edr/scan', {}, { timeout: 60000 }),
  runNmapScan: (target?: string) => client.post('/edr/scan-nmap', { target }, { timeout: 60000 }),
  scanTargetFile: (targetPath: string) => client.post('/edr/scan-file', { targetPath }),
  scanFileIntegrity: (targetPath: string) => client.post('/edr/scan-integrity', { targetPath }),
  analyzeProcess: (pid: string, processName?: string) => client.post('/edr/analyze-process', { pid, processName }),
  remediateVulnerability: (packageName: string, range: string) => client.post('/edr/remediate', { packageName, range }, { timeout: 60000 }),
  remediateAllCriticalHigh: () => client.post('/edr/remediate-critical', {}, { timeout: 300000 }),
  getEDRReports: () => client.get('/edr/reports'),

  // Nova AI Brain
  getNovaHistory: () => client.get('/sentinel/history'),
  sendNovaCommand: (action: string) => client.post('/sentinel/command', { action }).then(res => res.data),

  // Nova Qwen Intel
  askQwen: (prompt: string) => client.post('/nova/qwen-advice', { prompt }).then(res => res.data),

  // Behavioral AI Endpoints
  getBehavioralAnomalies: () => client.get('/behavioral/anomalies'),
  getBehavioralBaselines: () => client.get('/behavioral/baselines'),
  getBehavioralStatus: () => client.get('/behavioral/status'),
  setBehavioralMode: (learning: boolean) => client.post('/behavioral/mode', { learning }),
  reviewBehavioralAnomaly: (id: number, action: 'confirm' | 'dismiss') => client.post('/behavioral/review', { id, action }),

  // Multi Agent
  getMultiAgentHistory: () => client.get('/multi-agent/history'),

  // Memory
  getMemoryHistory: () => client.get('/memory/history'),
  updateMemoryFeedback: (id: number, verdict: string) => client.post(`/memory/${id}/feedback`, { verdict }),

  // MITRE
  getMitreTimeline: () => client.get('/mitre/timeline'),
  getMitreDetails: (id: string) => client.get(`/mitre/details/${id}`),

  // Correlation
  getCorrelatedThreats: () => client.get('/correlation/threats'),
  getAttackChain: (id: number) => client.get(`/correlation/threats/${id}/chain`),

  // SOC Assistant
  askAssistant: (query: string, sessionId?: string) => client.post('/assistant', { query, sessionId }),

  // Tools
  queryVulnerabilityDataset: (cve_id: string) => client.post('/edr/tools/query-vulnerability', { cve_id }),
  deployTemporaryMitigation: (target_asset: string, mitigation_payload: string) => client.post('/edr/tools/deploy-mitigation', { target_asset, mitigation_payload }),
  createPatchReviewTicket: (cve_id: string, proposed_fix_code: string, rollback_plan: string) => client.post('/edr/tools/create-ticket', { cve_id, proposed_fix_code, rollback_plan })
};
