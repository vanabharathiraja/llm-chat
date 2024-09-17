'use client'

import { useState, useRef, useEffect } from 'react';
import Markdown from 'react-markdown'
import { FiArrowUp } from "react-icons/fi";

interface Message {
  text: string;
  sender: 'human' | 'ai' | 'error'; // Adding 'error' type for error messages
}

const Chat = () => {
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messageEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async () => {
    if (!inputValue.trim()) return;

    const humanMessage: Message = { text: inputValue, sender: 'human' };
    setMessages((prev) => [...prev, humanMessage]);
    setInputValue('');

    setIsLoading(true);

    try {
      let isFirstChunk = true;  // Flag to track the first chunk
      let aiMessage = '';

      for await (const chunk of sendMessage(inputValue)) {
        console.log(chunk);
        aiMessage += chunk + " ";  // Append each chunk to the AI message

        // Handle first iteration separately
        setMessages((prev) => {
          if (isFirstChunk) {
            isFirstChunk = false;
            return [...prev, { text: aiMessage, sender: 'ai' }];
          }
          // For subsequent chunks, replace the last AI message
          return [...prev.slice(0, -1), { text: aiMessage, sender: 'ai' }];
        });
      }
    } catch (error) {
      const errorMessage: Message = { text: "There was an error processing your request.", sender: 'error' };
      console.error(error);
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Function to send message and process the stream response
  async function* sendMessage(data: string) {
    const sendMessageResponse = await fetch("/api/lh/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: data })
    });

    if (!sendMessageResponse.ok) {
      const errorJson = await sendMessageResponse.json();
      const errorMsg = errorJson.message || errorJson.detail || "";
      throw Error(`Failed to send message - ${errorMsg}`);
    }

    if(sendMessageResponse.ok ) {
        // Create a readable stream from the response body
        const readableStream = sendMessageResponse?.body?.pipeThrough(new TextDecoderStream('utf-8')); // Assuming UTF-8 encoding

        // Read the stream chunk by chunk
        const reader = readableStream?.getReader();
        let readResult;

        while (!(readResult = await reader?.read())?.done) {
            const chunk = readResult?.value || "";
            console.log('Received chunk:', chunk);

            const chunkList = chunk.split("\n").map((jsonStr: string)=> {
              console.log(jsonStr);
              try {
                return JSON.parse(jsonStr);
              } catch (error) {console.log(error)}
              return {}
            });
            // Process the chunk here
            for (const chunkJSON of chunkList) {
              if(chunkJSON?.data) {
                yield chunkJSON.data;
              }
            }
        }
      }

    // Yield chunks using the handleStream function
    yield "";
  }

  // Function to handle and process the stream
  async function* handleStream(streamingResponse: Response) {

    const readableStream = streamingResponse.body?.pipeThrough(new TextDecoderStream('utf-8'));
    const reader = readableStream?.getReader();
    let readResult;

    while (!(readResult = await reader?.read())?.done) {
        const chunk = readResult?.value || "";
        // Process the chunk here
        console.log('Received chunk:', chunk);

      let previousPartialChunk: string | null = null;


      const [completedChunks, partialChunk] = processRawChunkString(
        chunk,
        previousPartialChunk
      );
      if (!completedChunks.length && !partialChunk) {
        break;
      }

      previousPartialChunk = partialChunk as string | null;
      yield completedChunks;
    }
  }

  // Helper function to process raw chunks
  function processRawChunkString(
    chunkString: string,
    previousPartialChunk: string | null
  ): [string[], string | null] {
    const fullString = previousPartialChunk ? previousPartialChunk + chunkString : chunkString;
    const chunks = fullString.split("\n");  // Split by newline for each chunk
    const completeChunks: string[] = [];

    // Parse each chunk as JSON
    chunks.forEach((chunk) => {
      try {
        const parsedChunk = JSON.parse(chunk);
        if (parsedChunk.data) {
          completeChunks.push(parsedChunk.data);
        }
      } catch (e) {
        // Ignore incomplete or invalid JSON chunks
      }
    });

    const lastChunk = chunks[chunks.length - 1];

    return [completeChunks, lastChunk];  // Return complete chunks and the last incomplete chunk
  }


  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <div className="flex-grow p-4 overflow-y-auto">
        {messages.map((message, index) => (
          <div key={index} className={`my-2 ${message.sender === 'human' ? 'text-right' : 'text-left'}`}>
            <div className={`inline-block p-2 rounded-lg ${
              message.sender === 'human' ? 'bg-blue-500 text-white' :
              message.sender === 'ai' ? 'bg-gray-200 text-gray-800' : 'bg-red-500 text-white'}`}>
              {message.sender==='ai' ? <Markdown>{message.text}</Markdown>: message.text}
            </div>
          </div>
        ))}
        {isLoading && <p className="text-gray-400">AI is typing...</p>}
        <div ref={messageEndRef} />
      </div>
      <form className="relative p-4 bg-white">
        <textarea
          rows={1}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyPress}
          className="w-full p-3 border border-gray-300 rounded-full resize-none pr-10"
          placeholder="Type your message and press Enter..."
        />
        <button
          type="button"
          onClick={handleSubmit}
          className="absolute bottom-7 right-5 p-2.5 bg-blue-500 text-white rounded-full"
        >
          <FiArrowUp size={20} />
        </button>
      </form>
    </div>
  );
};

export default Chat;
