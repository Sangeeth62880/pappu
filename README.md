<div align="center">

  <img src="assets/brand/icon.png" alt="Pappu Logo" width="140" style="border-radius: 28px; box-shadow: 0 8px 24px rgba(0,0,0,0.15);" />

  # Pappu (പപ്പു)
  ### The Bilingual (Malayalam ⇄ English) Voice-First Financial Assistant

  [![Live Backend](https://img.shields.io/badge/Render-Deployed%20Live-brightgreen?style=for-the-badge&logo=render&logoColor=white)](https://pappu-78n5.onrender.com/health)
  [![EAS Build](https://img.shields.io/badge/EAS-Android%20APK%20Ready-blue?style=for-the-badge&logo=expo&logoColor=white)](https://expo.dev/accounts/sangeeth122/projects/pappu/builds/c1078d20-4c3c-49ed-9ad6-69e14d6acfe4)
  [![Python](https://img.shields.io/badge/Python-3.12%20Pinned-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
  [![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
  [![React Native](https://img.shields.io/badge/React%20Native-Expo%20SDK%2057-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://expo.dev/)
  [![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL%20%26%20Auth-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
  [![Sarvam AI](https://img.shields.io/badge/Sarvam%20AI-Saaras%20%7C%20Bulbul%20%7C%20105B-FF6B6B?style=for-the-badge)](https://www.sarvam.ai/)
  [![Tests](https://img.shields.io/badge/Tests-312%20Backend%20%7C%20230%20Frontend%20Passed-success?style=for-the-badge&logo=pytest&logoColor=white)](tests)

  <p align="center">
    <b>Speak naturally in Malayalam, Manglish, or English.</b><br/>
    Pappu tracks expenses, manages debts, schedules reminders, and reports real-time insights with high-fidelity voice and emotional mascot feedback.
  </p>

  [**Explore Features**](#-key-features) •
  [**System Architecture**](#-system-architecture) •
  [**Mascot System**](#-mascot-character-states) •
  [**Live Deployment**](#-live-deployment--downloads) •
  [**Getting Started**](#-getting-started)

</div>

---

## 🌟 Highlights

- 🗣️ **Voice-First & Code-Mixed Understanding**: Fluent understanding of Malayalam, Manglish (*"Innale biriyanikku 250 roopa aayi"*), and English voice inputs.
- 🪙 **Animated Mascot (Pappu)**: 10 expressive vector SVG states that react in real-time to user speech, financial balance, and assistant processing.
- 🧠 **Sarvam AI Intelligence Stack**:
  - **Saaras v3** for speech-to-text with Indian accent & code-mixed Malayalam fluency.
  - **Sarvam-105B** for conversational context, multi-turn dialogue, and structured intent classification.
  - **Bulbul v3** for low-latency natural text-to-speech audio feedback.
- 🛡️ **Risk-Gated Action Planner**: High-risk financial operations (bulk deletion, large transfers) prompt interactive confirmations before touching the database.
- 📱 **Cross-Platform**: Production-ready Android standalone APK (EAS internal distribution) and iOS compatible via Expo Go / Xcode personal development.

---

## 🏗️ System Architecture

Pappu operates on an audited six-layer decoupled pipeline:

```mermaid
graph TD
    subgraph Client ["Frontend (React Native / Expo SDK 57)"]
        UI[Mobile UI & Dashboard]
        Mic[Audio Recorder]
        Mascot[Pappu Mascot Animator]
        Gate[Startup Health Gate]
    end

    subgraph VoiceAI ["Sarvam AI Speech & Language Stack"]
        STT["Saaras v3 (STT)<br/>Malayalam / English / Manglish"]
        LLM["Sarvam-105B LLM<br/>Intent & Entity Extraction"]
        TTS["Bulbul v3 (TTS)<br/>Bilingual Voice Response"]
    end

    subgraph Backend ["Backend API (FastAPI / Render Cloud)"]
        Router[FastAPI Route Handlers]
        RiskGate[Confirmation & Risk Filter]
        Service[Financial & Contact Engine]
    end

    subgraph DataStore ["Database & Identity (Supabase)"]
        Auth[Supabase Auth / JWT]
        PG[(PostgreSQL + RLS)]
    end

    %% Flow
    Mic -->|Voice Audio| STT
    STT -->|Raw Transcribed Text| LLM
    LLM -->|Structured Intent JSON| Router
    Router --> RiskGate
    RiskGate -->|Safe / Confirmed Action| Service
    Service -->|Query / Mutate| PG
    Auth -.->|Verify Token| Router
    Service -->|Execution Result| LLM
    LLM -->|Natural Language Text| TTS
    TTS -->|Audio Stream| UI
    Router -->|JSON State Update| UI
    Router -->|State Trigger| Mascot
```

### End-to-End Processing Flow

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant App as Mobile App (Expo)
    participant Saaras as Sarvam Saaras v3 (STT)
    participant Backend as FastAPI (Render)
    participant SarvamLLM as Sarvam-105B
    participant DB as Supabase PostgreSQL
    participant Bulbul as Sarvam Bulbul v3 (TTS)

    User->>App: Speaks "Rahulinu 500 roopa koduthu"
    App->>Saaras: Stream WAV / M4A Audio
    Saaras-->>App: Transcribed: "Rahulinu 500 roopa koduthu"
    App->>Backend: POST /api/assistant/chat (text + context)
    Backend->>SarvamLLM: Intent parsing with user financial context
    SarvamLLM-->>Backend: Intent: {action: "add_expense", amount: 500, contact: "Rahul"}
    Backend->>DB: INSERT into transactions & update contact balance
    DB-->>Backend: Transaction Record ID created
    Backend->>SarvamLLM: Generate conversational Malayalam response
    SarvamLLM-->>Backend: "Rahulinu 500 roopa nalkiyathayi record cheythu."
    Backend->>Bulbul: Synthesize speech
    Bulbul-->>Backend: Audio base64 / URL
    Backend-->>App: {reply, audio, transaction, mascot_state: "happy"}
    App->>User: Play voice response & show animated Happy Mascot!
```

---

## 🎨 Mascot Character States

Pappu is represented by a coin mascot with dynamic real-time poses extracted from the design system:

| State | Preview Pose | Description & Trigger |
|:---|:---:|:---|
| **Idle** | [`pappu-idle.svg`](assets/pappu/svg/pappu-idle.svg) | Default calm state on dashboard ready for interactions. |
| **Listening** | [`pappu-listening.svg`](assets/pappu/svg/pappu-listening.svg) | Active microphone recording, soundwave glyphs, cupped ear. |
| **Thinking** | [`pappu-thinking.svg`](assets/pappu/svg/pappu-thinking.svg) | Processing speech transcript and calculating AI intent. |
| **Speaking** | [`pappu-speaking.svg`](assets/pappu/svg/pappu-speaking.svg) | Playing Sarvam Bulbul TTS voice response. |
| **Happy** | [`pappu-happy.svg`](assets/pappu/svg/pappu-happy.svg) | Successful savings, debt settlement, or low expenses. |
| **Excited** | [`pappu-excited.svg`](assets/pappu/svg/pappu-excited.svg) | Milestone achieved, salary credited, or debt fully paid. |
| **Concerned** | [`pappu-concerned.svg`](assets/pappu/svg/pappu-concerned.svg) | Budget threshold exceeded or pending high borrow amounts. |
| **Worried** | [`pappu-worried.svg`](assets/pappu/svg/pappu-worried.svg) | Negative balance warning or critical expense overspend. |
| **Confused** | [`pappu-confused.svg`](assets/pappu/svg/pappu-confused.svg) | Ambiguous speech input prompting clarification. |
| **Sleepy** | [`pappu-sleepy.svg`](assets/pappu/svg/pappu-sleepy.svg) | Inactivity mode and calm nighttime backdrop. |

---

## 🚀 Live Deployment & Downloads

| Service | Environment | Status | Endpoint / Link |
|:---|:---|:---:|:---|
| **Backend API** | Render (Standard Web Service) | [![Live](https://img.shields.io/badge/status-active-brightgreen)](https://pappu-78n5.onrender.com/health) | [`https://pappu-78n5.onrender.com`](https://pappu-78n5.onrender.com) |
| **Health Check** | Render Cloud | `200 OK` | [`/health`](https://pappu-78n5.onrender.com/health) |
| **Database** | Supabase Managed PostgreSQL | `connected` | Supabase Cloud (`mvobtveaewxgiczulyrq`) |
| **Android APK** | Standalone Android Build | [![Passed](https://img.shields.io/badge/EAS%20Build-Passed-success)](https://expo.dev/accounts/sangeeth122/projects/pappu/builds/c1078d20-4c3c-49ed-9ad6-69e14d6acfe4) | [Download Latest APK (EAS)](https://expo.dev/accounts/sangeeth122/projects/pappu/builds/c1078d20-4c3c-49ed-9ad6-69e14d6acfe4) |
| **iOS Testing** | Expo Go / Sideload | `active` | Project slug: `pappu` (SDK 57) |

---

## 💻 Tech Stack Matrix

```
┌────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                  │
├─────────────────┬─────────────────┬──────────────────┬─────────────────┤
│ React Native    │ Expo SDK 57     │ Tailwind CSS     │ React Navigation│
│ NativeWind v4   │ Reanimated 4    │ React Query v5   │ SVG Vectors     │
├─────────────────┴─────────────────┴──────────────────┴─────────────────┤
│                              BACKEND                                   │
├─────────────────┬─────────────────┬──────────────────┬─────────────────┤
│ Python 3.12.0   │ FastAPI         │ SQLAlchemy ORM   │ Pydantic v2     │
│ Uvicorn ASGI    │ psycopg2-binary │ Pytest (312 T.)  │ Docker Slim     │
├─────────────────┴─────────────────┴──────────────────┴─────────────────┤
│                            CLOUD & AI                                  │
├─────────────────┬─────────────────┬──────────────────┬─────────────────┤
│ Supabase Auth   │ PostgreSQL RLS  │ Sarvam Saaras v3 │ Sarvam 105B LLM │
│ Sarvam Bulbul v3│ Render Hosting  │ Expo EAS Cloud   │ Tailscale Dev   │
└─────────────────┴─────────────────┴──────────────────┴─────────────────┘
```

---

## 🛠️ Getting Started

### Prerequisites

- **Python 3.12.x** (Strictly pinned for backend stability)
- **Node.js 20+** and `npm`
- **Expo CLI** (`npm install -g eas-cli`)
- Free or Pro account on **Supabase** and **Sarvam AI**

### 1. Clone the Repository

```bash
git clone https://github.com/Sangeeth62880/pappu.git
cd pappu
git checkout ui-stitch-v3
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment with Python 3.12
python3.12 -m venv .venv
source .venv/bin/activate

# Install pinned dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your Supabase DB URL and Sarvam API keys

# Run unit tests
pytest

# Start local server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Frontend Setup

```bash
cd ../frontend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Set EXPO_PUBLIC_API_URL=https://pappu-78n5.onrender.com (or local IP)
# Set your EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY

# Run unit and component test suite
npm test

# Launch Expo Dev Server
npx expo start -c
```

### 4. Running on Physical Devices

- **Android**:
  Download and install the standalone `.apk` directly onto your phone from the [EAS Build Page](https://expo.dev/accounts/sangeeth122/projects/pappu/builds/c1078d20-4c3c-49ed-9ad6-69e14d6acfe4).
- **iPhone (iOS)**:
  1. Install **Expo Go** from the Apple App Store.
  2. Run `npx expo start -c` on your Mac.
  3. Scan the terminal QR code with your iPhone Camera to open Pappu instantly.

---

## 🧪 Testing & Verification

Comprehensive test suites protect against regressions across backend business logic and frontend UI components:

```bash
# Backend Test Suite (312 tests passing)
cd backend && pytest -v

# Frontend Test Suite (230 tests across 27 suites passing)
cd frontend && npm test
```

- **Health Verification**: Startup health gate verifies database connectivity and provides automatic cold-start recovery screens without crashing.
- **Safety Audit**: Zero credentials or service keys committed in Git history (`.gitignore` enforced for all `.env*` files).

---

## 📁 Repository Structure

```
pappu/
├── assets/
│   ├── brand/               # App icons, splash screens, foregrounds
│   └── pappu/               # 10 Mascot poses (SVG & PNG catalog)
├── backend/
│   ├── app/
│   │   ├── api/             # REST Routers (auth, assistant, transactions, contacts)
│   │   ├── core/            # Config, security, logging
│   │   ├── models/          # SQLAlchemy ORM schemas
│   │   ├── services/        # AI orchestration, Sarvam client, planners
│   │   └── main.py          # FastAPI application factory & health probe
│   ├── tests/               # 312 Pytest test cases & evaluation harnesses
│   ├── .python-version      # Pinned Python version (3.12.0)
│   ├── Dockerfile           # Production container specification
│   └── requirements.txt     # Pinned production Python dependencies
├── frontend/
│   ├── src/
│   │   ├── api/             # HTTP & WebSocket API client
│   │   ├── components/      # UI components, Mascot, StartupHealthGate
│   │   ├── navigation/      # TabBar, Stack Navigators
│   │   └── screens/         # Home, Chat, History, People, Settings
│   ├── eas.json             # EAS Build Profiles (Android APK & iOS)
│   ├── app.json             # Expo application configuration & plugins
│   └── tests/               # 230 Jest test cases
├── supabase/
│   └── migrations/          # PostgreSQL schema, RLS, audit logs
└── render.yaml              # Render Cloud Infrastructure as Code
```

---

<div align="center">
  <sub>Built with ❤️ for bilingual speakers • Malayalam & English • Powered by Sarvam AI & Supabase</sub>
</div>
