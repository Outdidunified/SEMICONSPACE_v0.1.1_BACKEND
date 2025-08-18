import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { NotificationService } from './notification.service';

@Controller()
export class NotificationConsumer {
  constructor(private readonly notificationService: NotificationService) {}

  @MessagePattern('user.registered')
  async handleUserRegistered(@Payload() payload: any) {
    const timestamp = new Date().toISOString();

    const subject = `🎉 Welcome to Semicon Space, ${payload.first_name}!`;
    const message = `
      <h2 style="color:#2d89ef;">Welcome aboard, ${payload.first_name}!</h2>
      <p>We’re excited to have you join the Semicon Space community 🚀</p>
      <p>Here’s to exploring new possibilities together!</p>
      <br/>
      <small>Logged at: ${timestamp}</small>
    `;

    await this.notificationService.sendNotification({
      toEmail: payload.email,
      type: 'email',
      message,
      userId: payload.userId,
      notificationId: Date.now(),
      status: 'sent',
      timestamp,
      subject,
    });
  }

  @MessagePattern('user.loggedin')
  async handleUserLoggedIn(@Payload() payload: any) {
    const timestamp = new Date().toISOString();

    if (!payload.email || !payload.userId) {
      console.warn('❌ Missing fields in login payload:', payload);
      return;
    }

    const subject = '🔐 Login Alert - Semicon Space';
    const message = `
      <h2 style="color:#28a745;">Hello again!</h2>
      <p>We noticed you just logged into your account at <b>${payload.time}</b>.</p>
      <p>If this wasn’t you, please reset your password immediately.</p>
      <br/>
      <small>Logged at: ${timestamp}</small>
    `;

    await this.notificationService.sendNotification({
      toEmail: payload.email,
      type: 'email',
      message,
      userId: payload.userId,
      notificationId: Date.now(),
      phone: payload.phone,
      status: 'sent',
      timestamp,
      subject,
      channel: 'email',
      sender: 'notification-service',
    });
  }

  @MessagePattern('order.created')
  async handleOrderCreated(@Payload() payload: any) {
    try {
      console.log('📦 Kafka - order.created:', payload);

      const order = payload;
      const timestamp = new Date().toISOString();

      const itemSummary = Array.isArray(order.items)
        ? order.items.map(
            (item, i) =>
              `<li>Product ID: <b>${item.productId}</b> | Qty: ${item.qty} | Price: $${item.price}</li>`
          ).join('')
        : '<li>Order items unavailable</li>';

      const subject = `🛒 Order Confirmation #${order.orderId}`;
      const message = `
        <h2 style="color:#ff6600;">Your order has been placed successfully!</h2>
        <p>Thank you for shopping with Semicon Space. Here are your order details:</p>
        <ul>
          ${itemSummary}
        </ul>
        <p><b>Total Amount:</b> $${order.total}</p>
        <p><b>Status:</b> ${order.status}</p>
        <br/>
        <small>Order placed at: ${timestamp}</small>
      `;

      await this.notificationService.sendNotification({
        toEmail: payload.email || 'user@domain.com',
        type: 'email',
        message,
        userId: order.userId,
        notificationId: Date.now(),
        status: 'sent',
        timestamp,
        subject,
        channel: 'email',
        sender: 'notification-service',
      });
    } catch (error) {
      console.error('❌ Error in handleOrderCreated:', error);
    }
  }
}
