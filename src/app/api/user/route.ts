// pages/api/user.ts

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    console.log('Received request to update user');
    
    const body = await req.json();
    console.log('Request body:', body);

    const { id, username, email, addressLine1, city, postcode, country } = body;

    // Validate required fields
    if (!id) {
      console.log('User ID is missing in the request');
      return new NextResponse(JSON.stringify({ error: 'User ID is required' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    // Build data object dynamically
    const data: any = {};
    if (username !== undefined) data.username = username;
    if (email !== undefined) data.email = email;
    if (addressLine1 !== undefined) data.addressLine1 = addressLine1;
    if (city !== undefined) data.city = city;
    if (postcode !== undefined) data.postcode = postcode;
    if (country !== undefined) data.country = country;

    console.log('Data to update:', data);

    const user = await prisma.users.update({
      where: { id: id.toString() },
      data: data,
    });

    console.log('User updated successfully:', user);

    return new NextResponse(JSON.stringify(data, (key, value) =>
    typeof value === 'bigint'
        ? value.toString()
        : value // return everything else unchanged
), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error:any) {
    console.error('Error occurred:', error);
    if (error.code === 'P2025') {
      return new NextResponse(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    return new NextResponse(JSON.stringify({ error: 'Failed to update user' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}


export async function GET(req: NextRequest) {
    try {
      const { searchParams } = new URL(req.url);
      const id = searchParams.get('id');
  
      if (!id) {
        return new NextResponse(JSON.stringify({ error: 'User ID is required' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        });
      }
  
      const user = await prisma.users.findUnique({
        where: { id: BigInt(id) },
      });
  
      if (!user) {
        return new NextResponse(JSON.stringify({ error: 'User not found' }), {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
          },
        });
      }
  
      return new NextResponse(JSON.stringify(user, (key, value) =>
        typeof value === 'bigint'
          ? value.toString()
          : value // return everything else unchanged
      ), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    } catch (error) {
      console.error('Error occurred:', error);
      return new NextResponse(JSON.stringify({ error: 'Failed to retrieve user' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
  }

  export async function OPTIONS(request: Request) {
    const response = new NextResponse(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version",
        "Access-Control-Max-Age": "86400",
      },
    });
  
    return response;
  }