import{completeJSON}from'./ai-router.mjs';
export const recoverableShape=e=>e?.providerCode==='reasoning_repetition'||e?.providerCode==='structured_output_truncated'||e?.providerCode==='length';
// One adaptive recovery per failed unit, shared across continuations. No identical replay.
export async function adaptiveJSON(request,key,fetcher=fetch,{state={},id=request.stage,onSave,shrink,traceId}={}){
 const saved=state[id]||{}, slim=!!saved.slim;let messages=slim&&shrink?shrink(request.messages):request.messages,maxTokens=saved.maxTokens||request.maxTokens,recoveryMode=saved.slim?'compact':saved.maxTokens?'tokens':undefined;
 for(let turn=0;turn<2;turn++){
  try{return await completeJSON({...request,messages,maxTokens,attempts:1,traceId,onProgress:e=>request.onProgress?.({...e,recovery:recoveryMode,retrying:!!recoveryMode||e.retrying})},key,fetcher)}catch(e){
   if(!recoverableShape(e)||turn||saved.exhausted)throw e;
   let strategy;if(e.providerCode==='reasoning_repetition'&&shrink&&!slim){messages=shrink(request.messages);if(JSON.stringify(messages)===JSON.stringify(request.messages))throw e;saved.slim=true;strategy='compact'}
   else if(['structured_output_truncated','length'].includes(e.providerCode)&&(e.finishReason==='length'||e.providerCode==='length')){const suggested=Number(e.suggestedMaxTokens);maxTokens=Math.min(65536,Math.max(maxTokens+4096,Number.isFinite(suggested)&&suggested>maxTokens?suggested:Math.ceil(maxTokens*1.5)));if(maxTokens<=(saved.maxTokens||request.maxTokens))throw e;saved.maxTokens=maxTokens;strategy='tokens'}else throw e;
   recoveryMode=strategy;saved.exhausted=true;state[id]=saved;await onSave?.();await request.onProgress?.({stage:request.stage,retrying:true,recovery:strategy,attempt:2});
  }
 }
}
