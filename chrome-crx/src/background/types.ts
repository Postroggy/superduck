export interface ScheduledTask {
  id?: string;
  name?: string;
  prompt: string;
  url?: string;
  enabled?: boolean;
  skipPermissions?: boolean;
  model?: string;
}
