import type { ToolDefinition, ToolCall } from '../llm/interface.js'

type ToolHandler = (args: Record<string, unknown>) => Promise<string>

const tools = new Map<string, { def: ToolDefinition; handler: ToolHandler }>()

export function registerTool(def: ToolDefinition, handler: ToolHandler): void {
  tools.set(def.function.name, { def, handler })
}

export function getToolDefinitions(): ToolDefinition[] {
  return Array.from(tools.values()).map(t => t.def)
}

export async function executeToolCall(tc: ToolCall): Promise<string> {
  const tool = tools.get(tc.function.name)
  if (!tool) throw new Error(`Unknown tool: ${tc.function.name}`)

  const args = JSON.parse(tc.function.arguments)
  const result = await tool.handler(args)
  return `<tool_result tool="${tc.function.name}">\n${result}\n</tool_result>`
}

// Built-in tools
registerTool({
  type: 'function',
  function: {
    name: 'get_current_time',
    description: 'Get the current date and time',
    parameters: { type: 'object', properties: {}, required: [] },
  },
}, async () => new Date().toISOString())

registerTool({
  type: 'function',
  function: {
    name: 'calculator',
    description: 'Evaluate a math expression',
    parameters: {
      type: 'object',
      properties: { expression: { type: 'string', description: 'Math expression to evaluate' } },
      required: ['expression'],
    },
  },
}, async (args) => {
  try {
    const result = Function(`"use strict"; return (${args.expression})`)()
    return String(result)
  } catch {
    return 'Error evaluating expression'
  }
})
