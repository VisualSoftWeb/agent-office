const TOOL_RESULT_PREFIX = '<tool_result>'
const TOOL_RESULT_SUFFIX = '</tool_result>'

export function wrapToolResult(result: string): string {
  return `${TOOL_RESULT_PREFIX}\n${result}\n${TOOL_RESULT_SUFFIX}`
}

export function sanitizeSystemPrompt(prompt: string): string {
  return prompt.replace(/<tool_result>.*?<\/tool_result>/gs, '[tool output hidden]')
}

export function isToolOutput(content: string): boolean {
  return content.startsWith(TOOL_RESULT_PREFIX) && content.endsWith(TOOL_RESULT_SUFFIX)
}
