const KNOWN_THREAT_IPS = new Set([
  "192.168.1.50", "10.0.0.15", "45.33.22.11", "185.220.101.2", "91.240.118.222"
]);

const GEO_RISK_MAP: Record<string, number> = {
  "US": 0.0,
  "BR": 0.3,
  "IN": 0.3,
  "RU": 0.7,
  "CN": 1.0
};

const PORT_RISK_MAP: Record<number, number> = {
  80: 0.0,
  443: 0.0,
  22: 0.5
};

export const featureExtractor = {
  extract: (log: any) => {
    const date = new Date(log.timestamp || Date.now());
    
    const hour_of_day = date.getHours();
    const is_weekend = (date.getDay() === 0 || date.getDay() === 6) ? 1 : 0;
    
    // Simplified failure rate and requests per min for this implementation
    // In a real system, these would be queried from a cache or DB
    const failure_rate_1h = log.event_type === 'login_failure' ? 0.8 : 0.1;
    const requests_per_min = 5.0; // Default
    
    const bytes_transferred = (log.bytes_transferred || 0) / 1000;
    const port_risk_score = PORT_RISK_MAP[log.port] !== undefined ? PORT_RISK_MAP[log.port] : 1.0;
    const is_threat_ip = KNOWN_THREAT_IPS.has(log.source_ip) ? 1 : 0;
    
    const event_type_map: Record<string, number> = {
      'login_success': 0,
      'login_failure': 1,
      'port_scan': 2,
      'brute_force': 3,
      'data_exfil': 4
    };
    const event_type_encoded = event_type_map[log.event_type] || 0;
    
    const geo_risk_score = GEO_RISK_MAP[log.geo_country] || 0.5;
    
    let status_code_group = 0;
    if (log.status_code >= 400 && log.status_code < 500) status_code_group = 1;
    else if (log.status_code >= 500) status_code_group = 2;

    return [
      hour_of_day,
      is_weekend,
      failure_rate_1h,
      requests_per_min,
      bytes_transferred,
      port_risk_score,
      is_threat_ip,
      event_type_encoded,
      geo_risk_score,
      status_code_group
    ];
  }
};
