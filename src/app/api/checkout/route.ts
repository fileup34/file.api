import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import CryptoJS from 'crypto-js';
import { PrismaClient, users as User, plans as Plan, subscriptions as Subscription } from '@prisma/client';

const prisma = new PrismaClient();
const CHECKOUT_URL = 'https://engine.g2pay.io';
const MERCHANT_KEY = 'HS8x02pks0MeagDy1834nJmqq0oj1g3v';
const PASSWORD = 'fde14c51b41450474901efe6ebe3799c';

interface CheckoutRequestBody {
  words: number;
  images: number;
  minutes: number;
  characters: number;
  userEmail: string;
  price: number;
  numberOfPDFs: number;
  numberOfQuestions: number;
  pdfSize: number;
  isFile: boolean;
  currency?: string;
  planName?: string;
  numberOfUsers?: number;
}

interface UserAddress {
  addressLine1: string;
  city: string;
  postcode: string;
  country: string;
}

interface CheckoutRequestData {
  referenceId: string;
  paymentType: string;
  currency: string;
  amount: string;
  returnUrl: string;
  successReturnUrl: string;
  declineReturnUrl: string;
  webhookUrl: string;
}

const SUPPORTED_CURRENCIES = [
  'EUR', 'USD', 'AUD', 'CAD', 'JPY', 'SEK', 'PLN', 'BGN', 
  'DKK', 'CZK', 'HUF', 'NZD', 'NOK', 'GBP', 'AED', 'JOD', 
  'KWD', 'BHD', 'SAR', 'QAR', 'OMR'
] as const;
type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

function isSupportedCurrency(currency: string): currency is SupportedCurrency {
  return SUPPORTED_CURRENCIES.includes(currency as SupportedCurrency);
}

function generateHash(orderNumber: string, amount: string, currency: string, description: string): string {
  const toMd5 = `${orderNumber}${amount}${currency}${description}${PASSWORD}`;
  const md5Hash = CryptoJS.MD5(toMd5.toUpperCase()).toString();
  return CryptoJS.SHA1(md5Hash).toString();
}

async function getUserAddress(userEmail: string): Promise<UserAddress | null> {
  const user = await prisma.users.findFirst({
    where: { email: userEmail }
  });

  if (!user) {
    return null;
  }

  const address: UserAddress = {
    addressLine1: user.addressLine1 || '123 Default Street',
    city: user.city || 'Default City',
    postcode: user.postcode || '00000',
    country: user.country || 'Default Country'
  };

  return address;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body: CheckoutRequestBody = await req.json();

    console.log('Received request data:', body);

    const {
      words,
      images,
      minutes,
      characters,
      userEmail,
      price,
      numberOfPDFs,
      numberOfQuestions,
      pdfSize,
      isFile,
      currency = 'EUR',
      planName = 'Custom Plan',
      numberOfUsers = 1
    } = body;

    // Validate currency
    if (!isSupportedCurrency(currency)) {
      return new NextResponse(
        JSON.stringify({ error: `Unsupported currency. Supported currencies are: ${SUPPORTED_CURRENCIES.join(', ')}` }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    }

    if (
      !Number.isInteger(numberOfPDFs) ||
      !Number.isInteger(numberOfQuestions) ||
      typeof pdfSize !== 'number' ||
      typeof price !== 'number' ||
      typeof userEmail !== 'string'
    ) {
      return new NextResponse(
        JSON.stringify({ error: 'Invalid request format' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    }

    const user = await prisma.users.findFirst({
      where: { email: userEmail }
    });

    if (!user) {
      return new NextResponse(
        JSON.stringify({ error: 'User not found' }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    }

    const userAddress = await getUserAddress(userEmail);

    if (!userAddress) {
      return new NextResponse(
        JSON.stringify({ error: 'Failed to retrieve user address' }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    }

    const newPlan: Plan = await prisma.plans.create({
      data: {
        name: planName,
        description: `${planName} subscription plan`,
        price: price, // Store original price
        features: JSON.stringify({ words, images, minutes, characters }),
        status: false,
        pdfs: numberOfPDFs,
        questions: numberOfQuestions,
        pdf_size: pdfSize,
        billing_cycle: 'one-time',
        created_at: new Date(),
        updated_at: new Date()
      }
    });

    const expiring_at = new Date();
    expiring_at.setFullYear(expiring_at.getFullYear() + 1);
    expiring_at.setDate(expiring_at.getDate() - 1);
    
    const newSubscription: Subscription = await prisma.subscriptions.create({
      data: {
        sub_id: uuidv4(),
        user_id: user.id,
        plan_id: newPlan.id,
        status: 1,
        payment_gateway: 'card',
        pdfs: numberOfPDFs,
        questions: numberOfQuestions,
        pdf_size: pdfSize,
        currency: currency, // Store the currency
        created_at: new Date(),
        updated_at: new Date(),
        expiring_at,
      }
    });

    const orderNumber = `order-${newSubscription.id}`;
    const amount = price.toFixed(2);
    const description = `${planName} Subscription Plan`;

    const hash = generateHash(orderNumber, amount, currency, description);

    const checkoutRequestData: CheckoutRequestData = {
      referenceId: orderNumber,
      paymentType: 'DEPOSIT',
      currency: currency,
      amount: amount,
      returnUrl: `https://file.energy/account/settings/subscription`,
      successReturnUrl: `https://file-energy-api.vercel.app/api/update-order?subscriptionId=${newSubscription.id}&isFile=${isFile}&currency=${currency}`,
      declineReturnUrl: `https://file.energy/account/settings/subscription`,
      webhookUrl: 'https://file.energy/',

    };

    console.log('Checkout request data:', checkoutRequestData);

    const response = await fetch(`${CHECKOUT_URL}/api/v1/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer OEQwn39E2AcnQJmjQMwYvjOTrS3glzGe'
      },
      body: JSON.stringify(checkoutRequestData)
    });

    const checkoutData = await response.json();

    if (!response.ok) {
      console.error('Checkout API error:', checkoutData);
      throw new Error(checkoutData.error_message || 'Failed to create checkout session');
    }

    return new NextResponse(
      JSON.stringify({ url: checkoutData.result.redirectUrl }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (error) {
    console.error('Error processing request:', error);
    return new NextResponse(
      JSON.stringify({ error: 'Failed to process request' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version',
      'Access-Control-Max-Age': '86400'
    }
  });
}