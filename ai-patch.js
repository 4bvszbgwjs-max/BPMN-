/* Apply only validated diagram operations to a separate modeler before replacing the canvas. */
window.applyAISchemePatch=async function(editor,operations){
 const modeling=editor.get('modeling'),registry=editor.get('elementRegistry'),factory=editor.get('elementFactory'),moddle=editor.get('moddle'),replace=editor.get('bpmnReplace');
 const get=id=>{const e=registry.get(id);if(!e)throw Error('Элемент больше не найден: '+id);return e};
 function parent(id){return registry.get(id+'_plane')||registry.get(id)||registry.getAll().find(e=>e.businessObject?.processRef?.id===id)||(()=>{const root=editor.get('canvas').getRootElement();return root.businessObject.id===id?root:null})()}
 function event(e,op){if(op.cancelActivity!==undefined)modeling.updateProperties(e,{cancelActivity:op.cancelActivity});if(op.eventType){const def=moddle.create('bpmn:'+op.eventType+'EventDefinition');modeling.updateProperties(e,{eventDefinitions:[def]})}if(op.expression!==undefined){const def=e.businessObject.eventDefinitions?.find(d=>d.$type==='bpmn:TimerEventDefinition')||moddle.create('bpmn:TimerEventDefinition');for(const k of ['timeDuration','timeDate','timeCycle'])def[k]=undefined;def[{duration:'timeDuration',date:'timeDate',cycle:'timeCycle'}[op.timerType||'duration']]=moddle.create('bpmn:FormalExpression',{body:op.expression});modeling.updateProperties(e,{eventDefinitions:[def]})}}
 for(const op of operations){let e;
  if(op.kind==='addNode'){
   const host=op.attachedTo?get(op.attachedTo):null,p=host||parent(op.lane||op.parent);if(!p)throw Error('Не найден контейнер новой фигуры');const bo=moddle.create(op.type,{id:op.id,...(op.type==='bpmn:TextAnnotation'?{text:op.name||''}:{name:op.name||''})});const shape=factory.createShape({type:op.type,id:op.id,businessObject:bo,...(op.type==='bpmn:SubProcess'?{isExpanded:true}:{}),...(op.width?{width:op.width}:{}),...(op.height?{height:op.height}:{})});e=modeling.createShape(shape,{x:op.x??p.x+200,y:op.y??p.y+100},p,host?{attach:true}:{});event(e,op);
  }else if(op.kind==='addLane'){
   const target=parent(op.parent);if(!target)throw Error('Не найден пул для дорожки');e=modeling.addLane(target,'bottom');modeling.updateProperties(e,{id:op.id,name:op.name||''});
  }else if(op.kind==='connect'){
   const bo=moddle.create(op.type||'bpmn:SequenceFlow',{id:op.id,name:op.name||''});modeling.connect(get(op.source),get(op.target),{type:op.type||'bpmn:SequenceFlow',id:op.id,businessObject:bo});
  }else{
   e=get(op.id);
   if(op.kind==='rename')modeling.updateLabel(e,op.name||'');
   if(op.kind==='document')modeling.updateProperties(e,{documentation:op.text?[moddle.create('bpmn:Documentation',{text:op.text})]:[]});
   if(op.kind==='remove'){if(e.waypoints)modeling.removeConnection(e);else modeling.removeElements([e])}
   if(op.kind==='reconnect'){const source=get(op.source),target=get(op.target),s={x:source.x+source.width/2,y:source.y+source.height/2},t={x:target.x+target.width/2,y:target.y+target.height/2};modeling.reconnectStart(e,source,s);modeling.reconnectEnd(e,target,t)}
   if(op.kind==='setType'){const id=e.id;e=replace.replaceElement(e,{type:op.type,...(op.eventType?{eventDefinitionType:'bpmn:'+op.eventType+'EventDefinition'}:{})});if(e.id!==id)modeling.updateProperties(e,{id});event(e,op)}
   if(op.kind==='setTimer')event(e,{...op,eventType:'Timer'});
   if(op.kind==='move')modeling.moveShape(e,{x:(op.x??e.x+e.width/2)-e.x-e.width/2,y:(op.y??e.y+e.height/2)-e.y-e.height/2},op.lane?get(op.lane):e.parent);
   if(op.kind==='resize')modeling.resizeShape(e,{x:e.x,y:e.y,width:op.width||e.width,height:op.height||e.height});
   if(op.kind==='color'){modeling.updateProperties(e,{'studio:colorMode':'imported','studio:colorPreset':undefined});modeling.setColor([e],{...(op.fill?{fill:op.fill}:{}),...(op.stroke?{stroke:op.stroke}:{})})}
  }
 }
 return(await editor.saveXML({format:true})).xml;
};
