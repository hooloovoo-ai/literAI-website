import { Box, Card, CardContent, Chip, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Stack, Typography } from "@mui/material";
import { Container } from "@mui/system";
import React, { useEffect, useState } from "react";
import { Link as RouterLink, LinkProps as RouterLinkProps } from 'react-router-dom';
import { TitleIndex } from "./types";
import { fetchJSON } from "./util";

interface ListTitleLinkProps {
  icon?: React.ReactElement;
  title: string;
  author: string;
  slug: string;
}

const TitleLink = React.forwardRef<HTMLAnchorElement, RouterLinkProps>(function Link(
  itemProps,
  ref,
) {
  return <RouterLink ref={ref} {...itemProps} role={undefined} />;
});

function ListTitleLink(props: ListTitleLinkProps) {
  const { icon, title, author, slug } = props;

  return (
    <ListItemButton component={TitleLink} to={`/${slug}`}>
      {icon ? <ListItemIcon>{icon}</ListItemIcon> : null}
      <ListItemText primary={title} secondary={author} />
    </ListItemButton>
  );
}

export default function App() {
  const [index, setIndex] = useState<TitleIndex[]>();
  useEffect(() => {
    fetchJSON(`${process.env.REACT_APP_STORAGE_BASE}/index.json`)
      .catch(err => console.error(err))
      .then(data => setIndex(data));
  }, []);

  return (
    <Container maxWidth="sm">
      <Box sx={{ my: 4 }}>
        <Stack spacing={2}>
          <Card>
            <CardContent>
              <Typography variant="h3" sx={{ mb: 1.5 }}>
                literAI
              </Typography>
              <Typography variant="body2" sx={{ mb: 1.5 }}>
                literAI is a series of visual podcasts where two computer generated personalities, Alice and Bob, discuss popular novels and stories
              </Typography>
              <Typography variant="body2" sx={{ mb: 1.5 }}>
                All content was generated using open source AI models on consumer-grade hardware (which means you can make your own, too!)
              </Typography>
              <Stack direction="row" spacing={1}>
                <Chip label="GitHub" component="a" href="https://github.com/jquesnelle/literAI" target="_blank" variant="outlined" clickable />
                <Chip label="GitHub (front-end)" component="a" href="https://github.com/hooloovoo-ai/literAI-website" target="_blank" variant="outlined" clickable />
                <Chip label="Twitter" component="a" href="https://twitter.com/theemozilla" target="_blank" variant="outlined" clickable />
                <Chip label="Blog" component="a" href="https://jeffq.com/blog" target="_blank" variant="outlined" clickable />
              </Stack>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <List>
                {
                  index ?
                    index.map((title, key) => (
                      <ListItem key={key} disablePadding>
                        <ListTitleLink title={title.title} author={title.author} slug={title.slug} />
                      </ListItem>
                    )) : <Box />
                }
              </List>
            </CardContent>
          </Card>
        </Stack>
      </Box>
    </Container>
  )
}
