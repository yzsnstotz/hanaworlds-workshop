import {createUnavailableSessionReadGuardFixture,sessionReadGuard,type SessionReadGuardProvider,type SessionReadGuardScope} from 'hanaworlds-contracts';
const fixture:SessionReadGuardProvider=createUnavailableSessionReadGuardFixture(['OFFICIAL_PERSISTENCE_SYNCHRONOUS_CURRENTNESS']);
const scope:SessionReadGuardScope={sessionRef:'s1',worldRef:null};
const capture=fixture.captureSessionReadGuard(scope);
if(capture.error===null) {
 const current:boolean=fixture.isSessionReadGuardCurrent(capture.guard,scope);
 const revision:string=capture.snapshot.sessionRevision;
 void current;void revision;
} else {
 const code:'CAPABILITY_UNAVAILABLE'=capture.error.code;
 const missing:readonly string[]=capture.missing;
 void code;void missing;
}
const protocol:'session-read-guard/v1'=sessionReadGuard.protocol;
void protocol;
