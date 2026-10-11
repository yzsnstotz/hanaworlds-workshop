// Read-only diagnosis of genuine public calls. Does not retry or alter Undo.
import {readFile} from 'node:fs/promises';
import * as C from 'hanaworlds-contracts';
const trace=JSON.parse(await readFile(process.argv[2],'utf8'));
const receipt=trace.find(x=>x.operation==='Undo')?.response.result;
const histories=trace.filter(x=>x.operation==='HistoryQuery');
const before=histories.findLast(x=>x.request.requestId.includes('undo-head:'))?.response.result;
const after=histories.findLast(x=>x.request.requestId.includes('undo-after:'))?.response.result;
if(!receipt||!before||!after)throw Error('PUBLIC_UNDO_TRACE_INCOMPLETE');
for(const call of trace.filter(x=>['Undo','HistoryQuery'].includes(x.operation)))C.validateBoundResponse('canvas/v5',call.operation,call.request,call.response);
const original=before.entries.find(e=>e.transactionId===before.headTransactionId);
const row=after.entries.find(e=>e.transactionId===receipt.transactionId);
const receiptDigest=C.digestValue('receipt',receipt).sha256;
const originalIndex=before.entries.findIndex(e=>e.transactionId===original.transactionId);
const expectedAfterHead=before.entries[originalIndex-1]?.transactionId??null;
const predicates={transactionId:row?.transactionId===receipt.transactionId,originTransactionId:row?.originTransactionId===original.transactionId,status:row?.status==='VERIFIED',receiptDigest:row?.receiptDigest===receiptDigest,readbackDigest:row?.expectedAfterReadbackDigest===receipt.readbackDigest,operationDigest:row?.operationDigest===receipt.operationDigest,historyRevision:row?.historyRevision===after.historyRevision,affectedObjectRefs:C.canonicalJSON(row?.affectedObjectRefs)===C.canonicalJSON(original.affectedObjectRefs),historyRevisionAdvanced:after.historyRevision!==before.historyRevision,workshopExpectedAfterHead:after.headTransactionId===expectedAfterHead};
console.log(JSON.stringify({boundary:'actual Canvas public request/response only; no peer private code',receipt,before,after,expectedAfterHead,receiptDigest,predicates,failedPredicates:Object.entries(predicates).filter(([,v])=>!v).map(([k])=>k)},null,2));
