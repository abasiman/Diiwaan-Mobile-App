// File: app/(utils)/iconFonts.ts

import {
  Ionicons,
  Feather,
  MaterialIcons,
  FontAwesome5,
  Entypo,
  AntDesign,
  MaterialCommunityIcons,
} from '@expo/vector-icons';

export const iconFonts = {
  ...Ionicons.font,
  ...Feather.font,
  ...MaterialIcons.font,
  ...FontAwesome5.font,
  ...Entypo.font,
  ...AntDesign.font,
  ...MaterialCommunityIcons.font,
};
