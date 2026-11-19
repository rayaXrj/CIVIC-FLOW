const test=require('node:test');
const assert=require('node:assert/strict');
const {compareIncident}=require('../incident-similarity');

const report=(overrides={})=>({
  id:1,title:'Pothole outside the school gate',description:'A deep pothole near the school gate is dangerous for two-wheelers.',
  category:'Roads & Potholes',status:'submitted',state:'Maharashtra',district:'Pune',subdistrict:'Haveli',city:'Pune',
  latitude:18.5204,longitude:73.8567,...overrides
});

test('ranks matching reports that share text and fall within the chosen GPS radius',()=>{
  const match=compareIncident(report(),report({id:2,title:'Dangerous pothole near school gate',description:'There is a deep pothole by the school entrance.',latitude:18.521,longitude:73.8567}),500);
  assert.ok(match);
  assert.ok(match.score>20);
  assert.ok(match.distanceMeters<100);
  assert.equal(match.locationMatch,'GPS distance');
});

test('rejects a text match outside the selected radius',()=>{
  const match=compareIncident(report(),report({id:2,latitude:18.54}),500);
  assert.equal(match,null);
});

test('uses matching taluka and city when either report has no GPS coordinates',()=>{
  const match=compareIncident(report({latitude:null,longitude:null}),report({id:2,latitude:null,longitude:null}),500);
  assert.ok(match);
  assert.equal(match.distanceMeters,null);
});

test('rejects fallback matches from another taluka or city',()=>{
  const source=report({latitude:null,longitude:null});
  assert.equal(compareIncident(source,report({id:2,latitude:null,longitude:null,subdistrict:'Mulshi'}),500),null);
  assert.equal(compareIncident(source,report({id:2,latitude:null,longitude:null,city:'Mumbai'}),500),null);
});

test('does not compare different service categories',()=>{
  assert.equal(compareIncident(report(),report({id:2,category:'Water & Drainage'}),500),null);
});
