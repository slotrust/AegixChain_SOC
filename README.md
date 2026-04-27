# 🛡️ CyberSOC AI Platform

![CyberSOC Banner](https://img.shields.io/badge/CyberSOC-AI--Powered_Security-0ea5e9?style=for-the-badge)

CyberSOC is a real-time, AI-driven Security Operations Center (SOC) platform. Built with a modern React frontend and a robust Node.js/Express backend, it monitors system processes, network connections, and authentication logs. It utilizes custom machine learning algorithms to detect anomalies, generate alerts, and features an automated Intrusion Prevention System (IPS) to actively defend against threats.

## ✨ Key Features

- **🤖 AI Anomaly Detection:** Automated threat detection using custom ML feature extraction and prediction.
- **🛡️ Intrusion Prevention System (IPS):** Automated defense mechanism that blocks malicious IP addresses based on high anomaly scores or brute force attack detection.
- **🛑 Brute Force Protection:** Built-in rate limiting and automatic IP blocking for repeated failed login attempts.
- **🖥️ Real-Time System Monitoring:** Live tracking of host system processes (`ps`) and network connections (`ss`) directly from the underlying Linux container.
- **📊 Interactive Dashboard:** Beautiful, responsive UI with live charts, event distributions, and login activity tracking.
- **🔍 Advanced Filtering & Sorting:** Filter and sort live logs, active network connections, and running processes directly from the UI for rapid threat analysis.
- **🚨 Smart Alerts:** Automated alert generation with AI-explained reasons and suggested mitigation steps.
- **💬 Security Chatbot:** Integrated assistant for security context and queries.
- **🔒 Secure Authentication & User Management:** Integrated with Firebase Authentication (Google Sign-In) and Firestore for role-based access control (RBAC), complete with robust error boundaries for permission management.

## 🛠️ Tech Stack

**Frontend:**
- React 18
- Vite
- Tailwind CSS
- Recharts (Data Visualization)
- Lucide React (Icons)
- Firebase SDK (Auth & Firestore)

**Backend:**
- Node.js & Express
- Firebase Admin SDK (Token verification & Firestore access)
- SQLite (better-sqlite3) for local log storage
- Custom AI/ML Engine (`feature_extractor`, `anomaly_detector`, `explainer`)

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- Linux environment (required for real-time `ps` and `ss` system monitoring commands)
- Firebase Project (with Authentication and Firestore enabled)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/cybersoc.git
   cd cybersoc
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Firebase Configuration**
   - Create a `firebase-applet-config.json` file in the root directory by copying the example file:
   ```bash
   cp firebase-applet-config.example.json firebase-applet-config.json
   ```
   - Open `firebase-applet-config.json` and replace the placeholder values with your own Firebase project configuration:
   ```json
   {
     "projectId": "your-project-id",
     "appId": "your-app-id",
     "apiKey": "YOUR_FIREBASE_API_KEY",
     "authDomain": "your-auth-domain",
     "firestoreDatabaseId": "(default)"
   }
   ```
   - Make sure to set up Firestore Security Rules in your Firebase console using the provided `firestore.rules` file.

4. **Set up environment variables (Gemini API Key)**
   - Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
   - Open the `.env` file and add your personal **Gemini API Key** (required for the AI chatbot and anomaly explanations):
   ```env
   GEMINI_API_KEY="your_personal_gemini_api_key_here"
   JWT_SECRET="your_custom_jwt_secret"
   ```

5. **Run the development server**
   ```bash
   npm run dev
   ```
   The application will be available at `http://localhost:3000`.

### Production Build

To build and run the application in a production environment:

```bash
npm run build
npm start
```

## 📂 Project Structure

```text
/
├── server.ts                 # Express backend entry point & global IPS middleware
├── firebase-applet-config.json # Firebase configuration
├── firestore.rules           # Firestore security rules
├── src/
│   ├── ai/                   # AI/ML logic (Anomaly detection, feature extraction)
│   ├── api/                  # Frontend API client (Axios)
│   ├── backend/              # Backend logic
│   │   ├── routes/           # Express API routes (auth, logs, system, alerts, ips)
│   │   ├── services/         # Business logic (log processing, system monitoring, IPS)
│   │   ├── middleware/       # Auth, rate limiting, and IPS blocking middleware
│   │   ├── firebaseAdmin.ts  # Firebase Admin SDK initialization
│   │   └── database.ts       # SQLite database initialization (logs, blocked_ips)
│   ├── components/           # React UI components (Dashboard, IPS Management, ErrorBoundary)
│   ├── firebase.ts           # Firebase client initialization
│   └── hooks/                # Custom React hooks (e.g., usePolling)
├── agent/                    # Python-based external agents (optional)
└── package.json              # Project dependencies and scripts
```

## 🧠 How the AI & Defense System Works

1. **Feature Extraction:** Incoming logs and system data are parsed to extract key numerical and categorical features (e.g., bytes transferred, time of day, failure rates).
2. **Anomaly Prediction:** The features are fed into the `anomalyDetector`, which calculates a risk score.
3. **Automated Defense (IPS):** If a critical anomaly is detected (score > 0.85) or a brute force attack occurs, the Intrusion Prevention System automatically blocks the offending IP address at the middleware level.
4. **Explanation & Mitigation:** For flagged anomalies, the `explainer` module generates a human-readable reason and suggests immediate mitigation steps.
5. **Alert Generation:** A critical or medium alert is dispatched to the dashboard for SOC analysts to review, including notifications of automated IPS actions.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/yourusername/cybersoc/issues).

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
