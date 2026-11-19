const bcrypt=require('bcryptjs');
const {pool}=require('./db');

const CATEGORIES=['Roads & Potholes','Water & Drainage','Streetlights','Waste & Sanitation','Parks & Public Spaces','Public Safety','Public Transport','Other'];
const DEMO_DISTRICTS=['Bengaluru Urban','Mysuru','Mandya','Dakshina Kannada','Dharwad','Belagavi'];
const DISTRICT_INFO={
  'Bengaluru Urban':{taluka:'Bengaluru East',city:'Bengaluru',latitude:12.9716,longitude:77.5946,zone:'central'},
  'Mysuru':{taluka:'Mysuru',city:'Mysuru',latitude:12.2958,longitude:76.6394,zone:'central'},
  'Mandya':{taluka:'Mandya',city:'Mandya',latitude:12.5220,longitude:76.8970,zone:'central'},
  'Dakshina Kannada':{taluka:'Mangaluru',city:'Mangaluru',latitude:12.9141,longitude:74.8560,zone:'coastal-north'},
  'Dharwad':{taluka:'Hubballi',city:'Hubballi',latitude:15.3647,longitude:75.1240,zone:'coastal-north'},
  'Belagavi':{taluka:'Belagavi',city:'Belagavi',latitude:15.8497,longitude:74.4977,zone:'coastal-north'}
};

const DEMO_CITIZENS=[
  {name:'Aarav Mehta',email:'citizen@civicflow.demo',phone:'+91 00000 20001',password:'Citizen@123',profile:{homeState:'Karnataka',homeDistrict:'Bengaluru Urban',homeSubdistrict:'Bengaluru East',homeCity:'Bengaluru'}},
  {name:'Ananya Rao',email:'citizen2@civicflow.demo',phone:'+91 00000 20002',password:'Citizen@123',profile:{homeState:'Karnataka',homeDistrict:'Mysuru',homeSubdistrict:'Mysuru',homeCity:'Mysuru'}},
  {name:'Sanjay Kumar',email:'citizen3@civicflow.demo',phone:'+91 00000 20003',password:'Citizen@123',profile:{homeState:'Karnataka',homeDistrict:'Mandya',homeSubdistrict:'Mandya',homeCity:'Mandya'}},
  {name:'Nisha Shetty',email:'citizen4@civicflow.demo',phone:'+91 00000 20004',password:'Citizen@123',profile:{homeState:'Karnataka',homeDistrict:'Dakshina Kannada',homeSubdistrict:'Mangaluru',homeCity:'Mangaluru'}},
  {name:'Kiran Patil',email:'citizen5@civicflow.demo',phone:'+91 00000 20005',password:'Citizen@123',profile:{homeState:'Karnataka',homeDistrict:'Dharwad',homeSubdistrict:'Hubballi',homeCity:'Hubballi'}}
];

const CONTRACTOR_PAIRS=[
  {category:'Roads & Potholes',companies:['UrbanGrid Road Response','RoadCare Karnataka'],accountNumbers:[3,4]},
  {category:'Water & Drainage',companies:['Jala Mitra Works','BlueCurrent Utilities'],accountNumbers:[2,5]},
  {category:'Streetlights',companies:['Prakash Grid Services','Luma Karnataka'],accountNumbers:[1,6]},
  {category:'Waste & Sanitation',companies:['GreenLoop Sanitation','CleanWard Works'],accountNumbers:[7,8]},
  {category:'Parks & Public Spaces',companies:['Namma GreenSpaces','UrbanCanopy Care'],accountNumbers:[9,10]},
  {category:'Public Safety',companies:['SafeStreets Response','CivicShield Karnataka'],accountNumbers:[11,12]},
  {category:'Public Transport',companies:['TransitLink Works','Namma Mobility Support'],accountNumbers:[13,14]},
  {category:'Other',companies:['CivicFix Field Services','Janaseva Response Team'],accountNumbers:[15,16]}
];

