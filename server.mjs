import {analyzeStored,compileStored} from './ai-store.mjs';
import {analysisKey} from './ai-plan.mjs';
import {reviseDiagram} from './ai-edit.mjs';
import {validateBpmnXML} from './bpmn-validation.mjs';
import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash,randomUUID} from 'node:crypto';
import http from 'node:http';
import {Readable} from 'node:stream';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
const sessionContext=new AsyncLocalStorage();
const hash=s=>createHash('sha256').update(s||'').digest('hex');
const publishing=new Set();
const aiJobs=new Map(),aiJobKeys=new Map();
const publicationJobs=new Map(),publicationJobKeys=new Map();
const base='https://vibecode.bitrix24.tech',key=process.env.VIBE_API_KEY;
const origin='https://app-451f8d724663.vibecode.bitrix24.tech';
const owners=new Set((process.env.VIBE_OWNER_IDS||'488937,2afd4c48-7bcb-42f7-85e4-e3b8c21b5d26,vibe:2afd4c48-7bcb-42f7-85e4-e3b8c21b5d26').split(','));
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const id=v=>{if(!/^[1-9]\d*$/.test(String(v)))throw fail('Некорректный идентификатор');return String(v)};
async function api(path,body,method){
 const auth=sessionContext.getStore()||{key};
 if(!key)throw fail('Подключение Диска не настроено',503);
 const r=await fetch(base+path,{method:method||(body?'POST':'GET'),headers:{'X-Api-Key':auth.key,'Content-Type':'application/json',...(auth.bearer?{'Authorization':auth.bearer}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});
 const j=await r.json();if(!r.ok||j.success===false)throw fail(j.error?.code==='BITRIX_ACCESS_DENIED'?'Нет доступа к выбранной папке или файлу':j.error?.message||'Диск временно недоступен',r.status);return j;
}
async function body(req){let n=0,a=[];for await(const b of req){n+=b.length;if(n>8*1024*1024)throw fail('Файл превышает 8 МБ',413);a.push(b)}try{return JSON.parse(Buffer.concat(a).toString())}catch{throw fail('Некорректный запрос')}}
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data))}
// Publication metadata lives in the editor link, never as visible HTML comments.
const uuid=v=>{if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(String(v)))throw fail('Некорректный идентификатор схемы');return String(v)};
function articleBlocks(markdown){
 const text=markdown||'',blocks=[];
 const legacy=/<!-- bpmn-studio:start -->[\s\S]*?<!-- bpmn-studio:end -->/g;
 for(const m of text.matchAll(legacy))blocks.push({start:m.index,end:m.index+m[0].length,text:m[0],legacy:true});
 const modern=/^### Схема процесса — BPMN Студия\r?\n\r?\n\[\[image fileId=\d+\]\]\r?\n\r?\nИсходная схема BPMN XML[^\n]*\r?\n\r?\n\[\[file fileId=\d+\]\]\r?\n\r?\n\[Открыть (?:BPMN Студию|и редактировать схему)\]\((https:\/\/app-451f8d724663\.vibecode\.bitrix24\.tech\/(?:diagram\/[1-9]\d*\/[a-f0-9-]{36})?\?[^\s)]+)\)/gm;
 for(const m of text.matchAll(modern)){if(blocks.some(b=>m.index>=b.start&&m.index<b.end))continue;try{const u=new URL(m[1]);if(u.origin!==origin)continue;const path=u.pathname.match(/^\/diagram\/([1-9]\d*)\/([a-f0-9-]{36})$/i),diagramId=uuid(path?path[2]:u.searchParams.get('diagram')),documentId=id(path?path[1]:u.searchParams.get('article')),version=u.searchParams.get('version'),operation=u.searchParams.get('publication');if(!/^[a-f0-9]{64}$/.test(version||'')||!/^[a-zA-Z0-9-]{16,80}$/.test(operation||''))continue;blocks.push({start:m.index,end:m.index+m[0].length,text:m[0],diagramId,documentId,version,operation})}catch{}}
 return blocks.sort((a,b)=>a.start-b.start);
}
const blockRevision=b=>hash(b.text);
const replaceBlock=(s,old,block)=>old?s.slice(0,old.start)+block+s.slice(old.end):s.trimEnd()+'\n\n'+block+'\n';
const storagePath=(doc,diagram,version)=>'bpmn-'+doc+'-'+version+'.json';
async function storeSnapshot(doc,diagram,xml,name){
 const payload=JSON.stringify({documentId:doc,diagramId:diagram,xml,name}),version=hash(payload),form=new FormData();
 form.set('key',storagePath(doc,diagram,version));form.set('visibility','PRIVATE');form.set('file',new Blob([payload],{type:'application/json'}),'diagram.json');
 // Internal private app data. Portal access is checked with the caller's credentials before every use.
 const r=await fetch(base+'/v1/storage/objects/upload',{method:'POST',headers:{'X-Api-Key':key},body:form,signal:AbortSignal.timeout(60000)});const j=await r.json();if(!r.ok||j.success===false)throw fail('Не удалось сохранить исходник схемы в хранилище приложения. '+(j.error?.message||''),502);return version;
}
async function readSnapshot(doc,block){
 const r=await fetch(base+'/v1/storage/objects/'+encodeURIComponent(storagePath(doc,block.diagramId,block.version))+'?inline=true',{headers:{'X-Api-Key':key},signal:AbortSignal.timeout(60000),redirect:'error'});
 if(!r.ok){let code='';try{code=(await r.json()).error?.code||''}catch{}throw fail('Исходник схемы недоступен (HTTP '+r.status+(code?', '+code:'')+'). Откройте резервный файл или обратитесь к владельцу.',502);}
 let chunks=[],n=0;for await(const c of r.body){n+=c.length;if(n>8*1024*1024)throw fail('Исходник превышает 8 МБ',413);chunks.push(c)}const text=Buffer.concat(chunks).toString('utf8');let data;try{data=JSON.parse(text)}catch{throw fail('Не удалось прочитать исходник',502)}
 if(hash(text)!==block.version||data.documentId!==doc||data.diagramId!==block.diagramId)throw fail('Исходник не соответствует схеме',409);return data;
}
function publicationResult(doc,d,block,extra={}){return{id:doc,title:d.title,diagramId:block.diagramId,blockRevision:blockRevision(block),...extra}}

