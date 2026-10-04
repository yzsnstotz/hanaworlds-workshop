// DSH 0.2.0-rc.2 web-client module format. The host owns authentication and
// Session context; this component never asks a player to enter internal refs.
window.__ModuleLoader__.load({
  id: 'hanaworlds-workshop',
  factory: (require) => {
    const module = { exports: {} };
    const React = require('react');
    const h = React.createElement;
    const PANEL_ID = 'hanaworlds-workshop';
    let desktopInvoke;
    try { desktopInvoke = require('dsh-tauri').invoke; } catch { /* shown in panel */ }

    function createWorkshopFlow({ invoke, currentSessionRef, newId }) {
      const listeners = new Set();
      let state = { ready: false, busy: false, error: '', turns: [], reply: '',
        sessionRef: null, worldRef: null, revision: null, clarification: null,
        sessions: [], selectedSessionRef: null, details: [],
        undoStatus: null, undoResult: null, undoError: '' };
      const snapshot = () => ({ ...state, turns: [...state.turns],
        sessions: [...state.sessions], details: [...state.details] });
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
            payload: { contractVersion: 'session/v2', ...payload } },
        });
        if (!response || response.error || !response.result) {
          const code = response?.error?.code ?? 'INVALID_RESPONSE';
          const reasons = { AUTHORIZATION_REVOKED: '当前授权已撤销',
            WORLD_NOT_BOUND: '当前世界已变化',
            SAVED_RESOURCE_UNAVAILABLE: '缺少已验证建造的持久回执',
            UNDO_CONFLICT: '建造历史已变化或发生外部编辑冲突',
            STALE_REVISION: '历史版本已变化',
            READBACK_FAILED: '撤回后历史读回未确认',
            RECOVERY_PENDING: '撤回交易仍在恢复中',
            CAPABILITY_UNAVAILABLE: '撤回能力暂不可用' };
          throw Error(`工作坊拒绝：${reasons[code] ?? '请求未完成'}（${code}）。`);
        }
        return response.result;
      };
      const bindingLost = error => /\b(TRUSTED_BINDING_REQUIRED|AUTHORIZATION_REVOKED)\b/
        .test(`${String(error?.code ?? '')} ${String(error?.message ?? error)}`);
      const context = async sessionRef => {
        if (typeof invoke !== 'function') throw Error('桌面工作坊连接不可用。');
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
        if (typeof invoke !== 'function') throw Error('桌面工作坊连接不可用。');
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
      async function open(selected = null) {
        publish({ ready: false, busy: true, error: '', reply: '',
          clarification: null, undoStatus: null, undoResult: null, undoError: '' });
        try {
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
            clarification: null, error: '请连接所选 Session。' });
      }
      async function submit(text) {
        if (!state.ready || state.busy) return false;
        if (typeof text !== 'string' || !text.trim()) {
          publish({ error: '请输入要发送的内容。' });
          return false;
        }
        const { sessionRef, revision } = state;
        publish({ busy: true, error: '', undoStatus: null, undoResult: null, undoError: '' });
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
        publish({ busy: true, error: '', undoError: '', undoResult: null });
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
      return { snapshot, subscribe, open, chooseSession, submit, undoCurrentBuild };
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

    function WorkshopIcon() {
      return h('span', { 'aria-hidden': 'true' }, '✿');
    }

    function apply(ctx) {
      const flow = createWorkshopFlow({ invoke: desktopInvoke,
        currentSessionRef: () => {
          try { return ctx.sessions?.list?.getSnapshot?.()?.current ?? null; }
          catch { return null; }
        },
        newId: () => window.crypto?.randomUUID?.(),
      });
      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main', key: PANEL_ID,
      }, () => h(WorkshopPanel, { flow })));
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist', id: PANEL_ID, order: 30,
        label: () => '工作坊',
      }, WorkshopIcon));
    }

    module.exports = { name: PANEL_ID, inject: ['slots', 'layout', 'sessions'], apply,
      WorkshopChoiceFrame, createWorkshopFlow, WorkshopPanel };
    return module.exports;
  },
});
