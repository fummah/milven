import { Router } from 'express';
import dotenv from 'dotenv';
import sgMail from '@sendgrid/mail';

dotenv.config();

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export function testRouter(prisma) {
  const router = Router();

  // Public: get FAQ for header / explore (no auth)
  router.get('/test', async (_req, res) => {
    try {
          const msg = {
    to: 'fummah3@gmail.com',
    from: process.env.EMAIL_FROM,
    subject: 'Test Email from Node.js',
    text: 'Hello from SendGrid!',
    html: '<strong>Hello from SendGrid!</strong>',
  };
  console.log(msg);
  
    await sgMail.send(msg);
    console.log('Email sent successfully');
    return { success: true };
  } catch (error) {
    console.error(error.response?.body || error.message);
    return { success: false, error };
  }
  });

  return router;
}
