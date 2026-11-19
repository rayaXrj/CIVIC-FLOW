const test=require('node:test');
const assert=require('node:assert/strict');
const {DEMO_CITIZENS,DEMO_CONTRACTORS,DEMO_COMPLAINTS,DEMO_DISTRICTS,CATEGORIES}=require('../seed');

test('demo seed provides 32 Karnataka reports across exactly six districts',()=>{
  assert.equal(DEMO_COMPLAINTS.length,32);
  assert.deepEqual([...new Set(DEMO_COMPLAINTS.map(x=>x.state))],['Karnataka']);
  assert.deepEqual([...new Set(DEMO_COMPLAINTS.map(x=>x.district))].sort(),[...DEMO_DISTRICTS].sort());
  assert.equal(DEMO_DISTRICTS.length,6);
});

test('demo seed provides two approved contractor profiles per service category',()=>{
  assert.equal(DEMO_CONTRACTORS.length,16);
  for(const category of CATEGORIES){
    assert.equal(DEMO_CONTRACTORS.filter(x=>x.category===category).length,2,`expected two demo crews for ${category}`);
  }
  assert.ok(DEMO_CONTRACTORS.every(x=>x.districts.length===3));
  assert.deepEqual([...new Set(DEMO_CONTRACTORS.flatMap(x=>x.districts))].sort(),[...DEMO_DISTRICTS].sort());
});

test('demo locations correspond to the bundled Karnataka district and taluka catalog',()=>{
  const path=require('node:path'),fs=require('node:fs');
  const data=path.join(__dirname,'..','public','data');
  const states=JSON.parse(fs.readFileSync(path.join(data,'states.json'),'utf8'));
  const districts=JSON.parse(fs.readFileSync(path.join(data,'districts.json'),'utf8'));
  const subdistricts=JSON.parse(fs.readFileSync(path.join(data,'subdistricts.json'),'utf8'));
  const stateCode=states.find(x=>x.name==='Karnataka').code;
  for(const complaint of DEMO_COMPLAINTS){
    const district=districts.find(x=>x.name===complaint.district&&x.stateCode===stateCode);
    assert.ok(district,`missing district ${complaint.district}`);
    assert.ok(subdistricts.some(x=>x.name===complaint.subdistrict&&x.districtCode===district.code),`missing taluka ${complaint.subdistrict} for ${complaint.district}`);
  }
  assert.equal(DEMO_CITIZENS.length,5);
});
