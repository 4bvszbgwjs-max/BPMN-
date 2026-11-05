/* Per-element BPMN styling and resize rules. Styles travel with the BPMN XML. */
window.BpmnStudioTools=(()=>{
 // API gateways may return structured errors; never coerce them to "[object Object]".
 function errorMessage(value,fallback='Не удалось выполнить запрос',status){
  const seen=new Set();let code='';
  function read(v,depth=0){
   if(depth>6||v==null)return'';
   if(typeof v==='string'){const text=v.trim();return text&&!text.includes('[object Object]')?text.slice(0,900):''}
   if(typeof v!=='object'||seen.has(v))return'';seen.add(v);
   if(!code&&typeof v.code==='string'&&/^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/.test(v.code))code=v.code;
   for(const k of ['message','detail','description','error','errors']){const text=read(v[k],depth+1);if(text)return text}
   if(Array.isArray(v))for(const item of v){const text=read(item,depth+1);if(text)return text}
   return'';
  }
  const text=read(value),hint=status===401?'Сессия истекла. Откройте приложение из меню Битрикс24.':status===403?'Нет доступа к запросу. Откройте приложение из меню Битрикс24 и проверьте доступ.':status===429?'Слишком много запросов. Дождитесь завершения текущей обработки и повторите.':status===502||status===503||status===504?'Сервис временно недоступен. Повторите получение результата.':fallback;
  return(text||hint)+(code&&!(text||hint).includes(code)?' (код: '+code+')':'')+(!text&&status?' [HTTP '+status+']':'');
 }
 const fonts=['Arial, sans-serif','Verdana, sans-serif','Tahoma, sans-serif','Georgia, serif','Times New Roman, serif','Courier New, monospace'];
 const descriptor={name:'BPMNStudio',uri:'https://bpmn-studio/schema/1.0',prefix:'studio',xml:{tagAlias:'lowerCase'},types:[{name:'LabelStyle',extends:['bpmn:BaseElement'],properties:[{name:'rotation',isAttr:true,type:'Integer'},{name:'fontFamily',isAttr:true,type:'String'},{name:'fontSize',isAttr:true,type:'Integer'},{name:'fontWeight',isAttr:true,type:'String'},{name:'labelPosition',isAttr:true,type:'String'},{name:'colorMode',isAttr:true,type:'String'},{name:'colorPreset',isAttr:true,type:'String'}]}]};
 const is=(el,type)=>!!el?.businessObject?.$instanceOf(type);
 const rotation=el=>((Math.round((Number((el?.labelTarget||el)?.businessObject?.get('studio:rotation'))||0)/90)*90)%360+360)%360;
 const rotatable=el=>!!el&&!el.labelTarget&&!el.waypoints&&Number.isFinite(el.width)&&Number.isFinite(el.height)&&el.width>0&&el.height>0&&!!el.businessObject;
 const containerShape=el=>is(el,'bpmn:Participant')||is(el,'bpmn:Lane');
 const visualRotation=el=>{const a=rotation(el);if(!containerShape(el)||a%180===0)return a;const baseHorizontal=!(el.di?.isHorizontal!==false);return(a+(baseHorizontal?270:90))%360};
 const rotationView=el=>{if(!rotatable(el)||containerShape(el)||rotation(el)%180===0)return el;const view=Object.create(el);view.width=el.height;view.height=el.width;return view};
 const resizable=el=>!!el&&!el.labelTarget&&!el.waypoints&&(is(el,'bpmn:Task')||is(el,'bpmn:CallActivity')||is(el,'bpmn:Gateway')||is(el,'bpmn:Event')||is(el,'bpmn:DataObjectReference')||is(el,'bpmn:DataStoreReference')||(is(el,'bpmn:SubProcess')&&!el.di?.isExpanded));
 const baseMinimum=el=>is(el,'bpmn:Task')||is(el,'bpmn:CallActivity')||is(el,'bpmn:SubProcess')?{width:80,height:50}:is(el,'bpmn:Event')?{width:24,height:24}:{width:40,height:40};
 const minimum=el=>{const m=baseMinimum(el);return rotation(el)%180?{width:m.height,height:m.width}:m};
 const val=(bo,key)=>bo?.get('studio:'+key);
 function styleFor(element){const bo=(element.labelTarget||element).businessObject;return{fontFamily:fonts.includes(val(bo,'fontFamily'))?val(bo,'fontFamily'):fonts[0],fontSize:Math.min(72,Math.max(8,Number(val(bo,'fontSize'))||12)),fontWeight:val(bo,'fontWeight')==='bold'?'bold':'normal',position:['top','bottom'].includes(val(bo,'labelPosition'))?val(bo,'labelPosition'):'default',custom:!!(val(bo,'fontFamily')||val(bo,'fontSize')||val(bo,'fontWeight')||val(bo,'labelPosition'))}}
 const labelText=el=>{const bo=(el.labelTarget||el).businessObject;return is(el,'bpmn:TextAnnotation')?bo.text||'':bo.name||''};
 const palettes={
  blue:{name:'Голубой',fill:'#eaf3ff',stroke:'#6297d2'},
  mint:{name:'Мятный',fill:'#e8f6ef',stroke:'#6ba98b'},
  violet:{name:'Лавандовый',fill:'#f1edfc',stroke:'#9680c9'},
  amber:{name:'Песочный',fill:'#fff6dc',stroke:'#c5aa63'},
  peach:{name:'Персиковый',fill:'#fff0e5',stroke:'#d49a71'},
  rose:{name:'Розовый',fill:'#fcebec',stroke:'#cd818a'},
  teal:{name:'Бирюзовый',fill:'#e8f6f6',stroke:'#6aa5a5'},
  slate:{name:'Серо-голубой',fill:'#f0f4f8',stroke:'#8b9bae'},
  classic:{name:'Белый / классический',fill:'#ffffff',stroke:'#374151'}
 };
 const diFor=el=>(el?.labelTarget||el)?.di;
 const explicitColor=el=>{const d=diFor(el);return !!(d&&(d.get('color:background-color')||d.get('bioc:fill')||d.get('color:border-color')||d.get('bioc:stroke')))};
 function themeFor(el){el=el?.labelTarget||el;if(el?.waypoints)return{fill:'#ffffff',stroke:'#7b8799',name:'Спокойный серый'};if(is(el,'bpmn:StartEvent'))return palettes.mint;if(is(el,'bpmn:EndEvent'))return palettes.rose;if(is(el,'bpmn:Event')||is(el,'bpmn:Gateway'))return palettes.amber;if(is(el,'bpmn:SubProcess')||is(el,'bpmn:CallActivity')||is(el,'bpmn:ServiceTask')||is(el,'bpmn:ScriptTask'))return palettes.violet;if(is(el,'bpmn:ManualTask'))return palettes.peach;if(is(el,'bpmn:BusinessRuleTask'))return palettes.amber;if(is(el,'bpmn:SendTask')||is(el,'bpmn:ReceiveTask')||is(el,'bpmn:DataStoreReference'))return palettes.teal;if(is(el,'bpmn:Task')||is(el,'bpmn:DataObjectReference')||is(el,'bpmn:DataInput')||is(el,'bpmn:DataOutput'))return palettes.blue;if(is(el,'bpmn:TextAnnotation'))return palettes.amber;if(is(el,'bpmn:Lane'))return{fill:'#fbfcff',stroke:'#cbd4e1',name:'Светлая дорожка'};if(is(el,'bpmn:Participant'))return{fill:'#ffffff',stroke:'#b8c5d5',name:'Светлый пул'};return palettes.slate}
 function colorSelection(el){const bo=(el?.labelTarget||el)?.businessObject,mode=val(bo,'colorMode'),preset=val(bo,'colorPreset');if(mode==='auto')return'auto';if(mode==='preset'&&palettes[preset])return preset;return explicitColor(el)?'imported':'auto'}
 function visibleColors(el){const selection=colorSelection(el);if(selection==='auto')return themeFor(el);if(palettes[selection])return palettes[selection];const d=diFor(el);return{fill:d?.get('color:background-color')||d?.get('bioc:fill')||'#ffffff',stroke:d?.get('color:border-color')||d?.get('bioc:stroke')||'#374151',name:'Цвет из файла'}}
 function colorProperties(el,selection){if(selection!=='auto'&&!palettes[selection])return{};const colors=selection==='auto'?themeFor(el):palettes[selection],di={'color:border-color':colors.stroke,'bioc:stroke':colors.stroke};if(!el.waypoints)Object.assign(di,{'color:background-color':colors.fill,'bioc:fill':colors.fill});return{'studio:colorMode':selection==='auto'?'auto':'preset','studio:colorPreset':selection==='auto'?undefined:selection,di}}
 function ensureColors(el){if(!el||el.labelTarget)return;const di=el.di;if(!di||!['bpmndi:BPMNShape','bpmndi:BPMNEdge'].includes(di.$type))return;const selection=colorSelection(el);if(selection==='imported')return;const props=colorProperties(el,selection);if(!props.di)return;el.businessObject.set('studio:colorMode',props['studio:colorMode']);if(props['studio:colorPreset'])el.businessObject.set('studio:colorPreset',props['studio:colorPreset']);Object.entries(props.di).forEach(([k,v])=>di.set(k,v))}
 function labelInk(el){const d=diFor(el),explicit=d?.label?.get('color:color');if(explicit)return explicit;let fill=visibleColors(el).fill;if(/^#[a-f0-9]{3}$/i.test(fill))fill='#'+[...fill.slice(1)].map(c=>c+c).join('');if(/^#[a-f0-9]{6}$/i.test(fill)){const rgb=[1,3,5].map(i=>parseInt(fill.slice(i,i+2),16));if((rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722)<118)return'#ffffff'}return'#26364b'}
 function StudioFeatures(eventBus,bpmnRenderer,textRenderer,modeling,commandStack,bpmnReplace,outline,moddle,elementRegistry,canvas){
  // Keep native BPMN geometry and symbols; only enrich the native renderer's colors.
  // Colors are stored in standard BPMN DI + bioc attributes for portable exports.
  const nativeShape=bpmnRenderer.drawShape.bind(bpmnRenderer),nativeConnection=bpmnRenderer.drawConnection.bind(bpmnRenderer);
  bpmnRenderer.drawShape=(gfx,element,attrs)=>{ensureColors(element);const shape=nativeShape(gfx,element,attrs);if(!element.labelTarget&&shape){const width=is(element,'bpmn:EndEvent')||is(element,'bpmn:CallActivity')?3:is(element,'bpmn:Lane')||is(element,'bpmn:Participant')?1.2:1.6;shape.style.strokeWidth=String(width);shape.style.strokeLinejoin='round'}gfx.querySelectorAll('text.djs-label').forEach(t=>{t.style.fill=labelInk(element);t.setAttribute('fill',labelInk(element))});return shape};
  bpmnRenderer.drawConnection=(gfx,element,attrs)=>{ensureColors(element);const connection=nativeConnection(gfx,element,attrs);if(connection){connection.style.strokeWidth='1.6';connection.style.strokeLinejoin='round';connection.style.strokeLinecap='round'}return connection};
  // BPMN's default provider assumes events/gateways/data symbols have a fixed size.
  // Supply geometry-aware outlines for every shape that our resize rules unlock.
  const tracksOutline=el=>!!el&&!el.labelTarget&&!el.waypoints&&(is(el,'bpmn:Event')||is(el,'bpmn:Gateway')||is(el,'bpmn:DataObjectReference')||is(el,'bpmn:DataStoreReference'));
  function updateOutline(el,node){
   if(!tracksOutline(el))return false;const set=attrs=>Object.entries(attrs).forEach(([k,v])=>node.setAttribute(k,String(v)));
   if(is(el,'bpmn:Event'))set({cx:el.width/2,cy:el.height/2,r:el.width/2+(is(el,'bpmn:EndEvent')?6:5)});
   else if(is(el,'bpmn:Gateway')){
    const w=el.width+10,h=el.height+10;set({x:-5,y:-5,rx:4,width:w,height:h});
    // Map the rectangle's corners to the diamond's vertices, preserving its
    // bounding box even when width and height differ. A plain 45deg rotation
    // makes a stretched gateway's outline too large and incorrectly square.
    Object.assign(node.style,{'transform-box':'fill-box','transform-origin':'center',transform:'matrix(0.5, '+h/(2*w)+', '+(-w/(2*h))+', 0.5, 0, 0)'});
   }
   else set({x:-5,y:-5,width:el.width+10,height:el.height+10,rx:4});
   return true;
  }
  outline.registerProvider(2500,{
   getOutline(el){if(!tracksOutline(el))return;const tag=is(el,'bpmn:Event')?'circle':'rect',node=document.createElementNS('http://www.w3.org/2000/svg',tag);node.classList.add('djs-outline');node.style.fill='none';updateOutline(el,node);return node},
   updateOutline
  });
  // Preserve the visible perimeter docking, not the renderer's hidden center anchor.
  const point=p=>({x:p.x,y:p.y}),clonePoints=ps=>ps.map(point),epsilon=0.01;
  const bounds=el=>({x:el.x,y:el.y,width:el.width,height:el.height});
  function direction(a,b){const dx=b.x-a.x,dy=b.y-a.y;return Math.abs(dx)>=Math.abs(dy)?{x:Math.sign(dx)||1,y:0}:{x:0,y:Math.sign(dy)||1}}
  function mapAnchor(p,old,shape){
   let u=(p.x-old.x)/old.width,v=(p.y-old.y)/old.height;
   if(is(shape,'bpmn:Event')){const dx=(u-.5)*2,dy=(v-.5)*2,r=Math.hypot(dx,dy)||1;u=.5+dx/(2*r);v=.5+dy/(2*r)}
   else if(is(shape,'bpmn:Gateway')){const dx=(u-.5)*2,dy=(v-.5)*2,r=Math.abs(dx)+Math.abs(dy)||1;u=.5+dx/(2*r);v=.5+dy/(2*r)}
   else if(is(shape,'bpmn:Activity')){
    const r=Math.min(10,old.width/2,old.height/2),lx=p.x-old.x,ly=p.y-old.y;
    const left=lx<r,right=lx>old.width-r,top=ly<r,bottom=ly>old.height-r;
    if((left||right)&&(top||bottom)){
     const cx=left?r:old.width-r,cy=top?r:old.height-r,angle=Math.atan2(ly-cy,lx-cx),nr=Math.min(10,shape.width/2,shape.height/2);
     return{x:shape.x+(left?nr:shape.width-nr)+nr*Math.cos(angle),y:shape.y+(top?nr:shape.height-nr)+nr*Math.sin(angle)};
    }
   }
   return{x:shape.x+u*shape.width,y:shape.y+v*shape.height};
  }
  function outsideLead(p,d,shape){const gap=20;
   return{x:d.x>0?Math.max(p.x+gap,shape.x+shape.width+gap):d.x<0?Math.min(p.x-gap,shape.x-gap):p.x,y:d.y>0?Math.max(p.y+gap,shape.y+shape.height+gap):d.y<0?Math.min(p.y-gap,shape.y-gap):p.y};
  }
  function crossesInterior(a,b,r){
   const l=r.x+epsilon,t=r.y+epsilon,right=r.x+r.width-epsilon,bottom=r.y+r.height-epsilon;
   if(Math.abs(a.y-b.y)<epsilon)return a.y>t&&a.y<bottom&&Math.max(a.x,b.x)>l&&Math.min(a.x,b.x)<right;
   if(Math.abs(a.x-b.x)<epsilon)return a.x>l&&a.x<right&&Math.max(a.y,b.y)>t&&Math.min(a.y,b.y)<bottom;
   return true;
  }
  const orthogonal=(a,b)=>Math.abs(a.x-b.x)<epsilon||Math.abs(a.y-b.y)<epsilon;
  function simplify(ps){const out=[];for(const p of ps){const last=out.at(-1);if(last&&Math.hypot(p.x-last.x,p.y-last.y)<epsilon)continue;while(out.length>1){const a=out.at(-2),b=out.at(-1);if((Math.abs(a.x-b.x)<epsilon&&Math.abs(b.x-p.x)<epsilon&&(b.y-a.y)*(p.y-b.y)>=0)||(Math.abs(a.y-b.y)<epsilon&&Math.abs(b.y-p.y)<epsilon&&(b.x-a.x)*(p.x-b.x)>=0))out.pop();else break}out.push(point(p))}return out}
  // A small orthogonal visibility grid keeps bends outside the two endpoint shapes.
  function routeBetween(a,b,rects,initialAxis,finalAxis){
   const unique=xs=>Array.from(new Set(xs)).sort((a,b)=>a-b),xs=unique([a.x,b.x,(a.x+b.x)/2,...rects.flatMap(r=>[r.x-20,r.x+r.width+20])]),ys=unique([a.y,b.y,(a.y+b.y)/2,...rects.flatMap(r=>[r.y-20,r.y+r.height+20])]);
   const start=xs.indexOf(a.x)+','+ys.indexOf(a.y)+','+initialAxis,queue=[{key:start,x:xs.indexOf(a.x),y:ys.indexOf(a.y),axis:initialAxis,cost:0}],costs=new Map([[start,0]]),previous=new Map();let finish;
   while(queue.length){queue.sort((a,b)=>a.cost-b.cost);const n=queue.shift();if(n.cost!==costs.get(n.key))continue;if(xs[n.x]===b.x&&ys[n.y]===b.y){finish=n.key;break}
    for(const [dx,dy,axis]of [[-1,0,'h'],[1,0,'h'],[0,-1,'v'],[0,1,'v']]){const x=n.x+dx,y=n.y+dy;if(x<0||x>=xs.length||y<0||y>=ys.length)continue;const p={x:xs[n.x],y:ys[n.y]},q={x:xs[x],y:ys[y]};if(rects.some(r=>crossesInterior(p,q,r)))continue;const key=x+','+y+','+axis,turn=axis===n.axis?0:12,endTurn=q.x===b.x&&q.y===b.y&&axis!==finalAxis?12:0,cost=n.cost+Math.abs(q.x-p.x)+Math.abs(q.y-p.y)+turn+endTurn;if(cost>=(costs.get(key)??Infinity))continue;costs.set(key,cost);previous.set(key,n.key);queue.push({key,x,y,axis,cost})}
   }
   if(!finish)return[a,{x:b.x,y:a.y},b];const path=[];for(let key=finish;key;key=previous.get(key)){const [x,y]=key.split(',').map(Number);path.push({x:xs[x],y:ys[y]})}return path.reverse();
  }
  function pinnedRoute(connection,old,start,end,directions={}){
   // Free-form/diagonal connectors keep their user-drawn bendpoints.
   const boxValid=el=>['x','y','width','height'].every(k=>Number.isFinite(el[k]));if(!boxValid(connection.source)||!boxValid(connection.target))return[start,...old.slice(1,-1),end];
   const isOrthogonal=old.slice(1).every((p,i)=>orthogonal(old[i],p));
   if(!isOrthogonal)return[start,...old.slice(1,-1),end];
   const sourceDir=directions.source||direction(old[0],old[1]),targetDir=directions.target||direction(old.at(-1),old.at(-2)),rects=[bounds(connection.source),bounds(connection.target)];
   // Preserve existing bends whenever only shifting the adjacent segment is enough.
   if(old.length>=4){const ps=clonePoints(old);ps[0]=start;ps[ps.length-1]=end;if(sourceDir.x)ps[1].y=start.y;else ps[1].x=start.x;if(targetDir.x)ps[ps.length-2].y=end.y;else ps[ps.length-2].x=end.x;
    const sourceOut=(ps[1].x-start.x)*sourceDir.x+(ps[1].y-start.y)*sourceDir.y>epsilon,targetOut=(ps.at(-2).x-end.x)*targetDir.x+(ps.at(-2).y-end.y)*targetDir.y>epsilon;
    if(sourceOut&&targetOut&&ps.slice(1).every((p,i)=>orthogonal(ps[i],p))&&ps.slice(2,-1).every((p,i)=>!rects.some(r=>crossesInterior(ps[i+1],p,r))))return simplify(ps);
   }
   const a=outsideLead(start,sourceDir,connection.source),b=outsideLead(end,targetDir,connection.target),middle=routeBetween(a,b,rects,sourceDir.x?'h':'v',targetDir.x?'h':'v');return simplify([start,...middle,end]);
  }
  eventBus.on('commandStack.shape.resize.preExecute',2500,event=>{
   const c=event.context,s=c.shape;if(!s||s.labelTarget||s.waypoints||!s.width||!s.height)return;
   c.studioDocking={bounds:bounds(s),connections:Array.from(new Set([...(s.incoming||[]),...(s.outgoing||[])])).filter(e=>e.waypoints?.length>=2&&e.waypoints.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))).map(connection=>({connection,points:clonePoints(connection.waypoints)}))};
  });
  eventBus.on('commandStack.shape.resize.postExecuted',700,event=>{
   const c=event.context,s=c.shape,saved=c.studioDocking;if(!saved)return;
   for(const entry of saved.connections){const e=entry.connection,old=entry.points,start=e.source===s?mapAnchor(old[0],saved.bounds,s):old[0],end=e.target===s?mapAnchor(old.at(-1),saved.bounds,s):old.at(-1),ps=pinnedRoute(e,old,start,end);ps[0].original=point(start);ps[ps.length-1].original=point(end);modeling.updateWaypoints(e,ps,{startChanged:e.source===s,endChanged:e.target===s});}
  });

  const quarter=(p,turn)=>turn===90?{x:-p.y,y:p.x}:turn===180?{x:-p.x,y:-p.y}:turn===270?{x:p.y,y:-p.x}:point(p);
  const turnPoint=(p,c,turn)=>{const v=quarter({x:p.x-c.x,y:p.y-c.y},turn);return{x:c.x+v.x,y:c.y+v.y}};
  function writeBounds(el,b,labelDi){Object.assign(el,b);if(el.labelTarget){const host=el.labelTarget.di;if(host){if(arguments.length===3)host.label=labelDi;else if(!host.label){host.label=moddle.create('bpmndi:BPMNLabel',{bounds:moddle.create('dc:Bounds',b)});host.label.$parent=host;host.label.bounds.$parent=host.label}if(host.label?.bounds)Object.assign(host.label.bounds,b)}const gfx=elementRegistry.getGraphics(el);if(gfx)gfx.setAttribute('transform','translate('+b.x+' '+b.y+')')}else if(el.di?.bounds)Object.assign(el.di.bounds,b)}
  function writePoints(el,ps){el.waypoints=ps.map(p=>({...p,...(p.original?{original:point(p.original)}:{})}));if(el.di)el.di.waypoint=ps.map(p=>moddle.create('dc:Point',point(p)))}
  function collectRotation(element){
   const root=canvas.findRoot(element),all=elementRegistry.getAll(),shapes=new Set([element]);let added;
   do{added=false;for(const el of all){if(el.waypoints||canvas.findRoot(el)!==root||shapes.has(el))continue;if(shapes.has(el.parent)||shapes.has(el.host)||(el.businessObject?.lanes||[]).some(l=>[...shapes].some(s=>s.id===l.id))){shapes.add(el);added=true}}}while(added);
   const connections=all.filter(el=>el.waypoints&&el.waypoints.length>=2&&(shapes.has(el.source)||shapes.has(el.target)));
   for(const el of all)if(el.labelTarget&&(shapes.has(el.labelTarget)||connections.some(c=>c===el.labelTarget&&shapes.has(c.source)&&shapes.has(c.target))))shapes.add(el);
   return{shapes:[...shapes].filter(el=>Number.isFinite(el.x)&&Number.isFinite(el.width)).map(el=>({el,bounds:bounds(el),horizontal:el.di?.isHorizontal,labelDi:el.labelTarget?el.labelTarget.di?.label:undefined,storedRotation:el.labelTarget?undefined:el.businessObject.get('studio:rotation')})),connections:connections.map(el=>({el,points:el.waypoints.map(p=>({...point(p),...(p.original?{original:point(p.original)}:{})}))}))};
  }
  function restoreRotation(state){for(const s of state.shapes){if(s.el.labelTarget)writeBounds(s.el,s.bounds,s.labelDi);else writeBounds(s.el,s.bounds);if(!s.el.labelTarget){s.el.businessObject.set('studio:rotation',s.storedRotation);if(containerShape(s.el)&&s.el.di)s.el.di.isHorizontal=s.horizontal}}for(const c of state.connections)writePoints(c.el,c.points);return[...state.shapes.filter(s=>!s.el.labelTarget).map(s=>s.el),...state.connections.map(c=>c.el)]}
  commandStack.register('studio.rotate',{
   canExecute(ctx){return rotatable(ctx.element)&&[0,90,180,270].includes(ctx.angle)},
   execute(ctx){
    if(ctx.after)return restoreRotation(ctx.after);
    ctx.before=collectRotation(ctx.element);const turn=(ctx.angle-rotation(ctx.element)+360)%360,c={x:ctx.element.x+ctx.element.width/2,y:ctx.element.y+ctx.element.height/2},set=new Set(ctx.before.shapes.map(s=>s.el));
    for(const s of ctx.before.shapes){const b=s.bounds,center=turnPoint({x:b.x+b.width/2,y:b.y+b.height/2},c,turn),swap=turn%180&&!s.el.labelTarget,w=swap?b.height:b.width,h=swap?b.width:b.height;writeBounds(s.el,{x:center.x-w/2,y:center.y-h/2,width:w,height:h});if(!s.el.labelTarget){s.el.businessObject.set('studio:rotation',(rotation(s.el)+turn)%360);if(containerShape(s.el)&&s.el.di&&turn%180)s.el.di.isHorizontal=!(s.el.di.isHorizontal!==false)}}
    for(const saved of ctx.before.connections){const e=saved.el,old=saved.points,source=set.has(e.source),target=set.has(e.target);let ps;
     if(source&&target)ps=old.map(p=>turnPoint(p,c,turn));else{const start=source?turnPoint(old[0],c,turn):point(old[0]),end=target?turnPoint(old.at(-1),c,turn):point(old.at(-1));ps=pinnedRoute(e,old,start,end,{source:source?quarter(direction(old[0],old[1]),turn):undefined,target:target?quarter(direction(old.at(-1),old.at(-2)),turn):undefined})}
     ps[0].original=point(ps[0]);ps[ps.length-1].original=point(ps.at(-1));writePoints(e,ps);
    }
    ctx.after={shapes:ctx.before.shapes.map(s=>({el:s.el,bounds:bounds(s.el),horizontal:s.el.di?.isHorizontal,labelDi:s.el.labelTarget?s.el.labelTarget.di?.label:undefined,storedRotation:s.el.labelTarget?undefined:s.el.businessObject.get('studio:rotation')})),connections:ctx.before.connections.map(c=>({el:c.el,points:c.el.waypoints.map(p=>({...p}))}))};return[...ctx.after.shapes.filter(s=>!s.el.labelTarget).map(s=>s.el),...ctx.after.connections.map(c=>c.el)];
   },revert(ctx){return restoreRotation(ctx.before)}
  });
  commandStack.register('studio.applyProperties',{
   preExecute(context){const v=context.values;let el=context.element;if(['bpmn:Task','bpmn:UserTask','bpmn:ServiceTask'].includes(el.type)&&v.type!==el.type){const angle=el.businessObject.get('studio:rotation');el=bpmnReplace.replaceElement(el,{type:v.type});if(angle!==undefined)modeling.updateProperties(el,{'studio:rotation':angle})}if(resizable(el)&&(Math.round(el.width)!==v.width||Math.round(el.height)!==v.height))modeling.resizeShape(el,{x:el.x,y:el.y,width:v.width,height:v.height});modeling.updateProperties(el,{...(v.documentation!==undefined?{documentation:v.documentation?[moddle.create('bpmn:Documentation',{text:v.documentation})]:[]}:{}),[is(el,'bpmn:TextAnnotation')?'text':'name']:v.name,'studio:fontFamily':v.font,'studio:fontSize':v.fontSize,'studio:fontWeight':v.weight,'studio:labelPosition':v.position,...colorProperties(el,v.color)});context.result=el},
   execute(context){return context.result},revert(context){return context.element}
  });
  eventBus.on('commandStack.shape.resize.canExecute',2000,event=>{const {shape,newBounds}=event.context;if(!resizable(shape))return;const min=minimum(shape);return !newBounds||(newBounds.width>=min.width&&newBounds.height>=min.height&&newBounds.width<=3000&&newBounds.height<=3000)});
  eventBus.on('commandStack.shape.resize.preExecuted',1000,event=>{const exact=event.context.hints?.studioLabelBounds;if(exact)event.context.newBounds={...exact}});
  eventBus.on('resize.start',1600,event=>{if(resizable(event.context.shape))event.context.minDimensions=minimum(event.context.shape)});
  // Keep circular events circular, including when a side handle is dragged.
  eventBus.on('resize.move',750,event=>{const c=event.context;if(!is(c.shape,'bpmn:Event')||!c.newBounds)return;const n=c.newBounds,side=Math.max(n.width,n.height);n.width=n.height=side;if(c.direction.includes('w'))n.x=c.shape.x+c.shape.width-side;if(c.direction.includes('n'))n.y=c.shape.y+c.shape.height-side;c.canExecute=side>=24&&side<=3000});
  function externalBounds(el){if(!el.label||el.labelTarget)return;const st=styleFor(el);if(!st.custom)return;const text=labelText(el),width=el.waypoints?140:Math.max(90,el.width),dims=textRenderer.getDimensions(text,{box:{width},style:{fontFamily:st.fontFamily,fontSize:st.fontSize,fontWeight:st.fontWeight,lineHeight:1.2}});const height=Math.max(st.fontSize*1.2,Math.ceil(dims.height)),label=el.label;
   let x=label.x+label.width/2-width/2,y=label.y;if(st.position==='top'||st.position==='bottom'){if(el.waypoints){const points=el.waypoints,k=Math.floor((points.length-1)/2),a=points[k],b=points[k+1]||a;x=(a.x+b.x)/2-width/2;const midY=(a.y+b.y)/2;y=st.position==='top'?midY-height-8:midY+8}else{x=el.x+(el.width-width)/2;y=st.position==='top'?el.y-height-8:el.y+el.height+8}}
   const bounds={x:Math.round(x),y:Math.round(y),width:Math.round(width),height:Math.round(height)};if(['x','y','width','height'].some(k=>Math.abs(label[k]-bounds[k])>0.5))modeling.resizeShape(label,bounds,undefined,{studioLabelBounds:{...bounds}});
  }
  eventBus.on(['commandStack.shape.resize.postExecuted','commandStack.element.updateProperties.postExecuted','commandStack.element.updateLabel.postExecuted'],900,event=>externalBounds(event.context.shape||event.context.element));
  function renderStyled(element,gfx){
   const host=element.labelTarget||element,st=styleFor(element);if(!st.custom)return bpmnRenderer.drawShape(gfx,element);
   const result=bpmnRenderer.drawShape(gfx,element);
   // External labels render in their own shape; the host must keep its BPMN symbol untouched.
   if(!element.labelTarget&&(element.label||['bpmn:Event','bpmn:Gateway','bpmn:DataStoreReference','bpmn:DataObjectReference','bpmn:DataInput','bpmn:DataOutput','bpmn:Group'].some(type=>is(element,type))))return result;
   const nativeLabels=Array.from(gfx.querySelectorAll('text.djs-label'));if(!nativeLabels.length&&!element.labelTarget&&!labelText(element))return result;
   nativeLabels.forEach(t=>t.remove());const text=labelText(element);if(!text)return result;
   let width=element.width,height=element.height,x=0,y=0,padding=7,align='center-middle';
   if(element.labelTarget){padding=0;}
   else if(st.position==='top'||st.position==='bottom'){
    width=Math.max(host.width,90);const d=textRenderer.getDimensions(text,{box:{width},style:{fontFamily:st.fontFamily,fontSize:st.fontSize,fontWeight:st.fontWeight,lineHeight:1.2}});height=Math.max(st.fontSize*1.2,Math.ceil(d.height));x=(host.width-width)/2;y=st.position==='top'?-height-8:host.height+8;padding=0;
   }else if(is(host,'bpmn:SubProcess')&&host.di?.isExpanded){align='center-top';}
   else if(is(host,'bpmn:TextAnnotation')){align='left-top';}
   // TextUtil's createText uses a box in local SVG coordinates and measures with the selected font.
   const node=textRenderer.createText(text,{box:{x,y,width,height},align,padding,style:{fontFamily:st.fontFamily,fontSize:st.fontSize,fontWeight:st.fontWeight,lineHeight:1.2,fill:labelInk(element)}});node.classList.add('djs-label');node.setAttribute('data-studio-font',String(st.fontSize));if(x||y)node.setAttribute('transform','translate('+x+' '+y+')');gfx.append(node);return element.labelTarget?node:result;
  }
  eventBus.on('render.shape',2100,event=>{const el=event.element;if(!rotatable(el)||!rotation(el))return;const result=renderStyled(rotationView(el),event.gfx),group=document.createElementNS('http://www.w3.org/2000/svg','g'),angle=visualRotation(el);group.setAttribute('data-studio-rotation',String(rotation(el)));group.setAttribute('transform',angle===0?'translate(0 0)':angle===90?'translate('+el.width+' 0) rotate(90)':angle===180?'translate('+el.width+' '+el.height+') rotate(180)':'translate(0 '+el.height+') rotate(270)');while(event.gfx.firstChild)group.append(event.gfx.firstChild);event.gfx.append(group);return result});
  eventBus.on('render.shape',2000,event=>{if(!styleFor(event.element).custom)return;return renderStyled(event.element,event.gfx)});
 }
 StudioFeatures.$inject=['eventBus','bpmnRenderer','textRenderer','modeling','commandStack','bpmnReplace','outline','moddle','elementRegistry','canvas'];
 const module={__init__:['studioFeatures'],studioFeatures:['type',StudioFeatures]};
 function modelerOptions(container){return{container,additionalModules:[module],moddleExtensions:{studio:descriptor}}}
 return{rotation,rotatable,errorMessage,module,descriptor,fonts,is,resizable,minimum,styleFor,modelerOptions,palettes,themeFor,colorSelection,visibleColors,colorProperties};
})();
