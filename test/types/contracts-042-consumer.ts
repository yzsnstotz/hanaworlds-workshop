// HISTORICAL: fixed 0.4.2 baseline; current formal consumer is test:contracts/typecheck:contracts.
// Type-level consumption check: every contracts export Workshop src imports is declared by exact 0.4.2.
import { version, contractHandshake, ContractError, admitRequest, canonicalJSON, checkContractHandshake, digestValue, publicError,
  requestDigest, validateBoundRequest, validateBoundResponse, validateBuildProposalContext, validateBuildProposalRequest,
  validateBuildProposalResponse, validateCurrentBuildSubmission, validateCurrentRequest, validateRegionInspection, validateResponse,
  validateType } from 'hanaworlds-contracts';
const exact: '0.4.2' = version;
const used = [contractHandshake, ContractError, admitRequest, canonicalJSON, checkContractHandshake, digestValue, publicError, requestDigest,
  validateBoundRequest, validateBoundResponse, validateBuildProposalContext, validateBuildProposalRequest, validateBuildProposalResponse,
  validateCurrentBuildSubmission, validateCurrentRequest, validateRegionInspection, validateResponse, validateType];
export { exact, used };
