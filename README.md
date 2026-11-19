# CivicFlow India

**Smart City Complaint Management and Response Platform**  
Citizens report local issues. City administrators supervise and route the work. Contractors update progress and add evidence. Everyone who needs an update can follow the case timeline.

## What is included

- Three roles: citizen, city admin/head, and contractor.
- Citizen registration and complaint submission with category, priority, narrative, attachments, and India-wide location fields.
- Cascading **State / Union Territory → District → Taluka / Tehsil / Sub-district → City / Town / Urban Local Body** selectors. The directory is bundled locally, so these selectors work without calling a location API.
- Optional device location capture and map coordinates; address hierarchy remains available if GPS permission is unavailable.
- Automatic routing to an approved contractor matching complaint category and service state/district, with the least active workload preferred.
- Admin assignment override, contractor application review, response dashboards, overdue flags, audit history, and location-targeted city notices.
- Contractor work queue with status changes, progress messages, and photo/PDF evidence uploads.
- Live complaint totals (filed, solved, and pending) on the welcome screen; dashboards refresh over Socket.IO and include a ranked state-to-district report explorer.
- City notices include state, district, taluka, and a manually entered city. Citizens can set a home area during registration or later in Account to receive notices for their city; admins and service-area contractors see notices they manage or cover.
- Cascading complaint-desk filters for State / UT → District → Taluka / Tehsil, plus search across issue descriptions and locations.
- Profile editing for citizens, admins, and contractors, including a private profile-photo upload; contractor service coverage and categories can also be updated.
- Admin-assisted related-incident discovery: compares complaint title/description and category, checks GPS distance within a chosen radius, and falls back to matching taluka/city when coordinates are unavailable. Grouping preserves each original complaint, reporter, status, and timeline.
- Role-scoped attachment access: only the reporter, assigned contractor, and admins can open complaint evidence.
- PostgreSQL persistence, Docker Compose, health checks, GitHub Actions CI, GHCR image publishing, vulnerability scanning, and optional SSH staging deployment.

## Run it on your laptop

### 1. Install Docker Desktop

Install and start Docker Desktop for Windows. Keep its Linux container engine running.

### 2. Open the project folder

Extract the ZIP. In PowerShell, change to the extracted `civicflow-india` folder.

### 3. Start the app

The easiest option is to run `Start-CivicFlow.ps1` from PowerShell. It creates `.env` on first launch, builds and starts the containers, checks readiness, and prints the laptop address to use on same-Wi-Fi devices.

Or run the commands yourself:

```powershell
Copy-Item .env.example .env
docker compose up --build -d
```

Wait for the app health check, then open **http://localhost:3000**. First startup downloads the Node and PostgreSQL container images and may take a few minutes. Your complaint records and uploaded files persist in Docker volumes when you restart the containers.

To stop the app:

```powershell
docker compose down
```

To stop it and erase the local database and uploaded evidence:

```powershell
docker compose down -v
```

## Demo accounts

Demo accounts are created on first start. Enter the credentials below on the sign-in screen; the public sign-in page does not include prefilled demo shortcuts.

| Role | Email | Password |
|---|---|---|
| Admin / city head | `admin@civicflow.demo` | `Admin@12345` |
| Citizen | `citizen@civicflow.demo` | `Citizen@123` |
| Contractor | `contractor@civicflow.demo` | `Contractor@123` |
| Contractor 2 | `contractor2@civicflow.demo` | `Contractor@123` |

The demo also creates citizens `citizen2@civicflow.demo` through `citizen5@civicflow.demo` (password `Citizen@123`) and contractors `contractor3@civicflow.demo` through `contractor16@civicflow.demo` (password `Contractor@123`). The 16 approved demo contractors provide **two crews for each service category**. Their phone numbers are intentionally invalid demo-only values.

With `DEMO_MODE=true`, startup safely adds 32 sample complaints across six Karnataka districts and the demo accounts if they are missing. The seed is repeatable and does not reset user reports or database volumes. Set `DEMO_MODE=false` to skip demo seeding.

## Demonstrate with 3–4 devices

1. Put your laptop and phones/tablets on the **same Wi-Fi network**. Guest Wi-Fi or a hotspot with device isolation may prevent devices from reaching one another.
2. Find your laptop’s local IPv4 address in PowerShell:

   ```powershell
   ipconfig
   ```

   Find the active Wi-Fi adapter’s IPv4 address, such as `192.168.1.25`.
