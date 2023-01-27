import { createTheme, ThemeOptions } from '@mui/material/styles';

export const themeOptions: ThemeOptions = {
  palette: {
    mode: 'dark',
    primary: {
      main: '#002e6f',
    },
    secondary: {
      main: '#04ffff',
    },
  },
};

const theme = createTheme(themeOptions);

theme.spacing(2);

export default theme;