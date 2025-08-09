import { MessageType } from "@/hooks/types";
import { Box } from "@mui/material";
import { useMemo } from "react";
import { MarkdownHighlighter } from "../../../../components/MarkdownHighlighter/MarkdownHighlighter";

interface AgentMessageProps {
  message: MessageType;
}

/**
 * This hook will catch the sql markdown and return the sql code and return array of objects with type and content.
 * Example data: "bla bla ```sql select * from something``` bla bla"
 * Output: [
 *   { type: "regular", content: "bla bla " },
 *   { type: "sql", content: "```sql select * from something```" },
 *   { type: "regular", content: " bla bla" }
 * ]
 *
 * @param {string} data
 * @returns {Array<{ type: string; content: string }>}
 */
const getParsedContent = (data: string) => {
  if (!data) return [];

  const result = [];
  const regex = /```sql[\s\S]*?```/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(data)) !== null) {
    // If there's plain text before the current match, push it as "regular"
    if (match.index > lastIndex) {
      const textBefore = data.slice(lastIndex, match.index);
      if (textBefore) {
        result.push({ type: "regular", content: textBefore });
      }
    }

    // Push the matched SQL block
    result.push({ type: "sql", content: match[0] });

    // Update lastIndex to the end of the current match
    lastIndex = match.index + match[0].length;
  }

  // If there's remaining text after the last match, push it as "regular"
  if (lastIndex < data.length) {
    const textAfter = data.slice(lastIndex);
    if (textAfter) {
      result.push({ type: "regular", content: textAfter });
    }
  }

  return result;
};

export const AgentMessage = ({ message }: AgentMessageProps) => {
  const streamedMarkdown = useMemo(() => {
    return getParsedContent(message.content);
  }, [message.content]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {streamedMarkdown.map((item, index) => {
        return <MarkdownHighlighter content={item.content} key={index} />;
      })}
    </Box>
  );
};

export default AgentMessage;
