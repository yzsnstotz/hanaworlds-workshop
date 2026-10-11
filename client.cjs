// DSH 0.2.0-rc.2 web-client module format. The host owns authentication and
// Session context; this component never asks a player to enter internal refs.
window.__ModuleLoader__.load({
  id: 'hanaworlds-workshop',
  factory: (require) => {
    const module = { exports: {} };
    const React = require('react');
    const h = React.createElement;
    const PANEL_ID = 'hanaworlds-workshop';

    function createWorkshopFlow({ invoke, legacyHistory, currentSessionRef, newId }) {
      const listeners = new Set();
      let state = { ready: false, busy: false, error: '', turns: [], reply: '',
        sessionRef: null, worldRef: null, revision: null, clarification: null,
        sessions: [], selectedSessionRef: null, details: [],
        undoStatus: null, undoResult: null, undoError: '',
        buildOutcome: null, buildError: '', legacyAvailable: typeof legacyHistory === 'function',
        legacyArchives: [],
        legacyArchive: null, legacyError: '' };
      const snapshot = () => ({ ...state, turns: [...state.turns],
        sessions: [...state.sessions], details: [...state.details],
        legacyArchives: [...state.legacyArchives] });
      const publish = patch => {
        state = { ...state, ...patch };
        for (const listener of listeners) listener(snapshot());
      };
      const subscribe = listener => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      };
      const id = () => {
        const value = newId?.();
        if (typeof value !== 'string' || !value)
          throw Error('无法生成请求标识。');
        return value;
      };
      const workshop = async (sessionRef, operation, payload) => {
        const response = await invoke('hanaworlds_request', {
          operation: 'workshop', input: { sessionRef, operation,
            payload: { contractVersion: operation === 'InvokeAction' ?
              'interaction-surface/v5' : 'session/v5', ...payload } },
        });
        if (!response || response.error || !response.result) {
          const code = response?.error?.code ?? 'INVALID_RESPONSE';
          const reasons = { CURRENT_WORLD_MISMATCH: '当前世界连接已变化',
            WORLD_NOT_BOUND: '当前世界已变化',
            SAVED_RESOURCE_UNAVAILABLE: '缺少已验证建造的持久回执',
            UNDO_CONFLICT: '建造历史已变化或发生外部编辑冲突',
            STALE_REVISION: '历史版本已变化',
            READBACK_FAILED: '世界与历史读回未确认',
            INTENT_UNCONFIRMED: '请先确认当前轮建造意图',
            TURN_REVISION_MISMATCH: '当前轮次已变化',
            IMAGE_REQUIRED: '当前建造还需要图片',
            RECOVERY_PENDING: '交易仍在恢复中',
            CAPABILITY_UNAVAILABLE: '所需能力暂不可用' };
          throw Error(`工作坊拒绝：${reasons[code] ?? '请求未完成'}（${code}）。`);
        }
        return response.result;
      };
      const bindingLost = error => /\b(TRUSTED_BINDING_REQUIRED|AUTHORIZATION_REVOKED)\b/
        .test(`${String(error?.code ?? '')} ${String(error?.message ?? error)}`);
      const context = async sessionRef => {
        if (typeof invoke !== 'function') throw Error('桌面工作坊连接不可用：宿主没有提供 hanaworldsWorkshopTransport 服务。');
        const current = await invoke('hanaworlds_request', {
          operation: 'context', input: { sessionRef },
        });
        if (current?.status !== 'bound' || current.sessionRef !== sessionRef ||
            typeof current.worldRef !== 'string' || !current.worldRef)
          throw Error('请先在 HanaWorlds 管理页面绑定当前 Session、玩家和世界。');
        return current;
      };
      const readDetails = async (sessionRef, sessionRevision, turns) => {
        if (!turns.length) return [];
        const result = await workshop(sessionRef, 'ReadSessionTurnDetails', {
          requestId: id(),
        });
        if (result.sessionRef !== sessionRef ||
            result.sessionRevision !== sessionRevision ||
            !Array.isArray(result.turns) ||
            result.turns.length !== turns.length ||
            result.turns.some((item, index) => item.turnRef !== turns[index].turnRef ||
              item.turnRevision !== turns[index].turnRevision ||
              item.userText !== turns[index].text ||
              typeof item.resultText !== 'string' ||
              !Object.hasOwn(item, 'confirmedBrief')))
          throw Error('工作坊轮次读回与当前 Session 不一致。');
        return result.turns;
      };
      const readUndoStatus = async (sessionRef, worldRef, turns) => {
        if (!turns.some(turn => typeof turn.actionReceiptDigest === 'string'))
          return null;
        const result = await workshop(sessionRef, 'ReadCurrentUndoStatus', {
          requestId: id(),
        });
        if (result.sessionRef !== sessionRef || result.worldRef !== worldRef ||
            !['AVAILABLE', 'NO_VERIFIED_BUILD', 'NO_UNDO_AT_HEAD'].includes(result.availability) ||
            (result.turnRef !== null && !turns.some(turn =>
              turn.turnRef === result.turnRef &&
              turn.turnRevision === result.turnRevision)) ||
            (result.availability === 'AVAILABLE' &&
              (typeof result.head?.historyRevision !== 'string' ||
                typeof result.head?.headTransactionId !== 'string')))
          throw Error('撤回状态与当前 Session 或世界不一致。');
        return result;
      };
      async function boundSessions() {
        if (typeof invoke !== 'function') throw Error('桌面工作坊连接不可用：宿主没有提供 hanaworldsWorkshopTransport 服务。');
        const listing = await invoke('hanaworlds_request', {
          operation: 'context', input: {},
        });
        if (!Array.isArray(listing?.sessions))
          throw Error('无法读取 Shell 的当前 Session 列表。');
        const available = [];
        for (const item of listing.sessions) {
          if (typeof item?.sessionRef !== 'string' || !item.sessionRef ||
              typeof item?.label !== 'string') continue;
          const checked = await invoke('hanaworlds_request', {
            operation: 'context', input: { sessionRef: item.sessionRef },
          });
          if (checked?.status === 'bound' &&
              checked.sessionRef === item.sessionRef &&
              typeof checked.worldRef === 'string' && checked.worldRef)
            available.push({ sessionRef: item.sessionRef, label: item.label });
        }
        return available;
      }
      async function refreshLegacyArchives() {
        if (typeof legacyHistory !== 'function') return;
        try {
          const archives = await legacyHistory('list', {});
          if (!Array.isArray(archives) || archives.some(item =>
            typeof item?.projectId !== 'string' || !item.projectId ||
            typeof item?.creationSessionId !== 'string' || !item.creationSessionId ||
            item.readOnly !== true))
            throw Error('旧历史归档列表不完整。');
          publish({ legacyArchives: archives, legacyError: '' });
        } catch (error) {
          publish({ legacyArchives: [], legacyArchive: null,
            legacyError: `旧历史读回不可用：${String(error?.message ?? error)}` });
        }
      }
      async function openLegacyArchive(projectId, creationSessionId) {
        if (typeof legacyHistory !== 'function' ||
            !state.legacyArchives.some(item => item.projectId === projectId &&
              item.creationSessionId === creationSessionId)) return false;
        try {
          const archive = await legacyHistory('read', { projectId, creationSessionId });
          if (archive?.kind !== 'LEGACY_PROJECT_ARCHIVE' ||
              archive.readOnly !== true || archive.projectId !== projectId ||
              archive.creationSessionId !== creationSessionId ||
              !Array.isArray(archive.turns) || archive.turns.some(turn =>
                typeof turn.utterance !== 'string' || !turn.utterance ||
                !turn.response || typeof turn.response !== 'object' ||
                !Number.isSafeInteger(turn.source?.seq)))
            throw Error('旧历史归档与选中的项目不一致。');
          publish({ legacyArchive: archive, legacyError: '' });
          return true;
        } catch (error) {
          publish({ legacyArchive: null,
            legacyError: `旧历史读回不可用：${String(error?.message ?? error)}` });
          return false;
        }
      }
      async function open(selected = null) {
        publish({ ready: false, busy: true, error: '', reply: '',
          clarification: null, undoStatus: null, undoResult: null, undoError: '',
          buildOutcome: null, buildError: '' });
        try {
          await refreshLegacyArchives();
          const sessions = await boundSessions();
          publish({ sessions });
          const current = currentSessionRef?.();
          const sessionRef = selected || state.selectedSessionRef || current;
          if (!sessions.some(item => item.sessionRef === sessionRef)) {
            publish({ sessions, selectedSessionRef: null });
            throw Error(sessions.length ? '请选择已绑定的 Session 并连接。' :
              '请先在 HanaWorlds 管理页面绑定一个 live Session、玩家和世界。');
          }
          const binding = await context(sessionRef);
          let session = await workshop(sessionRef, 'StartOrResumeSession', {
            requestId: id(), expectedRevision: null,
          });
          if (session.context.currentSession !== sessionRef)
            throw Error('工作坊 Session 与当前 Shell Session 不一致。');
          if (session.context.activeWorldRef !== binding.worldRef)
            session = await workshop(sessionRef, 'SwitchWorldContext', {
              requestId: id(), expectedRevision: session.context.sessionRevision,
              selectionRevision: id(),
            });
          const details = await readDetails(sessionRef,
            session.context.sessionRevision, session.turns);
          const undoStatus = await readUndoStatus(sessionRef, binding.worldRef,
            session.turns);
          publish({ ready: true, sessionRef, worldRef: binding.worldRef,
            revision: session.context.sessionRevision, turns: session.turns,
            sessions, selectedSessionRef: sessionRef, details, undoStatus,
            error: '' });
        } catch (error) {
          publish({ ready: false, sessionRef: null, worldRef: null,
            revision: null, turns: [], details: [], undoStatus: null,
            error: String(error?.message ?? error) });
        } finally { publish({ busy: false }); }
      }
      function chooseSession(sessionRef) {
        if (!state.sessions.some(item => item.sessionRef === sessionRef)) return;
        publish(sessionRef === state.sessionRef ? { selectedSessionRef: sessionRef } :
          { selectedSessionRef: sessionRef, ready: false, sessionRef: null,
            worldRef: null, revision: null, turns: [], details: [], reply: '',
            undoStatus: null, undoResult: null, undoError: '',
            buildOutcome: null, buildError: '',
            clarification: null, error: '请连接所选 Session。' });
      }
      async function submit(text) {
        if (!state.ready || state.busy) return false;
        if (typeof text !== 'string' || !text.trim()) {
          publish({ error: '请输入要发送的内容。' });
          return false;
        }
        const { sessionRef, revision } = state;
        publish({ busy: true, error: '', undoStatus: null, undoResult: null,
          undoError: '', buildOutcome: null, buildError: '' });
        let committed = false;
        try {
          const body = state.clarification
            ? { requestId: id(), turnRef: state.clarification.turnRef,
              expectedRevision: revision,
              clarificationId: state.clarification.clarificationId, answer: text }
            : { requestId: id(), turnRef: id(), expectedRevision: revision,
              text, media: [], controls: { purpose: null, dimensions: null,
                entrancePortalRefs: [], styleText: null } };
          const receipt = await workshop(sessionRef,
            state.clarification ? 'AnswerClarification' : 'AppendMultimodalTurn', body);
          committed = true;
          publish({ reply: receipt.resultText, clarification: receipt.clarification
            ? { turnRef: receipt.turnRef,
              clarificationId: receipt.clarification.clarificationId } : null });
          const session = await workshop(sessionRef, 'StartOrResumeSession', {
            requestId: id(), expectedRevision: null,
          });
          const details = await readDetails(sessionRef,
            session.context.sessionRevision, session.turns);
          const undoStatus = await readUndoStatus(sessionRef, state.worldRef,
            session.turns);
          if (session.context.currentSession !== sessionRef)
            throw Error('当前 Session 已切换，请刷新工作坊。');
          publish({ turns: session.turns, details, undoStatus,
            revision: session.context.sessionRevision });
          return true;
        } catch (error) {
          const lost = bindingLost(error);
          publish({ error: committed ?
            `本轮已发送，但历史读回失败：${String(error?.message ?? error)}${lost ? '。受信绑定已失效，请在管理页面重新绑定后刷新连接。' : ''}` :
            `${String(error?.message ?? error)}${lost ? '。受信绑定已失效，请在管理页面重新绑定后刷新连接。' : ''}`,
          ...(lost ? { ready: false, clarification: null } : {}) });
          return committed;
        } finally { publish({ busy: false }); }
      }
      async function undoCurrentBuild() {
        const before = state.undoStatus;
        if (!state.ready || state.busy || before?.availability !== 'AVAILABLE')
          return false;
        const { sessionRef, worldRef } = state;
        publish({ busy: true, error: '', undoError: '', undoResult: null,
          buildOutcome: null, buildError: '' });
        let verified = false;
        try {
          const binding = await context(sessionRef);
          if (binding.worldRef !== worldRef)
            throw Error('当前世界已切换，请刷新工作坊。');
          const result = await workshop(sessionRef, 'UndoCurrentBuild', {
            requestId: id(), expectedTurnRevision: before.turnRevision,
            expectedHistoryRevision: before.head.historyRevision,
          });
          if (result.status !== 'VERIFIED' || result.sessionRef !== sessionRef ||
              result.worldRef !== worldRef || result.turnRef !== before.turnRef ||
              result.turnRevision !== before.turnRevision ||
              result.beforeHead?.historyRevision !== before.head.historyRevision ||
              result.beforeHead?.headTransactionId !== before.head.headTransactionId ||
              result.afterHead?.historyRevision === before.head.historyRevision ||
              result.afterHead?.headTransactionId === before.head.headTransactionId)
            throw Error('撤回回执与当前建造不一致。');
          verified = true;
          const session = await workshop(sessionRef, 'StartOrResumeSession', {
            requestId: id(), expectedRevision: null,
          });
          if (session.context.currentSession !== sessionRef ||
              session.context.activeWorldRef !== worldRef)
            throw Error('撤回后当前 Session 或世界已变化。');
          const details = await readDetails(sessionRef,
            session.context.sessionRevision, session.turns);
          const undoStatus = await readUndoStatus(sessionRef, worldRef,
            session.turns);
          if (!undoStatus ||
              undoStatus.head?.historyRevision !== result.afterHead.historyRevision ||
              undoStatus.head?.headTransactionId !== result.afterHead.headTransactionId)
            throw Error('撤回后的历史位置未能读回确认。');
          publish({ turns: session.turns, details,
            revision: session.context.sessionRevision, undoStatus, undoResult: result });
          return true;
        } catch (error) {
          const lost = bindingLost(error);
          publish({ undoStatus: null, undoError: `${verified ?
            'Canvas 已返回已验证撤回，但工作坊未确认更新后的历史：' : '撤回未确认：'}${String(error?.message ?? error)}${lost ?
              '。受信绑定已失效，请在管理页面重新绑定后刷新连接。' : ''}`,
          ...(lost ? { ready: false, clarification: null } : {}) });
          return false;
        } finally { publish({ busy: false }); }
      }
      async function advanceCurrentBuild() {
        if (!state.ready || state.busy) return false;
        const turn = state.turns.at(-1);
        const detail = state.details.at(-1);
        if (!turn || !detail?.confirmedBrief ||
            detail.turnRef !== turn.turnRef ||
            detail.turnRevision !== turn.turnRevision) return false;
        const { sessionRef, worldRef } = state;
        publish({ busy: true, buildError: '', buildOutcome: null });
        try {
          const binding = await context(sessionRef);
          if (binding.worldRef !== worldRef)
            throw Error('当前世界已切换，请刷新工作坊。');
          const result = await workshop(sessionRef, 'AdvanceCurrentBuild', {
            requestId: id(), expectedTurnRevision: turn.turnRevision });
          if (result.sessionRef !== sessionRef || result.worldRef !== worldRef ||
              result.turnRevision !== turn.turnRevision ||
              !['CHOICE_REQUIRED', 'PENDING', 'VERIFIED'].includes(result.outcome) ||
              (result.outcome === 'CHOICE_REQUIRED' &&
                (result.stage !== 'PLACEMENT' ||
                 result.frame?.sessionRef !== sessionRef ||
                 result.frame?.turnRevision !== turn.turnRevision)) ||
              (result.outcome === 'VERIFIED' &&
                (result.stage !== 'COMPLETE' || result.receipt?.status !== 'VERIFIED')))
            throw Error('建造结果与当前轮次不一致。');
          if (result.outcome === 'VERIFIED') {
            const session = await workshop(sessionRef, 'StartOrResumeSession', {
              requestId: id(), expectedRevision: null });
            if (session.context.currentSession !== sessionRef ||
                session.context.activeWorldRef !== worldRef ||
                session.turns.at(-1)?.turnRevision !== turn.turnRevision ||
                typeof session.turns.at(-1)?.actionReceiptDigest !== 'string')
              throw Error('已验证建造未能从当前 Session 读回。');
            const details = await readDetails(sessionRef,
              session.context.sessionRevision, session.turns);
            publish({ turns: session.turns, details,
              revision: session.context.sessionRevision });
          }
          publish({ buildOutcome: result });
          return true;
        } catch (error) {
          const lost = bindingLost(error);
          publish({ buildOutcome: null,
            buildError: `建造未确认：${String(error?.message ?? error)}${lost ?
              '。受信绑定已失效，请在管理页面重新绑定后刷新连接。' : ''}`,
            ...(lost ? { ready: false, clarification: null } : {}) });
          return false;
        } finally { publish({ busy: false }); }
      }
      async function chooseBuildPlacement(actionId, value) {
        const current = state.buildOutcome;
        const frame = current?.frame;
        const turn = state.turns.at(-1);
        const action = frame?.actions?.find(item => item.actionId === actionId &&
          item.inputKinds?.includes('SELECT_CHOICE') &&
          item.choices?.some(choice => choice.value === value));
        if (!state.ready || state.busy || current?.outcome !== 'CHOICE_REQUIRED' ||
            !action || turn?.turnRevision !== frame.turnRevision ||
            typeof turn.intentDigest !== 'string') return false;
        const { sessionRef, worldRef } = state;
        publish({ busy: true, buildError: '' });
        let accepted = false;
        try {
          const binding = await context(sessionRef);
          if (binding.worldRef !== worldRef)
            throw Error('当前世界已切换，请刷新工作坊。');
          const invocationId = id();
          const surfaceAction = { contractVersion: 'interaction-surface/v2',
            sessionRef, turnRevision: frame.turnRevision,
            frameRef: frame.frameRef, frameRevision: frame.frameRevision,
            actionId, orderedTargetRefs: [], intentDigest: turn.intentDigest,
            operationDigest: null, analysisDigest: null, decisionRevision: null };
          const result = await workshop(sessionRef, 'InvokeAction', {
            requestId: id(), invocationId, turnRevision: frame.turnRevision,
            frameRevision: frame.frameRevision, frameRef: frame.frameRef,
            actionId, surfaceAction, surfaceActionDigest: action.surfaceActionDigest,
            input: { kind: 'SELECT_CHOICE', value } });
          if (result.accepted !== true || result.invocationId !== invocationId ||
              result.ownerRef !== 'hanaworlds-workshop')
            throw Error('选点结果未被当前工作坊确认。');
          accepted = true;
          publish({ buildOutcome: null });
        } catch (error) {
          const lost = bindingLost(error);
          publish({ buildError: `选择未确认：${String(error?.message ?? error)}${lost ?
            '。受信绑定已失效，请在管理页面重新绑定后刷新连接。' : ''}`,
            ...(lost ? { ready: false, clarification: null } : {}) });
        } finally { publish({ busy: false }); }
        return accepted ? advanceCurrentBuild() : false;
      }
      return { snapshot, subscribe, open, chooseSession, submit, openLegacyArchive,
        undoCurrentBuild, advanceCurrentBuild, chooseBuildPlacement };
    }

    function WorkshopChoiceFrame({ frame, onSelect }) {
      if (!frame || !Array.isArray(frame.actions)) return null;
      const choices = frame.actions.flatMap(action =>
        action.inputKinds?.includes('SELECT_CHOICE') && Array.isArray(action.choices)
          ? action.choices.map(choice => ({ action, choice })) : []);
      return h('section', { 'aria-label': '工作坊选择' },
        h('p', null, frame.content),
        ...choices.map(({ action, choice }) => h('button', {
          key: `${action.actionId}:${choice.value}`, type: 'button',
          disabled: typeof onSelect !== 'function',
          onClick: () => onSelect({ actionId: action.actionId,
            input: { kind: 'SELECT_CHOICE', value: choice.value } }),
        }, choice.label)),
        frame.actions.some(action => action.inputKinds?.includes('PICK_WORLD_POINT'))
          ? h('p', null, '也可以在游戏中选点。') : null);
    }

    function WorkshopPanel({ flow }) {
      const [view, setView] = React.useState(flow.snapshot());
      const [draft, setDraft] = React.useState('');
      React.useEffect(() => flow.subscribe(setView), [flow]);
      React.useEffect(() => { void flow.open(); }, [flow]);
      return h('main', { style: { padding: 'var(--dsh-frame-top-clearance, 48px) 24px 24px' } },
        h('h1', null, 'HanaWorlds 工作坊'),
        h('p', { role: 'status' }, view.busy ? '工作坊处理中。' :
          view.ready ? '已连接当前 Session 和世界。' : '工作坊尚未连接。'),
        view.error ? h('p', { role: 'alert' }, view.error) : null,
        h('button', { type: 'button', disabled: view.busy,
          onClick: () => { void flow.open(); } }, '刷新连接'),
        view.legacyAvailable ? h('section', {
          'aria-label': '旧项目只读历史' },
        h('h2', null, '旧项目只读历史'),
        h('p', null, '这里是旧项目归档，不代表当前 Session、游戏授权或可发送状态。'),
        view.legacyError ? h('p', { role: 'alert' }, view.legacyError) : null,
        !view.legacyArchives.length && !view.legacyError ?
          h('p', null, '旧项目归档尚未导入。') : null,
        ...view.legacyArchives.map(item => h('button', {
          key: `${item.projectId}:${item.creationSessionId}`, type: 'button',
          onClick: () => { void flow.openLegacyArchive(item.projectId,
            item.creationSessionId); },
        }, `打开旧项目 ${item.projectId}（${item.turnCount} 轮）`)),
        view.legacyArchive ? h('ol', { 'aria-label': '旧项目原始轮次' },
          ...view.legacyArchive.turns.map(turn => h('li', { key: turn.seq },
            h('p', { 'aria-label': '旧轮次原文' }, turn.utterance),
            h('pre', { 'aria-label': '旧轮次结构化回复' },
              JSON.stringify(turn.response, null, 2)),
            h('p', null, `来源：旧项目事件 ${turn.source.seq}；证据摘要 ${turn.source.clientRequestIdDigest}`))))
          : null) : null,
        view.sessions.length ? h('div', null,
          h('label', { htmlFor: 'hanaworlds-workshop-session' }, '已绑定的 Session'),
          h('select', { id: 'hanaworlds-workshop-session',
            value: view.selectedSessionRef ?? '', disabled: view.busy,
            onChange: event => flow.chooseSession(event.target.value) },
          h('option', { value: '' }, '请选择 Session'),
          ...view.sessions.map(item => h('option', {
            key: item.sessionRef, value: item.sessionRef }, item.label))),
          h('button', { type: 'button', disabled: view.busy || !view.selectedSessionRef,
            onClick: () => { void flow.open(view.selectedSessionRef); } },
          '连接所选 Session')) : null,
        h('ol', { 'aria-label': '工作坊轮次' },
          ...(view.details.length ? view.details.map(turn => h('li', {
            key: turn.turnRef },
          h('p', null, turn.userText),
          h('p', { 'aria-label': '完整工作坊回复' }, turn.resultText),
          turn.confirmedBrief ? h('details', null,
            h('summary', null, '已确认的 ReferenceBrief/v2'),
            h('pre', null, JSON.stringify(turn.confirmedBrief, null, 2))) : null,
          turn.confirmedBrief && view.turns.at(-1)?.turnRef === turn.turnRef &&
            !view.turns.at(-1)?.actionReceiptDigest ?
            h('button', { type: 'button', disabled: view.busy || !view.ready,
              onClick: () => { void flow.advanceCurrentBuild(); } }, '建造当前轮') : null,
          view.undoStatus?.availability === 'AVAILABLE' &&
            view.undoStatus.turnRef === turn.turnRef ?
            h('button', { type: 'button', disabled: view.busy || !view.ready,
              onClick: () => { void flow.undoCurrentBuild(); } }, '撤回此建造') : null)) :
            view.turns.map(turn => h('li', { key: turn.turnRef }, turn.text)))),
        view.undoStatus?.head ? h('p', { 'aria-label': '当前历史位置' },
          `历史位置：${view.undoStatus.head.historyRevision}；${view.undoStatus.availability === 'AVAILABLE' ?
            '可撤回当前建造。' : '当前建造不可撤回。'}`) : null,
        view.undoResult ? h('p', { role: 'status', 'aria-label': '撤回结果' },
          `撤回已验证；历史位置：${view.undoResult.afterHead.historyRevision}`) : null,
        view.undoError ? h('p', { role: 'alert' }, view.undoError) : null,
        view.buildOutcome?.outcome === 'CHOICE_REQUIRED' ?
          h(WorkshopChoiceFrame, { frame: view.buildOutcome.frame,
            onSelect: view.ready && !view.busy ? ({ actionId, input }) => {
              void flow.chooseBuildPlacement(actionId, input.value);
            } : null }) : null,
        view.buildOutcome?.outcome === 'PENDING' ?
          h('p', { role: 'status', 'aria-label': '建造待决' },
            `建造仍待确认：${view.buildOutcome.stage}`) : null,
        view.buildOutcome?.outcome === 'VERIFIED' ?
          h('p', { role: 'status', 'aria-label': '建造结果' },
            '建造已验证，并已读回当前 Session。') : null,
        view.buildError ? h('p', { role: 'alert' }, view.buildError) : null,
        view.reply ? h('p', { 'aria-label': '本次工作坊回复' }, view.reply) : null,
        h('form', { onSubmit: event => {
          event.preventDefault();
          void flow.submit(draft).then(sent => { if (sent) setDraft(''); });
        } },
        h('label', { htmlFor: 'hanaworlds-workshop-input' },
          view.clarification ? '回复工作坊' : '输入建造请求'),
        h('input', { id: 'hanaworlds-workshop-input', value: draft,
          onChange: event => setDraft(event.target.value),
          disabled: !view.ready || view.busy }),
        h('button', { type: 'submit', disabled: !view.ready || view.busy || !draft.trim() },
          '发送')));
    }

    const IMAGE_PANEL_ID = 'hanaworlds-workshop-image-links';
    function createImageLinkFlow({ rpc, currentSessionRef, currentSessionTitle }) {
      const listeners = new Set();
      let generation = 0, controller;
      let state = { sessionRef: currentSessionRef(), title: currentSessionTitle?.() ?? '', busy: false, result: null, error: '' };
      const snapshot = () => state;
      const publish = patch => { state = { ...state, ...patch }; for (const listener of listeners) listener(state); };
      const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
      const refreshSession = () => {
        const sessionRef = currentSessionRef();
        if (state.sessionRef !== sessionRef) {
          generation++; controller?.abort();
          publish({ sessionRef, title: currentSessionTitle?.() ?? '', busy: false, result: null, error: '' });
        } else if (currentSessionTitle) publish({ title: currentSessionTitle() });
      };
      async function download(url) {
        if (state.busy) return false;
        const sessionRef = currentSessionRef();
        if (typeof sessionRef !== 'string' || !sessionRef) {
          publish({ sessionRef: null, result: null, error: '请先打开一个真实对话，再打开 Workshop 开发面板。' });
          return false;
        }
        const token = ++generation; controller = new AbortController();
        publish({ sessionRef, busy: true, result: null, error: '' });
        const current = () => token === generation && currentSessionRef() === sessionRef;
        try {
          const downloaded = await rpc('hanaworldsWorkshopImageLinks/downloadLink', { sessionRef, url }, controller.signal);
          if (!current()) throw Error('当前对话已改变，旧对话的下载结果未展示。');
          if (downloaded.sessionRef !== sessionRef || downloaded.status !== 'ATTACHED') throw Error('附件与当前对话不一致。');
          const readback = await rpc('hanaworldsWorkshopImageLinks/readLink', { sessionRef, attachmentRef: downloaded.image.attachmentId }, controller.signal);
          if (!current()) throw Error('当前对话已改变，旧对话的下载结果未展示。');
          if (readback.sessionRef !== sessionRef || readback.status !== 'ATTACHED' || readback.image.attachmentId !== downloaded.image.attachmentId) throw Error('图片附件读回不一致。');
          publish({ result: readback }); return true;
        } catch (error) {
          if (token === generation) publish({ result: null, error: String(error?.message ?? error) });
          return false;
        } finally { if (token === generation) publish({ busy: false }); }
      }
      return { snapshot, subscribe, download, refreshSession, dispose() { generation++; controller?.abort(); listeners.clear(); } };
    }
    function ImageLinkPanel({ flow }) {
      const [view, setView] = React.useState(flow.snapshot());
      const [url, setURL] = React.useState('');
      React.useEffect(() => flow.subscribe(setView), [flow]);
      const image = view.result?.image;
      return h('section', { style: { padding: 'calc(var(--dsh-frame-top-clearance, 0px) + 24px) 32px 32px', maxWidth: '760px', margin: '0 auto' } },
        h('p', { style: { opacity: 0.65, fontSize: '13px' } }, 'Workshop · 图片链接'),
        h('h1', null, '把图片带入当前对话'),
        h('p', null, '贴入直达图片的链接，下载真实图片并关联到当前对话。'),
        h('p', { role: 'status' }, view.sessionRef ? `当前对话：${view.title || '未命名对话'}` : '当前没有可确认身份的对话。请先打开一个对话。'),
        h('form', { onSubmit(event) { event.preventDefault(); void flow.download(url); } },
          h('label', { htmlFor: 'workshop-image-link-url', style: { display: 'block', marginBottom: '8px' } }, '图片链接'),
          h('input', { id: 'workshop-image-link-url', type: 'url', value: url, placeholder: 'https://…/image.png', onChange: event => setURL(event.target.value), style: { width: '100%', padding: '12px', marginBottom: '12px' }, disabled: view.busy }),
          h('button', { type: 'submit', disabled: !view.sessionRef || view.busy || !url.trim() }, view.busy ? '正在下载并读回…' : '下载到当前对话')),
        view.error ? h('p', { role: 'alert', style: { color: '#cf5252' } }, view.error) : null,
        image ? h('div', { style: { marginTop: '24px' } },
          h('img', { alt: '已下载并关联当前对话的图片', src: `data:${image.mediaType};base64,${view.result.data}`, style: { maxWidth: '100%', maxHeight: '360px', objectFit: 'contain', borderRadius: '8px' } }),
          h('p', null, `${image.mediaType} · ${image.width} × ${image.height} · ${image.bytes} bytes`),
          h('p', { role: 'status' }, '已关联到当前对话，并已读回同一图片。'),
          h('details', null, h('summary', null, '附件详情'), h('p', null, image.attachmentId))) : null);
    }

    function WorkshopIcon() {
      return h('span', { 'aria-hidden': 'true' }, '✿');
    }

    function WorkshopFailureCard({ message }) {
      return h('main', { style: { padding: 'var(--dsh-frame-top-clearance, 48px) 24px 24px' } },
        h('section', { role: 'alert', 'aria-label': 'hanaworlds-workshop 故障' },
          h('h1', null, 'hanaworlds-workshop 工作坊初始化失败'),
          h('p', null, message)));
    }

    function apply(ctx) {
      const disposers = [];
      const keep = dispose => {
        if (typeof dispose === 'function') disposers.push(dispose);
        return dispose;
      };
      try { initializeWorkshop(ctx, keep); }
      catch (error) {
        console.error('hanaworlds-workshop apply failed', error);
        for (const dispose of disposers.reverse()) {
          try { dispose(); }
          catch (cleanupError) { console.error('hanaworlds-workshop cleanup failed', cleanupError); }
        }
        const message = String(error?.message ?? error);
        // Use only the host's declared slots: no Session or transport is needed
        // to name the failed plugin and preserve the rest of the host page.
        try {
          ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID },
            () => h(WorkshopFailureCard, { message })));
          ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
            name: 'sidebar.panellist', id: PANEL_ID, order: 30,
            label: () => '工作坊 · hanaworlds-workshop 故障',
          }, WorkshopIcon));
        } catch (displayError) {
          // If the host slot service itself is broken, keep both causes in the
          // console without propagating Workshop's initialization to the page.
          console.error('hanaworlds-workshop fault card could not mount', displayError);
        }
      }
    }

    function initializeWorkshop(ctx, keep) {
      // The desktop host provides the request boundary as the client service
      // hanaworldsWorkshopTransport; there is no window global or Tauri fallback.
      // The host remains responsible for every live Core Session and local world
      // association check; this renderer receives no refs.
      const transport = ctx.get('hanaworldsWorkshopTransport');
      const invoke = typeof transport?.invoke === 'function'
        ? (command, args) => transport.invoke(command, args) : null;
      // Session catalog has no "current" field. Its public mainView reference
      // source identifies the Session retained by the actual conversation owner.
      const selectedSession = () => {
        const catalog = ctx.sessions.list.getSnapshot();
        const entries = Object.entries(catalog.byId).filter(([,row]) => (row.retainedBy?.mainView ?? 0) > 0);
        return entries.length === 1 ? entries[0] : null;
      };
      const imageFlow = createImageLinkFlow({
        currentSessionRef: () => selectedSession()?.[0] ?? null,
        currentSessionTitle: () => selectedSession()?.[1]?.title ?? '',
        rpc: async (endpoint, args, signal) => {
          const response = await ctx.connection.rpc.call('/api', endpoint, { args }, signal);
          if (!response.ok) throw Error(`${response.error.code}: ${response.error.message}`);
          return response.value;
        },
      });
      const unsubscribeImages = ctx.sessions.list.subscribe(() => imageFlow.refreshSession());
      let imagesDisposed = false;
      const disposeImages = keep(() => {
        if (imagesDisposed) return;
        imagesDisposed = true;
        unsubscribeImages(); imageFlow.dispose();
      });
      ctx.effect(() => disposeImages, 'workshop.image-panel');
      keep(ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: IMAGE_PANEL_ID }, () => h(ImageLinkPanel, { flow: imageFlow }))));
      keep(ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: IMAGE_PANEL_ID, order: 31, label: () => 'Workshop 开发面板' }, WorkshopIcon)));
      const flow = createWorkshopFlow({ invoke,
        legacyHistory: typeof transport?.legacyHistory === 'function'
          ? (action, input) => transport.legacyHistory(action, input) : null,
        currentSessionRef: () => {
          try { return ctx.sessions?.list?.getSnapshot?.()?.current ?? null; }
          catch { return null; }
        },
        newId: () => window.crypto?.randomUUID?.(),
      });
      keep(ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main', key: PANEL_ID,
      }, () => h(WorkshopPanel, { flow }))));
      keep(ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist', id: PANEL_ID, order: 30,
        label: () => '工作坊',
      }, WorkshopIcon)));
    }

    module.exports = { name: PANEL_ID, inject: ['slots', 'layout', 'sessions', 'connection'], apply,
      createImageLinkFlow, ImageLinkPanel,
      WorkshopChoiceFrame, createWorkshopFlow, WorkshopPanel };
    return module.exports;
  },
});
