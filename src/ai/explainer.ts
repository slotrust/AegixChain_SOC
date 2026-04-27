export const explainer = {
  explain: (log: any, score: number) => {
    const reasons: string[] = [];
    
    if (log.event_type === 'brute_force') reasons.push("Pattern consistent with brute force attack");
    if (log.event_type === 'data_exfil') reasons.push("Abnormal data transfer volume detected");
    if (log.event_type === 'port_scan') reasons.push("Access on non-standard high-risk port");
    
    if (log.status_code === 401 || log.status_code === 403) {
      reasons.push("Multiple authentication failures detected");
    }

    const threatIps = ["192.168.1.50", "10.0.0.15", "45.33.22.11", "185.220.101.2", "91.240.118.222"];
    if (threatIps.includes(log.source_ip)) {
      reasons.push(`Source IP ${log.source_ip} matches known threat intelligence feed`);
    }

    const highRiskGeo = ["RU", "CN"];
    if (highRiskGeo.includes(log.geo_country)) {
      reasons.push(`Traffic from high-risk geographic region (${log.geo_country})`);
    }

    if (log.bytes_transferred > 50000) {
      reasons.push(`Abnormal data transfer volume (${(log.bytes_transferred / 1024).toFixed(1)} KB)`);
    }

    const reasonStr = reasons.join("; ");
    const severity = score > 0.7 ? "CRITICAL: " : (score > 0.4 ? "WARNING: " : "NOTICE: ");
    
    return severity + (reasonStr || "Unusual activity pattern detected");
  },

  suggestMitigations: (log: any) => {
    const mitigations: Record<string, string[]> = {
      'brute_force': [
        `Block IP ${log.source_ip} at firewall`,
        "Enable account lockout policy",
        "Enable MFA for affected account",
        "Review auth logs for lateral movement"
      ],
      'data_exfil': [
        "Isolate source endpoint",
        `Revoke credentials for ${log.username}`,
        "Capture network traffic for forensic analysis",
        "Notify CISO"
      ],
      'port_scan': [
        `Block source IP ${log.source_ip} at perimeter`,
        "Review exposed services",
        "Enable IDS signature for port scan patterns"
      ],
      'default': [
        `Monitor IP ${log.source_ip} for continued activity`,
        "Review user session"
      ]
    };

    return mitigations[log.event_type] || mitigations['default'];
  }
};
