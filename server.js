const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const { pool, initDb } = require('./db');
const { seed } = require('./seed');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'local-demo-secret-change-before-deploy';
const uploadDir = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${path.extname(file.originalname).slice(0, 8)}`)
});
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024, files: 5 }, fileFilter: (_req, file, cb) => {
  const ok = /^(image\/(jpeg|png|webp)|application\/pdf)$/.test(file.mimetype);
  cb(ok ? null : new Error('Upload JPG, PNG, WEBP, or PDF files only.'), ok);
} });

const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: true, legacyHeaders: false });
const clean = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const makeToken = user => jwt.sign({ id: user.id, role: user.role, name: user.full_name }, JWT_SECRET, { expiresIn: '12h' });
function auth(...roles) {
  return async (req, res, next) => {
    try {
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const decoded = jwt.verify(token, JWT_SECRET);
      const { rows } = await pool.query('SELECT id, full_name, email, phone, role, company, categories, service_states, service_districts, approval_status FROM users WHERE id=$1', [decoded.id]);
      if (!rows[0]) return res.status(401).json({ error: 'Account not found.' });
      req.user = rows[0];
      if (roles.length && !roles.includes(req.user.role)) return res.status(403).json({ error: 'You do not have permission for this action.' });
      if (req.user.role === 'contractor' && req.user.approval_status !== 'approved' && !roles.includes('admin')) return res.status(403).json({ error: 'Your contractor profile is awaiting admin approval.' });
      next();
    } catch { res.status(401).json({ error: 'Please sign in again.' }); }
  };
}
function err(res, error) { console.error(error); res.status(error.status || 500).json({ error: error.status ? error.message : 'Something went wrong. Please try again.' }); }
const categories = ['Roads & Potholes', 'Water & Drainage', 'Streetlights', 'Waste & Sanitation', 'Parks & Public Spaces', 'Public Safety', 'Public Transport', 'Other'];

app.get('/api/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok', service: 'CivicFlow', time: new Date().toISOString() }); }
  catch { res.status(503).json({ status: 'database-unavailable' }); }
});
app.get('/api/meta', (_req, res) => res.json({ categories, locationData: 'bundled', roles: ['citizen', 'admin', 'contractor'] }));

app.get('/api/media/:filename', async (req,res)=>{
  try{
    const decoded=jwt.verify(String(req.query.token||''),JWT_SECRET);
    const userResult=await pool.query('SELECT id,role FROM users WHERE id=$1',[decoded.id]);
    if(!userResult.rows[0])return res.status(401).json({error:'Sign in to view this file.'});
    const fileUrl=`/uploads/${path.basename(req.params.filename)}`;
    const visible=await pool.query(`SELECT c.id,c.citizen_id,c.assigned_to FROM complaints c
      WHERE c.photos @> ARRAY[$1]::text[] OR EXISTS (
        SELECT 1 FROM progress_updates p CROSS JOIN LATERAL jsonb_array_elements(p.files) f
        WHERE p.complaint_id=c.id AND f->>'url'=$1
      )`,[fileUrl]);
    const user=userResult.rows[0];
    const allowed=user.role==='admin'||visible.rows.some(c=>c.citizen_id===user.id||c.assigned_to===user.id);
    if(!allowed)return res.status(404).json({error:'File not found.'});
    const absolute=path.join(uploadDir,path.basename(req.params.filename));
    if(!fs.existsSync(absolute))return res.status(404).json({error:'File not found.'});
    res.sendFile(absolute);
  }catch{res.status(401).json({error:'File link expired. Reopen the complaint to get a new link.'});}
});

app.post('/api/auth/register', loginLimit, async (req, res) => {
  try {
    const { fullName, email, phone, password, role } = req.body;
    if (!fullName || !email || !phone || !password) return res.status(400).json({ error: 'Name, email, phone, and password are required.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (!/^\+?[\d\s()-]{10,20}$/.test(String(phone).trim())) return res.status(400).json({ error: 'Enter a valid phone number, including country code if needed.' });
    if (!['citizen', 'contractor'].includes(role)) return res.status(400).json({ error: 'Choose citizen or contractor account.' });
    if (String(password).length < 8) return res.status(400).json({ error: 'Use a password with at least 8 characters.' });
    const hash = await bcrypt.hash(password, 12);
    const contractor = role === 'contractor';
    const categoriesInput = contractor ? (Array.isArray(req.body.categories) ? req.body.categories : []) : [];
    const states = contractor ? (Array.isArray(req.body.serviceStates) ? req.body.serviceStates : []) : [];
    const districts = contractor ? (Array.isArray(req.body.serviceDistricts) ? req.body.serviceDistricts : []) : [];
    if (contractor && (!req.body.company || !categoriesInput.length || !states.length)) return res.status(400).json({ error: 'Contractors must add company, categories, and at least one service state.' });
    const { rows } = await pool.query(`INSERT INTO users (full_name,email,phone,password_hash,role,company,categories,service_states,service_districts,approval_status,profile_json)
      VALUES ($1,lower($2),$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,full_name,email,phone,role,company,categories,service_states,service_districts,approval_status`,
      [clean(fullName,100), clean(email,180), clean(phone,24), hash, role, contractor ? clean(req.body.company,140) : null, categoriesInput, states, districts, contractor ? 'pending' : 'approved', contractor ? {
        address: clean(req.body.address,300), city: clean(req.body.city,100), state: clean(req.body.state,100), district: clean(req.body.district,100), subdistrict: clean(req.body.subdistrict,100), experience: clean(req.body.experience,80), gst: clean(req.body.gst,40), serviceRadius: clean(req.body.serviceRadius,30)
      } : {}]);
    if (contractor) return res.status(201).json({ pending: true, message: 'Profile sent to the city admin for verification.' });
    res.status(201).json({ token: makeToken(rows[0]), user: rows[0] });
  } catch (e) { err(res, e.code === '23505' ? Object.assign(new Error('An account with this email already exists.'), { status: 409 }) : e); }
});

app.post('/api/auth/login', loginLimit, async (req, res) => {
  try {
    const email = clean(req.body.email, 180).toLowerCase();
    const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    if (!rows[0] || !(await bcrypt.compare(String(req.body.password || ''), rows[0].password_hash))) return res.status(401).json({ error: 'Email or password is incorrect.' });
    if (rows[0].role === 'contractor' && rows[0].approval_status !== 'approved') return res.status(403).json({ error: 'Your contractor profile is still awaiting admin approval.' });
    const { password_hash, ...user } = rows[0];
    res.json({ token: makeToken(user), user });
  } catch (e) { err(res, e); }
});
app.get('/api/auth/me', auth(), (req, res) => res.json({ user: req.user }));

const complaintSelect = `SELECT c.*, u.full_name AS citizen_name,
  a.full_name AS contractor_name, a.phone AS contractor_phone, a.company AS contractor_company,
  a.email AS contractor_email, (SELECT json_agg(json_build_object('id',p.id,'message',p.message,'status',p.status,'created_at',p.created_at,'author_name',x.full_name,'author_role',x.role,'files',p.files) ORDER BY p.created_at DESC) FROM progress_updates p JOIN users x ON x.id=p.author_id WHERE p.complaint_id=c.id) AS updates
  FROM complaints c JOIN users u ON c.citizen_id=u.id LEFT JOIN users a ON c.assigned_to=a.id`;

app.get('/api/dashboard', auth(), async (req, res) => {
  try {
    const user = req.user;
    let condition = '', values = [];
    if (user.role === 'citizen') { condition = 'WHERE c.citizen_id=$1'; values = [user.id]; }
    if (user.role === 'contractor') { condition = 'WHERE c.assigned_to=$1'; values = [user.id]; }
    const complaints = await pool.query(`${complaintSelect} ${condition} ORDER BY c.created_at DESC LIMIT 250`, values);
    let stats;
    if (user.role === 'admin') {
      stats = (await pool.query(`SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE status IN ('submitted','assigned','in_progress'))::int active,
        COUNT(*) FILTER (WHERE priority='urgent' AND status NOT IN ('resolved','closed'))::int urgent,
        COUNT(*) FILTER (WHERE status='resolved')::int resolved,
        COUNT(*) FILTER (WHERE status NOT IN ('resolved','closed') AND due_at<NOW())::int overdue FROM complaints`)).rows[0];
    } else {
      stats = (await pool.query(`SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE status IN ('submitted','assigned','in_progress'))::int active,
        COUNT(*) FILTER (WHERE priority='urgent' AND status NOT IN ('resolved','closed'))::int urgent,
        COUNT(*) FILTER (WHERE status='resolved')::int resolved, 0::int overdue FROM complaints c WHERE ${user.role === 'citizen' ? 'citizen_id' : 'assigned_to'}=$1`, [user.id])).rows[0];
    }
    const contractors = user.role === 'admin' ? (await pool.query(`SELECT id,full_name,email,phone,company,categories,service_states,service_districts,approval_status,profile_json,created_at FROM users WHERE role='contractor' ORDER BY approval_status,full_name`)).rows : [];
    const notices = (await pool.query(`SELECT id,title,body,severity,created_at FROM announcements WHERE audience IN ('all',$1) ORDER BY created_at DESC LIMIT 5`, [user.role])).rows;
    res.json({ complaints: complaints.rows, stats, contractors, notices, categories });
  } catch (e) { err(res, e); }
});

app.post('/api/complaints', auth('citizen'), upload.array('photos', 5), async (req, res) => {
  const client = await pool.connect();
  try {
    const { title, description, category, priority, state, district, subdistrict, city, address, lat, lng } = req.body;
    if (!title || !description || !category || !state || !district || !subdistrict || !city || !address) return res.status(400).json({ error: 'Complete the complaint and India location fields.' });
    if (!categories.includes(category)) return res.status(400).json({ error: 'Choose a valid complaint category.' });
    if ((lat && (!Number.isFinite(Number(lat)) || Number(lat)<-90 || Number(lat)>90)) || (lng && (!Number.isFinite(Number(lng)) || Number(lng)<-180 || Number(lng)>180))) return res.status(400).json({ error: 'Check the map coordinates.' });
    await client.query('BEGIN');
    const result = await client.query(`INSERT INTO complaints (citizen_id,title,description,category,priority,state,district,subdistrict,city,address,latitude,longitude,status,photos,due_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'submitted',$13,NOW()+INTERVAL '48 hours') RETURNING *`,
      [req.user.id,clean(title,140),clean(description,3000),category,['low','normal','high','urgent'].includes(priority)?priority:'normal',clean(state,100),clean(district,100),clean(subdistrict,140),clean(city,140),clean(address,300),lat && Number.isFinite(Number(lat))?Number(lat):null,lng && Number.isFinite(Number(lng))?Number(lng):null,(req.files||[]).map(f=>`/uploads/${f.filename}`)]);
    const complaint = result.rows[0];
    const matching = await client.query(`SELECT id FROM users WHERE role='contractor' AND approval_status='approved' AND categories @> ARRAY[$1]::text[]
      AND service_states @> ARRAY[$2]::text[] AND (cardinality(service_districts)=0 OR service_districts @> ARRAY[$3]::text[])
      ORDER BY (SELECT COUNT(*) FROM complaints WHERE assigned_to=users.id AND status IN ('assigned','in_progress')) ASC, users.created_at ASC LIMIT 1`, [category,state,district]);
    if (matching.rows[0]) {
      await client.query(`UPDATE complaints SET assigned_to=$1,status='assigned',assigned_at=NOW(),updated_at=NOW() WHERE id=$2`,[matching.rows[0].id,complaint.id]);
      await client.query(`INSERT INTO audit_events (complaint_id,actor_id,action,details) VALUES ($1,$2,'auto_assigned',$3)`,[complaint.id,req.user.id,JSON.stringify({contractorId:matching.rows[0].id,category,state,district})]);
    }
    await client.query('COMMIT');
    const row = (await pool.query(`${complaintSelect} WHERE c.id=$1`,[complaint.id])).rows[0];
    io.emit('complaint:changed',{id:complaint.id});
    res.status(201).json({ complaint: row, autoAssigned: Boolean(matching.rows[0]) });
  } catch (e) { await client.query('ROLLBACK'); err(res,e); }
  finally { client.release(); }
});

app.patch('/api/complaints/:id/assign', auth('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id); const contractorId = req.body.contractorId ? Number(req.body.contractorId) : null;
    if (contractorId) {
      const contractor = await pool.query(`SELECT id FROM users WHERE id=$1 AND role='contractor' AND approval_status='approved'`,[contractorId]);
      if (!contractor.rows[0]) return res.status(400).json({error:'Select an approved contractor.'});
    }
    const result = await pool.query(`UPDATE complaints SET assigned_to=$1::integer,status=CASE WHEN $1::integer IS NULL THEN 'submitted' WHEN status='submitted' THEN 'assigned' ELSE status END,assigned_at=CASE WHEN $1::integer IS NULL THEN NULL ELSE NOW() END,updated_at=NOW() WHERE id=$2 RETURNING id`,[contractorId,id]);
    if (!result.rowCount) return res.status(404).json({error:'Complaint not found.'});
    await pool.query(`INSERT INTO audit_events (complaint_id,actor_id,action,details) VALUES ($1,$2,'assignment_changed',$3)`,[id,req.user.id,JSON.stringify({contractorId,reason:clean(req.body.reason,500)})]);
    io.emit('complaint:changed',{id});
    res.json({ok:true});
  } catch(e){err(res,e);}
});

app.patch('/api/complaints/:id/status', auth('admin','contractor'), async (req,res)=>{
  try {
    const id=Number(req.params.id), status=clean(req.body.status,30);
    const allowed=['assigned','in_progress','on_hold','resolved','closed'];
    if(!allowed.includes(status)) return res.status(400).json({error:'Choose a valid status.'});
    if(req.user.role==='contractor'){
      const owns=await pool.query('SELECT id FROM complaints WHERE id=$1 AND assigned_to=$2',[id,req.user.id]);
      if(!owns.rows[0]) return res.status(403).json({error:'You can update only work assigned to you.'});
    }
    const result=await pool.query(`UPDATE complaints SET status=$1,updated_at=NOW(),resolved_at=CASE WHEN $1='resolved' THEN NOW() ELSE resolved_at END WHERE id=$2 RETURNING id`,[status,id]);
    if(!result.rowCount) return res.status(404).json({error:'Complaint not found.'});
    await pool.query(`INSERT INTO progress_updates (complaint_id,author_id,status,message,files) VALUES ($1,$2,$3,$4,'{}')`,[id,req.user.id,status,clean(req.body.message||`Status updated to ${status.replace('_',' ')}.`,1000)]);
    await pool.query(`INSERT INTO audit_events (complaint_id,actor_id,action,details) VALUES ($1,$2,'status_changed',$3)`,[id,req.user.id,JSON.stringify({status})]);
    io.emit('complaint:changed',{id}); res.json({ok:true});
  }catch(e){err(res,e);}
});

app.post('/api/complaints/:id/progress', auth('admin','contractor'), upload.array('files',5), async(req,res)=>{
  try{
    const id=Number(req.params.id);
    const c=await pool.query('SELECT assigned_to FROM complaints WHERE id=$1',[id]);
    if(!c.rows[0]) return res.status(404).json({error:'Complaint not found.'});
    if(req.user.role==='contractor' && c.rows[0].assigned_to!==req.user.id) return res.status(403).json({error:'You can update only work assigned to you.'});
    const files=(req.files||[]).map(f=>({name:f.originalname.slice(0,150),url:`/uploads/${f.filename}`}));
    const status=clean(req.body.status,30)||null;
    await pool.query(`INSERT INTO progress_updates (complaint_id,author_id,status,message,files) VALUES ($1,$2,$3,$4,$5)`,[id,req.user.id,status,clean(req.body.message,1000)||'Progress update added.',JSON.stringify(files)]);
    if(status && ['assigned','in_progress','on_hold','resolved'].includes(status)) await pool.query(`UPDATE complaints SET status=$1::varchar,updated_at=NOW(),resolved_at=CASE WHEN $3::boolean THEN NOW() ELSE resolved_at END WHERE id=$2`,[status,id,status==='resolved']);
    await pool.query(`INSERT INTO audit_events (complaint_id,actor_id,action,details) VALUES ($1,$2,'progress_added',$3)`,[id,req.user.id,JSON.stringify({message:clean(req.body.message,500),files:files.length,status})]);
    io.emit('complaint:changed',{id});res.status(201).json({ok:true});
  }catch(e){err(res,e);}
});

app.patch('/api/contractors/:id/approval',auth('admin'),async(req,res)=>{
  try{
    const status=clean(req.body.status,20); if(!['approved','rejected','pending'].includes(status)) return res.status(400).json({error:'Invalid approval state.'});
    const result=await pool.query(`UPDATE users SET approval_status=$1 WHERE id=$2 AND role='contractor' RETURNING id`,[status,Number(req.params.id)]);
    if(!result.rowCount)return res.status(404).json({error:'Contractor not found.'});
    io.emit('contractor:changed',{id:Number(req.params.id)});res.json({ok:true});
  }catch(e){err(res,e);}
});

app.post('/api/announcements',auth('admin'),async(req,res)=>{
  try{
    const {rows}=await pool.query(`INSERT INTO announcements (title,body,severity,audience,author_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`,[clean(req.body.title,140),clean(req.body.body,1000),['info','warning','urgent'].includes(req.body.severity)?req.body.severity:'info',['all','citizen','contractor'].includes(req.body.audience)?req.body.audience:'all',req.user.id]);
    io.emit('announcement:new',rows[0]);res.status(201).json({announcement:rows[0]});
  }catch(e){err(res,e);}
});
app.get('/api/audit/:id',auth('admin'),async(req,res)=>{
  try{const {rows}=await pool.query(`SELECT a.*,u.full_name AS actor_name FROM audit_events a LEFT JOIN users u ON u.id=a.actor_id WHERE complaint_id=$1 ORDER BY created_at DESC`,[Number(req.params.id)]);res.json({events:rows});}
  catch(e){err(res,e);}
});

io.on('connection', socket=>{ socket.on('join-user', ({token}={})=>{try{const u=jwt.verify(token,JWT_SECRET);socket.join(`user:${u.id}`);}catch{}}); });
app.use((error,_req,res,_next)=>{ if(error instanceof multer.MulterError) return res.status(400).json({error:error.code==='LIMIT_FILE_SIZE'?'Each file must be 8 MB or smaller.':'Too many files.'}); err(res,error); });

(async()=>{
  await initDb(); await seed();
  server.listen(PORT,'0.0.0.0',()=>console.log(`CivicFlow running on 0.0.0.0:${PORT}`));
})().catch(e=>{console.error('Startup failed',e);process.exit(1);});
