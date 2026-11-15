// Adapts engine runs (/v1/runs) to the job tray's verified-run schema (SCC-007).
const STATE={queued:'queued',running:'running',awaiting_approval:'waiting_approval',succeeded:'completed',failed:'failed',cancelled:'cancelled'};
const TERMINAL=new Set(['succeeded','failed','cancelled']);
export function toTrayRun(run,now=Date.now()){
 const state=STATE[run.status];if(!state)return null;
 const start=Date.parse(run.startedAt||run.createdAt)||now,end=run.finishedAt?Date.parse(run.finishedAt):now;
 const updated=Date.parse(run.updatedAt||run.createdAt)||0;
 return {runId:run.id,projectId:run.projectId,revision:Math.max(0,Math.floor(updated/1000)),state,
  elapsedSeconds:Math.min(31536000,Math.max(0,Math.round((end-start)/1000))),provider:String(run.kind||'run').slice(0,80),
  reconciledCostCents:TERMINAL.has(run.status)?Math.round(Number(run.spentMicro||0)/10000):null,
  canCancel:['queued','running','awaiting_approval'].includes(run.status),canRetry:['failed','cancelled'].includes(run.status)};
}
/** Job-tray client over the engine SDK. Actions are followed by an authoritative re-read in the tray. */
export function engineJobClient(engine){
 if(!engine)return null;
 return {
  async listRuns({limit=100}={}){const r=await engine.runs({limit:Math.min(limit,100)});return {items:(r.items||[]).map(x=>toTrayRun(x)).filter(Boolean)}},
  cancelRun:id=>engine.cancelRun(id),
  retryRun:id=>engine.retryRun(id)
 };
}
