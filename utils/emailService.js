const nodemailer = require('nodemailer');

const getEmailUrl = () => {
  const configuredUrl = process.env.EMAIL_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
  return configuredUrl.split(',')[0].trim().replace(/\/+$/, '');
};

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }

  async sendEmail(to, subject, html, attachments = []) {
    try {
      const mailOptions = {
        // Use a display name to mask the actual email
        from: {
          name: process.env.EMAIL_FROM_NAME || 'Mineazy Online Shop',
          address: process.env.EMAIL_FROM || process.env.EMAIL_USER
        },
        to,
        subject,
        html,
        attachments,
        // Optional: Add reply-to if you want replies to go to a different address
        replyTo: process.env.EMAIL_REPLY_TO || process.env.EMAIL_FROM || process.env.EMAIL_USER
      };

      const result = await this.transporter.sendMail(mailOptions);
      return result;
    } catch (error) {
      console.error('Email sending failed:', error);
      throw error;
    }
  }

  async sendOrderConfirmation(order, attachments = []) {
    const subject = `Order Confirmation - ${order.orderNumber}`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8">
        
        <title>Order Confirmation</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f5f5f5;">
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #28378a 0%, #1e2870 100%); color: white; padding: 40px 30px; text-align: center;">
            <h1 style="margin: 0; font-size: 36px; color: #f6f451; letter-spacing: -1px;">MINEAZY</h1>
            <p style="margin: 10px 0 0 0; font-size: 14px; color: rgba(255, 255, 255, 0.9);">Mining Equipment & Solutions</p>
          </div>

          <!-- Main Content -->
          <div style="padding: 40px 30px;">
            <h2 style="color: #28378a; margin-top: 0;">Thank You for Your Order! ≡ƒÄë</h2>
            <p style="color: #5a6c7d; line-height: 1.6;">Dear ${order.customerInfo.firstName},</p>
            <p style="color: #5a6c7d; line-height: 1.6;">Your order has been successfully placed and is being processed. We'll notify you once your items are ready for shipment.</p>
            ${attachments.length > 0 ? `
              <div style="background-color: #e7f3ff; padding: 14px 16px; border-left: 4px solid #28378a; border-radius: 8px; margin: 16px 0 24px 0;">
                <p style="margin: 0; color: #1e3a8a; font-weight: 600;">Your invoice is attached to this email.</p>
              </div>
            ` : ''}
            
            <!-- Order Details Box -->
            <div style="background-color: #f8f9fa; padding: 25px; border-radius: 8px; border-left: 4px solid #f6f451; margin: 30px 0;">
              <h3 style="color: #28378a; margin-top: 0; font-size: 16px; text-transform: uppercase; letter-spacing: 1px;">Order Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #5a6c7d; font-weight: 600;">Order Number:</td>
                  <td style="padding: 8px 0; color: #28378a; font-weight: 700; text-align: right;">${order.orderNumber}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #5a6c7d; font-weight: 600;">Order Date:</td>
                  <td style="padding: 8px 0; color: #2c3e50; text-align: right;">${new Date(order.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #5a6c7d; font-weight: 600;">Payment Method:</td>
                  <td style="padding: 8px 0; color: #2c3e50; text-align: right; text-transform: capitalize;">${order.paymentMethod.replace(/_/g, ' ')}</td>
                </tr>
                <tr style="border-top: 2px solid #dee2e6;">
                  <td style="padding: 12px 0 0 0; color: #28378a; font-weight: 700; font-size: 16px;">Total Amount:</td>
                  <td style="padding: 12px 0 0 0; color: #28378a; font-weight: 700; font-size: 18px; text-align: right;">$${order.total.toFixed(2)}</td>
                </tr>
              </table>
            </div>
            
            <!-- Items Ordered -->
            <h3 style="color: #28378a; margin-bottom: 15px;">Items Ordered</h3>
            <table style="width: 100%; border-collapse: separate; border-spacing: 0; margin: 20px 0; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
              <thead>
                <tr style="background: linear-gradient(135deg, #28378a 0%, #1e2870 100%);">
                  <th style="padding: 12px; text-align: left; color: white; font-weight: 600; font-size: 12px; text-transform: uppercase;">Item</th>
                  <th style="padding: 12px; text-align: center; color: white; font-weight: 600; font-size: 12px; text-transform: uppercase;">Qty</th>
                  <th style="padding: 12px; text-align: right; color: white; font-weight: 600; font-size: 12px; text-transform: uppercase;">Price</th>
                </tr>
              </thead>
              <tbody>
                ${order.items.map((item, index) => `
                  <tr style="background-color: ${index % 2 === 0 ? '#ffffff' : '#f8f9fa'};">
                    <td style="padding: 12px; border-bottom: 1px solid #e9ecef; color: #2c3e50;">${item.name}</td>
                    <td style="padding: 12px; text-align: center; border-bottom: 1px solid #e9ecef; color: #28378a; font-weight: 600;">${item.quantity}</td>
                    <td style="padding: 12px; text-align: right; border-bottom: 1px solid #e9ecef; color: #2c3e50; font-weight: 500;">$${item.price.toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            <!-- Order Summary -->
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 30px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #5a6c7d;">Subtotal:</td>
                  <td style="padding: 8px 0; text-align: right; color: #2c3e50; font-weight: 500;">$${order.subtotal.toFixed(2)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #5a6c7d;">Tax (VAT 15.5%):</td>
                  <td style="padding: 8px 0; text-align: right; color: #2c3e50; font-weight: 500;">$${order.tax.toFixed(2)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #5a6c7d;">Shipping:</td>
                  <td style="padding: 8px 0; text-align: right; color: #22c55e; font-weight: 600;">Free</td>
                </tr>
                <tr style="border-top: 2px solid #dee2e6;">
                  <td style="padding: 12px 0 0 0; color: #28378a; font-weight: 700; font-size: 16px;">Total:</td>
                  <td style="padding: 12px 0 0 0; text-align: right; color: #28378a; font-weight: 700; font-size: 18px;">$${order.total.toFixed(2)}</td>
                </tr>
              </table>
            </div>

            <!-- Shipping Address -->
            <div style="background-color: #fff9e6; padding: 20px; border-radius: 8px; border-left: 4px solid #f6f451; margin: 30px 0;">
              <h3 style="color: #28378a; margin-top: 0; font-size: 14px; text-transform: uppercase;">≡ƒôì Shipping Address</h3>
              <p style="color: #5a6c7d; line-height: 1.8; margin: 10px 0 0 0;">
                ${order.customerInfo.firstName} ${order.customerInfo.lastName}<br>
                ${order.customerInfo.address.street}<br>
                ${order.customerInfo.address.city}${order.customerInfo.address.state ? ', ' + order.customerInfo.address.state : ''} ${order.customerInfo.address.zipCode || ''}<br>
                ${order.customerInfo.address.country}
              </p>
            </div>
            
            <!-- Track Order Box -->
            <div style="background-color: #e7f3ff; padding: 20px; border-radius: 8px; border-left: 4px solid #28378a; margin: 30px 0;">
              <h3 style="color: #28378a; margin-top: 0; font-size: 14px;">≡ƒôª Track Your Order</h3>
              <p style="color: #5a6c7d; line-height: 1.6; margin: 10px 0 0 0;">
                You can track your order status using:<br>
                <strong style="color: #28378a;">Order Number:</strong> ${order.orderNumber}
                ${!order.user ? `<br><strong style="color: #28378a;">Email:</strong> ${order.customerInfo.email}` : ''}
              </p>
            </div>
          </div>

          <!-- Footer -->
          <div style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 4px solid #28378a;">
            <h3 style="color: #28378a; margin: 0 0 15px 0;">Need Help?</h3>
            <p style="color: #5a6c7d; margin: 10px 0; font-size: 14px;">
              ≡ƒô₧ <a href="tel:+263712290046" style="color: #28378a; text-decoration: none;">+263 712 290 046</a><br>
              Γ£ë∩╕Å <a href="mailto:info@mineazy.co.zw" style="color: #28378a; text-decoration: none;">info@mineazy.co.zw</a><br>
              ≡ƒîÉ <a href="https://www.mineazy.co.zw" style="color: #28378a; text-decoration: none;">www.mineazy.co.zw</a>
            </p>
            <div style="margin-top: 25px; padding-top: 25px; border-top: 1px solid #dee2e6;">
              <p style="color: #95a5a6; font-size: 12px; margin: 0;">
                ┬⌐ ${new Date().getFullYear()} MINEAZY. All rights reserved.<br>
                Your Trusted Partner in Mining Equipment
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail(order.customerInfo.email, subject, html, attachments);
  }

  async sendInvoice(order, pdfBuffer) {
    const subject = `Invoice - ${order.orderNumber}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #007bff;">Invoice for Order ${order.orderNumber}</h2>
        <p>Dear ${order.customerInfo.firstName},</p>
        <p>Please find attached the invoice for your recent order.</p>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #333; margin-top: 0;">Order Summary:</h3>
          <p><strong>Order Number:</strong> ${order.orderNumber}</p>
          <p><strong>Order Date:</strong> ${new Date(order.createdAt).toLocaleDateString()}</p>
          <p><strong>Total Amount:</strong> $${order.total.toFixed(2)}</p>
          <p><strong>Payment Status:</strong> ${order.paymentStatus.replace('_', ' ')}</p>
        </div>

        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          Thank you for your business!<br>
          If you have any questions about this invoice, please contact us at accounts@mineazy.co.zw
        </p>
      </div>
    `;

    const attachments = [{
      filename: `invoice-${order.orderNumber}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf'
    }];

    return this.sendEmail(order.customerInfo.email, subject, html, attachments);
  }

  async sendPasswordResetEmail(user, resetToken) {
    const subject = 'Password Reset Request - MineAzy Shop';
    const resetUrl = `${getEmailUrl()}/reset-password/${encodeURIComponent(resetToken)}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc3545;">Password Reset Request</h2>
        <p>Hello ${user.firstName},</p>
        <p>You requested a password reset for your MineAzy Shop account.</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" 
             target="_blank"
             rel="noopener noreferrer"
             style="background-color: #dc3545; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
            Reset Password
          </a>
        </div>
        
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="word-break: break-all;"><a href="${resetUrl}" target="_blank" rel="noopener noreferrer" style="color: #007bff;">${resetUrl}</a></p>
        
        <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; border-left: 4px solid #ffc107; margin: 20px 0;">
          <p><strong>Important:</strong> This link will expire in 10 minutes.</p>
          <p>If you didn't request this password reset, please ignore this email.</p>
        </div>
        
        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          Best regards,<br>
          MineAzy Shop Team
        </p>
      </div>
    `;
    return this.sendEmail(user.email, subject, html);
  }

  async sendOrderStatusUpdate(order, newStatus, message = '') {
    const statusMessages = {
      processing: 'Your order is being processed',
      shipped: 'Your order has been shipped',
      delivered: 'Your order has been delivered',
      cancelled: 'Your order has been cancelled'
    };

    const subject = `Order Update - ${order.orderNumber}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #007bff;">Order Status Update</h2>
        <p>Dear ${order.customerInfo.firstName},</p>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <p>Your order <strong>${order.orderNumber}</strong> status has been updated to:</p>
          <h3 style="color: #28a745; margin: 10px 0;">${newStatus.toUpperCase()}</h3>
          <p>${message || statusMessages[newStatus] || 'Your order status has been updated.'}</p>
        </div>

        ${order.trackingNumber ? `
          <div style="background-color: #e7f3ff; padding: 15px; border-radius: 5px; border-left: 4px solid #007bff; margin: 20px 0;">
            <p><strong>Tracking Number:</strong> ${order.trackingNumber}</p>
          </div>
        ` : ''}
        
        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          Thank you for your business!<br>
          MineAzy Shop Team
        </p>
      </div>
    `;

    return this.sendEmail(order.customerInfo.email, subject, html);
  }

  async sendWelcomeEmail(user, verificationToken) {
    const subject = 'Welcome to MineAzy Shop!';
    const verificationUrl = `${getEmailUrl()}/verify-email/${encodeURIComponent(verificationToken)}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #007bff;">Welcome to MineAzy Shop!</h2>
        <p>Hello ${user.firstName},</p>
        <p>Thank you for creating an account with us. We're excited to have you as part of our community!</p>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #333; margin-top: 0;">Get Started:</h3>
          <p>To complete your registration, please verify your email address by clicking the button below:</p>
          
          <div style="text-align: center; margin: 20px 0;">
            <a href="${verificationUrl}" 
               target="_blank"
               rel="noopener noreferrer"
               style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
              Verify Email Address
            </a>
          </div>
        </div>
        
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="word-break: break-all;"><a href="${verificationUrl}" target="_blank" rel="noopener noreferrer" style="color: #007bff;">${verificationUrl}</a></p>
        
        <div style="background-color: #e7f3ff; padding: 15px; border-radius: 5px; border-left: 4px solid #007bff; margin: 20px 0;">
          <p><strong>What's next?</strong></p>
          <ul style="margin: 10px 0; padding-left: 20px;">
            <li>Browse our extensive catalog of mining equipment</li>
            <li>Add items to your cart and checkout securely</li>
            <li>Track your orders in real-time</li>
            <li>Request quotes for bulk orders</li>
          </ul>
        </div>
        
        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          If you have any questions, don't hesitate to contact our support team at support@mineazy.co.zw<br><br>
          Welcome aboard!<br>
          The MineAzy Shop Team
        </p>
      </div>
    `;

    return this.sendEmail(user.email, subject, html);
  }

  async testConnection() {
    try {
      await this.transporter.verify();
      return { success: true, message: 'Email service connection successful' };
    } catch (error) {
      console.error('Email service connection failed:', error);
      return { success: false, message: error.message };
    }
  }
}

module.exports = new EmailService();
