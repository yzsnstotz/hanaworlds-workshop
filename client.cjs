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
        sessions: [], selectedSessionRef: null };
      const snapshot = () => ({ ...state, turns: [...state.turns],
        sessions: [...state.sessions] });
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
        if (!response || response.error || !response.result)
          throw Error(`工作坊拒绝：${response?.error?.code ?? 'INVALID_RESPONSE'}`);
        return response.result;
      };
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
      async function open(selected = state.selectedSessionRef) {
        publish({ ready: false, busy: true, error: '', reply: '', clarification: null });
        try {
          const sessions = await boundSessions();
          publish({ sessions });
          const current = currentSessionRef?.();
          const sessionRef = current || selected;
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
          if (currentSessionRef?.() && currentSessionRef() !== sessionRef)
            throw Error('当前 Session 已切换，请刷新工作坊。');
          publish({ ready: true, sessionRef, worldRef: binding.worldRef,
            revision: session.context.sessionRevision, turns: session.turns,
            sessions, selectedSessionRef: sessionRef,
            error: '' });
        } catch (error) {
          publish({ ready: false, sessionRef: null, worldRef: null,
            revision: null, turns: [], error: String(error?.message ?? error) });
        } finally { publish({ busy: false }); }
      }
      function chooseSession(sessionRef) {
        if (!state.sessions.some(item => item.sessionRef === sessionRef)) return;
        publish({ selectedSessionRef: sessionRef });
      }
      async function submit(text) {
        if (!state.ready || state.busy) return false;
        if (typeof text !== 'string' || !text.trim()) {
          publish({ error: '请输入要发送的内容。' });
          return false;
        }
        const { sessionRef, revision } = state;
        publish({ busy: true, error: '' });
        try {
          if (currentSessionRef?.() && currentSessionRef() !== sessionRef)
            throw Error('当前 Session 已切换，请刷新工作坊。');
          const body = state.clarification
            ? { requestId: id(), turnRef: state.clarification.turnRef,
              expectedRevision: revision,
              clarificationId: state.clarification.clarificationId, answer: text }
            : { requestId: id(), turnRef: id(), expectedRevision: revision,
              text, media: [], controls: { purpose: null, dimensions: null,
                entrancePortalRefs: [], styleText: null } };
          const receipt = await workshop(sessionRef,
            state.clarification ? 'AnswerClarification' : 'AppendMultimodalTurn', body);
          const session = await workshop(sessionRef, 'StartOrResumeSession', {
            requestId: id(), expectedRevision: null,
          });
          if ((currentSessionRef?.() && currentSessionRef() !== sessionRef) ||
              session.context.currentSession !== sessionRef)
            throw Error('当前 Session 已切换，请刷新工作坊。');
          publish({ turns: session.turns, revision: session.context.sessionRevision,
            reply: receipt.resultText, clarification: receipt.clarification
              ? { turnRef: receipt.turnRef,
                clarificationId: receipt.clarification.clarificationId } : null });
          return true;
        } catch (error) {
          publish({ error: String(error?.message ?? error) });
          return false;
        } finally { publish({ busy: false }); }
      }
      return { snapshot, subscribe, open, chooseSession, submit };
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
          ...view.turns.map(turn => h('li', { key: turn.turnRef }, turn.text))),
        view.reply ? h('p', { 'aria-label': '工作坊回复' }, view.reply) : null,
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
