import { useColorScheme } from 'react-native';

const light = {
  bg: '#F6F4EF',
  surface: '#FFFFFF',
  text: '#1C1B19',
  muted: '#6B6760',
  border: '#E3DFD6',
  primary: '#0E6B5C',
  primaryText: '#FFFFFF',
  accent: '#D9822B',
  danger: '#B3261E',
  must: '#0E6B5C',
  optional: '#8A857B',
  warningBg: '#FFF4E0',
};

const dark: typeof light = {
  bg: '#141412',
  surface: '#1F1E1B',
  text: '#F2EFE8',
  muted: '#A39E94',
  border: '#34322D',
  primary: '#3FB8A2',
  primaryText: '#0B1F1B',
  accent: '#F0A55A',
  danger: '#F2B8B5',
  must: '#3FB8A2',
  optional: '#8A857B',
  warningBg: '#3A2E1A',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 8, md: 12, lg: 16 };
