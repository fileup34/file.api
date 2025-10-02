import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';

const prisma = new PrismaClient();
const openai = new OpenAI();

export const maxDuration = 300;

// Function to handle BigInt serialization
const serializeBigInt = (obj: any) => {
  return JSON.parse(
    JSON.stringify(obj, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    )
  );
};

async function handlePost(req: NextRequest, id: string) {
  const { message } = await req.json();
  console.log(`handlePost: Received message: ${message}, for chat ID: ${id}`);

  try {
    const chat = await prisma.chats.findUnique({ where: { uuid: id } });
    console.log(`handlePost: Fetched chat: ${JSON.stringify(serializeBigInt(chat))}`);
    if (!chat) {
      return NextResponse.json({ message: 'Chat not found' }, { status: 404 });
    }

    if (!chat.thread_id) {
      console.error(`handlePost: Thread ID is null for chat ID: ${id}`);
      return NextResponse.json({ message: 'Thread ID is null' }, { status: 400 });
    }

    if (!chat.assistant_id) {
      console.error(`handlePost: Assistant ID is null for chat ID: ${id}`);
      return NextResponse.json({ message: 'Assistant ID is null' }, { status: 400 });
    }

    const subscription = await prisma.subscriptions.findFirst({
      where: { user_id: chat.user_id, status: 1 },
    });
    console.log(`handlePost: Fetched subscription: ${JSON.stringify(serializeBigInt(subscription))}`);

    if (!subscription || subscription.questions <= 0) {
      console.error(`handlePost: No active subscription found or question limit reached for user ID: ${chat.user_id}`);
      return NextResponse.json({ message: 'No active subscription found or question limit reached' }, { status: 400 });
    }

    const chatHistory = chat.chat_history ? JSON.parse(chat.chat_history) : [];
    chatHistory.push({ type: 'human', content: message });
    console.log(`handlePost: Updated chat history: ${JSON.stringify(chatHistory)}`);

    await openai.beta.threads.messages.create(chat.thread_id, {
      role: 'user',
      content: message,
    });
    console.log(`handlePost: Message sent to OpenAI API for thread ID: ${chat.thread_id}`);

    await prisma.chats.update({
      where: { uuid: id },
      data: { chat_history: JSON.stringify(chatHistory) }
    });
    console.log(`handlePost: Chat history updated in database for chat ID: ${id}`);

    return NextResponse.json({ message: 'Message posted successfully' }, { status: 200 });
  } catch (error) {
    console.error('Internal server error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

async function handleSSE(req: NextRequest, id: string) {
  try {
    console.log(`handleSSE: Starting SSE for chat ID: ${id}`);
    const chat = await prisma.chats.findUnique({ where: { uuid: id } });
    console.log(`handleSSE: Fetched chat: ${JSON.stringify(serializeBigInt(chat))}`);
    if (!chat) {
      return NextResponse.json({ message: 'Chat not found' }, { status: 404 });
    }

    if (!chat.thread_id || !chat.assistant_id) {
      console.error(`handleSSE: Thread ID or Assistant ID is missing for chat ID: ${id}`);
      return NextResponse.json({ message: 'Thread ID or Assistant ID is missing' }, { status: 400 });
    }

    const encoder = new TextEncoder();
    let controllerClosed = false;
    let accumulatedText = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const runStream = await openai.beta.threads.runs.stream(chat.thread_id || "", {
            assistant_id: chat.assistant_id || "",
          });
          console.log(`handleSSE: Started streaming run for thread ID: ${chat.thread_id?.toString()}, assistant ID: ${chat.assistant_id?.toString()}`);

          runStream.on('textCreated', (text) => {
            console.log(`handleSSE: textCreated event received: ${text.value}`);
            accumulatedText = text.value; // Initialize accumulatedText with textCreated value
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: text.value })}\n\n`));
          });

          runStream.on('textDelta', (delta) => {
            console.log(`handleSSE: textDelta event received: ${delta.value}`);
            if (accumulatedText !== delta.value) {
              accumulatedText += delta.value; // Accumulate text from textDelta events
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: delta.value })}\n\n`));
            }
          });

          runStream.on('end', async () => {
            if (controllerClosed) return;
            controllerClosed = true;
            console.log(`handleSSE: Streaming ended for chat ID: ${id}`);
            const chatHistory = chat.chat_history ? JSON.parse(chat.chat_history) : [];
            chatHistory.push({ type: 'ai', content: accumulatedText });

            await prisma.chats.update({
              where: { uuid: id },
              data: { chat_history: JSON.stringify(chatHistory) }
            });
            console.log(`handleSSE: Chat history updated in database for chat ID: ${id}`);

            controller.close();
          });

          runStream.on('error', (error) => {
            if (controllerClosed) return;
            controllerClosed = true;
            console.error(`handleSSE: Stream error for chat ID: ${id}`, error);
            controller.error(error);
          });
        } catch (error) {
          if (controllerClosed) return;
          controllerClosed = true;
          console.error(`handleSSE: Error in stream start for chat ID: ${id}`, error);
          controller.error(error);
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Internal server error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  console.log(`POST request received for chat ID: ${params.id}`);
  return handlePost(req, params.id);
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  console.log(`GET request received for chat ID: ${params.id}`);
  const url = new URL(req.url, `http://${req.headers.get('host')}`);
  const isStream = url.searchParams.get('stream') === 'true';

  if (isStream) {
    return handleSSE(req, params.id);
  } else {
    const chat = await prisma.chats.findUnique({ where: { uuid: params.id } });
    if (!chat) {
      console.error(`GET request: Chat not found for chat ID: ${params.id}`);
      return NextResponse.json({ message: 'Chat not found' }, { status: 404 });
    }
    return NextResponse.json({
      chat: serializeBigInt({
        uuid: chat.uuid,
        chat_history: chat.chat_history,
        updated: chat.updated_at,
        created: chat.created_at,
      })
    }, { status: 200 });
  }
}

export async function OPTIONS(req: NextRequest) {
  console.log(`OPTIONS request received`);
  return NextResponse.json(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version",
      "Access-Control-Max-Age": "86400",
    },
  });
}
