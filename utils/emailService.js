const nodemailer = require('nodemailer');

// Create appropriate transporter based on environment mode
const createTransporter = async () => {
  // Check if we're in test mode
  if (process.env.EMAIL_MODE === 'test') {
    console.log('Using Ethereal for test emails...');
    try {
      // Create a test account at Ethereal
      const testAccount = await nodemailer.createTestAccount();
      console.log('Test email account created:', testAccount.user);
      
      // Return a transporter that uses Ethereal
      return nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
    } catch (error) {
      console.error('Failed to create test email account:', error);
      return null;
    }
  } else {
    // Production mode - use actual SMTP credentials
    console.log('Using production email settings with:', process.env.EMAIL_USER);
      // For Gmail, special setup
    if (process.env.EMAIL_HOST.includes('gmail')) {
      return nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD
        },
        tls: { 
          rejectUnauthorized: false // Fix for self-signed certificate issues
        },
        connectionTimeout: 5000, // 5 seconds
        greetingTimeout: 5000,   // 5 seconds
        socketTimeout: 5000      // 5 seconds
      });
    } else {      // Generic SMTP setup
      return nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT),
        secure: process.env.EMAIL_SECURE === 'true',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD
        },
        tls: { 
          rejectUnauthorized: false // Fix for self-signed certificate issues
        }
      });
    }
  }
};

// Send reservation confirmation email
const sendReservationConfirmation = async (reservation) => {
  try {
    console.log(`Preparing to send email to ${reservation.email}...`);
    const emailTransporter = await createTransporter();
    
    if (!emailTransporter) {
      console.error('Email transporter creation failed');
      return false;
    }
    
    // Format the date and time for email
    const formattedDate = new Date(reservation.date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    // Convert time to readable format (assuming time is in format like "14:00:00")
    const timeParts = reservation.time.split(':');
    const hours = parseInt(timeParts[0]);
    const minutes = timeParts[1];
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12;
    const formattedTime = `${formattedHours}:${minutes} ${ampm}`;
    
    // Email content
    const mailOptions = {
      from: `"Suite Coaching" <${process.env.EMAIL_USER}>`,
      to: reservation.email,
      subject: '🏆 Your Coaching Session is Confirmed!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h1 style="color: #00E5FF;">Your Coaching Session is Confirmed!</h1>
          </div>
          
          <p>Hello <strong>${reservation.full_name}</strong>,</p>
          
          <p>Great news! Your coaching session has been successfully booked. Here are the details:</p>
          
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Coach:</strong> ${reservation.coach_name}</p>
            <p><strong>Date:</strong> ${formattedDate}</p>
            <p><strong>Time:</strong> ${formattedTime}</p>
            <p><strong>Points Used:</strong> 1</p>
            <p><strong>Remaining Points:</strong> ${reservation.remaining_points}</p>
          </div>
          
          <p>Please arrive 5 minutes before your scheduled time. If you need to reschedule or cancel, please contact us at least 24 hours in advance.</p>
          
          <p>Looking forward to helping you achieve your goals!</p>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #777;">
            <p>If you have any questions, please reply to this email or call us at +1-234-567-8900.</p>
            <p>Suite Coaching<br>123 Fitness Street, Health City</p>
          </div>
        </div>
      `
    };
    
    console.log(`Sending email to ${reservation.email} with subject: ${mailOptions.subject}`);
    
    // Send the email
    const info = await emailTransporter.sendMail(mailOptions);
    
    // Check if the email was sent successfully
    if (info.messageId) {
      console.log('Email sent successfully:', info.messageId);
      
      // If using ethereal email, log the preview URL
      if (info.previewURL) {
        console.log('Preview URL:', info.previewURL);
      }
      
      return true;
    } else {
      console.error('Failed to send email - no messageId returned');
      return false;
    }  } catch (error) {
    console.error('Error sending email:', error);
    // Add more detailed logging for SSL/TLS errors
    if (error.code === 'ESOCKET' || error.code === 'ECONNECTION' || error.message.includes('certificate')) {
      console.error('SSL/TLS Certificate Error Details:', {
        code: error.code,
        command: error.command,
        message: error.message
      });
    }
    return false;
  }
};

// Send coach notification when a booking is made
const sendCoachNotification = async (reservation, coachEmail) => {
  try {
    console.log(`Preparing to send coach notification email to ${coachEmail}...`);
    const emailTransporter = await createTransporter();
    
    if (!emailTransporter) {
      console.error('Email transporter creation failed for coach notification');
      return false;
    }
    
    // Format the date and time for email
    const formattedDate = new Date(reservation.date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    // Convert time to readable format
    const timeParts = reservation.time.split(':');
    const hours = parseInt(timeParts[0]);
    const minutes = timeParts[1];
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12;
    const formattedTime = `${formattedHours}:${minutes} ${ampm}`;
    
    // Email content
    const mailOptions = {
      from: `"Suite Coaching System" <${process.env.EMAIL_USER}>`,
      to: coachEmail,
      subject: '🔔 New Coaching Session Booked',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h1 style="color: #00E5FF;">New Session Booked</h1>
          </div>
          
          <p>Hello <strong>${reservation.coach_name}</strong>,</p>

          <p>A new coaching session has been booked with you:</p>
          
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Client:</strong> ${reservation.full_name}</p>
            <p><strong>Client Email:</strong> ${reservation.email}</p>
            <p><strong>Date:</strong> ${formattedDate}</p>
            <p><strong>Time:</strong> ${formattedTime}</p>
          </div>
          
          <p>Please make a note of this appointment in your calendar. If you need to reschedule, please contact the client directly.</p>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #777;">
            <p>This is an automated message from the Suite Coaching booking system.</p>
          </div>
        </div>
      `
    };
    
    console.log(`Sending coach notification to ${coachEmail}`);
    
    // Send the email
    const info = await emailTransporter.sendMail(mailOptions);
    
    // Check if the email was sent successfully
    if (info.messageId) {
      console.log('Coach notification email sent successfully:', info.messageId);
      
      // If using ethereal email, log the preview URL
      if (info.previewURL) {
        console.log('Preview URL:', info.previewURL);
      }
      
      return true;
    } else {
      console.error('Failed to send coach notification email - no messageId returned');
      return false;
    }} catch (error) {
    console.error('Error sending admin notification email:', error);
    // Add more detailed logging for SSL/TLS errors
    if (error.code === 'ESOCKET' || error.code === 'ECONNECTION' || error.message.includes('certificate')) {
      console.error('SSL/TLS Certificate Error Details:', {
        code: error.code,
        command: error.command,
        message: error.message
      });
    }
    return false;
  }
};

module.exports = {
  sendReservationConfirmation,
  sendCoachNotification
};
