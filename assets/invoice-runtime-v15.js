/** One bounded local import. Never relies on Promise.race alone to stop work. */
export function createImportRun({budgetMs=300000, cleanupMs=1500, signal, progress}={}) {
  const started=Date.now(), cleanups=new Set();
  let stopped, finished=false, last={label:'Preparing local PDF',percent:0}, highest=0, deadline, ticker;
  let rejectStop;
  const interrupted=new Promise((_,reject)=>{rejectStop=reject});
  interrupted.catch(()=>{});
  const safely=fn=>{try{return Promise.resolve(fn()).catch(()=>{})}catch{return Promise.resolve()}};
  const report=event=>{
    if(stopped||finished)return;
    highest=Math.max(highest,Math.min(99,Number(event.percent)||0));
    last={...event,percent:highest};
    const elapsed=Math.floor((Date.now()-started)/1000), clock=`${Math.floor(elapsed/60)}m ${String(elapsed%60).padStart(2,'0')}s`;
    progress?.({...last,label:`${last.label} · ${highest}% overall · ${clock} elapsed`});
  };
  const stop=(message='Stopped by you. No workbook was created. Review the retained pages or start a new run.',code='IMPORT_CANCELLED')=>{
    if(stopped||finished)return stopped;
    stopped=message instanceof Error?message:new Error(message);
    stopped.code=code;rejectStop(stopped);
    clearTimeout(deadline);clearInterval(ticker);
    for(const cleanup of cleanups)safely(cleanup);
    return stopped;
  };
  const check=()=>{if(stopped)throw stopped;if(finished)throw Error('This import has already ended.');};
  const onStop=fn=>{if(stopped)safely(fn);else cleanups.add(fn);return()=>cleanups.delete(fn)};
  const step=async(fn,ms=30000,label='Local operation timed out. No workbook was created.',fatal=true)=>{
    check();let timer;
    const work=Promise.resolve().then(()=>{check();return fn()});
    if(ms>0)timer=setTimeout(()=>stop(label,'IMPORT_TIMEOUT'),Math.min(ms,2147483647));
    try{return await Promise.race([work,interrupted])}catch(error){if(!stopped&&fatal)stop(error,'IMPORT_ENGINE_FAILURE');throw stopped||error;}finally{clearTimeout(timer)}
  };
  const cleanup=async fn=>{let timer;try{await Promise.race([safely(fn),new Promise(resolve=>{timer=setTimeout(resolve,cleanupMs)})])}finally{clearTimeout(timer)}};
  const signalStop=()=>stop('Stopped by you. No workbook was created. Review the retained pages or start a new run.');
  if(signal?.aborted)signalStop();else signal?.addEventListener('abort',signalStop,{once:true});
  if(!stopped){deadline=setTimeout(()=>stop('Local reading reached its 5-minute safety limit. No workbook was created. Review the retained pages, or split the PDF and start a new run.','IMPORT_DEADLINE'),budgetMs);ticker=setInterval(()=>report(last),1000)}
  return {step,check,onStop,cleanup,report,stop,get stopped(){return stopped},get elapsedMs(){return Date.now()-started},finish(){finished=true;clearTimeout(deadline);clearInterval(ticker);signal?.removeEventListener('abort',signalStop);cleanups.clear()}};
}
/** Resource cleanup can be requested by timeout and finally, but runs once. */
export function onceAsync(fn){let result;return()=>result||(result=Promise.resolve().then(fn));}