async function route(req,res){try{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname.startsWith('/api/')){
  // Gateway strips client-supplied identity headers. Fail closed for any other viewer.
  const identity=sessionContext.getStore();
  if(req.method==='POST'&&(req.headers.origin!==origin||!req.headers['content-type']?.startsWith('application/json')))throw fail('Запрос отклонён',403);

  if(req.method==='GET'&&u.pathname==='/api/ai/job'){
   const job=aiJobs.get(u.searchParams.get('id'));if(!job||job.uid!==identity.uid)throw fail('Разбор требований не найден. Повторите разбор того же описания.',404);
   if(!job.done)return json(res,200,{pending:true,stage:job.stage||'analysis',attempt:job.attempt||1,retrying:!!job.retrying,recovery:job.recovery,budgetResumes:job.budgetResumes||0,step:job.step,steps:job.steps,completed:job.completed});if(job.error)return json(res,job.status,{error:job.error,...(job.code?{code:job.code}:{}),resumeStage:job.resumeStage,resumable:!!job.resumable});return json(res,200,{pending:false,result:job.result});
  }
  if(req.method==='POST'&&u.pathname==='/api/ai/generate')throw fail('Обновите страницу редактора и отправьте описание в окне ИИ.',409);
  if(req.method==='POST'&&u.pathname==='/api/ai/check-edit'){
   const b=await body(req);return json(res,200,await validateBpmnXML(b.xml));
  }
  if(req.method==='POST'&&u.pathname==='/api/ai/edit'){
   const b=await body(req),requestId=uuid(b.requestId);
   if(typeof b.xml!=='string'||b.xml.length>3*1024*1024||/<!DOCTYPE|<!ENTITY/i.test(b.xml)||typeof b.comment!=='string'||!b.comment.trim()||b.comment.length>6000||!Array.isArray(b.history)||b.history.length>12||b.history.some(t=>!t||!['user','assistant'].includes(t.role)||typeof t.text!=='string'||t.text.length>6000)||JSON.stringify(b.history).length>24000||!Array.isArray(b.selectedIds)||b.selectedIds.length>100||b.selectedIds.some(x=>typeof x!=='string'||x.length>200))throw fail('Некорректный запрос изменения схемы');
   const sourceHash=hash(JSON.stringify([b.xml,b.comment,b.history,b.selectedIds])),jobKey=identity.uid+':'+requestId,previous=aiJobKeys.get(jobKey);
   if(previous){const old=aiJobs.get(previous);if(old?.descriptionHash!==sourceHash||old.mode!=='edit')throw fail('Запрос изменился. Отправьте комментарий заново.',409);return json(res,202,{jobId:previous})}
   if([...aiJobs.values()].some(j=>j.uid===identity.uid&&!j.done))throw fail('Дождитесь завершения текущего запроса ИИ.',429);
   if([...aiJobs.values()].filter(j=>!j.done).length>=3)throw fail('ИИ сейчас занят. Повторите через минуту.',429);
   if([...aiJobs.values()].filter(j=>j.uid===identity.uid&&Date.now()-j.createdAt<3600000).length>=20)throw fail('Достигнут лимит: 20 запросов в час.',429);
   const jobId=randomUUID(),job={uid:identity.uid,mode:'edit',descriptionHash:sourceHash,createdAt:Date.now(),done:false};aiJobs.set(jobId,job);aiJobKeys.set(jobKey,jobId);json(res,202,{jobId});
   setImmediate(async()=>{try{job.result=await reviseDiagram(b,key,fetch,{onProgress:p=>Object.assign(job,p)})}catch(e){job.status=e.status||502;job.error=e.status?e.message:'Не удалось обработать комментарий. Текущая схема сохранена.'}finally{job.done=true;setTimeout(()=>{aiJobs.delete(jobId);aiJobKeys.delete(jobKey)},3600000).unref()}});return;
  }
  if(req.method==='POST'&&u.pathname==='/api/ai/compile'){
   const b=await body(req);if(typeof b.revision!=='string'||! /^[a-f0-9]{64}$/.test(b.revision))throw fail('Некорректная версия плана');
   return json(res,200,await compileStored(identity.uid,uuid(b.planId),b.revision));
  }
  if(req.method==='POST'&&u.pathname==='/api/ai/analyze'){
   const b=await body(req),requestId=uuid(b.requestId);if(typeof b.description!=='string'||b.description.trim().length<15||b.description.length>12000||typeof(b.notes||'')!=='string'||(b.notes||'').length>6000||b.force!==undefined&&typeof b.force!=='boolean')throw fail('Описание: 15–12 000 символов, уточнения: до 6 000 символов');
   const sourceHash=analysisKey(b.description,b.notes||''),jobKey=identity.uid+':'+requestId,previous=aiJobKeys.get(jobKey);if(previous){const prior=aiJobs.get(previous);if(prior?.descriptionHash!==sourceHash||prior.force!==!!b.force)throw fail('Описание или уточнения изменились. Начните разбор заново.',409);return json(res,202,{jobId:previous})}
   if([...aiJobs.values()].some(j=>j.uid===identity.uid&&!j.done))throw fail('Дождитесь завершения текущего разбора требований.',429);
   if([...aiJobs.values()].filter(j=>!j.done).length>=3)throw fail('ИИ сейчас занят. Повторите через минуту.',429);
   const recent=[...aiJobs.values()].filter(j=>j.uid===identity.uid&&Date.now()-j.createdAt<3600000);if(recent.length>=20)throw fail('Достигнут лимит: 20 разборов в час. Повторите позже.',429);
   const jobId=randomUUID(),job={uid:identity.uid,descriptionHash:sourceHash,force:!!b.force,createdAt:Date.now(),done:false,result:null,error:null,status:200};aiJobs.set(jobId,job);aiJobKeys.set(jobKey,jobId);json(res,202,{jobId});
   setImmediate(async()=>{try{for(let run=0;run<2;run++){try{job.result=await analyzeStored(identity.uid,b.description,b.notes||'',key,{force:run===0&&!!b.force,onProgress:p=>Object.assign(job,p)});break}catch(e){if(run===0&&e.savedCheckpoint&&e.providerCode==='workflow_deadline'){job.budgetResumes=1;job.retrying=true;job.recovery='resume';console.warn(JSON.stringify({event:'ai.analysis.resumed',at:new Date().toISOString(),sourceHash:sourceHash.slice(0,12),stage:e.stage||'analysis',reason:'workflow_deadline'}));continue}throw e}}}catch(e){job.status=e.status||502;job.resumable=!!e.savedCheckpoint;job.resumeStage=e.stage||'build';job.code=e.providerCode==='timeout'?'AI_TIMEOUT':e.providerCode==='workflow_deadline'?'AI_DEADLINE':null;const aiStage=e.stage==='review'?'проверку логики схемы':e.stage==='repair'?'исправление схемы':e.stage==='extract'?'разбор пунктов требований':'построение структуры схемы';job.error=e.providerCode==='workflow_deadline'?'Достигнут лимит ожидания этого запуска. Завершённые этапы сохранены. Нажмите «Продолжить создание».':e.savedCheckpoint&&e.retryable?(e.providerCode==='timeout'?'ИИ не завершил '+aiStage+' за отведённое время. ':'Сервис ИИ прервал '+aiStage+'. ')+'Завершённые этапы и описание сохранены. Нажмите «Продолжить создание».':e.status?e.message:'Не удалось сохранить или получить результат. Повторите получение.';console.warn(JSON.stringify({event:'ai.analysis.failed',sourceHash:sourceHash.slice(0,12),stage:e.stage||'validation',providerCode:e.providerCode||'unknown',status:job.status,attempt:e.attempt||0,resumable:job.resumable,at:new Date().toISOString(),requestMs:e.requestMs,maxTokens:e.maxTokens,inputChars:e.inputChars,finishReason:e.finishReason,suggestedMaxTokens:e.suggestedMaxTokens,providerStatus:e.providerStatus,providerHint:String(e.providerHint||'').replace(/vibe_api_[\w-]+/g,'[redacted]').slice(0,600),detail:String(e.message||'').replace(/vibe_api_[\w-]+/g,'[redacted]').slice(0,1200)}))}finally{job.done=true;setTimeout(()=>{aiJobs.delete(jobId);aiJobKeys.delete(jobKey)},3600000).unref()}});return;
  }

  if(req.method==='GET'&&u.pathname==='/api/note/job'){
   const job=publicationJobs.get(u.searchParams.get('id'));if(!job||job.uid!==identity.uid)throw fail('Сохранение не найдено. Повторите запрос с той же схемой.',404);
   if(!job.done)return json(res,200,{pending:true});
   if(job.status>=400)return json(res,job.status,job.result);
   return json(res,200,{pending:false,result:job.result});
  }
  if(req.method==='POST'&&['/api/note/publish','/api/note/sync'].includes(u.pathname)&&!req.publicationWorker){
   const payload=await body(req),doc=id(payload.documentId),operation=String(payload.operationId||'');if(!/^[a-zA-Z0-9-]{16,80}$/.test(operation))throw fail('Некорректный идентификатор публикации');
   const jobKey=identity.uid+':'+doc+':'+operation,prior=publicationJobKeys.get(jobKey);if(prior)return json(res,202,{jobId:prior});
   if([...publicationJobs.values()].filter(x=>!x.done&&x.uid===identity.uid).length>=2)throw fail('Дождитесь завершения предыдущего сохранения.',429);
   const jobId=randomUUID(),job={uid:identity.uid,done:false,status:202,result:null};publicationJobs.set(jobId,job);publicationJobKeys.set(jobKey,jobId);
   json(res,202,{jobId});
   // Stay in the request's AsyncLocalStorage context; Gateway never waits for uploads.
   setImmediate(async()=>{const worker=Object.assign(Readable.from([Buffer.from(JSON.stringify(payload))]),{url:req.url,method:req.method,headers:req.headers,publicationWorker:true});const response={writeHead(status){job.status=status},end(data){try{job.result=JSON.parse(data)}catch{job.status=502;job.result={error:'Не удалось прочитать результат сохранения'}}}};try{await route(worker,response)}catch{job.status=502;job.result={error:'Сохранение прервалось. Повторите запрос с той же схемой.'}}finally{job.done=true;if(job.status>=400)publicationJobKeys.delete(jobKey);setTimeout(()=>{publicationJobs.delete(jobId);if(publicationJobKeys.get(jobKey)===jobId)publicationJobKeys.delete(jobKey)},3600000).unref()}});
   return;
  }
  if(req.method==='GET'&&u.pathname==='/api/session')return json(res,200,{perUser:identity.perUser,userId:identity.uid});
  if(req.method==='GET'&&u.pathname==='/api/note/documents'){
   const q=u.searchParams.get('q')||'',cursor=u.searchParams.get('cursor');
   const path=q.length>=3?'/v1/note/documents/search?query='+encodeURIComponent(q)+'&limit=100':'/v1/note/documents?limit=100'+(cursor?'&afterCursor='+encodeURIComponent(cursor):'');
   const j=await api(path);return json(res,200,{data:j.data.map(x=>({id:x.documentId||x.id,title:x.title,collectionId:x.collectionId})),nextCursor:j.meta?.nextCursor||null,hasMore:!!j.meta?.hasMore});
  }
  if(req.method==='GET'&&u.pathname==='/api/note/preview'){
   const d=(await api('/v1/note/documents/'+id(u.searchParams.get('id')))).data;
   if(d.isArchived||d.isTrashed)throw fail('Статья в архиве или корзине',409);
   return json(res,200,{id:d.id,title:d.title,revision:hash(d.markdown),hasBlock:articleBlocks(d.markdown).length>0});
  }
  if(req.method==='GET'&&u.pathname==='/api/note/diagram'){
   const docId=id(u.searchParams.get('article')),diagramId=uuid(u.searchParams.get('diagram'));
   const d=(await api('/v1/note/documents/'+docId)).data;
   if(d.isArchived||d.isTrashed)throw fail('Статья в архиве или корзине',409);
   const matches=articleBlocks(d.markdown).filter(x=>x.diagramId===diagramId&&x.documentId===docId);if(matches.length!==1)throw fail('Схема удалена или её блок изменён в статье. Откройте актуальную ссылку из статьи.',409);
   const block=matches[0],source=await readSnapshot(docId,block);
   return json(res,200,{...publicationResult(docId,d,block),xml:source.xml,name:source.name});
  }
  if(req.method==='POST'&&['/api/note/publish','/api/note/sync'].includes(u.pathname)){
   const sync=u.pathname.endsWith('/sync'),b=await body(req),docId=id(b.documentId),operation=String(b.operationId||'');
   if(!/^[a-zA-Z0-9-]{16,80}$/.test(operation))throw fail('Некорректный идентификатор публикации');
   if(typeof b.xml!=='string'||!b.xml.includes('http://www.omg.org/spec/BPMN/20100524/MODEL')||/<!DOCTYPE|<!ENTITY/i.test(b.xml))throw fail('Некорректная схема');
   if(typeof b.png!=='string'||b.png.length>7000000||!/^iVBORw0KGgo[A-Za-z0-9+/=]+$/.test(b.png))throw fail('Некорректное PNG-изображение');
   const requested=b.diagramId?uuid(b.diagramId):null;if(sync&&!requested)throw fail('Не указана схема');
   const lock=docId;if(publishing.has(lock))throw fail('Статья уже сохраняется. Повторите сохранение.',409);publishing.add(lock);
   try{
    const path='/v1/note/documents/'+docId;let d=(await api(path)).data;
    if(d.isArchived||d.isTrashed)throw fail('Статья в архиве или корзине',409);
    let blocks=articleBlocks(d.markdown);const duplicate=blocks.find(x=>x.operation===operation&&x.documentId===docId&&(!requested||x.diagramId===requested));
    if(duplicate)return json(res,200,publicationResult(docId,d,duplicate,{duplicate:true}));
    let matches=requested?blocks.filter(x=>x.diagramId===requested&&x.documentId===docId):blocks;
    if(matches.length>1)throw fail('В статье несколько схем. Откройте нужную по ссылке в статье.',409);
    const old=matches[0];
    if(sync&&(!old||blockRevision(old)!==b.blockRevision))throw fail('Схема в статье изменена другим сотрудником. Автообновление остановлено. Скачайте свой BPMN и откройте актуальную ссылку из статьи.',409);
    if(!sync&&hash(d.markdown)!==b.revision)throw fail('Статья изменилась. Выберите её повторно перед публикацией.',409);
    const diagramId=requested||old?.diagramId||randomUUID(),initial=d.markdown||'',filename=String(b.name||'Схема').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,100);
    const version=await storeSnapshot(docId,diagramId,b.xml,filename);
    const image=(await api(path+'/files',{fileName:filename+'.png',fileContent:b.png})).data;
    const source=(await api(path+'/files',{fileName:filename+'.txt',fileContent:Buffer.from(b.xml).toString('base64')})).data;
    const link=origin+'/diagram/'+docId+'/'+diagramId+'?'+new URLSearchParams({version,publication:operation});
    const block='### Схема процесса — BPMN Студия\n\n'+image.assetMarkdown+'\n\nИсходная схема BPMN XML (.txt — открывается в BPMN Студии):\n\n'+source.assetMarkdown+'\n\n[Открыть и редактировать схему]('+link+')';
    d=(await api(path)).data;if(d.isArchived||d.isTrashed)throw fail('Статья в архиве или корзине',409);
    let current=old;
    if(sync){const a=articleBlocks(d.markdown).filter(x=>x.diagramId===diagramId&&x.documentId===docId);if(a.length!==1||blockRevision(a[0])!==b.blockRevision)throw fail('Схема изменена другим сотрудником. Автообновление остановлено; сохраните свою копию BPMN.',409);current=a[0]}
    else if(hash(d.markdown)!==b.revision)throw fail('Статья изменена другим сотрудником. Вложения загружены, текст не изменён. Выберите статью повторно.',409);
    const updated=replaceBlock(d.markdown||'',current,block);if(Buffer.byteLength(updated)>1048576)throw fail('Статья превысит лимит размера',413);
    await api(path,{markdown:updated,overwrite:false},'PATCH');
    const result=(await api(path)).data,confirmed=articleBlocks(result.markdown).find(x=>x.diagramId===diagramId&&x.documentId===docId&&x.operation===operation);
    if(!confirmed)throw fail('Результат сохранения не подтверждён. Повторите сохранение, сохранив свою копию BPMN.',502);
    return json(res,200,publicationResult(docId,result,confirmed));
   }finally{publishing.delete(lock)}
  }

  if(req.method==='GET'&&u.pathname==='/api/disk/storages'){
   const type=u.searchParams.get('type')||'user';if(!['user','common','group'].includes(type))throw fail('Некорректный тип диска');
   const filters='&filter[entityType]='+type+(type==='user'?'&filter[entityId]='+id(identity.uid):'');
   const j=await api('/v1/storages?limit=100'+filters+'&offset='+Math.max(0,Number(u.searchParams.get('offset'))||0));
   return json(res,200,{data:j.data.map(x=>({id:x.id,name:x.name,rootFolderId:x.rootFolderId,entityType:x.entityType})),hasMore:!!j.meta?.hasMore});
  }
  if(req.method==='GET'&&u.pathname==='/api/disk/folder'){
   const j=await api('/v1/folders?parentId='+id(u.searchParams.get('id'))+'&limit=100&offset='+Math.max(0,Number(u.searchParams.get('offset'))||0));
   return json(res,200,{data:j.data.filter(x=>!x.deletedType).map(x=>({id:x.id,name:x.name,type:x.type,size:x.size,updatedAt:x.updatedAt})),hasMore:!!j.meta?.hasMore});
  }
  if(req.method==='GET'&&u.pathname==='/api/disk/open'){
   const fileId=id(u.searchParams.get('id'));const meta=(await api('/v1/files/'+fileId)).data;
   if(meta.deletedType||! /\.(bpmn|xml|txt|drawio)$/i.test(meta.name))throw fail('Выберите файл .bpmn, .drawio, .xml или .txt с XML схемы');
   if(meta.size>8*1024*1024)throw fail('Файл превышает 8 МБ',413);
   const r=await fetch(base+'/v1/files/'+fileId+'/download',{headers:{'X-Api-Key':identity.key,...(identity.bearer?{'Authorization':identity.bearer}:{})},signal:AbortSignal.timeout(60000)});
   if(!r.ok)throw fail('Не удалось скачать файл с Диска',502);
   let chunks=[],n=0;for await(const c of r.body){n+=c.length;if(n>8*1024*1024)throw fail('Файл превышает 8 МБ',413);chunks.push(c)}
   const xml=Buffer.concat(chunks).toString('utf8');if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw fail('DTD и внешние сущности в XML не поддерживаются');
   return json(res,200,{name:meta.name,xml,id:fileId});
  }
  if(req.method==='POST'&&u.pathname==='/api/disk/save'){
   const b=await body(req),folderId=id(b.folderId);let name=String(b.name||'').trim();
   if(!name||name.length>180||/[<>:"/\\|?*\x00-\x1f]/.test(name))throw fail('Укажите корректное имя файла');
   if(!/\.bpmn$/i.test(name))name+='.bpmn';
   if(typeof b.xml!=='string'||!b.xml.includes('http://www.omg.org/spec/BPMN/20100524/MODEL')||/<!DOCTYPE|<!ENTITY/i.test(b.xml))throw fail('Некорректный BPMN XML');
   const existing=await api('/v1/folders?parentId='+folderId+'&filter[name]='+encodeURIComponent(name)+'&limit=100');
   if(existing.data.some(x=>x.name===name&&!x.deletedType))throw fail('Такое имя уже есть в папке. Укажите другое имя.',409);
   const data=Buffer.from(b.xml,'utf8');const j=await api('/v1/files/upload',{folderId:Number(folderId),filename:name,content:data.toString('base64')});
   if(j.data.size!==undefined&&Number(j.data.size)!==data.length)throw fail('Диск сообщил другую длину файла. Проверьте сохранённый файл перед повтором.',502);
   return json(res,201,{id:j.data.id,name:j.data.name,size:j.data.size});
  }
  throw fail('Маршрут не найден',404);
 }
 const files={'/':'index.html','/index.html':'index.html','/modeler.js':'modeler.js','/importer.js':'importer.js','/editor-custom.js':'editor-custom.js','/ai-editor.js':'ai-editor.js','/ai-patch.js':'ai-patch.js','/bpmn-guide.json':'bpmn-guide.json','/pdf.js':'pdf.js','/font.css':'font.css','/diagram.css':'diagram.css'};
 if(!['GET','HEAD'].includes(req.method)||(!files[u.pathname]&&!/^\/diagram\/[1-9]\d*\/[a-f0-9-]{36}\/?$/i.test(u.pathname)))throw fail('Не найдено',404);
 const diagramPath=/^\/diagram\/[1-9]\d*\/[a-f0-9-]{36}\/?$/i.test(u.pathname);const b=await readFile(root+(diagramPath?'index.html':files[u.pathname]));res.writeHead(200,{'Content-Type':u.pathname.endsWith('.json')?'application/json; charset=utf-8':u.pathname.endsWith('.js')?'application/javascript':u.pathname.endsWith('.css')?'text/css':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:b);
 }catch(e){json(res,e.status||502,{error:e.status?e.message:'Нет ответа от Диска. Если выполнялось сохранение, проверьте папку перед повтором.'})}}

// Verification is coalesced per exact credentials and never blocks the gateway.
const verifiedSessions=new Map(),sessionChecks=new Map();
async function verifiedUser(appKey,bearer){
 const sessionHash=hash(appKey+'\n'+bearer),cached=verifiedSessions.get(sessionHash);
 if(cached&&cached.expires>Date.now())return cached.uid;
 verifiedSessions.delete(sessionHash);let check=sessionChecks.get(sessionHash);
 if(!check){
  if(sessionChecks.size>=128)throw Object.assign(fail('Проверка сессии занята. Повторите получение результата.',503),{code:'AUTH_CHECK_UNAVAILABLE'});
  check=(async()=>{
   let r,j;try{r=await fetch(base+'/v1/me',{headers:{'X-Api-Key':appKey,Authorization:bearer},signal:AbortSignal.timeout(30000)});j=await r.json()}catch{throw Object.assign(fail('Сервис подтверждения сессии не ответил. Повторите проверку готовности.',503),{code:'AUTH_CHECK_UNAVAILABLE'})}
   if(r.status>=500||r.status===429)throw Object.assign(fail('Сервис проверки сессии временно недоступен.',503),{code:'AUTH_CHECK_UNAVAILABLE'});
   const uid=String(j.data?.currentUser?.bitrixUserId||'');
   if(!r.ok||!/^\d+$/.test(uid)||j.data?.portal!=='autorus.bitrix24.ru')throw fail('Войдите в приложение через меню Битрикс24. Сессия не подтверждена.',401);
   if(verifiedSessions.size>=128)verifiedSessions.delete(verifiedSessions.keys().next().value);
   verifiedSessions.set(sessionHash,{uid,expires:Date.now()+15000});return uid;
  })().then(uid=>({uid}),error=>({error}));
  sessionChecks.set(sessionHash,check);check.then(result=>{const clear=()=>{if(sessionChecks.get(sessionHash)===check)sessionChecks.delete(sessionHash)};if(result.error)setTimeout(clear,2000).unref();else clear()});
 }
 const result=await new Promise(resolve=>{const timer=setTimeout(()=>resolve(null),800);check.then(value=>{clearTimeout(timer);resolve(value)})});
 if(!result)throw Object.assign(fail('Подтверждаю сессию в фоновом режиме. Запрос к ИИ ещё не запущен.',503),{code:'AUTH_CHECK_PENDING'});
 if(result.error)throw result.error;return result.uid;
}
export async function handler(req,res){
 const started=performance.now();if(req.url.startsWith('/api/ai/'))res.once('finish',()=>{const elapsed=Math.round(performance.now()-started);if(elapsed>1000)console.warn(JSON.stringify({event:'ai.http.slow',path:req.url.split('?')[0],status:res.statusCode,elapsedMs:elapsed}))});
 if(!req.url.startsWith('/api/'))return route(req,res);
 try{
  let auth;
  const bearer=req.headers['x-vibe-authorization'],appKey=process.env.BPMN_OAUTH_KEY||process.env.VIBE_APP_KEY;
  if(appKey&&bearer){
   const uid=await verifiedUser(appKey,bearer);
   auth={key:appKey,bearer,uid,perUser:true};
  }else if(owners.has(req.headers['x-vibe-user-id']))auth={key,uid:'488937',perUser:false};
  else throw fail(appKey?'Откройте BPMN Студию из меню Битрикс24 для подтверждения сессии, затем повторите ссылку из статьи.':'Для коллег ещё не настроен OAuth-ключ приложения. Обратитесь к владельцу.',403);
  return await sessionContext.run(auth,()=>route(req,res));
 }catch(e){json(res,e.status||502,{error:e.status?e.message:'Не удалось проверить авторизацию. Попробуйте позже.',...(['AUTH_CHECK_UNAVAILABLE','AUTH_CHECK_PENDING'].includes(e.code)?{code:e.code}:{})})}
}

if(process.argv[1]===fileURLToPath(import.meta.url))http.createServer(handler).listen(Number(process.env.PORT)||3000,'0.0.0.0');
