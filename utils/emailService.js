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
    const formattedDate = new Date(reservation.date).toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Africa/Casablanca' // Use Morocco timezone
    });
    
    // Convert time to readable format (assuming time is in format like "14:00:00")
    const timeParts = reservation.time.split(':');
    const hours = parseInt(timeParts[0]);
    const minutes = timeParts[1];
    
    // Format time using Morocco standards (24-hour format)
    const formattedTime = `${hours}:${minutes}`;
    
    // Email content
    const mailOptions = {
      from: `"Suite Coaching" <${process.env.EMAIL_USER}>`,
      to: reservation.email,
      subject: '🏆 Votre séance de coaching est confirmée !',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h1 style="color: #00E5FF;">Votre séance de coaching est confirmée !</h1>
          </div>
          
          <p>Bonjour <strong>${reservation.full_name}</strong>,</p>
          
          <p>Excellente nouvelle ! Votre séance de coaching a été réservée avec succès. Voici les détails :</p>
          
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Coach :</strong> ${reservation.coach_name}</p>
            <p><strong>Date :</strong> ${formattedDate}</p>
            <p><strong>Heure :</strong> ${formattedTime}</p>
            <p><strong>Points utilisés :</strong> 1</p>
            <p><strong>Points restants :</strong> ${reservation.remaining_points}</p>
          </div>
          
          <p>Veuillez arriver 5 minutes avant l'heure prévue. Si vous devez reporter ou annuler, veuillez nous contacter au moins 6 heures à l'avance.</p>
          
          <p>Nous avons hâte de vous aider à atteindre vos objectifs !</p>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #777;">
            <p>Si vous avez des questions, veuillez répondre à cet email ou appelez-nous au +212 660-505652.</p>
            <p>Suite Coaching<br>Lotissement Florida, Bureau N°39, Etage N°5, Imm. Corner Office, Lot 5 Bd Zoulikha Nasri, Casablanca 20000</p>
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
    const formattedDate = new Date(reservation.date).toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Africa/Casablanca' // Use Morocco timezone
    });
    
    // Convert time to readable format
    const timeParts = reservation.time.split(':');
    const hours = parseInt(timeParts[0]);
    const minutes = timeParts[1];
    
    // Format time using Morocco standards (24-hour format)
    const formattedTime = `${hours}:${minutes}`;
    
    // Email content
    const mailOptions = {
      from: `"Système Suite Coaching" <${process.env.EMAIL_USER}>`,
      to: coachEmail,
      subject: '🔔 Nouvelle séance de coaching réservée',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h1 style="color: #00E5FF;">Nouvelle séance réservée</h1>
          </div>
          
          <p>Bonjour <strong>${reservation.coach_name}</strong>,</p>

          <p>Une nouvelle séance de coaching a été réservée avec vous :</p>
          
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Client :</strong> ${reservation.full_name}</p>
            <p><strong>Email du client :</strong> ${reservation.email}</p>
            <p><strong>Date :</strong> ${formattedDate}</p>
            <p><strong>Heure :</strong> ${formattedTime}</p>
          </div>
          
          <p>Veuillez noter ce rendez-vous dans votre calendrier. Si vous devez reporter, veuillez contacter le client directement.</p>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #777;">
            <p>Ceci est un message automatique du système de réservation Suite Coaching.</p>
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

// Send bulk reservation confirmation email
const sendBulkReservationConfirmation = async (bulkData) => {
  try {
    console.log(`Preparing to send bulk reservation email to ${bulkData.clientEmail}...`);
    const emailTransporter = await createTransporter();
    
    if (!emailTransporter) {
      console.error('Email transporter creation failed');
      return false;
    }
    
    // Format the date range
    const startDate = new Date(bulkData.startDate).toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Africa/Casablanca'
    });
    
    const endDate = new Date(bulkData.endDate).toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Africa/Casablanca'
    });
    
    // Format time
    const timeParts = bulkData.timeSlot.split(':');
    const hours = parseInt(timeParts[0]);
    const minutes = timeParts[1];
    const formattedTime = `${hours}:${minutes}`;
    
    // Convert days of week to French
    const dayNames = {
      0: 'Dimanche',
      1: 'Lundi', 
      2: 'Mardi',
      3: 'Mercredi',
      4: 'Jeudi',
      5: 'Vendredi',
      6: 'Samedi'
    };
    
    const selectedDaysText = bulkData.daysOfWeek.map(day => dayNames[day]).join(', ');
    
    // Create reservation list
    let reservationsList = '';
    bulkData.reservations.forEach(reservation => {
      const reservationDate = new Date(reservation.date).toLocaleDateString('fr-FR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long', 
        day: 'numeric',
        timeZone: 'Africa/Casablanca'
      });
      
      reservationsList += `
        <tr style="border-bottom: 1px solid #e0e0e0;">
          <td style="padding: 8px;">${reservationDate}</td>
          <td style="padding: 8px;">${formattedTime}</td>
          <td style="padding: 8px;">✅ Confirmée</td>
        </tr>
      `;
    });
    
    // Email content
    const mailOptions = {
      from: `"Suite Coaching" <${process.env.EMAIL_USER}>`,
      to: bulkData.clientEmail,
      subject: '🏆 Vos séances de coaching récurrentes sont confirmées !',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h1 style="color: #00E5FF;">Vos séances de coaching récurrentes sont confirmées !</h1>
          </div>
          
          <p>Bonjour <strong>${bulkData.clientName}</strong>,</p>
          
          <p>Excellente nouvelle ! Vos séances de coaching récurrentes ont été réservées avec succès.</p>
          
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="color: #007bff; margin-top: 0;">📅 Détails de vos réservations récurrentes</h3>
            <p><strong>Coach :</strong> ${bulkData.coachName}</p>
            <p><strong>Période :</strong> Du ${startDate} au ${endDate}</p>
            <p><strong>Jours :</strong> ${selectedDaysText}</p>
            <p><strong>Heure :</strong> ${formattedTime}</p>
            <p><strong>Nombre de séances créées :</strong> ${bulkData.reservations.length}</p>
            <p><strong>Points utilisés :</strong> ${bulkData.reservations.length}</p>
            <p><strong>Points restants :</strong> ${bulkData.remainingPoints}</p>
          </div>
          
          <div style="margin: 20px 0;">
            <h3 style="color: #007bff;">📋 Liste détaillée de vos séances</h3>
            <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
              <thead>
                <tr style="background-color: #007bff; color: white;">
                  <th style="padding: 10px; text-align: left;">Date</th>
                  <th style="padding: 10px; text-align: left;">Heure</th>
                  <th style="padding: 10px; text-align: left;">Statut</th>
                </tr>
              </thead>
              <tbody>
                ${reservationsList}
              </tbody>
            </table>
          </div>
          
          <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ffc107;">
            <h4 style="color: #856404; margin-top: 0;">📝 Informations importantes</h4>
            <ul style="color: #856404;">
              <li>Veuillez arriver 5 minutes avant l'heure prévue pour chaque séance</li>
              <li>Pour annuler ou reporter une séance, contactez-nous au moins 6 heures à l'avance</li>
              <li>Chaque séance annulée dans les délais vous permettra de récupérer 1 point</li>
              <li>En cas d'absence non justifiée, le point sera décompté</li>
            </ul>
          </div>
          
          <p>Nous avons hâte de vous accompagner dans l'atteinte de vos objectifs de fitness !</p>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #777;">
            <p>Si vous avez des questions, veuillez répondre à cet email ou appelez-nous au +212 660-505652.</p>
            <p>Suite Coaching<br>Lotissement Florida, Bureau N°39, Etage N°5, Imm. Corner Office, Lot 5 Bd Zoulikha Nasri, Casablanca 20000</p>
          </div>
        </div>
      `
    };
    
    console.log(`Sending bulk reservation email to ${bulkData.clientEmail}`);
    
    // Send the email
    const info = await emailTransporter.sendMail(mailOptions);
    
    if (info.messageId) {
      console.log('Bulk reservation email sent successfully:', info.messageId);
      if (info.previewURL) {
        console.log('Preview URL:', info.previewURL);
      }
      return true;
    } else {
      console.error('Failed to send bulk reservation email - no messageId returned');
      return false;
    }
  } catch (error) {
    console.error('Error sending bulk reservation email:', error);
    return false;
  }
};

// Send bulk reservation notification to coach
const sendBulkCoachNotification = async (bulkData) => {
  try {
    console.log(`Preparing to send bulk coach notification email to ${bulkData.coachEmail}...`);
    const emailTransporter = await createTransporter();
    
    if (!emailTransporter) {
      console.error('Email transporter creation failed for bulk coach notification');
      return false;
    }
    
    // Format the date range
    const startDate = new Date(bulkData.startDate).toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Africa/Casablanca'
    });
    
    const endDate = new Date(bulkData.endDate).toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Africa/Casablanca'
    });
    
    // Format time
    const timeParts = bulkData.timeSlot.split(':');
    const hours = parseInt(timeParts[0]);
    const minutes = timeParts[1];
    const formattedTime = `${hours}:${minutes}`;
    
    // Convert days of week to French
    const dayNames = {
      0: 'Dimanche',
      1: 'Lundi', 
      2: 'Mardi',
      3: 'Mercredi',
      4: 'Jeudi',
      5: 'Vendredi',
      6: 'Samedi'
    };
    
    const selectedDaysText = bulkData.daysOfWeek.map(day => dayNames[day]).join(', ');
    
    // Create reservation list
    let reservationsList = '';
    bulkData.reservations.forEach(reservation => {
      const reservationDate = new Date(reservation.date).toLocaleDateString('fr-FR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long', 
        day: 'numeric',
        timeZone: 'Africa/Casablanca'
      });
      
      reservationsList += `
        <tr style="border-bottom: 1px solid #e0e0e0;">
          <td style="padding: 8px;">${reservationDate}</td>
          <td style="padding: 8px;">${formattedTime}</td>
          <td style="padding: 8px;">✅ Confirmée</td>
        </tr>
      `;
    });
    
    // Email content
    const mailOptions = {
      from: `"Système Suite Coaching" <${process.env.EMAIL_USER}>`,
      to: bulkData.coachEmail,
      subject: '🔔 Nouvelles séances récurrentes réservées',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h1 style="color: #00E5FF;">Nouvelles séances récurrentes réservées</h1>
          </div>
          
          <p>Bonjour <strong>${bulkData.coachName}</strong>,</p>

          <p>De nouvelles séances de coaching récurrentes ont été réservées avec vous :</p>
          
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="color: #007bff; margin-top: 0;">📅 Détails des réservations récurrentes</h3>
            <p><strong>Client :</strong> ${bulkData.clientName}</p>
            <p><strong>Email du client :</strong> ${bulkData.clientEmail}</p>
            <p><strong>Période :</strong> Du ${startDate} au ${endDate}</p>
            <p><strong>Jours :</strong> ${selectedDaysText}</p>
            <p><strong>Heure :</strong> ${formattedTime}</p>
            <p><strong>Nombre de séances créées :</strong> ${bulkData.reservations.length}</p>
          </div>
          
          <div style="margin: 20px 0;">
            <h3 style="color: #007bff;">📋 Planning détaillé de vos séances</h3>
            <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
              <thead>
                <tr style="background-color: #007bff; color: white;">
                  <th style="padding: 10px; text-align: left;">Date</th>
                  <th style="padding: 10px; text-align: left;">Heure</th>
                  <th style="padding: 10px; text-align: left;">Statut</th>
                </tr>
              </thead>
              <tbody>
                ${reservationsList}
              </tbody>
            </table>
          </div>
          
          <div style="background-color: #d1ecf1; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #bee5eb;">
            <h4 style="color: #0c5460; margin-top: 0;">📝 À noter</h4>
            <ul style="color: #0c5460;">
              <li>Veuillez noter ces rendez-vous dans votre calendrier personnel</li>
              <li>Le client a été informé de l'importance d'arriver 5 minutes en avance</li>
              <li>En cas de changement d'horaire, contactez le client directement</li>
              <li>Si vous devez annuler, prévenez au moins 6 heures à l'avance</li>
            </ul>
          </div>
          
          <p>Bon coaching !</p>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #777;">
            <p>Ceci est un message automatique du système de réservation Suite Coaching.</p>
          </div>
        </div>
      `
    };
    
    console.log(`Sending bulk coach notification to ${bulkData.coachEmail}`);
    
    // Send the email
    const info = await emailTransporter.sendMail(mailOptions);
    
    if (info.messageId) {
      console.log('Bulk coach notification email sent successfully:', info.messageId);
      if (info.previewURL) {
        console.log('Preview URL:', info.previewURL);
      }
      return true;
    } else {
      console.error('Failed to send bulk coach notification email - no messageId returned');
      return false;
    }
  } catch (error) {
    console.error('Error sending bulk coach notification email:', error);
    return false;
  }
};

module.exports = {
  sendReservationConfirmation,
  sendCoachNotification,
  sendBulkReservationConfirmation,
  sendBulkCoachNotification
};