function contractorEmail(accountNumber){
  if(accountNumber===1)return 'contractor@civicflow.demo';
  if(accountNumber===2)return 'contractor2@civicflow.demo';
  return `contractor${accountNumber}@civicflow.demo`;
}
const DEMO_CONTRACTORS=CONTRACTOR_PAIRS.flatMap(pair=>pair.companies.map((company,index)=>{
  const accountNumber=pair.accountNumbers[index],zone=index===0?'central':'coastal-north';
  const districts=zone==='central'?['Bengaluru Urban','Mysuru','Mandya']:['Dakshina Kannada','Dharwad','Belagavi'];
  const base=DISTRICT_INFO[districts[0]];
  return {accountNumber,email:contractorEmail(accountNumber),name:`Demo Crew Lead ${String(accountNumber).padStart(2,'0')}`,phone:`+91 00000 ${String(10000+accountNumber).padStart(5,'0')}`,password:'Contractor@123',company,category:pair.category,districts,profile:{state:'Karnataka',district:districts[0],subdistrict:base.taluka,city:base.city,address:`${base.city}, Karnataka · demo service base`,experience:'Municipal service team',serviceRadius:'Multi-district demo coverage'}};
}));

const COMPLAINT_ROWS=[
  {category:'Roads & Potholes',title:'Deep pothole at the ward school approach',description:'A deep pothole has widened beside the school entrance and is forcing two-wheelers into traffic.',district:'Bengaluru Urban',address:'Ward 14 school approach road',offset:0.0002},
  {category:'Roads & Potholes',title:'Large pothole outside the ward school gate',description:'The pothole by the school gate is getting deeper and vehicles are swerving around it.',district:'Bengaluru Urban',address:'Near the ward school gate',offset:0.0004},
  {category:'Roads & Potholes',title:'Damaged asphalt on the market bus route',description:'Loose asphalt has created an uneven patch where buses turn toward the public market.',district:'Mysuru',address:'Public market bus-route junction',offset:0.003},
  {category:'Roads & Potholes',title:'Road shoulder breaking after heavy rain',description:'The road edge has crumbled near the bus stop and needs a safety barricade and repair.',district:'Belagavi',address:'Ward 6 bus-stop approach',offset:-0.002},

  {category:'Water & Drainage',title:'Water leak near the public market entrance',description:'Clean water is running continuously from a damaged pipe joint beside the market entrance.',district:'Mysuru',address:'Public market entrance lane',offset:0.0002},
  {category:'Water & Drainage',title:'Pipe joint leaking outside the market gate',description:'A steady leak from the pipe beside the market gate is flooding the footpath.',district:'Mysuru',address:'Market gate footpath',offset:0.0005},
  {category:'Water & Drainage',title:'Drain overflow after evening rain',description:'A blocked storm-water drain is overflowing onto the pedestrian path after rainfall.',district:'Dakshina Kannada',address:'Ward 22 coastal bus-stop road',offset:0.004},
  {category:'Water & Drainage',title:'Low water pressure in ward distribution line',description:'Several public taps have weak flow since the distribution valve was repaired.',district:'Belagavi',address:'Ward 9 public water point',offset:-0.003},

  {category:'Streetlights',title:'Streetlight out beside the main bus stop',description:'The streetlight has been dark for three nights, leaving the crossing unsafe after sunset.',district:'Bengaluru Urban',address:'Main bus-stop crossing, Ward 18',offset:0.001},
  {category:'Streetlights',title:'Dark streetlight near the bus-stop crossing',description:'A lamp beside the bus stop is not working and the pedestrian crossing is very dark.',district:'Bengaluru Urban',address:'Pedestrian crossing near Ward 18 bus stop',offset:0.0013},
  {category:'Streetlights',title:'Two lamps not working near lake walking path',description:'The stretch between the public park gate and lake path has two failed lights.',district:'Dharwad',address:'Public lake walking-path approach',offset:-0.002},
  {category:'Streetlights',title:'Lighting failure along ward market road',description:'Several lights on the market road switch off early, making the pavement difficult to use.',district:'Dakshina Kannada',address:'Ward market road',offset:0.003},

  {category:'Waste & Sanitation',title:'Overflowing waste bin beside the ward market',description:'The public bin has overflowed and loose waste is spreading onto the pavement.',district:'Bengaluru Urban',address:'Ward 11 market entrance',offset:0.0015},
  {category:'Waste & Sanitation',title:'Waste spilling from the market collection point',description:'The collection bin near the market is full and rubbish is blocking the walking path.',district:'Bengaluru Urban',address:'Market collection point, Ward 11',offset:0.0017},
  {category:'Waste & Sanitation',title:'Missed segregated-waste pickup this week',description:'The dry and wet waste containers have not been cleared on the scheduled collection days.',district:'Mandya',address:'Ward 4 community collection point',offset:0.003},
  {category:'Waste & Sanitation',title:'Construction debris left beside public road',description:'Broken tiles and rubble from nearby public works remain on the roadside after completion.',district:'Belagavi',address:'Ward 16 public road edge',offset:-0.002},

  {category:'Parks & Public Spaces',title:'Playground swing chain needs repair',description:'One swing has a loose chain and the play area should be checked before children use it.',district:'Mysuru',address:'Ward 7 children’s park',offset:0.002},
  {category:'Parks & Public Spaces',title:'Broken public bench near the walking track',description:'A bench plank has broken along the park walking track and needs replacement.',district:'Mandya',address:'Central ward park walking track',offset:-0.001},
  {category:'Parks & Public Spaces',title:'Park sprinkler leaking onto the footpath',description:'A damaged irrigation sprinkler is flooding the footpath and wasting water each morning.',district:'Bengaluru Urban',address:'Ward 25 public garden',offset:-0.002},
  {category:'Parks & Public Spaces',title:'Overgrown vegetation on lake-side path',description:'Plants are narrowing the public path and visibility around the bend is reduced.',district:'Dharwad',address:'Lake-side public path',offset:0.0025},

  {category:'Public Safety',title:'Open manhole on the pedestrian route',description:'A drain cover is missing near the crossing and creates a serious fall risk at night.',district:'Bengaluru Urban',address:'Ward 31 pedestrian crossing',offset:-0.003},
  {category:'Public Safety',title:'Loose safety railing beside the bridge approach',description:'The handrail moves when touched and the edge has no temporary warning barrier.',district:'Dakshina Kannada',address:'Public bridge approach road',offset:-0.001},
  {category:'Public Safety',title:'Damaged traffic mirror at a blind junction',description:'The road-safety mirror is cracked and drivers cannot see traffic approaching from the side lane.',district:'Belagavi',address:'Ward 3 blind junction',offset:0.002},
  {category:'Public Safety',title:'Exposed cable near the community market',description:'A low-hanging cable is exposed beside the public walkway and needs urgent inspection.',district:'Mandya',address:'Community market pedestrian lane',offset:0.001},

  {category:'Public Transport',title:'Bus shelter roof leaking during rain',description:'Rainwater enters through a damaged shelter panel and soaks the waiting area.',district:'Bengaluru Urban',address:'Ward 20 bus shelter',offset:0.004},
  {category:'Public Transport',title:'Bus arrival display is blank at the stop',description:'The public route display has not shown arrival information for several days.',district:'Mysuru',address:'City bus stop near public library',offset:-0.003},
  {category:'Public Transport',title:'Bus bay blocked by parked vehicles',description:'Private vehicles are using the marked bus bay and buses stop in the traffic lane.',district:'Dakshina Kannada',address:'Ward 8 main-road bus bay',offset:0.002},
  {category:'Public Transport',title:'Public bus stop needs an accessible ramp',description:'The stop has a high curb and no ramp for wheelchair users or people with strollers.',district:'Dharwad',address:'Ward 12 accessible bus stop',offset:-0.003},

  {category:'Other',title:'Public drinking fountain is not working',description:'The fountain beside the public walking path has no water flow and needs maintenance.',district:'Bengaluru Urban',address:'Ward 27 public walking path',offset:-0.004},
  {category:'Other',title:'Public toilet tap broken in the community block',description:'The wash-area tap is broken and water is running onto the floor.',district:'Mysuru',address:'Community toilet block, Ward 10',offset:0.004},
  {category:'Other',title:'Handrail loose at the community hall ramp',description:'The ramp handrail shifts under weight and should be secured for older visitors.',district:'Mandya',address:'Ward 2 community hall entrance',offset:-0.003},
  {category:'Other',title:'Roadwork warning sign fallen on sidewalk',description:'A temporary work-zone sign has fallen across the walking route and needs repositioning.',district:'Belagavi',address:'Ward 19 sidewalk near public works site',offset:0.004}
];
const STATUS_CYCLE=['submitted','assigned','in_progress','resolved','submitted','on_hold','assigned','closed'];
const PRIORITY_CYCLE=['normal','high','urgent','normal','low','high','normal','low'];
const DEMO_COMPLAINTS=COMPLAINT_ROWS.map((row,index)=>{
  const place=DISTRICT_INFO[row.district];
  return {...row,state:'Karnataka',subdistrict:place.taluka,city:place.city,latitude:Number((place.latitude+row.offset).toFixed(6)),longitude:Number((place.longitude+row.offset*0.72).toFixed(6)),status:STATUS_CYCLE[index%STATUS_CYCLE.length],priority:PRIORITY_CYCLE[index%PRIORITY_CYCLE.length],ageDays:2+(index*7)%35};
});

