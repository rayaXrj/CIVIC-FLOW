const bcrypt=require('bcryptjs');
const {pool}=require('./db');
async function seed(){
  const adminEmail=process.env.ADMIN_EMAIL||'admin@civicflow.demo';
  let result=await pool.query('SELECT id FROM users WHERE email=$1',[adminEmail]);
  if(!result.rows[0]){
    const hash=await bcrypt.hash(process.env.ADMIN_PASSWORD||'Admin@12345',12);
    await pool.query(`INSERT INTO users(full_name,email,phone,password_hash,role,approval_status) VALUES($1,$2,$3,$4,'admin','approved')`,[process.env.ADMIN_NAME||'City Operations Head',adminEmail,'+91 90000 00001',hash]);
  }
  if(process.env.DEMO_MODE!=='false'){
    const demos=[
      {name:'Aarav Mehta',email:'citizen@civicflow.demo',phone:'+91 98765 43210',pass:'Citizen@123',role:'citizen'},
      {name:'BrightGrid Services',email:'contractor@civicflow.demo',phone:'+91 98765 43211',pass:'Contractor@123',role:'contractor',company:'BrightGrid Urban Works',categories:['Streetlights','Roads & Potholes','Public Spaces'],states:['Maharashtra'],districts:['Pune']},
      {name:'ClearFlow Civic Works',email:'contractor2@civicflow.demo',phone:'+91 98765 43212',pass:'Contractor@123',role:'contractor',company:'ClearFlow Civic Works',categories:['Water & Drainage','Waste & Sanitation'],states:['Maharashtra'],districts:['Pune']}
    ];
    for(const d of demos){
      const found=await pool.query('SELECT id FROM users WHERE email=$1',[d.email]);if(found.rows[0])continue;
      const hash=await bcrypt.hash(d.pass,10);
      await pool.query(`INSERT INTO users(full_name,email,phone,password_hash,role,company,categories,service_states,service_districts,approval_status,profile_json) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'approved',$10)`,[d.name,d.email,d.phone,hash,d.role,d.company||null,d.categories||[],d.states||[],d.districts||[],{experience:'5+ years',address:'Pune, Maharashtra',serviceRadius:'40 km'}]);
    }
    const citizen=(await pool.query('SELECT id FROM users WHERE email=$1',['citizen@civicflow.demo'])).rows[0];
    const count=(await pool.query('SELECT COUNT(*)::int count FROM complaints')).rows[0].count;
    if(citizen && count===0){
      const contractors=await pool.query(`SELECT id,categories FROM users WHERE role='contractor' AND approval_status='approved' ORDER BY id`);
      const samples=[
        {title:'Streetlight out near the public garden',description:'The streetlight has been off for three nights. The crossing is very dark after sunset.',category:'Streetlights',priority:'high',status:'assigned',district:'Pune',sub:'Haveli',city:'Pune',address:'Deccan Gymkhana, Pune, Maharashtra',assigned:contractors.rows[0]?.id},
        {title:'Water pooling after every rain',description:'Drainage grate is blocked and water is accumulating beside the bus stop.',category:'Water & Drainage',priority:'normal',status:'in_progress',district:'Pune',sub:'Haveli',city:'Pune',address:'Aundh Road, Pune, Maharashtra',assigned:contractors.rows[1]?.id}
      ];
      for(const s of samples){const q=await pool.query(`INSERT INTO complaints(citizen_id,assigned_to,title,description,category,priority,status,state,district,subdistrict,city,address,latitude,longitude,due_at,assigned_at) VALUES($1,$2,$3,$4,$5,$6,$7,'Maharashtra',$8,$9,$10,$11,18.52,73.85,NOW()+INTERVAL '24 hours',NOW()) RETURNING id`,[citizen.id,s.assigned,s.title,s.description,s.category,s.priority,s.status,s.district,s.sub,s.city,s.address]);await pool.query(`INSERT INTO progress_updates(complaint_id,author_id,status,message) VALUES($1,$2,$3,$4)`,[q.rows[0].id,s.assigned||citizen.id,s.status,s.status==='in_progress'?'Crew dispatched; site inspection underway.':'Automatically assigned based on category and service area.']);}
    }
  }
}
module.exports={seed};
