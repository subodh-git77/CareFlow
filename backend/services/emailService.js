const nodemailer = require('nodemailer');
const NotificationLog = require('../models/NotificationLog');

const smtpConfigured = () => {
  if (process.env.SMTP_ENABLED !== 'true') return false;
  const values = [process.env.SMTP_HOST, process.env.SMTP_USER, process.env.SMTP_PASS];
  return values.every(value => value && !value.startsWith('your_'));
};

const createTransporter = () => nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

const attemptSend = async log => {
  if (log.status === 'SENT') return log;
  log.lastAttemptAt = new Date();

  try {
    if (smtpConfigured()) {
      const transporter = createTransporter();
      await transporter.sendMail({
        from: process.env.SMTP_FROM || 'CareFlow <noreply@careflow.local>',
        to: log.recipientEmail,
        subject: log.subject,
        text: log.body,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#17324d">${log.body.replace(/\n/g, '<br>')}</div>`
      });
    } else {
      console.log(`[Email preview] ${log.type} -> ${log.recipientEmail}: ${log.subject}`);
    }

    log.status = 'SENT';
    log.errorLog = smtpConfigured() ? '' : 'Development preview: SMTP credentials are not configured.';
    await log.save();
  } catch (error) {
    log.retryCount += 1;
    log.errorLog = error.message;
    log.status = log.retryCount >= 3 ? 'FAILED' : 'RETRYING';
    const delays = [5, 15, 60];
    log.nextAttemptAt = new Date(Date.now() + delays[Math.min(log.retryCount - 1, 2)] * 60 * 1000);
    await log.save();
    console.warn(`[Email] Delivery failed for ${log.recipientEmail}; status=${log.status}`);
  }

  return log;
};

const sendEmail = async ({ sendAt = new Date(), ...message }) => {
  try {
    let log;
    try {
      log = await NotificationLog.create({ ...message, sendAt, nextAttemptAt: sendAt });
    } catch (error) {
      if (error.code !== 11000 || !message.dedupeKey) throw error;
      return NotificationLog.findOne({ dedupeKey: message.dedupeKey });
    }

    if (sendAt <= new Date()) return attemptSend(log);
    return log;
  } catch (error) {
    // Email must never make booking, cancellation, or clinical work fail.
    console.warn(`[Email] Could not queue notification: ${error.message}`);
    return null;
  }
};

module.exports = { attemptSend, sendEmail, smtpConfigured };