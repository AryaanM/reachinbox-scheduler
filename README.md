# ReachInbox Full-Stack Email Job Scheduler

A production-grade, full-stack email job scheduling and campaign management system built as part of the ReachInbox software engineering assignment. This application handles large-scale, rate-limited, and persistent email outreach without relying on OS-level or Node-based cron jobs.

---

## 🚀 Tech Stack

### **Backend**
* **Language & Runtime:** TypeScript, Node.js (v22+)
* **Framework:** Express.js
* **Queue Management:** BullMQ (backed by Redis)
* **Database & ORM:** PostgreSQL with Prisma
* **Search & Logging:** Elasticsearch
* **Email Dispatch:** Nodemailer (via Ethereal Fake SMTP)

### **Frontend**
* **Framework:** React.js (Vite)
* **Language:** TypeScript
* **Styling:** Tailwind CSS v4
* **Authentication:** Google OAuth 2.0 (`@react-oauth/google`)

### **Infrastructure**
* **Containerization:** Docker & Docker Compose (PostgreSQL, Redis, Elasticsearch)

---

## ⚙️ Architecture & Core Features

### 1. Reliable Scheduling (No Cron Jobs)
* **BullMQ Delayed Jobs:** Instead of relying on cron expressions or continuous polling loops, emails are enqueued as delayed jobs in Redis mapped directly to their target schedule timestamp.
* **State Persistence:** Scheduled states are stored in PostgreSQL and indexed in Elasticsearch. If the server crashes or restarts, BullMQ and PostgreSQL retain the exact queue state, ensuring future emails fire precisely on time without restarting from scratch.

### 2. Idempotency & Safety
* **Database Verification:** Before dispatching an email through SMTP, the worker verifies that the database state is strictly `PENDING`. This guarantees that if a job is retried or a server restarts, the same email is never sent twice.

### 3. Concurrency, Throttling & Rate Limiting
* **Worker Concurrency:** Configured with a worker concurrency of `5` to handle parallel processing safely.
* **Provider Throttling:** Implements a customizable minimum delay (`MIN_DELAY_BETWEEN_EMAILS_MS`) between individual sends to prevent SMTP provider blocks.
* **Hourly Rate Limiting:** Tracks per-sender email counts in Redis using sliding hour-window keys (`rate_limit:sender:timestamp`). When a limit is reached, jobs are safely moved to the next hour window (`job.moveToDelayed`) rather than being dropped or permanently failed.

### 4. Live Slack Webhook Integration
* **Real-Time Alerts:** When a sender hits their hourly rate limit, the worker fires a live Axios POST request to the user's custom Slack webhook.
* **Deduplication Lock:** Utilizes Redis `setnx` locks (`slack_alerted`) to ensure channels are not spammed with duplicate notifications if multiple workers hit the rate limit simultaneously.

---

## 🛠️ Local Installation & Setup

### Prerequisites
* Node.js installed locally
* Docker Desktop running

### 1. Clone & Start Infrastructure
```bash
git clone [https://github.com/AryaanM/reachinbox-scheduler.git](https://github.com/AryaanM/reachinbox-scheduler.git)
cd reachinbox-scheduler

# Spin up Postgres, Redis, and Elasticsearch containers
docker compose up -d