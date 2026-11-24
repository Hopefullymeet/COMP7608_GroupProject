// Only the research loop and its in-memory services are mounted in this process.
import { createInterface } from 'node:readline'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import Projections from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools, { defineTool } from '@deepseek-ai/dsh-tools'
import * as Executor from '@deepseek-ai/dsh-tool-executor-native'
import * as Todo from '@deepseek-ai/dsh-tool-todo'

const input = createInterface({input: process.stdin, crlfDelay: Infinity})[Symbol.asyncIterator]()
async function read() {
  const {value, done} = await input.next()
  if (done) throw Error('Worker disconnected')
  return JSON.parse(value)
}
function send(packet) { process.stdout.write(JSON.stringify(packet) + '\n') }
async function request(packet) { send(packet); return await read() }

function wireMessage(message) {
  const content = message.content.filter(b => b.type === 'text').map(b => b.text).join('')
  const calls = message.content.filter(b => b.type === 'tool-call')
  return {role: message.role, content,
    ...(message.role === 'tool' && {tool_call_id: message.toolCallId}),
    ...(calls.length && {tool_calls: calls.map(b => ({id:b.id, type:'function',
      function:{name:b.name, arguments:b.arguments}}))})}
}
class PaperModel extends LlmAdapter {
  async * stream(options) {
    const message = await request({kind:'model', messages:options.messages.map(wireMessage),
      schemas:options.tools ?? []})
    const blocks = []
    if (message.content) blocks.push({type:'text', text:message.content})
    for (const call of message.tool_calls ?? []) blocks.push({type:'tool-call', id:call.id, ...call.function})
    for (const [index, block] of blocks.entries()) {
      yield {type:'block-start', index, blockType:block.type}
      if (block.type === 'text') yield {type:'text-delta', index, text:block.text}
      else yield {type:'tool-call-delta', index, id:block.id, name:block.name, argumentsDelta:block.arguments}
      yield {type:'block-end', index, block}
    }
    yield {type:'finish', reason:{kind:message.tool_calls?.length ? 'tool-calls' : 'stop'}}
  }
}
async function main() {
  const init = await read()
  const ctx = new Context()
  for (const plugin of [LlmRuntime, SessionStore, Projections, SystemPrompt, Tools, Executor, AgentRegistry])
    await ctx.plugin(plugin)
  await ctx.plugin(AgentLoop, {agents:[], maxParallelToolCalls:1})
  if (init.plan) await ctx.plugin(Todo, {allowParallelInProgress:false})
  ctx.llm.registerAdapter(['papertrace'], new PaperModel())
  for (const {function: f} of init.tools) ctx.tools.register(defineTool({
    name:f.name, description:f.description, parameters:Object.fromEntries(Object.entries(f.parameters.properties).map(([key, schema]) => {
      // ResearchTools enforces the collection bounds at execution time.
      const {minItems, maxItems, ...supported} = schema
      return [key, supported]
    })),
    output:{schema:{type:'string'}, render:(_args, value) => [{type:'text', text:value}]},
    async execute(args) { return JSON.stringify(await request({kind:'tool', name:f.name, args})) }
  }))
  ctx.on('session/event', (_session, event) => {
    if (event.type === 'todo/write') send({kind:'plan', data:event.data})
    if (event.type === 'turn/end') send({kind:'end', reason:event.data.reason.kind})
  })
  const agent = await ctx.agentLoop.create('research', {provider:'papertrace', model:init.model})
  agent.followup(createUserMessage({content:[{type:'text', text:init.prompt}], source:{kind:'user'}}))
  await agent.whenIdle()
}
main().then(() => process.stdin.destroy()).catch(() => {send({kind:'error'}); process.exitCode=1; process.stdin.destroy()})
