// Image ask: the building skill's "look at the picture, describe the structure,
// ask before guessing scale or purpose" step. It only shapes one agent's prompt
// and visible tools through public dsh-system-prompt / dsh-tools scoping; it
// never calls a model itself and never writes the world.
export const IMAGE_ASK_SECTION = 'hanaworlds-building:image-ask';
export const IMAGE_ASK_ALLOWED_TOOLS = Object.freeze(['hanaworlds_download_image']);
export const imageAskGuidance = [
 'HanaWorlds building skill — image step.',
 'When the user\'s message carries an image, look at the actual image content and describe the structure you see: overall form and footprint, number of storeys, roof shape, walls and openings, symmetry, notable parts, colours and materials.',
 'Never describe the picture from its file name, link text or URL.',
 'This step only describes and clarifies. Do not propose, plan or build anything and do not claim that anything was built.',
 'If the scale (size in nodes or storeys) or the purpose (what the building is for) is not clear from the image and the user\'s words, ask one short clarifying question about it before anything else, and wait for the answer.',
 'Reply in the user\'s language.',
].join('\n');

/** Scope one conversation's agent to the image step: add the building skill's
 * image section and hide every global tool except the read-only image tool.
 * Returns the disposer that lifts both. Fails by name when the Host lacks the
 * public ports this needs. */
export function prepareImageAsk(agent) {
 const scoped = agent?.ctx;
 if (!scoped) throw Error('CONVERSATION_AGENT_REQUIRED');
 if (!scoped.systemPrompt?.section) throw Error('SYSTEM_PROMPT_UNAVAILABLE');
 if (!scoped.tools?.restrict) throw Error('TOOLS_UNAVAILABLE');
 const lift = [];
 try {
  lift.push(scoped.systemPrompt.section({ name: IMAGE_ASK_SECTION, order: 9000, text: imageAskGuidance, interpolate: false }));
  lift.push(scoped.tools.restrict({ allow: [...IMAGE_ASK_ALLOWED_TOOLS] }));
 } catch (error) { for (const d of lift.reverse()) d?.(); throw error; }
 return () => { for (const d of lift.reverse()) d?.(); };
}
