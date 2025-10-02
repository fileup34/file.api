import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import os from 'os';

const prisma = new PrismaClient();
const openai = new OpenAI();


export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const userId = formData.get('userId') as string;

    if (!userId || !file) {
      console.error('Invalid input: Missing userId or file');
      return NextResponse.json({ message: 'Invalid input' }, { status: 400 });
    }

    const fileExtension = file?.name?.split('.')?.pop()?.toLowerCase();
    const isCodeInterpreterFile = fileExtension === 'csv' || fileExtension === 'xlsx';

    console.log('Converting file to buffer');
    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = file.name.replaceAll(" ", "_");

    console.log('Getting OS temporary directory');
    const tempDir = os.tmpdir();

    console.log('Saving file to temporary location');
    const tempFilePath = path.join(tempDir, filename);
    await fs.promises.writeFile(tempFilePath, buffer);

    console.log('Uploading file to OpenAI');
    const uploadedFile = await openai.files.create({
      file: fs.createReadStream(tempFilePath),
      purpose: 'assistants',
    });
    console.log('File uploaded:', uploadedFile);

    console.log('Creating assistant and thread based on file type');
    let assistant, thread;

    if (isCodeInterpreterFile) {
      assistant = await openai.beta.assistants.create({
        name: `Assistant for ${filename}`,
        description: `Assistant created for ${filename}`,
        model: 'gpt-4o', // Specify the model parameter
        tools: [{ type: 'code_interpreter' }],
        tool_resources: {
          code_interpreter: {
            file_ids: [uploadedFile.id],
          },
        },
      });
      console.log('Assistant created:', assistant);

      thread = await openai.beta.threads.create({
        messages: [
          {
            role: 'assistant',
            content: 'Welcome to File.energy ⚡! How can I assist you with your data today?',
          },
        ],
        tool_resources: {
          code_interpreter: {
            file_ids: [uploadedFile.id],
          },
        },
      });
    } else {
      const vectorStore = await openai.beta.vectorStores.create({
        name: `Vector Store for ${filename}`,
        file_ids: [uploadedFile.id],
      });
      console.log('Vector store created:', vectorStore);

      assistant = await openai.beta.assistants.create({
        name: `Assistant for ${filename}`,
        description: `Assistant created for ${filename}`,
        model: 'gpt-4o', // Specify the model parameter
        tools: [{ type: 'file_search' }],
        tool_resources: {
          file_search: {
            vector_store_ids: [vectorStore.id],
          },
        },
      });
      console.log('Assistant created:', assistant);

      thread = await openai.beta.threads.create({
        messages: [],
        tool_resources: {
          file_search: {
            vector_store_ids: [vectorStore.id],
          },
        },
      });
    }
    console.log('Thread created:', thread);

    console.log('Generating UUID for the chat');
    const chatUUID = uuidv4();

    console.log('Creating chat record in database');
    const chat = await prisma.chats.create({
      data: {
        uuid: chatUUID, // Use the generated UUID
        user_id: BigInt(userId),
        title: filename,
        chat_history: JSON.stringify([
          {
            type: 'ai',
            content: `Welcome to File.energy ⚡! How can I assist you with your ${filename} file today?`,
          },
        ]),
        thread_id: thread.id,
        assistant_id: assistant.id,
      },
    });
    console.log('Chat record created:', chat);

    console.log('Cleaning up the temporary file');
    await fs.promises.unlink(tempFilePath);

    console.log('Converting BigInt to string for JSON serialization');
    const chatResponse = {
      ...chat,
      user_id: chat.user_id.toString(),
      id: chat.id.toString(),
    };

    console.log('Returning response');
    return NextResponse.json({ chat: chatResponse }, { status: 201 });
  } catch (error) {
    console.error('Error occurred:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
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