export const palette = {
  bg: '#F6F3EF',
  fg: '#514A45',
  card: '#FFFFFF',
  cardDeep: '#F0ECE8',
  annotationsBg: '#EFE8E0',
  notesBg: '#FFFDFC',
  muted: '#8D8580',
  border: 'rgba(81,74,69,0.12)',
  borderMid: 'rgba(81,74,69,0.20)',
  accent: '#7D8A82',
  sidebar: '#87958D',
  sidebarFg: '#746D68',
  sidebarActive: '#E1E7E0',
  heat: ['#EEEAE6', '#DEE7E0', '#CBD9CF', '#D5DFE6', '#DDD5E5'],
  bookCovers: ['#EEE9E4', '#DFE7E0', '#E8DFE0', '#E1E6EB', '#E5DEEA', '#E2E7EB', '#E8E0E2'],
  success: '#3E9068',
  danger: '#B84444',
  white: '#FFFFFF',
} as const

export type Palette = typeof palette
