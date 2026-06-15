# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

---

## ☁️ Supabase Cloud & Sync Bridge Setup

### 1. Supabase Database Schema
To initialize your Supabase project, execute the SQL commands found in [supabase-schema.sql](file:///e:/Template/supabase-schema.sql) using the Supabase SQL Editor. This sets up the necessary tables (`plants`, `profiles`, `production_data`, `report_history`, `scheduled_reports`, `email_configuration`, and `synchronization_logs`) along with demo RLS policies.

### 2. Standalone Synchronization Bridge Script
A standalone Node.js sync bridge is located at [sync-service/local-sync-bridge.js](file:///e:/Template/sync-service/local-sync-bridge.js). This script continuously pushes SCADA records from your local MS SQL Server up to Supabase. If no local SQL Server is running, it automatically executes in **Simulation Mode** (generating and syncing hourly data) so you can evaluate the system out-of-the-box.

#### Execution:
1. Install script dependencies:
   ```bash
   npm install mssql @supabase/supabase-js dotenv
   ```
2. Configure credentials in a `.env` file in the root:
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   MSSQL_CONNECTION_STRING=Server=localhost,1433;Database=SCADA;User Id=sa;Password=your_password;Encrypt=true;
   ```
3. Run the bridge script:
   ```bash
   node sync-service/local-sync-bridge.js
   ```

### 3. Application Setup
Log into the application, navigate to **Cloud DB & Sync**, choose **Supabase PostgreSQL**, and input your Supabase credentials. The React app will immediately connect to your live Supabase cloud database to fetch and display dashboards, reports, and logs dynamically.

