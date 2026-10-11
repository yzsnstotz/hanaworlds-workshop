var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
/** New source-mode endpoints. No strict definition has ever been registered. */
let WorkshopImageLinkPanelService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _downloadLink_decorators;
    let _readLink_decorators;
    return class WorkshopImageLinkPanelService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _downloadLink_decorators = [Remote];
            _readLink_decorators = [Remote];
            __esDecorate(this, null, _downloadLink_decorators, { kind: "method", name: "downloadLink", static: false, private: false, access: { has: obj => "downloadLink" in obj, get: obj => obj.downloadLink }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _readLink_decorators, { kind: "method", name: "readLink", static: false, private: false, access: { has: obj => "readLink" in obj, get: obj => obj.readLink }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        constructor(ctx) {
            super(ctx, 'hanaworldsWorkshopImageLinks');
            __runInitializers(this, _instanceExtraInitializers);
        }
        async downloadLink(sessionRef, url, signal) {
            try {
                if (typeof sessionRef !== 'string' || !sessionRef)
                    throw Error('SESSION_REQUIRED');
                const session = this.ctx.get('sessions').get(sessionRef);
                if (!session)
                    throw Error('LIVE_SESSION_NOT_FOUND');
                return await this.ctx.get('hanaworldsWorkshop').downloadImageForPanel(session, url, signal);
            }
            catch (error) {
                throw new RemoteError('workshop-image-links/download-failed', error.message, { stage: 'download', sessionRef });
            }
        }
        async readLink(sessionRef, attachmentRef, signal) {
            try {
                if (typeof sessionRef !== 'string' || !sessionRef)
                    throw Error('SESSION_REQUIRED');
                if (typeof attachmentRef !== 'string' || !attachmentRef)
                    throw Error('ATTACHMENT_REQUIRED');
                const session = this.ctx.get('sessions').get(sessionRef);
                if (!session)
                    throw Error('LIVE_SESSION_NOT_FOUND');
                return await this.ctx.get('hanaworldsWorkshop').readPanelImage(session, attachmentRef, signal);
            }
            catch (error) {
                throw new RemoteError('workshop-image-links/read-failed', error.message, { stage: 'read', sessionRef });
            }
        }
    };
})();
export { WorkshopImageLinkPanelService };
/** Conversation calls retain the Host's current Agent, model route and login. */
let WorkshopConversationPanelService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _read_decorators;
    let _send_decorators;
    return class WorkshopConversationPanelService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _read_decorators = [Remote];
            _send_decorators = [Remote];
            __esDecorate(this, null, _read_decorators, { kind: "method", name: "read", static: false, private: false, access: { has: obj => "read" in obj, get: obj => obj.read }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _send_decorators, { kind: "method", name: "send", static: false, private: false, access: { has: obj => "send" in obj, get: obj => obj.send }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        constructor(ctx) {
            super(ctx, 'hanaworldsWorkshopConversation');
            __runInitializers(this, _instanceExtraInitializers);
        }
        session(sessionRef) {
            if (typeof sessionRef !== 'string' || !sessionRef)
                throw Error('SESSION_REQUIRED');
            const session = this.ctx.get('sessions').get(sessionRef);
            if (!session)
                throw Error('LIVE_SESSION_NOT_FOUND');
            return session;
        }
        async read(sessionRef, signal) {
            try {
                return await this.ctx.get('hanaworldsWorkshop').readConversationForPanel(this.session(sessionRef), signal);
            }
            catch (error) {
                throw new RemoteError('workshop-conversation/read-failed', error.message, { sessionRef });
            }
        }
        async send(sessionRef, text, signal) {
            try {
                return await this.ctx.get('hanaworldsWorkshop').sendConversationForPanel(this.session(sessionRef), text, signal);
            }
            catch (error) {
                throw new RemoteError('workshop-conversation/send-failed', error.message, { sessionRef });
            }
        }
    };
})();
export { WorkshopConversationPanelService };
