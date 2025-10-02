import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import jsPDF from 'jspdf';
import axios from 'axios';
import { InvoiceData, InvoiceGenerator } from '@/utils/invoice-generator';

const prisma = new PrismaClient();





export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const invoiceId = params.id;

    // Fetch invoice data from the database
    const invoice = await prisma.invoices.findUnique({
      where: { invoice_id: invoiceId },
      include: {
        users: true,
        plans: true
      }
    });
    console.log({invoice})
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const invoiceData: InvoiceData = {
      invoiceNumber: invoice.invoice_id,
      date: invoice.created_at?.toLocaleDateString() || '',
      status: invoice.status === 1 ? 'Paid' : 'Unpaid',
      customerName: invoice.users.username,
      customerEmail: invoice.users.email,
      customerAddress: `${invoice.users.addressLine1 || ''}, ${invoice.users.city || ''}, ${invoice.users.country || ''}, ${invoice.users.postcode || ''}`,
      planName: `${invoice.plans.name} - ${invoice.plans.pdfs} PDFs, ${invoice.plans.questions} Questions`,
      amount: invoice.amount,
      currency: invoice.currency || 'EUR' // Use stored currency or default to EUR
    };

    const generator = new InvoiceGenerator(invoiceData);
    const pdfBuffer = await generator.generate();

    const headers = new Headers();
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', `attachment; filename="invoice-${invoiceId}.pdf"`);
    return new Response(pdfBuffer, { headers });

  } catch (error) {
    console.error('Error generating invoice:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}