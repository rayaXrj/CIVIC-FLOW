const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const data=path.join(__dirname,'..','public','data');
function read(name){return JSON.parse(fs.readFileSync(path.join(data,`${name}.json`),'utf8'));}

test('bundled India location directory contains all states and union territories',()=>{
  const states=read('states');
  assert.equal(states.length,36);
  assert.ok(states.some(x=>x.name==='Maharashtra'));
  assert.ok(states.some(x=>x.name==='Delhi'&&x.type==='U'));
});
test('district, sub-district, and urban local body catalogs are bundled and linked',()=>{
  const states=read('states'),districts=read('districts'),subs=read('subdistricts'),cities=read('urban_local_bodies');
  const codes=new Set(states.map(x=>x.code));
  assert.equal(districts.length,784);assert.equal(subs.length,7092);assert.equal(cities.length,5050);
  assert.ok(districts.every(x=>codes.has(x.stateCode)));
  const districtsByCode=new Set(districts.map(x=>x.code));
  assert.ok(subs.every(x=>codes.has(x.stateCode)&&districtsByCode.has(x.districtCode)));
});
test('complaint form contains full cascading location fields',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  for(const token of ['State / Union Territory','Taluka / Tehsil / Sub-district','City / Town / Local body','Use my location'])assert.ok(html.includes(token),`missing ${token}`);
});
test('nullable manual contractor assignment is explicitly typed for PostgreSQL',()=>{
  const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
  assert.ok(server.includes('assigned_to=$1::integer,status=CASE WHEN $1::integer IS NULL'));
});
test('progress status update uses consistent PostgreSQL parameter types',()=>{
  const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
  assert.ok(server.includes('status=$1::varchar,updated_at=NOW(),resolved_at=CASE WHEN $3::boolean'));
});
test('dashboard report panel supports ranked state drill-down and an animated district return path',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','public','styles.css'),'utf8');
  const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
  for(const token of ['Reports by state','Reports by district','data-geo-state','data-geo-back'])assert.ok(app.includes(token),`missing ${token}`);
  assert.ok(server.includes('AS count FROM complaints GROUP BY state,district'));
  assert.ok(app.includes('state.data?.geoSummary?.length'));
  assert.ok(css.includes('@keyframes geoCardReveal'));
  assert.ok(css.includes('prefers-reduced-motion:reduce'));
});
test('city notices store an India location and filter for the citizen home area',()=>{
  const db=fs.readFileSync(path.join(__dirname,'..','db.js'),'utf8');
  const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  for(const field of ['state','district','subdistrict','city'])assert.ok(db.includes(`ADD COLUMN IF NOT EXISTS ${field}`),`missing notice field ${field}`);
  assert.ok(server.includes('profile.homeState||'));
  assert.ok(server.includes('homeState:clean(req.body.homeState'));
  assert.ok(app.includes("locationFields('notice'"));
  assert.ok(app.includes("locationFields('home'"));
});
test('public landing metrics come from live complaint status counts',()=>{
  const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  assert.ok(server.includes("app.get('/api/public/stats'"));
  for(const key of ['total','solved','pending'])assert.ok(app.includes(`data-impact=\"${key}\"`),`missing public metric ${key}`);
});
test('complaint location picker supports satellite, street, pin, GPS, and map centering',()=>{
  const root=path.join(__dirname,'..'),app=fs.readFileSync(path.join(root,'public','app.js'),'utf8'),html=fs.readFileSync(path.join(root,'public','index.html'),'utf8'),css=fs.readFileSync(path.join(root,'public','styles.css'),'utf8'),server=fs.readFileSync(path.join(root,'server.js'),'utf8');
  for(const token of ['maps/satellite-v4/','tile.openstreetmap.org','draggable:true','navigator.geolocation.getCurrentPosition','function centerMapToArea',"initializeMapPicker('complaint')"])assert.ok(app.includes(token),`missing map behavior ${token}`);
  assert.ok(html.includes('leaflet@1.9.4'));
  assert.ok(css.includes('.location-map{height:340px'));
  assert.ok(server.includes("app.get('/api/map-config'"));
});
test('sign-in page does not expose demo credential fill shortcuts',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  assert.doesNotMatch(app,/data-demo|Demo access|Fill login/);
});