async function ensureCitizen(demo){
  const existing=await pool.query(`UPDATE users SET profile_json=COALESCE(profile_json,'{}'::jsonb)||$1::jsonb WHERE email=$2 RETURNING id`,[demo.profile,demo.email]);
  if(existing.rows[0])return existing.rows[0].id;
  const passwordHash=await bcrypt.hash(demo.password,10);
  const inserted=await pool.query(`INSERT INTO users(full_name,email,phone,password_hash,role,approval_status,profile_json)
    VALUES($1,$2,$3,$4,'citizen','approved',$5) RETURNING id`,[demo.name,demo.email,demo.phone,passwordHash,demo.profile]);
  return inserted.rows[0].id;
}

async function ensureContractor(demo){
  const existing=await pool.query('SELECT id FROM users WHERE email=$1',[demo.email]);
  if(existing.rows[0]){
    const updated=await pool.query(`UPDATE users SET full_name=$1,phone=$2,role='contractor',company=$3,categories=$4,
      service_states=$5,service_districts=$6,approval_status='approved',profile_json=$7 WHERE id=$8 RETURNING id`,
      [demo.name,demo.phone,demo.company,[demo.category],['Karnataka'],demo.districts,demo.profile,existing.rows[0].id]);
    return updated.rows[0].id;
  }
  const passwordHash=await bcrypt.hash(demo.password,10);
  const inserted=await pool.query(`INSERT INTO users(full_name,email,phone,password_hash,role,company,categories,service_states,service_districts,approval_status,profile_json)
    VALUES($1,$2,$3,$4,'contractor',$5,$6,$7,$8,'approved',$9) RETURNING id`,
    [demo.name,demo.email,demo.phone,passwordHash,demo.company,[demo.category],['Karnataka'],demo.districts,demo.profile]);
  return inserted.rows[0].id;
}

