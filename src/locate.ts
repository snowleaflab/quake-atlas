import {feature} from 'topojson-client';
import type {Topology,GeometryCollection} from 'topojson-specification';
import {get} from './data';
export async function locate(){
 const p=await new Promise<GeolocationPosition>((ok,fail)=>navigator.geolocation.getCurrentPosition(ok,fail,{timeout:9000,maximumAge:300000}));
 const {latitude:y,longitude:x}=p.coords;
 const top=await get<Topology<{cities:GeometryCollection}>>('geo/cities.json');
 const areas=feature(top,Object.values(top.objects)[0]).features;
 function inside(ring:number[][]){
   let yes=false;
   for(let i=0,j=ring.length-1;i<ring.length;j=i++){
     const [a,b]=ring[i],[c,d]=ring[j];
     if((b>y)!==(d>y) && x<(c-a)*(y-b)/(d-b)+a) yes=!yes;
   }
   return yes;
 }
 for(const f of areas){
   const g=f.geometry;
   const polys=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
   if(polys.some(poly=>inside(poly[0])&&!poly.slice(1).some(inside))) return String((f.properties as {N03_007?:string})?.N03_007||'13104');
 }
 throw new Error('現在地の市区町村を判定できませんでした');
}
