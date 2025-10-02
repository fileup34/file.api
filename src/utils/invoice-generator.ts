import axios from "axios";
import jsPDF from "jspdf";

const logoUrl = "https://file.energy/uploads/images/ba94967ee3101aa4bd41ffcc4b447d06d6803419.png";

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

// Hardcoded company details
export const companyDetails = {
    name: "BRAINBOP LTD",
    address: "50 Gilbert Road, Smethwick, England, B66 4PY",
    email: "support@file.energy",
    year: "2024"
  };

export interface InvoiceData {
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
  
export class InvoiceGenerator {
    private data: InvoiceData;
    private doc: jsPDF;
  
    constructor(data: InvoiceData) {
      this.data = data;
      this.doc = new jsPDF();
    }
  
    private getCurrencySymbol(currency: string): string {
      return currencySymbols[currency] || currency;
    }
  
    private formatPrice(amount: number, currency: string): string {
      const symbol = this.getCurrencySymbol(currency);
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
  
    private addText(text: string, x: number, y: number, options: any = {}) {
      const { fontSize = 12, fontStyle = 'normal', align = 'left' } = options;
      this.doc.setFontSize(fontSize);
      this.doc.setFont('helvetica', fontStyle);
      this.doc.text(text, x, y, { align });
    }
  
    private addLine(x1: number, y1: number, x2: number, y2: number) {
      this.doc.line(x1, y1, x2, y2);
    }
  
    async generate(): Promise<Buffer> {
      // Add company logo
      try {
        const response = await axios.get(logoUrl, { responseType: 'arraybuffer' });
        const logoBuffer = Buffer.from(response.data);
        const logoBase64 = logoBuffer.toString('base64');
        this.doc.addImage(logoBase64, 'PNG', 10, 10, 50, 25);
      } catch (error) {
        console.error('Error loading logo:', error);
      }
  
      // Add invoice details
      this.addText(`Invoice #${this.data.invoiceNumber}`, 180, 15, { fontSize: 16, fontStyle: 'bold', align: 'right' });
      this.addText(`Date: ${this.data.date}`, 180, 22, { fontSize: 16, fontStyle: 'bold', align: 'right' });
      this.addText(`Status: ${this.data.status}`, 180, 29, { fontSize: 16, fontStyle: 'bold', align: 'right' });
  
      // Add customer details
      this.addText('Bill To:', 10, 50, { fontStyle: 'bold' });
      this.addText(this.data.customerName, 10, 57);
      this.addText(this.data.customerEmail, 10, 64);
      this.addText(this.data.customerAddress, 10, 71);
  
      // Add company details
      this.addText('From:', 110, 50, { fontStyle: 'bold' });
      this.addText(companyDetails.name, 110, 57);
      this.addText(companyDetails.address, 110, 64);
      this.addText(companyDetails.email, 110, 71);
  
      // Add invoice items
      this.addText('Description', 10, 100, { fontStyle: 'bold' });
      this.addText('Price', 150, 100, { fontStyle: 'bold' });
  
      this.addLine(10, 105, 200, 105);
  
      this.addText(this.data.planName, 10, 115);
      this.addText(this.formatPrice(this.data.amount, this.data.currency), 150, 115);
  
      this.addLine(10, 120, 200, 120);
  
      // Add total
      this.addText('Total:', 100, 130, { fontStyle: 'bold' });
      this.addText(this.formatPrice(this.data.amount, this.data.currency), 150, 130, { fontStyle: 'bold' });
  
      // Add footer
      this.addText(`© ${companyDetails.year} File.energy | ${companyDetails.name}`, 110, 280, { fontSize: 10, align: 'center' });
  
      return Buffer.from(this.doc.output('arraybuffer'));
    }
  }