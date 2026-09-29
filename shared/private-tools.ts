export interface PrivateParameter {
  name: string;
  type: 'string' | 'number' | 'boolean';
  description: string;
  required: boolean;
}
export interface PrivateToolDefinition {
  id: string;
  name: string;
  description: string;
  parameters: PrivateParameter[];
}
export interface PrivateTool extends PrivateToolDefinition {
  executable: string;
  args: string[];
  envFile: string;
  approval: 'always' | 'automatic';
  timeoutSeconds: number;
  maxOutputBytes: number;
}
export interface PrivateToolsSettings {
  enabled: boolean;
  instructions: string;
  tools: PrivateTool[];
}
export interface PrivateToolApproval {
  id: string;
  runId: string;
  name: string;
  input: Record<string, string | number | boolean>;
  expiresAt: number;
}
