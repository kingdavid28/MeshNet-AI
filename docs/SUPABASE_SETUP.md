# Supabase Setup Instructions

## Overview
MeshNet can optionally use Supabase for cloud storage and real-time synchronization. This is optional for local development but recommended for production deployments.

## Prerequisites
- Supabase account (free tier available)
- Basic understanding of PostgreSQL

## Setup Steps

### 1. Create Supabase Project
1. Go to [supabase.com](https://supabase.com)
2. Sign up or log in
3. Click "New Project"
4. Choose organization (or create one)
5. Enter project name: `meshnet-ai`
6. Set database password (save this securely)
7. Select region closest to your users
8. Click "Create new project"
9. Wait for project setup (~2 minutes)

### 2. Get Project Credentials
1. Go to Project Settings → API
2. Copy the following values:
   - **Project URL**: `https://xxx.supabase.co`
   - **anon/public key**: Public API key
   - **service_role key**: Private API key (keep secret)

### 3. Configure Environment Variables

#### Frontend (`.env.local`)
```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

#### Backend (`backend/config/.env`)
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
SUPABASE_DB_URL=postgresql://postgres:[password]@db.xxx.supabase.co:5432/postgres
```

### 4. Database Schema Setup

Run the following SQL in Supabase SQL Editor:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create nodes table
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  name TEXT NOT NULL,
  device TEXT NOT NULL CHECK (device IN ('smartphone', 'laptop')),
  role TEXT NOT NULL CHECK (role IN ('peer', 'relay')),
  signal INTEGER NOT NULL CHECK (signal >= 0 AND signal <= 100),
  battery_percentage INTEGER NOT NULL CHECK (battery_percentage >= 0 AND battery_percentage <= 100),
  bluetooth_status INTEGER NOT NULL CHECK (bluetooth_status IN (0, 1)),
  wifi_status INTEGER NOT NULL CHECK (wifi_status IN (0, 1)),
  os TEXT,
  lat REAL,
  lng REAL,
  last_seen TEXT NOT NULL,
  registered TEXT NOT NULL DEFAULT NOW()
);

-- Create edges table
CREATE TABLE IF NOT EXISTS edges (
  id SERIAL PRIMARY KEY,
  node_a TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  node_b TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  protocol TEXT NOT NULL CHECK (protocol IN ('wifi', 'bluetooth')),
  quality INTEGER NOT NULL CHECK (quality >= 0 AND quality <= 100),
  observed_at TEXT NOT NULL DEFAULT NOW(),
  UNIQUE(node_a, node_b, protocol)
);

-- Create alerts table
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  from_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  from_label TEXT NOT NULL,
  message TEXT,
  lat REAL,
  lng REAL,
  ttl INTEGER NOT NULL,
  acknowledged INTEGER NOT NULL DEFAULT 0 CHECK (acknowledged IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT NOW(),
  expires_at TEXT
);

-- Enable Row Level Security
ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

-- Create policies (adjust based on your security requirements)
CREATE POLICY "Allow all access" ON nodes FOR ALL USING (true);
CREATE POLICY "Allow all access" ON edges FOR ALL USING (true);
CREATE POLICY "Allow all access" ON alerts FOR ALL USING (true);
```

### 5. Real-time Subscriptions (Optional)

For real-time updates, enable Realtime for your tables:
1. Go to Database → Replication
2. Enable for tables: `nodes`, `edges`, `alerts`
3. Choose publications: `all` or specific tables

### 6. Testing

Test your Supabase connection:

```bash
# Frontend test
curl https://your-project.supabase.co/rest/v1/nodes \
  -H "apikey: your-anon-key" \
  -H "Authorization: Bearer your-anon-key"

# Backend test
# The backend will automatically use Supabase if credentials are configured
```

## Security Notes

### Important Security Practices
- **Never commit** service role keys to git
- **Use environment variables** for all credentials
- **Enable RLS** (Row Level Security) in production
- **Restrict API keys** to specific domains in Supabase dashboard
- **Rotate keys** periodically

### Development vs Production
- **Development**: Can use anon key for testing
- **Production**: Use service role key for backend operations
- **Frontend**: Always use anon key (public)

## Troubleshooting

### Connection Issues
- Verify URL format: `https://xxx.supabase.co`
- Check network connectivity
- Verify API key format (no extra spaces)

### Permission Errors
- Check RLS policies in Supabase dashboard
- Verify service role key for backend operations
- Ensure tables exist in database

### Performance Issues
- Enable database indexes on frequently queried columns
- Use connection pooling for high-traffic scenarios
- Consider Supabase Pro tier for production

## Alternative: Local Development Without Supabase

For local development, you can:
1. Leave Supabase credentials empty in `.env` files
2. Use SQLite database (default)
3. The app will fall back to local storage

## Migration from SQLite to Supabase

To migrate existing data:
```sql
-- Export SQLite data
-- Import to Supabase using SQL Editor or API
-- Update environment variables to use Supabase
```

## Cost Considerations

- **Free Tier**: 500MB database, 1GB bandwidth, 2 API calls/second
- **Pro Tier**: Starts at $25/month for higher limits
- **Enterprise**: Custom pricing for large deployments

## Support

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Discord](https://supabase.com/discord)
- [GitHub Issues](https://github.com/supabase/supabase)
