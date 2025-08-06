import { Box, Container, Typography } from "@mui/material";
import resumableStreamDiagram from "../../assets/tea3chat_resumable_stream.drawio.svg";

const ResumableStream = () => {
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Resumable Stream Architecture
      </Typography>
      
      <Typography variant="body1" paragraph>
        This diagram illustrates the architecture and flow of the resumable streaming system in Tea4Chat.
      </Typography>

      <Box
        sx={{
          backgroundColor: "transparent",
          display: "flex",
          justifyContent: "center",
          my: 4,
          "& img": {
            maxWidth: "100%",
            height: "auto",
          },
        }}
      >
        <img
          style={{
            backgroundColor: "transparent",
          }}
          src={resumableStreamDiagram}
          alt="Tea4Chat Resumable Stream Architecture Diagram"
        />
      </Box>
    </Container>
  );
};

export default ResumableStream;