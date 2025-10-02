import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');
    
    if (!email) {
      return new NextResponse(JSON.stringify({ error: 'Missing email' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    // Update the status of the subscription_details entry to 'active'
    const user = await prisma.users.findFirst({
      where: {
        email,
      }
    });
   
  
   return new NextResponse(JSON.stringify({ apiKey: user?.api_key }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });


  
  } catch (error) {
    console.error(error);
    return new NextResponse(JSON.stringify({ error: 'Failed to update subscription status and meta' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}
