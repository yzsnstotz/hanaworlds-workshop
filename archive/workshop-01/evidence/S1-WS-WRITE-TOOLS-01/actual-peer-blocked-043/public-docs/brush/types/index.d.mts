import type { BuildDocumentRequest, BuildDocumentResponse, SetBox, MaterialMap, Effects, ContractHandshake, CompileRegionBuildRequest, CompileRegionBuildResponse, ProtocolHandshake, ProtocolDescriptor } from '#contracts';
export type { BuildDocumentRequest, BuildDocumentResponse } from '#contracts';
export declare function compileBuildDocument(value: BuildDocumentRequest): BuildDocumentResponse;
export declare function compileBuildDocumentBytes(bytes: Uint8Array): BuildDocumentResponse;
/** Caller validates geometry/materials before using the low-level expander. */
export declare function expandEffects(operations: readonly SetBox[], materials: MaterialMap): Effects;
export declare const name: 'hanaworlds-brush';
export declare const version: '0.5.0';
export declare const serviceName: 'hanaworldsBrushV3';
export declare const provide: typeof serviceName;
export declare const inject: readonly [];
export declare const invariants: readonly string[];
export declare const contractHandshake: ContractHandshake;
export declare const hostCapabilities: readonly {readonly limitKind:'COMPILER_EFFECT_CELLS';readonly limit:number;readonly source:string;readonly sourceRevision:string}[];
export declare class BrushV3 {
 status(): {readonly component:typeof name;readonly version:typeof version;readonly input:'BUILD/V3';readonly output:'operations/v3';readonly contracts:string;readonly worldAccess:'NONE';readonly persistence:'NONE';readonly modelAccess:'NONE';readonly contractHandshake:ContractHandshake;readonly invariants:typeof invariants;readonly hostCapabilities:typeof hostCapabilities;readonly region:{readonly input:'region-build/v1';readonly output:'region-operations/v1';readonly chunkEdge:16};readonly protocolHandshake:ProtocolHandshake};
 handshake(): ContractHandshake;
 compile(request: BuildDocumentRequest): BuildDocumentResponse;
 compileBytes(bytes: Uint8Array): BuildDocumentResponse;
 protocolHandshake(): ProtocolHandshake;
 compileRegion(request: CompileRegionBuildRequest): CompileRegionBuildResponse;
 compileRegionBytes(bytes: Uint8Array): CompileRegionBuildResponse;
}
export declare function apply(ctx: {provide(name: typeof serviceName, service: BrushV3): void}): void;
declare const plugin: {name:typeof name;inject:typeof inject;provide:typeof provide;apply:typeof apply};
export default plugin;
/** region-build/v1 CompileRegionBuild (contracts 0.5.0): mapblock-aligned region-operations/v1 chunks. */
export type { CompileRegionBuildRequest, CompileRegionBuildResponse, ProtocolHandshake } from '#contracts';
export declare function compileRegionBuild(request: CompileRegionBuildRequest): CompileRegionBuildResponse;
export declare function compileRegionBuildBytes(bytes: Uint8Array): CompileRegionBuildResponse;
export declare const protocolHandshake: ProtocolHandshake;
export declare const brushProtocols: readonly ProtocolDescriptor[];
export declare const brushCapabilities: readonly ['BUILD/V3:per-cell-compile','region-build/v1:compile-mapblock-chunks'];
