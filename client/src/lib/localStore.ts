export type LocalPayment = { id:number; remoteId?:string; version?:number; name:string; amount:number; currency:"SYP"|"USD"; type:"credit"|"debit"; date:string };
export type LocalAccount = { id:number; remoteId?:string; version?:number; name:string; owner:string; accent:string; payments:LocalPayment[] };
export type AuditEntry = { id:number; action:"create"|"update"|"delete"|"import"|"export"; entity:"account"|"payment"|"backup"; label:string; createdAt:string };
export type SyncQueueItem = { id:string; workspaceId:string; userId:string; accounts:LocalAccount[]; deletedAccountIds?:{id:string;version?:number}[]; deletedPaymentIds?:{id:string;version?:number}[]; createdAt:string };
export async function readAccounts():Promise<LocalAccount[]|null>{return null}
export async function writeAccounts(_accounts:LocalAccount[]){return}
export async function readSetting(_key:string):Promise<string|null>{return null}
export async function writeSetting(_key:string,_value:string){return}
export async function snapshotAccounts(_accounts:LocalAccount[]){return}
export async function restoreSnapshot():Promise<LocalAccount[]|null>{return null}
export async function readSyncQueue():Promise<SyncQueueItem[]>{return []}
export async function enqueueSyncSnapshot(_item:Omit<SyncQueueItem,"id"|"createdAt">){return}
export async function removeSyncQueueItem(_id:string){return}
export async function addAuditEntry(_entry:Omit<AuditEntry,"id"|"createdAt">){return}
export async function readAuditEntries():Promise<AuditEntry[]>{return []}
export async function clearAllLocalData(){return}
