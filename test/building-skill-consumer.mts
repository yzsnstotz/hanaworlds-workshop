// Compile the actual exported Workshop module with the official Cordis + skill ports.
// This checks the consumer seam, not strict typing of all Workshop JavaScript.
import { Context, type Fiber } from '@deepseek-ai/cordis';
import Skills from '@deepseek-ai/dsh-skill';
import * as ToolSkill from '@deepseek-ai/dsh-tool-skill';
import BuildingSkill from 'hanaworlds-workshop/building-skill';
const ctx = new Context();
await ctx.plugin(Skills).await();
const loading: Promise<Fiber> = ctx.plugin(BuildingSkill).await();
await loading;
await ctx.plugin(ToolSkill).await();
const body: string | undefined = (await ctx.skills.get('hanaworlds-building'))?.content;
void body;
