/**
 * Content Generation Utilities
 * 
 * Helper functions for generating demo content and splitting content into chunks
 */

// Content generator utility for different types
export const generateContent = (type: 'demo' | 'ai' | 'conversation', userContent: string): string => {
  switch (type) {
    case 'demo':
      return `Demo response to "${userContent}": This is a simulated response with multiple chunks. Each chunk represents a portion of the AI response being streamed in real-time. The system demonstrates how content can be delivered progressively to provide better user experience during AI generation. This approach allows users to see partial responses while the full response is still being processed, making the interaction feel more responsive and engaging.`;

    case 'ai':
      return `AI response to "${userContent}": Artificial Intelligence systems work by processing input data through complex neural networks that have been trained on vast amounts of text and information. When you ask a question, the AI analyzes the context, draws from its training knowledge, and generates a response by predicting the most appropriate words and phrases to use. This process involves multiple layers of computation and pattern recognition that happen very quickly, allowing for near real-time responses to complex queries and conversations.`;

    case 'conversation':
      return `Thank you for your message: "${userContent}". I understand your request and I'm here to help you with whatever you need. Whether you have questions about specific topics, need assistance with tasks, or just want to have a conversation, I'm ready to provide helpful and informative responses. Feel free to ask me anything you'd like to know more about, and I'll do my best to provide clear and useful information.`;

    default:
      return `Response to "${userContent}": This is a default response that will be streamed in chunks.`;
  }
};

// Split content into chunks for streaming
export const splitIntoChunks = (content: string, numChunks: number): string[] => {
  if (numChunks <= 1) return [content];

  const words = content.split(' ');
  const chunkSize = Math.ceil(words.length / numChunks);
  const chunks: string[] = [];

  for (let i = 0; i < words.length; i += chunkSize) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    chunks.push(chunk + (i + chunkSize < words.length ? ' ' : ''));
  }

  return chunks;
}; 