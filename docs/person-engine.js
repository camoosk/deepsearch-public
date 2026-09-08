(() => {
  const api='https://deepsearch-public.edmirosy.workers.dev';
  const $=s=>document.querySelector(s);
  const form=$('#searchForm'),input=$('#query'),workspace=$('#workspace'),queriesEl=$('#queries'),resultsEl=$('#results'),notice=$('#notice'),count=$('#resultCount'),title=$('#resultTitle'),personMode=$('#personMode');
  const live=$('#researchStatus'),statusTitle=$('#statusTitle'),statusDetail=$('#statusDetail'),statusElapsed=$('#statusElapsed'),statusProgress=$('#statusProgress');
  const stageEls=[$('#stage1'),$('#stage2'),$('#stage3')];
  if(!form||!personMode)return;

  let timer=null,startTime=0;
  const basePlan=name=>{const n=name.trim().replace(/\s+/g,' ');return [
    `"${n}"`, `"${n}" biography`, `"${n}" career work`, `"${n}" education`,
    `"${n}" organizations`, `"${n}" publications`, `"${n}" official`
  ]};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const safe=v=>{try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)?u.href:'#'}catch{return '#'}};
  const domain=v=>{try{return new URL(v).hostname}catch{return 'unknown'}};
  const key=v=>{try{const u=new URL(v);u.hash='';['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid'].forEach(k=>u.searchParams.delete(k));return u.toString().replace(/\/$/,'').toLowerCase()}catch{return String(v||'').toLowerCase()}};
  const dedup=items=>{const seen=new Set();return items.filter(r=>{const k=key(r.url);if(!k||seen.has(k))return false;seen.add(k);return true}).sort((a,b)=>Number(b.score||0)-Number(a.score||0)).slice(0,60)};
  const renderPlan=(plan,current=-1,done=0)=>{queriesEl.innerHTML=plan.map((q,i)=>`<div class="query-chip ${i===current?'current':''} ${i<done?'done':''}"><b>${String(i+1).padStart(2,'0')}</b> &nbsp;${esc(q)}</div>`).join('')};
  const renderResults=(name,plan,items,message)=>{workspace.classList.remove('hidden');title.textContent=`Person: ${name}`;renderPlan(plan);count.textContent=`${items.length} evidence items`;notice.textContent=message;resultsEl.innerHTML=items.map(r=>`<article class="result"><div class="result-top"><span class="domain">${esc(r.sourceDomain||domain(r.url))}</span><span class="score">score ${Number(r.score||0).toFixed(2)}</span></div><h3><a href="${safe(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.title||r.url)}</a></h3><p>${esc(r.snippet||'No snippet available.')}</p></article>`).join('')};
  const apiSearch=async q=>{const res=await fetch(api+'/api/search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:q,limit:10})});if(!res.ok)throw new Error(`HTTP ${res.status}`);return res.json()};
  const wiki=async(name,lang)=>{const host=lang==='id'?'id.wikipedia.org':'en.wikipedia.org';const p=new URLSearchParams({action:'query',list:'search',srsearch:name,srlimit:'6',format:'json',origin:'*'});const res=await fetch(`https://${host}/w/api.php?${p}`);if(!res.ok)throw new Error(`${host}: HTTP ${res.status}`);const data=await res.json();return (data.query?.search||[]).map((x,i)=>({sourceDomain:host,title:x.title,url:`https://${host}/wiki/${encodeURIComponent(String(x.title).replace(/ /g,'_'))}`,snippet:String(x.snippet||'').replace(/<[^>]+>/g,' '),score:.96-i*.02,provider:'wikimedia'}))};
  const wikiFallback=async name=>{const a=await Promise.allSettled([wiki(name,'id'),wiki(name,'en')]);return {items:a.flatMap(x=>x.status==='fulfilled'?x.value:[]),errors:a.filter(x=>x.status==='rejected').map(x=>x.reason?.message||'Wikimedia failed')}};
  const stop=new Set(['yang','dengan','untuk','dari','pada','dalam','oleh','dan','atau','the','and','for','from','with','this','that','official','public','profile','news','biography','career','work','education','publication','organizations','interview','government','wikipedia','indonesia','page','search','result']);
  function discover(items,name){const counts=new Map(),original=name.toLowerCase();for(const r of items.slice(0,40)){const text=String(`${r.title||''} ${r.snippet||''}`).replace(/https?:\/\/\S+/g,' ');const tokens=text.match(/[\p{L}\p{N}][\p{L}\p{N}'-]{3,}/gu)||[];for(const t of tokens){const low=t.toLowerCase();if(stop.has(low)||low===original||/^\d+$/.test(low))continue;let weight=1;if(/\d/.test(t))weight+=1;if(/^[A-ZÀ-Ý]/.test(t))weight+=2;counts.set(low,(counts.get(low)||0)+weight)}}return [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4).map(x=>x[0])}
  function correlationPlan(name,terms){const n=name.trim();const out=[];for(const t of terms){out.push(`"${n}" "${t}"`,`"${n}" "${t}" news`)}return [...new Set(out)].slice(0,8)}
  function verificationPlan(name,items){const terms=discover(items,name).slice(0,2);return terms.map(t=>`"${name.trim()}" "${t}" verification`).concat([`"${name.trim()}" official source`,`"${name.trim()}" fact check`]).slice(0,4)}
  function showLive(){live.classList.remove('hidden');if(!startTime){startTime=Date.now();timer=setInterval(()=>{const s=Math.floor((Date.now()-startTime)/1000),m=Math.floor(s/60);statusElapsed.textContent=`${m}:${String(s%60).padStart(2,'0')}`},1000)}}
  function setStage(n,titleText,detail,progress){showLive();statusTitle.textContent=titleText;statusDetail.textContent=detail;statusProgress.style.width=`${Math.max(4,Math.min(100,progress))}%`;stageEls.forEach((el,i)=>{el.classList.toggle('active',i===n);el.classList.toggle('done',i<n)})}
  function stopLive(){if(timer)clearInterval(timer);timer=null;statusProgress.style.width='100%';stageEls.forEach(el=>{el.classList.remove('active');el.classList.add('done')});statusTitle.textContent='Research complete';statusDetail.textContent='Sources collected and ranked for review.'}
  async function batch(queries,results,errors,label,offset,plan,progressStart,progressEnd){for(let i=0;i<queries.length;i+=3){const b=queries.slice(i,i+3);const done=Math.min(i+b.length,queries.length);const progress=progressStart+(progressEnd-progressStart)*(done/queries.length);setStage(label==='Discovery'?0:label==='Correlation'?1:2,label==='Discovery'?'Searching public sources':label==='Correlation'?'Connecting related entities':'Checking supporting sources',`${done}/${queries.length} queries · comparing public results`,progress);renderPlan(plan,offset+i+Math.min(2,b.length-1),offset+i);const settled=await Promise.allSettled(b.map(apiSearch));for(const s of settled){if(s.status==='fulfilled'){results.push(...(s.value.results||[]));errors.push(...(s.value.providerErrors||[]))}else errors.push(s.reason?.message||'API request failed')}}}
  async function deepPerson(name){
    workspace.classList.remove('hidden');title.textContent=`Person: ${name}`;count.textContent='Researching';resultsEl.innerHTML='';startTime=0;showLive();setStage(0,'Starting research','Building a small, focused public-source plan',4);
    const all=[],errors=[];let plan=basePlan(name);renderPlan(plan,0,0);
    await batch(plan,all,errors,'Discovery',0,plan,4,38);
    if(all.length===0){setStage(0,'Checking a fallback source','Search provider returned no usable results',42);const w=await wikiFallback(name);all.push(...w.items);errors.push(...w.errors)}
    let unique=dedup(all);const discovered=discover(unique,name);const stage2=correlationPlan(name,discovered);plan=[...plan,...stage2];renderPlan(plan);if(stage2.length)await batch(stage2,all,errors,'Correlation',7,plan,40,72);
    unique=dedup(all);const verify=verificationPlan(name,unique);const verifyOffset=plan.length;plan=[...plan,...verify];renderPlan(plan);if(verify.length)await batch(verify,all,errors,'Verification',verifyOffset,plan,74,96);
    unique=dedup(all);stopLive();
    if(unique.length===0){const leads=[
      {sourceDomain:'id.wikipedia.org',title:`Wikipedia Indonesia · search “${name}”`,url:`https://id.wikipedia.org/w/index.php?search=${encodeURIComponent(name)}`,snippet:'Source-discovery lead; open the original public source and verify claims.',score:.8},
      {sourceDomain:'en.wikipedia.org',title:`Wikipedia English · search “${name}”`,url:`https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(name)}`,snippet:'Source-discovery lead; open the original public source and verify claims.',score:.78},
      {sourceDomain:'www.google.com',title:`Google Web · search “${name}”`,url:`https://www.google.com/search?q=${encodeURIComponent(name)}`,snippet:'Broad public-web discovery lead.',score:.74},
      {sourceDomain:'www.bing.com',title:`Bing Web · search “${name}”`,url:`https://www.bing.com/search?q=${encodeURIComponent(name)}`,snippet:'Broad public-web discovery lead.',score:.72}
    ];renderResults(name,plan,leads,`Research finished without live evidence. ${plan.length} focused queries were attempted across discovery, correlation and verification. These links are discovery leads, not verified evidence.`);return}
    const diag=[...new Set(errors)].slice(0,3);renderResults(name,plan,unique,`Deep Person Research completed in 3 focused stages. ${unique.length} unique public-source results retained. Results are evidence to verify, not a definitive identity record.${diag.length?` Provider diagnostics: ${diag.join(' · ')}`:''}`);
  }
  form.addEventListener('submit',e=>{if(!personMode.classList.contains('active'))return;e.preventDefault();e.stopImmediatePropagation();const n=input.value.trim();if(n)deepPerson(n)},true);
})();
