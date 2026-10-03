// DSH 0.2.0-rc.2 web-client module format. The host owns authentication and
// Session context; this component never asks a player to enter internal refs.
window.__ModuleLoader__.load({
  id: 'hanaworlds-workshop',
  factory: (require) => {
    const module = { exports: {} };
    const React = require('react');
    const h = React.createElement;
    const PANEL_ID = 'hanaworlds-workshop';

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

    function WorkshopPanel() {
      return h('main', { style: { padding: 'var(--dsh-frame-top-clearance, 48px) 24px 24px' } },
        h('h1', null, 'HanaWorlds 工作坊'),
        h('p', { role: 'status' }, '工作坊暂不可用。'));
    }

    function WorkshopIcon() {
      return h('span', { 'aria-hidden': 'true' }, '✿');
    }

    function apply(ctx) {
      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main', key: PANEL_ID,
      }, WorkshopPanel));
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist', id: PANEL_ID, order: 30,
        label: () => '工作坊',
      }, WorkshopIcon));
    }

    module.exports = { name: PANEL_ID, inject: ['slots', 'layout'], apply,
      WorkshopChoiceFrame };
    return module.exports;
  },
});
