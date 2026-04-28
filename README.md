# 🛡️ Nova - CyberSOC AI Platform

![CyberSOC Banner](https://img.shields.io/badge/CyberSOC-AI--Powered_Security-0ea5e9?style=for-the-badge)

Nova CyberSOC is a cutting-edge, real-time, AI-driven Security Operations Center (SOC) platform engineered to defend modern infrastructures. Built as a full-stack web application with a responsive React frontend and a powerful Node.js/Express backend, it provides unparalleled visibility into host system health and network security by monitoring real hardware and operating system parameters. 

**What is the app all about?**
The app is a comprehensive security tool designed for DevOps teams, sysadmins, and cybersecurity professionals. Instead of relying on simulated or mock data, Nova directly interfaces with the underlying host operating system to retrieve authentic system processes (`ps`), active network connections (`ss` or `systeminformation`), and access logs. It processes this continuous stream of real-time telemetry through an embedded custom machine learning engine to detect anomalies, generate instantaneous alerts, and invoke an automated Intrusion Prevention System (IPS) to actively block malicious actors.

## ✨ Key Features

- **📊 Real System Monitoring (No Simulations):** Nova accesses real system data from the machine it runs on. It monitors live host system processes and active network connections directly from the underlying environment, ensuring that the telemetry you see represents actual system state.
- **🤖 AI Anomaly Detection:** Automated threat detection using custom ML feature extraction and prediction, analyzing patterns in real-time system logs.
- **🛡️ Intrusion Prevention System (IPS):** Automated defense mechanism that blocks malicious IP addresses based on high anomaly scores or brute force attack detection.
- **🛑 Brute Force Protection:** Built-in rate limiting and automatic IP blocking for repeated failed login attempts.
- **📈 Advanced Logs Tab & AI Summarization:** The core of the investigative experience. The logs tab aggregates real system events. When an analyst clicks on a specific log entry, a dedicated generative AI module processes the event context and creates an **instant, plain-English summary** of what happened, why it might be suspicious, and what mitigation steps to take.
- **🔍 Advanced Filtering & Sorting:** Filter and sort real-time logs, active network connections, and running processes directly from the UI for rapid forensic analysis.
- **🚨 Smart Alerts:** Automated alert generation with AI-explained reasons.
- **💬 Security Chatbot:** Integrated AI-powered chat assistant for security context and queries.
- **🔒 Secure Authentication & User Management:** Integrated with Firebase Authentication (Google Sign-In) and Firestore for role-based access control (RBAC).

## 🏗️ Architecture

Nova utilizes a modern, decoupled client-server architecture packed into a unified full-stack application suitable for diverse deployment environments:

1. **Frontend Layer (Client):** 
   - A single-page application built with **React 18** and **Vite**.
   - Uses **Tailwind CSS** for an adaptive, dark-themed cyberpunk aesthetic.
   - Leverages **Recharts** for real-time data visualization.
   - Communicates with the backend via secure RESTful APIs.

2. **Backend Application Layer (Server):**
   - Built on **Node.js** and **Express.js**.
   - Acts as the central orchestrator, serving the frontend assets in production while exposing `/api/*` endpoints for data ingestion and retrieval.
   - **System Sensor Modules:** Native Node.js modules execute secure shell commands (`child_process`) to poll the host OS for real data (e.g., parsing `/etc/shadow` file integrity, running `ps -axo`, fetching network connections via `systeminformation`).

3. **AI & Machine Learning Engine Layer:**
   - **Local ML Evaluation:** A custom feature extraction and anomaly detection module (`src/ai/`) evaluates numeric patterns locally.
   - **Generative AI Integration:** Uses the **Google Gemini API** (`@google/genai`) for complex cognitive tasks, such as generating readable summaries for specific log entries and powering the intelligent security chatbot.

4. **Data Persistence Layer:**
   - **Local SQLite Database:** Uses `better-sqlite3` strictly for high-throughput storage of system logs and blocked IP lists.
   - **Firebase Firestore:** Used as a cloud-synced database for enterprise configuration and Role-Based Access Control.

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

## ☁️ Deployment on Vercel

To deploy this full-stack application (frontend + Express backend) to Vercel, ensure your Vercel project configuration matches the following settings so that both the React UI and the Node.js API function correctly.

### Vercel Project Settings:

- **Framework Preset:** `Vite` (or `Other` if you are using custom build scripts)
- **Root Directory:** `./` (Leave as default root)
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Install Command:** `npm install`

### Environment Variables on Vercel:

You must add the following environment variables in your Vercel Project Settings interface (`Settings > Environment Variables`):

- `GEMINI_API_KEY`: Your Google Gemini API Key (Required for AI Summaries and Chatbot).
- `JWT_SECRET`: A secure, random string for cryptographic token signing.
- `NODE_ENV`: Set to `production`.

*Note for Vercel Deployments: Since Vercel uses ephemeral Serverless Functions, the "Real System Monitoring" modules (like processes and network hardware stats) will monitor the underlying Vercel microVM container rather than a persistent Linux server. SQLite databases are also ephemeral on Vercel Serverless. For persistent system monitoring of a dedicated server, deploy via Docker, Google Cloud Run, or a traditional VPS (e.g., DigitalOcean, AWS EC2).*

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
