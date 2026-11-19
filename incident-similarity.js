'use strict';

const stopWords=new Set('a an and are as at be by for from in into is it of on or the this to was were with'.split(' '));
const clean=(value,max=500)=>String(value??'').trim().slice(0,max);
function terms(text){return new Set(String(text||'').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(word=>word.length>2&&!stopWords.has(word)));}
function dice(a,b){if(!a.size||!b.size)return 0;let common=0;for(const word of a)if(b.has(word))common++;return 2*common/(a.size+b.size);}
function haversineMeters(lat1,lon1,lat2,lon2){const toRad=n=>n*Math.PI/180,R=6371000,dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1);const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;return 2*R*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
function normalized(value){return clean(value,180).toLocaleLowerCase('en-IN').replace(/\s+/g,' ');}

function compareIncident(source,candidate,radius){
  if(normalized(source.category)!==normalized(candidate.category))return null;
  const bothCoordinates=source.latitude!==null&&source.latitude!==undefined&&source.longitude!==null&&source.longitude!==undefined&&candidate.latitude!==null&&candidate.latitude!==undefined&&candidate.longitude!==null&&candidate.longitude!==undefined&&Number.isFinite(Number(source.latitude))&&Number.isFinite(Number(source.longitude))&&Number.isFinite(Number(candidate.latitude))&&Number.isFinite(Number(candidate.longitude));
  let distanceMeters=null,locationProximity=0.65,locationMatch='same taluka and city (GPS unavailable)';
  if(bothCoordinates){
    distanceMeters=haversineMeters(Number(source.latitude),Number(source.longitude),Number(candidate.latitude),Number(candidate.longitude));
    if(distanceMeters>radius)return null;
    locationProximity=Math.max(0,1-distanceMeters/radius);locationMatch='GPS distance';
  }else{
    if(normalized(source.state)!==normalized(candidate.state)||normalized(source.district)!==normalized(candidate.district)||normalized(source.subdistrict)!==normalized(candidate.subdistrict))return null;
    if(source.city&&candidate.city&&normalized(source.city)!==normalized(candidate.city))return null;
  }
  const sourceTitle=terms(source.title),candidateTitle=terms(candidate.title),sourceDescription=terms(source.description),candidateDescription=terms(candidate.description);
  const titleSimilarity=dice(sourceTitle,candidateTitle),descriptionSimilarity=dice(sourceDescription,candidateDescription);
  const textSimilarity=titleSimilarity*0.58+descriptionSimilarity*0.42;
  const shared=new Set([...sourceTitle,...sourceDescription].filter(word=>candidateTitle.has(word)||candidateDescription.has(word)));
  if(textSimilarity<0.22||shared.size<1)return null;
  const score=Math.round(textSimilarity*(0.88+0.12*locationProximity)*100);
  return {id:candidate.id,title:candidate.title,description:candidate.description,category:candidate.category,status:candidate.status,city:candidate.city,district:candidate.district,subdistrict:candidate.subdistrict,score,distanceMeters:distanceMeters===null?null:Math.round(distanceMeters),locationMatch};
}

module.exports={compareIncident};
