export interface MessageRecord {
  id: string;
  user_id: string;
  role: string;
  content: string;
  tool_calls: string | null;
  tokens: number;
  created_at: string;
  tool_call_id: string | null;
  name: string | null;
}

export interface FactRecord {
  id: string;
  user_id: string;
  fact: string;
  category: string;
  created_at: string;
  updated_at: string;
}

export interface CostRecord {
  id: string;
  user_id: string;
  conversation_id: string;
  provider: string;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  created_at: string;
}
