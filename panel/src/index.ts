import { Context } from '@deepseek-ai/cordis';
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { SessionStore } from '@deepseek-ai/dsh-session';
/** New source-mode endpoints. No strict definition has ever been registered. */
export class WorkshopImageLinkPanelService extends TypertRemoteService {
 constructor(ctx: Context) { super(ctx,'hanaworldsWorkshopImageLinks'); }
 @Remote
 async downloadLink(sessionRef: string,url: string,signal: AbortSignal): Promise<unknown> {
  try {
   if(typeof sessionRef!=='string'||!sessionRef)throw Error('SESSION_REQUIRED');
   const session=(this.ctx.get('sessions') as SessionStore).get(sessionRef as never);
   if(!session)throw Error('LIVE_SESSION_NOT_FOUND');
   return await this.ctx.get('hanaworldsWorkshop').downloadImageForPanel(session,url,signal);
  } catch(error) {
   throw new RemoteError('workshop-image-links/download-failed',(error as Error).message,{stage:'download',sessionRef});
  }
 }
 @Remote
 async readLink(sessionRef: string,attachmentRef: string,signal: AbortSignal): Promise<unknown> {
  try {
   if(typeof sessionRef!=='string'||!sessionRef)throw Error('SESSION_REQUIRED');
   if(typeof attachmentRef!=='string'||!attachmentRef)throw Error('ATTACHMENT_REQUIRED');
   const session=(this.ctx.get('sessions') as SessionStore).get(sessionRef as never);
   if(!session)throw Error('LIVE_SESSION_NOT_FOUND');
   return await this.ctx.get('hanaworldsWorkshop').readPanelImage(session,attachmentRef,signal);
  } catch(error) {
   throw new RemoteError('workshop-image-links/read-failed',(error as Error).message,{stage:'read',sessionRef});
  }
 }
}

/** Conversation calls retain the Host's current Agent, model route and login. */
export class WorkshopConversationPanelService extends TypertRemoteService {
 constructor(ctx: Context) { super(ctx,'hanaworldsWorkshopConversation'); }
 private session(sessionRef: string) {
  if(typeof sessionRef!=='string'||!sessionRef)throw Error('SESSION_REQUIRED');
  const session=(this.ctx.get('sessions') as SessionStore).get(sessionRef as never);
  if(!session)throw Error('LIVE_SESSION_NOT_FOUND');
  return session;
 }
 @Remote
 async read(sessionRef: string,signal: AbortSignal): Promise<unknown> {
  try {return await this.ctx.get('hanaworldsWorkshop').readConversationForPanel(this.session(sessionRef),signal);}
  catch(error){throw new RemoteError('workshop-conversation/read-failed',(error as Error).message,{sessionRef});}
 }
 @Remote
 async send(sessionRef: string,text: string,signal: AbortSignal): Promise<unknown> {
  try {return await this.ctx.get('hanaworldsWorkshop').sendConversationForPanel(this.session(sessionRef),text,signal);}
  catch(error){throw new RemoteError('workshop-conversation/send-failed',(error as Error).message,{sessionRef});}
 }
}
