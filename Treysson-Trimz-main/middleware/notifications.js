require('dotenv').config();
const AfricasTalking = require('africastalking');

const at = AfricasTalking({
  apiKey:   process.env.AT_API_KEY,
  username: process.env.AT_USERNAME,
});

const sms      = at.SMS;
const SENDER   = process.env.AT_SENDER_ID || 'TRIMZ';
const ADMIN_PHONE = process.env.ADMIN_PHONE;

// ── SMS ──────────────────────────────────────────────────────────────────────

async function sendSMS(to, message) {
  try {
    const result = await sms.send({
      to:   Array.isArray(to) ? to : [to],
      message,
      from: SENDER,
    });
    console.log('SMS sent:', JSON.stringify(result));
    return result;
  } catch (err) {
    console.error('SMS error:', err.message);
  }
}

// ── BOOKING NOTIFICATIONS ────────────────────────────────────────────────────

async function notifyBookingCreated(booking) {
  const {
    customer_name, customer_phone, reference_code,
    service_name, booking_date, start_time, price
  } = booking;

  const formattedDate = new Date(booking_date).toLocaleDateString('en-KE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
  const formattedTime = start_time ? start_time.substring(0, 5) : '';

  // ── SMS to Customer ──
  const customerSMS =
`Treysson Trimz Booking Confirmed!
Ref: ${reference_code}
Service: ${service_name}
Date: ${formattedDate}
Time: ${formattedTime}
Amount: KES ${price}
Pay via KCB Paybill 522522
Account: ${reference_code}
Queries: +254118041166`;

  // ── SMS to Admin ──
  const adminSMS =
`NEW BOOKING - Treysson Trimz
Ref: ${reference_code}
Client: ${customer_name}
Phone: ${customer_phone}
Service: ${service_name}
Date: ${formattedDate} ${formattedTime}
Amount: KES ${price}`;

  // Send SMS
  await sendSMS(customer_phone, customerSMS);
  await sendSMS(ADMIN_PHONE, adminSMS);

  // ── WhatsApp to Customer ──
  const customerWA = encodeURIComponent(
`Hello ${customer_name}! 👋

✅ *Booking Confirmed — Treysson Trimz*

📋 *Reference:* ${reference_code}
✂️ *Service:* ${service_name}
📅 *Date:* ${formattedDate}
⏰ *Time:* ${formattedTime}
💰 *Amount:* KES ${price}

*Pay via KCB Paybill:*
- Paybill No: *522522*
- Account No: *${reference_code}*
- Amount: *KES ${price}*

We look forward to seeing you! 🙏
_Treysson Trimz · Utawala-Kinka, Nairobi_`
  );

  // ── WhatsApp to Admin ──
  const adminWA = encodeURIComponent(
`🔔 *NEW BOOKING — Treysson Trimz*

👤 *Client:* ${customer_name}
📞 *Phone:* ${customer_phone}
✂️ *Service:* ${service_name}
📅 *Date:* ${formattedDate}
⏰ *Time:* ${formattedTime}
💰 *Amount:* KES ${price}
📋 *Ref:* ${reference_code}`
  );

  return {
    customerWALink: `https://wa.me/${customer_phone.replace(/\D/g,'')}?text=${customerWA}`,
    adminWALink:    `https://wa.me/${ADMIN_PHONE.replace(/\D/g,'')}?text=${adminWA}`,
  };
}

module.exports = { notifyBookingCreated, sendSMS };