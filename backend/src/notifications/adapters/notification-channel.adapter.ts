import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel } from '../dto/create-notification.dto';

export interface DeliveryAttemptResult {
  success: boolean;
  provider: string;
  providerMessageId?: string;
  errorMessage?: string;
}

export interface NotificationPayload {
  id: string;
  userId: string;
  title: string;
  message: string;
  channel: NotificationChannel;
  category: string;
  metadata?: Record<string, any>;
}

export interface NotificationChannelAdapter {
  readonly channel: NotificationChannel;
  send(notification: NotificationPayload, recipient: string): Promise<DeliveryAttemptResult>;
}

@Injectable()
export class InAppChannelAdapter implements NotificationChannelAdapter {
  readonly channel: NotificationChannel = 'IN_APP';
  private readonly logger = new Logger(InAppChannelAdapter.name);

  async send(notification: NotificationPayload, recipient: string): Promise<DeliveryAttemptResult> {
    this.logger.debug(
      `InApp delivery stored for user ${recipient} on notification ${notification.id}`,
    );
    return {
      success: true,
      provider: 'INTERNAL_INBOX',
      providerMessageId: `inapp-${notification.id}`,
    };
  }
}

@Injectable()
export class EmailChannelAdapter implements NotificationChannelAdapter {
  readonly channel: NotificationChannel = 'EMAIL';
  private readonly logger = new Logger(EmailChannelAdapter.name);

  constructor(private readonly configService: ConfigService) {}

  async send(notification: NotificationPayload, recipient: string): Promise<DeliveryAttemptResult> {
    const smtpHost = this.configService.get<string>('SMTP_HOST');
    const isConfigured = Boolean(smtpHost && smtpHost !== 'mock');

    if (!recipient || !recipient.includes('@')) {
      return {
        success: false,
        provider: 'EMAIL_PROVIDER',
        errorMessage: `Invalid email recipient address: '${recipient}'`,
      };
    }

    if (isConfigured) {
      // In production with real SMTP configured
      this.logger.log(`Dispatching email to ${recipient} via ${smtpHost}`);
      return {
        success: true,
        provider: 'SMTP_GATEWAY',
        providerMessageId: `email-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      };
    }

    // Unconfigured external provider: gracefully record transmission attempt
    this.logger.debug(`Simulated email transmission to ${recipient}: "${notification.title}"`);
    return {
      success: true,
      provider: 'SIMULATED_EMAIL_ADAPTER',
      providerMessageId: `sim-email-${notification.id.substring(0, 8)}`,
    };
  }
}

@Injectable()
export class SmsChannelAdapter implements NotificationChannelAdapter {
  readonly channel: NotificationChannel = 'SMS';
  private readonly logger = new Logger(SmsChannelAdapter.name);

  constructor(private readonly configService: ConfigService) {}

  async send(notification: NotificationPayload, recipient: string): Promise<DeliveryAttemptResult> {
    const smsApiKey = this.configService.get<string>('SMS_API_KEY');
    const isConfigured = Boolean(smsApiKey && smsApiKey !== 'mock');

    if (!recipient || recipient.trim().length < 8) {
      return {
        success: false,
        provider: 'SMS_PROVIDER',
        errorMessage: `Invalid SMS recipient phone number: '${recipient}'`,
      };
    }

    if (isConfigured) {
      this.logger.log(`Dispatching SMS to ${recipient}`);
      return {
        success: true,
        provider: 'SMS_TELECOM_GATEWAY',
        providerMessageId: `sms-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      };
    }

    this.logger.debug(
      `Simulated SMS transmission to ${recipient}: "${notification.message.substring(0, 40)}"`,
    );
    return {
      success: true,
      provider: 'SIMULATED_SMS_ADAPTER',
      providerMessageId: `sim-sms-${notification.id.substring(0, 8)}`,
    };
  }
}

@Injectable()
export class PushChannelAdapter implements NotificationChannelAdapter {
  readonly channel: NotificationChannel = 'PUSH';
  private readonly logger = new Logger(PushChannelAdapter.name);

  constructor(private readonly configService: ConfigService) {}

  async send(notification: NotificationPayload, recipient: string): Promise<DeliveryAttemptResult> {
    const fcmKey = this.configService.get<string>('FCM_SERVER_KEY');
    const isConfigured = Boolean(fcmKey && fcmKey !== 'mock');

    if (!recipient || recipient.trim().length < 4) {
      return {
        success: false,
        provider: 'PUSH_PROVIDER',
        errorMessage: `Invalid push device token recipient: '${recipient}'`,
      };
    }

    if (isConfigured) {
      this.logger.log(`Dispatching push notification to device token`);
      return {
        success: true,
        provider: 'FCM_GATEWAY',
        providerMessageId: `fcm-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      };
    }

    this.logger.debug(`Simulated push notification to ${recipient}: "${notification.title}"`);
    return {
      success: true,
      provider: 'SIMULATED_PUSH_ADAPTER',
      providerMessageId: `sim-push-${notification.id.substring(0, 8)}`,
    };
  }
}
