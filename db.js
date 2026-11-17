const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://civicflow:civicflow_local@localhost:5432/civicflow', max: 15, idleTimeoutMillis: 30000 });

async function initDb(){
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, full_name VARCHAR(100) NOT NULL, email VARCHAR(180) UNIQUE NOT NULL, phone VARCHAR(24) NOT NULL,
    password_hash TEXT NOT NULL, role VARCHAR(20) NOT NULL CHECK(role IN ('citizen','admin','contractor')),
    company VARCHAR(140), categories TEXT[] NOT NULL DEFAULT '{}', service_states TEXT[] NOT NULL DEFAULT '{}', service_districts TEXT[] NOT NULL DEFAULT '{}',
    approval_status VARCHAR(20) NOT NULL DEFAULT 'approved', profile_json JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS complaints (
    id SERIAL PRIMARY KEY, citizen_id INT NOT NULL REFERENCES users(id), assigned_to INT REFERENCES users(id), title VARCHAR(140) NOT NULL, description TEXT NOT NULL,
    category VARCHAR(80) NOT NULL, priority VARCHAR(20) NOT NULL DEFAULT 'normal', status VARCHAR(30) NOT NULL DEFAULT 'submitted',
    state VARCHAR(100) NOT NULL, district VARCHAR(100) NOT NULL, subdistrict VARCHAR(140) NOT NULL, city VARCHAR(140) NOT NULL, address VARCHAR(300) NOT NULL,
    latitude DOUBLE PRECISION, longitude DOUBLE PRECISION, photos TEXT[] NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), assigned_at TIMESTAMPTZ, resolved_at TIMESTAMPTZ, due_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS complaints_assigned_status_idx ON complaints(assigned_to,status);
  CREATE INDEX IF NOT EXISTS complaints_location_idx ON complaints(state,district,subdistrict,city);
  CREATE INDEX IF NOT EXISTS complaints_created_idx ON complaints(created_at DESC);
  CREATE TABLE IF NOT EXISTS progress_updates (
    id SERIAL PRIMARY KEY, complaint_id INT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE, author_id INT NOT NULL REFERENCES users(id), status VARCHAR(30), message VARCHAR(1000) NOT NULL, files JSONB NOT NULL DEFAULT '[]', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS audit_events (
    id SERIAL PRIMARY KEY, complaint_id INT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE, actor_id INT REFERENCES users(id), action VARCHAR(80) NOT NULL, details JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS announcements (
    id SERIAL PRIMARY KEY, title VARCHAR(140) NOT NULL, body VARCHAR(1000) NOT NULL, severity VARCHAR(20) NOT NULL DEFAULT 'info', audience VARCHAR(20) NOT NULL DEFAULT 'all', author_id INT REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`);
}
module.exports={pool,initDb};
