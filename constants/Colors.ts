// constants/colors.ts

// your brand primarys pulled from the logo
const brandPrimary      = '#004AAD';
const brandPrimaryLight = '#A1CEDC';
const brandPrimaryDark  = '#003A7A';

export const Colors = {
  light: {
    // text & backgrounds
    text:        '#1F2937',       // dark gray
    background:  '#F5F7FA',       // off-white

    // tint & icons (used by your Themed components, tab bars, etc)
    tint:            brandPrimary,
    icon:            '#6B7280',   // slate-500
    tabIconDefault:  '#6B7280',
    tabIconSelected: brandPrimary,

    // brand tokens
    primary:       brandPrimary,
    primaryLight:  brandPrimaryLight,
    secondary:     '#FFA500',      // orange accent
    success:       '#28A745',      // green
    warning:       '#FFC107',      // amber
    danger:        '#DC3545',      // red

    // neutrals
    gray100:       '#F3F4F6',
    gray500:       '#6B7280',
  },
  dark: {
    // text & backgrounds
    text:        '#E5E5E5',       // near-white
    background:  '#121212',       // almost black

    // tint & icons
    tint:            brandPrimaryLight, 
    icon:            '#9BA1A6',   // slate-400
    tabIconDefault:  '#9BA1A6',
    tabIconSelected: brandPrimaryLight,

    // brand tokens
    primary:       brandPrimary,
    primaryDark:   brandPrimaryDark,
    secondary:     '#FFA500',
    success:       '#28A745',
    warning:       '#FFC107',
    danger:        '#DC3545',

    // neutrals
    gray900:       '#111827',
  },
};
