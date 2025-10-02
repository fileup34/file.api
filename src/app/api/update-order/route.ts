import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import jsPDF from 'jspdf';
import axios from 'axios';
import nodemailer from 'nodemailer';
import { InvoiceGenerator } from '@/utils/invoice-generator';

const prisma = new PrismaClient();

// Currency symbols mapping
const currencySymbols: { [key: string]: string } = {
  USD: "$",
  EUR: "€",
  AUD: "$",
  CAD: "$",
  JPY: "¥",
  SEK: "kr",
  PLN: "zł",
  BGN: "лв",
  DKK: "kr",
  CZK: "Kč",
  HUF: "Ft",
  NZD: "$",
  NOK: "kr",
  GBP: "£",
  AED: "د.إ",
  JOD: "د.أ",
  KWD: "د.ك",
  BHD: "د.ب",
  SAR: "﷼",
  QAR: "﷼",
  OMR: "﷼"
};

function formatPrice(amount: number, currency: string): string {
  const symbol = currencySymbols[currency] || currency;
  // For currencies that are placed after the amount (like kr for SEK, NOK, DKK)
  if (['SEK', 'NOK', 'DKK'].includes(currency)) {
    return `${amount.toFixed(2)} ${symbol}`;
  }
  // For currencies placed before the amount with space (like Arabic currencies)
  else if (['AED', 'JOD', 'KWD', 'BHD', 'SAR', 'QAR', 'OMR'].includes(currency)) {
    return `${symbol} ${amount.toFixed(2)}`;
  }
  // For most currencies placed before the amount
  else {
    return `${symbol}${amount.toFixed(2)}`;
  }
}

// Hardcoded company details
const companyDetails = {
  name: "BRAINBOP LTD",
  address: "50 Gilbert Road, Smethwick, England, B66 4PY",
  email: "support@file.energy",
  year: "2024"
};

// Logo URL
const logoUrl = "https://file.energy/uploads/images/ba94967ee3101aa4bd41ffcc4b447d06d6803419.png";

interface InvoiceData {
  invoiceNumber: string;
  date: string;
  status: string;
  customerName: string;
  customerEmail: string;
  customerAddress: string;
  planName: string;
  amount: number;
  currency: string;
}

// Nodemailer transporter setup
const transporter = nodemailer.createTransport({
  host: "smtp.hostinger.com",
  port: 587,
  secure: false,
  auth: {
    user: "hello@file.energy",
    pass: "fileenerrg123A!"
  }
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const subscriptionId = searchParams.get('subscriptionId');
    const isFile = searchParams.get('isFile');
    
    if (!subscriptionId) {
      return new NextResponse(JSON.stringify({ error: 'Missing subscriptionId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get subscription with currency information
    const subscription = await prisma.subscriptions.update({
      where: { id: parseInt(subscriptionId) },
      data: { status: 1 },
      include: { users: true }
    });

    const plan = await prisma.plans.findFirst({
      where: { id: subscription.plan_id },
    });

    // Create invoice with subscription currency
    const invoice = await prisma.invoices.create({
      data: {
        user_id: subscription.user_id,
        plan_id: subscription.plan_id,
        invoice_id: uuidv4(),
        status: 1,
        paid_at: new Date(),
        payment_gateway: subscription.payment_gateway,
        amount: plan?.price || 0,
        currency: subscription.currency || 'EUR', // Use subscription currency or default to EUR
        created_at: new Date(),
      },
    });

    // Generate invoice PDF with correct currency
    const invoiceData: InvoiceData = {
      invoiceNumber: invoice.invoice_id,
      date: invoice.created_at?.toLocaleDateString() || "",
      status: 'Paid',
      customerName: subscription.users.username,
      customerEmail: subscription.users.email,
      customerAddress: `${subscription.users.addressLine1 || ''}, ${subscription.users.city || ''}, ${subscription.users.country || ''}, ${subscription.users.postcode || ''}`,
      planName: `${plan?.name} - ${plan?.pdfs} PDFs, ${plan?.questions} Questions`,
      amount: invoice.amount,
      currency: invoice.currency || "" // Use the stored currency from invoice
    };

    const generator = new InvoiceGenerator(invoiceData);
    const pdfBuffer = await generator.generate();

    // Send email with invoice
    await transporter.sendMail({
      from: '"File.energy" <hello@file.energy>',
      to: subscription.users.email,
      subject: "Your Invoice from File.energy",
      text: `Thank you for your subscription. Amount paid: ${formatPrice(invoiceData.amount, invoiceData.currency)}. Please find your invoice attached.`,
      html: `
        <p>Thank you for your subscription.</p>
        <p>Amount paid: ${formatPrice(invoiceData.amount, invoiceData.currency)}</p>
        <p>Please find your invoice attached.</p>
        <p>Best regards,<br>File.energy Team</p>
      `,
      attachments: [
        {
          filename: `invoice-${invoice.invoice_id}.pdf`,
          content: pdfBuffer
        }
      ]
    });

    if (isFile === 'true') {
      // Return the PDF file
      const headers = new Headers();
      headers.set('Content-Type', 'application/pdf');
      headers.set('Content-Disposition', `attachment; filename="invoice-${invoice.invoice_id}.pdf"`);
      return new Response(pdfBuffer, { headers });
    } else {
      // Redirect to the specified URL
      const redirectUrl = `https://file.energy/thank-you?t=sub&ref=${subscriptionId}`;
      return new NextResponse(null, {
        status: 302,
        headers: { Location: redirectUrl },
      });
    }
  } catch (error) {
    console.error(error);
    return new NextResponse(JSON.stringify({ error: 'Failed to process request' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}