export interface WhatsAppRequest {
  to: string;
  message: string;
}

export interface WhatsAppResult {
  success: boolean;
  messageCount?: number;
  error?: string;
}
