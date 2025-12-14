export interface EmailConfig {
  apiKey?: string; // Optional when using backend edge function
  // fromEmail and fromName are managed server-side from environment variables
}

export interface EmailDeliveryRequest {
  to: string; // Recipient email address
  subject: string;
  message: string;
  config?: EmailConfig;
}

export interface EmailDeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
}
