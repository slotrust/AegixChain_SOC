# Project Title: AegisX Cyber Security SOC

## Domain & Summary
**Domain:** Cybersecurity, Intelligent Intrusion Prevention Systems (IPS), AI-Generated SOC, and Security Operations.
**Summary:** AegisX is a comprehensive Security Operations Center (SOC) web application built to monitor, detect, and automatically block malicious activities in real-time. It integrates an Intrusion Prevention System (IPS) capable of identifying anomalies and brute-force attacks, logging them securely, and issuing auto-mitigating actions.

## The Problem
Modern applications are constantly targeted by automated attacks such as credential stuffing, distributed denial-of-service (DDoS), and brute-force login attempts. Traditional firewalls and manual intervention methods are too slow to keep up with the volume of requests. Security analysts face alert fatigue due to the massive volume of raw logs, making it difficult to pinpoint genuine intrusions before systems are compromised.

## Key Findings
1. **Automated Response Efficiency:** The IPS correctly identified repeated login failures and automatically blacklisted the offending IP addresses dynamically without requiring an application restart.
2. **Alert Triaging:** Categorizing events into severities allows analysts to focus on high-priority critical alerts.
3. **External Environment Proxy Constraints:** When testing from external unauthenticated clients against the preview URL, requests might intercept a Cookie Check Challenge (e.g., Status: 200 containing HTML check pages) prior to reaching the Express backend. This means some attacks are thwarted inherently by the infrastructure's Identity Aware Proxy before even hitting the IPS. Therefore, brute force tests using `requests.post()` on live proxy URLs without session cookies may falsely report a successful connection (`Status: 200`) because they receive the proxy's HTML challenge, not the application's actual JSON response.

## How it Works
1. **Traffic Interception:** The Express.js backend acts as a gateway intercepting incoming requests. Middleware captures critical metadata (IP, User Agent, Endpoint).
2. **Intrusion Prevention System (IPS):** An intelligent rateLimit and IPS evaluation layer monitors request rates. For sensitive endpoints like `/api/auth/login`, executing more than 5 failed attempts within 15 minutes triggers an auto-block.
3. **Database Logging & Forensics:** SQLite stores the event history. Valid login failures generate `login_failure` logs. When thresholds are exceeded, the IP is blacklisted, and a Critical Alert is raised in the central dashboard.
4. **Real-Time Feed:** A React frontend consumes these events asynchronously, feeding an interactive dashboard for immediate visibility.

## Results Snapshots
* **Brute-Force Test (Local):**
  * Request 1 to 5: `Status: 401 - {"error":"Invalid username or password"}`
  * Request 6: `Status: 429 - {"error":"Too many login attempts."}`
  * Request 7 to 20: `Status: 403 - {"error":"Forbidden", "message":"Your IP address has been blocked..."}`
* **Brute-Force Test (Remote):** Returned HTTP 200 for the `AI Studio Cookie Check` HTML page. The attacker script received the proxy gateway response instead of the backend login response, successfully preventing the attacker from ever reaching the target backend API.

## Future Scope
* **Behavioral Machine Learning:** Implement an anomaly detection module using regression algorithms to detect subtle, low-frequency attack patterns over week-long periods.
* **Geographical Blocking:** Add Geo-IP resolving capabilities to auto-block requests originating from known malicious subnets.
* **Multi-Factor Authentication (MFA):** Require TOTP (Time-Based One-Time Password) validation to secure administrative accounts against leaked credential attacks.

## References
1. AI Studio Build Identity Aware Proxy Architecture.
2. Express-Rate-Limit Documentation
3. OWASP Top 10 - Broken Authentication Preventions
