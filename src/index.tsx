import React from 'react';
import ReactDOM from 'react-dom/client';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import Root from './Root';
import theme from './theme';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Title, { loader as titleLoader } from './Player';

const router = createBrowserRouter([
  {
    path: "/",
    element: <Root />
  },
  {
    path: "/:title",
    element: <Title />,
    loader: titleLoader
  }
]);

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <RouterProvider router={router} />
    </ThemeProvider>
  </React.StrictMode>
);
