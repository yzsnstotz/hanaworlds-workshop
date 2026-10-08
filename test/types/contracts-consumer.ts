// Current Workshop public exports, compiled against exact formal 0.5.3.
import * as C from 'hanaworlds-contracts';
const exact: '0.5.3' = C.version;
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