const progressMessage={
  submitted:'Demo report submitted and awaiting supervisor review.',
  assigned:'The report was reviewed and assigned to the matching service contractor.',
  in_progress:'The field crew has inspected the site and work is underway.',
  on_hold:'The crew has recorded a temporary hold while coordinating the required material or access.',
  resolved:'The reported issue has been repaired and the work photo is ready for verification.',
  closed:'The completed work was checked and the service case was closed.'
};

async function seedLegacyLocation(primaryCitizenId){
  await pool.query(`UPDATE complaints SET state='Karnataka',district='Bengaluru Urban',subdistrict='Bengaluru East',city='Bengaluru',
    address='Ward public garden area, Bengaluru Urban, Karnataka',latitude=12.9718,longitude=77.5948
    WHERE citizen_id=$1 AND state='Maharashtra' AND title='Streetlight out near the public garden'`,[primaryCitizenId]);
  await pool.query(`UPDATE complaints SET state='Karnataka',district='Mysuru',subdistrict='Mysuru',city='Mysuru',
    address='Ward bus-stop area, Mysuru, Karnataka',latitude=12.2959,longitude=76.6397
    WHERE citizen_id=$1 AND state='Maharashtra' AND title='Water pooling after every rain'`,[primaryCitizenId]);
}

async function seedComplaints(citizenIds,contractorIds){
  const citizenIdSet=citizenIds;
  for(let index=0;index<DEMO_COMPLAINTS.length;index++){
    const sample=DEMO_COMPLAINTS[index],citizenId=citizenIds[index%citizenIds.length];
    const existing=await pool.query(`SELECT id,assigned_to,status FROM complaints WHERE citizen_id=ANY($1::int[])
      AND title=$2 AND category=$3 AND state='Karnataka' AND district=$4 AND city=$5 LIMIT 1`,
      [citizenIdSet,sample.title,sample.category,sample.district,sample.city]);
    let complaintId,authorId,status=sample.status;
    if(existing.rows[0]){
      complaintId=existing.rows[0].id;status=existing.rows[0].status;
      authorId=existing.rows[0].assigned_to||citizenId;
    }else{
      const categoryIndex=CATEGORIES.indexOf(sample.category),pair=CONTRACTOR_PAIRS[categoryIndex];
      const accountNumber=sample.status==='submitted'?null:(DISTRICT_INFO[sample.district].zone==='central'?pair.accountNumbers[0]:pair.accountNumbers[1]);
      const assignedTo=accountNumber?contractorIds.get(contractorEmail(accountNumber)):null;
      const insert=await pool.query(`INSERT INTO complaints(citizen_id,assigned_to,title,description,category,priority,status,state,district,subdistrict,city,address,latitude,longitude,due_at,created_at,updated_at,assigned_at,resolved_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
          NOW()-($15::int*INTERVAL '1 day')+INTERVAL '48 hours',
          NOW()-($15::int*INTERVAL '1 day'),NOW()-($15::int*INTERVAL '1 day'),
          CASE WHEN $2::int IS NULL THEN NULL ELSE NOW()-($15::int*INTERVAL '1 day')+INTERVAL '30 minutes' END,
          CASE WHEN $7::varchar IN ('resolved','closed') THEN NOW()-($15::int*INTERVAL '1 day')+INTERVAL '1 day' ELSE NULL END) RETURNING id`,
        [citizenId,assignedTo||null,sample.title,sample.description,sample.category,sample.priority,sample.status,sample.state,sample.district,sample.subdistrict,sample.city,sample.address,sample.latitude,sample.longitude,sample.ageDays]);
      complaintId=insert.rows[0].id;authorId=assignedTo||citizenId;
    }
    const hasUpdate=await pool.query('SELECT 1 FROM progress_updates WHERE complaint_id=$1 LIMIT 1',[complaintId]);
    if(!hasUpdate.rowCount)await pool.query(`INSERT INTO progress_updates(complaint_id,author_id,status,message,created_at)
      VALUES($1,$2,$3,$4,NOW()-($5::int*INTERVAL '1 day')+INTERVAL '3 hours')`,
      [complaintId,authorId,status,progressMessage[status]||progressMessage.submitted,sample.ageDays]);
  }
}

