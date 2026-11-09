import {lazy,Suspense,useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {colors,covered,day,get,intensity,labels,shift,type EventRow,type Histogram,type Index} from './data';
import './style.css';
const MapView=lazy(()=>import('./Map')),Chart=lazy(()=>import('./Chart'));
const params=new URLSearchParams(location.search);
const fallback='13104';
const periods=['1日','7日','30日','1年','全期間','指定'];
const initialCity=params.get('city')||localStorage.getItem('qa-city')||fallback;
const originalMin=params.get('min')||localStorage.getItem('qa-min')||'2';
const today=day(new Date());
function Badge({s}:{s:number}){return <span className="badge" style={{color:colors[s]}}>{labels[s]}</span>}
function App(){
 const [index,setIndex]=useState<Index|null>(null),[cities,setCities]=useState<Record<string,string>>({});
 const [city,setCity]=useState(initialCity),[min,setMin]=useState(['1','2','3'].includes(originalMin)?+originalMin:2);
 const [period,setPeriod]=useState(periods.includes(params.get('period')||'')?params.get('period')!:'30日');
 const [from,setFrom]=useState(params.get('from')||shift(today,-29)),[to,setTo]=useState(params.get('to')||today);
 const [tab,setTab]=useState('一覧'),[event,setEvent]=useState<EventRow|null>(null),[message,msg]=useState('');
 const [busy,setBusy]=useState(false),[rows,setRows]=useState<EventRow[]>([]),[pending,loading]=useState(false);
 const [budget,setBudget]=useState(3),[limit,setLimit]=useState(40);
 const [hist,setHist]=useState<Histogram|null>(null),[mode,setMode]=useState('回数'),[unit,setUnit]=useState('日');
 const selection=useRef(0);
 const [query,setQuery]=useState('');
 const version=index?.updated||'';
 async function refresh(){setBusy(true);try{
   const [idx,c]=await Promise.all([get<Index>('data/index.json'),get<Record<string,string>>('data/cities.json')]);
   setIndex(idx);setCities(c);msg('');
   setCity(current=>current==='all'||current in c?current:fallback);
 }catch{msg('更新できませんでした。取得済みのデータを表示します。')}finally{setBusy(false)}}
 async function current(initial=false){
   const request=++selection.current;
   try{const c=await (await import('./locate')).locate();if(request===selection.current){setCity(c);setQuery('');msg('現在地から地域を選択しました。')}}
   catch{if(request===selection.current){if(initial)setCity(fallback);msg(initial?'現在地を取得できないため、東京都 新宿区を表示します。':'現在地を取得できませんでした。地域を選択できます。')}}
 }
 useEffect(()=>{void refresh();if(!params.has('city')&&!localStorage.getItem('qa-city'))void current(true)},[]);
 const start=period==='指定'?from:period==='全期間'?(index?.months[0]||today.slice(0,7))+'-01':shift(today,-({'1日':1,'7日':7,'30日':30,'1年':365}[period]||30)+1);
 const end=period==='指定'?to:today;
 const months=useMemo(()=>[...(index?.months||[])].reverse().filter(m=>start<=end && m>=start.slice(0,7)&&m<=end.slice(0,7)),[index,start,end]);
 const scatter=tab==='グラフ'&&mode==='地震ごと';
 const windowSize=scatter?months.length:budget;
 useEffect(()=>{setBudget(3);setLimit(40);setEvent(null)},[city,min,start,end]);
 useEffect(()=>{
   if(!index)return;
   let active=true;setHist(null);
   (index.counts.includes(city)?get<Histogram>('data/counts/'+city+'.json.gz',version):Promise.resolve({})).then(h=>active&&setHist(h)).catch(()=>active&&msg('集計を取得できませんでした。'));
   return ()=>{active=false};
 },[index,city,version]);
 useEffect(()=>{
   if(!index)return;
   let active=true;loading(true);setRows([]);
   (async()=>{
    const found:EventRow[]=[];
    for(const month of months.slice(0,windowSize)){
      if(!active)return;
      const res=await get<EventRow[]>('data/months/'+month+'.json.gz',version);
      found.push(...res.filter(r=>r.at.slice(0,10)>=start && r.at.slice(0,10)<=end && intensity(r,city)>=min));
    }
    if(active)setRows(found);
   })().catch(()=>active&&msg('一覧の読み込みに失敗しました。更新して再試行してください。')).finally(()=>active&&loading(false));
   return ()=>{active=false};
 },[index,months,city,min,version,windowSize,start,end]);
 const choices=Object.entries(cities).filter(([,n])=>n.replaceAll(' ','').includes(query.replaceAll(' ','')));
 function choose(c:string){selection.current++;setCity(c);localStorage.setItem('qa-city',c);setQuery('');msg('')}
 async function share(){const url=new URL(location.href);url.search='';for(const [k,v] of Object.entries({city,min:String(min),period,...(period==='指定'?{from,to}:{})}))url.searchParams.set(k,v);
 try{await navigator.clipboard.writeText(url.href);msg('条件付きリンクをコピーしました。')}catch{window.prompt('このリンクをコピーしてください',url.href)}}
 const region=city==='all'?'全国':cities[city]||'地域を読み込み中';
 const target=city==='all'?'全国最大震度':'地域の震度';
 function metric(a:string,b:string){
   if(!hist||!index)return '—';
   let n=0;for(let d=a;d<=b;d=shift(d,1)){if(!covered(index,d))return '未取得';for(const [s,v] of Object.entries(hist[d]||{}))if(+s>=min)n+=v}
   return String(n);
 }
 const graph=useMemo(()=>{
  if(scatter)return {keys:rows.map(r=>r.at.replace('T',' ')),values:rows.map(r=>intensity(r,city))};
  const buckets=new Map<string,{n:number;max:number;valid:boolean}>();
  if(!hist||!index||!/^\d{4}-\d\d-\d\d$/.test(start)||!/^\d{4}-\d\d-\d\d$/.test(end)||start<'1900-01-01'||end>'2200-12-31')return {keys:[],values:[]};
  for(let d=start;d<=end;d=shift(d,1)){
   const key=unit==='年'?d.slice(0,4):unit==='月'?d.slice(0,7):unit==='週'?shift(d,-(new Date(d+'T00:00:00Z').getUTCDay()+6)%7):d;
   const b=buckets.get(key)||{n:0,max:0,valid:true};if(!covered(index,d))b.valid=false;
   for(const [s,v] of Object.entries(hist[d]||{}))if(+s>=min){b.n+=v;b.max=Math.max(b.max,+s)}
   buckets.set(key,b);
  }
  return {keys:[...buckets.keys()],values:[...buckets.values()].map(b=>b.valid?(mode==='回数'?b.n:b.max||null):null)};
 },[hist,index,mode,scatter,rows,city,start,end,min,unit]);
 function open(r:EventRow){setEvent(r);setTab('震度地図')}
 const selected=event||rows[0];const recent=metric(shift(today,-30),shift(today,-1)),prior=metric(shift(today,-60),shift(today,-31));
 return <><header><div className="brand"><span aria-hidden="true">≋</span> Quake Atlas</div><button onClick={refresh} disabled={busy}>{busy?'取得中…':'↻ 更新'}</button></header><main>
 <div className="title"><div><p className="eyebrow">地震観測記録</p><h1>{region}</h1></div><div className="note">データ取得 {version?version.slice(0,16).replace('T',' '):'未取得'} JST<br/>約15分ごとに更新</div></div>
 <section className="filters" aria-label="表示条件"><label>地域を検索<input value={query} placeholder="例：柏市" onChange={e=>setQuery(e.target.value)}/></label>
 <label>表示地域<select value={city} onChange={e=>choose(e.target.value)}><option value="all">全国（地域指定を解除）</option>{query && !choices.some(([k])=>k===city)&&city!=='all'&&<option value={city}>{region}</option>}{choices.map(([k,n])=><option key={k} value={k}>{n}</option>)}</select></label>
 <button onClick={()=>void current()}>◎ 現在地</button><label>震度下限<select value={min} onChange={e=>{setMin(+e.target.value);localStorage.setItem('qa-min',e.target.value)}}>{[1,2,3].map(v=><option key={v} value={v}>震度{v}以上</option>)}</select></label>
 <label>表示期間<select value={period} onChange={e=>{setPeriod(e.target.value);if(e.target.value==='全期間'){setUnit('年');setMode('回数')}}}>{periods.map(p=><option key={p}>{p}</option>)}</select></label><button onClick={share}>条件を共有</button>
 {period==='指定'&&<><input aria-label="開始日" type="date" value={from} onChange={e=>setFrom(e.target.value)}/><input aria-label="終了日" type="date" value={to} onChange={e=>setTo(e.target.value)}/></>}
 </section>
 <p role="status" className="status">{message|| (start>end?'開始日と終了日を確認してください。':'')}</p>
 <section className="stats"><div><small>直近30日 · 震度{min}以上</small><strong>{recent}<i> 件</i></strong></div><div><small>その前の30日</small><strong>{prior}<i> 件</i></strong></div><p>日本時間の昨日までを比較。<br/>同じ地震は地域ごとに1件として集計。</p></section>
 <nav>{['一覧','震度地図','グラフ'].map(t=><button aria-pressed={tab===t} key={t} onClick={()=>setTab(t)}>{t}</button>)}</nav>
 <section className="panel"><div className="sectionhead"><h2>{tab==='一覧'?'地震の履歴':tab}</h2><span>{start} — {end}</span></div>
 {tab==='一覧'&&<><div className="table"><table><thead><tr>{['発生日時（JST）',...(city==='all'?[]:['地域の震度']),'全国最大震度','震源地','M',''].map((h,i)=><th key={i}>{h}</th>)}</tr></thead><tbody>{rows.slice(0,limit).map(r=><tr key={r.id}><td>{r.at.replace('T',' ')}</td>{city!=='all'&&<td><Badge s={intensity(r,city)}/></td>}<td><Badge s={r.s}/></td><td>{r.name||'不明'}</td><td>{r.m??'—'}</td><td><button onClick={()=>open(r)}>地図 ↗</button></td></tr>)}</tbody></table></div>{pending?<p>読み込み中…</p>:!rows.length&&<p>読み込んだ期間に、条件に一致する記録はありません。</p>}
 {(rows.length>limit||budget<months.length)&&<button onClick={()=>{setLimit(limit+80);if(limit+80>=rows.length)setBudget(budget+6)}}>さらに履歴を表示</button>}</>}
 {tab==='震度地図'&&(selected?<><h3>{selected.name}　M{selected.m??'—'}</h3><p>{selected.at.replace('T',' ')} JST　深さ {selected.depth===null?'不明':selected.depth+' km'}　{selected.lat!==null&&selected.lon!==null&&`${selected.lat}°, ${selected.lon}°`}</p><Suspense fallback="地図を準備中…"><MapView event={selected} version={version} cities={cities}/></Suspense></>:<p>条件に一致する地震を一覧から選択してください。</p>)}
 {tab==='グラフ'&&<><div className="chartFilters"><label>指標<select value={mode} onChange={e=>setMode(e.target.value)}>{['回数','最大震度','地震ごと'].map(m=><option key={m}>{m}</option>)}</select></label>{!scatter&&<label>集計単位<select value={unit} onChange={e=>setUnit(e.target.value)}>{['日','週','月','年'].map(u=><option key={u}>{u}</option>)}</select></label>}<span>{target} · 震度{min}以上</span></div>
 <Suspense fallback="グラフを準備中…"><Chart keys={graph.keys} values={graph.values} mode={mode} onSelect={i=>{if(scatter&&rows[i])open(rows[i])}}/></Suspense><p className="note">未収録を含む区間は空欄。震度5・6は旧階級の記録です。</p></>}
 </section><details><summary>収録期間と出典</summary><p>気象庁 地震月報（カタログ編） {index?.years.length?Math.min(...index.years)+'〜'+Math.max(...index.years)+'年':'未取得'}。観測網・震度階級は年代によって異なります。過去の市区町村は観測点位置と境界から対応付けています。</p><p>P2P地震情報による補完 {index?.bridgeFrom||'未取得'} ～ 気象庁XMLへの切替 {index?.cutover||'未取得'}。配信元の欠落や未対応地点は地域件数に含まれない場合があります。</p><p>地図：国土交通省 国土数値情報（行政区域）を加工。市区町村境界は2021年版・簡略化済み。境界付近は手動で地域を選択できます。</p><a href="https://www.data.jma.go.jp/eqev/data/bulletin/shindo.html">気象庁</a> · <a href="https://www.p2pquake.net/">P2P地震情報</a> · <a href="https://github.com/smartnews-smri/japan-topography">境界データ</a></details>
 </main></>
}
createRoot(document.getElementById('root')!).render(<App/>);
