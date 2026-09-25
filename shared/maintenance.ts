export type PublishPolicy = 'review' | 'new' | 'maintain';
export interface MaintenanceSettings {
  enabled: boolean;
  time: string;
  timezone: string;
  projectIds: string[];
  learnConversations: boolean;
  policy: PublishPolicy;
  maxMinutes: number;
}
export interface DiscoveryMetadata {
  description: string;
  tags: string[];
  aliases: string[];
  category: 'reference' | 'definition' | 'calculation_rule' | 'query_recipe' | 'procedure';
}
