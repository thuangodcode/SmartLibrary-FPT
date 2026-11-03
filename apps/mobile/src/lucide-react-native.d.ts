declare module 'lucide-react-native' {
  import type { ComponentType } from 'react';
  import type { SvgProps } from 'react-native-svg';

  export interface IconProps extends SvgProps {
    size?: number;
    color?: string;
    strokeWidth?: number;
  }

  export const BookOpen: ComponentType<IconProps>;
  export const Search: ComponentType<IconProps>;
  export const Bell: ComponentType<IconProps>;
  export const Home: ComponentType<IconProps>;
  export const ClipboardList: ComponentType<IconProps>;
  export const CircleUserRound: ComponentType<IconProps>;
  export const ArrowUpRight: ComponentType<IconProps>;
  export const Clock3: ComponentType<IconProps>;
  export const BookMarked: ComponentType<IconProps>;
  export const CircleAlert: ComponentType<IconProps>;
  export const X: ComponentType<IconProps>;
  export const LogOut: ComponentType<IconProps>;
}
