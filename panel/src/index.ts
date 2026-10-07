import { Context } from '@deepseek-ai/cordis';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { Session } from '@deepseek-ai/dsh-session';
export interface PanelImageRef { attachmentId: string; mediaType: string; bytes: number; width: number; height: number }
export interface PanelMedia { attachmentRef: string; storedBytesDigest: string; projectionVariantId: string | null; projectionBytesDigest: string | null; mediaType: string; bytes: number; width: number; height: number }
export interface PanelImageResult { sessionRef: string; status: 'ATTACHED'; sourceMessageId: string; media: PanelMedia; image: PanelImageRef; data: string }
interface WorkshopPanelPort {
 downloadImageForPanel(session: Session, url: string, signal: AbortSignal): Promise<PanelImageResult>;
 readPanelImage(session: Session, attachmentId: string, signal: AbortSignal): Promise<PanelImageResult>;
}
/** Only the registered Host Session lookup can supply these Session objects. */
export class WorkshopImagePanelService extends TypertRemoteService {
 constructor(ctx: Context) { super(ctx, 'hanaworldsWorkshopImages'); }
 @Remote
 async download(session: Session, url: string, signal: AbortSignal): Promise<PanelImageResult> {
  return (this.ctx.get('hanaworldsWorkshop') as WorkshopPanelPort).downloadImageForPanel(session,url,signal);
 }
 @Remote
 async read(session: Session, attachmentId: string, signal: AbortSignal): Promise<PanelImageResult> {
  return (this.ctx.get('hanaworldsWorkshop') as WorkshopPanelPort).readPanelImage(session,attachmentId,signal);
 }
}
