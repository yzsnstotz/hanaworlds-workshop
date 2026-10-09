// Scope one conversation to the official skill loader and read-only image tool.
// The complete building skill is registered separately after host peer composition.
export const IMAGE_ASK_ALLOWED_TOOLS = Object.freeze(['hanaworlds_download_image', 'skill']);

/** Returns the disposer that lifts this agent's tool restriction. */
export function prepareImageAsk(agent) {
 const scoped = agent?.ctx;
 if (!scoped) throw Error('CONVERSATION_AGENT_REQUIRED');
 if (!scoped.tools?.restrict) throw Error('TOOLS_UNAVAILABLE');
 return scoped.tools.restrict({ allow: [...IMAGE_ASK_ALLOWED_TOOLS] });
}