3. On every phone or computer, open `http://192.168.1.25:3000` (replace the example IP with your laptop’s address).
4. If Windows Firewall asks, allow Docker Desktop / the app on your **private network**. Use a trusted network for the demonstration.
5. Suggested live sequence:
   - **Laptop — admin:** sign in as `admin@civicflow.demo`, open the complaint desk, and keep it visible.
   - **Phone 1 — citizen:** sign in as `citizen@civicflow.demo`, submit a “Streetlights” or “Roads & Potholes” report for Karnataka → Bengaluru Urban → Bengaluru East → Bengaluru. Attach a photo if available.
   - **Phone 2 — contractor:** sign in as `contractor@civicflow.demo`; matching streetlight work appears in the assigned work list. Open it, set **In progress**, post an update, and attach a progress photo.
   - **Phone 3 — admin or citizen:** observe the live dashboard/timeline update. Admin can reassign work; the citizen can see the progress without seeing staff-only audit controls.
6. For an assignment that definitely matches a seeded contractor, choose any of the six seeded Karnataka districts and one of the listed service categories. The two crews for that category are assigned to the central or coastal/northern district group.

GPS access may be blocked by mobile browsers on a local plain-HTTP address. The address selectors and manual location fields still work; use HTTPS if you need mobile GPS during a demonstration.

## Contractor onboarding

Contractor registration collects the person’s name, email, phone, password, company name, service location, service categories, business address, experience, coverage radius, and optional GSTIN. New profiles start as **Pending** and cannot sign in until an admin approves them. Admin accounts are seeded/configured privately and cannot be created through public registration.

Automatic routing matches the report category, state, and (when set) district. Among matching eligible contractors, the one with fewer active assignments is preferred. Admins can manually reassign from a complaint detail view. A contractor sees only assigned work and can add dated progress notes and evidence.

## GitHub Actions CI/CD

`.github/workflows/pipeline.yml` runs on pull requests and pushes to `main`:

1. Install dependencies, run the Node test suite, check JavaScript syntax, and audit production dependencies.
2. Build a Docker image with GitHub Actions cache. On branch/tag pushes, publish versioned and SHA-tagged images to GitHub Container Registry (GHCR).
3. Scan the published container for high and critical vulnerabilities with Trivy.
4. Optionally deploy the main branch to a staging server over SSH after configuring repository variables/secrets.

To enable deployment, create a `staging` GitHub Environment and set repository variable `DEPLOY_ENABLED=true`. Configure secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_PATH`, `GHCR_USERNAME`, and a read-capable `GHCR_TOKEN`. On the server, install Docker Compose, place a `.env` beside `docker-compose.prod.yml` with `POSTGRES_PASSWORD`, `JWT_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`, and create the target directory. The workflow copies the production Compose file, pulls the new image, and restarts the stack. Keep the server private/behind HTTPS and firewall rules.

## Data and source notes

The bundled administrative directory is derived from India’s Local Government Directory (LGD) through the open `kalyangupta12/indian-cities-data` project. Its included metadata snapshot is **23 September 2026** and contains 36 States/Union Territories, 784 districts, 7,092 sub-districts, and 5,050 urban local bodies. The source catalog is bundled for local use and has its own license and attribution under `public/data/README.md`. These administrative records do not contain every informal settlement or postal locality; the city/town fields allow a user to type a settlement name where an urban local body is not listed. Refresh the source snapshot before using it as an authoritative live directory.

Complaint coordinates are optional. The complaint form supports device GPS capture and manual latitude/longitude entry; the state, district, taluka, city, and address fields remain available when GPS is denied. No external map tile service or map API key is required.

## Important before public deployment

This is a portfolio/demo project, not a production city service. Change all demo passwords and `JWT_SECRET`, enable HTTPS, review privacy/retention rules, and add admin MFA, email/SMS delivery, malware scanning for uploads, backups, monitoring, and municipal authorization before handling real resident data. The demo uses a broad 48-hour service target; real service levels should be configured by the relevant authority.

## Main project files

- `server.js` — HTTP API, authentication, uploads, assignment, live updates.
- `db.js` — PostgreSQL schema and indexes.
- `seed.js` — safe first-start admin and demo content.
- `public/` — responsive client application and bundled India location data.
- `Dockerfile`, `docker-compose.yml` — local containerized stack.
- `.github/workflows/pipeline.yml` — CI, image release, scan, optional staging deploy.