async function seed(){
  const adminEmail=process.env.ADMIN_EMAIL||'admin@civicflow.demo';
  let admin=await pool.query('SELECT id FROM users WHERE email=$1',[adminEmail]);
  if(!admin.rows[0]){
    const passwordHash=await bcrypt.hash(process.env.ADMIN_PASSWORD||'Admin@12345',12);
    admin=await pool.query(`INSERT INTO users(full_name,email,phone,password_hash,role,approval_status)
      VALUES($1,$2,$3,$4,'admin','approved') RETURNING id`,[process.env.ADMIN_NAME||'City Operations Head',adminEmail,'+91 00000 00000',passwordHash]);
  }
  if(process.env.DEMO_MODE==='false')return;

  const citizenIds=[];
  for(const citizen of DEMO_CITIZENS)citizenIds.push(await ensureCitizen(citizen));
  const contractorIds=new Map();
  for(const contractor of DEMO_CONTRACTORS)contractorIds.set(contractor.email,await ensureContractor(contractor));
  await seedLegacyLocation(citizenIds[0]);
  await seedComplaints(citizenIds,contractorIds);
}

module.exports={seed,DEMO_CITIZENS,DEMO_CONTRACTORS,DEMO_COMPLAINTS,DEMO_DISTRICTS,CATEGORIES};
