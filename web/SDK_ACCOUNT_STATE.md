# Official SDK login configuration consumer

`startAskWeb({credentialHome})` accepts an explicitly chosen absolute, normalized official DSH home. CredentialsLocal consumes that home through its existing SDK record path. This does not copy a token, add a credential broker, or replace a driver. Shared-home browser login and logout reject `SHARED_LOGIN_RECORD_BROWSER_MUTATION_DISABLED`; ordinary SDK credential use remains SDK-owned. No existing page has been replaced or restarted by this source change.

`readRouteLoginRecordState(ctx,{signal})` reads registered `openai-codex` through `llm.listProviders()` once and reads `credentials.describeRecord(recordKeyFor('openai-codex'))` once. It returns only configured/kind/writable metadata, a fixed `openai-codex/gpt-5.6-luna` route declaration, and a SHA256 identity of that nonsecret declaration. It checks cancellation and exact original service identities after the await. This is an immediate configuration observation, not a durable account capability or authorization result.

A configured grant does not prove a valid session, a resolved same-account association, allowance, model availability, or a prohibition on paid-credit fallback. Authentication is NOT_RESOLVED, accountAssociation/allowance are UNKNOWN, paidCreditRestriction is UNDECLARED. The existing REAL dispatch guard still rejects before Session creation/model prepareCall. The pinned public DSH/Pi APIs supply no executable included-only billing control; model requests must wait for the owning account provider/platform to expose and enforce that control.

## Sole scoped component entry

`web/sdk-account-state-check.mjs` is the PM-reviewed fixed-root component entry, not a server or model flow. Run only after its exact SOURCE commit is fixed and the designated root is ABSENT:

```sh
/Users/yzliu/.local/share/fnm/node-versions/v24.13.1/installation/bin/node web/sdk-account-state-check.mjs /Users/yzliu/.cache/hanaworlds-runs/F-WS-IMAGE-ASK-01/01a11e42-ab47-72e0-9321-6b624b08987c/sdk-account-state-01 --sdk-state-scope-go <exact-SOURCE-commit>
```

The script exclusively creates that 0700 root. It imports fixed Cordis 4.0.4, DSH 0.2.0-rc.2 and pi-ai 0.87.1 through already-installed modules, normally loads only Llm/CredentialsLocal/PiAi, and emits nonsecret `result.json` (0600). CredentialsLocal receives the fixed approved `runtime-47609-v049/session-TA5ByA/dsh-home` and `watch:false`.

Fetch is denied before SDK imports; prepareCall/stream are denied before PiAi loading. Additional SDK writes, including automatic legacy migration, stop before they occur. SDK diagnostic payloads are suppressed; failures retain only stage and an allowlisted error code. Record filesystem metadata is compared without reading its contents in worker code. The official SDK alone consumes its record normally. No authorization/login/logout, Session, AgentLoop, attachment, HTTP, native, Canvas or World service is installed. No model, auth refresh, or paid request is sent. Exact own plugin owners/root dispose on exit. Failure is retained, with no retry or alternate root under this scope.

The component result and guard tests are separate evidence. They cannot sign real image/clarification, Core confirmation, saved brief/context/retained request, full Host, product gates, or owner acceptance.
