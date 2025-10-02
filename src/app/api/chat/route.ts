import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';

const prisma = new PrismaClient();
const openai = new OpenAI();

export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const { message } = await req.json();

  console.log({ message })
  try {
    const chat = await prisma.chats.findUnique({ where: { uuid: id } });
    if (!chat) {
      return NextResponse.json({ message: 'Chat not found' }, { status: 404 });
    }

    if (!chat.thread_id) {
      console.error('Thread ID is null for chat ID:', id);
      return NextResponse.json({ message: 'Thread ID is null' }, { status: 400 });
    }

    if (!chat.assistant_id) {
      console.error('Assistant ID is null for chat ID:', id);
      return NextResponse.json({ message: 'Assistant ID is null' }, { status: 400 });
    }

    const subscription = await prisma.subscriptions.findFirst({
      where: { user_id: chat.user_id, status: 1 },
    });

    if (!subscription || subscription.questions <= 0) {
      console.error('No active subscription found or question limit reached');
      return NextResponse.json({ message: 'No active subscription found or question limit reached' }, { status: 400 });
    }

    // Parse the chat history
    const chatHistory = chat.chat_history ? JSON.parse(chat.chat_history) : [];

    // Add the user message to the chat history
    chatHistory.push({ type: 'human', content: message });

    // Create a new message in the thread
    await openai.beta.threads.messages.create(chat.thread_id, {
      role: 'user',
      content: message,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode("data: " + JSON.stringify({ content: " " }) + "\n\n"));

        const run = openai.beta.threads.runs.stream(chat.thread_id || '', {
          assistant_id: chat.assistant_id || ""
        });

        run
          .on('textCreated', (text) => {
            console.log('textCreated:', text);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`));
          })
          .on('textDelta', (textDelta) => {
            console.log('textDelta:', textDelta);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: textDelta.value })}\n\n`));
          })
          .on('toolCallCreated', (toolCall) => {
            console.log('toolCallCreated:', toolCall);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: toolCall.type })}\n\n`));
          })
          .on('toolCallDelta', (toolCallDelta) => {
            console.log('toolCallDelta:', toolCallDelta);
            if (toolCallDelta.type === 'code_interpreter' && toolCallDelta.code_interpreter) {
              if (toolCallDelta.code_interpreter.input) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: toolCallDelta.code_interpreter.input })}\n\n`));
              }
              if (toolCallDelta.code_interpreter.outputs) {
                controller.enqueue(encoder.encode("data: " + JSON.stringify({ content: "\noutput >\n" }) + "\n\n"));
                toolCallDelta.code_interpreter.outputs.forEach(output => {
                  if (output.type === "logs") {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: output.logs })}\n\n`));
                  }
                });
              }
            }
          })
          .on('end', () => {
            console.log('Stream ended');
            controller.close();
          })
          .on('error', (error) => {
            console.error('Stream error:', error);
            controller.error(error);
          });
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      },
    });
  } catch (error) {
    console.error('Internal server error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;

  try {
    console.log('Getting chat by ID:', id);
    const chat = await prisma.chats.findUnique({ where: { uuid: id } });
    console.log('Chat found:', chat);
    if (!chat) {
      return NextResponse.json({ errors: true, message: 'Chat not found' }, { status: 404 });
    }

    // Format the response
    const response = {
      errors: false,
      chat: {
        uuid: chat.uuid,
        title: chat.title,
        chat_history: chat.chat_history,
        updated: chat.updated_at?.toISOString(),
        created: chat.created_at?.toISOString(),
      },
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ errors: true, message: 'Internal server error' }, { status: 500 });
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
