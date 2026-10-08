// Current Workshop public exports, compiled against exact formal 0.5.4.
import * as C from 'hanaworlds-contracts';
const exact: '0.5.4' = C.version;
const used = [
  C.ContractError,
  C.admitRequest,
  C.canonicalJSON,
  C.checkProtocolCompatibility,
  C.contractHandshake,
  C.deepFreeze,
  C.digestValue,
  C.protocolRequirement,
  C.publicError,
  C.regionCapabilities,
  C.requestDigest,
  C.validateBoundRequest,
  C.validateBoundResponse,
  C.validateBuildProposalContext,
  C.validateBuildProposalRequest,
  C.validateBuildProposalResponse,
  C.validateCompiledRegionSet,
  C.validateCurrentBuildSubmission,
  C.validateCurrentRequest,
  C.validateRegionCommit,
  C.validateRegionInspection,
  C.validateRegionProposalRequest,
  C.validateRegionProposalResponse,
  C.validateRegionUndo,
  C.validateResponse,
  C.validateType
];
export { exact, used };

// New Session routes consume the generated public types directly.
import type { ReadSessionIdentityRequest, ListSessionsRequest, SessionIdentity, SessionDirectory } from 'hanaworlds-contracts';
const identityRequest: ReadSessionIdentityRequest = { contractVersion: 'session/v3', requestId: 'read', sessionRef: 's1' };
const listRequest: ListSessionsRequest = { contractVersion: 'session/v3', requestId: 'list' };
const identity: SessionIdentity = { sessionRef: 's1', sessionRevision: 'rev-core-initial' };
const directory: SessionDirectory = { directoryRevision: 'dir-1', sessions: [identity] };
C.validateBoundRequest('session/v3', 'ReadSessionIdentity', identityRequest);
C.validateBoundRequest('session/v3', 'ListSessions', listRequest);
C.validateType('SessionDirectory', directory);
const deletionGuard: typeof C.requireSessionDeleteSupported = C.requireSessionDeleteSupported;
export { identityRequest, listRequest, directory, deletionGuard };
