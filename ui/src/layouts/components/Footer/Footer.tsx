import React from "react";
import { Link } from "react-router-dom";
import { SiX } from "react-icons/si";
import { Button, Box } from "@mui/material";

const Footer: React.FC = () => {
  return (
    <Box
      component="footer"
      sx={{
        position: "fixed",
        bottom: 0,
        right: 0,
        padding: { xs: 1, md: 2 },
        width: "fit-content",
      }}
    >
      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        {/* <Button
          variant="text"
          sx={{ 
            minWidth: 'auto',
            color: 'text.disabled'
          }}
          component={Link}
          to="https://discord.gg/"
          target="_blank"
        >
          <SiDiscord size={18} />
        </Button> */}
        <Button
          variant="text"
          sx={{
            minWidth: "auto",
            color: "text.disabled",
          }}
          component={Link}
          // TODO: change to tea4chat twitter account when we have one
          to="https://x.com/kerematam"
          target="_blank"
        >
          <SiX size={18} />
        </Button>
        {/* <Button
          variant="text"
          sx={{ 
            minWidth: 'auto',
            color: 'text.disabled'
          }}
          component={Link}
          to=""
          target="_blank"
        >
          <SiGithub size={18} />
        </Button> */}
      </Box>
    </Box>
  );
};

export default Footer;
